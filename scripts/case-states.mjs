#!/usr/bin/env node
/**
 * Кейс, чей смысл в СОСТОЯНИИ, проверяется в настоящем кадре (DS-134).
 *
 * ЧТО ЭТО ЗАКРЫВАЕТ. `fixtures-render` утверждает ровно одно — «не бросило», —
 * и потому одинаково зелен на раскрытом списке и на схлопнувшемся. У случая,
 * который сам приводит себя в состояние (клик по триггеру в эффекте),
 * автоматической проверки до этого гейта не было вовсе. Замер 30.08: сторож
 * `opened` снят в `Combobox.fixture.tsx`, в chromium список не раскрывается —
 * `fixtures-render` 218/218 зелёных.
 *
 * ПОЧЕМУ БРАУЗЕР, А НЕ jsdom. Предмет — «ПОКАЗАН», а это слово в jsdom не
 * выражается: там нет ни раскладки, ни каскада, ни `StrictMode`, под которым
 * работает кадр (`workbench/frame.tsx`). В том же замере jsdom со снятым
 * сторожем находил `role=listbox` — то есть ответил бы «да» на сломанном
 * случае. Гейт грузит РОВНО ТОТ адрес, который открывает человек:
 * `/frame.html?c=<Имя>&case=<id>`.
 *
 * ПОЧЕМУ НЕ СКРИНШОТЫ. Вопрос здесь «состояние достигнуто», а не «выглядит
 * так». Снимок отвечает на второй и ломается на обновлении шрифта, после чего
 * человек привыкает утверждать эталон не глядя.
 *
 * ЧЕГО ГЕЙТ НЕ ДЕЛАЕТ. Он не решает, ЧТО случай обязан показать: это объявляет
 * фикстура полем `shows` (`src/internal/fixture.ts`). Случай без объявления
 * гейт не трогает — сорока фикстурам объявлять нечего, и обязательное поле
 * дало бы сорок формальных строк, ни одна из которых не стоила автору мысли.
 *
 * Usage: npm run states
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { humanUrl } from './case-walk.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * СВОЙ порт и `--strictPort`, а не общий 5274. Разработчик держит верстак
 * поднятым службой, и прогон, молча подключившийся к ЕГО серверу, проверял бы
 * чужое дерево — в лучшем случае устаревшее. Занятый порт валит запуск, а не
 * подменяет предмет проверки. Список портов держит `dev-server-ports`.
 */
const PORT = 5277
const HOST = '127.0.0.1'

/**
 * Сколько ждать объявленного узла. Случай приводит себя в состояние эффектом
 * после монтирования, то есть узел появляется НЕ в первом кадре; ждать надо, а
 * не читать сразу. Три секунды — заведомо больше, чем открытие поповера, и
 * заведомо меньше, чем «висим на сломанном кейсе».
 */
const APPEAR_MS = 3000

const vite = spawn(
  'npm',
  ['run', 'wb', '--', '--port', String(PORT), '--strictPort', '--host', HOST],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
)
const stopVite = () => {
  try {
    vite.kill('SIGTERM')
  } catch {
    /* уже мёртв */
  }
}
process.on('exit', stopVite)

async function waitForServer(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* ещё поднимается */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`дев-сервер верстака не поднялся: ${url}`)
}

const fail = (lines) => {
  for (const l of lines) console.error(`FAIL: ${l}`)
}

/** Первая строка сообщения: у playwright ниже неё идёт лог вызова на десяток строк. */
const firstLine = (e) => String(e?.message ?? e).split('\n')[0]

/**
 * ОТКАЗ ДО ОБХОДА — громкий и с остановленным верстаком (DS-316). Здесь
 * ещё нечего обходить: без дев-сервера, браузера или плана «не измерено» некому
 * раздавать, поэтому это один `FAIL` с причиной, а не список. Но исходом, а не
 * необработанным отказом: тот печатает стек node вместо причины, и `stopVite`
 * тогда держался бы на одном обработчике `exit`.
 */
let browser = null
const bail = async (lines) => {
  fail(lines)
  try {
    await browser?.close()
  } catch {
    /* браузер уже мёртв — закрывать нечего */
  }
  stopVite()
  process.exit(1)
}

