#!/bin/sh
# Числа из `npm run stat` → метрики. Контракты: logging/stat.MD, logging/metrics.MD.
#   ci-stat-metrics.sh <путь-к-stat.json>
# Env: OBS_TOKEN (пуст → тихий no-op), OBS_ENDPOINT (адрес коллектора — в
# приватной сети владельца, тут не хранится, задаётся снаружи), OBS_PROJECT.
#
# Отправляет node'ом через глобальный fetch, а НЕ curl/wget: в node:*-slim нет
# ни того, ни другого, и первая версия этого скрипта молча не отправила ничего,
# отрапортовав об успехе. node в этой джобе есть по определению — им же считается
# сам stat.
#
# Успех — это HTTP 200, а не факт вызова. Правило «отправитель не роняет
# пайплайн» не даёт ему права врать: зелёная джоба с надписью «отправлено» при
# нулевой доставке хуже красной, потому что её никто не пойдёт проверять.
#
# ЛЮБОЙ исход — exit 0.
set -u

FILE="${1:-}"
[ -n "${OBS_TOKEN:-}" ] || exit 0
[ -f "$FILE" ] || { echo "метрики: нет файла $FILE — отправлять нечего"; exit 0; }

if ! command -v node >/dev/null 2>&1; then
  echo "метрики НЕ отправлены: в образе нет node — отправить нечем"
  exit 0
fi

[ -n "${OBS_ENDPOINT:-}" ] || exit 0

OBS_ENDPOINT="${OBS_ENDPOINT}" \
OBS_PROJECT="${OBS_PROJECT:-unknown}" \
OBS_SHA="$(git rev-parse HEAD 2>/dev/null || true)" \
node -e '
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
// Соответствие ключ → имя метрики задано контрактом stat.MD §3.
const NAMES = {
  commits: "repo_commits_total", tags: "repo_tags_total", files: "repo_files",
  lines: "repo_lines", textBytes: "repo_text_bytes", totalBytes: "repo_total_bytes",
};
// version — не метрика (это строка), она метка. sha — привязка к коммиту.
const labels = {
  ...(d.version ? { version: d.version } : {}),
  ...(process.env.OBS_SHA ? { sha: process.env.OBS_SHA } : {}),
};
const samples = Object.entries(NAMES)
  .filter(([key]) => typeof d[key] === "number")
  .map(([key, metric]) => ({ kind: "metric", project: process.env.OBS_PROJECT, metric, value: d[key], labels }));

if (!samples.length) { console.log("метрики: считать нечего"); process.exit(0); }

const t = AbortSignal.timeout(5000);
fetch(process.env.OBS_ENDPOINT, {
  method: "POST",
  headers: { "content-type": "application/json", "x-token": process.env.OBS_TOKEN },
  body: JSON.stringify(samples),
  signal: t,
})
  .then((r) => {
    // 200 и только 200. Приёмник дропает молча при неверном токене — но он
    // отвечает 200 и тогда, поэтому это верхняя граница уверенности, не гарантия.
    const ok = r.status === 200;
    console.log(`метрики: ${samples.length} шт. → HTTP ${r.status}${ok ? "" : " — НЕ ДОСТАВЛЕНЫ"}`);
    console.log(`  ${samples.map((s) => s.metric).join(", ")}`);
    process.exit(0);
  })
  .catch((e) => {
    console.log(`метрики НЕ отправлены (${samples.length} шт.): ${e.message}`);
    process.exit(0);
  });
' "$FILE"
exit 0
