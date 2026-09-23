#!/usr/bin/env node
/**
 * Разметка превью — СНЯТАЯ С КОМПОНЕНТА, а не написанная по памяти.
 *
 * `previews/*.html` — плоские страницы, по которым выносят суждения пять
 * проверок (`measure` «Цель клика», `preview-coverage`, `example-widths`,
 * `token-exists`, `no-nested-interactive`). Пока эти страницы писали руками,
 * они молча расходились с компонентом: пропал слой `.ds-eventcal__canvas`,
 * разошёлся `FormTabs`, а полосе `allDay` в превью стояло `height:24px` прямым
 * числом — то есть страница показывала пол цели, которого у компонента не было
 * (DS-156 нашла там 21px на рабочей шкале 0.875). Класс без правила
 * рисует голый `<div>`, замер честно меряет его геометрию, и ответ выходит
 * правдоподобным и не о компоненте — ровно ловушка «верное не о том» из
 * `docs/writing-checks.md`.
 *
 * Поэтому разметка СНИМАЕТСЯ: фикстура компонента рендерится
 * `renderToStaticMarkup` в голом Node, и её вывод кладётся в превью как есть.
 * Источник данных — сама фикстура: те же `DENSE`, `CROWDED_BAND`, что видит
 * человек в верстаке, а не их пересказ.
 *
 *   node scripts/render-preview.mjs EventCalendar dense          # один случай в stdout
 *   node scripts/render-preview.mjs EventCalendar dense --prop view='"month"'
 *   node scripts/render-preview.mjs --page eventcalendar         # переписать страницу целиком
 *   node scripts/render-preview.mjs --page eventcalendar --check # сверить страницу с диском
 *
 * ГЕНЕРАЦИЯ ПОИМЁННАЯ, А НЕ СПЛОШНАЯ. Из 51 превью здесь описано одно: три
 * страницы вообще не про один компонент, а `measure` держится в бюджете
 * `check` тем, что грузит плоский HTML (решение DS-224, оно в силе).
 * Страница попадает в `PAGES` тогда, когда её разметку начинают мерить
 * числом, — и с этой минуты за неё отвечает `--check`, а не аккуратность.
 *
 * `--prop k=v` кладётся ПОВЕРХ пропсов случая (значение разбирается как JSON,
 * иначе остаётся строкой): так снимается состояние, которое в верстаке
 * получают крутилкой, а отдельным случаем фикстура его не держит — «месяц с
 * переполненной клеткой» это случай `dense` с крутилкой `view` в `month`.
 *
 * `strip` вырезает поддерево из готовой разметки и ОБЪЯВЛЯЕТСЯ ПОБЛОЧНО, а не
 * применяется «если совпадёт»: селектор, ни на что не совпавший, — это ошибка,
 * и она обязана быть слышной. Вырезается ровно один слой,
 * `.ds-eventcal__slots`: 336 узлов роуминга под клавиатуру, у которых в
 * плоском HTML нет ни обработчика, ни роуминга, зато остаётся `tabindex`, —
 * то есть замер целей считал бы целью то, чем на странице нельзя
 * воспользоваться.
 *
 * Чего снимок НЕ несёт: эффектов монтирования. У `EventCalendar` их два, и
 * разметку не меняет ни один — прокрутка сетки к рабочим часам и возврат
 * фокуса. Если компонент начнёт менять разметку по замеру (`ResizeObserver`),
 * снимок станет монтажным состоянием, и это надо будет писать в превью словами.
 */
import * as esbuild from 'esbuild'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Страницы, которые собираются целиком. `id` блока — АДРЕС ДЛЯ ЗАМЕРА:
 * `scripts/measure-invariants.mjs` читает разметку отсюда по этим именам
 * (`previewBlock`), поэтому превью и замер разойтись не могут.
 */