let page
let plan
try {
  await waitForServer(`http://${HOST}:${PORT}/`)
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 900, height: 640 } })
  /**
   * План приходит ИЗ СТРАНИЦЫ: фикстуры это `.tsx`, голый Node их не прочтёт, а
   * разбор регулярками соврал бы на первой многострочной записи. Модуль
   * `workbench/shows-plan.ts` собирает его импортом, и его сходимость с
   * фикстурами держит `workbench/shows-plan.test.ts`.
   */
  await page.goto(`http://${HOST}:${PORT}/`, { waitUntil: 'load' })
  plan = await page.evaluate(() => import('/shows-plan.ts').then((m) => m.showsPlan()))
} catch (e) {
  await bail([`обход не начался — ${firstLine(e)}`])
}

// Пустой план значит, что гейт обошёл ноль случаев и ничего не проверил, — это
// провал, а не «нечего проверять». Молчаливый ноль здесь и есть тот вид
// зелёного, ради которого гейт написан.
if (plan.length === 0) {
  await bail(['ни один кейс не объявил shows — гейт состояний обошёл бы ноль случаев'])
}

/**
 * ЯЧЕЙКА — ОДНА ЗАГРУЗКА КАДРА, и её отказ не уносит обход (DS-316).
 *
 * До этой задачи `page.goto` стоял голым: сетевой отказ или таймаут навигации
 * на ОДНОМ случае ронял весь прогон необработанным отказом — без имени случая,
 * без адреса, со стеком node, и остальные случаи не проверялись вовсе. Соседний
 * обход (`case-walk.mjs`, `cellFrame`) делает наоборот, и здесь тот же порядок:
 * отказ — это исход «не измерено» с причиной и адресом кадра на постоянной
 * службе 5274, обход идёт до конца, все такие случаи печатаются списком, и
 * прогон краснеет их числом. «Не измерено» КРАСНОЕ: случай, который не
 * загрузился, ничего не показал, и зелёным он был бы ровно тем молчаливым
 * пропуском, против которого гейт заведён.
 *
 * Перехват — вокруг ВСЕЙ ячейки, а не одного `goto`: урок того же обхода —
 * обёрнутое место рядом с голым `evaluate` чинит класс поштучно, и следующий
 * голый вызов снова уносит прогон. Нарушения, записанные ячейкой до отказа,
 * остаются в `failures`: они сняты с живого кадра и правдивы.
 *
 * Помощник из `case-walk.mjs` (`cellFrame`) не взят: он заточен под пул
 * страниц ходока и его `CellFailure`, а здесь страница одна и `pageerror`
 * копится по случаю плана. Общий взят один `humanUrl` — адрес для человека
 * обязан печататься одинаково у всех гейтов.
 */
class LoadFailure extends Error {}

/**
 * ПОСЛЕ ОТКАЗА — НОВАЯ СТРАНИЦА, а не та же. Замер мутацией (порт 1 у одного
 * случая): упавший `goto` оставляет страницу на полпути, и КАЖДЫЙ следующий
 * `goto` отвечает «interrupted by another navigation» к адресу ПРЕДЫДУЩЕГО
 * случая — одна битая ячейка давала 125 «не измерено» из 126. Список был бы
 * честным по форме и ложным по сути: он называл бы сломанными случаи, которые
 * ни в чём не виноваты. Страница дешевле разбора её состояния, поэтому она
 * просто меняется. Не открылась и новая — браузер мёртв, и тогда «не измерено»
 * у всех оставшихся и есть правда.
 */
const freshPage = async () => {
  try {
    await page.close()
  } catch {
    /* страница уже мертва */
  }
  try {
    page = await browser.newPage({ viewport: { width: 900, height: 640 } })
  } catch {
    /* браузер мёртв — следующие ячейки получат «не измерено» */
  }
}
const unmeasured = []
let cells = 0
const cell = async (at, url, body) => {
  try {
    try {
      await page.goto(url, { waitUntil: 'load' })
    } catch (e) {
      throw new LoadFailure(`загрузка не состоялась — ${firstLine(e)}`)
    }
    await body()
  } catch (e) {
    unmeasured.push({
      at,
      url,
      why: e instanceof LoadFailure ? e.message : `замер не состоялся — ${firstLine(e)}`,
    })
    await freshPage()
  }
  cells++
}

const failures = []
let selectors = 0

