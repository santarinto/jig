#!/usr/bin/env bash
# Потребление БЕЗ сборщика: компоненты рендерятся в статический HTML в голом
# Node, клиентского JS нет ни строки.
#
# Зачем отдельная цель. Три существующие smoke-цели ставят пакет в приложение
# на Vite — то есть проверяют ровно тот путь, где бандлер ЕСТЬ. Сценарий
# `fin-ilya` (отчёт собирается строками на сервере, отдаётся одним GET) не
# проверял никто: он держался на том, что мы не сломаем то, о чём не знаем.
#
# Что здесь ломается без хука. В `dist` каждый компонент делает
# `import './X.css'` — конвенция бандлера, у Node на неё нет загрузчика:
# ERR_UNKNOWN_FILE_EXTENSION. Это след сборки, а не механика: JS про стили
# ничего не знает, они целиком в классах `ds-*`. Поэтому пустой модуль на
# `.css` — не обход, а точное описание того, чем он и является.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$(mktemp -d)"
trap 'rm -rf "$APP"' EXIT

VERSION="$(node -p "require('$ROOT/package.json').version")"
echo "== SSR-потребление без бандлера: @santarinto/jig@$VERSION =="

# tail -1: stdout `npm pack` — имя тарбола, и любая лишняя строка от
# скриптов сборки склеилась бы с ним в путь, которого нет.
TARBALL="$(cd "$ROOT" && npm pack --silent --pack-destination "$APP" | tail -1)"

cd "$APP"
cat > package.json <<'JSON'
{ "name": "ds-consumer-ssr", "private": true, "type": "module", "version": "0.0.0" }
JSON

npm install --silent "$APP/$TARBALL" react react-dom >/dev/null 2>&1

# Хук ровно тот, что записан в consumption.md. Меняешь его там — меняй и здесь,
# иначе гейт перестаёт проверять то, что написано в документе.
cat > css-hook.js <<'JS'
import { registerHooks } from 'node:module'
registerHooks({
  load(url, ctx, next) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export default undefined;', shortCircuit: true }
    return next(url, ctx)
  },
})
JS

cat > render.js <<'JS'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Badge, Button, Card, DataTable, ProgressBar, CommandBar, Stat, DsText } from '@santarinto/jig'

const rows = [{ id: 'a', bank: 'ОЗОН Банк', sum: 82040 }]
// Словарь на контексте, а не на эффекте: в голом Node эффектов нет вовсе, и
// переопределение обязано доехать до строки (DS-139). Проверяется имя
// служебной колонки выбора — её разметку потребитель не пишет, то есть без
// словаря сказать по-английски нечем.
const html = renderToStaticMarkup(
  h(DsText, { value: { 'dataTable.selectColumn': 'Selection' } },
  h('div', null,
    h(Card, { title: 'Кредиты' },
      h(Badge, { tone: 'warning' }, 'просрочка'),
      h(Button, { variant: 'primary', size: 'sm' }, 'Обновить'),
      h(ProgressBar, { value: 75, label: '75%' }),
      h(Stat, { label: 'Ближайший платёж', value: '82 040', unit: '₽' }),
      h(DataTable, {
        rows,
        getRowId: (r) => r.id,
        // Выбор включён ради колонки-флажка: её `<th>` называется только из
        // словаря, и без выбора проверять было бы нечего.
        selectedIds: [],
        onSelectionChange: () => {},
        columns: [{ key: 'bank', header: 'Банк' }, { key: 'sum', header: 'Сумма', align: 'end' }],
      }),
    ),
    // Действия ДАННЫМИ (DS-239): `href` обязан доехать до строки
    // настоящей ссылкой — у потребителя без гидрации навигация только на ней
    // и держится.
    h(CommandBar, { actions: [{ id: 'refresh', label: 'Обновить', href: '/' }] }),
  ),
  ),
)

// Утверждаем не «не упало», а что разметка системы доехала: классы `ds-*`
// с модификаторами. Пустая строка и голый <div> тоже «не падают».
const need = ['ds-badge ds-badge--warning', 'ds-btn ds-btn--primary', 'ds-card', 'ds-table', 'ds-cmdbar', 'ds-stat']
// Ссылка — ТЕГОМ, а не подстрокой: `Button as="a"` ставит `class` раньше
// `href`, и подстрока `<a href="/"` не встречалась ни разу с тех пор, как её
// вписали (DS-239), — утверждение было красным с рождения, а не
// сломалось. Порядок атрибутов не предмет; предмет — живая ссылка: `<a>` с
// этим `href` и без `inert` (свёрнутое в «Ещё» действие несёт `inert`).
const link = /<a\b(?=[^>]*\shref="\/")(?![^>]*\sinert\b)[^>]*>/
const missing = [...need.filter((c) => !html.includes(c)), ...(link.test(html) ? [] : ['<a href="/"> без inert'])]
if (missing.length) {
  console.error('FAIL: в разметке нет классов:', missing.join(', '))
  console.error(html.slice(0, 800))
  process.exit(1)
}
// Словарь доехал: без провайдера здесь стояло бы «Выбор».
if (!html.includes('Selection')) {
  console.error('FAIL: переопределение словаря не доехало до строки — DsText не работает в SSR')
  process.exit(1)
}
if (html.includes('>Выбор<')) { console.error('FAIL: словарь проигнорирован, осталось русское умолчание'); process.exit(1) }
// Клиентского JS быть не должно: renderToStaticMarkup не ставит data-reactroot
// и не оставляет разметки для гидрации.
if (html.includes('data-reactroot')) { console.error('FAIL: разметка помечена под гидрацию'); process.exit(1) }
console.log(`ok: ${html.length} символов статического HTML, все ${need.length} классов на месте`)
JS

echo "== рендер в голом Node (без бандлера, без гидрации) =="
node --import ./css-hook.js render.js

echo "== плоский CSS и theme-auto доехали в пакет =="
node -e '
const { existsSync, readFileSync } = require("node:fs")
const p = "node_modules/@santarinto/jig/dist/"
for (const f of ["styles.bundle.css", "theme-auto.css"]) {
  if (!existsSync(p + f)) { console.error("FAIL: нет " + f + " в установленном пакете"); process.exit(1) }
}
const b = readFileSync(p + "styles.bundle.css", "utf8")
if (/^@import/m.test(b)) { console.error("FAIL: в бандле остались @import"); process.exit(1) }
if (!b.includes(".ds-btn")) { console.error("FAIL: бандл без правил кнопки — собрался не из того"); process.exit(1) }
const t = readFileSync(p + "theme-auto.css", "utf8")
if (!t.includes(":root:not([data-theme])")) { console.error("FAIL: theme-auto без скоупа :not([data-theme])"); process.exit(1) }
console.log("ok: styles.bundle.css " + (b.length/1024).toFixed(1) + " КБ без @import; theme-auto.css со скоупом")
'

echo "SMOKE SSR OK — @santarinto/jig@$VERSION рендерится в строку без сборщика"
