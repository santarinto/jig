#!/bin/sh
# Событие деплой-наблюдаемости → Vector :9880 → ClickHouse logs.entries.
# Контракт: docs/superpowers/specs/2026-07-20-deploy-observability-design.md
#   ci-notify.sh <step> start
#   ci-notify.sh <step> finish <success|fail> [duration_s]
# Env: OBS_TOKEN (пуст → тихий no-op), OBS_ENDPOINT (адрес коллектора — в
# приватной сети владельца, тут не хранится, задаётся снаружи), OBS_PROJECT.
# duration_s можно не передавать: start пишет /tmp/obs_t0_<step>, finish посчитает сам.
# <step> — только [a-z0-9-]: значения вклеиваются в JSON без эскейпинга, кавычка/пробел = битое событие (Vector дропнет молча).
# ЛЮБОЙ исход — exit 0: наблюдаемость не имеет права ронять пайплайн.
# POSIX sh: джобы alpine живут на busybox ash, bash там нет.

STEP="${1:-unknown}"
PHASE="${2:-start}"
STATUS="${3:-}"
DURATION="${4:-}"

[ -n "${OBS_TOKEN:-}" ] || exit 0

ENDPOINT="${OBS_ENDPOINT:-}"
PROJECT="${OBS_PROJECT:-unknown}"

[ -n "$ENDPOINT" ] || exit 0
T0F="/tmp/obs_t0_${STEP}"

if [ "$PHASE" = "start" ]; then
  date +%s > "$T0F" 2>/dev/null || true
elif [ -z "$DURATION" ] && [ -f "$T0F" ]; then
  # t0 может быть пуст/битый (обрыв записи): не-число в $(( )) фатально
  # роняет busybox ash ДО exit 0 — просто шлём событие без duration.
  T0="$(cat "$T0F" 2>/dev/null || true)"
  case "$T0" in
    ''|*[!0-9]*) ;;
    *) DURATION=$(( $(date +%s) - T0 )) ;;
  esac
fi

# В ci-image-check (голый alpine) git нет — sha просто опускаем.
SHA="$(git rev-parse HEAD 2>/dev/null || true)"
LEVEL=info; [ "$STATUS" = "fail" ] && LEVEL=error
MSG="deploy: ${STEP} ${PHASE}${STATUS:+ ${STATUS}}${DURATION:+ ${DURATION}s}"

FIELDS="\"step\":\"${STEP}\",\"phase\":\"${PHASE}\""
[ -n "$STATUS" ]   && FIELDS="${FIELDS},\"status\":\"${STATUS}\""
[ -n "$DURATION" ] && FIELDS="${FIELDS},\"duration_s\":\"${DURATION}\""
[ -n "$SHA" ]      && FIELDS="${FIELDS},\"sha\":\"${SHA}\""
[ -n "${CI_PIPELINE_ID:-}" ] && FIELDS="${FIELDS},\"pipeline\":\"${CI_PIPELINE_ID}\""

BODY="{\"project\":\"${PROJECT}\",\"source\":\"deploy\",\"level\":\"${LEVEL}\",\"message\":\"${MSG}\",\"fields\":{${FIELDS}}}"

if command -v curl >/dev/null 2>&1; then
  curl -s --max-time 5 -H "Content-Type: application/json" -H "x-token: ${OBS_TOKEN}" \
    -d "$BODY" "$ENDPOINT" >/dev/null 2>&1 || true
elif command -v wget >/dev/null 2>&1; then
  # busybox wget (alpine): поддерживает --header/--post-data, но не --max-time.
  wget -q -T 5 -t 1 --header="Content-Type: application/json" --header="x-token: ${OBS_TOKEN}" \
    --post-data="$BODY" -O /dev/null "$ENDPOINT" 2>/dev/null || true
fi
exit 0