for (const row of plan) {
  const url = `http://${HOST}:${PORT}/frame.html?c=${encodeURIComponent(row.c)}`
    + `&case=${encodeURIComponent(row.caseId)}&sid=1&theme=light`
  const errs = []
  page.removeAllListeners('pageerror')
  page.on('pageerror', (e) => errs.push(String(e.message)))
  await cell(`${row.c}/${row.caseId}`, url, async () => {
    for (const sel of row.shows) {
      selectors++
      try {
        await page.waitForSelector(sel, { state: 'visible', timeout: APPEAR_MS })
      } catch {
        failures.push(
          `${row.c}/${row.caseId}: обещано «${sel}» — в кадре не появилось за ${APPEAR_MS} мс`,
        )
        continue
      }
      /**
       * Второй слой поверх playwright-евого `visible`: тот считает видимым узел с
       * непустым боксом, но `opacity: 0` для него видимость. Поповер в анимации
       * появления — законный ноль, поэтому ждём, а не читаем сразу.
       *
       * СЕЛЕКТОР ПЕРЕСПРАШИВАЕТСЯ КАЖДЫЙ КАДР, а не измеряется ручка, полученная
       * от `waitForSelector`. Ручка указывает на КОНКРЕТНЫЙ узел, а обещание
       * фикстуры — про кадр: «здесь показано вот это». Узел, вынутый из дерева
       * очередным рендером, навсегда отдаёт бокс 0×0 и `checkVisibility: false`,
       * то есть гейт краснел на живом кадре — и краснел правдоподобно, «бокс
       * 0×0» читается как «случай не показывает обещанного».
       *
       * Ловится это ровно на виртуализованных списках (DS-127, волна 6):
       * `LogViewer` на монтировании следует за низом, окно пересобирается, и
       * строка, на которой `waitForSelector` остановился, уезжает из DOM. Замер:
       * `LogViewer/clamp` — `isConnected: false`, бокс 0×0 при десяти живых
       * `[aria-expanded="false"]` в том же кадре, три прогона из трёх.
       *
       * Утверждение от переспроса не слабеет: «узел появился и исчез» остаётся
       * красным, только теперь под своим именем, а не под чужим.
       */
      const why = await page.evaluate(([selector, ms]) => {
        const deadline = performance.now() + ms
        const look = () => {
          const node = document.querySelector(selector)
          if (!node) return 'узел появился и исчез из кадра'
          const r = node.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return `бокс ${Math.round(r.width)}×${Math.round(r.height)}`
          if (
            !node.checkVisibility({
              opacityProperty: true,
              visibilityProperty: true,
              contentVisibilityAuto: true,
            })
          ) {
            return 'узел есть, но не виден (opacity/visibility/content-visibility)'
          }
          return null
        }
        return new Promise((res) => {
          const tick = () => {
            const bad = look()
            if (!bad) return res(null)
            if (performance.now() > deadline) return res(bad)
            requestAnimationFrame(tick)
          }
          tick()
        })
      }, [sel, APPEAR_MS])
      if (why) failures.push(`${row.c}/${row.caseId}: обещано «${sel}» — ${why}`)
    }

    if (errs.length) failures.push(`${row.c}/${row.caseId}: кадр бросил — ${errs.join(' | ')}`)
  })
}

/**
 * ЗАМЕР ВСПЛЫВАЮЩЕГО УЗЛА — ОДИН на оба состояния (DS-292).
 *
 * Два состояния меряются одной функцией нарочно: второй замер с той же
 * арифметикой разошёлся бы с первым молча, и половина инварианта отвечала бы
 * про другую величину, чем вторая. Различает их один флаг — ждать ли, пока хук
 * ПОСТАВИТ узел (`requirePlaced`). Функция уходит в страницу целиком, поэтому
 * ничего из модуля не захватывает: всё приходит аргументами.
 */