const PAGES = {
  eventcalendar: {
    component: 'EventCalendar',
    note: `РАЗМЕТКА СНЯТА С КОМПОНЕНТА, А НЕ НАПИСАНА ПО ПАМЯТИ (DS-156).
     Каждый блок ниже — вывод \`renderToStaticMarkup\` по случаю фикстуры
     \`src/components/EventCalendar/EventCalendar.fixture.tsx\`. Файл
     СОБИРАЕТСЯ, а не правится руками:

       node scripts/render-preview.mjs --page eventcalendar

     Гейт \`src/__guards__/preview-render.test.ts\` требует, чтобы на диске
     лежало ровно это. Правка руками краснеет — и правильно: превью, тихо
     разошедшееся с компонентом, хуже отсутствующего.

     Вырезан ровно один слой, \`.ds-eventcal__slots\`: 336 узлов роуминга под
     клавиатуру. В плоском HTML у них нет ни обработчика, ни роуминга, зато
     остаётся \`tabindex\`, то есть замер целей считал бы целью то, чем на
     странице нельзя воспользоваться. Больше не вырезано ничего.

     Чего снимок не несёт: эффектов монтирования. У компонента их два, и
     разметку не меняет ни один — прокрутка сетки к рабочим часам и возврат
     фокуса.`,
    blocks: [
      { id: 'ec-week', title: 'Неделя', case: 'week', strip: '.ds-eventcal__slots' },
      // Месяц с ПЕРЕПОЛНЕННОЙ клеткой. Случая с такими данными у фикстуры нет:
      // `month` идёт на обычной неделе, где порог чипов не достаётся. Это
      // ровно то состояние, которое в верстаке получают крутилкой `view` на
      // случае `dense`, — и оно же единственное, где виден `+N ещё`.
      // Слоёв слотов в месяце нет вовсе, поэтому и `strip` тут не объявлен.
      { id: 'ec-month', title: 'Месяц: клетка сверх порога чипов', case: 'dense', props: { view: 'month' } },
      { id: 'ec-band', title: 'Пояс сверх потолка', case: 'band', strip: '.ds-eventcal__slots' },
      { id: 'ec-dense', title: 'Плотный кластер: колонки рядом', case: 'dense', strip: '.ds-eventcal__slots' },
    ],
  },
}

/**
 * Импорты в исходниках стоят с расширением `.js` (так требует
 * `moduleResolution` пакета), а на диске лежит `.ts`/`.tsx`. Резолвер esbuild
 * об этом не знает, поэтому переписываем сами — иначе бандл падает на первом
 * же `./EventCalendar.js`.
 */
const tsExtensions = {
  name: 'ts-ext',
  setup(build) {
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (!args.path.endsWith('.js')) return null
      const base = resolve(args.resolveDir, args.path.slice(0, -3))
      for (const ext of ['.tsx', '.ts']) if (existsSync(base + ext)) return { path: base + ext }
      return null
    })
  },
}

/** CSS в Node не грузится и разметке не нужна: снимаем структуру, не пиксели. */
const cssStub = {
  name: 'css-stub',
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'css-stub' }))
    build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({ contents: '', loader: 'js' }))
  },
}

/**
 * Один бандл на весь вызов, сколько бы блоков ни просили: сборка react
 * занимает почти всё время, и четыре отдельных прогона стоили бы 1.6s вместо
 * 0.5s — гейт с такой ценой начинают выключать.
 */