const probePopup = async ([selector, ms, requirePlaced]) => {
  const deadline = performance.now() + ms
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  // Ждём, пока хук ПОСТАВИЛ узел: `fixed` из инлайна и снятый
  // `visibility: hidden` первого замера. Без этого случай мерил бы
  // фолбэк листа — ровно то, что и так верно.
  const placed = (n) => n.style.position === 'fixed'
    && n.checkVisibility({ visibilityProperty: true })
  let nodes = []
  while (performance.now() < deadline) {
    nodes = [...document.querySelectorAll(selector)]
    if (nodes.length && (!requirePlaced || nodes.every(placed))) break
    await frame()
  }
  await document.fonts.ready
  await frame(); await frame()
  nodes = [...document.querySelectorAll(selector)]
  return {
    theme: document.documentElement.dataset.theme,
    nodes: nodes.map((n) => {
      const b = n.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(n)
      const t = range.getBoundingClientRect()
      // МОСТИК НАВЕДЕНИЯ торчит НИЖЕ подложки НАМЕРЕННО (WCAG 1.4.13
      // Hoverable, `.ds-tooltip__bubble::after`) и входит в `scrollHeight`.
      // Сколько его снизу — из его же `bottom`: отрицательное значение и есть
      // вылет. У перевёрнутого вниз пузырька мостик переезжает НАВЕРХ, и
      // вылета снизу нет вовсе.
      const af = getComputedStyle(n, '::after')
      const afBottom = af.content === 'none' ? 0 : parseFloat(af.bottom)
      return {
        placed: placed(n),
        shown: n.checkVisibility({ visibilityProperty: true }),
        // Инлайн есть ровно тогда, когда узел ставит хук. Его ОТСУТСТВИЕ —
        // это и есть определение «мерим фолбэк листа», и спрашивать про него
        // надо отдельно от видимости: скрытый узел бывает и с инлайном
        // (первый замер хука ставит `visibility: hidden`).
        inline: n.getAttribute('style'),
        bridge: Number.isFinite(afBottom) ? Math.max(0, -afBottom) : 0,
        scale: getComputedStyle(n).getPropertyValue('--ds-ui-scale').trim(),
        client: n.clientHeight,
        scroll: n.scrollHeight,
        box: { l: b.left, r: b.right, t: b.top, b: b.bottom },
        text: { l: t.left, r: t.right, t: t.top, b: t.bottom, h: t.height },
      }
    }),
  }
}

/**
 * ПОКАЗАННОЕ ВСПЛЫВАЮЩЕЕ ДЕРЖИТ СВОЁ СОДЕРЖИМОЕ (DS-287).
 *
 * `useAnchoredPosition` ставит узлу инлайном `position: fixed` плюс `left`/`top`,
 * а лист компонента держит статический фолбэк для вёрстки без JS. У `Tooltip`
 * это `bottom: calc(100% + gap)`: fixed-бокс с `top` И `bottom` и `height: auto`
 * берёт высоту из остатка, остаток отрицательный — контент ноль. Замер владельца:
 * `Tooltip/shown` в тёмной теме — подложка 8 px (ровно падинги), 76 % текста
 * ниже неё; `long` на 1.25 — 31 из 41 px текста вне подложки.
 *
 * ПОЧЕМУ ЗДЕСЬ, А НЕ В `measure`. Там случаи рисуют разметку по классам БЕЗ JS,
 * то есть мерят ровно фолбэк — и он там верен. Дефект живёт только в сумме
 * фолбэка с инлайном хука, а инлайн бывает только в живом кадре. Этот раннер
 * уже грузит тот самый адрес, который открывает человек, — второй раннер ради
 * одного вопроса был бы вторым ответом на него.
 *
 * Область — ЛИТЕРАЛОМ: каждый потребитель хука, у которого есть случай в
 * открытом состоянии (у `SideNav` такого нет — подменю открывается только
 * кликом). Две шкалы и две темы: дефект снят на тёмной, а остаток зависит от
 * шкалы через зазор. Счёт узлов сверяется с литералом ниже — план, собранный
 * из того же списка, согласен сам с собой (ловушка 7, docs/writing-checks.md).
 */
const ANCHORED = [
  ['Tooltip', 'shown', '.ds-tooltip__bubble'],
  ['Tooltip', 'long', '.ds-tooltip__bubble'],
  ['Popover', 'open', '.ds-popover__panel'],
  ['Popover', 'form', '.ds-popover__panel'],
  ['Popover', 'placements', '.ds-popover__panel'],
  ['DropdownMenu', 'open', '.ds-dropdown__menu'],
  ['DropdownMenu', 'structure', '.ds-dropdown__menu'],
  ['DropdownMenu', 'own-trigger', '.ds-dropdown__menu'],
  ['DropdownMenu', 'align-end', '.ds-dropdown__menu'],
]
/** 9 случаев × 2 шкалы × 2 темы, плюс ещё три панели `placements` на каждой паре. */
const ANCHORED_NODES = (9 + 3) * 2 * 2
let anchoredNodes = 0
const anchoredGapFrom = unmeasured.length

for (const [c, caseId, sel] of ANCHORED) {
  for (const scale of ['1', '1.5']) {
    for (const theme of ['light', 'dark']) {
      const at = `${c}/${caseId} ×${scale} ${theme}`
      const url = `http://${HOST}:${PORT}/frame.html?c=${encodeURIComponent(c)}`
        + `&case=${encodeURIComponent(caseId)}&sid=1&theme=${theme}${scale === '1' ? '' : `&scale=${scale}`}`
      await cell(at, url, async () => {
        const got = await page.evaluate(probePopup, [sel, APPEAR_MS, true])
        // Санитары на известных соседей: тема и шкала обязаны доехать до узла,
        // иначе обход четырёх комбинаций мерил бы одну.
        if (got.theme !== theme) { failures.push(`${at}: тема кадра ${got.theme} вместо ${theme}`); return }
        if (!got.nodes.length) { failures.push(`${at}: «${sel}» в кадре нет — случай не открылся`); return }
        for (const [i, n] of got.nodes.entries()) {
          anchoredNodes++
          const where = got.nodes.length > 1 ? `${at} [${i}]` : at
          if (!n.placed) { failures.push(`${where}: хук узел не поставил (нет инлайнового fixed) — мерился бы фолбэк`); continue }
          if (Number(n.scale) !== Number(scale)) { failures.push(`${where}: шкала на узле ${n.scale || '(пусто)'} вместо ${scale}`); continue }
          if (!(n.text.h > 0)) { failures.push(`${where}: у содержимого нулевая высота — мерить нечего`); continue }
          // РАВЕНСТВО, а не «не больше» (DS-292). Прежнее `scroll <=
          // client + 1` на `Tooltip` меряло не то, чем кажется: у пузырька
          // мостик наведения высотой в `--ds-anchor-gap` торчит ниже подложки
          // намеренно, и `scrollHeight` его считает. Замер 16.09.2026, шкала 1:
          // scrollHeight 29 при clientHeight 23, разница ровно 6 — это зазор,
          // а не вытекший текст; убери `::after` — обе величины 23. Зелёным
          // прежнее утверждение держалось лишь потому, что в этих случаях
          // пузырёк переворачивается вниз и мостик уезжает НАВЕРХ, где
          // `scrollHeight` его не видит: то есть проходило оно по случайности
          // положения, а не по инварианту, и на здоровом пузырьке сверху
          // покраснело бы. Теперь названо, что именно торчит снизу и сколько.
          if (Math.abs(n.scroll - (n.client + n.bridge)) > 1) {
            failures.push(`${where}: снизу торчит не только мостик — scrollHeight ${n.scroll} при подложке ${n.client} и мостике ${n.bridge}`)
          }
          const out = Math.max(n.box.l - n.text.l, n.text.r - n.box.r, n.box.t - n.text.t, n.text.b - n.box.b)
          if (out > 0.5) {
            failures.push(`${where}: содержимое за подложкой на ${out.toFixed(1)} px — подложка ${(n.box.b - n.box.t).toFixed(1)} px, содержимое ${n.text.h.toFixed(1)} px`)
          }
        }
      })
    }
  }
}
// Счёт узлов сверяется только у блока, где загрузились ВСЕ кадры: недобор при
// «не измерено» — следствие, уже названное поимённо, а «область схлопнулась»
// отправило бы искать пропавший случай в литерале.
if (unmeasured.length === anchoredGapFrom && anchoredNodes !== ANCHORED_NODES) {
  failures.push(`всплывающих обмерено ${anchoredNodes} вместо ${ANCHORED_NODES} — область схлопнулась или разрослась`)
}