async function renderAll(component, jobs) {
  const fixture = join(ROOT, 'src/components', component, `${component}.fixture.tsx`)
  if (!existsSync(fixture)) throw new Error(`нет фикстуры ${fixture}`)

  const entry = `
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from ${JSON.stringify(fixture)}

const jobs = ${JSON.stringify(jobs)}
const out = jobs.map((job) => {
  const found = (fixture.cases ?? []).find((c) => c.id === job.case)
  if (!found) {
    throw new Error('у фикстуры нет случая ' + job.case + '; есть: '
      + (fixture.cases ?? []).map((c) => c.id).join(', '))
  }
  return renderToStaticMarkup(fixture.render({ ...fixture.props, ...found.props, ...job.props }))
})
globalThis.__RENDERED__ = out
`
  const built = await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, sourcefile: 'render-preview-entry.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22',
    jsx: 'automatic', plugins: [tsExtensions, cssStub], logLevel: 'silent',
    // `react-dom/server` — CJS и внутри зовёт `require('util')`. В ESM-бандле
    // шим esbuild такой вызов роняет; свой `require` из `node:module` его лечит.
    banner: { js: "import { createRequire } from 'node:module'\nconst require = createRequire(import.meta.url)" },
  })

  const dir = mkdtempSync(join(tmpdir(), 'ds-render-'))
  const file = join(dir, 'entry.mjs')
  writeFileSync(file, built.outputFiles[0].text)
  try {
    await import(pathToFileURL(file).href)
  } finally {
    // Убрать за собой ОБЯЗАТЕЛЬНО: гейт зовёт скрипт подпроцессом из-под
    // vitest, а тот держит песочницу /tmp и валит весь прогон за один
    // оставленный каталог (`vitest.globalSetup.ts`). Модуль уже загружен, и
    // удаление файла ему не мешает.
    rmSync(dir, { recursive: true, force: true })
  }
  const html = globalThis.__RENDERED__

  const { JSDOM } = await import('jsdom')
  return html.map((markup, i) => {
    const strip = jobs[i].strip
    if (!strip) return markup
    const dom = new JSDOM(`<body>${markup}</body>`)
    const gone = dom.window.document.querySelectorAll(strip)
    // Ноль совпадений — это сломанный селектор, а не чистая разметка: молча
    // отдав неурезанный снимок, скрипт соврал бы ровно там, где его позвали.
    if (gone.length === 0) throw new Error(`strip ${strip} не совпал ни с чем в блоке ${jobs[i].case}`)
    for (const el of gone) el.remove()
    return dom.window.document.body.innerHTML
  })
}

/** Готовый текст страницы — та самая строка, которая обязана лежать на диске. */
export async function buildPage(name) {
  const page = PAGES[name]
  if (!page) throw new Error(`нет страницы ${name}; есть: ${Object.keys(PAGES).join(', ')}`)
  const parts = await renderAll(page.component, page.blocks)
  const head = `<!doctype html><html lang="ru" data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="../src/styles.css"></head>
<body><div style="padding:16px">
<!-- ${page.note} -->
`
  const body = page.blocks
    .map((b, i) => `<h2>${b.title}</h2>\n<section id="${b.id}">${parts[i]}</section>`)
    .join('\n\n')
  return `${head}\n${body}\n</div></body></html>\n`
}

const argv = process.argv.slice(2)
const positional = []
const overrides = {}
let strip = null
let pageName = null
let check = false
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--prop') {
    const [k, ...rest] = argv[++i].split('=')
    const raw = rest.join('=')
    let value = raw
    try { value = JSON.parse(raw) } catch { /* строка как строка */ }
    overrides[k] = value
  } else if (argv[i] === '--strip') strip = argv[++i]
  else if (argv[i] === '--page') pageName = argv[++i]
  else if (argv[i] === '--check') check = true
  else positional.push(argv[i])
}

try {
  if (pageName) {
    const want = await buildPage(pageName)
    const file = join(ROOT, 'previews', `${pageName}.html`)
    if (check) {
      const have = existsSync(file) ? readFileSync(file, 'utf8') : ''
      if (have !== want) {
        console.error(`FAIL: previews/${pageName}.html разошлось с рендером компонента.`)
        console.error(`      Перерисовать: node scripts/render-preview.mjs --page ${pageName}`)
        process.exit(1)
      }
      console.log(`ok: previews/${pageName}.html совпадает с рендером (${want.length} символов)`)
    } else {
      writeFileSync(file, want)
      console.log(`переписано previews/${pageName}.html (${want.length} символов)`)
    }
  } else {
    const [component, caseId] = positional
    if (!component || !caseId) {
      console.error('usage: render-preview.mjs <Component> <caseId> [--prop k=v] [--strip <selector>]')
      console.error('       render-preview.mjs --page <name> [--check]')
      process.exit(2)
    }
    const [html] = await renderAll(component, [{ case: caseId, props: overrides, strip }])
    process.stdout.write(html + '\n')
  }
} catch (e) {
  console.error(`FAIL: ${e.message}`)
  process.exit(1)
}