/**
 * ЗАКРЫТОЕ СОСТОЯНИЕ — ВТОРАЯ ПОЛОВИНА ТОГО ЖЕ ИНВАРИАНТА (DS-292).
 *
 * Блок выше смотрит на узел, ПОСТАВЛЕННЫЙ хуком, и до этой задачи закрытое
 * состояние не смотрел никто: `measure` мерит фолбэк листа без хука вовсе, а
 * здесь его отсекал сам критерий ожидания. Значит починка, ломающая фолбэк,
 * прошла бы молча — ровно так DS-287 прожила с выпуска 4.2.2.
 *
 * Узел в DOM ЕСТЬ только у `Tooltip`: у него состояние управляет ПОКАЗОМ, а не
 * рендером (`aria-describedby` обязан уцелеть), а `Popover` и `DropdownMenu`
 * закрытыми не рисуют панель вовсе — мерить у них нечего, и это не пробел
 * списка, а свойство компонентов.
 *
 * ЧТО ЗАКРЫТЫЙ ПУЗЫРЁК НЕ ЗНАЧИТ. Он не «разметка без JS, которую видит
 * потребитель без гидрации»: с DS-240 показ держит класс `.is-shown` от
 * состояния, а `:hover`/`:focus-within` в `Tooltip.css` нет НИ ОДНОГО — без JS
 * подсказка не появляется никогда. Фолбэк листа держит РУЧНУЮ вёрстку по
 * классам, и проверяется он здесь именно поэтому, а не ради негидрированной
 * страницы.
 */
const CLOSED = [['Tooltip', 'base', '.ds-tooltip__bubble']]
/** 1 случай × 2 шкалы × 2 темы. */
const CLOSED_NODES = 1 * 2 * 2
let closedNodes = 0
const closedGapFrom = unmeasured.length

for (const [c, caseId, sel] of CLOSED) {
  for (const scale of ['1', '1.5']) {
    for (const theme of ['light', 'dark']) {
      const at = `${c}/${caseId} ×${scale} ${theme} (закрыт)`
      const url = `http://${HOST}:${PORT}/frame.html?c=${encodeURIComponent(c)}`
        + `&case=${encodeURIComponent(caseId)}&sid=1&theme=${theme}${scale === '1' ? '' : `&scale=${scale}`}`
      await cell(at, url, async () => {
        // ЗАКРЫТЫЙ ПУЗЫРЁК БОКСА НЕ ИМЕЕТ (DS-308): компонент снимает его с
        // раскладки атрибутом `hidden`, иначе невидимый узел уводил документ
        // вбок. Утверждается здесь, на живом кадре, до замера фолбэка: узел в
        // DOM есть, бокса нет. Потом атрибут снимается — и мерится ФОЛБЭК ЛИСТА,
        // ровно то, что видит ручная вёрстка по классам: класс без `is-shown` и
        // без `hidden`. Инлайна компонент закрытому узлу не ставит, так что
        // после снятия атрибута на узле остаётся один лист.
        const boxless = await page.evaluate(async ([s, ms]) => {
          const deadline = performance.now() + ms
          while (!document.querySelector(s) && performance.now() < deadline) {
            await new Promise((r) => requestAnimationFrame(() => r()))
          }
          const ns = [...document.querySelectorAll(s)]
          const out = ns.map((n) => ({
            hidden: n.hasAttribute('hidden'),
            display: getComputedStyle(n).display,
            w: n.getBoundingClientRect().width,
          }))
          for (const n of ns) n.removeAttribute('hidden')
          return out
        }, [sel, APPEAR_MS])
        for (const [i, b] of boxless.entries()) {
          if (!b.hidden || b.display !== 'none' || b.w !== 0) {
            failures.push(`${at} [${i}]: закрытый пузырёк держит бокс — hidden ${b.hidden}, display ${b.display}, ширина ${b.w}; невидимое занимает место в прокрутке (DS-308)`)
          }
        }
        const got = await page.evaluate(probePopup, [sel, APPEAR_MS, false])
        if (got.theme !== theme) { failures.push(`${at}: тема кадра ${got.theme} вместо ${theme}`); return }
        if (!got.nodes.length) { failures.push(`${at}: «${sel}» в кадре нет — узел обязан жить в DOM и закрытым`); return }
        for (const [i, n] of got.nodes.entries()) {
          closedNodes++
          const where = got.nodes.length > 1 ? `${at} [${i}]` : at
          // САНИТАРЫ: без них блок зелен там, где мерил вторую половину.
          if (n.shown) { failures.push(`${where}: пузырёк показан — случай не закрыт, мерился бы уже поставленный узел`); continue }
          if (n.inline !== null) { failures.push(`${where}: на узле инлайн «${n.inline}» — закрытым его ставить некому, мерился бы не фолбэк`); continue }
          if (Number(n.scale) !== Number(scale)) { failures.push(`${where}: шкала на узле ${n.scale || '(пусто)'} вместо ${scale}`); continue }
          if (!(n.text.h > 0)) { failures.push(`${where}: у содержимого нулевая высота — мерить нечего`); continue }
          // Мостик у закрытого пузырька обязан быть СНИЗУ: фолбэк ставит его над
          // триггером (`bottom: calc(100% + gap)`), и мостик закрывает зазор под
          // ним. Ноль здесь значит, что мерили перевёрнутый узел, и равенство
          // ниже выполнялось бы тривиально.
          if (!(n.bridge > 0)) { failures.push(`${where}: мостик снизу нулевой — у закрытого пузырька он обязан висеть под подложкой`); continue }
          if (Math.abs(n.scroll - (n.client + n.bridge)) > 1) {
            failures.push(`${where}: снизу торчит не только мостик — scrollHeight ${n.scroll} при подложке ${n.client} и мостике ${n.bridge}`)
          }
          const out = Math.max(n.box.l - n.text.l, n.text.r - n.box.r, n.box.t - n.text.t, n.text.b - n.box.b)
          if (out > 0.5) {
            failures.push(`${where}: содержимое за подложкой на ${out.toFixed(1)} px — подложка ${(n.box.b - n.box.t).toFixed(1)} px, содержимое ${n.text.h.toFixed(1)} px`)
          }
        }
      })
    }
  }
}
if (unmeasured.length === closedGapFrom && closedNodes !== CLOSED_NODES) {
  failures.push(`закрытых всплывающих обмерено ${closedNodes} вместо ${CLOSED_NODES} — область схлопнулась или разрослась`)
}

/**
 * ПОЛНОТА ОБХОДА — счётом, как у ходока (`case-walk.mjs`). Каждая ячейка
 * отчитывается ровно одним `cells++` — замером или «не измерено», — так что
 * число известно до обхода. Расхождение значит, что ячейки пропали мимо обоих
 * исходов (`continue` не того цикла, ранний выход), и зелёный отчёт тогда
 * утверждал бы о случаях, которых никто не грузил.
 */
const CELLS = plan.length + (ANCHORED.length + CLOSED.length) * 2 * 2
if (cells !== CELLS) failures.push(`замеров ${cells} вместо ${CELLS} — обход оборвался`)

try {
  await browser.close()
} catch {
  /* браузер умер по ходу — это уже названо «не измерено», закрывать нечего */
}
// Явно, а не только обработчиком `exit`: дев-сервер держит хэндл, и без этого
// прогон делает всю работу, печатает результат и висит — зелёный, но
// незавершённый. Ровно так же кончается `smoke:wb`.
stopVite()

if (unmeasured.length) {
  console.error(`НЕ ИЗМЕРЕНО ${unmeasured.length}:`)
  for (const u of unmeasured) console.error(`  ${u.at}: ${u.why}\n    ${humanUrl(u.url)}`)
}
if (failures.length || unmeasured.length) {
  fail(failures)
  console.error(
    `\nСОСТОЯНИЯ: ${failures.length} нарушений на ${selectors} обещаниях и ${anchoredNodes} всплывающих, `
    + `${unmeasured.length} не измерено из ${CELLS} кадров.`,
  )
  process.exit(1)
}

console.log(
  `СОСТОЯНИЯ OK — ${selectors} обещаний в ${plan.length} кейсах показаны в кадре:`,
)
for (const row of plan) console.log(`  ${row.c}/${row.caseId}: ${row.shows.join(', ')}`)
console.log(`ВСПЛЫВАЮЩИЕ OK — ${anchoredNodes} узлов держат содержимое: ${ANCHORED.map(([c, k]) => `${c}/${k}`).join(', ')} × шкалы 1, 1.5 × обе темы`)
console.log(`ЗАКРЫТЫЕ OK — ${closedNodes} узлов держат содержимое и фолбэк листа: ${CLOSED.map(([c, k]) => `${c}/${k}`).join(', ')} × шкалы 1, 1.5 × обе темы`)
