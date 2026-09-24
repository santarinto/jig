#!/usr/bin/env node
/**
 * Visual invariants, measured in a real browser.
 *
 * `npm test` runs in jsdom, which has no layout engine and only a rough cascade:
 * it can tell that a class reached an element, never which rule won or what the
 * result looks like. Every defect a consumer reported in 1.5.1–1.6.1 lived in
 * exactly that blind spot — `MetricStrip.dense` applied to nothing, a foreign
 * `body` rule beating ours on `color`, a two-line card header overflowing its own
 * box. All three are one measurement away and none are one unit test away.
 *
 * Deliberately NOT screenshot diffs: those break on a font update, need a human
 * to approve every intended change, and that human soon approves everything.
 * Each case here asserts a number or a colour, so a failure names the defect.
 *
 * The cases render plain markup against the built stylesheet, because that is
 * where these bugs live. That components emit the right classes is what the
 * jsdom tests already prove, and `src/__guards__/bem-modifiers.test.ts` ties the
 * two together by requiring every class in the markup to be styled somewhere.
 *
 * Usage: npm run measure
 */
import { chromium } from 'playwright'
import * as esbuild from 'esbuild'
import { createServer } from 'node:http'
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname, join, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// Разбор цвета — отдельным модулем: он же проверяется гейтом
// `src/__guards__/colour-parse.test.ts`, а этот файл в vitest не импортируется
// (верхний уровень поднимает браузер и сервер). DS-216.
import { contrastOf, deltaE76 } from './colour.mjs'
// «Цвет, каким его видно»: `opacity` предка и альфа самого `color` не входят ни
// в одно computed-значение, и любой случай, читающий `color` против
// `backgroundColor`, утверждал про цвет, которого на экране нет (DS-209).
// Браузер СНИМАЕТ цепочку слоёв (`window.__seen`), node СЧИТАЕТ — так
// арифметика остаётся под гейтом `colour-parse`, а не уезжает в page.evaluate.
import { SEEN_INSTALL, seenPair, seenOn } from './seen-colour.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STYLES = join(ROOT, 'dist/src/styles.css')
/** Версия пакета — предмет случая «версия читается со страницы» (DS-215). */
const PKG_VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version

/**
 * Поле хоста кадра верстака — ЧИТАЕТСЯ из `workbench/frame.css` (DS-290).
 *
 * Кадр отдаёт компоненту не свою ширину, а ширину минус поле вокруг предмета:
 * у `.wbf-host` `padding: 30px` на сторону. Гейт же ставил хост РОВНО в
 * заданное число — и на «кадре 360» мерил 360 там, где владелец смотрит 300.
 * Расходились не числа одного замера (это как раз законно, и так записано в
 * CLAUDE.md), а НАБОР ТОЧЕК: самая узкая ширина гейта была шире самой узкой
 * ширины владельца, и полоса между ними не измерялась ни разу. Зелёный на ней
 * означал только это.
 *
 * Литерал здесь завёл бы ВТОРОЕ место, где живёт число 30, и разойтись они
 * могли бы молча — при первой же правке паддинга. Отказ при нечитаемом правиле
 * намеренный: гейт, не знающий, сколько кадр отнимает у компонента, обязан
 * упасть, а не подставить вчерашнее число. Что прочитанное совпадает с тем,
 * что браузер применяет, проверяет случай «Кадр верстака отдаёт компоненту
 * кадр МИНУС поле хоста» — отрисовкой в настоящем кадре, а не арифметикой.
 */
const FRAME_PAD = (() => {
  const css = readFileSync(join(ROOT, 'workbench/frame.css'), 'utf8')
  const m = css.match(/\.wbf-host\s*\{[^}]*?\bpadding:\s*(\d+(?:\.\d+)?)px\s*[;}]/)
  if (!m) {
    console.error('FAIL: в workbench/frame.css не читается `padding` у `.wbf-host` — гейт не знает, сколько кадр верстака отнимает у компонента')
    process.exit(1)
  }
  return +m[1] * 2
})()

/** Ширина, которую кадр верстака шириной `frame` отдаёт компоненту. */
const hostOf = (frame) => frame - FRAME_PAD

/**
 * Самая узкая точка, на которую смотрит ЧЕЛОВЕК: то, что достаётся компоненту
 * в кадре 440 — ПОЛ поддерживаемой ширины (DS-380, `WIDTH_FLOOR` в
 * `scripts/width-surface.mjs`, `workbench/frame-width.ts`), а не «телефон».
 * До DS-380 здесь стоял кадр 360, и прежняя константа равнялась 300 —
 * переезд пола сдвинул и саму точку, и её значение (JIG-29): HOST_440 = 380.
 *
 * Стоит рядом с прежними ширинами хоста, а не вместо них: те сняты прежними
 * задачами и остаются их числами (900 у случая про поворот держит «на просторе
 * не поворачивать», 1189 — свою историю), а эта добавлена, чтобы у гейта вообще
 * появилась точка владельца.
 *
 * Не во всех случаях, и оба исключения названы, а не подразумеваются:
 *  - там, где ширины лишь разведены по обе стороны ПОРОГА (скрытие колонок
 *    DataTable), 380 лежит с той же стороны, что и 440, и не спрашивает
 *    ничего нового;
 *  - в случаях графиков точка краснела на настоящих дефектах, и они были не
 *    про оснастку: DS-295 (порог «половина имени»), DS-297 (плашка
 *    наведения не влезает в поле данных) и DS-296 (ось X вырождается в
 *    одну подпись). Все три закрыты, и все три точки вернулись в свои списки.
 *
 * Счёт на 16.09.2026, посчитанный, а не прикинутый (числа ниже — про эпоху
 * кадра 360, до DS-380; состав групп не изменился переездом пола, изменилось
 * только само число): ширину 360 или 900 брали КОНТЕЙНЕРОМ 12 случаев (общее
 * число случаев прогона здесь не называется намеренно — его двигает каждая
 * вторая задача, DS-230). Девять спрашивают «держится ли на узком» — у
 * Pagination точка 300 (теперь 440, JIG-29) была своя и раньше (полоса это
 * кадр минус карточка), пять получили её здесь, три — вместе с починкой
 * своих дефектов (DS-295, 296, 297). Оставшиеся три — DataTable,
 * где ширины лишь разведены вокруг порога скрытия колонок.
 */
const HOST_440 = hostOf(440)

/**
 * Глубина пересечения двух повёрнутых прямоугольников по SAT; 0 — не
 * пересекаются. Прямоугольник — четыре угла по обходу, в координатах холста.
 *
 * По осям самих прямоугольников, а не по AABB: у соседних параллельных
 * диагоналей AABB пересекаются всегда, и проверка краснела бы на здоровой
 * раскладке. Общая у повёрнутых категорий BarChart (DS-280) и
 * повёрнутой оси X LineChart (DS-296).
 */
function satDepth(A, B) {
  let d = Infinity
  for (const q of [A, B]) {
    for (let i = 0; i < 2; i++) {
      const nx = -(q[i + 1][1] - q[i][1]), ny = q[i + 1][0] - q[i][0]
      const len = Math.hypot(nx, ny) || 1
      const proj = (r) => r.map(([x, y]) => (x * nx + y * ny) / len)
      const pa = proj(A), pb = proj(B)
      const gap = Math.max(Math.min(...pa) - Math.max(...pb), Math.min(...pb) - Math.max(...pa))
      if (gap > -0.01) return 0
      d = Math.min(d, -gap)
    }
  }
  return d
}

/**
 * Сколько символов имени `names[i]` обязана показать подпись категории
 * BarChart (DS-295): символ сверх общего начала с каждым ЧУЖИМ именем,
 * но не меньше пола в 4 и не больше длины самого имени.
 *
 * ПОВТОРЕНО ЗДЕСЬ НАРОЧНО, а не взято из `BarChart.tsx`. Импортируй гейт ту же
 * функцию — и он проверял бы, что компонент согласен сам с собой, а это верно
 * и тогда, когда функция неверна. Расхождение двух реализаций одного правила и
 * есть то, что здесь ловится; совпадение — единственный зелёный, который
 * что-то значит.
 */
const CAT_KEEP_MIN = 4
/** Обычный потолок жёлоба подписей — доля ширины холста (`BarChart.tsx`). */
const CAT_GUTTER_SHARE = 0.4
function catKeepChars(names, i) {
  const full = [...names[i] ?? '']
  if (full.length === 0) return 0
  let need = Math.min(CAT_KEEP_MIN, full.length)
  for (let j = 0; j < names.length; j++) {
    if (j === i || names[j] === names[i]) continue
    const other = [...names[j] ?? '']
    let k = 0
    while (k < full.length && k < other.length && full[k] === other[k]) k++
    need = Math.max(need, Math.min(k + 1, full.length))
  }
  return need
}

/**
 * Проверка ряда подписей категорий на правило имени (DS-295).
 *
 * `labels` — `{shown, title}`, полное имя берётся из `<title>`, а когда его
 * нет — подпись целая и она сама себе имя. Возвращает список претензий.
 */
function catNameFaults(at, labels) {
  const bad = []
  const names = labels.map((l) => l.title ?? l.shown)
  labels.forEach((l, i) => {
    const vis = [...l.shown].length - (l.shown.endsWith('…') ? 1 : 0)
    const need = catKeepChars(names, i)
    if (vis < need) {
      const twin = names.find((n, j) => j !== i && n !== names[i] && n.startsWith([...names[i]].slice(0, vis + 1).join('')))
      bad.push(`${at}: «${l.shown}» — ${vis} символов из ${[...names[i]].length} у «${names[i]}», нужно ${need}`
        + (twin ? ` (не отличает от «${twin}»)` : ' (короче пола имени)'))
    }
  })
  // Санитар на само требование: одинаковое показанное у РАЗНЫХ имён — тот самый
  // дефект 280, и он обязан быть назван даже если счёт символов его проспал.
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (labels[i].shown === labels[j].shown && names[i] !== names[j]) {
        bad.push(`${at}: «${labels[i].shown}» показано у РАЗНЫХ категорий «${names[i]}» и «${names[j]}»`)
      }
    }
  }
  return bad
}

if (!existsSync(STYLES)) {
  console.error('FAIL: dist/src/styles.css missing — run `npm run build` first')
  process.exit(1)
}

/** Метрические токены — те, что объявлены через calc(rem * var(--ds-ui-scale)). */
const SCALED_TOKENS = readFileSync(join(ROOT, 'tokens/tokens.css'), 'utf8')
  .split('\n')
  .map((l) => l.match(/^\s+(--ds-[a-z0-9-]+):\s*calc\(/))
  .filter(Boolean)
  .map((m) => m[1])

/**
 * Блок превью, взятый С ДИСКА по `id` секции (DS-156).
 *
 * Случай, инлайнящий разметку строкой, утверждает про СВОЮ копию: превью
 * правят, копия остаётся, и замер продолжает уверенно мерить то, чего на
 * странице больше нет. Читая блок отсюда, случай и превью разойтись не могут —
 * а сама разметка превью снята с компонента (`scripts/render-preview.mjs`), то
 * есть цепочка «компонент → превью → замер» держится целиком.
 */
function previewBlock(file, id) {
  const src = readFileSync(join(ROOT, 'previews', file), 'utf8')
  const m = src.match(new RegExp(`<section id="${id}">([\\s\\S]*?)</section>`))
  if (!m) {
    console.error(`FAIL: в previews/${file} нет секции id="${id}" — превью и замер разошлись`)
    process.exit(1)
  }
  return m[1]
}

const MIME = { '.css': 'text/css', '.woff2': 'font/woff2', '.html': 'text/html' }

/** Serves the repo so the stylesheet's @import chain resolves as it does for a consumer. */
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!doctype html><html><head><meta charset="utf-8">'
      + '<link rel="stylesheet" href="/dist/src/styles.css"></head><body></body></html>')
    return
  }
  const file = join(ROOT, url)
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})

/**
 * Each case gets fresh markup, reads what the browser computed, and asserts on it.
 * `expect` receives the object `measure` returned, and throws a plain string.
 */
/** Три шкалы, на которых меряется семейство оверлеев (DS-167). */
const OVERLAY_SCALES = ['1', '1.25', '1.5']
const scaleKey = (sc) => sc.replace('.', '_')

/**
 * Шкалы и ширины полосы пагинации (DS-142, DS-149).
 *
 * Прежняя группа осталась на трёх шкалах намеренно: её предмет — длина текста и
 * единица порога, а они на пяти шкалах отвечают то же, что на трёх, за вдвое
 * больший прогон. Компактный вид, наоборот, обходил ВСЕ ПЯТЬ: было
 * «ряд номеров на кадре 360 не переносится» — про порог, а порог задавала
 * ХУДШАЯ шкала, и худшая была 0.875, то есть та, что до DS-149 в списке
 * стояла первой лишь по случайности.
 *
 * ПЯТЬ ШКАЛ ОСТАЛИСЬ У `PAGER_SCALES`, НО НЕ У КОМПАКТНОЙ ГРУППЫ (JIG-29,
 * второй круг, решение владельца). Грандфазер CLAUDE.md «дефект однажды
 * увидели глазами» отменён, и полоса компактной группы переехала с
 * [300, 360] на [440, 460] — пола системы. Живым прогоном найдено: на этой
 * ширине компактный вид (`nums === 0`) РОБАСТНО срабатывает на шкалах
 * 1.15/1.25/1.5 (em 26.19…27.43 / 24…25.14 / 19.81…20.76 — выше порога на
 * обеих ширинах), но НЕ срабатывает на 0.875 и 1 (nums остаётся 7 — доступного
 * места на полу 440 хватает без компактного вида, em там 30.29…36.41, то есть
 * ровно «между порогами», как у `bd-1-*-440` ниже). Раздвинуть ширину сильнее
 * нельзя — пол ниже 440 не мерим, а вширь компактный вид только СЛАБЕЕТ. Худшая
 * шкала для компактного вида на кадре-полу теперь 1.15, не 0.875: константа
 * `PAGER_COMPACT_SCALES` называет три шкалы, где сценарий ещё воспроизводим,
 * 0.875 и 1 из компактной группы СНЯТЫ поимённо (не молча похудевшим списком).
 */
const PAGER_SCALES = ['0.875', '1', '1.15', '1.25', '1.5']
const PAGER_COMPACT_SCALES = ['1.15', '1.25', '1.5']
const PAGER_LEGACY_SCALES = ['0.875', '1', '1.5']
/**
 * Ширины прежней группы — ПОЛОСЫ, а не кадра.
 *
 * БЫЛО [300, 440, 900, 1700]. 300 и 440 держали DS-142/149 (кадры 360 и 500 с
 * карточкой) — узкая сторона «складывается на всех шкалах». Второй круг
 * JIG-29 (решение владельца) отменил грандфазер CLAUDE.md «дефект однажды
 * увидели глазами»: 300 СНЯТ (полоса «кадр 360 с карточкой» точкой не
 * остаётся ни по какому доводу). 440 ЗАМЕНЯЕТ 300 на той же роли — проверено
 * живым прогоном (`npm run measure`): полоса складывается на ВСЕХ ТРЁХ
 * шкалах (0.875 → 34.78em, 1 → 30.29em, 1.5 → 19.81em), то же утверждение,
 * что раньше держал 300, без потери предмета.
 *
 * 500 и 708 уехали на DS-282 вместе с порогом складывания: на 708 полоса
 * теперь сложена на двух шкалах из трёх, и утверждение «ряд отдали там, где
 * он ещё помещается» стало неверным — ряду там не хватает КОЛОНКИ, что бы ни
 * показывала ширина полосы. 900 держит единицу порога (на 0.875 это 72.33em,
 * на 1.5 — 41.71em — было 77.9em / 44.9em при базе 13, DS-375 подняла её до
 * 14 и оба числа пересчитаны замером, но остались по разные стороны 59em, а в
 * пикселях содержимое отличается всего на 10px, и порог, переписанный в px,
 * дал бы один ответ на обеих шкалах). 1700 — ширина, на которой
 * ПСЕВДОКЛЮЧЕВОЙ ряд помещается в свою колонку на всех трёх шкалах
 * (требование на шкале 1 — 83.5em, было 84.8em при базе 13; ширина 1700 сама
 * не пересчитывалась — она держит фиксаж «есть у ряда своя колонка», а не сам
 * порог, и осталась зелёной на прогоне `npm run measure`): только там имеет
 * смысл спрашивать про центр диапазона.
 */
const PAGER_LEGACY_WIDTHS = [440, 900, 1700]

/**
 * Обход ширин DS-282: между обычным видом и сложенным лежала зона, в
 * которой ряд номеров переносился.
 *
 * Кадры 440…880 через 40 — тот диапазон, где дефект виден глазами (жалоба
 * пришла с 560 и 640). Ширина ПОЛОСЫ — кадр минус карточка, по 30px с каждой
 * стороны: то же соотношение, что у пары 440/460 компактной группы (DS-142/149,
 * до JIG-29 была пара 300/360).
 *
 * Пары `[шкала, под порогом, над порогом]` — ширины ПОЛОСЫ, посчитанные из
 * самого порога: содержимое равно `(w − 16×шкала) / (14×шкала)` em (знаменатель
 * был `13×шкала` до подъёма базы `--ds-fs-base` 13→14, DS-375 — паддинг
 * 16 в `rem` подъём базы не заметил, порог сдвинулся с 60em на 59em), поэтому
 * 844.8×шкала даёт 59.2em, а 839.2×шкала — 58.8em. Числа округлены наружу, до
 * десятков пикселей, и пара лежит по разные стороны 59em на КАЖДОЙ шкале —
 * иначе порог, переписанный в пиксели, прошёл бы обход (та же ловушка, что у
 * ширины 900 в прежней группе).
 */
const PAGER_SWEEP_SCALES = ['1', '1.15', '1.5']
const PAGER_SWEEP_FRAMES = [440, 480, 520, 560, 600, 640, 680, 720, 760, 800, 840, 880]
const PAGER_CARD = 60
const PAGER_EDGE = [
  ['0.875', 730, 740], ['1', 830, 850], ['1.15', 960, 980],
  ['1.25', 1040, 1060], ['1.5', 1250, 1270],
]

/**
 * Семейство оверлеев одной разметкой, снятой С RENDER КОМПОНЕНТОВ (DS-167):
 * `Modal.tsx`, `Notifications.tsx`, `toast.tsx`, `Tooltip.tsx`,
 * `GlobalSearch.tsx`, `Drawer.tsx` — классы и вложенность оттуда, а не по
 * памяти. Предмет случая — ШИРИНА, и она держится на конкретных селекторах:
 * разметка «примерно такая» мерила бы другой каскад.
 *
 * Подложка `Modal` остаётся `position: fixed` — её содержащий блок это вьюпорт,
 * и именно от него считается `100%` окна; переложив её в поток «чтобы влезли
 * три шкалы», случай мерил бы ширину body. Поэтому три подложки разведены по
 * `top`, а `left/right` из `inset: 0` не трогаются.
 *
 * `narrowModal` — ВТОРАЯ подложка шириной 280px. Только в ней видно ПОЛ ширины
 * окна: в подложке во всю ширину `width: 100%` всегда больше пола, и
 * `min-width` не проявляется вовсе — то есть уменьшение константы 20rem
 * прошло бы незамеченным.
 */
function overlayFamilyHtml({ narrowModal = false } = {}) {
  return OVERLAY_SCALES.map((sc, i) => {
    const k = scaleKey(sc)
    const modal = (id, style) => `<div class="ds-modal__overlay" style="${style}">
        <div class="ds-modal" role="dialog" aria-modal="true" id="${id}-${k}">
          <div class="ds-modal__header">
            <span class="ds-modal__title" id="${id}title-${k}">Проведение реализации №1 от 24.07</span>
            <button type="button" class="ds-modal__close" id="${id}close-${k}">×</button>
          </div>
          <div class="ds-modal__body">Провести документ?</div>
        </div></div>`
    return `<div class="ds-scale" style="--ds-ui-scale: ${sc}">
      ${modal('m', `top: ${i * 170}px; bottom: auto; height: 160px`)}
      ${narrowModal ? modal('n', `top: ${520 + i * 170}px; bottom: auto; right: auto; height: 160px; width: 280px`) : ''}
      <div class="ds-toast ds-toast--info" role="status" id="toast-${k}">
        <span class="ds-toast__msg">Проведено</span>
        <button type="button" class="ds-toast__close" id="toastclose-${k}">×</button></div>
      <div class="ds-toast ds-toast--warning" role="status" id="toastlong-${k}">
        <span class="ds-toast__msg">Документ проведён, движения по регистрам сформированы заново по всем складам организации</span>
        <button type="button" class="ds-toast__close">×</button></div>
      <div class="ds-notifs" role="log" id="notifs-${k}">
        <div class="ds-notifs__item ds-notifs__item--info">
          <div class="ds-notifs__body">
            <div class="ds-notifs__title">Проведение</div>
            <div class="ds-notifs__text">Реализация №1 проведена</div></div>
          <button type="button" class="ds-notifs__dismiss">×</button></div></div>
      ${tooltipRowHtml(sc)}
      <div class="ds-gsearch" id="gs-${k}">
        <input type="search" class="ds-gsearch__input ds-input ds-input--sm" id="gsi-${k}" value="реал"></div>
      <div style="display: flex; gap: 8px; align-items: center">
        <button type="button" class="ds-btn">Меню</button>
        <div class="ds-gsearch" id="gsbar-${k}">
          <input type="search" class="ds-gsearch__input ds-input ds-input--sm" id="gsbari-${k}" value="реал"></div></div>
      <div class="ds-drawer ds-drawer--right" id="drawer-${k}"></div>
    </div>`
  }).join('')
}

/**
 * Две подсказки одной шкалы, ОБЕ по центру строки (DS-167).
 *
 * Центр здесь — часть замера, а не оформление: пузырёк центрируется по
 * триггеру (`left: 50%` плюс `translateX(-50%)`), и у триггера возле края
 * экрана он вылезет за край при ЛЮБОЙ ширине. Позиция в задачу не входила,
 * поэтому триггер ставится посередине — тогда за края отвечает ровно то, что
 * проверяется: потолок ширины.
 *
 * `visibility: visible` стилем на узле: пузырёк показывается по `:hover`
 * предка, а навести мышь на шесть пузырьков разом нельзя. Раскладку это не
 * меняет — `visibility: hidden` бокс не убирает, — но делает случай честным:
 * меряется то, что видно.
 */
function tooltipRowHtml(sc) {
  const k = scaleKey(sc)
  const row = (id, text) => `<div style="display: flex; justify-content: center">
      <span class="ds-tooltip"><button type="button" class="ds-btn">?</button>
      <span class="ds-tooltip__bubble" role="tooltip" id="${id}-${k}" style="visibility: visible; opacity: 1">${text}</span></span></div>`
  return row('tipshort', 'Провести')
    + row('tiplong', 'Документ будет проведён, движения по регистрам сформированы заново по всем складам организации, а остатки пересчитаны на дату проведения')
}

/**
 * Замер семейства: рамка каждого узла плюс ЧИСЛО СТРОК у пузырьков подсказки.
 * Строки считаются диапазоном по содержимому узла (`Range.getClientRects()`
 * отдаёт по прямоугольнику на строчный бокс) — а не отношением высот: две
 * строки дают 1.65 высоты одной, а не 2, потому что вертикальные поля общие,
 * и порог, выведенный из высоты, зависел бы от шрифта и от `padding`.
 */
const overlayFamilyMeasure = () => {
  const box = (id) => {
    const el = document.getElementById(id)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { w: +b.width.toFixed(1), l: +b.left.toFixed(1), r: +b.right.toFixed(1), h: +b.height.toFixed(1) }
  }
  const lines = (id) => {
    const el = document.getElementById(id)
    if (!el) return null
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getClientRects().length
  }
  const out = {
    doc: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
  }
  for (const sc of ['1', '1.25', '1.5']) {
    const k = sc.replace('.', '_')
    out[sc] = {
      modal: box(`m-${k}`), title: box(`mtitle-${k}`), close: box(`mclose-${k}`),
      narrowModal: box(`n-${k}`),
      toast: box(`toast-${k}`), toastLong: box(`toastlong-${k}`),
      notifs: box(`notifs-${k}`),
      tipShort: box(`tipshort-${k}`), tipLong: box(`tiplong-${k}`),
      tipShortLines: lines(`tipshort-${k}`), tipLongLines: lines(`tiplong-${k}`),
      gs: box(`gsi-${k}`), gsBar: box(`gsbari-${k}`),
      drawer: box(`drawer-${k}`),
    }
  }
  return out
}

/** Человеческие имена узлов семейства — чтобы падение называло КОМПОНЕНТ. */
const OVERLAY_NAMES = {
  modal: 'Modal', title: 'Modal (начало заголовка)', close: 'Modal (крестик закрытия)',
  narrowModal: 'Modal (в узкой подложке)',
  toast: 'Toast', toastLong: 'Toast (длинный текст)',
  notifs: 'NotificationCenter',
  tipShort: 'Tooltip (короткая)', tipLong: 'Tooltip (длинная)',
  gs: 'GlobalSearch', gsBar: 'GlobalSearch (в строке тулбара)',
  drawer: 'Drawer',
}

/**
 * Разметка, СНЯТАЯ С КОМПОНЕНТА В NODE (DS-205).
 *
 * Приём тот же, что у `scripts/render-preview.mjs`: исходник собирается
 * esbuild-ом и рисуется `renderToStaticMarkup`. Здесь он нужен потому, что
 * предмет случая — МЕСТО УЗЛА В ДЕРЕВЕ, а не набор классов: слот `trailing`
 * жил внутри `.ds-tabs__list` и переехал наружу. Разметка, вписанная в кейс
 * строкой, пережила бы этот переезд молча — она и была бы вчерашним ответом
 * компонента, а не сегодняшним (ловушка «верное не о том»,
 * docs/writing-checks.md). Собранная отсюда, она краснеет от одной правки
 * `Tabs.tsx` — это проверено мутацией.
 *
 * Через фикстуру снять нельзя: `Tabs.fixture.tsx` берёт начинку слота из
 * позиций (`slots`), а `render-preview.mjs` позиции не разрешает и падает на
 * `slots.trailing`. Пропсы задаются здесь напрямую — начинка та же по смыслу
 * (настоящая кнопка системы), а не пересказ.
 */
async function ssrMarkup(entry) {
  const built = await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, sourcefile: 'measure-ssr.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22',
    jsx: 'automatic', logLevel: 'silent',
    plugins: [
      // Импорты в исходниках стоят с расширением `.js` (так требует
      // `moduleResolution` пакета), на диске лежит `.ts`/`.tsx`.
      {
        name: 'ts-ext',
        setup(build) {
          build.onResolve({ filter: /^\.\.?\// }, (args) => {
            if (!args.path.endsWith('.js')) return null
            const base = resolve(args.resolveDir, args.path.slice(0, -3))
            for (const ext of ['.tsx', '.ts']) if (existsSync(base + ext)) return { path: base + ext }
            return null
          })
        },
      },
      // CSS в Node не грузится и разметке не нужен: снимаем структуру, а
      // пиксели меряет браузер по `dist/src/styles.css`, как и все прочие кейсы.
      {
        name: 'css-stub',
        setup(build) {
          build.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'css-stub' }))
          build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({ contents: '', loader: 'js' }))
        },
      },
    ],
    // `react-dom/server` — CJS и внутри зовёт `require`. В ESM-бандле шим
    // esbuild такой вызов роняет; свой `require` из `node:module` его лечит.
    banner: { js: "import { createRequire } from 'node:module'\nconst require = createRequire(import.meta.url)" },
  })
  const dir = mkdtempSync(join(tmpdir(), 'ds-measure-ssr-'))
  const file = join(dir, 'entry.mjs')
  writeFileSync(file, built.outputFiles[0].text)
  try { await import(pathToFileURL(file).href) } finally { rmSync(dir, { recursive: true, force: true }) }
  return globalThis.__DS_MEASURE_SSR__
}

/**
 * Бар вкладок со слотом в конце: шесть вкладок и настоящая кнопка системы.
 *
 * Шесть — не «побольше»: на кадре 440 (пол, JIG-29 — было 360 до переезда)
 * они обязаны НЕ ВЛЕЗТЬ (иначе кейс мерит бар, у которого переполнения нет
 * вовсе), а на 768 обязаны влезть вместе со слотом (иначе «места вдоволь» не
 * отличить от «места нет»). Оба числа проверяются самими утверждениями, а не
 * подразумеваются.
 *
 * `is-scrollable` ДОПИСЫВАЕТСЯ ЗДЕСЬ, и это надо назвать вслух: класс вешает
 * рантайм (`updateOverflow` по `ResizeObserver`), а плоская страница JS не
 * исполняет. Замена объявлена с проверкой совпадения — селектор, ни на что не
 * попавший, это сломанный кейс, а не чистая разметка.
 */
async function tabsTrailingBarHtml() {
  const markup = await ssrMarkup(`
import { renderToStaticMarkup } from 'react-dom/server'
import { Tabs } from ${JSON.stringify(join(ROOT, 'src/components/Tabs/Tabs.tsx'))}
import { Button } from ${JSON.stringify(join(ROOT, 'src/components/Button/Button.tsx'))}

const LABELS = ['Все', 'В работе', 'Готово', 'Архив', 'Отменённые', 'Черновики']
const tabs = LABELS.map((label, i) => ({ id: 't' + i, label }))
globalThis.__DS_MEASURE_SSR__ = renderToStaticMarkup(
  <Tabs
    tabs={tabs}
    selectedId="t0"
    trailing={<Button size="sm" variant="secondary">Новая</Button>}
  />,
)
`)
  const marker = 'class="ds-tabs__list"'
  if (!markup.includes(marker)) {
    console.error('FAIL: в разметке Tabs нет `.ds-tabs__list` — снимок с компонента разошёлся с кейсом')
    process.exit(1)
  }
  return markup.replace(marker, 'class="ds-tabs__list is-scrollable"')
}

const TABS_TRAILING_BAR = await tabsTrailingBarHtml()

/**
 * Замер бара: документ, лента, слот. Общий для обоих кадров — 440 и 768
 * (JIG-29, было 360 и 768 до переезда пола) отвечают на разные вопросы ОДНОЙ
 * И ТОЙ ЖЕ разметкой, и второй замер развёл бы их незаметно.
 */
const tabsTrailingMeasure = () => {
  const box = (el) => {
    const b = el.getBoundingClientRect()
    return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1) }
  }
  const de = document.documentElement
  const bar = document.querySelector('.ds-tabs')
  const list = document.querySelector('.ds-tabs__list')
  const slot = document.querySelector('.ds-tabs__trailing')
  return {
    doc: { scroll: de.scrollWidth, client: de.clientWidth },
    bar: bar ? box(bar) : null,
    list: list ? { ...box(list), scroll: list.scrollWidth, client: list.clientWidth } : null,
    slot: slot ? box(slot) : null,
    // Место в дереве — то самое, что чинит задача. Числа выше без него
    // проходят и на старой раскладке при широком кадре.
    slotInTablist: !!(slot && slot.closest('[role="tablist"]')),
    slotIsLastInBar: !!(bar && slot && bar.lastElementChild === slot),
    tabs: document.querySelectorAll('[role="tab"]').length,
  }
}

/**
 * Кадры, на которых меряется полоса со слотом В ПРОКРУЧЕННОМ СОСТОЯНИИ
 * (DS-284).
 *
 * БЫЛО [360, 380, 400, 440] — диапазон, где приёмка DS-236 увидела дефект
 * глазами: на 360 документ уезжал вбок на 57px, на 440 уже нет. Второй круг
 * JIG-29 (решение владельца) снял грандфазер «дефект однажды увидели глазами»
 * из CLAUDE.md — находки ниже пола 440 больше не остаются точками ни по
 * какому доводу. 360/380/400 СНЯТЫ; 440 остаётся один, и это не потеря
 * предмета: сам случай не про конкретное число 57px, а про то, что бар не
 * отдаёт странице боковую прокрутку и стрелки ведут себя правильно при
 * ПЕРЕПОЛНЕННОЙ ленте — санитар (`ни на одной шкале лента не переполнена`)
 * уже требовал этого на 440 и раньше, до переезда, и держится (замерено
 * `npm run measure`). Кадр здесь НАСТОЯЩИЙ вьюпорт (`viewport`), а не ширина
 * `body`: предмет — `scrollWidth` документа, и он смотрит на вьюпорт.
 */
const TABS_ARROW_FRAMES = [440]

/**
 * Полоса со слотом в трёх положениях ленты: начало, середина, конец.
 *
 * Три положения — и есть предмет: до DS-284 замер снимался только с
 * начала, а стрелка «к началу» появлялась ПОСЛЕ первого пролистывания и
 * отнимала у слота свои 54px на шкале 1.5. То есть кейс, который смотрит одно
 * состояние, отвечает верно и не о том: раскладка в нём зависит от того, где
 * стоит лента, а спрашивают его только про одно её положение.
 *
 * Середина — 200px хода или его половина, если ход короче: на широком кадре
 * лента листается меньше, чем на 200, и жёсткие 200 слили бы середину с
 * концом молча. 200 — число владельца из замера на кадре 360.
 */
const tabsArrowsMeasure = async () => {
  const hosts = [...document.querySelectorAll('[data-tabs]')]
  for (const el of hosts) WB.mountTabs(el, { trailing: true })
  await document.fonts.ready
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  // Снимок всего, что меняется по кругу «ResizeObserver → setState → стрелки →
  // новый бокс ленты». Ждём, пока он не перестанет меняться, а не
  // фиксированное число кадров: событие прокрутки приезжает отдельным тиком.
  const shape = () => hosts.map((el) => {
    const l = el.querySelector('.ds-tabs__list')
    const a = [...el.querySelectorAll('.ds-tabs__scroller')].map((b) => (b.disabled ? 'd' : 'e')).join('')
    return `${l ? l.clientWidth : -1}/${a}/${l ? Math.round(l.scrollLeft) : -1}`
  }).join(',')
  const settle = async () => {
    let prev = null
    for (let i = 0; i < 60; i++) {
      await frame()
      const now = shape()
      if (now === prev && i >= 3) return
      prev = now
    }
  }
  await settle()
  const box = (el) => {
    const b = el.getBoundingClientRect()
    return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1) }
  }
  const snap = () => ({
    doc: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
    hosts: hosts.map((el) => {
      const list = el.querySelector('.ds-tabs__list')
      const slot = el.querySelector('.ds-tabs__trailing')
      const arrows = [...el.querySelectorAll('.ds-tabs__scroller')]
      return {
        sc: +el.dataset.sc, host: el.clientWidth,
        list: list
          ? { ...box(list), client: list.clientWidth, scroll: list.scrollWidth,
              at: +list.scrollLeft.toFixed(1), max: +(list.scrollWidth - list.clientWidth).toFixed(1) }
          : null,
        slot: slot ? box(slot) : null,
        arrows: arrows.map((b) => ({ start: b.classList.contains('ds-tabs__scroller--start'), off: b.disabled })),
        // Сколько бар отдал СТРАНИЦЕ. С `overflow-x: clip` у `.ds-tabs` это
        // ноль при любом содержимом слота; без него — ровно то, на что
        // жаловалась приёмка.
        over: +(el.scrollWidth - el.clientWidth).toFixed(1),
        tabs: el.querySelectorAll('[role="tab"]').length,
      }
    }),
  })
  const out = { 'начало': null, 'середина': null, 'конец': null }
  for (const el of hosts) { const l = el.querySelector('.ds-tabs__list'); if (l) l.scrollLeft = 0 }
  await settle()
  out['начало'] = snap()
  for (const el of hosts) {
    const l = el.querySelector('.ds-tabs__list')
    if (l) l.scrollLeft = Math.min(200, Math.max(1, Math.round((l.scrollWidth - l.clientWidth) / 2)))
  }
  await settle()
  out['середина'] = snap()
  for (const el of hosts) { const l = el.querySelector('.ds-tabs__list'); if (l) l.scrollLeft = 1e6 }
  await settle()
  out['конец'] = snap()
  return out
}

/** Утверждения к трём положениям ленты. Общие на все четыре кадра. */
const tabsArrowsExpect = (m) => {
  const states = ['начало', 'середина', 'конец']
  // Литералом, а не длиной списка, который строил разметку: счёт с того же
  // массива согласен сам с собой (ловушка 7, docs/writing-checks.md).
  for (const n of states) {
    if (!m[n] || m[n].hosts.length !== 2) return `в состоянии «${n}» хостов ${m[n] ? m[n].hosts.length : 0} вместо 2 — две шкалы на кадр`
  }
  const frame = m['начало'].doc.client
  const bad = []
  for (const n of states) {
    const s = m[n]
    // Предмет 1: документ не ездит вбок НИ В ОДНОМ положении ленты.
    if (s.doc.scroll !== s.doc.client) {
      bad.push(`«${n}»: документ уехал вбок — scrollWidth ${s.doc.scroll} при clientWidth ${s.doc.client}`)
    }
    for (const h of s.hosts) {
      const at = `«${n}» ×${h.sc}`
      // Хост обязан быть шириной в кадр: без этой строки случай, потерявший
      // `viewport`, прошёл бы на общих 900px, ничего не проверив.
      if (h.host !== frame) { bad.push(`${at}: хост ${h.host} при кадре ${frame} — ширина до страницы не доехала`); continue }
      if (h.tabs !== 4) { bad.push(`${at}: вкладок ${h.tabs} вместо 4 — набор разошёлся с фикстурой`); continue }
      if (!h.list || !h.slot) { bad.push(`${at}: бар не смонтировался`); continue }
      if (h.over > 0.5) bad.push(`${at}: бар отдал странице ${h.over}px боковой прокрутки — лишнее не режется границей бара`)
      // Лента влезла целиком — стрелок нет и быть не должно, дальше нечего
      // спрашивать.
      if (h.list.scroll <= h.list.client + 1) {
        if (h.arrows.length) bad.push(`${at}: стрелок ${h.arrows.length} при ленте, которая влезла целиком`)
        continue
      }
      // Предмет 2: при переполнении стрелки ВСЕГДА ОБЕ, крайняя — приглушена,
      // а не удалена.
      if (h.arrows.length !== 2) {
        bad.push(`${at}: стрелок ${h.arrows.length} вместо двух при переполненной ленте (лента ${h.list.client}, содержимое ${h.list.scroll})`)
        continue
      }
      const start = h.arrows.find((a) => a.start)
      const end = h.arrows.find((a) => !a.start)
      if (!start || !end) { bad.push(`${at}: обе стрелки одного края`); continue }
      // Приглушена — РОВНО та, чей край достигнут. Утверждение равенством, а
      // не «в начале первая выключена»: иначе «выключить обе навсегда» прошло
      // бы (ловушка 6 — состояния обязаны быть РАЗЛИЧИМЫ).
      if ((h.list.at <= 1) !== start.off) {
        bad.push(`${at}: лента на ${h.list.at}, а стрелка «к началу» ${start.off ? 'приглушена' : 'жива'}`)
      }
      if ((h.list.at >= h.list.max - 1) !== end.off) {
        bad.push(`${at}: лента на ${h.list.at} из ${h.list.max}, а стрелка «к концу» ${end.off ? 'приглушена' : 'жива'}`)
      }
    }
  }
  // Предмет 3: раскладка не зависит от положения прокрутки — ни слот, ни
  // лента не прыгают и не меняют ширину.
  for (let i = 0; i < 2; i++) {
    const sc = m['начало'].hosts[i].sc
    for (const [key, human] of [['slot', 'слот'], ['list', 'лента']]) {
      const vals = states.map((n) => m[n].hosts[i][key])
      if (vals.some((v) => !v)) continue
      const l = vals.map((v) => v.l)
      const w = vals.map((v) => (key === 'list' ? v.client : v.w))
      if (Math.max(...l) - Math.min(...l) > 0.5) bad.push(`×${sc}: ${human} прыгает от пролистывания — левый край ${l.join(' → ')}`)
      if (Math.max(...w) - Math.min(...w) > 0.5) bad.push(`×${sc}: ${human} меняет ширину от пролистывания — ${w.join(' → ')}`)
    }
  }
  // Санитары: без них случай зелен там, где мерить было нечего.
  if (!m['начало'].hosts.some((h) => h.list && h.list.scroll > h.list.client + 1)) {
    bad.push('ни на одной шкале лента не переполнена — на этом кадре случай не про пролистывание вовсе')
  }
  if (!m['середина'].hosts.some((h, i) => {
    const s = m['начало'].hosts[i].list, mid = h.list, e = m['конец'].hosts[i].list
    return s && mid && e && mid.at > s.at + 0.5 && mid.at < e.at - 0.5
  })) {
    bad.push('ни на одной шкале середина не легла между началом и концом — три состояния выродились в два')
  }
  return bad.length === 0 || bad.join('; ')
}

/**
 * Кадры для бара сбоку (DS-285) и паддинг кадра верстака.
 *
 * Ширина ХОСТА — кадр минус 60: по 30px `padding` даёт случаю сам кадр
 * верстака (`workbench/frame.css`).
 *
 * БЫЛО [360, 440, 900]. Второй круг JIG-29 (решение владельца) отменил
 * грандфазер «дефект однажды увидели глазами» из CLAUDE.md, и 360 СНЯТ:
 * замер владельца на «кадре 360» (контейнер 300 — лента 194.7 плюс панель
 * 105.3) не остаётся точкой ни по какому доводу, хотя сценарий «ниже порога
 * лента приходит к верхней» жил только на нём (rows 1 из 4 при шкале 1.5;
 * на 440 — хост 380 — уже rows 4 из 4, замерено `npm run measure`).
 *
 * 440 ОСТАЁТСЯ, НО ЕГО ДОВОД ПЕРЕВЁРНУТ (JIG-29): без 360 «пришёл к верхней»
 * никем не демонстрируется, и случай на 440 перестал бы что-либо утверждать
 * про этот угол, если бы не собственный пин. Он ЗАВЕДЁН заново, полярностью
 * от 900 (там пин требует «не столбец» на широком просторе): на 440 (пол
 * системы, DS-380) пин требует ТО ЖЕ — «не столбец» — и это ценнее пустой
 * точки: именно 440 — граница, где старый дефект (столбец на телефоне) обязан
 * оставаться похороненным навсегда, и регресс сюда красит гейт первым.
 */
const TABS_SIDE_FRAMES = [440, 900]

/**
 * Бар сбоку: кто сколько взял и как легли вкладки.
 *
 * `rows` — число РЯДОВ вкладок: у вертикальной ленты их четыре, у пришедшей к
 * `top` — один. Спрашивается именно раскладка, а не класс и не `data-position`:
 * атрибут может остаться прежним, а полоса всё равно обязана лечь в строку.
 */
const tabsSideMeasure = async () => {
  const hosts = [...document.querySelectorAll('[data-tabs-side]')]
  for (const el of hosts) WB.mountTabsLayout(el, { position: 'left' })
  await document.fonts.ready
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  let prev = null
  for (let i = 0; i < 60; i++) {
    await frame()
    const now = hosts.map((el) => {
      const bar = el.querySelector('.ds-tabs')
      return `${bar ? Math.round(bar.getBoundingClientRect().width) : -1}/${bar ? bar.dataset.position : '-'}`
    }).join(',')
    if (now === prev && i >= 3) break
    prev = now
  }
  const box = (el) => {
    const b = el.getBoundingClientRect()
    return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1), t: +b.top.toFixed(1) }
  }
  return {
    doc: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
    hosts: hosts.map((el) => {
      const bar = el.querySelector('.ds-tabs')
      const panel = el.querySelector('.ds-tabs__panel')
      const tabs = [...el.querySelectorAll('[role="tab"]')]
      // Пол читаемости колонки — через КАСКАД, а не арифметикой в кейсе:
      // `--ds-w-col-min` объявлен как `calc(4rem * var(--ds-ui-scale))`, и
      // `getPropertyValue` отдал бы эту строку, а не пиксели.
      const probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--ds-w-col-min)'
      el.appendChild(probe)
      const colMin = +probe.getBoundingClientRect().width.toFixed(1)
      probe.remove()
      const cs = panel ? getComputedStyle(panel) : null
      return {
        sc: +el.dataset.sc, host: el.clientWidth, colMin,
        position: bar ? bar.dataset.position : null,
        bar: bar ? box(bar) : null,
        panel: panel
          ? { ...box(panel), client: panel.clientWidth, scroll: panel.scrollWidth,
              inner: +(panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)).toFixed(1) }
          : null,
        rows: new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top))).size,
        tabs: tabs.length,
        over: +(el.scrollWidth - el.clientWidth).toFixed(1),
      }
    }),
  }
}

/** Утверждения к бару сбоку. Общие на все три кадра. */
const tabsSideExpect = (m) => {
  if (m.hosts.length !== 2) return `хостов ${m.hosts.length} вместо 2 — две шкалы на кадр`
  const bad = []
  if (m.doc.scroll !== m.doc.client) {
    bad.push(`документ уехал вбок — scrollWidth ${m.doc.scroll} при clientWidth ${m.doc.client}`)
  }
  for (const h of m.hosts) {
    const at = `×${h.sc}`
    if (h.tabs !== 4) { bad.push(`${at}: вкладок ${h.tabs} вместо 4 — набор разошёлся с фикстурой`); continue }
    if (!h.bar || !h.panel) { bad.push(`${at}: раскладка не смонтировалась`); continue }
    if (h.over > 0.5) bad.push(`${at}: раскладка отдала странице ${h.over}px боковой прокрутки`)
    const stacked = h.rows === 1
    if (!stacked && h.rows !== h.tabs) {
      bad.push(`${at}: вкладки легли в ${h.rows} ряд(а) при ${h.tabs} вкладках — это ни столбец, ни строка`)
    }
    if (stacked) {
      // Пришли к `top`: бар во всю ширину, тело под ним.
      if (Math.abs(h.bar.w - h.host) > 0.5) bad.push(`${at}: лента пришла к строке, а бар ${h.bar.w} при контейнере ${h.host} — он не во всю ширину`)
      if (h.panel.t < h.bar.t + 1) bad.push(`${at}: лента в строке, а тело осталось сбоку (верх бара ${h.bar.t}, верх тела ${h.panel.t})`)
    } else {
      // Остались столбцом — тогда обещание порога: телу достаётся не меньше
      // заявленного системой пола текстовой колонки.
      if (h.panel.inner < h.colMin - 0.5) {
        bad.push(`${at}: телу осталось ${h.panel.inner} при поле колонки ${h.colMin} (лента ${h.bar.w} из ${h.host}) — порог не сработал`)
      }
    }
  }
  return bad.length === 0 || bad.join('; ')
}

/**
 * Чем кнопка ВЫГЛЯДИТ кнопкой: коробка, рамка, кегль и тон (DS-359).
 *
 * Набор закрыт и перечислен, а не «все свойства»: полный список computed
 * различался бы у двух узлов всегда (`display` у ряда полосы — `flex`, у
 * триггера меню — `inline-flex`, и это законно, потому что ряд раздаёт место
 * флексом, а триггер стоит в потоке сам). Сравниваются два элемента МЕЖДУ
 * СОБОЙ, а не с числами в кейсе: прибитые 28px протухли бы на первой смене
 * `--ds-h-compact` и на любой шкале, а вопрос у случая другой — «отличается ли
 * «Ещё» от соседа», и ответ на него от самих чисел не зависит.
 */
const BUTTON_LOOK = [
  'height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'font-size', 'font-weight', 'line-height',
  'color', 'background-color',
]

/**
 * Точки, на которых «Ещё» сравнивается с соседним действием полосы.
 *
 * Один список на разметку И на наведение: хост, дописанный в `html` и забытый в
 * `hoverStyles`, просто не меряется под курсором, и случай остаётся зелёным
 * ровно там, где его расширили (тот же довод, что у обхода CommandBar по
 * разметке).
 *
 * Ширины разные у разных шкал и компонентов, и это не подгонка под зелёное, а
 * условие случая: на точке обязаны одновременно выполниться ДВА требования —
 * хвост свернулся (иначе «Ещё» в полосе нет вовсе) и в ряду остался хотя бы
 * один видимый `ghost` (иначе «Ещё» не с чем сравнивать). Оба проверяются
 * утверждениями, а не подразумеваются.
 *
 * ШИРИНЫ CommandBar ПОДНЯТЫ 360 → 440 (JIG-29, второй круг, решение
 * владельца: «отовсюду значит отовсюду», грандфазер CLAUDE.md отменён).
 * Ширина здесь — не hostOf, а сырой div внутри `viewport: 1500` (контейнер,
 * не имитация экрана), но владелец решил поднять и такие. На 440 оба
 * требования по-прежнему держатся (замерено `npm run measure`): хвост
 * сворачивается, ghost остаётся.
 */
const MORE_POINTS = ['light', 'dark'].flatMap((theme) => [
  { theme, sc: '1', c: 'CommandBar', id: 'many', w: 440 },
  { theme, sc: '1', c: 'AppBar', id: 'crowded', w: 520 },
  { theme, sc: '1.5', c: 'CommandBar', id: 'many', w: 440 },
  { theme, sc: '1.5', c: 'AppBar', id: 'crowded', w: 760 },
])

/**
 * Точки, на которых меню сверяется со своим триггером.
 *
 * Порядок в ряду — часть замера: выравненные по `start` стоят СЛЕВА, по `end` —
 * справа. `useAnchoredPosition` поджимает меню к краю вьюпорта
 * (`--ds-anchor-inset`), и точка, у которой поджим сработал, мерила бы поджим,
 * а не выравнивание. Что он не сработал ни разу, случай проверяет отдельно —
 * но расставить точки так, чтобы вопрос вообще не возникал, дешевле.
 *
 * Ширины 300/360 подняты до 440 (JIG-29, второй круг, решение владельца —
 * контейнеры тоже поднимаются). Поджим по-прежнему не срабатывает ни на одной
 * точке (замерено `npm run measure`).
 */
const ANCHOR_POINTS = ['1', '1.5'].flatMap((sc) => [
  { sc, c: 'DropdownMenu', id: 'own-trigger', w: 440, align: 'start' },
  { sc, c: 'DropdownMenu', id: 'bare-trigger', w: 440, align: 'start' },
  { sc, c: 'CommandBar', id: 'many', w: 440, align: 'end' },
  { sc, c: 'AppBar', id: 'crowded', w: sc === '1' ? 520 : 440, align: 'end' },
])

const CASES = [
  {
    name: 'версия читается со страницы',
    why: 'потребитель ставит ПРИБИТЫЙ тег и сам не обновляется, поэтому «а он на свежем?» — первое, что нужно знать перед разговором о дефекте: половина замечаний к чужой странице может оказаться починенной три версии назад. До DS-215 ответить со страницы было нечем: ни в `styles.bundle.css`, ни в `tokens.css` строки версии не было, а `package.json` до рантайма не доезжает',
    html: '<div id="v">версия</div>',
    // НАСТОЯЩИЙ getComputedStyle в настоящем браузере, а не разбор текста
    // листа. Предмет утверждения — «страница ОТВЕТИТ», и отвечает на него
    // разбор CSS браузером: голое `4.2.0` не значение CSS, объявление с ним
    // невалидно, и `getPropertyValue` вернёт пустую строку МОЛЧА. Текстовый
    // гейт (`version-token`) такую запись поймал бы формой, но подтвердить,
    // что кавычки нужны имённо браузеру, может только браузер.
    measure: () => ({
      value: getComputedStyle(document.documentElement).getPropertyValue('--ds-version').trim(),
      // Тот же вопрос со стороны потребителя: он читает не с `:root`, а с
      // любого узла — переменная наследуется, и если её объявить в теме, на
      // светлой странице ответа не будет.
      fromNode: getComputedStyle(document.getElementById('v')).getPropertyValue('--ds-version').trim(),
    }),
    expect: (m) => {
      if (!m.value) return 'страница вернула ПУСТОЕ — объявление невалидно (голое число вместо строки?)'
      const want = `"${PKG_VERSION}"`
      if (m.value !== want) return `страница говорит ${m.value}, а пакет ${want}`
      if (m.fromNode !== m.value) return `с обычного узла пришло ${m.fromNode || '(пусто)'} вместо ${m.value}`
      return true
    },
  },
  {
    name: 'зазор и поджим оверлеев читаются ЧИСЛОМ и едут со шкалой',
    why: 'до DS-243 они были нулевыми у ВСЕХ четырёх компонентов с самого DS-240, и никто этого не видел. `--ds-anchor-gap` объявлен токеном (`var(--ds-space-1)`), а читает его JS через `parseFloat(getComputedStyle(...).getPropertyValue(...))`. Вычисленное значение НЕЗАРЕГИСТРИРОВАННОЙ custom property — не длина, а последовательность токенов: замерено `"calc(0.125rem * 1)"`, `parseFloat` даёт NaN, и хук честно брал фолбэк 0. Панели липли к триггеру, у края экрана касались его, а CSS-фолбэки вроде `bottom: calc(100% + var(--ds-anchor-gap))` при этом работали — подстановка в CSS удаётся там, где не удаётся разбор в JS, и два пути к одному числу разошлись молча. Держит теперь `@property` в `tokens/tokens.css`. Случай стоит ЗДЕСЬ, а не в vitest, и это не удобство: jsdom не вычисляет custom properties и не знает `@property` — там утверждение либо неверно, либо тривиально. Случаи в `useAnchoredPosition.test.tsx` подставляют `gap="4px"` ЛИТЕРАЛОМ, то есть форму значения, которой система не производит НИКОГДА, и потому ноль пропустили: они держат арифметику, а этот — источник числа',
    width: 900,
    // Подменю SideNav лежит ВНУТРИ панели, а не рядом, и разметка это повторяет:
    // случай мерит ТОТ каскад, в котором узел живёт, а не похожий.
    html: ['1', '1.5'].map((sc) => {
      const k = sc.replace('.', '_')
      return `<div class="ds-scale" style="--ds-ui-scale: ${sc}">
        <div class="ds-dropdown__menu" id="dd-${k}"></div>
        <div class="ds-popover__panel" id="pv-${k}"></div>
        <span class="ds-tooltip__bubble" id="tt-${k}">Провести</span>
        <nav class="ds-sidenav ds-sidenav--collapsed">
          <div class="ds-sidenav__flyout" id="sn-${k}"></div>
        </nav>
      </div>`
    }).join(''),
    // Читается ТЕМ ЖЕ выражением, что и в `useAnchoredPosition`: случай,
    // разбирающий строку иначе, утверждал бы про свой разбор, а не про хук.
    measure: () => {
      const read = (id) => {
        const cs = getComputedStyle(document.getElementById(id))
        return {
          gapRaw: cs.getPropertyValue('--ds-anchor-gap').trim(),
          gap: parseFloat(cs.getPropertyValue('--ds-anchor-gap')),
          inset: parseFloat(cs.getPropertyValue('--ds-anchor-inset')),
        }
      }
      const out = {}
      for (const k of ['1', '1_5']) for (const c of ['dd', 'pv', 'tt', 'sn']) out[`${c}-${k}`] = read(`${c}-${k}`)
      return out
    },
    expect: (m) => {
      const NAMES = { dd: 'DropdownMenu', pv: 'Popover', tt: 'Tooltip', sn: 'SideNav' }
      for (const c of Object.keys(NAMES)) {
        const one = m[`${c}-1`]
        if (!Number.isFinite(one.gap)) {
          return `${NAMES[c]}: зазор не читается числом — пришло ${JSON.stringify(one.gapRaw)}`
        }
        if (one.gap <= 0) return `${NAMES[c]}: зазор ${one.gap}, то есть панель липнет к якорю`
        if (!(one.inset > 0)) return `${NAMES[c]}: поджим ${one.inset}, то есть панель касается края экрана`
        // Полтора раза — иначе число прибито, и на шкале потребителя (1.15)
        // зазор был бы неверен. Проверять надо ОТНОШЕНИЕМ:
        // абсолютное значение зависит от корневого кегля страницы.
        const big = m[`${c}-1_5`]
        const ratio = big.gap / one.gap
        if (Math.abs(ratio - 1.5) > 0.02) {
          return `${NAMES[c]}: зазор не поехал со шкалой — ${one.gap} и ${big.gap}, отношение ${ratio.toFixed(3)}`
        }
      }
      return true
    },
  },
  {
    name: 'ToggleGroup swatch: кольцо фокуса не накрыто плашкой',
    why: 'кольцо фокуса рисуется на КНОПКЕ, кольцо выбора — на дочерней ПЛАШКЕ, и плашка позиционирована, то есть красится поверх теней родителя (порядок отрисовки CSS 2.1 E.2, шаг 8 против шага 4). Пока их border-box совпадали (22×22, смещение 0,0 — замерено), кольцо фокуса пропадало целиком, а в `mode="single"` стрелка ВЫБИРАЕТ, значит сфокусированный пункт и есть выбранный: обход клавиатурой шёл без единого признака фокуса. Гейт `focus-ring` этого поймать не может по построению — он читает наличие правила с токеном, а не видно ли его. Найдено на ревью DS-245',
    html: `
      <div class="ds-togglegroup ds-togglegroup--swatch" id="fr" role="radiogroup">
        <button type="button" class="ds-togglegroup__item is-active" role="radio" aria-checked="true">
          <span class="ds-togglegroup__swatch" style="--ds-swatch-color: var(--ds-chart-1)"></span></button>
      </div>`,
    measure: () => {
      const btn = document.querySelector('#fr .ds-togglegroup__item')
      const sw = btn.querySelector('.ds-togglegroup__swatch')
      const b = btn.getBoundingClientRect(), s = sw.getBoundingClientRect()
      const outset = Math.max(
        ...[...getComputedStyle(sw).boxShadow.matchAll(/0px 0px 0px (\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])),
        0,
      )
      // Насколько кнопка шире плашки с каждой стороны — та полоса, в которой
      // кольцо фокуса остаётся своим.
      const inset = Math.min(s.left - b.left, s.top - b.top, b.right - s.right, b.bottom - s.bottom)
      return { inset: Math.round(inset * 10) / 10, outset, positioned: getComputedStyle(sw).position }
    },
    expect: (m) => m.positioned !== 'static' && m.outset > 0
      ? (m.inset > m.outset || `плашка отстоит от края кнопки на ${m.inset}px, а её кольцо выходит на ${m.outset}px — кольцо фокуса накрыто`)
      : `случай не различает: position=${m.positioned}, кольцо ${m.outset}px`,
  },
  {
    name: 'ToggleGroup swatch: признак выбора НЕ зависит от цвета плашки',
    why: 'ровно то утверждение, ради которого приём и переделан (DS-245). Рамка снаружи берёт контраст от плашки, то есть от ДАННЫХ потребителя, и обязана отказать на каком-то цвете — у потребителя отказывала на трёх из восьми. Здесь галочка стоит на медальоне цвета поверхности, поэтому её контраст один и тот же на плашке цвета фона и на почти чёрной. Проверяется РАВЕНСТВОМ контрастов на двух противоположных плашках, а не порогом на каждой: порог зелен и у приёма, который просто везучий на выбранной паре цветов',
    html: `
      <div class="ds-togglegroup ds-togglegroup--swatch" id="ext" role="radiogroup">
        <button type="button" class="ds-togglegroup__item is-active" role="radio" aria-checked="true">
          <span class="ds-togglegroup__swatch" id="pale" style="--ds-swatch-color: var(--ds-surface)"></span></button>
        <button type="button" class="ds-togglegroup__item is-active" role="radio" aria-checked="true">
          <span class="ds-togglegroup__swatch" id="ink" style="--ds-swatch-color: var(--ds-text-primary)"></span></button>
      </div>`,
    measure: () => {
      const read = (id) => {
        const el = document.querySelector('#' + id)
        return {
          plate: getComputedStyle(el).backgroundColor,
          medallion: getComputedStyle(el, '::after').backgroundColor,
          tick: getComputedStyle(el, '::before').borderBottomColor,
        }
      }
      return { pale: read('pale'), ink: read('ink') }
    },
    expect: (m) => {
      const c = (a, b) => Math.round(contrastOf(a, b) * 100) / 100
      const pale = c(m.pale.tick, m.pale.medallion)
      const ink = c(m.ink.tick, m.ink.medallion)
      // Плашки ДОЛЖНЫ быть противоположны, иначе равенство ниже ничего не стоит:
      // одинаковые плашки дают одинаковый контраст у любого приёма, включая тот,
      // что сломан.
      const plates = c(m.pale.plate, m.ink.plate)
      if (plates < 7) return `плашки не противоположны (${plates}) — случай не различает`
      if (pale < 4.5) return `галочка на светлой плашке ${pale}`
      return Math.abs(pale - ink) < 0.01
        || `контраст галочки разный: ${pale} на плашке цвета фона против ${ink} на тёмной — признак зависит от данных`
    },
  },
  {
    name: 'ToggleGroup swatch: кольцо выбора не наезжает на соседнюю плашку',
    why: 'кольцо выходит на 4px наружу, а зазор стоял `--ds-space-2` (4px) — просвет между кольцом и соседом выходил −4px, то есть перекрытие. Найдено глазами в верстаке (DS-245): jsdom раскладки не имеет, а гейты классов видят модификатор на месте и молчат. Замер идёт по РЕАЛЬНЫМ прямоугольникам, а не по объявленному `gap`: последний зелен и тогда, когда кольцо шире, чем под него оставлено',
    html: `
      <div class="ds-togglegroup ds-togglegroup--swatch" id="sw" role="radiogroup">
        <button type="button" class="ds-togglegroup__item is-active" role="radio" aria-checked="true">
          <span class="ds-togglegroup__swatch" style="--ds-swatch-color: var(--ds-chart-1)"></span></button>
        <button type="button" class="ds-togglegroup__item" role="radio" aria-checked="false">
          <span class="ds-togglegroup__swatch" style="--ds-swatch-color: var(--ds-chart-2)"></span></button>
      </div>`,
    measure: () => {
      const sw = [...document.querySelectorAll('#sw .ds-togglegroup__swatch')]
      const a = sw[0].getBoundingClientRect()
      const b = sw[1].getBoundingClientRect()
      // Кольцо рисуется тенью и в getBoundingClientRect не входит — его вылет
      // читается из самого box-shadow, а не берётся константой: поправят
      // толщину кольца, не тронув зазор, и замер обязан это увидеть.
      const shadow = getComputedStyle(sw[0]).boxShadow
      const spreads = [...shadow.matchAll(/(-?\d+(?:\.\d+)?)px\s+0px\s*$|0px 0px 0px (\d+(?:\.\d+)?)px/g)]
      const outset = Math.max(...[...shadow.matchAll(/0px 0px 0px (\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])), 0)
      return { gap: Math.round((b.left - a.right) * 10) / 10, outset, spreads: spreads.length }
    },
    expect: (m) => m.outset > 0
      && m.gap - m.outset >= 2
      || `зазор ${m.gap}px против кольца ${m.outset}px — просвет ${Math.round((m.gap - m.outset) * 10) / 10}px`,
  },
  {
    name: 'MetricStrip: dense меняет плотность ячеек',
    why: 'разорванный модификатор оставил один и тот же padding в обоих режимах (1.6.0–1.6.1)',
    html: `
      <ul class="ds-metrics" id="plain"><li class="ds-metrics__cell">
        <div class="ds-metrics__label">Выручка</div><div class="ds-metrics__value">1 240 500</div></li></ul>
      <ul class="ds-metrics ds-metrics--dense" id="dense"><li class="ds-metrics__cell">
        <div class="ds-metrics__label">Выручка</div><div class="ds-metrics__value">1 240 500</div></li></ul>`,
    measure: () => ({
      plain: getComputedStyle(document.querySelector('#plain .ds-metrics__cell')).padding,
      dense: getComputedStyle(document.querySelector('#dense .ds-metrics__cell')).padding,
    }),
    expect: (m) => m.plain !== m.dense || `оба режима дали ${m.plain}`,
  },
  {
    name: 'MetricStrip: одинокая ячейка занимает последний ряд целиком',
    why: 'auto-fit оставлял дорожку цвета сетки рядом с ней — 159px из 320 (историческое число, снято на прежней ширине 320; JIG-29 подняла её до пола 440 — auto-fit-дефект от конкретной ширины не зависит, он про ОДИНОКУЮ ячейку в последнем ряду сетки cols-2 при любой ширине)',
    width: 440,
    html: `<ul class="ds-metrics ds-metrics--cols-2" id="s">
      ${[1, 2, 3].map((i) => `<li class="ds-metrics__cell"><div class="ds-metrics__label">М${i}</div>
        <div class="ds-metrics__value">${i}</div></li>`).join('')}</ul>`,
    measure: () => {
      const ul = document.querySelector('#s')
      const cells = [...ul.children].map((c) => Math.round(c.getBoundingClientRect().width))
      return { last: cells[2], strip: Math.round(ul.getBoundingClientRect().width) }
    },
    expect: (m) => m.last > m.strip * 0.9 || `последняя ${m.last} из ${m.strip}`,
  },
  {
    name: 'Split: полоса прокрутки панели тише разделителя в ОБЕИХ темах',
    why: 'DS-270. Панель прокручивается сама, и нативная полоса встаёт вплотную к разделителю: две параллельные вертикали, в тёмной теме бегунок одного тона с линией. Край принадлежит разделителю — он контрол, и его тон взят порогом на 267, — поэтому тише обязана быть полоса. Мерится КОНТРАСТ бегунка к поверхности против контраста линии к той же поверхности, в каждой теме, а не объявленное значение: `scrollbar-color: auto` тоже «объявлен», и в тёмной он ровно тот дефект. Сосед снизу: бегунок всё ещё виден (≥ 1.2), иначе «тише» достигнуто тем, что полосы нет',
    width: 900,
    html: ['light', 'dark'].map((t) => `
      <div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="background: var(--ds-surface)">
        <div class="ds-split" data-direction="row" style="height:80px">
          <div class="ds-split__pane ds-split__pane--first" id="sp-pane-${t}" style="width:120px"><div style="height:400px">список</div></div>
          <div class="ds-split__bar" id="sp-bar-${t}" role="separator" tabindex="0"></div>
          <div class="ds-split__pane ds-split__pane--second">карточка</div>
        </div>
        <span id="sp-surface-${t}" style="background: var(--ds-surface)"></span>
      </div>`).join(''),
    measure: () => {
      const out = {}
      for (const t of ['light', 'dark']) {
        const cs = (id) => getComputedStyle(document.getElementById(id))
        const pane = document.getElementById(`sp-pane-${t}`)
        out[t] = {
          scrolls: pane.scrollHeight > pane.clientHeight,
          color: cs(`sp-pane-${t}`).scrollbarColor,
          width: cs(`sp-pane-${t}`).scrollbarWidth,
          // Линия разделителя с 277 — его `::before`, тело прозрачное.
          bar: getComputedStyle(document.getElementById(`sp-bar-${t}`), '::before').backgroundColor,
          surface: cs(`sp-surface-${t}`).backgroundColor,
        }
      }
      return out
    },
    expect: (m) => {
      for (const t of ['light', 'dark']) {
        const x = m[t]
        if (!x.scrolls) return `${t}: панель не прокручивается — случай не про что`
        if (x.width !== 'thin') return `${t}: scrollbar-width ${x.width}, а не thin`
        const thumb = (x.color.match(/rgba?\([^)]*\)/) || [])[0]
        if (!thumb) return `${t}: цвет бегунка не задан (${x.color}) — браузерный, в тёмной он тона разделителя`
        const kThumb = contrastOf(thumb, x.surface), kBar = contrastOf(x.bar, x.surface)
        if (kThumb < 1.2) return `${t}: бегунок ${thumb} к поверхности ${kThumb.toFixed(2)} — полосы не видно`
        if (!(kBar - kThumb >= 1)) return `${t}: бегунок ${kThumb.toFixed(2)} против разделителя ${kBar.toFixed(2)} — полоса не тише линии`
      }
      return true
    },
  },
  {
    name: 'Split: между полосой прокрутки и линией разделителя есть просвет, у разделителя есть ручка',
    why: 'DS-277, пересмотр 270. Линия разделителя 1 px стояла ВПЛОТНУЮ к жёлобу полосы прокрутки панели (зазор 0) и читалась его частью: владелец на приёмке 276 — «визуально не понять, что эту полоску можно тянуть». Тон (270) этого не закрыл; не хватало просвета и формы. Разделитель теперь — прозрачная полоса (с DS-326 на полу цели `--ds-target-min`), линия 1 px по центру и ручка посередине. Мерится расстояние от края панели (там кончается её жёлоб) до ЛИНИИ, а не до тела разделителя: тело прозрачное, и «зазор до тела» был бы нулём при любой правке. Ручка обязана быть ШИРЕ линии поперёк оси и короче её вдоль — иначе это вторая линия, а не ручка. Обе ориентации и обе шкалы: `column` тоже рисуется, и форма там повёрнута',
    width: 900,
    html: ['row', 'column'].flatMap((dir) => ['1', '1.5'].map((sc) => `
      <div class="ds-root ds-scale" style="--ds-ui-scale:${sc}; background: var(--ds-surface)">
        <div class="ds-split" data-direction="${dir}" style="height:${dir === 'row' ? 120 : 240}px" data-case="${dir}-${sc}">
          <div class="ds-split__pane ds-split__pane--first" style="flex-basis:${dir === 'row' ? 160 : 100}px"><div style="height:600px;width:${dir === 'row' ? 'auto' : '1200px'}">список</div></div>
          <div class="ds-split__bar" role="separator" tabindex="0"></div>
          <div class="ds-split__pane ds-split__pane--second">карточка</div>
        </div>
      </div>`)).join(''),
    measure: () => [...document.querySelectorAll('[data-case]')].map((root) => {
      const row = root.dataset.direction === 'row'
      const pane = root.querySelector('.ds-split__pane--first')
      const bar = root.querySelector('.ds-split__bar')
      const p = pane.getBoundingClientRect(), b = bar.getBoundingClientRect()
      const px = (el, pseudo, prop) => parseFloat(getComputedStyle(el, pseudo)[prop])
      const lineAcross = px(bar, '::before', row ? 'width' : 'height')
      const gripAcross = px(bar, '::after', row ? 'width' : 'height')
      const gripAlong = px(bar, '::after', row ? 'height' : 'width')
      const barAcross = row ? b.width : b.height
      const barAlong = row ? b.height : b.width
      // Центр линии — центр тела (`left: 50%` + `translate(-50%)`).
      const lineStart = (row ? b.left : b.top) + barAcross / 2 - lineAcross / 2
      // Полоса прокрутки в headless — overlay, жёлоба нет, и она рисуется у
      // края панели поверх содержимого: край панели и есть её край.
      const scrolls = row ? pane.scrollHeight > pane.clientHeight : pane.scrollWidth > pane.clientWidth
      return {
        at: root.dataset.case, scrolls,
        gap: +(lineStart - (row ? p.right : p.bottom)).toFixed(2),
        barAcross: +barAcross.toFixed(2), barAlong: +barAlong.toFixed(2),
        lineAcross, gripAcross, gripAlong,
        lineBg: getComputedStyle(bar, '::before').backgroundColor,
        gripBg: getComputedStyle(bar, '::after').backgroundColor,
        // Размеры псевдоэлемента вычисляются и при `display: none` — без этих
        // двух полей спрятанная ручка проходила случай (мутация 277).
        gripShown: getComputedStyle(bar, '::after').display !== 'none' && getComputedStyle(bar, '::after').content !== 'none',
        lineShown: getComputedStyle(bar, '::before').display !== 'none' && getComputedStyle(bar, '::before').content !== 'none',
      }
    }),
    expect: (m) => {
      const bad = []
      for (const r of m) {
        const sc = +r.at.split('-')[1]
        // Сосед: полоса прокрутки у панели есть — иначе «просвет до жёлоба» не о том.
        if (!r.scrolls) { bad.push(`${r.at}: панель не прокручивается к разделителю — случай не про что`); continue }
        if (!(r.gap >= 3 * sc)) bad.push(`${r.at}: от жёлоба до линии ${r.gap}px < ${3 * sc} — линия стоит вплотную к полосе прокрутки`)
        if (!r.lineShown || !r.gripShown) bad.push(`${r.at}: линия ${r.lineShown ? 'видна' : 'не рисуется'}, ручка ${r.gripShown ? 'видна' : 'не рисуется'}`)
        if (r.lineAcross !== 1) bad.push(`${r.at}: линия ${r.lineAcross}px поперёк, а не 1`)
        if (!(r.gripAcross >= 3 * r.lineAcross)) bad.push(`${r.at}: ручка ${r.gripAcross}px поперёк при линии ${r.lineAcross} — ручки нет, есть вторая линия`)
        if (!(r.gripAlong <= r.barAlong / 3)) bad.push(`${r.at}: ручка ${r.gripAlong}px вдоль при разделителе ${r.barAlong} — это полоса, а не ручка`)
        if (!(r.gripAcross < r.barAcross)) bad.push(`${r.at}: ручка ${r.gripAcross}px не помещается в разделитель ${r.barAcross}`)
        if (r.lineBg !== r.gripBg || /rgba\(0, 0, 0, 0\)|transparent/.test(r.lineBg)) bad.push(`${r.at}: линия ${r.lineBg}, ручка ${r.gripBg} — один контрол обязан быть одного тона и видимым`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Split: разделитель идёт ЗА КУРСОРОМ на любой шкале — ход мыши 60 px двигает его на 60 px',
    why: 'DS-343. Размер первого пейна хранится в единицах шкалы и рисуется как `calc(<n>px * var(--ds-ui-scale))`, а ход мыши приходит в CSS px — и обработчик складывал одно с другим. Сумма умножалась на шкалу целиком, поэтому разделитель шёл в шкалу раз быстрее курсора: +60 мыши давали +69 на 1.15 (шкала потребителя) и +90 на 1.5, хват уезжал из-под указателя. Мерится ПОЛОЖЕНИЕ разделителя в странице до и после, а не число в состоянии: число было «верным» и при дефекте, врало произведение. jsdom тут бесполезен — `calc` он не вычисляет. Сосед обязателен: пейн на шкале 1.5 обязан быть в 1.5 раза шире, чем на 1, иначе шкала не доехала и «идёт за курсором» верно по пустой причине. Обе оси и оба направления хода: знак и ось — отдельные ветки обработчика',
    width: 900,
    bundle: 'scripts/measure-split.tsx',
// Хост 800 × 600, а не впритык: первая панель `flex: 0 1 auto` (DS-326)
    // упирается в контейнер, и на 1.5 пейн 300 + ход 60 + полоса 24 = 384. При
    // высоте 400 запас был 16 px — любая прибавка у полосы или корня упёрла бы
    // пейн в потолок, и случай покраснел бы словами «хват уезжает», то есть не о том.
    html: ['row', 'column'].flatMap((dir) => ['0.875', '1', '1.15', '1.5'].map((sc) =>
      `<div class="ds-root ds-scale" style="--ds-ui-scale:${sc};width:800px;height:600px" data-split="${dir}" data-sc="${sc}"></div>`)).join(''),
    measure: async () => {
      const SIZE = 200
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const out = []
      for (const el of document.querySelectorAll('[data-split]')) {
        const row = el.dataset.split === 'row'
        WB.mountSplit(el, { direction: el.dataset.split, size: SIZE })
        await frames()
        const bar = el.querySelector('.ds-split__bar')
        const pane = el.querySelector('.ds-split__pane--first')
        const at = () => { const b = bar.getBoundingClientRect(); return row ? b.left : b.top }
        const paneSize = pane.getBoundingClientRect()[row ? 'width' : 'height']
        const moved = []
        for (const d of [60, -60]) {
          const b = bar.getBoundingClientRect()
          const x = b.left + b.width / 2, y = b.top + b.height / 2
          const before = at()
          const ev = (type, dx) => new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
            button: 0, buttons: type === 'pointerup' ? 0 : 1,
            clientX: x + (row ? dx : 0), clientY: y + (row ? 0 : dx),
          })
          bar.dispatchEvent(ev('pointerdown', 0))
          window.dispatchEvent(ev('pointermove', d))
          window.dispatchEvent(ev('pointerup', d))
          await frames()
          moved.push({ d, by: +(at() - before).toFixed(2) })
        }
        out.push({ at: `${el.dataset.split}×${el.dataset.sc}`, sc: +el.dataset.sc, paneSize: +paneSize.toFixed(2), size: SIZE, moved })
      }
      return out
    },
    expect: (m) => {
      // Литералом: 2 оси × 4 шкалы (ловушка 7).
      if (m.length !== 8) return `хостов ${m.length} вместо 8`
      const bad = []
      for (const r of m) {
        // Сосед: шкала доехала до пейна. Без него случай зелёный и на листе без шкалы.
        if (Math.abs(r.paneSize - r.size * r.sc) > 1) { bad.push(`${r.at}: пейн ${r.paneSize}px, а ${r.size} × ${r.sc} = ${r.size * r.sc} — шкала не доехала, случай не про что`); continue }
        for (const s of r.moved) {
          if (s.by === 0) bad.push(`${r.at}: ход ${s.d} — разделитель не сдвинулся вовсе, событие не дошло`)
          else if (Math.abs(s.by - s.d) > 1) bad.push(`${r.at}: ход мыши ${s.d}px, разделитель ушёл на ${s.by}px — хват уезжает из-под курсора`)
        }
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Split: отменённое перетаскивание КОНЧАЕТСЯ — ход после pointercancel разделитель не двигает',
    why: 'DS-348. Слушатели `pointermove`/`pointerup` вешались на `window` и снимались только по `pointerup`. На таче этого конца может не быть вовсе: браузер забирает жест под прокрутку и шлёт `pointercancel`, слушатель остаётся висеть — и следующий проход указателя двигает разделитель БЕЗ нажатия, причём от старого `startPos`, то есть скачком. Мерится ПОЛОЖЕНИЕ разделителя, а не наличие слушателя: слушатель бывает снят и повешен заново, а предмет — поедет ли полоса. Сосед обязателен в каждой паре: до конца жеста ход ОБЯЗАН двигать, иначе «не двигает после отмены» верно и на компоненте, который не слушает ход вовсе. Третья половина — `touch-action: none` на полосе: она снимает ПОВОД (браузеру нечего забирать), `end` в Split.tsx чинит утечку, и порознь каждая оставляет дыру. Здесь она настоящим каскадом, а не текстом листа: `touch-action` наследуется и перебивается, и присутствие объявления в файле не то же, что вычисленное значение у полосы',
    width: 900,
    bundle: 'scripts/measure-split.tsx',
    html: ['row', 'column'].map((dir) =>
      `<div class="ds-root ds-scale" style="--ds-ui-scale:1;width:800px;height:600px" data-cancel="${dir}"></div>`).join(''),
    measure: async () => {
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const out = []
      for (const el of document.querySelectorAll('[data-cancel]')) {
        const row = el.dataset.cancel === 'row'
        WB.mountSplit(el, { direction: el.dataset.cancel, size: 200 })
        await frames()
        const bar = el.querySelector('.ds-split__bar')
        const at = () => { const b = bar.getBoundingClientRect(); return row ? b.left : b.top }
        const ev = (type, dx) => {
          const b = bar.getBoundingClientRect()
          const x = b.left + b.width / 2, y = b.top + b.height / 2
          return new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
            button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
            clientX: x + (row ? dx : 0), clientY: y + (row ? 0 : dx),
          })
        }
        // Первый жест: доводим до конца ОТМЕНОЙ и смотрим, поедет ли полоса
        // от следующего хода. Он идёт на 120 px — вдвое дальше живого хода
        // ниже, чтобы «не сдвинулся» нельзя было списать на округление.
        bar.dispatchEvent(ev('pointerdown', 0))
        window.dispatchEvent(ev('pointercancel', 0))
        await frames()
        const afterCancel = at()
        window.dispatchEvent(ev('pointermove', 120))
        await frames()
        const drift = +(at() - afterCancel).toFixed(2)
        // Сосед: живой жест ОБЯЗАН двигать. Без него «не поехал» верно и на
        // компоненте, который ход не слушает вовсе.
        const before = at()
        bar.dispatchEvent(ev('pointerdown', 0))
        window.dispatchEvent(ev('pointermove', 60))
        await frames()
        const alive = +(at() - before).toFixed(2)
        window.dispatchEvent(ev('pointerup', 60))
        out.push({ at: el.dataset.cancel, drift, alive, touch: getComputedStyle(bar).touchAction })
      }
      return out
    },
    expect: (m) => {
      // Литералом: обе оси (ловушка 7).
      if (m.length !== 2) return `хостов ${m.length} вместо 2`
      const bad = []
      for (const r of m) {
        if (Math.abs(r.drift) > 1) bad.push(`${r.at}: после pointercancel ход указателя увёл разделитель на ${r.drift}px — слушатель пережил жест`)
        if (Math.abs(r.alive - 60) > 1) bad.push(`${r.at}: живой ход 60px двигает на ${r.alive}px — случай не про что, «не поехал» выше верен по пустой причине`)
        if (r.touch !== 'none') bad.push(`${r.at}: touch-action полосы «${r.touch}» вместо none — браузеру есть что забрать под прокрутку`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Split: после упора в контейнер обратный ход двигает разделитель СРАЗУ, без мёртвой зоны',
    why: 'DS-349. С DS-326 первая панель `flex: 0 1 auto` — размер ПРЕДПОЧТИТЕЛЬНЫЙ, потолок контейнер. Состояние потолка не знало: утянул разделитель за край — `current` растёт дальше, чем панель нарисована, и следующее перетаскивание стартовало с `current`. Пока ход не съедал разницу, полоса стояла: мёртвая зона под рукой, тем длиннее, чем дальше утянули. Мерится ПУТЬ ПОЛОСЫ на обратном ходе после упора, а не число в состоянии: число было «верным» при дефекте — врал старт. jsdom бесполезен вдвойне: он не вычисляет `calc` и не делает раскладку вовсе, так что прижатия там не бывает. Сосед в каждой паре — упор ДОСТИГНУТ (панель прижата, состояние ушло дальше): без него «двигает сразу» верно и на хосте, где ничего не прижималось, то есть случай не про что. Отброшено клэмпить состояние по контейнеру: размер стал бы функцией ширины окна, а он публичный договор (`size`/`min`/`max`/`storageKey`) — раскладка, открытая однажды на узком экране, сохранилась бы узкой навсегда и молча',
    width: 900,
    bundle: 'scripts/measure-split.tsx',
    // Хост 400 при панели 200: сам по себе НЕ тесен (200 + 24 < 400), упор
    // создаёт сам ход. Иначе случай судил бы стартовую раскладку, а не то, что
    // с ней делает перетаскивание.
    html: ['row', 'column'].map((dir) =>
      `<div class="ds-root ds-scale" style="--ds-ui-scale:1;width:400px;height:400px" data-dead="${dir}"></div>`).join(''),
    measure: async () => {
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const out = []
      for (const el of document.querySelectorAll('[data-dead]')) {
        const row = el.dataset.dead === 'row'
        WB.mountSplit(el, { direction: el.dataset.dead, size: 200 })
        await frames()
        const bar = el.querySelector('.ds-split__bar')
        const pane = el.querySelector('.ds-split__pane--first')
        const at = () => { const b = bar.getBoundingClientRect(); return row ? b.left : b.top }
        const paneAt = () => +pane.getBoundingClientRect()[row ? 'width' : 'height'].toFixed(2)
        const ev = (type, dx) => {
          const b = bar.getBoundingClientRect()
          const x = b.left + b.width / 2, y = b.top + b.height / 2
          return new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
            button: 0, buttons: type === 'pointerup' ? 0 : 1,
            clientX: x + (row ? dx : 0), clientY: y + (row ? 0 : dx),
          })
        }
        const drag = async (d) => {
          bar.dispatchEvent(ev('pointerdown', 0))
          window.dispatchEvent(ev('pointermove', d))
          window.dispatchEvent(ev('pointerup', d))
          await frames()
        }
        // Утягиваем ЗА край: +300 при запасе 400 - 200 - 24 = 176.
        await drag(300)
        const pinned = paneAt()
        const now = +bar.getAttribute('aria-valuenow')
        const before = at()
        // Обратный ход. Полоса обязана пойти за ним сразу же.
        await drag(-60)
        out.push({ at: el.dataset.dead, pinned, now, back: +(at() - before).toFixed(2) })
      }
      return out
    },
    expect: (m) => {
      // Литералом: обе оси (ловушка 7).
      if (m.length !== 2) return `хостов ${m.length} вместо 2`
      const bad = []
      for (const r of m) {
        // Сосед: упор достигнут — панель прижата, состояние ушло дальше неё.
        if (!(r.now > r.pinned + 1)) bad.push(`${r.at}: состояние ${r.now}, панель ${r.pinned}px — контейнер панель НЕ прижал, случай не про что`)
        else if (Math.abs(r.back + 60) > 1) bad.push(`${r.at}: после упора обратный ход 60px сдвинул разделитель на ${r.back}px — мёртвая зона ${(r.now - r.pinned).toFixed(0)}px`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Кнопка отличается от пустого поля ПОДЛОЖКОЙ, при общей рамке, в обеих темах',
    why: 'DS-269. После 267 вторичная кнопка и поле стоят на одном токене рамки — и по делу: граница контрола один предмет, порог 3 : 1. Но и заливка у них была общей, `--ds-surface`, так что в ряду «поле, поле, кнопка» кнопку отличали только выключка и начертание, а иконочную — ничто. Носитель — подложка: поле `--ds-surface`, кнопка ступень `--ds-surface-subtle`. Мерится ΔE заливок, а не неравенство строк: две разные строки бывают и в ΔE 0.5. Порог 2.3 — заметность пятна. Проверяются все кнопки, стоящие рядом с полем в самой системе (Pagination, SearchBar), плюс ThemeToggle того же вида. Соседи: рамка у всех ОСТАЛАСЬ общей (267 не сдвинута), и кнопка копирования `CodeBlock` отличается от СВОЕЙ подложки — она из ступени исключена, потому что блок сам subtle',
    width: 900,
    html: ['light', 'dark'].map((t) => `
      <div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px; background: var(--ds-surface)">
        <input class="ds-input" id="bf-input-${t}" placeholder="">
        <button class="ds-btn ds-btn--secondary" id="bf-btn-${t}">Найти</button>
        <button class="ds-pager__btn" id="bf-pager-${t}">‹</button>
        <button class="ds-searchbar__go" id="bf-go-${t}">Найти</button>
        <button class="ds-theme-toggle" id="bf-theme-${t}">Тема</button>
        <div class="ds-codeblock" id="bf-code-${t}"><button class="ds-codeblock__copy" id="bf-copy-${t}">Копировать</button></div>
      </div>`).join(''),
    measure: () => {
      const out = {}
      for (const t of ['light', 'dark']) {
        const cs = (id) => getComputedStyle(document.getElementById(`bf-${id}-${t}`))
        out[t] = {
          input: { bg: cs('input').backgroundColor, border: cs('input').borderTopColor },
          buttons: Object.fromEntries(['btn', 'pager', 'go', 'theme'].map((k) => [k, { bg: cs(k).backgroundColor, border: cs(k).borderTopColor }])),
          code: cs('code').backgroundColor,
          copy: cs('copy').backgroundColor,
        }
      }
      return out
    },
    expect: (m) => {
      for (const [t, r] of Object.entries(m)) {
        for (const [k, b] of Object.entries(r.buttons)) {
          if (b.border !== r.input.border) return `${t}: рамка ${k} ${b.border} разошлась с рамкой поля ${r.input.border} — сдвинута граница контрола (267)`
          const d = deltaE76(b.bg, r.input.bg)
          if (d < 2.3) return `${t}: заливка ${k} ${b.bg} против поля ${r.input.bg} — ΔE ${d.toFixed(2)} < 2.3, кнопка читается пустым полем`
        }
        const dc = deltaE76(r.copy, r.code)
        if (dc < 2.3) return `${t}: кнопка копирования ${r.copy} на своём блоке ${r.code} — ΔE ${dc.toFixed(2)}, растворилась`
      }
      return true
    },
  },
  {
    name: 'Оверлей отделён от страницы в ОБЕИХ темах, и в тёмной это граница',
    why: 'DS-161. В тёмной теме панель `--ds-surface` (#262626) к фону `--ds-bg-app` (#1A1A1A) даёт 1.15 : 1, рамка `--ds-border` к панели 1.33, а тень `--ds-shadow-md` это rgba(0,0,0,0.5) на почти чёрном — не видна вовсе: затемнять уже тёмное нечем. Меню, поповер и тост отделены волоском. ЗАЛИВКОЙ порог 1.4.11 не берётся: чтобы дать 3 : 1 к фону, она обязана быть #666666, а на ней `secondary` даёт 2.20, `muted` 2.04, `faint` 1.75 — второстепенный текст пропадает, и панель перестаёт быть тёмной. Поэтому цель перенесена на ГРАНИЦУ, где текст не лежит и платить нечем. У `Drawer` границы не было ВООБЩЕ — он опирался на единственный носитель, которого в тёмной теме нет',
    width: 900,
    html: ['light', 'dark'].map((t) => `
      <div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px; background: var(--ds-bg-app)">
        <div class="ds-dropdown__menu" id="ov-menu-${t}" role="menu" style="position:static">пункт</div>
        <div class="ds-popover__panel" id="ov-pop-${t}" style="position:static">поповер</div>
        <div class="ds-toast" id="ov-toast-${t}">Документ проведён</div>
        <div class="ds-drawer ds-drawer--right" id="ov-drawer-${t}" style="position:static; width:120px; height:60px"></div>
        <div class="ds-modal" id="ov-modal-${t}">модал</div>
        <span id="ov-app-${t}" style="background: var(--ds-bg-app)"></span>
        <span id="ov-surface-${t}" style="background: var(--ds-surface)"></span>
      </div>`).join(''),
    measure: () => {
      const out = {}
      for (const t of ['light', 'dark']) {
        const cs = (id) => getComputedStyle(document.getElementById(id))
        const edge = (id) => {
          const s = cs(id)
          // У ящика контур ТОЛЬКО с открытой стороны, поэтому берётся не
          // `borderColor` (он сложил бы четыре стороны в одну строку), а та
          // сторона, где линия обязана быть.
          const sides = [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor]
          const widths = [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth]
          const i = widths.findIndex((w) => parseFloat(w) > 0)
          return i === -1 ? null : sides[i]
        }
        out[t] = {
          app: cs(`ov-app-${t}`).backgroundColor,
          surface: cs(`ov-surface-${t}`).backgroundColor,
          menu: edge(`ov-menu-${t}`),
          popover: edge(`ov-pop-${t}`),
          toast: edge(`ov-toast-${t}`),
          drawer: edge(`ov-drawer-${t}`),
          modal: edge(`ov-modal-${t}`),
        }
      }
      return out
    },
    expect: (m) => {
      const PANELS = ['menu', 'popover', 'toast', 'drawer', 'modal']
      const fails = []
      for (const name of PANELS) {
        if (!m.dark[name]) { fails.push(`${name}: границы нет вовсе (тёмная)`); continue }
        const c = contrastOf(m.dark[name], m.dark.app)
        if (c < 3) fails.push(`${name}: граница к фону ${c.toFixed(2)} < 3 (тёмная)`)
      }
      // Вторая половина: контур виден и СО СТОРОНЫ ПАНЕЛИ. Граница, слившаяся с
      // заливкой, дала бы 3 : 1 к фону и осталась бы невидимой на самой панели —
      // то есть утверждение выше прошло бы, не проверив.
      for (const name of PANELS) {
        if (!m.dark[name]) continue
        const c = contrastOf(m.dark[name], m.dark.surface)
        if (c < 2) fails.push(`${name}: граница к панели ${c.toFixed(2)} < 2 (тёмная)`)
      }
      // СВЕТЛАЯ тема не проверяется порогом, и это сказано прямо: отделение там
      // несёт ТЕНЬ, а её контрастом не измерить. Утверждение здесь другое —
      // «не изменилось»: граница светлой темы обязана остаться равной обычной,
      // иначе правка тёмной уехала бы в светлую молча.
      const lightBorder = m.light.menu
      for (const name of PANELS) {
        if (name === 'drawer') continue
        if (m.light[name] !== lightBorder) {
          fails.push(`${name}: в СВЕТЛОЙ теме граница ${m.light[name]}, а у меню ${lightBorder} — семья разошлась`)
        }
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'Icon: чужой глиф приведён к нашему на всех пяти шкалах',
    why: 'двенадцать компонентов принимают `icon` как голый `ReactNode`, и до DS-145 ничто не держало переданный глиф в общем виде: толщина штриха, размер и цвет оставались чужими, а рядом с нашим шевроном это два разных знака. Утверждение контракта — «CSS бьёт презентационные атрибуты SVG», и оно проверяемо ТОЛЬКО браузером: `tsc` и vitest видят разметку, а не вычисленный стиль. Разметка чужого глифа здесь — буквально tabler: `width="24" height="24" stroke-width="1.5" stroke="currentColor"`',
    width: 900,
    html: ['0.875', '1', '1.15', '1.25', '1.5'].map((sc) => `
      <div class="ds-scale" style="--ds-ui-scale: ${sc}; color: rgb(17, 34, 51)">
        <span class="ds-icon" id="ours-${sc.replace('.', '_')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </span>
        <span class="ds-icon" id="theirs-${sc.replace('.', '_')}">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
               fill="none" stroke="#ff0000" stroke-width="1.5" stroke-linecap="round"
               stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </span>
      </div>`).join(''),
    measure: () => {
      const read = (id) => {
        const svg = document.querySelector(`#${id} > svg`)
        const cs = getComputedStyle(svg)
        const box = svg.getBoundingClientRect()
        return {
          w: +box.width.toFixed(2),
          h: +box.height.toFixed(2),
          stroke: cs.strokeWidth,
          colour: cs.stroke,
        }
      }
      const out = {}
      for (const sc of ['0_875', '1', '1_15', '1_25', '1_5']) {
        out[sc] = { ours: read(`ours-${sc}`), theirs: read(`theirs-${sc}`) }
      }
      return out
    },
    expect: (m) => {
      const scales = Object.keys(m)
      for (const sc of scales) {
        const { ours, theirs } = m[sc]
        // Размер: чужой приехал с width="24", наш с width="16" — обоих обязан
        // перебить лист. Совпадение до 0.05px, а не «примерно»: субпиксель на
        // dpr 1.15 даёт 13.99 против 14, и порог должен пускать это и не
        // пускать разницу в целый пиксель.
        if (Math.abs(ours.w - theirs.w) > 0.05 || Math.abs(ours.h - theirs.h) > 0.05) {
          return `шкала ${sc}: наш ${ours.w}×${ours.h}, чужой ${theirs.w}×${theirs.h} — атрибут не перебит`
        }
        // Толщина штриха: чужой приехал с 1.5.
        if (ours.stroke !== theirs.stroke) {
          return `шкала ${sc}: штрих наш ${ours.stroke}, чужой ${theirs.stroke}`
        }
        // Цвет: чужой приехал с зашитым #ff0000 и обязан взять currentColor
        // места. Без этого чужая иконка осталась бы красной на активной вкладке.
        if (theirs.colour !== ours.colour) {
          return `шкала ${sc}: цвет наш ${ours.colour}, чужой ${theirs.colour} — currentColor не навязан`
        }
      }
      // Размер обязан ЕХАТЬ со шкалой, иначе всё вышесказанное верно и при
      // жёстком числе — там все пять совпадают друг с другом.
      const small = m['0_875'].ours.w
      const big = m['1_5'].ours.w
      const ratio = big / small
      return Math.abs(ratio - 1.5 / 0.875) < 0.02
        || `размер не поехал по шкале: ${small} → ${big}, отношение ${ratio.toFixed(3)}`
    },
  },
  {
    name: 'Accordion: знак раскрытия и каретка селекта — на РАЗНЫХ краях',
    why: 'DS-262, заявка потребителя с живой страницы. `Caret` вида `panel` и вида `menu` — это ОДИН И ТОТ ЖЕ глиф `ChevronDown`; пока знак секции стоял справа, свёрнутый `Accordion` в покое был байт в байт селектом: тот же знак в том же месте, а `background` и `border-radius` у `.ds-accordion` и `.ds-input` и так одни и те же токены, причём рамка у секции СЛАБЕЕ (`--ds-border` против `--ds-border-strong`). Человек на слепом взгляде назвал блок «контролом» раньше, чем словом «раскрыть». Различать обязано ПОЛОЖЕНИЕ: заливками не берётся (`--ds-section-bar` к `--ds-surface` — 1.19 в светлой, 1.17 в тёмной, то есть та же величина, что забракована в решении по `DropdownMenu`), рамкой тоже (DS-267). Положение — признак категории, а не величины, и потому единственный честный носитель. Замером, а не глазом, потому что «слева» ломается молча: достаточно переставить два узла в JSX',
    width: 900,
    html: `
      <div class="ds-scale" style="--ds-ui-scale: 1; width: 420px">
        <div class="ds-accordion">
          <div class="ds-accordion__item">
            <button type="button" class="ds-accordion__header" id="acc-head" aria-expanded="false">
              <svg class="ds-caret ds-caret--panel" id="acc-caret" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
              <span class="ds-accordion__title">Same thing from the CLI</span>
            </button>
          </div>
        </div>
        <span class="ds-select-wrap" style="width: 420px">
          <select class="ds-select" id="sel-box" style="width: 420px"><option>высокий</option></select>
          <span class="ds-select__chevron" id="sel-caret-wrap">
            <svg class="ds-caret" id="sel-caret" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </span>
        </span>
      </div>`,
    measure: () => {
      const box = (id) => {
        const b = document.getElementById(id).getBoundingClientRect()
        return { left: +b.left.toFixed(2), right: +b.right.toFixed(2), cx: +((b.left + b.right) / 2).toFixed(2) }
      }
      const head = box('acc-head')
      const sel = box('sel-box')
      return {
        // Доля ширины, на которой стоит центр знака: 0 — левый край хозяина,
        // 1 — правый. Доля, а не пиксели: ширина у двух хозяев своя, и число
        // в пикселях сравнивало бы разное.
        accAt: +((box('acc-caret').cx - head.left) / (head.right - head.left)).toFixed(3),
        selAt: +((box('sel-caret').cx - sel.left) / (sel.right - sel.left)).toFixed(3),
      }
    },
    expect: (m) => {
      // Порог 0.5 — середина хозяина. Не «около края»: знак может отступать от
      // края на падинг, и требовать 0.05 значило бы прибить падинг числом.
      if (m.accAt >= 0.5) {
        return `знак секции стоит на доле ${m.accAt} — это правая половина, то есть место каретки селекта`
      }
      if (m.selAt <= 0.5) {
        return `каретка селекта уехала на долю ${m.selAt} — левая половина; тогда утверждение этого случая теряет смысл, и различать секцию и поле снова нечем`
      }
      // Обе половины сразу, а не одна: случай, проверяющий только секцию,
      // остался бы зелёным, если бы каретку селекта тоже перенесли влево, —
      // и молча перестал бы утверждать РАЗЛИЧИЕ, ради которого написан.
      return m.selAt - m.accAt > 0.5
        || `знаки слишком близко: секция на ${m.accAt}, селект на ${m.selAt} — разница ${(m.selAt - m.accAt).toFixed(3)}`
    },
  },
  {
    name: 'Icon: ТЕКСТОВЫЙ глиф занимает бокс так же, как SVG',
    why: 'до DS-263 `.ds-icon` держал `line-height: 0`, и это схлопывало бокс в НОЛЬ, если ребёнок — глиф, а не SVG: размер задаёт правило `> svg`, а глиф приходит анонимным флекс-элементом, который образует строчный бокс. Дефект прятался за раскладкой: в строке с `align-items: center` нулевая высота центрируется и глиф разливается симметрично, а в КОЛОНКЕ с `gap` под знак не отводится места вовсе, и он ложится на подпись. Замер до правки: `Dashboard` −2.70px на шкале 1 и −4.05px на 1.5 — наезд РОС со шкалой. Проверяемо только браузером: jsdom раскладки не считает, а гейт `icon-contract` читает исходник',
    width: 900,
    html: ['1', '1.5'].map((sc) => `
      <div class="ds-scale" style="--ds-ui-scale: ${sc}; color: rgb(17, 34, 51)">
        <div class="ds-tile ds-tile--static" id="tile-${sc.replace('.', '_')}">
          <span class="ds-icon ds-tile__icon" id="tileicon-${sc.replace('.', '_')}">&#9638;</span>
          <span class="ds-tile__title" id="tiletitle-${sc.replace('.', '_')}">Заказов за смену</span>
        </div>
        <span class="ds-icon" id="glyph-${sc.replace('.', '_')}">&#9638;</span>
        <span class="ds-icon" id="vector-${sc.replace('.', '_')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </div>`).join(''),
    measure: () => {
      // Ink-бокс глифа, а не бокс обёртки: именно он рисуется и именно он
      // наезжает. Range по текстовому узлу — единственный способ его снять.
      const ink = (el) => {
        const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
        const r = document.createRange()
        r.selectNode(t)
        const b = r.getBoundingClientRect()
        return { top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2), h: +b.height.toFixed(2) }
      }
      const box = (id) => {
        const b = document.getElementById(id).getBoundingClientRect()
        return { w: +b.width.toFixed(2), h: +b.height.toFixed(2) }
      }
      const out = {}
      for (const sc of ['1', '1_5']) {
        const icon = document.getElementById(`tileicon-${sc}`)
        const title = document.getElementById(`tiletitle-${sc}`).getBoundingClientRect()
        out[sc] = {
          glyph: box(`glyph-${sc}`),
          vector: box(`vector-${sc}`),
          tileIcon: box(`tileicon-${sc}`),
          gap: +(title.top - ink(icon).bottom).toFixed(2),
        }
      }
      return out
    },
    expect: (m) => {
      for (const sc of ['1', '1_5']) {
        const { glyph, vector, tileIcon, gap } = m[sc]
        // Ядро контракта: обёртка держит бокс НЕЗАВИСИМО от того, что ей
        // передали. Ноль здесь — ровно тот дефект, ради которого случай и
        // написан, и мутация `line-height: 0` роняет проверку тут.
        if (glyph.h <= 0) {
          return `шкала ${sc}: глиф в <Icon> дал бокс высотой ${glyph.h} — обёртка держит размер только для SVG`
        }
        if (tileIcon.h <= 0) {
          return `шкала ${sc}: .ds-tile__icon дал бокс высотой ${tileIcon.h}`
        }
        // Вторая половина, без которой первая проходит и при боксе в 1px:
        // в КОЛОНКЕ знак не имеет права лежать на подписи. Порог 0, а не
        // «примерно»: отрицательное здесь — это буквально наезд.
        if (gap < 0) {
          return `шкала ${sc}: знак наезжает на подпись плитки на ${(-gap).toFixed(2)}px`
        }
        // SVG обязан остаться нетронутым — это граница правки. `line-height`
        // для настоящего флекс-элемента инертен, и если вектор поехал, значит
        // правка задела то, чего не просили.
        if (Math.abs(vector.h - vector.w) > 0.05) {
          return `шкала ${sc}: вектор перестал быть квадратным, ${vector.w}×${vector.h}`
        }
      }
      // Наезд РОС со шкалой — значит проверять надо обе, и на крупной запас
      // обязан быть не меньше. Иначе правка, лечащая только шкалу 1, прошла бы.
      return m['1_5'].gap >= m['1'].gap
        || `запас на шкале 1.5 (${m['1_5'].gap}) меньше, чем на шкале 1 (${m['1'].gap})`
    },
  },
  {
    name: 'Tabs: пол ширины меню переполнения едет вместе с масштабом',
    why: 'нижняя граница ширины поповера была написана числом (`min-width: 180px`) — единственный в системе размер интерфейсного элемента мимо `--ds-ui-scale`. Замер до правки: на 0.875 меню шире своего содержимого в 2.27 раза, на 1 — в 1.99, на 1.5 — в 1.34. То есть одно и то же меню выглядело относительно ШИРЕ ровно там, где пользователь просил интерфейс плотнее (DS-119)',
    width: 900,
    html: ['0.875', '1', '1.5'].map((sc) => `
      <div class="ds-scale" style="--ds-ui-scale: ${sc}; position: relative; height: 200px">
        <span class="ds-tabs__overflow" style="position:absolute; left:0; top:0">
          <div class="ds-tabs__overflow-menu" id="m-${sc.replace('.', '_')}" role="menu">
            <button class="ds-tabs__overflow-item">Счета</button>
          </div>
        </span>
      </div>`).join(''),
    measure: () => {
      const w = (id) => +document.querySelector(id).getBoundingClientRect().width.toFixed(2)
      return { small: w('#m-0_875'), one: w('#m-1'), big: w('#m-1_5') }
    },
    expect: (m) => {
      // Три величины обязаны быть РАЗЛИЧИМЫ: схлопнувшись, они прошли бы и при
      // жёстком числе — там все три равны 180.
      if (m.small === m.one || m.one === m.big) {
        return `пол ширины не поехал: ${m.small} / ${m.one} / ${m.big}`
      }
      const ratio = m.big / m.small
      return Math.abs(ratio - 1.5 / 0.875) < 0.02
        || `отношение ширин ${ratio.toFixed(3)}, ожидалось ${(1.5 / 0.875).toFixed(3)}`
    },
  },
  {
    name: 'Card: шапка из двух строк вмещает содержимое',
    why: 'жёсткая высота обрезала вторую строку — колонка 33.38px в боксе 32. Фикстура НАМЕРЕННО перерастает минимум шапки: заголовок в два ряда (`--wrap` в узкой карточке) плюс подпись. С прежней, «Время» и «часовые пояса», содержимое укладывалось в `min-height`, и снятие `height: auto` кейс переживало — правило держалось только текстовой проверкой в `Form.test.tsx`, то есть наличием строки в файле, а не её действием (DS-118). Ширина страницы 320 не про экран — карточка внутри держит СВОЙ инлайновый width 240px, страница лишь не режет её, JIG-29 подняла до пола 440 без последствий',
    width: 440,
    html: `<div class="ds-card" style="width: 240px"><div class="ds-card__header ds-card__header--widget" id="h">
      <div class="ds-card__titles">
      <div class="ds-card__title ds-card__title--wrap">Реализация товаров и услуг за третий квартал</div>
      <div class="ds-card__subtitle">часовые пояса</div></div></div></div>`,
    measure: () => {
      const h = document.querySelector('#h')
      const titles = document.querySelector('#h .ds-card__titles')
      return {
        box: parseFloat(getComputedStyle(h).height),
        content: titles.getBoundingClientRect().height,
        // Минимум шапки: если содержимое до него не дотянуло, кейс проверяет не
        // то — жёсткая высота и без `height: auto` дала бы тот же бокс.
        min: parseFloat(getComputedStyle(h).minHeight),
      }
    },
    expect: (m) => {
      if (m.content <= m.min) return `содержимое ${m.content.toFixed(2)} не переросло минимум ${m.min.toFixed(2)} — фикстура не нагружает шапку`
      return m.content <= m.box + 0.5 || `содержимое ${m.content.toFixed(2)} в боксе ${m.box.toFixed(2)}`
    },
  },
  {
    name: 'Card: заголовок с переносом ограничен двумя рядами',
    why: 'без ограничения длинный заголовок растянул бы шапку на всю карточку. Проверялось регэкспом по `Form.css` — то есть НАЛИЧИЕМ строки `line-clamp: 2` в файле, а не её действием (DS-118). Три состояния меряются вместе и обязаны быть РАЗЛИЧИМЫ: без `--wrap` одна строка, с `--wrap` две, и текст на пять строк те же две. Ширина страницы 320 не про экран — карточка внутри держит СВОЙ инлайновый width 200px, JIG-29 подняла страницу до пола 440 без последствий',
    width: 440,
    html: `<div class="ds-card" style="width: 200px"><div class="ds-card__header ds-card__header--widget">
      <div class="ds-card__titles">
        <div class="ds-card__title" id="one">Реализация товаров и услуг за третий квартал текущего года</div>
        <div class="ds-card__title ds-card__title--wrap" id="two">Реализация товаров и услуг за третий квартал текущего года</div>
        <div class="ds-card__title ds-card__title--wrap" id="many">Реализация товаров и услуг за третий квартал текущего года по всем подразделениям автопарка и по каждому водителю отдельно</div>
      </div></div></div>`,
    measure: () => {
      const h = (id) => document.querySelector(id).getBoundingClientRect().height
      return { one: +h('#one').toFixed(2), two: +h('#two').toFixed(2), many: +h('#many').toFixed(2) }
    },
    expect: (m) => {
      // Сосед с известным значением: без `--wrap` заголовок обязан остаться в
      // одну строку. Схлопнулись все три — кейс проходил бы на любом правиле.
      if (m.two <= m.one) return `перенос не сработал: с --wrap ${m.two}, без него ${m.one}`
      if (m.two < m.one * 1.5) return `две строки (${m.two}) не отличаются от одной (${m.one}) в полтора раза`
      return Math.abs(m.many - m.two) < 1
        || `текст на пять строк вырос сверх двух: ${m.many} против ${m.two}`
    },
  },
  {
    name: 'Card: однострочная шапка не выросла',
    why: 'снятие height без height:auto подняло её с 40.86 до 44.85',
    html: `<div class="ds-card"><div class="ds-card__header ds-card__header--widget" id="h">
      <div class="ds-card__titles"><div class="ds-card__title">Заметки</div></div>
      <div class="ds-card__action">Все →</div></div></div>`,
    measure: () => ({ h: +document.querySelector('#h').getBoundingClientRect().height.toFixed(2) }),
    expect: (m) => Math.abs(m.h - 40.86) < 1 || `высота ${m.h}, ожидалась ≈40.86`,
  },
  {
    name: 'Card: подпись шапки виджета берёт пол 4.5 на ОБЕИХ заливках шапки',
    why: 'DS-204. `.ds-card__subtitle` брала `--ds-text-muted` — токен, выбранный против `--ds-surface`, где он даёт 5.33. Шапка виджета лежит не на поверхности: обычная — на `--ds-section-bar` (#EBEBEB, 4.47 в свете при поле 4.5), обрамлённая — на `--ds-accent-subtle` (#143C3C в темноте, 4.29). Текст здесь мелкий (`--ds-fs-xs`) и содержательный — дата вида «Обновлено 17.03.2026 в 09:14». Промахнулась ПАРА, а не токен: значения общие и трогать их нельзя, меняется только то, какой из двух токенов берёт эта строка. Заливки обе, и темы обе, по той же причине: с одной подложкой случай утверждал бы «на этой», а промах пары зависит от темы — в свете тонет обычная шапка, в темноте обрамлённая, и правка, зелёная на половине выборки, выглядела бы общей. Подложка берётся СО СТРАНИЦЫ (`window.__seen`), а не из головы',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} id="wrap-${t}">
      ${['bar', 'framed'].map((k) => `<div class="ds-card ${k === 'framed' ? 'ds-card--framed' : ''}">
        <div class="ds-card__header ds-card__header--widget" id="head-${t}-${k}">
          <div class="ds-card__titles">
            <div class="ds-card__title" id="title-${t}-${k}">Реализация товаров и услуг</div>
            <div class="ds-card__subtitle" id="sub-${t}-${k}">Обновлено 17.03.2026 в 09:14</div>
          </div>
        </div></div>`).join('')}
    </div>`).join(''),
    measure: () => {
      const read = (theme) => {
        const root = document.getElementById(`wrap-${theme}`)
        // Подложка-ТОКЕН отдельно от подложки-СО-СТРАНИЦЫ: первая отвечает на
        // «а та ли это заливка, о которой случай», вторая — на «что видно».
        // Без первой фикстура, потерявшая класс `--widget` или `--framed`,
        // мерила бы подпись на белой поверхности и выдала бы зелёные 5.74 —
        // число не о том.
        const tok = (n) => {
          const probe = document.createElement('div')
          probe.style.cssText = `background: var(${n}); position: absolute; visibility: hidden`
          root.appendChild(probe)
          const v = getComputedStyle(probe).backgroundColor
          probe.remove()
          return v
        }
        const paint = (k) => ({
          headBg: getComputedStyle(document.getElementById(`head-${theme}-${k}`)).backgroundColor,
          fs: getComputedStyle(document.getElementById(`sub-${theme}-${k}`)).fontSize,
          sub: window.__seen(document.getElementById(`sub-${theme}-${k}`)),
          // Сосед с известным значением (docs/writing-checks.md, ловушка 5):
          // заголовок в той же шапке на той же заливке обязан быть КОНТРАСТНЕЕ
          // подписи. Снимок, врущий про слои, врёт про обоих сразу — и тогда
          // порядок между ними ломается или схлопывается.
          title: window.__seen(document.getElementById(`title-${theme}-${k}`)),
        })
        return { want: { bar: tok('--ds-section-bar'), framed: tok('--ds-accent-subtle') }, bar: paint('bar'), framed: paint('framed') }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => {
      for (const theme of ['light', 'dark']) {
        for (const [k, human] of [['bar', 'полоса секции'], ['framed', 'заливка обрамлённой карточки']]) {
          const p = m[theme][k]
          const want = m[theme].want[k]
          if (p.headBg !== want) {
            return `${theme}/${k}: шапка залита ${p.headBg}, а ${human} — ${want}; фикстура мерит не ту подложку`
          }
          const sub = seenPair(p.sub)
          const title = seenPair(p.title)
          if (sub.background !== want) {
            return `${theme}/${k}: под подписью видно ${sub.background}, а не ${human} ${want}`
          }
          // Различимость: «подпись = основной текст» взяла бы пол с запасом и
          // молча уничтожила бы второй уровень заголовка.
          if (sub.color === title.color) {
            return `${theme}/${k}: подпись и заголовок одного цвета (${sub.color}) — второго уровня в шапке больше нет`
          }
          const crSub = contrastOf(sub.color, sub.background)
          const crTitle = contrastOf(title.color, title.background)
          if (crTitle <= crSub) {
            return `${theme}/${k}: заголовок (${crTitle.toFixed(2)}) не контрастнее подписи (${crSub.toFixed(2)}) — снимок берёт не те слои`
          }
          if (crSub < 4.5) {
            return `${theme}/${k}: подпись шапки даёт ${crSub.toFixed(2)} на ${sub.background} (${human}) при поле 4.5, текст мелкий (${p.fs})`
          }
        }
      }
      return true
    },
  },
  {
    name: 'Card и Tabs: ряд значков одного тона, и это не тон приглушённого текста',
    why: 'DS-231. В одной шапке `.ds-card__icon` брала `--ds-text-secondary`, а `.ds-card__chevron` и `.ds-card__tool` — `--ds-text-muted`; та же пара у Tabs: подпись вкладки на secondary, `.ds-tabs__icon` и `.ds-tabs__close` на muted. Пол при этом не нарушен (нетекстовый 3:1, muted на полосе секции даёт 4.47), и глазом 4.47 против 4.82 почти неразличимо — дефект не в контрасте, а в том, что на ОДНУ роль в ОДНОМ ряду отвечают два токена, и третий значок выбирался бы наугад. Решение: один тон, `--ds-text-secondary`, и более сильный из двух, а не более слабый — DS-204 уже увела с muted подпись, лежащую на ТОЙ ЖЕ полосе `--ds-section-bar`, и значки, оставшиеся на токене, с которого ушёл соседний текст, были бы вторым ответом на тот же вопрос. Случай меряет ВИДИМЫЙ цвет (`window.__seen`), а не `computed.color`: `opacity` предка в него не входит, и ряд, приглушённый обёрткой, читался бы номинально одинаковым. Три утверждения-различителя обязательны, иначе «покрасить всё одним» проходит: заголовок в той же шапке ОБЯЗАН отличаться от значков, активная вкладка ОБЯЗАНА держать акцент на своём значке (цвет как СОСТОЯНИЕ — законное употребление), и сам ряд обязан стоять именно на secondary, а не на muted — иначе откат всех пяти сразу выглядел бы зелёным',
    width: 720,
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} id="glyph-${t}">
      <div class="ds-card">
        <div class="ds-card__header ds-card__header--widget" id="g-head-${t}">
          <span class="ds-card__icon" id="g-icon-${t}" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="currentColor"/></svg></span>
          <button type="button" class="ds-card__toggle" aria-expanded="true">
            <svg class="ds-card__chevron" id="g-chevron-${t}" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5l6 6 6-6" stroke="currentColor" fill="none"/></svg>
            <span class="ds-card__titles"><span class="ds-card__title" id="g-title-${t}">Реализация товаров и услуг</span></span>
          </button>
          <span class="ds-card__tools"><button type="button" class="ds-card__tool" id="g-tool-${t}" aria-label="Обновить"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" fill="currentColor"/></svg></button></span>
        </div>
        <div class="ds-card__body">тело</div>
      </div>
      <div class="ds-tabs" data-position="top">
        <div class="ds-tabs__list">
          <div class="ds-tabs__item">
            <button type="button" class="ds-tabs__tab ds-tabs__tab--closable" id="g-tab-${t}"><span class="ds-tabs__icon" id="g-tabicon-${t}" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="currentColor"/></svg></span>Реализация</button>
            <button type="button" class="ds-tabs__close" id="g-close-${t}" aria-label="Закрыть вкладку"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor"/></svg></button>
          </div>
          <div class="ds-tabs__item">
            <button type="button" class="ds-tabs__tab is-active" id="g-tabactive-${t}"><span class="ds-tabs__icon" id="g-tabactiveicon-${t}" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="currentColor"/></svg></span>Поступление</button>
          </div>
        </div>
      </div>
    </div>`).join(''),
    measure: () => {
      const read = (theme) => {
        const root = document.getElementById(`glyph-${theme}`)
        // Токен-проба: отвечает на «на КАКОМ из двух серых стоит ряд». Без неё
        // случай знал бы только, что тон один, — а откат всех пяти значков
        // разом на muted тоже даёт один тон.
        const tok = (n) => {
          const probe = document.createElement('span')
          probe.style.cssText = `color: var(${n}); position: absolute; visibility: hidden`
          root.appendChild(probe)
          const v = getComputedStyle(probe).color
          probe.remove()
          return v
        }
        const bandProbe = document.createElement('span')
        bandProbe.style.cssText = 'background: var(--ds-section-bar); position: absolute; visibility: hidden'
        root.appendChild(bandProbe)
        const band = getComputedStyle(bandProbe).backgroundColor
        bandProbe.remove()
        const at = (id) => window.__seen(document.getElementById(`g-${id}-${theme}`))
        return {
          band,
          headBg: getComputedStyle(document.getElementById(`g-head-${theme}`)).backgroundColor,
          tabBg: getComputedStyle(document.getElementById(`g-tab-${theme}`)).backgroundColor,
          secondary: tok('--ds-text-secondary'),
          muted: tok('--ds-text-muted'),
          glyphs: {
            'Card/иконка': at('icon'),
            'Card/шеврон': at('chevron'),
            'Card/инструмент': at('tool'),
            'Tabs/значок': at('tabicon'),
            'Tabs/крестик': at('close'),
          },
          title: at('title'),
          tabLabel: at('tab'),
          activeIcon: at('tabactiveicon'),
        }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => {
      for (const theme of ['light', 'dark']) {
        const p = m[theme]
        // Фикстура мерит ТУ полосу: шапка виджета и вкладка в покое обе лежат
        // на `--ds-section-bar`. Потеря класса иначе увела бы весь ряд на белую
        // поверхность, и числа были бы не о том.
        if (p.headBg !== p.band) return `${theme}: шапка залита ${p.headBg}, а полоса секции — ${p.band}; фикстура мерит не ту подложку`
        if (p.tabBg !== p.band) return `${theme}: вкладка в покое залита ${p.tabBg}, а полоса секции — ${p.band}`

        const seen = Object.fromEntries(Object.entries(p.glyphs).map(([k, s]) => [k, seenPair(s).color]))
        const tones = [...new Set(Object.values(seen))]
        if (tones.length !== 1) {
          const by = Object.entries(seen).map(([k, c]) => `${k} ${c}`).join(', ')
          return `${theme}: ряд значков в ${tones.length} тона — ${by}`
        }
        const tone = tones[0]

        // Именно secondary. Ряд, целиком откатившийся на muted, тоже «одного
        // тона», и без этого утверждения был бы зелёным.
        if (tone !== p.secondary) {
          const what = tone === p.muted ? '`--ds-text-muted`' : 'не тон системы'
          return `${theme}: ряд значков стоит на ${what} (${tone}), а решение DS-231 — \`--ds-text-secondary\` (${p.secondary})`
        }

        // Различитель 1: заголовок в той же шапке. «Покрасить всё основным»
        // прошло бы обе проверки выше.
        const title = seenPair(p.title).color
        if (title === tone) return `${theme}: заголовок шапки того же цвета, что значки (${tone}) — уровней в шапке больше нет`

        // Различитель 2: подпись вкладки — сосед значков ПО СТРОКЕ, и она на
        // том же тоне. Это и есть «один ряд — один серый», сказанное про текст.
        const label = seenPair(p.tabLabel).color
        if (label !== tone) return `${theme}: подпись вкладки ${label}, а её значок и крестик ${tone} — в одной вкладке два тона`

        // Различитель 3: акцент активной вкладки. Цвет здесь несёт СОСТОЯНИЕ, и
        // «покрасить всё одним» обязано краснеть именно на нём.
        const active = seenPair(p.activeIcon).color
        if (active === tone) return `${theme}: значок активной вкладки не отличается от покоя (${tone}) — состояние «выбрана» перестало кодироваться`

        // Пол нетекстового 3:1 на полосе, где ряд и живёт. Число печатается
        // всегда: оно и есть предмет решения (4.82 против прежних 4.47).
        const cr = contrastOf(seenOn(p.glyphs['Card/иконка'], p.band), p.band)
        const was = contrastOf(p.muted, p.band)
        if (cr < 3) return `${theme}: значки дают ${cr.toFixed(2)} на полосе секции при нетекстовом поле 3`
        if (cr <= was) return `${theme}: выбран более слабый из двух — ${cr.toFixed(2)} против ${was.toFixed(2)} у muted`
      }
      return true
    },
  },
  {
    name: 'GlobalSearch и Combobox: активную строку метит КОЛЬЦО, а не фон 1.05 : 1',
    why: 'DS-160. Активная строка выдачи красилась одним `--ds-table-hover`: 1.09 : 1 к фону панели в свете и 1.04 в темноте при поле 3 : 1 для нетекстового указателя (SC 1.4.11). Другой приметы у строки не было и БЫТЬ НЕ МОГЛО в нынешней модели — фокус остаётся в поле, строка активна через `aria-activedescendant`, то есть `:focus-visible` на ней не сработает никогда; это следствие контракта, а не забытый стиль. Отсюда кольцо `--ds-focus-ring-inset` по КЛАССУ. Случай меряет цвет КОЛЬЦА, а не текста: обвод лежит в `box-shadow`, в `color` его нет вовсе, и `window.__seen` берёт его вторым аргументом — иначе замер отвечал бы про цвет подписи, которого вопрос не касается. Порог берётся к ДВУМ подложкам, а не к одной: указатель обязан отличаться от того, что вокруг него, а вокруг кольца две вещи — заливка своей строки внутри и заливка панели снаружи. Различитель обязателен и он ровно один: кольцо на СОСЕДНЕЙ строке обязано отсутствовать, иначе «обвести всё» проходит, а указателя нет. Контраст считается по яркости, поэтому «различима на ч-б» — то же самое утверждение, отдельного снимка в оттенках серого не нужно',
    width: 640,
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} id="row-${t}">
      <div class="ds-gsearch">
        <ul class="ds-gsearch__menu" id="gs-menu-${t}" role="listbox" style="position: static">
          <li class="ds-gsearch__option is-active" id="gs-active-${t}" role="option" aria-selected="true"><span>Реализация товаров и услуг</span><span class="ds-gsearch__group">Документы</span></li>
          <li class="ds-gsearch__option" id="gs-idle-${t}" role="option" aria-selected="false"><span>Поступление на расчётный счёт</span><span class="ds-gsearch__group">Документы</span></li>
        </ul>
      </div>
      <div class="ds-combobox">
        <div class="ds-combobox__popover" style="position: static">
        <ul class="ds-combobox__list" id="cb-menu-${t}" role="listbox">
          <li class="ds-combobox__option is-active" id="cb-active-${t}" role="option" aria-selected="true">Иванов И. И.</li>
          <li class="ds-combobox__option" id="cb-idle-${t}" role="option" aria-selected="false">Петров П. П.</li>
        </ul>
        </div>
      </div>
    </div>`).join(''),
    measure: () => {
      // Цвет кольца лежит в `box-shadow`, а не в `color`: computed-значение
      // выглядит как `rgb(14, 124, 124) 0px 0px 0px 2px inset`.
      const ringOf = (el) => {
        const sh = getComputedStyle(el).boxShadow
        if (!sh || sh === 'none') return null
        const m = sh.match(/rgba?\([^)]+\)/)
        return m ? { colour: m[0], inset: sh.includes('inset'), raw: sh } : null
      }
      const read = (theme) => {
        const root = document.getElementById(`row-${theme}`)
        const probe = document.createElement('div')
        probe.style.cssText = 'background: var(--ds-surface); position: absolute; visibility: hidden'
        root.appendChild(probe)
        const surface = getComputedStyle(probe).backgroundColor
        probe.remove()
        const one = (pfx) => {
          const active = document.getElementById(`${pfx}-active-${theme}`)
          const idle = document.getElementById(`${pfx}-idle-${theme}`)
          const menu = document.getElementById(`${pfx}-menu-${theme}`)
          const ring = ringOf(active)
          return {
            ring,
            // Снимок берётся С ПОДМЕНОЙ ЦВЕТА: слои те же (они и гасят кольцо
            // под `opacity` предка), а цвет — кольца, не подписи.
            ringSeen: ring ? window.__seen(active, ring.colour) : null,
            idleRing: ringOf(idle),
            rowSeen: window.__seen(active),
            rowBg: getComputedStyle(active).backgroundColor,
            panelSeen: window.__seen(menu),
            panelBg: getComputedStyle(menu).backgroundColor,
          }
        }
        return { surface, gs: one('gs'), cb: one('cb') }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => {
      for (const theme of ['light', 'dark']) {
        for (const [key, human] of [['gs', 'GlobalSearch'], ['cb', 'Combobox']]) {
          const p = m[theme][key]
          if (!p.ring) return `${theme}/${human}: у активной строки нет кольца — указателем остался один фон`
          if (!p.ring.inset) return `${theme}/${human}: кольцо не вставленное (${p.ring.raw}) — снаружи строки в списке его срежет сосед`

          // Различитель, и он ровно один нужный: обвести ВСЕ строки — значит не
          // обвести ни одной. Без него случай зеленел бы на правиле без `.is-active`.
          if (p.idleRing) return `${theme}/${human}: кольцо есть и у неактивной строки (${p.idleRing.raw}) — указатель ничего не указывает`

          // Подложек ДВЕ, и порог берётся к обеим: внутри кольца заливка своей
          // строки, снаружи — заливка панели.
          //
          // Обе берутся ВИДИМЫЕ, а не из `getComputedStyle().backgroundColor`.
          // Список `Combobox` собственного фона не имеет вовсе — заливка живёт
          // на `.ds-combobox__menu` выше, — и номинальное значение там
          // `rgba(0, 0, 0, 0)`: прозрачность, под которой ничего не «видно» и
          // против которой контраст не определён. `seenPair` складывает слои и
          // отдаёт непрозрачную подложку, то есть отвечает на вопрос «что под
          // кольцом на экране», а не «что написано у этого узла».
          const rowBg = seenPair(p.rowSeen).background
          const panelBg = seenPair(p.panelSeen).background
          // Фикстура мерит ПАНЕЛЬ, а не холст под ней. Ловушка не гипотетическая:
          // первая редакция этого случая написала `.ds-combobox__menu` — класса,
          // которого в системе нет (панель зовётся `__popover`), — список сел
          // прозрачным прямо на страницу, и «панель» приехала rgb(240, 240, 240),
          // то есть `--ds-bg-app`. Числа выглядели правдоподобно и были не о том.
          if (panelBg !== m[theme].surface) {
            return `${theme}/${human}: под строкой видно ${panelBg}, а панель системы — ${m[theme].surface}; фикстура мерит не ту подложку`
          }
          const crRow = contrastOf(seenOn(p.ringSeen, rowBg), rowBg)
          const crPanel = contrastOf(seenOn(p.ringSeen, panelBg), panelBg)
          if (crRow < 3) return `${theme}/${human}: кольцо даёт ${crRow.toFixed(2)} к заливке своей строки (${rowBg}) при поле 3`
          if (crPanel < 3) return `${theme}/${human}: кольцо даёт ${crPanel.toFixed(2)} к заливке панели (${panelBg}) при поле 3`

          // Санитар предмета: если заливка активной строки СРАВНЯЛАСЬ с панелью,
          // фикстура потеряла `.is-active` или токен, и оба числа выше сказаны
          // про строку, которой на экране не видно как строки.
          if (rowBg === panelBg) {
            return `${theme}/${human}: заливка активной строки равна заливке панели (${rowBg}) — фикстура потеряла состояние`
          }
        }
      }
      return true
    },
  },
  {
    name: '.ds-root перебивает правило body потребителя',
    why: 'чужой body забирал наследуемый color, и текст на светлой поверхности пропадал',
    extraCss: 'body { color: rgb(255,0,0); }',
    html: `<div><span id="bare">цифра</span></div>
           <div class="ds-root"><span id="rooted">цифра</span></div>`,
    measure: () => ({
      bare: getComputedStyle(document.querySelector('#bare')).color,
      rooted: getComputedStyle(document.querySelector('#rooted')).color,
      token: getComputedStyle(document.documentElement).getPropertyValue('--ds-text-primary').trim(),
    }),
    expect: (m) => m.rooted !== m.bare || `под .ds-root тот же цвет, что снаружи: ${m.rooted}`,
  },
  {
    name: 'Коробка: DS-элемент считается одинаково с обёрткой и без неё',
    why: 'до 1.7.0 модель задавал хозяин страницы: под Tailwind badge выходил 18px, без него 20',
    html: `<span class="ds-badge" id="bare">clean</span>
           <div class="ds-root"><span class="ds-badge" id="rooted">clean</span></div>`,
    measure: () => {
      const read = (sel) => {
        const el = document.querySelector(sel)
        return { bs: getComputedStyle(el).boxSizing, h: +el.getBoundingClientRect().height.toFixed(2) }
      }
      return { bare: read('#bare'), rooted: read('#rooted') }
    },
    expect: (m) => (m.bare.bs === 'border-box' && m.rooted.bs === 'border-box' && m.bare.h === m.rooted.h)
      || `без обёртки ${m.bare.bs} ${m.bare.h}px, внутри .ds-root ${m.rooted.bs} ${m.rooted.h}px`,
  },
  {
    name: 'Коробка: объявленная высота и есть видимая',
    why: 'с контентным боксом рамка добавлялась сверх токена, и --ds-h-* врал на 2px',
    html: `<span class="ds-badge" id="badge">clean</span>
           <button class="ds-btn" id="btn">Записать</button>
           <button class="ds-tabs__tab" id="tab">Вкладка</button>
           <button class="ds-pager__btn" id="pager">7</button>`,
    measure: () => {
      const off = []
      for (const sel of ['#badge', '#btn', '#tab', '#pager']) {
        const el = document.querySelector(sel)
        const declared = parseFloat(getComputedStyle(el).height)
        const rendered = el.getBoundingClientRect().height
        if (Math.abs(declared - rendered) > 0.5) off.push(`${sel} объявлено ${declared}, нарисовано ${rendered.toFixed(2)}`)
      }
      return { off }
    },
    expect: (m) => m.off.length === 0 || m.off.join('; '),
  },
  {
    name: 'Коробка: объявленная ширина с падингом не вылезает из слота',
    why: 'при контентном боксе тост при min-width 260 занимал 288 — на свой падинг с рамкой мимо панели',
    html: `<div id="slot" style="width:260px">
             <div class="ds-toast ds-toast--success" id="toast"><span class="ds-toast__msg">Проведено</span></div>
           </div>`,
    measure: () => ({
      slot: Math.round(document.querySelector('#slot').getBoundingClientRect().width),
      toast: Math.round(document.querySelector('#toast').getBoundingClientRect().width),
    }),
    expect: (m) => m.toast <= m.slot || `тост ${m.toast} в слоте ${m.slot}`,
  },
  {
    name: 'Коробка: чужая разметка внутри .ds-root остаётся на своей модели',
    why: 'скоуп по ds-префиксу выбран ради этого — DS не навязывает модель соседям',
    html: `<div class="ds-root">
             <div id="foreign" style="width:100px;padding:10px;border:1px solid red">чужой блок</div>
           </div>`,
    measure: () => {
      const el = document.querySelector('#foreign')
      return { bs: getComputedStyle(el).boxSizing, w: Math.round(el.getBoundingClientRect().width) }
    },
    expect: (m) => (m.bs === 'content-box' && m.w === 122)
      || `чужой блок стал ${m.bs}, ширина ${m.w} (ожидалось content-box, 122)`,
  },
  {
    name: 'Зебра: ручная вёрстка по .ds-table сохраняет прежний ритм',
    why: 'своя разметка с раскрытиями — рабочий сценарий трекера, менять ей полосатость нельзя',
    html: `<table class="ds-table"><tbody>
      <tr id="m1"><td>раз</td></tr><tr id="m2"><td>два</td></tr><tr id="m3"><td>три</td></tr>
    </tbody></table>`,
    measure: () => {
      const bg = (id) => getComputedStyle(document.getElementById(id)).backgroundColor
      return { first: bg('m1'), second: bg('m2'), third: bg('m3') }
    },
    expect: (m) => (m.first === m.third && m.first !== m.second)
      || `полоса сбилась: ${m.first} / ${m.second} / ${m.third}`,
  },
  {
    name: 'Зебра: в компонентном режиме служебная строка не сбивает счёт',
    why: 'nth-child считает заголовки групп наравне с данными — замерено на кейсе потребителя',
    html: `<table class="ds-table" data-ds-managed-rows><tbody>
      <tr class="ds-table__group"><td class="ds-table__lead" colspan="1">Группа</td></tr>
      <tr id="d1"><td class="ds-table__lead">раз</td></tr>
      <tr class="ds-table__row--even" id="d2"><td class="ds-table__lead">два</td></tr>
      <tr class="ds-table__group"><td class="ds-table__lead" colspan="1">Другая</td></tr>
      <tr id="d3"><td class="ds-table__lead">три</td></tr>
    </tbody></table>`,
    measure: () => {
      const bg = (id) => getComputedStyle(document.getElementById(id)).backgroundColor
      return { d1: bg('d1'), d2: bg('d2'), d3: bg('d3') }
    },
    expect: (m) => (m.d1 === m.d3 && m.d1 !== m.d2)
      || `чётность поехала: ${m.d1} / ${m.d2} / ${m.d3}`,
  },
  {
    name: 'Зебра: не перевешивает ни выделение строки, ни правило потребителя той же специфичности',
    why: '[data-ds-managed-rows]/.ds-table__row--even вне :where() поднимали вес зебры выше .is-selected и выше правила потребителя, подключённого после DS (одинаковая специфичность 0,2,2) — на чётной строке зебра побеждала независимо от порядка в каскаде',
    extraCss: '.ds-table tbody tr.tracker--overdue { background: red; }',
    html: `<table class="ds-table"><tbody>
      <tr><td class="ds-table__lead">0</td></tr>
      <tr><td class="ds-table__lead">1</td></tr>
      <tr id="selOdd" class="is-selected"><td class="ds-table__lead">2</td></tr>
      <tr id="selEven" class="is-selected"><td class="ds-table__lead">3</td></tr>
      <tr id="overdueOdd" class="tracker--overdue"><td class="ds-table__lead">4</td></tr>
      <tr id="overdueEven" class="tracker--overdue"><td class="ds-table__lead">5</td></tr>
    </tbody></table>`,
    // selOdd/overdueOdd сидят на нечётной позиции — зебра там ни на что не
    // претендует, поэтому их цвет всегда верный и служит эталоном. selEven/
    // overdueEven стоят на чётной позиции, где зебра и оспариваемое правило
    // встречаются: если чётная строка отличается от своего нечётного эталона
    // той же семантики, значит зебра забрала фон себе.
    measure: () => {
      const bg = (id) => getComputedStyle(document.getElementById(id)).backgroundColor
      return { selOdd: bg('selOdd'), selEven: bg('selEven'), overdueOdd: bg('overdueOdd'), overdueEven: bg('overdueEven') }
    },
    expect: (m) => (m.selEven === m.selOdd && m.overdueEven === m.overdueOdd)
      || `чётная строка разошлась со своим нечётным эталоном: выделение ${m.selEven} vs ${m.selOdd}, правило потребителя ${m.overdueEven} vs ${m.overdueOdd}`,
  },
  {
    name: 'Зебра (компонентный режим): не перевешивает ни выделение строки, ни правило потребителя той же специфичности',
    why: 'предыдущий случай построен на ручном пути (nth-child) и стережёт только его; компонентное правило .ds-table:where([data-ds-managed-rows]) tbody tr.ds-table__row--even — отдельная строка CSS с собственным весом, и без своего инварианта регрессия именно на ней прошла бы незамеченной 18 инвариантами и 341 тестом',
    extraCss: '.ds-table tbody tr.tracker--overdue { background: red; }',
    html: `<table class="ds-table" data-ds-managed-rows><tbody>
      <tr><td class="ds-table__lead">0</td></tr>
      <tr><td class="ds-table__lead">1</td></tr>
      <tr id="selOdd" class="is-selected"><td class="ds-table__lead">2</td></tr>
      <tr id="selEven" class="is-selected ds-table__row--even"><td class="ds-table__lead">3</td></tr>
      <tr id="overdueOdd" class="tracker--overdue"><td class="ds-table__lead">4</td></tr>
      <tr id="overdueEven" class="tracker--overdue ds-table__row--even"><td class="ds-table__lead">5</td></tr>
    </tbody></table>`,
    // Зеркало предыдущего случая, но в компонентном режиме: чётность несёт
    // класс ds-table__row--even, а не позиция в DOM. selOdd/overdueOdd без
    // этого класса — эталон правильного цвета; selEven/overdueEven с ним —
    // то, где зебра компонентного правила и оспариваемое правило встречаются.
    measure: () => {
      const bg = (id) => getComputedStyle(document.getElementById(id)).backgroundColor
      return { selOdd: bg('selOdd'), selEven: bg('selEven'), overdueOdd: bg('overdueOdd'), overdueEven: bg('overdueEven') }
    },
    expect: (m) => (m.selEven === m.selOdd && m.overdueEven === m.overdueOdd)
      || `строка с ds-table__row--even разошлась со своим эталоном без класса: выделение ${m.selEven} vs ${m.selOdd}, правило потребителя ${m.overdueEven} vs ${m.overdueOdd}`,
  },
  {
    name: 'Иерархия: отступ растёт с глубиной',
    why: 'без отступа дерево читается как плоский список, а уровень виден только по треугольнику; проверка только на равномерность шага пропустила бы и шаг в 1px — величина должна совпадать с токеном',
    html: `<table class="ds-table" data-ds-managed-rows><tbody>
      <tr><td class="ds-table__lead" id="lvl0">корень</td></tr>
      <tr><td class="ds-table__lead" id="lvl1" style="--ds-row-depth:1">ветка</td></tr>
      <tr><td class="ds-table__lead" id="lvl2" style="--ds-row-depth:2">лист</td></tr>
      <tr class="ds-table__group"><td class="ds-table__lead" colspan="1" id="grp1" style="--ds-row-depth:1">Вложенная группа</td></tr>
    </tbody></table>`,
    measure: () => {
      const pad = (id) => parseFloat(getComputedStyle(document.getElementById(id)).paddingLeft)
      const probe = document.body.appendChild(document.createElement('div'))
      probe.style.width = 'var(--ds-space-5)'
      const step = parseFloat(getComputedStyle(probe).width)
      probe.remove()
      return { l0: pad('lvl0'), l1: pad('lvl1'), l2: pad('lvl2'), grp1: pad('grp1'), step }
    },
    expect: (m) => {
      if (!(m.l1 > m.l0) || Math.abs((m.l2 - m.l1) - (m.l1 - m.l0)) >= 0.5) {
        return `шаг неравномерный: ${m.l0} / ${m.l1} / ${m.l2}`
      }
      if (Math.abs((m.l1 - m.l0) - m.step) >= 0.5) {
        return `шаг ${(m.l1 - m.l0).toFixed(2)}px не совпал с --ds-space-5 (${m.step.toFixed(2)}px)`
      }
      if (Math.abs(m.grp1 - m.l1) >= 0.5) {
        return `ячейка вложенной группы на той же глубине получила другой отступ: ${m.grp1} vs ${m.l1}`
      }
      return true
    },
  },
  {
    name: 'Иерархия: текст ведущей колонки стоит на своей глубине, каретка ему не сдвигает',
    why: 'соседний случай мерит ПАДИНГ ячейки и держится, а видно потребителю ЛЕВЫЙ КРАЙ ТЕКСТА: каретка (пол цели 24px) вдвое шире шага глубины (12px), и пока она стояла в потоке, лист уезжал ЛЕВЕЕ собственного родителя — иерархия читалась перевёрнутой (DS-143)',
    // ДВЕ ФОРМЫ ячейки, а не одна, и это цена, заплаченная за уже сделанную
    // ошибку. Первая редакция и правила, и этого случая знала только `<span>` —
    // инлайновый сосед каретки. У назначенной строки (`rowHeader` плюс
    // `onRowClick`) имя лежит в `.ds-table__rowbtn`, а он `display: block`:
    // каретка уезжала на свою строку, и лист оказывался правее родителя на
    // 36px вместо 12 — тот же дефект в той же таблице, мимо зелёного замера.
    // Фикстура обязана нести ту разметку, которую компонент РИСУЕТ, а не ту,
    // на которой правило удобно проверять.
    //
    // Три шкалы, а не одна: шаг глубины едет по `--ds-ui-scale`, пол цели 24px
    // — нет, и на мелкой шкале промах только растёт. Шкала 2 держит ВТОРУЮ
    // половину правила: ширина коробки — max(пол цели, шеврон), и до ~1.71
    // побеждает пол, то есть на всех рабочих шкалах голый `--ds-target-min`
    // выглядел бы верным. Без этой шкалы max() был бы утверждением, которого
    // никто не проверяет.
    html: [['a', '1'], ['b', '0.875'], ['c', '2']].flatMap(([k, sc]) =>
      [['s', false], ['h', true]].map(([f, head]) => `
      <div class="ds-scale" style="--ds-ui-scale: ${sc}">
      <table class="ds-table" data-ds-managed-rows><tbody>
        ${[0, 1, 1, 2].map((depth, n) => {
          const id = `${k}${f}${n}`
          const caret = n === 0 || n === 2
          const cell = head ? 'th scope="row"' : 'td'
          return `<tr><${cell} class="ds-table__lead ds-table__lead--tree${head ? ' ds-table__rowhead' : ''}"`
            + `${depth ? ` style="--ds-row-depth:${depth}"` : ''}>`
            + (caret ? '<button class="ds-table__toggle ds-table__toggle--row"><svg class="ds-caret ds-caret--branch"></svg></button>' : '')
            + (head ? `<button class="ds-table__rowbtn" id="${id}">Строка ${n}</button>`
                    : `<span id="${id}">Строка ${n}</span>`)
            + `</${head ? 'th' : 'td'}></tr>`
        }).join('')}
      </tbody></table></div>`)).join(''),
    // Замер — по КРАЮ ТЕКСТА, а не по падингу ячейки: падинг у листа и у узла и
    // был одинаковым, дефект жил в каретке, которая в падинг не входит.
    // Высота ячейки снимается вместе с краем: каретка, уехавшая на свою строку,
    // сдвига края НЕ даёт (обе строки начинаются от края падинга) — её видно
    // только по тому, что ячейка стала вдвое выше.
    measure: () => {
      const out = {}
      for (const k of ['a', 'b', 'c']) {
        for (const f of ['s', 'h']) {
          const el = (n) => document.getElementById(`${k}${f}${n}`)
          const probe = el(0).parentElement.appendChild(document.createElement('div'))
          probe.style.width = 'var(--ds-space-5)'
          const step = parseFloat(getComputedStyle(probe).width)
          probe.remove()
          const base = el(0).closest('table').getBoundingClientRect().left
          out[k + f] = {
            t: [0, 1, 2, 3].map((n) => +(el(n).getBoundingClientRect().left - base).toFixed(1)),
            h: [0, 1, 2, 3].map((n) => +el(n).closest('td, th').getBoundingClientRect().height.toFixed(1)),
            step,
          }
        }
      }
      return out
    },
    expect: (m) => {
      const depth = [0, 1, 1, 2]
      const scaleOf = { a: '1', b: '0.875', c: '2' }
      const formOf = { s: 'обычная ячейка', h: 'назначенная строка (__rowbtn)' }
      for (const key of Object.keys(m)) {
        const { t, h, step } = m[key]
        const where = `шкала ${scaleOf[key[0]]}, ${formOf[key[1]]}`
        for (let n = 1; n < 4; n++) {
          const want = t[0] + step * depth[n]
          if (Math.abs(t[n] - want) >= 0.5) {
            return `${where}: строка ${n} на глубине ${depth[n]} начинается с ${t[n].toFixed(1)}px`
              + ` вместо ${want.toFixed(1)}px (шаг ${step.toFixed(2)}px); края: ${t.map((x) => x.toFixed(1)).join(' / ')}`
          }
        }
        // Строка с кареткой не выше строки без неё: знак лежит в гуттере, вне
        // потока, и второй строки в ячейке не заводит.
        if (Math.abs(h[0] - h[1]) >= 0.5) {
          return `${where}: ячейка с кареткой ${h[0]}px против ${h[1]}px без неё — знак ушёл на свою строку`
        }
      }
      return true
    },
  },
  {
    name: 'Calendar: embedded снимает рамку и тень панели',
    why: 'модификатор объявляли до базового правила, и при равной специфичности он проигрывал',
    html: `<div class="ds-cal ds-cal--embedded" id="c"></div>`,
    measure: () => {
      const cs = getComputedStyle(document.querySelector('#c'))
      return { border: cs.borderTopWidth, shadow: cs.boxShadow, padding: cs.paddingTop }
    },
    expect: (m) => (parseFloat(m.border) === 0 && m.shadow === 'none' && parseFloat(m.padding) === 0)
      || `border ${m.border}, shadow ${m.shadow}, padding ${m.padding}`,
  },
  {
    name: 'Calendar: края сетки дней совпадают с краями шапки, в карточке дни не растащены',
    why: 'DS-321. Стрелки и селекты шапки встали на пол цели клика, и на мелких шкалах шапка стала самой широкой строкой панели (`inline-block`). Трек дня, прибитый к номиналу, оставлял сетку у левого края и пустую полосу справа — 5.75 px на 0.875, 18 px на 0.8 при корне 14 — и › переставала стоять над «Вс». Трек стал `1fr`, номинал несёт `width` заголовка дня недели. Три утверждения, потому что у правила три половины: остаток шапки уходит дням (A); без шапки сетка просит ровно номинал, то есть носитель работает (C); в `embedded` панель шириной в карточку, и дни там НЕ растягиваются (B)',
    // Разметка снята с `Calendar.tsx` (ветка с `onNavigate`, months = 1).
    // Шкала 0.8: запас шапки над сеткой ~21 px при корне 16 — утверждение A
    // не зависит от того, сколько пикселей даст шрифт у селекта; нехватка
    // запаса ловится предусловием, а не проходит молча.
    html: (() => {
      const grid = (k) => `<div class="ds-cal__month"><div class="ds-cal__grid">`
        + ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => `<span class="ds-cal__dow">${w}</span>`).join('')
        + Array.from({ length: 14 }, (_, i) => `<button class="ds-cal__day" data-k="${k}"><span class="ds-cal__day-num">${i + 1}</span></button>`).join('')
        + `</div></div>`
      const head = `<div class="ds-cal__header">
          <select class="ds-cal__select"><option>2026</option></select>
          <select class="ds-cal__select"><option>Сентябрь</option></select>
          <span class="ds-cal__spacer"></span>
          <button class="ds-cal__nav">‹</button><button class="ds-cal__nav">›</button></div>`
      return `
      <div class="ds-scale" style="--ds-ui-scale: 0.8; width: 400px"><div class="ds-cal" id="calA">${head}${grid('A')}</div></div>
      <div class="ds-scale" style="--ds-ui-scale: 0.8; width: 400px"><div class="ds-cal ds-cal--embedded" id="calB">${head}${grid('B')}</div></div>
      <div class="ds-scale" style="--ds-ui-scale: 1; width: 400px"><div class="ds-cal" id="calC">${grid('C')}</div></div>`
    })(),
    measure: () => {
      const f = (x) => +x.toFixed(2)
      const out = {}
      for (const k of ['A', 'B', 'C']) {
        const cal = document.getElementById('cal' + k)
        const cs = getComputedStyle(cal)
        const r = cal.getBoundingClientRect()
        const cl = r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)
        const cr = r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
        const days = [...cal.querySelectorAll('.ds-cal__day')].slice(0, 7).map((d) => d.getBoundingClientRect())
        const probe = cal.appendChild(document.createElement('div'))
        probe.style.cssText = 'position:absolute;width:calc(1.875rem * var(--ds-ui-scale))'
        const nominal = probe.getBoundingClientRect().width
        probe.style.width = 'calc(7 * 1.875rem * var(--ds-ui-scale) + 6 * var(--ds-space-1))'
        const gridNominal = probe.getBoundingClientRect().width
        probe.remove()
        out[k] = { left: f(days[0].left - cl), right: f(cr - days[6].right), cell: f(days[0].width),
          nominal: f(nominal), content: f(cr - cl), gridNominal: f(gridNominal) }
      }
      return out
    },
    expect: ({ A, B, C }) => {
      if (A.content - A.gridNominal < 2) {
        return `предусловие: шапка A не шире номинальной сетки (${A.content} против ${A.gridNominal}) — утверждение о краях ничего бы не проверило`
      }
      if (Math.abs(A.left) > 0.5 || Math.abs(A.right) > 0.5) {
        return `A (панель, шапка шире сетки, шкала 0.8): зазор сетки до края контента слева ${A.left}, справа ${A.right} — сетка не дотянута до шапки`
      }
      if (Math.abs(B.cell - B.nominal) > 0.5) {
        return `B (embedded в 400 px): день ${B.cell} при номинале ${B.nominal} — дни растащены по ширине карточки`
      }
      if (Math.abs(C.cell - C.nominal) > 0.5) {
        return `C (панель без шапки, шкала 1): день ${C.cell} при номинале ${C.nominal} — сетка не просит номинал, носитель ширины потерян`
      }
      return true
    },
  },
  {
    name: 'Calendar: выбранный день под курсором не берёт фон обычного',
    why: 'X:hover:not(:disabled) весит (0,3,0) и перебивал .is-selected — белый текст на почти белом',
    html: `<div class="ds-cal">
      <button class="ds-cal__day" id="plain">23</button>
      <button class="ds-cal__day is-selected" id="sel">24</button></div>`,
    // Подсветка выбранного дня при наведении задумана (--ds-accent-hover), поэтому
    // требовать полного отсутствия реакции неверно. Инвариант в другом: он не
    // должен получить фон, которым подсвечивается ОБЫЧНЫЙ день.
    hoverPair: ['#plain', '#sel'],
    expect: (m) => m.selHovered !== m.plainHovered
      || `выбранный день получил фон обычного: ${m.selHovered}`,
  },
  {
    name: 'Calendar: день соседнего месяца читается НА ЭКРАНЕ, в обеих темах',
    why: 'DS-209. `.ds-cal__day--out` был `color: var(--ds-text-muted); opacity: 0.65` на КНОПКЕ, и номинальный контраст — тот, что считает `getComputedStyle(el).color` против `backgroundColor`, — давал 5.33 в свете и 5.38 в темноте, то есть чистое AA. На экране было 2.65 и 3.12: `opacity` не входит ни в одно вычисленное значение, она применяется при отрисовке. Разряд дефекта — «прошло, не проверив»: число правдоподобно, гейт зелён, а axe независимо показывал 2.64 на `span.ds-cal__day-num`. Освобождение для выключенного сюда НЕ относится — день соседнего месяца кликабелен: `onClick` зовёт `onSelect` с его датой, как у любого дня (месяц он при этом НЕ листает — прежняя редакция этой фразы утверждала обратное, и утверждала неверно; листают стрелки шапки через `onNavigate`). Утверждение поэтому не «цвет приглушён», а «видимый контраст берёт 4.5», и меряется оно через общий помощник `window.__seen`, который складывает слои так же, как их складывает браузер',
    // Разметка снята с `Calendar.tsx` (ветка не readOnly): кнопка с
    // `aria-label`-датой, число внутри отдельным `<span class="ds-cal__day-num">`
    // — axe ловил нарушение именно на нём, и мерить надо тот же узел.
    // Выходной соседнего месяца стоит здесь не для полноты: `--weekend` и
    // `--out` равны по весу (обе 0,1,0), спор решает ПОРЯДОК в листе, и правка,
    // переставившая правила, увела бы день в оранжевый молча.
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px">
      <div class="ds-cal"><div class="ds-cal__months"><div class="ds-cal__month">
        <div class="ds-cal__month-label">июль 2026</div>
        <div class="ds-cal__grid">
          ${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
            .map((w, i) => `<span class="ds-cal__dow${i >= 5 ? ' ds-cal__dow--weekend' : ''}">${w}</span>`).join('')}
          <button type="button" class="ds-cal__day ds-cal__day--out" aria-label="29 июня 2026" aria-pressed="false" tabindex="-1"><span class="ds-cal__day-num" id="cal-out-${t}">29</span></button>
          <button type="button" class="ds-cal__day ds-cal__day--out ds-cal__day--weekend" aria-label="28 июня 2026" aria-pressed="false" tabindex="-1"><span class="ds-cal__day-num" id="cal-outwk-${t}">28</span></button>
          <button type="button" class="ds-cal__day" aria-label="1 июля 2026" aria-pressed="false" tabindex="0"><span class="ds-cal__day-num" id="cal-in-${t}">1</span></button>
        </div>
      </div></div></div>
      <span id="cal-surface-${t}" style="background: var(--ds-surface)"></span>
    </div>`).join(''),
    measure: () => {
      const out = {}
      for (const t of ['light', 'dark']) {
        const seen = (id) => window.__seen(document.getElementById(id))
        out[t] = {
          out: seen(`cal-out-${t}`),
          outWeekend: seen(`cal-outwk-${t}`),
          live: seen(`cal-in-${t}`),
          // Пробник, а не `getPropertyValue`: токен отдаётся как записан
          // (`#FFFFFF`), а вся арифметика ниже разбирает `rgb(...)`.
          surface: getComputedStyle(document.getElementById(`cal-surface-${t}`)).backgroundColor,
        }
      }
      return out
    },
    expect: (m) => {
      const fails = []
      for (const [t, r] of Object.entries(m)) {
        for (const [what, snap] of [['день соседнего месяца', r.out], ['он же на выходном', r.outWeekend]]) {
          const seen = seenPair(snap)
          // САНИТАР НА САМ ЗАМЕР: помощник обязан привести к той поверхности,
          // на которой день и лежит. Верни он что угодно другое — числа ниже
          // остались бы правдоподобными и были бы не о том месте.
          if (seen.background !== r.surface) {
            fails.push(`${t}: ${what} сложился на подложке ${seen.background}, а --ds-surface здесь ${r.surface} — снимок слоёв не о том месте`)
            continue
          }
          // Прямое утверждение про механизм, а не только про число: прозрачность
          // красит ГРУППУ, то есть заодно гасит кольцо фокуса и точку отметки
          // внутри дня, и ни одно номинальное значение об этом не говорит.
          if (seen.alpha !== 1) {
            fails.push(`${t}: ${what} снова гасится прозрачностью (${seen.alpha}) — она не видна ни одному номинальному замеру`)
          }
          const k = contrastOf(seen.color, seen.background)
          if (k < 4.5) fails.push(`${t}: ${what} ${seen.color} на ${seen.background} даёт ${k.toFixed(2)} при поле 4.5`)
        }
        // РАЗЛИЧИМОСТЬ. Без этой пары случай проходил бы на разметке, где
        // модификатор снят вовсе: день соседнего месяца стал бы обычным, взял
        // бы `--ds-text-primary` и все проверки выше сошлись бы с запасом.
        const faint = seenPair(r.out)
        const live = seenPair(r.live)
        if (faint.color === live.color) {
          fails.push(`${t}: день соседнего месяца того же тона, что свой (${live.color}) — сетка не делится на месяцы`)
        }
        if (contrastOf(faint.color, faint.background) >= contrastOf(live.color, live.background)) {
          fails.push(`${t}: чужой день не слабее своего (${contrastOf(faint.color, faint.background).toFixed(2)} против ${contrastOf(live.color, live.background).toFixed(2)})`)
        }
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'Calendar: класс дня несут ДВА носителя, и второй переживает наведение',
    why: 'DS-234. Дефект нашёл слепой человеческий глаз с расстояния вытянутой руки — «технически 2 уровня, но различаются слабо, это пустой серый + серый», — и ни один гейт не краснел, потому что ЧИСЛО было в порядке: обычный день против чужого даёт 3.28 в свете. Предмет не «мало контраста», а «класс несёт цвет и больше ничего». Три цветовых выхода закрыты замером и записаны в `Calendar.css`: подложки под чужим днём не существует (предел #FDFDFD, ΔE 0.69 от белой при пороге заметности 2.3), плашка под своими днями почти не видна (ΔE 2.77) и роняет выходной, четвёртого серого нет (окно faint↔muted ΔL* ≈ 4). Носителем стало НАЧЕРТАНИЕ: 400 чужой, 500 свой, 600 выбранный. Утверждение здесь — «носителей два», а НЕ «стало контрастнее»: цветовой шаг 3.28/2.67 правка не трогает, и проверять его тут было бы проверкой не того. Главное — вторая половина случая: по DS-229 чужой день ПОД КУРСОРОМ берёт обычный тон, и до этой правки там не оставалось ни одного носителя вовсе',
    // Разметка снята с `Calendar.tsx`, ветка не readOnly. Выбранный день здесь
    // не для полноты: без него «начертания различаются» выполнялось бы и на
    // иерархии, перевёрнутой вверх ногами, — а чужой день обязан быть ЛЕГЧЕ
    // своего, иначе контекст кричит громче предмета.
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px">
      <div class="ds-cal"><div class="ds-cal__months"><div class="ds-cal__month">
        <div class="ds-cal__grid">
          <button type="button" class="ds-cal__day ds-cal__day--out" aria-label="29 июня 2026" id="w-out-${t}"><span class="ds-cal__day-num">29</span></button>
          <button type="button" class="ds-cal__day" aria-label="1 июля 2026" id="w-in-${t}"><span class="ds-cal__day-num">1</span></button>
          <button type="button" class="ds-cal__day is-selected" aria-label="2 июля 2026" aria-pressed="true" id="w-sel-${t}"><span class="ds-cal__day-num">2</span></button>
          <button type="button" class="ds-cal__day ds-cal__day--out" disabled aria-label="30 июня 2026" id="w-outdis-${t}"><span class="ds-cal__day-num">30</span></button>
        </div>
      </div></div></div>
    </div>`).join(''),
    // Наводится только светлый: приём один на обе темы, а наведение — самая
    // дорогая часть замера (уход курсора, два снимка на каждую пару).
    hoverWeights: [['#w-out-light', '#w-out-light']],
    measure: () => {
      const out = {}
      for (const t of ['light', 'dark']) {
        const w = (id) => {
          const cs = getComputedStyle(document.getElementById(id))
          return { weight: Number(cs.fontWeight), color: cs.color }
        }
        out[t] = { out: w(`w-out-${t}`), live: w(`w-in-${t}`), sel: w(`w-sel-${t}`), outDis: w(`w-outdis-${t}`) }
      }
      return out
    },
    expect: (m) => {
      const fails = []
      for (const t of ['light', 'dark']) {
        const r = m[t]
        // Носителя ДВА, и оба проверяются порознь: цветовой (он был и остаётся)
        // и начертание (его не было). Совпади любой из них — класс держится на
        // одном, то есть дефект вернулся.
        if (r.out.color === r.live.color) {
          fails.push(`${t}: чужой день того же тона, что свой (${r.live.color}) — цветовой носитель пропал`)
        }
        if (r.out.weight === r.live.weight) {
          fails.push(`${t}: чужой день того же начертания, что свой (${r.live.weight}) — носитель ОДИН, цвет; ровно тот дефект, который видели глазом`)
        }
        // Направление: контекст обязан УБАВЛЯТЬ. Без этой пары проверка выше
        // проходила бы и на перевёрнутой иерархии.
        if (!(r.out.weight < r.live.weight && r.live.weight < r.sel.weight)) {
          fails.push(`${t}: иерархия начертаний не 400 < 500 < 600, а ${r.out.weight} / ${r.live.weight} / ${r.sel.weight}`)
        }
        // Чужой день ПЕРЕЖИВАЕТ выключение (DS-233) — значит и начертание
        // у него остаётся чужим. Правило `--out:disabled` возвращает тон; если
        // оно однажды вернёт и вес, класс потеряется на выключенных днях молча.
        if (r.outDis.weight !== r.out.weight) {
          fails.push(`${t}: выключенный чужой день сменил начертание (${r.out.weight} → ${r.outDis.weight}) — чужой месяц обязан переживать выключение`)
        }
      }
      const hv = m.weights['#w-out-light']
      if (!hv.landed) {
        // Санитар: курсор не доехал — тогда всё ниже про покой, а не про
        // наведение, и выглядит это зелено.
        fails.push('курсор не доехал до чужого дня: тон под наведением не изменился, читался покой')
      } else {
        if (Number(hv.seen.weight) !== Number(hv.rest.weight)) {
          fails.push(`под курсором чужой день сменил начертание (${hv.rest.weight} → ${hv.seen.weight}) — под курсором он теряет и цветовой носитель (DS-229), значит начертание там ЕДИНСТВЕННОЕ и меняться не имеет права`)
        }
        if (hv.seen.color === hv.rest.color) {
          fails.push('под курсором чужой день не сменил тон — правило DS-229 пропало, и вторая половина этого случая проверяет пустоту')
        }
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'CommandBar не раздвигает страницу: не влезшее остаётся В ПОЛОСЕ, а «Ещё» достижима',
    why: 'DS-170 плюс DS-239. Сначала у `.ds-cmdbar` не было ни переноса, ни своего `overflow`, а кнопки не ужимаются ниже подписи: лишнее выпирало из полосы и двигало ДОКУМЕНТ (кадр 360, шесть действий, шкала 1 — документ 642 при clientWidth 360; кадр 768 при шкале 1.25 — 794 при 768). Числа не менялись от ширины кадра вовсе, то есть полоса в раскладке не участвовала. Теперь не влезшее сворачивается в «Ещё», и держат это ДВА правила листа: `min-width: 0` у ряда (без него флекс-элемент не ужимается ниже содержимого) и `overflow: hidden` у свёрнутого ряда (свёрнутые действия остаются В ПОТОКЕ — из их ширины считается следующий замер, — и от края их отрезает только он). Снять любое — и симптом возвращается ровно тот же',
    // Девять точек: три ширины × три шкалы. Одной мало по существу дефекта —
    // он живёт на ПЕРЕСЕЧЕНИИ «узкий кадр × шкала», и волна 4 его пропустила
    // именно потому, что смотрела кадры на одной шкале.
    //
    // Разметка снята с компонента. Сколько действий видно, страница считать не
    // умеет — это работа `fitCount`, и проверяется она без DOM
    // (`src/internal/overflow.test.ts`); здесь нарисован ХУДШИЙ случай: ряд
    // свёрнут, но не свёрнуто НИ ОДНО действие, то есть содержимое заведомо
    // шире ряда. Что панель считает и ставит числа сама, держит
    // `CommandBar.test.tsx`. Тройка, а не дубль: арифметика переживёт сломанный
    // лист, лист переживёт сломанную арифметику, а проводка — обе.
    width: 900,
    html: [1, 1.25, 1.5].flatMap((sc) => [HOST_440, 440, 768, 900].map((w) => `
      <div class="ds-scale" style="--ds-ui-scale: ${sc}; width: ${w}px" id="cb-wrap-${sc}-${w}" data-cb data-sc="${sc}" data-w="${w}">
        <div class="ds-cmdbar" role="toolbar" aria-label="Действия" id="cb-${sc}-${w}">
          <div class="ds-cmdbar__row is-folded" id="cb-row-${sc}-${w}">
            ${['Создать', 'Скопировать', 'Изменить', 'Провести', 'Отменить проведение',
               'Печать', 'Отчёты', 'Заполнить', 'Обновить', 'Настроить список',
               'Экспорт', 'Обмен с банком'].map((label, i) => `<button type="button" class="ds-btn ds-btn--${i === 0 ? 'primary' : 'ghost'} ds-btn--sm" data-ds-action${i >= 8 ? ` data-ds-folded="true"` : ''}${i === 8 ? ` id="cb-hidden-${sc}-${w}"` : ''}><span class="ds-btn__label">${label}</span></button>`).join('')}
          </div>
          <div class="ds-cmdbar__more" id="cb-more-${sc}-${w}"><div class="ds-dropdown"><button type="button" class="ds-btn ds-btn--ghost ds-btn--sm ds-dropdown__trigger"><span class="ds-btn__label">Ещё</span></button></div></div>
        </div>
      </div>`)).join(''),
    measure: () => {
      const out = { doc: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }, points: {} }
      // Обход по РАЗМЕТКЕ, а не по своему списку шкал и ширин: список,
      // переписанный в двух местах, расходится молча — точка, добавленная в
      // `html` и забытая здесь, просто не меряется, и случай остаётся зелёным
      // ровно там, где его расширили (DS-290).
      for (const wrap of document.querySelectorAll('[data-cb]')) {
        const sc = wrap.dataset.sc, w = wrap.dataset.w
        const bar = document.getElementById(`cb-${sc}-${w}`)
        const row = document.getElementById(`cb-row-${sc}-${w}`)
        const more = document.getElementById(`cb-more-${sc}-${w}`)
        const hidden = document.getElementById(`cb-hidden-${sc}-${w}`)
        out.points[`${w}×${sc}`] = {
          barRight: bar.getBoundingClientRect().right,
          wrapRight: wrap.getBoundingClientRect().right,
          rowScroll: row.scrollWidth,
          rowClient: row.clientWidth,
          moreRight: more.getBoundingClientRect().right,
          moreWidth: more.getBoundingClientRect().width,
          foldedVisibility: getComputedStyle(hidden).visibility,
        }
      }
      return out
    },
    expect: (m) => {
      const fails = []
      // Главное утверждение — и оно ОДНО на всю страницу: документ не поехал.
      if (m.doc.scroll > m.doc.client + 1) {
        fails.push(`документ ${m.doc.scroll} при кадре ${m.doc.client} — страница уехала вбок`)
      }
      for (const [at, p] of Object.entries(m.points)) {
        if (p.barRight > p.wrapRight + 1) {
          fails.push(`${at}: полоса кончается на ${p.barRight.toFixed(0)} при правом крае колонки ${p.wrapRight.toFixed(0)} — выпирает из места, которое ей отвели`)
        }
        // САНИТАР: на этих точках содержимое ОБЯЗАНО не влезать. Умести оно —
        // «страница не поехала» выполнялось бы тривиально, и случай молчал бы
        // ровно о том, ради чего написан.
        if (p.rowScroll <= p.rowClient + 1) {
          fails.push(`${at}: содержимое (${p.rowScroll}) влезло в ряд (${p.rowClient}) — точка не о переполнении`)
        }
        // «Ещё» — единственная дверь к свёрнутому. Уехала она за край полосы —
        // и не влезшие действия потеряны совсем, что хуже прежней прокрутки.
        if (p.moreWidth < 1) {
          fails.push(`${at}: кнопка «Ещё» нулевой ширины — свёрнутое недостижимо`)
        }
        if (p.moreRight > p.barRight + 1) {
          fails.push(`${at}: «Ещё» кончается на ${p.moreRight.toFixed(0)} при правом крае полосы ${p.barRight.toFixed(0)} — сама уехала за край`)
        }
        // Свёрнутое спрятано `visibility`, а не `display`: вместе с узлом
        // исчезла бы его ширина, из которой считается следующий замер.
        if (p.foldedVisibility !== 'hidden') {
          fails.push(`${at}: свёрнутое действие видно (visibility: ${p.foldedVisibility}) — оно нарисовано вторым экземпляром рядом с пунктом меню`)
        }
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: '«Ещё» в полосе неотличима от действия полосы: та же коробка и тот же тон, в покое и под курсором',
    why: 'DS-359. До неё `DropdownMenu` оборачивал переданный триггер в СВОЮ кнопку, и надеть на обёртку `.ds-btn` было нельзя — вложенная кнопка. Поэтому `CommandBar.css` и `AppBar.css` перерисовывали вид `ghost`+`sm` поимённо, одиннадцатью строками токенов на каждую полосу: две копии одного вида, которые расходятся молча при первой правке `Button`. Теперь триггер — настоящий `Button size="sm" variant="ghost"`, и утверждение «Ещё» это такая же кнопка полосы» проверяемо прямо: два узла сравниваются МЕЖДУ СОБОЙ, а не с числами. Прибитые числа отвечали бы на другой вопрос и протухали бы на каждой шкале. Под курсором — потому что подсветка у полосы своя, и копия вида, совпавшая в покое, легко расходится в наведении: ровно это и было третьим пунктом приёмки глазами',
    viewport: 1500,
    bundle: 'scripts/measure-more.tsx',
    html: '<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;padding-left:40px">'
      + MORE_POINTS.map((p, i) => `<div class="ds-root ds-scale"${p.theme === 'dark' ? ' data-theme="dark"' : ''}`
        + ` style="--ds-ui-scale:${p.sc};width:${p.w}px" id="mh-${i}"`
        + ` data-more data-i="${i}" data-c="${p.c}" data-case="${p.id}" data-sc="${p.sc}" data-th="${p.theme}" data-w="${p.w}"></div>`).join('')
      + '</div>',
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-more]')]
      for (const el of hosts) WB.mountCase(el, el.dataset.c, el.dataset.case)
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      // Свёртка решается ЗАМЕРОМ и пересчитывается по `ResizeObserver` и по
      // `document.fonts.ready`; ждём, пока число видимых действий не перестанет
      // меняться, а не фиксированное число кадров.
      let prev = null, settled = false
      const shape = () => hosts.map((el) => [...el.querySelectorAll('[data-ds-action]')]
        .filter((b) => b.getAttribute('data-ds-folded') !== 'true').length).join(',')
      for (let i = 0; i < 60; i++) {
        await frame()
        const now = shape()
        if (now === prev) { settled = true; break }
        prev = now
      }
      return {
        settled,
        rows: hosts.map((el) => {
          const i = el.dataset.i
          const more = el.querySelector('.ds-dropdown__trigger')
          const wrap = el.querySelector('.ds-cmdbar__more, .ds-appbar__more')
          const vis = [...el.querySelectorAll('[data-ds-action]')]
            .filter((b) => b.getAttribute('data-ds-folded') !== 'true')
          const ghost = vis.filter((b) => b.classList.contains('ds-btn--ghost'))
          // `id` вешается ЗДЕСЬ: кто именно остался видимым, решает свёртка, и
          // до замера этого не знает никто. Под курсор их поведёт `hoverStyles`
          // по этим самым именам.
          if (more) more.id = `more-${i}`
          if (ghost.length) ghost[ghost.length - 1].id = `nb-${i}`
          return {
            at: `${el.dataset.c}/${el.dataset.case} ${el.dataset.th} ×${el.dataset.sc} в ${el.dataset.w}`,
            folded: wrap ? !wrap.classList.contains('is-idle') : null,
            visible: vis.length,
            ghosts: ghost.length,
          }
        }),
      }
    },
    hoverStyles: MORE_POINTS.flatMap((_, i) => [`#more-${i}`, `#nb-${i}`]),
    expect: (m) => {
      const bad = []
      // Литералом, не `MORE_POINTS.length`: счёт, прочитанный из того же
      // списка, что построил разметку, согласен сам с собой и остаётся зелёным,
      // когда обход схлопнется до одной точки (ловушка 7).
      if (m.rows.length !== 8) return `точек ${m.rows.length} вместо 8 — обход разошёлся с разметкой`
      if (!m.settled) bad.push('свёртка не успокоилась за 60 кадров — снимок с качелей случаен')
      for (const r of m.rows) {
        if (r.folded === null) bad.push(`${r.at}: обёртки «Ещё» в полосе нет вовсе`)
        else if (!r.folded) bad.push(`${r.at}: полоса ничего не свернула (видно ${r.visible}) — «Ещё» холостая, точка не о ней`)
        if (!r.ghosts) bad.push(`${r.at}: в полосе не осталось видимого ghost-действия — «Ещё» сравнивать не с чем`)
      }
      if (bad.length) return bad.join('; ')
      for (let i = 0; i < m.rows.length; i++) {
        const at = m.rows[i].at
        const more = m.looks[`#more-${i}`], nb = m.looks[`#nb-${i}`]
        if (!more?.rest || !nb?.rest) { bad.push(`${at}: узлы не размечены — «Ещё» ${!!more?.rest}, сосед ${!!nb?.rest}`); continue }
        // САНИТАР НА ПРИЁМ, и он стоит на СОСЕДЕ, а не на «Ещё»: «Ещё» — это
        // предмет случая, и санитар на ней заслонял бы собой настоящий дефект
        // («курсор не доехал» вместо «подсветки нет»). Сосед заведомо
        // подсвечивается — если не изменился и он, наведения на странице нет
        // вовсе.
        if (JSON.stringify(nb.rest) === JSON.stringify(nb.seen)) {
          bad.push(`${at}: под курсором сосед не изменился ни в одном свойстве — курсор не доехал, сравнивать нечего`)
          continue
        }
        for (const state of ['rest', 'seen']) {
          const diff = Object.keys(more[state]).filter((k) => more[state][k] !== nb[state][k])
          if (diff.length) {
            bad.push(`${at}, ${state === 'rest' ? 'покой' : 'наведение'}: `
              + diff.map((k) => `${k} у «Ещё» ${more[state][k]}, у соседа ${nb[state][k]}`).join(', '))
          }
        }
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Меню встаёт под СВОЕЙ кнопкой: край в край, зазор — объявленный токеном, корень с триггером совпадает',
    why: 'DS-359 перенесла якорь меню с триггера на корень `.ds-dropdown`, и довод переноса — «корень это `inline-block` вокруг одного триггера, его прямоугольник равен триггерову» — был ВЫВЕДЕН ИЗ CSS, а не замерен. Вывод верный ровно до строчного бокса: `inline-block` вокруг инлайнового ребёнка обычно несёт под ним зазор до базовой линии, и меню отъехало бы от кнопки на него, не нарушив при этом ни одной строки листа. Поэтому посылка МЕРЯЕТСЯ отдельным утверждением, а не подразумевается: расхождение корня с триггером и есть то, чем отличается «меню под кнопкой» от «меню под корнем». Зазор сверяется с `--ds-anchor-gap` того же меню, а не с числом: токен умножен на шкалу, и прибитое число протухло бы на второй строке. Оба выравнивания в одном случае — `end` у «Ещё» (правые края) и `start` у фикстурных триггеров (левые): одно из двух зеленело бы и на меню, которое просто везде ставится слева',
    viewport: 1500,
    bundle: 'scripts/measure-more.tsx',
    html: '<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;padding-left:40px">'
      + ANCHOR_POINTS.map((p, i) => `<div class="ds-root ds-scale" style="--ds-ui-scale:${p.sc};width:${p.w}px" id="ah-${i}"`
        + ` data-anchor data-i="${i}" data-c="${p.c}" data-case="${p.id}" data-sc="${p.sc}" data-align="${p.align}"></div>`).join('')
      + '</div>',
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-anchor]')]
      for (const el of hosts) WB.mountCase(el, el.dataset.c, el.dataset.case)
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      for (let i = 0; i < 30; i++) await frame()
      // Хост, смонтированный раньше соседей, стоял в НЕЗАПОЛНЕННОМ ряду и
      // занимал другое место. Меню, раскрытое `defaultOpen` в тот момент,
      // посчитало координаты по тогдашнему триггеру, а пересчитывает их хук по
      // `scroll`/`resize` — штатным путём и никаким другим. Без этого события
      // случай мерил бы ЧЕРЁД МОНТИРОВАНИЯ, а не положение меню.
      window.dispatchEvent(new Event('resize'))
      for (let i = 0; i < 5; i++) await frame()
      // Раскрытие — `element.click()`, а не настоящий указатель, и это не
      // экономия: `useDismiss` слушает `pointerdown` на документе, и настоящий
      // клик по второму триггеру закрыл бы меню первого. Программный клик
      // `pointerdown` не шлёт, поэтому на странице открыто сразу всё.
      for (const el of hosts) {
        const t = el.querySelector('.ds-dropdown__trigger')
        if (t && t.getAttribute('aria-expanded') !== 'true') t.click()
      }
      for (let i = 0; i < 20; i++) await frame()
      const box = (el) => {
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { l: +b.left.toFixed(2), r: +b.right.toFixed(2), t: +b.top.toFixed(2), b: +b.bottom.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }
      }
      return hosts.map((el) => {
        const root = el.querySelector('.ds-dropdown')
        const trigger = el.querySelector('.ds-dropdown__trigger')
        const menu = el.querySelector('.ds-dropdown__menu')
        const cs = menu ? getComputedStyle(menu) : null
        return {
          at: `${el.dataset.c}/${el.dataset.case} ×${el.dataset.sc} align=${el.dataset.align}`,
          align: el.dataset.align,
          root: box(root), trigger: box(trigger), menu: box(menu),
          // Зазор и поджим читаются С САМОГО МЕНЮ — те же строки, что читает
          // `useAnchoredPosition`. Сырое значение едет рядом с числом: у
          // незарегистрированной `@property` вычисленное значение не длина, и
          // `parseFloat` даёт NaN — тогда хук считает зазор нулём молча.
          gapRaw: cs ? cs.getPropertyValue('--ds-anchor-gap').trim() : null,
          gap: cs ? parseFloat(cs.getPropertyValue('--ds-anchor-gap')) : null,
          inset: cs ? parseFloat(cs.getPropertyValue('--ds-anchor-inset')) : null,
          position: cs ? cs.position : null,
          visibility: cs ? cs.visibility : null,
          up: menu ? menu.classList.contains('ds-dropdown__menu--up') : null,
          vw: document.documentElement.clientWidth,
        }
      })
    },
    expect: (m) => {
      if (m.length !== 8) return `точек ${m.length} вместо 8 — обход разошёлся с разметкой`
      const bad = []
      // Оба выравнивания обязаны встретиться, иначе случай про одно из них.
      for (const a of ['start', 'end']) {
        if (!m.some((r) => r.align === a)) bad.push(`ни одной точки с align=${a} — случай мерит одно выравнивание из двух`)
      }
      for (const r of m) {
        if (!r.menu || !r.trigger || !r.root) { bad.push(`${r.at}: меню не раскрылось (menu ${!!r.menu}, триггер ${!!r.trigger})`); continue }
        if (r.visibility === 'hidden') { bad.push(`${r.at}: меню погашено — хук так и не поставил координат, мерить нечего`); continue }
        if (r.position !== 'fixed') bad.push(`${r.at}: меню ${r.position}, а не fixed — координаты считает не хук, а фолбэк листа`)
        if (!(r.gap > 0)) { bad.push(`${r.at}: --ds-anchor-gap прочитан как ${JSON.stringify(r.gapRaw)} → ${r.gap}; зазор сравнивался бы с нулём и «совпал» бы при любом положении`); continue }
        // ПОСЫЛКА ПЕРЕНОСА ЯКОРЯ, замеренная, а не выведенная из листа.
        const off = ['l', 'r', 't', 'b'].filter((k) => Math.abs(r.root[k] - r.trigger[k]) > 0.5)
        if (off.length) {
          bad.push(`${r.at}: корень .ds-dropdown и триггер — РАЗНЫЕ прямоугольники (${off.map((k) => `${k} ${r.root[k]} против ${r.trigger[k]}`).join(', ')}); меню якорится по корню, значит стоит не у кнопки`)
        }
        if (r.up) { bad.push(`${r.at}: меню перевёрнуто вверх — точка мерит переворот, а не выравнивание`); continue }
        // Поджим к краю вьюпорта не участвует: сработай он, случай мерил бы
        // его, а совпадение краёв было бы случайным.
        const ideal = r.align === 'end' ? r.trigger.r - r.menu.w : r.trigger.l
        if (ideal < r.inset - 0.5 || ideal > r.vw - r.menu.w - r.inset + 0.5) {
          bad.push(`${r.at}: заказанное положение ${ideal} упирается в поджим ${r.inset} при кадре ${r.vw} и ширине меню ${r.menu.w} — точка мерит поджим`)
          continue
        }
        const gap = +(r.menu.t - r.trigger.b).toFixed(2)
        if (Math.abs(gap - r.gap) > 0.5) {
          bad.push(`${r.at}: меню отстоит от НИЗА КНОПКИ на ${gap}px при --ds-anchor-gap ${r.gap}px (низ корня ${r.root.b}, низ кнопки ${r.trigger.b})`)
        }
        const edge = +(r.align === 'end' ? r.menu.r - r.trigger.r : r.menu.l - r.trigger.l).toFixed(2)
        if (Math.abs(edge) > 0.5) {
          bad.push(`${r.at}: ${r.align === 'end' ? 'правые' : 'левые'} края меню и кнопки разошлись на ${edge}px (меню ${r.menu.l}..${r.menu.r}, кнопка ${r.trigger.l}..${r.trigger.r})`)
        }
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Меню под ловушкой containing block (transform, contain: paint) встаёт под кнопкой, а не уезжает от неё',
    why: 'DS-367 переписала `useAnchoredPosition`: начало коробки предка-ловушки теперь МЕРЯЕТСЯ и ВЫЧИТАЕТСЯ из координат, вместо того чтобы просто сообщаться колбэком постфактум. Случай проверяет именно починку, а не факт существования ловушки: три хоста с ОДНИМ и тем же `DropdownMenu/bare-trigger` — (a) без ловушки-предка, (b) предок с `transform: translateX(0)`, (c) предок с `contain: paint` — обязаны дать ОДИНАКОВЫЙ результат (зазор и левый край меню совпадают с кнопкой), иначе починка работает не для всех перечисленных в комментарии хука свойств. Обёртки сдвинуты `margin: 120px` НЕ ради вида, а по вертикали: три хоста стоят в одном flex-ряду, и по горизонтали их и без margin разводят соседи по ряду — margin здесь единственное, что уводит их от верхнего края вьюпорта. Довод про вырожденный 0,0 — это довод про МЕТОДОЛОГИЮ проверки, а не про то, что случится при снятии margin в этой раскладке: на предке, который ДЕЙСТВИТЕЛЬНО стоит в 0,0 вьюпорта, ловушка и её отсутствие дают одно и то же число (`offBy=0`) — смещаться некуда что с ловушкой, что без, — и ровно на этой методологической ошибке уже погорел замер DS-357 («contain: paint ловушкой не оказался»). Санитар — зонд `position:fixed` внутри каждой обёртки — проверяется ПЕРВЫМ и утверждает не «предок не в нуле», а «предок СТАЛ containing block»: если у обёртки снять саму ловушку (`transform`/`contain`), зонд обязан вернуться в 0,0, а если он этого не делает при снятой ловушке — недостоверен весь случай, зелёный итог которого тогда ничего не доказывает.',
    viewport: 1600,
    bundle: 'scripts/measure-more.tsx',
    html: '<div style="display:flex;flex-wrap:nowrap;gap:16px;align-items:flex-start;padding:8px">'
      + '<div data-trap data-kind="ctrl" style="margin:120px 0 0 120px">'
      + '<i data-probe style="position:fixed;left:0;top:0;width:1px;height:1px"></i>'
      + '<div class="ds-root ds-scale" style="--ds-ui-scale:1;width:300px" data-anchor2></div>'
      + '</div>'
      + '<div data-trap data-kind="transform" style="margin:120px 0 0 120px;transform:translateX(0)">'
      + '<i data-probe style="position:fixed;left:0;top:0;width:1px;height:1px"></i>'
      + '<div class="ds-root ds-scale" style="--ds-ui-scale:1;width:300px" data-anchor2></div>'
      + '</div>'
      + '<div data-trap data-kind="contain" style="margin:120px 0 0 120px;contain:paint">'
      + '<i data-probe style="position:fixed;left:0;top:0;width:1px;height:1px"></i>'
      + '<div class="ds-root ds-scale" style="--ds-ui-scale:1;width:300px" data-anchor2></div>'
      + '</div>'
      + '</div>',
    measure: async () => {
      const wraps = [...document.querySelectorAll('[data-trap]')]
      for (const w of wraps) WB.mountCase(w.querySelector('[data-anchor2]'), 'DropdownMenu', 'bare-trigger')
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      for (let i = 0; i < 20; i++) await frame()
      // `bare-trigger` не несёт `defaultOpen` — раскрытие программным `.click()`,
      // а не настоящим указателем: тот, придя по второму триггеру, закрыл бы
      // меню первого через `useDismiss` (слушает `pointerdown` на документе).
      // Программный клик его не шлёт, поэтому все три меню остаются открыты
      // одновременно и меряются в одном кадре.
      for (const w of wraps) {
        const t = w.querySelector('.ds-dropdown__trigger')
        if (t && t.getAttribute('aria-expanded') !== 'true') t.click()
      }
      for (let i = 0; i < 20; i++) await frame()
      const box = (el) => {
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { l: +b.left.toFixed(2), r: +b.right.toFixed(2), t: +b.top.toFixed(2), b: +b.bottom.toFixed(2), w: +b.width.toFixed(2) }
      }
      return wraps.map((w) => {
        const menu = w.querySelector('.ds-dropdown__menu')
        const cs = menu ? getComputedStyle(menu) : null
        return {
          kind: w.dataset.kind,
          // Зонд — начало containing block предка, измеренное, а не выведенное
          // из CSS (см. `why`): его прямоугольник и есть то число, которое
          // `useAnchoredPosition` теперь вычитает из координат.
          probe: box(w.querySelector('[data-probe]')),
          trigger: box(w.querySelector('.ds-dropdown__trigger')),
          menu: box(menu),
          gapRaw: cs ? cs.getPropertyValue('--ds-anchor-gap').trim() : null,
          gap: cs ? parseFloat(cs.getPropertyValue('--ds-anchor-gap')) : null,
          position: cs ? cs.position : null,
          visibility: cs ? cs.visibility : null,
        }
      })
    },
    expect: (m) => {
      if (m.length !== 3) return `хостов ${m.length} вместо 3 — обход разошёлся с разметкой`
      const bad = []
      // САНИТАР — утверждается ПЕРВЫМ, до всего остального. Без него случай,
      // выродившийся в предка на 0,0, зеленел бы не потому, что починка
      // работает, а потому что ловушке некуда сдвигать (DS-357).
      for (const r of m) {
        if (!r.probe) { bad.push(`${r.kind}: зонд не найден в разметке — санитар случая не смонтирован`); continue }
        if (r.kind === 'ctrl') {
          if (Math.abs(r.probe.l) > 0.5 || Math.abs(r.probe.t) > 0.5) {
            bad.push(`${r.kind}: зонд контроля стоит в ${r.probe.l},${r.probe.t}, а не в 0,0 — обёртка БЕЗ ловушки сама сдвинула начало fixed, случай мерит не то`)
          }
        } else if (r.probe.l < 50 && r.probe.t < 50) {
          bad.push(`${r.kind}: ловушка не сработала — зонд в обёртке с ${r.kind === 'transform' ? 'transform' : 'contain: paint'} стоит в ${r.probe.l},${r.probe.t}, почти 0,0 — значит предок не стал containing block, и всё остальное в этом случае зелено не потому, что компенсация работает`)
        }
      }
      if (bad.length) return bad.join('; ')
      for (const r of m) {
        if (!r.menu || !r.trigger) { bad.push(`${r.kind}: меню не раскрылось (menu ${!!r.menu}, триггер ${!!r.trigger})`); continue }
        if (r.visibility === 'hidden') { bad.push(`${r.kind}: меню погашено — хук так и не поставил координат, мерить нечего`); continue }
        if (r.position !== 'fixed') bad.push(`${r.kind}: меню ${r.position}, а не fixed — координаты считает не хук, а фолбэк листа`)
        if (!(r.gap > 0)) { bad.push(`${r.kind}: --ds-anchor-gap прочитан как ${JSON.stringify(r.gapRaw)} → ${r.gap}; зазор сравнивался бы с нулём и «совпал» бы при любом положении`); continue }
        const gap = +(r.menu.t - r.trigger.b).toFixed(2)
        if (Math.abs(gap - r.gap) > 0.5) {
          bad.push(`${r.kind}: меню отстоит от низа кнопки на ${gap}px при --ds-anchor-gap ${r.gap}px (низ кнопки ${r.trigger.b}, верх меню ${r.menu.t}) — предок-ловушка увёл координаты`)
        }
        const edge = +(r.menu.l - r.trigger.l).toFixed(2)
        if (Math.abs(edge) > 0.5) {
          bad.push(`${r.kind}: левые края меню и кнопки разошлись на ${edge}px (меню ${r.menu.l}, кнопка ${r.trigger.l})`)
        }
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Выключенный инструмент шапки Card виден выключенным: гаснет, теряет курсор и не подсвечивается под ним',
    why: 'DS-358. `CardTool` втянул `disabled` из `ActionBase` при переезде — до переезда это была ошибка компиляции, после компилировалось и молчало, потому что `Card` поле не читал. Разведено до кнопки и погашено тем же, чем `.ds-btn:disabled` (`opacity .55`, `pointer-events: none`, `cursor: default`, плюс `:not(:disabled)` у ховера). Цена была названа вслух прямо в коммите: правило `.ds-card__tool:disabled` НЕ закрыто ничем — тест держит атрибут, а не вид, и снятие правила не краснело нигде. Утверждение здесь — о РАЗЛИЧИМОСТИ пары, а не о выключенном по отдельности: погашенная иконка сама по себе выглядит просто иконкой, и «выключенный не подсвечивается» без включённого рядом неопровержимо — ему удовлетворяет и полоса, где не подсвечивается никто',
    bundle: 'scripts/measure-more.tsx',
    html: ['light', 'dark'].map((th, i) => `<div class="ds-root ds-scale"${th === 'dark' ? ' data-theme="dark"' : ''}`
      + ` style="--ds-ui-scale:1;width:420px;background:var(--ds-bg-app);padding:8px" id="th-${i}" data-tool data-i="${i}" data-th="${th}"></div>`).join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-tool]')]
      for (const el of hosts) WB.mountCase(el, 'Form', 'tool-busy')
      await document.fonts.ready
      await new Promise((r) => requestAnimationFrame(() => r()))
      return { rows: hosts.map((el) => {
        const tools = [...el.querySelectorAll('.ds-card__tool')]
        const off = tools.filter((b) => b.disabled)
        const on = tools.filter((b) => !b.disabled)
        if (off.length) off[0].id = `tool-off-${el.dataset.i}`
        if (on.length) on[0].id = `tool-on-${el.dataset.i}`
        return { at: `Form/tool-busy ${el.dataset.th}`, tools: tools.length, off: off.length, on: on.length }
      }) }
    },
    // `cursor` и `opacity` вместо коробки: вопрос здесь не «одинаковы ли две
    // кнопки», а «видно ли, что одна не работает».
    hoverProps: ['background-color', 'color', 'opacity', 'cursor'],
    hoverStyles: ['#tool-off-0', '#tool-on-0', '#tool-off-1', '#tool-on-1'],
    expect: (m) => {
      if (m.rows.length !== 2) return `тем ${m.rows.length} вместо 2`
      const bad = []
      for (const r of m.rows) {
        if (r.tools !== 2) bad.push(`${r.at}: инструментов ${r.tools} вместо 2 — набор разошёлся с фикстурой`)
        if (r.off !== 1 || r.on !== 1) bad.push(`${r.at}: выключенных ${r.off}, включённых ${r.on} — различающей пары в кадре нет`)
      }
      if (bad.length) return bad.join('; ')
      for (let i = 0; i < m.rows.length; i++) {
        const at = m.rows[i].at
        const off = m.looks[`#tool-off-${i}`], on = m.looks[`#tool-on-${i}`]
        if (!off?.rest || !on?.rest) { bad.push(`${at}: узлы не размечены`); continue }
        // РАЗЛИЧАЮЩАЯ ПАРА. Включённый обязан отзываться на курсор — иначе
        // «выключенный не подсветился» верно и у совершенно мёртвой шапки.
        if (on.rest['background-color'] === on.seen['background-color']) {
          bad.push(`${at}: у ВКЛЮЧЁННОГО инструмента подложка под курсором не появилась (${on.rest['background-color']}) — либо курсор не доехал, либо подсветки нет вовсе; выключенный сравнивать не с чем`)
          continue
        }
        if (off.rest['background-color'] !== off.seen['background-color']) {
          bad.push(`${at}: выключенный инструмент подсветился под курсором: ${off.rest['background-color']} → ${off.seen['background-color']}`)
        }
        if (off.rest.opacity === on.rest.opacity && off.rest.color === on.rest.color) {
          bad.push(`${at}: выключенный не погашен — opacity ${off.rest.opacity} и цвет ${off.rest.color} те же, что у включённого`)
        }
        if (off.rest.cursor === 'pointer') bad.push(`${at}: у выключенного курсор pointer — он обещает нажатие, которого не будет`)
        if (on.rest.cursor !== 'pointer') bad.push(`${at}: у включённого курсор ${on.rest.cursor} вместо pointer — сравнение курсоров ничего не различает`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'DataTable не уводит страницу вбок: широкая таблица листается В СВОЕЙ ОБЁРТКЕ',
    why: 'DS-169. У `.ds-table` есть осмысленный `min-width` — пол ширины колонки без `width` (DS-137), колонки уже него нечитаемы, — но своей прокрутки не было, и распор уходил наружу и двигал ДОКУМЕНТ: на прежнем кадре 360 при шкале 1.5, таблица торчала до 395 (историческое число, снято до переезда пола на 440, DS-380). Уехавшая вбок страница ломает не таблицу, а всё вокруг неё: шапку, боковую навигацию, всякий `position: fixed`. Задача три месяца была невыполнима — скроллер на обёртке резал меню строки, пока всплывающее лежало `absolute` внутри триггера (DS-240 это сняла). Дефект живёт на ПРОИЗВЕДЕНИИ узкого кадра и шкалы: на кадре 440 (пол, DS-380) при шкале 1 базовая группа (384px) уже уже кадра — переполнения нет, и это не потеря предмета, а честный сдвиг того же произведения; спрашивают 1.25 и 1.5 (480 и 576px)',
    // Разметка снята с `DataTable.tsx`; класс `is-scrollable` стоит РУКАМИ,
    // потому что вешает его React по замеру, а страница `measure` плоская.
    // Что класс вешается по переполнению И НЕ вешается без него, держит
    // `DataTable.test.tsx` («свой горизонтальный скроллер», два случая).
    // Пара, а не дубль: тот набор переживёт снятое правило в листе, этот —
    // снятый класс в компоненте.
    //
    // Слагаемые пола объявлены со шкалой, как их считает `tableMinWidth`:
    // прибитые пиксели переполняли бы одинаково на всех шкалах, и случай
    // молчал бы о том, что дефект живёт на их произведении.
    //
    // ШКАЛА 1 СНЯТА (JIG-29, переезд пола 360 → 440). База группы (24rem —
    // 384px при rem 16) уже кадра-пола 440 при шкале 1, и таблица там просто
    // занимает контейнер без переполнения — замерено `npm run measure` после
    // переезда (tableW 440 = wrapClient 440, reached 0). На 360 то же
    // произведение переполняло на всех трёх шкалах; на 440 шкала 1 выпала —
    // держать её означало бы держать точку, которая тривиально проходит
    // санитар «таблица обязана не влезать», то есть не спрашивает ничего.
    // Шкалы 1.25 (480px) и 1.5 (576px) по-прежнему шире кадра 440 и
    // переполняют по-настоящему.
    //
    // Распирает БАЗОВАЯ группа, и это не произвол. Первая редакция раздала пол
    // по трём группам (12 + 7.5 + 7.5 rem) и получила «таблица влезла в
    // обёртку» на обеих оставшихся шкалах: на кадре 440 (пол системы, DS-380)
    // контейнерные запросы обнуляют `sm` и `md` вместе с колонками, которые
    // прячет `hideBelow` (DS-138), — то есть пол честно ужимается до базовой
    // группы. Санитар это и назвал. Переполнять обязано то, что на узком
    // кадре остаётся.
    viewport: 440,
    html: [1.25, 1.5].map((sc) => `
      <div class="ds-scale" style="--ds-ui-scale: ${sc}">
        <div class="ds-table-wrap is-scrollable" id="dtw-${sc}"
             style="--ds-table-min-base: calc(24rem * var(--ds-ui-scale))">
          <table class="ds-table ds-table--fixed" id="dt-${sc}">
            <thead><tr><th scope="col">Рейс</th><th scope="col">Сумма</th><th scope="col">Статус</th><th scope="col" id="dt-last-${sc}">Парк</th></tr></thead>
            <tbody><tr><th scope="row">Рейс 1</th><td>742,00 ₽</td><td>Проведён</td><td>Южный парк</td></tr></tbody>
          </table>
        </div>
      </div>`).join(''),
    measure: () => {
      const se = document.scrollingElement
      const out = { doc: { scroll: se.scrollWidth, client: se.clientWidth }, points: {} }
      for (const sc of [1.25, 1.5]) {
        const wrap = document.getElementById(`dtw-${sc}`)
        const table = document.getElementById(`dt-${sc}`)
        const last = document.getElementById(`dt-last-${sc}`)
        wrap.scrollLeft = 99999
        const reached = wrap.scrollLeft
        const lastRight = Math.round(last.getBoundingClientRect().right)
        const wrapRight = Math.round(wrap.getBoundingClientRect().right)
        wrap.scrollLeft = 0
        out.points[sc] = {
          wrapScroll: wrap.scrollWidth, wrapClient: wrap.clientWidth,
          tableW: Math.round(table.getBoundingClientRect().width),
          reached, lastRight, wrapRight,
        }
      }
      return out
    },
    expect: (m) => {
      const fails = []
      // Главное утверждение, одно на всю страницу.
      if (m.doc.scroll > m.doc.client + 1) {
        fails.push(`документ ${m.doc.scroll} при кадре ${m.doc.client} — страница уехала вбок`)
      }
      for (const [sc, p] of Object.entries(m.points)) {
        // САНИТАР: таблица ОБЯЗАНА не влезать. Умести она — «страница не
        // поехала» выполнялось бы тривиально, и точка молчала бы о своём
        // предмете.
        if (p.wrapScroll <= p.wrapClient + 1) {
          fails.push(`×${sc}: таблица (${p.wrapScroll}) влезла в обёртку (${p.wrapClient}) — точка не о переполнении`)
        }
        // Колонки достижимы прокруткой, а не потеряны: домотали до упора, и
        // последняя колонка кончается не правее правого края обёртки.
        if (p.reached <= 0) {
          fails.push(`×${sc}: обёртка не прокручивается (scrollLeft ${p.reached}) — колонки за краем недостижимы`)
        }
        if (p.lastRight > p.wrapRight + 1) {
          fails.push(`×${sc}: домотали до упора, а последняя колонка кончается на ${p.lastRight} при правом крае обёртки ${p.wrapRight}`)
        }
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'Всплывающее на `fixed` выходит за клип прокручиваемого предка, на `absolute` — нет',
    why: 'DS-240. Всплывающее лежало `position: absolute` внутри триггера, и любой прокручиваемый предок его КЛИПОВАЛ — обойти в CSS нечем: всякий не-`visible` `overflow-x` вычисляет `overflow-y` в `auto`, а `clip` не прокручивает. Пока это так, ни один компонент со всплывающим внутри не может завести себе горизонтальную прокрутку, то есть закон «скроллер живёт на широком ребёнке» (DS-203) для целого класса невыполним; первым в это упёрся `DataTable` — от меню строки оставался 1px из 90. Утверждение здесь — про ДВИЖОК, а не про арифметику: координаты считает `useAnchoredPosition`, и его собственные случаи переживут снятое правило, а этот переживёт сломанную арифметику. Пара, а не дубль',
    // Разметка НАРОЧНО голая, без классов ДС: проверяется механизм клипа, а не
    // оформление меню. Классы привязали бы случай к листу `DropdownMenu`, и
    // тогда он краснел бы от смены оформления, ничего не сказав про клип.
    //
    // Координаты пузырька проставлены ИНЛАЙНОМ, как их ставит компонент:
    // страница `measure` плоская и React на ней не работает. Что компонент их
    // действительно ставит, держит `DropdownMenu.test.tsx` («меню
    // позиционируется от вьюпорта»).
    //
    // ОБА узла лежат ВНУТРИ прокручиваемого предка, и это существенно. Первая
    // редакция случая положила `fixed`-узел СНАРУЖИ скроллера — такой не
    // клипуется и без всякого `fixed`, то есть случай был зелёным, ничего не
    // проверяя. Санитары этого не ловили: они смотрят геометрию, а ошибка была
    // в том, ЧЕЙ потомок узел.
    width: 900,
    html: `<div style="height:520px">
      <div id="an-scroller" style="width:300px;height:120px;overflow-x:auto;overflow-y:auto;border:1px solid #333;margin:60px">
        <div style="width:800px;height:118px;display:flex;align-items:flex-end">
          <span id="an-trigger" style="position:relative;display:inline-block;margin-left:20px">кнопка
            <div id="an-abs" style="position:absolute;top:100%;left:0;width:180px;height:90px;background:#c00"></div>
            <div id="an-fixed" style="position:fixed;width:180px;height:90px;background:#0c0"></div>
          </span>
        </div>
      </div>
    </div>`,
    measure: () => {
      const sc = document.getElementById('an-scroller').getBoundingClientRect()
      const tr = document.getElementById('an-trigger').getBoundingClientRect()
      const fixed = document.getElementById('an-fixed')
      // Ставим `fixed`-узел туда же, куда падает `absolute`-пузырёк, — иначе
      // сравнивались бы два разных места, а не два способа позиционирования.
      // РЯДОМ, а не в тех же координатах. Первая редакция ставила оба узла в
      // одну точку, и `elementFromPoint` для `absolute` возвращал накрывший его
      // `fixed`: утверждение «absolute обрезан» не могло сработать НИКОГДА.
      // Поймано мутацией «снять overflow у предка» — она оставалась зелёной.
      fixed.style.left = `${Math.round(tr.left) + 200}px`
      fixed.style.top = `${Math.round(tr.bottom)}px`
      const abs = document.getElementById('an-abs').getBoundingClientRect()
      const fx = fixed.getBoundingClientRect()
      // Точка ЗАВЕДОМО ниже нижнего края скроллера и внутри обоих боксов.
      const y = Math.round(sc.bottom + 8)
      const hitAt = (r) => {
        const el = document.elementFromPoint(Math.round(r.left + r.width / 2), y)
        return el ? el.id || el.tagName : 'null'
      }
      return {
        scBottom: Math.round(sc.bottom), y,
        absBottom: Math.round(abs.bottom), fxBottom: Math.round(fx.bottom),
        hitAbs: hitAt(abs), hitFx: hitAt(fx),
      }
    },
    expect: (m) => {
      const fails = []
      // САНИТАРЫ. Оба бокса обязаны реально доставать до пробной точки —
      // иначе «в absolute не попали» верно тривиально, по геометрии, а не
      // из-за клипа, и случай молчал бы ровно о том, ради чего написан.
      if (m.absBottom < m.y) fails.push(`absolute-пузырёк кончается на ${m.absBottom}, пробная точка ${m.y} — он до неё не достаёт, клип ни при чём`)
      if (m.fxBottom < m.y) fails.push(`fixed-узел кончается на ${m.fxBottom}, пробная точка ${m.y} — точка не в нём`)
      // Дефект: absolute обрезан предком.
      if (m.hitAbs === 'an-abs') fails.push(`absolute-пузырёк отвечает на точку ниже скроллера — предок его больше не клипует, и случай перестал быть о клипе`)
      // Лечение: fixed виден там, где absolute обрезан.
      if (m.hitFx !== 'an-fixed') fails.push(`fixed-узел ниже скроллера отдал ${m.hitFx} вместо себя — он тоже обрезан, и выход из-под клипа не работает`)
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'PageShell НЕ забирает прокрутку себе: тело не контейнер прокрутки, и `sticky` внутри липнет',
    why: 'DS-203. Оболочка обещала в комментарии, что `min-width: 0` на теле защищает страницу от широкого контента, и не давала этого: кадр 900, ряд из 14 колонок по 9rem — документ 2504 при clientWidth 900, шапка после прокрутки вправо на −1604. Обещание снято, и вместе с ним закрыт очевидный ремонт: `overflow-x: auto` на теле. Он ПРОТИВОПОКАЗАН, и случай стоит здесь ради этого. По спецификации пара «overflow-x: auto + overflow-y: visible» вычисляется в `auto/auto`, то есть тело становится контейнером прокрутки по ОБЕИМ осям. Высота у `.ds-page` при этом `min-height: 100%`, а не `height`, поэтому у потребителя с невысотной обёрткой тело по вертикали не листается вовсе — листается документ, — и всякий `position: sticky` внутри отрывается от того, что на самом деле едет. Замерено: на настоящей странице 900×700 липкая строка уезжает на `top` −1387 против 0 сегодня; здесь же мутация печатает −533 при прокрутке на 600. Полная форма app-shell (`height: 100%` + `overflow: auto`) работает, но ТОЛЬКО когда родитель высотный: с `min-height` или `auto` она молча вырождается в то же самое (шапка −654, липкая −587), а оболочка не знает, в какой родитель её положили. `overflow-x: clip` шапку сохраняет и `sticky` не ломает, но уносит содержимое за краем целиком: `docLeft` 0, `bodyLeft` 0, правый край ряда 880 — до данных не добраться ВООБЩЕ. Значит горизонтальный скроллер живёт на широком ребёнке (`.ds-tabs__list`, `.ds-cmdbar` — DS-170), а не на оболочке',
    // Разметка снята с `PageShell.tsx`. Ширина кадра здесь НЕ задаётся через
    // `c.width`: тот пришпиливает `body { width }`, а случай ровно про то, как
    // ведёт себя документ, когда ребёнок шире него.
    //
    // Два утверждения о ОДНОМ, и это не дубль: `overflow` читается ВЫЧИСЛЕННЫЙ,
    // потому что авторское значение тут врёт — «visible + hidden» по
    // спецификации даёт `auto`, и на этой самой ловушке уже сидел случай
    // `CommandBar`. А `scrollLeft` читается потому, что вычисленное значение
    // говорит про каскад, а не про движок: контейнер прокрутки заводят и
    // другие свойства.
    html: `<div class="ds-page" id="ps-page">
      <div class="ds-page__header" id="ps-header"><h1 class="ds-page__title">Смена 17 марта 2026</h1></div>
      <div class="ds-page__body" id="ps-body">
        <div id="ps-stick" style="position:sticky;top:0;padding:4px;background:var(--ds-surface-subtle)">липкая шапка таблицы</div>
        <div id="ps-row" style="display:flex;gap:.5rem">${Array.from({ length: 14 }, (_, i) => `<div style="flex:0 0 auto;width:9rem;padding:.75rem;background:var(--ds-surface);border:1px solid var(--ds-border);white-space:nowrap">Колонка ${i + 1}</div>`).join('')}</div>
        <div id="ps-tall" style="height:1400px"></div>
      </div>
    </div>`,
    measure: () => {
      // `scrollingElement`, а НЕ `documentElement`: страница `measure`
      // собирается без доктайпа и живёт в quirks mode, где документ листает
      // `body`, а `documentElement.clientHeight` отдаёт высоту СОДЕРЖИМОГО, не
      // кадра. Первая редакция случая читала оттуда и получила «1556 при кадре
      // 1556» — санитар назвал это «прокручивать нечего», и он был прав.
      const sc = document.scrollingElement
      const body = document.getElementById('ps-body')
      const row = document.getElementById('ps-row')
      const cs = getComputedStyle(body)
      const before = {
        mode: document.compatMode,
        ox: cs.overflowX, oy: cs.overflowY,
        bodyClient: body.clientWidth,
        // `scrollWidth`, а не ширина бокса: сам ряд зажат телом до его ширины,
        // наружу выпирают ДЕТИ. Первая редакция мерила бокс и получила 860 при
        // теле 900 — «ряд влез», хотя содержимого в нём на 2016.
        rowContent: row.scrollWidth,
        docScrollH: sc.scrollHeight, docClientH: sc.clientHeight,
      }
      // Попытка пролистать ТЕЛО вбок: у не-контейнера она не двигает ничего.
      body.scrollLeft = 9999
      const bodyLeft = body.scrollLeft
      // Липкость проверяется прокруткой ДОКУМЕНТА — того, что на самом деле едет.
      sc.scrollTop = 600
      const scrolledTo = sc.scrollTop
      const stickTop = Math.round(document.getElementById('ps-stick').getBoundingClientRect().top)
      sc.scrollTop = 0
      return { ...before, bodyLeft, scrolledTo, stickTop }
    },
    expect: (m) => {
      const fails = []
      // САНИТАРЫ. Без первого «липкая на месте» верно тривиально — липнуть
      // не над чем. Без второго случай вовсе не о широком ребёнке: умести ряд
      // в тело, и всё ниже сошлось бы на пустом месте.
      if (m.docScrollH <= m.docClientH + 100) {
        fails.push(`документ ${m.docScrollH} при кадре ${m.docClientH} — прокручивать нечего, случай не о липкости`)
      }
      // Третий санитар, и он не про разметку, а про сам замер: прокрутка
      // должна СОСТОЯТЬСЯ. Не состоись она — липкая осталась бы на месте, и
      // «top ≈ 0» означало бы «ничего не двигали», а прочиталось бы как
      // «липнет». Ровно так первая редакция и промахнулась.
      if (m.scrolledTo < 500) {
        fails.push(`документ не пролистался: просили 600, доехали до ${m.scrolledTo} — замер о липкости не состоялся`)
      }
      if (m.rowContent <= m.bodyClient + 1) {
        fails.push(`содержимое ряда ${m.rowContent} влезло в тело ${m.bodyClient} — точка не о широком содержимом`)
      }
      // Тело — НЕ контейнер прокрутки. Каскадом…
      if (m.ox !== 'visible' || m.oy !== 'visible') {
        fails.push(`overflow тела ${m.ox}/${m.oy}, а не visible/visible — оболочка забрала переполнение себе: auto отрывает sticky внутри от того, что едет, clip уносит содержимое за краем без доступа к нему. Какое из двух — скажут соседние утверждения, они на clip остаются зелёными`)
      }
      // …и движком.
      if (m.bodyLeft !== 0) {
        fails.push(`тело пролистывается вбок на ${m.bodyLeft} — оно стало контейнером прокрутки`)
      }
      // Ради чего всё остальное: липкое внутри оболочки липнет к экрану.
      if (Math.abs(m.stickTop) > 1) {
        fails.push(`липкая строка на ${m.stickTop} после прокрутки документа на 600 — она уехала вместе с ним, то есть sticky внутри PageShell мёртв`)
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'Каретка дописывания стоит В СТРОКЕ текста, а не под ней',
    why: 'DS-235. Каретка лежала прямым ребёнком `.ds-transcript__body`, а тот — колоночный флекс: `display: inline-block` к флекс-элементу не применяется вовсе, и каретка занимала СВОЙ РЯД под абзацем, отделённая ещё и `gap` (замер приёмки: бокс каретки y 426–439 против строк текста y 401–422). Смысл от этого другой: каретка читается как «здесь появится следующий символ» ровно потому, что стоит на месте следующего символа, а отдельным прямоугольником под абзацем она говорит «идёт работа» — для этой мысли в компоненте уже есть спиннер, и два знака одной мысли система убирала на DS-144. Утверждение о ПЕРЕСЕЧЕНИИ, а не о координате: «y каретки 426» верно и когда абзац вырос на строку',
    // Разметка снята с `AgentTranscript.tsx` (ветка `t.text != null ||
    // t.streaming`). Что она НЕ держит — переезд каретки обратно в тело:
    // руками написанное превью такого не заметит. Это держит структурное
    // утверждение в `AgentTranscript.test.tsx` («лежит ВНУТРИ текста реплики»),
    // и наоборот — оно переживёт `display: block` на самой каретке, а этот
    // случай нет. Пара, а не дубль.
    width: 440,
    html: `<div class="ds-root" style="padding:8px;width:440px"><div class="ds-transcript">
      <article class="ds-transcript__msg"><div class="ds-transcript__body">
        <div class="ds-transcript__text" id="ac-long">
          <span class="ds-transcript__plain" id="ac-long-t">Дальше пишу случай про включительный порог и считаю ячейки нулевой ступени, потом сверю итог</span>
          <span class="ds-transcript__streaming" id="ac-long-c" aria-hidden="true"></span>
        </div>
      </div></article>
      <article class="ds-transcript__msg"><div class="ds-transcript__body">
        <div class="ds-transcript__text" id="ac-short">
          <span class="ds-transcript__plain" id="ac-short-t">Готово</span>
          <span class="ds-transcript__streaming" id="ac-short-c" aria-hidden="true"></span>
        </div>
      </div></article>
    </div></div>`,
    measure: () => {
      // Строки текста — прямоугольники ДИАПАЗОНА, а не бокс элемента: у
      // переносящегося абзаца бокс один на три строки, и «пересекается с
      // абзацем» было бы верно и для каретки, упавшей на первую строку.
      const lines = (id) => {
        const r = document.createRange()
        r.selectNodeContents(document.getElementById(id))
        return [...r.getClientRects()].map(({ top, bottom, left, right }) => ({ top, bottom, left, right }))
      }
      const box = (id) => {
        const { top, bottom, left, right } = document.getElementById(id).getBoundingClientRect()
        return { top, bottom, left, right }
      }
      return {
        long: { lines: lines('ac-long-t'), caret: box('ac-long-c') },
        short: { lines: lines('ac-short-t'), caret: box('ac-short-c') },
      }
    },
    expect: (m) => {
      const fails = []
      // САНИТАР на сам случай: длинная реплика обязана ПЕРЕНОСИТЬСЯ. Умести
      // она в одну строку — «каретка на последней строке» выполнялось бы
      // тривиально, и случай проверял бы короткую реплику дважды.
      if (m.long.lines.length < 2) {
        fails.push(`длинная реплика уместилась в ${m.long.lines.length} строку — случай не о переносе`)
      }
      for (const [what, r] of [['длинная реплика', m.long], ['короткая реплика', m.short]]) {
        const last = r.lines[r.lines.length - 1]
        if (!last) { fails.push(`${what}: строк текста не нашлось вовсе`); continue }
        // Пересечение по вертикали, а не равенство координат.
        if (!(r.caret.top < last.bottom && r.caret.bottom > last.top)) {
          fails.push(`${what}: каретка ${r.caret.top.toFixed(0)}–${r.caret.bottom.toFixed(0)} не пересекается с последней строкой ${last.top.toFixed(0)}–${last.bottom.toFixed(0)} — она под текстом, а не в нём`)
        }
        // И идёт ЗА последним символом, а не перед строкой: пересечение по
        // вертикали верно и для каретки, уехавшей в начало строки.
        if (r.caret.left < last.right - 1) {
          fails.push(`${what}: каретка начинается на ${r.caret.left.toFixed(0)}, а строка кончается на ${last.right.toFixed(0)} — она не за последним символом`)
        }
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'Подложка наведения не съедает текст, что на ней лежит',
    why: 'DS-229. `--ds-table-hover` — подложка ОДНА, а текстов на ней несколько: день соседнего месяца (`--ds-text-faint`), выходной (`--ds-weekend`), раздел в выдаче поиска и подсказка зоны файла (`--ds-text-muted`), приглушённая строка таблицы (`--ds-row-muted-fg`). До правки пол 4.5 держал только последний — его и подбирали по четырём подложкам (DS-137), а остальные считались на ПОВЕРХНОСТИ и на наведении давали 4.25/3.33 (faint), 3.88 (muted в тёмной) и 4.36 (выходной в тёмной). Число, снятое на поверхности, за остальные подложки не отвечает — `docs/writing-checks.md`, п. 7. Меряется под НАСТОЯЩИМ курсором и через `window.__seen`: подложку наведения из JS не выставить, а складывать слои номинально нельзя — прозрачность предка в вычисленные значения не входит',
    // Четыре тона на одной подложке, в обеих темах. Два берут её настоящим
    // наведением (день календаря, строка таблицы), два — классом состояния
    // (`.is-active` выдачи, `.is-dragover` зоны): там подложка приезжает не от
    // курсора, и требовать hover значило бы проверять не тот механизм.
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px">
      <div class="ds-cal"><div class="ds-cal__months"><div class="ds-cal__month"><div class="ds-cal__grid">
        <button type="button" class="ds-cal__day ds-cal__day--out" id="hv-cal-${t}" aria-label="29 июня 2026"><span class="ds-cal__day-num" id="hv-calnum-${t}">29</span></button>
        <button type="button" class="ds-cal__day ds-cal__day--weekend" id="hv-wk-${t}" aria-label="4 июля 2026"><span class="ds-cal__day-num" id="hv-wknum-${t}">4</span></button>
      </div></div></div></div>
      <table class="ds-table"><tbody>
        <tr class="ds-table__row--muted" id="hv-row-${t}"><td id="hv-cell-${t}">Списано по акту</td></tr>
      </tbody></table>
      <div class="ds-gsearch__option is-active" id="hv-gs-${t}">Договор поставки<span class="ds-gsearch__group" id="hv-gsg-${t}">Документы</span></div>
      <div class="ds-filedrop"><div class="ds-filedrop__zone is-dragover" id="hv-fd-${t}">
        Перетащите файл<span class="ds-filedrop__hint" id="hv-fdh-${t}">до 10 МБ</span></div></div>
      <span id="hv-hover-${t}" style="background: var(--ds-table-hover)"></span>
    </div>`).join(''),
    hoverSeen: ['light', 'dark'].flatMap((t) => [
      [`#hv-cal-${t}`, `#hv-calnum-${t}`],
      [`#hv-wk-${t}`, `#hv-wknum-${t}`],
      [`#hv-row-${t}`, `#hv-cell-${t}`],
    ]),
    measure: () => {
      const out = {}
      for (const t of ['light', 'dark']) {
        out[t] = {
          group: window.__seen(document.getElementById(`hv-gsg-${t}`)),
          hint: window.__seen(document.getElementById(`hv-fdh-${t}`)),
          hoverBg: getComputedStyle(document.getElementById(`hv-hover-${t}`)).backgroundColor,
        }
      }
      return out
    },
    expect: (m) => {
      const fails = []
      for (const t of ['light', 'dark']) {
        const want = m[t].hoverBg
        // Пары «где навести → что читать» и пары «класс → что читать» сведены
        // в один список: вопрос у всех четырёх один, и разводить их по двум
        // спискам значило бы проверять один из них вполсилы.
        const rows = [
          ['день соседнего месяца под курсором', m.hovered[`#hv-calnum-${t}`]],
          ['выходной своего месяца под курсором', m.hovered[`#hv-wknum-${t}`]],
          ['приглушённая строка таблицы под курсором', m.hovered[`#hv-cell-${t}`]],
          ['раздел в активной строке выдачи', { seen: m[t].group, landed: true }],
          ['подсказка зоны под файлом', { seen: m[t].hint, landed: true }],
        ]
        for (const [what, got] of rows) {
          if (!got.landed) {
            fails.push(`${t}: ${what} — курсор не доехал, снимок взят с покоя и ни о чём не говорит`)
            continue
          }
          const seen = seenPair(got.seen)
          // САНИТАР НА ЗАМЕР, как в кейсе 209: сложиться слои обязаны на
          // подложке НАВЕДЕНИЯ. Сложись они на поверхности — числа остались бы
          // правдоподобными и были бы не о том месте.
          if (seen.background !== want) {
            fails.push(`${t}: ${what} сложился на ${seen.background}, а --ds-table-hover здесь ${want} — снимок не о той подложке`)
            continue
          }
          const k = contrastOf(seen.color, seen.background)
          if (k < 4.5) fails.push(`${t}: ${what} ${seen.color} на ${seen.background} даёт ${k.toFixed(2)} при поле 4.5`)
        }
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'Calendar: недоступный день перечёркнут, доступный — нет, в своём месяце и в чужом',
    why: 'DS-259. Доступный и недоступный день соседнего месяца оба faint (233: чужой месяц переживает выключение) и оба 400 (234: начертание несёт «свой/чужой»), то есть в покое были одним пикселем. Цветовые выходы замерены и отказаны там же, поэтому «нельзя выбрать» несёт перечёркивание числа — у ЛЮБОГО выключенного дня: свой недоступный до этого отличался от доступного только тоном. Мерится вычисленная линия декорации на узле числа во всех четырёх классах (точку отметки так не померить: `text-decoration-line` не наследуется, и её вычисленное `none` верно при любой правке — утверждение было бы мёртвым; она вынута из потока, и декорация на неё не распространяется по построению), и соседями — что 233 и 234 не сдвинуты: чужой выключенный остаётся faint и 400. Иначе проще всего было бы «различить» пару, вернув ему цвет выключенного',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px">
      <div class="ds-cal"><div class="ds-cal__months"><div class="ds-cal__month"><div class="ds-cal__grid">
        <button type="button" class="ds-cal__day ds-cal__day--out" disabled><span class="ds-cal__day-num" id="ls-outoff-${t}">23</span></button>
        <button type="button" class="ds-cal__day ds-cal__day--out"><span class="ds-cal__day-num" id="ls-outon-${t}">24</span></button>
        <button type="button" class="ds-cal__day" disabled><span class="ds-cal__day-num" id="ls-off-${t}">2</span></button>
        <button type="button" class="ds-cal__day"><span class="ds-cal__day-num" id="ls-on-${t}">6</span></button>
      </div></div></div></div>
      <span id="ls-faint-${t}" style="color: var(--ds-text-faint)"></span>
    </div>`).join(''),
    measure: () => {
      const out = {}
      for (const t of ['light', 'dark']) {
        const cs = (id) => getComputedStyle(document.getElementById(id))
        const line = (id) => cs(id).textDecorationLine
        out[t] = {
          outOff: line(`ls-outoff-${t}`), outOn: line(`ls-outon-${t}`),
          off: line(`ls-off-${t}`), on: line(`ls-on-${t}`),
          outOffColor: cs(`ls-outoff-${t}`).color, faint: cs(`ls-faint-${t}`).color,
          outOffWeight: cs(`ls-outoff-${t}`).fontWeight,
        }
      }
      return out
    },
    expect: (m) => {
      for (const [t, r] of Object.entries(m)) {
        if (r.outOff !== 'line-through') return `${t}: недоступный чужой день не перечёркнут (${r.outOff}) — пара «доступный/недоступный чужой» слита`
        if (r.off !== 'line-through') return `${t}: недоступный день своего месяца не перечёркнут (${r.off}) — «нельзя» у него несёт один тон`
        if (r.outOn !== 'none') return `${t}: доступный чужой день перечёркнут (${r.outOn}) — знак больше не различает`
        if (r.on !== 'none') return `${t}: доступный день перечёркнут (${r.on})`
        if (r.outOffColor !== r.faint) return `${t}: чужой выключенный ${r.outOffColor}, а faint ${r.faint} — сдвинуто решение 233`
        if (r.outOffWeight !== '400') return `${t}: чужой выключенный ${r.outOffWeight}, а не 400 — сдвинуто решение 234`
      }
      return true
    },
  },
  {
    name: 'Calendar при min/max: недоступный день и день соседнего месяца — РАЗНЫЕ на экране',
    why: 'DS-233, прямое продолжение 209. Там `opacity` сняли с `.ds-cal__day--out`, здесь она осталась на соседней строке — `.ds-cal__day:disabled { color: var(--ds-text-muted); opacity: 0.4 }`. Специфичность (0,2,0) против (0,1,0) у `--out`, поэтому при заданных `min`/`max` день соседнего месяца и недоступный день СВОЕГО месяца сходились в один экранный rgb(196,196,196): два разных состояния в один пиксель. Гейт этого не видел и не должен был: WCAG 1.4.3 выводит выключенное из-под порога, соседний кейс `Приглушение прозрачностью` исключает `:disabled` осознанно, и оба решения верны — предмет здесь не порог, а РАЗЛИЧИМОСТЬ. Разное у этих дней не только имя: чужой день — контекст сетки (без него первая строка марта читается как «23 24 25 26 27 28 1» и ничем не объяснена), а недоступный — запрет. Числа снимаются `window.__seen`, потому что вопрос ровно тот же, что в 209: что видно, а не что записано',
    // Разметка снята с `Calendar.tsx`, ветка не readOnly, случай `bounded`
    // (`min: 2026-03-05`): хвост февраля выключен ВЕСЬ, и вместе с ним первые
    // числа марта. Четыре класса дня рядом — иначе «различаются» не с чем
    // сравнивать. Число внутри отдельным `<span>`: мерить надо тот узел,
    // который читает глаз и на котором axe ловил 209.
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px">
      <div class="ds-cal"><div class="ds-cal__months"><div class="ds-cal__month">
        <div class="ds-cal__month-label">март 2026</div>
        <div class="ds-cal__grid">
          ${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
            .map((w, i) => `<span class="ds-cal__dow${i >= 5 ? ' ds-cal__dow--weekend' : ''}">${w}</span>`).join('')}
          <button type="button" class="ds-cal__day ds-cal__day--out" aria-label="23 февраля 2026" aria-pressed="false" tabindex="-1" disabled><span class="ds-cal__day-num" id="cd-outoff-${t}">23</span></button>
          <button type="button" class="ds-cal__day ds-cal__day--out" aria-label="24 февраля 2026" aria-pressed="false" tabindex="-1"><span class="ds-cal__day-num" id="cd-outon-${t}">24</span></button>
          <button type="button" class="ds-cal__day" aria-label="2 марта 2026" aria-pressed="false" tabindex="-1" disabled><span class="ds-cal__day-num" id="cd-off-${t}">2</span></button>
          <button type="button" class="ds-cal__day" aria-label="6 марта 2026" aria-pressed="false" tabindex="0"><span class="ds-cal__day-num" id="cd-on-${t}">6</span></button>
        </div>
      </div></div></div>
      <span id="cd-surface-${t}" style="background: var(--ds-surface)"></span>
    </div>`).join(''),
    measure: () => {
      const read = () => {
        const out = {}
        for (const t of ['light', 'dark']) {
          const seen = (id) => window.__seen(document.getElementById(id))
          out[t] = {
            outOff: seen(`cd-outoff-${t}`),
            outOn: seen(`cd-outon-${t}`),
            off: seen(`cd-off-${t}`),
            on: seen(`cd-on-${t}`),
            surface: getComputedStyle(document.getElementById(`cd-surface-${t}`)).backgroundColor,
          }
        }
        return out
      }
      const before = read()
      // РАЗЛИЧИТЕЛЬ. Возвращаем ровно тот дефект, ради которого случай написан:
      // чужой день, который ещё и выключен, забирает цвет выключенного. Правка
      // инлайновая и названа явно — одна, и видно какая.
      for (const t of ['light', 'dark']) {
        document.getElementById(`cd-outoff-${t}`).closest('.ds-cal__day')
          .style.color = 'var(--ds-text-disabled)'
      }
      return { before, after: read() }
    },
    expect: (m) => {
      const fails = []
      for (const [t, r] of Object.entries(m.before)) {
        const p = { outOff: seenPair(r.outOff), outOn: seenPair(r.outOn), off: seenPair(r.off), on: seenPair(r.on) }
        // САНИТАР НА САМ ЗАМЕР: помощник обязан сложить слои до той
        // поверхности, на которой день лежит. Иначе числа ниже правдоподобны
        // и не о том месте.
        for (const [what, s] of Object.entries(p)) {
          if (s.background !== r.surface) {
            fails.push(`${t}: ${what} сложился на подложке ${s.background}, а --ds-surface здесь ${r.surface} — снимок слоёв не о том месте`)
          }
          // МЕХАНИЗМ, а не только число: прозрачность красит группу — вместе с
          // кольцом фокуса и точкой отметки внутри дня — и не входит ни в одно
          // вычисленное значение.
          if (s.alpha !== 1) fails.push(`${t}: ${what} гасится прозрачностью (${s.alpha}), а не цветом`)
        }
        if (fails.length) continue
        // ПРЕДМЕТ СЛУЧАЯ. Не «цвета не равны» — это верно и при ΔE в единицу, —
        // а «различимы»: отношение светлот между двумя состояниями. Пол 1.8
        // взят от снятого 2.12/2.11 с запасом на правку токена, а не наоборот.
        const k = contrastOf(p.outOff.color, p.off.color)
        if (k < 1.8) {
          fails.push(`${t}: чужой выключенный ${p.outOff.color} и свой выключенный ${p.off.color} различаются на ${k.toFixed(2)} при поле 1.8`
            + ' — состояния «не этот месяц» и «недоступен» слиты')
        }
        // Выключенный обязан остаться ЧИТАЕМЫМ числом: пола 4.5 у него нет
        // (1.4.3 освобождает выключенное), но сетка не должна расползаться от
        // того, что часть дней вне диапазона.
        const legible = contrastOf(p.off.color, p.off.background)
        if (legible < 2.0) fails.push(`${t}: недоступный день ${legible.toFixed(2)} на подложке — число дня не прочесть`)
        // И он обязан быть СЛАБЕЕ доступного, иначе запрет читается как норма.
        if (legible >= contrastOf(p.on.color, p.on.background)) {
          fails.push(`${t}: недоступный день не слабее доступного (${legible.toFixed(2)} против ${contrastOf(p.on.color, p.on.background).toFixed(2)})`)
        }
        // Чужой день переживает выключение: доступный и недоступный чужие дни
        // тут ОДНОГО тона намеренно (цена названа в Calendar.css), и это
        // утверждение держит цену на виду — разойдись они, изменилось решение.
        if (p.outOff.color !== p.outOn.color) {
          fails.push(`${t}: чужой день сменил тон от выключения (${p.outOn.color} → ${p.outOff.color}) — решение изменилось, перечитайте комментарий в Calendar.css`)
        }
      }
      if (fails.length) return fails.join('; ')
      // РАЗЛИЧИТЕЛЬ: с возвращённым дефектом предикат обязан краснеть в ОБЕИХ
      // темах. Без этой пары случай зеленел бы на разметке, где `--out` вообще
      // не применился.
      for (const [t, r] of Object.entries(m.after)) {
        const k = contrastOf(seenPair(r.outOff).color, seenPair(r.off).color)
        if (k >= 1.8) {
          return `${t}: с возвращённым дефектом чужой выключенный всё равно отличается на ${k.toFixed(2)} — различитель ничего не различает, случай мерит не тот узел`
        }
      }
      return true
    },
  },
  {
    name: 'Приглушение прозрачностью: где оно красит содержимое, видимое держит порог',
    why: 'DS-209 нашли на Calendar, но приём общий: `opacity` на предке — самый частый способ сказать «это слабее», и он ЕДИНСТВЕННЫЙ, которого не видит ни один замер по вычисленным значениям. Случай держит те места, где прозрачность красит то, что надо читать или различать, и меряет их видимый цвет. Числа, снятые при заведении: событие «в полёте» при 0.6 давало 3.91 в свете при номинальных 13.31 (отсюда правка на 0.7); иконка заглушки — 3.52/3.98 при пороге 3 для нетекстового; курсор дописывания под погашенной анимацией давал 2.46/3.13 при прозрачности 0.6 — её сняли, стало 5.01/6.20. ИСКЛЮЧЕНЫ и здесь НЕ мерятся, с причиной у каждого: `:disabled` и `aria-disabled` (Button 0.55, Pagination 0.6, FileDrop 0.55, Slider 0.55, полоса с роумингом 0.65, кнопки поля 0.5 — Calendar из списка УШЁЛ, DS-233: у него выключенное написано токеном `--ds-text-disabled`, и различимость выключенного от чужого дня держит отдельный кейс) — WCAG 1.4.3 выводит выключенное из-под порога, и приглушение там и есть сообщение; переходные под жестом и загрузкой (`is-dragging` 0.5 у Tabs и Tree, `is-moving` 0.35 у EventCalendar, `is-loading` 0.7 у Button) — они живут, пока держат кнопку мыши или пока идёт запрос, читать их в этот момент никто не собирается. День соседнего месяца исключением НЕ был: он кликабелен и он часть сетки, у него свой случай выше',
    // Погашенная анимация — настоящей настройкой браузера: `.ds-transcript__streaming`
    // моргает `opacity` до нуля, и без `reduce` замер поймал бы случайную фазу
    // (первый прогон дал 0.5 вместо объявленных 0.6 — правдоподобно и не о том).
    reducedMotion: 'reduce',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="background: var(--ds-surface); padding: 8px">
      ${['accent', 'success', 'warning', 'error', 'info', 'chart-3'].map((tone, i) => `<div style="position:relative;height:34px">
        <button class="ds-eventcal__event is-pending" id="pend-${t}-${i}"
          style="--ds-eventcal-tone: var(--ds-${tone}); --ds-eventcal-w: 200px; --ds-eventcal-z: 1">Рейс 12</button>
      </div>`).join('')}
      <div class="ds-empty"><div class="ds-empty__icon" id="empty-${t}" aria-hidden="true">◻</div>
        <div class="ds-empty__title">Ничего не найдено</div></div>
      <div class="ds-transcript"><span class="ds-transcript__streaming" id="caret-${t}"></span></div>
      <span id="op-surface-${t}" style="background: var(--ds-surface)"></span>
    </div>`).join(''),
    measure: () => {
      const out = {}
      for (const t of ['light', 'dark']) {
        const el = (id) => document.getElementById(`${id}-${t}`)
        out[t] = {
          // Все шесть тонов: подложка события — `color-mix` от тона, и худший
          // тон меняется вместе с палитрой. Один тон в разметке значил бы, что
          // случай отвечает за один из шести.
          pending: [0, 1, 2, 3, 4, 5].map((i) => window.__seen(document.getElementById(`pend-${t}-${i}`))),
          icon: window.__seen(el('empty')),
          // У курсора читать надо ЗАЛИВКУ: текста в нём нет вовсе.
          caret: window.__seen(el('caret'), getComputedStyle(el('caret')).backgroundColor),
          surface: getComputedStyle(el('op-surface')).backgroundColor,
        }
      }
      return out
    },
    expect: (m) => {
      const fails = []
      for (const [t, r] of Object.entries(m)) {
        // САНИТАР: случай про прозрачность обязан её застать. Сними кто-нибудь
        // `opacity` — числа сойдутся с запасом и утверждение станет
        // неопровержимым; тогда пункт отсюда переносится, а не остаётся тихо
        // зелёным.
        const dimmed = [['событие в полёте', seenPair(r.pending[0]).alpha], ['иконка заглушки', seenPair(r.icon).alpha]]
        for (const [what, a] of dimmed) {
          if (a >= 1) fails.push(`${t}: у «${what}» прозрачности больше нет (${a}) — случай про неё, перенеси пункт`)
        }
        // Курсор — наоборот: у него прозрачность СНЯТА правкой 209, и вернуть её
        // значит вернуть 2.46. Утверждение обратное, поэтому и записано отдельно.
        const caretAlpha = seenPair(r.caret).alpha
        if (caretAlpha !== 1) fails.push(`${t}: курсору дописывания вернули прозрачность (${caretAlpha}) — при 0.6 он давал 2.46 в свете`)
        r.pending.forEach((snap, i) => {
          const seen = seenPair(snap)
          const k = contrastOf(seen.color, seen.background)
          // 4.5: это ТЕКСТ, и обещание рядом с правилом — «остаётся читаемым».
          if (k < 4.5) fails.push(`${t}: событие в полёте, тон ${i}: ${seen.color} на ${seen.background} даёт ${k.toFixed(2)} при поле 4.5`)
        })
        // 3, а не 4.5: иконка — графика (`aria-hidden`), смысл несут заголовок
        // и описание рядом. Порог тот же, что у нетекстового в остальной системе.
        const icon = seenPair(r.icon)
        const ki = contrastOf(icon.color, icon.background)
        if (ki < 3) fails.push(`${t}: иконка заглушки даёт ${ki.toFixed(2)} при поле 3`)
        // Курсор дописывания — тоже графика, и мерится он против ПОВЕРХНОСТИ, а
        // не против собственной заливки: вопрос «видно ли полоску на фоне».
        const caret = seenOn(r.caret, r.surface)
        const kc = contrastOf(caret, r.surface)
        if (kc < 3) fails.push(`${t}: курсор дописывания ${caret} на ${r.surface} даёт ${kc.toFixed(2)} при поле 3`)
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'Масштаб: все метрические токены растут вместе',
    why: 'на контейнере вместо корня токены остаются на единице — строки тянутся, текст нет',
    scale: 1.3,
    html: `<div id="probe"></div>`,
    measure: (arg) => {
      const factor = arg.factor
      // Читать саму переменную нельзя: она вычисляется в calc(...) как есть.
      // Применяем её к длине и читаем px, как это делает браузер для компонента.
      const probe = document.querySelector('#probe')
      const px = (token) => {
        probe.style.width = `var(${token})`
        return parseFloat(getComputedStyle(probe).width)
      }
      const scaled = arg.tokens
      const fixed = ['--ds-radius-sm', '--ds-radius', '--ds-radius-md']
      const at = (s) => {
        document.documentElement.style.setProperty('--ds-ui-scale', String(s))
        return Object.fromEntries([...scaled, ...fixed].map((t) => [t, px(t)]))
      }
      const one = at(1), up = at(factor)
      document.documentElement.style.removeProperty('--ds-ui-scale')
      return {
        drifted: scaled.filter((t) => Math.abs(up[t] / one[t] - factor) > 0.02),
        movedThatShouldNot: fixed.filter((t) => Math.abs(up[t] - one[t]) > 0.01),
        sample: `--ds-fs-base ${one['--ds-fs-base']} → ${up['--ds-fs-base']}`,
      }
    },
    expect: (m) => (m.drifted.length === 0 && m.movedThatShouldNot.length === 0)
      || `не масштабировались: ${m.drifted.join(', ') || '—'}; сдвинулись зря: ${m.movedThatShouldNot.join(', ') || '—'}`,
  },
  {
    name: 'Масштаб поддерева: .ds-scale двигает весь набор, а не часть',
    why: 'дизайн-агент переобъявил на своём контейнере три токена из восемнадцати — RouteBar разошёлся по швам, и это выглядело как решение, а не как дефект',
    scale: 1.5,
    html: `<div class="ds-scale" id="scope" style="--ds-ui-scale: 1.5"><div id="inside"></div></div>
      <div id="outside"></div>`,
    measure: (arg) => {
      // Читать саму переменную нельзя — она вычисляется в calc(...) как есть.
      // Прикладываем её к длине и читаем px, как это делает браузер.
      const px = (sel, token) => {
        const el = document.querySelector(sel)
        el.style.width = `var(${token})`
        return parseFloat(getComputedStyle(el).width)
      }
      // Список берётся из tokens.css, а не переписывается сюда: проверка,
      // перечисляющая токены руками, отстанет от файла в тот же день, когда
      // появится девятнадцатый.
      const drifted = arg.tokens.filter((t) =>
        Math.abs(px('#inside', t) / px('#outside', t) - arg.factor) > 0.02)
      return {
        count: arg.tokens.length,
        drifted,
        sample: `--ds-fs-base ${px('#outside', '--ds-fs-base')} → ${px('#inside', '--ds-fs-base')}`,
      }
    },
    expect: (m) => (m.count >= 18 && m.drifted.length === 0)
      // Счётчик тут не украшение: без него пустой список токенов дал бы зелёное
      // «ничего не разъехалось».
      || `${m.drifted.length} из ${m.count} остались на прежней величине: ${m.drifted.join(', ')}`,
  },
  {
    name: 'Масштаб поддерева: RouteBar не расходится по швам',
    why: 'у частичного набора высота и шрифт ссылки росли, а горизонтальный padding и кегль счётчика оставались — компонент разъезжался ровно в том месте, которое хотели улучшить',
    scale: 1.5,
    html: ['plain', 'big'].map((k) => `
      <div ${k === 'big' ? 'class="ds-scale" style="--ds-ui-scale: 1.5"' : ''}>
        <nav class="ds-routebar"><ul class="ds-routebar__list"><li class="ds-routebar__item">
          <a class="ds-routebar__link" id="link-${k}" href="/">Долги
            <span class="ds-routebar__count" id="count-${k}">2</span></a>
        </li></ul></nav>
      </div>`).join(''),
    measure: (arg) => {
      const read = (k) => {
        const link = document.querySelector(`#link-${k}`)
        const cs = getComputedStyle(link)
        return {
          height: parseFloat(cs.height),
          font: parseFloat(cs.fontSize),
          padding: parseFloat(cs.paddingLeft),
          count: parseFloat(getComputedStyle(document.querySelector(`#count-${k}`)).fontSize),
        }
      }
      const a = read('plain'), b = read('big')
      return {
        factor: arg.factor,
        base: a,
        ratio: Object.fromEntries(Object.keys(a).map((k) => [k, +(b[k] / a[k]).toFixed(3)])),
      }
    },
    expect: (m) => {
      // Нули отсекаются ДО отношений: выпавший токен обнуляет обе величины, и
      // 0/0 даёт NaN, а любое сравнение с NaN ложно — проверка прошла бы молча.
      const dead = Object.entries(m.base).filter(([, v]) => !(v > 0))
      if (dead.length) return `обнулилось на обычной полосе: ${dead.map(([k]) => k).join(', ')}`
      const off = Object.entries(m.ratio).filter(([, v]) => Math.abs(v - m.factor) > 0.03)
      return off.length === 0
        || `при шкале ${m.factor} выросли по-разному: ${off.map(([k, v]) => `${k} ×${v}`).join(', ')}`
    },
  },
  {
    name: 'Масштаб: у контрола растут и текст, и высота',
    why: 'рассогласование заметно только на живом элементе: коробка тянется, шрифт нет',
    scale: 1.3,
    html: `<button class="ds-btn" id="b">Записать</button>`,
    measure: (arg) => {
      const factor = arg.factor
      const el = document.querySelector('#b')
      const read = () => {
        const cs = getComputedStyle(el)
        return { font: parseFloat(cs.fontSize), box: el.getBoundingClientRect().height }
      }
      const one = read()
      document.documentElement.style.setProperty('--ds-ui-scale', String(factor))
      const up = read()
      document.documentElement.style.removeProperty('--ds-ui-scale')
      return { fontRatio: +(up.font / one.font).toFixed(3), boxRatio: +(up.box / one.box).toFixed(3) }
    },
    expect: (m) => (Math.abs(m.fontRatio - 1.3) < 0.03 && Math.abs(m.boxRatio - 1.3) < 0.05)
      || `текст ×${m.fontRatio}, коробка ×${m.boxRatio} — должны совпадать`,
  },
  {
    name: 'Раскладка fixed: ячейка на несколько колонок не подчиняется ширине колонки',
    why: 'однострочность вводилась ради РОВНОЙ сетки колонок, а пустое состояние и шапка группы сетке не принадлежат — им она только режет содержимое (регрессия DS-79)',
    html: `
      <div class="ds-table-wrap" style="width:300px">
        <table class="ds-table ds-table--fixed">
          <colgroup><col style="width:5rem"><col></colgroup>
          <tbody>
            <tr><td class="ds-table__empty" colspan="2" id="empty">
              <strong>Ничего не найдено</strong>
              <p id="hint">Попробуйте изменить условия фильтра или очистить поиск</p>
            </td></tr>
            <tr class="ds-table__group"><td class="ds-table__lead" colspan="2" id="lead">
              Сентябрь 2026 — операции по счёту и корректировки
            </td></tr>
            <tr><td id="colCell">Кредитная карта, рассрочка</td><td>—</td></tr>
          </tbody>
        </table>
      </div>`,
    measure: () => {
      const hint = document.querySelector('#hint')
      const lead = document.querySelector('#lead')
      return {
        hintClipped: hint.scrollWidth > hint.clientWidth,
        leadClipped: lead.scrollWidth > lead.clientWidth,
        hintWS: getComputedStyle(hint).whiteSpace,
        // Санитар с известным ответом: ячейка КОЛОНКИ в той же таблице обязана
        // остаться однострочной. Без него правило можно было бы «починить»,
        // сняв однострочность со всех ячеек разом, и случай прошёл бы.
        colWS: getComputedStyle(document.querySelector('#colCell')).whiteSpace,
      }
    },
    expect: (m) => (!m.hintClipped && !m.leadClipped && m.colWS === 'nowrap')
      || `срезано: подсказка ${m.hintClipped}, шапка группы ${m.leadClipped}`
         + ` (white-space служебной ${m.hintWS}, колоночной ${m.colWS})`,
  },
  {
    name: 'DataTable: в колонке края подпись сортировки прижата к стрелке, а не растянута',
    why: 'найдено ревью DS-86 мутацией: правило `.ds-table__end .ds-table__sortbtn { justify-content: flex-end }` снималось, и 115 инвариантов оставались зелёными. Не мёртвый код: кнопка — inline-flex во всю ширину ячейки, и без него подпись с ПОДРАЗУМЕВАЕМЫМ space-between уезжает к началу, оставляя между ней и стрелкой дыру во всю колонку. При переименовании `__num` → `__end` забыть это правило было нечем поймать',
    width: 600,
    html: `
      <table class="ds-table" style="width:400px">
        <thead><tr>
          <th id="endTh" class="ds-table__end ds-table__num" scope="col" aria-sort="none">
            <button type="button" class="ds-table__sortbtn">
              <span class="ds-table__sortlabel" id="endLabel">Сумма</span>
              <span class="ds-table__sortarrow" id="endArrow" aria-hidden="true">↕</span>
            </button>
          </th>
          <th id="startTh" scope="col" aria-sort="none">
            <button type="button" class="ds-table__sortbtn">
              <span class="ds-table__sortlabel" id="startLabel">Операция</span>
              <span class="ds-table__sortarrow" id="startArrow" aria-hidden="true">↕</span>
            </button>
          </th>
        </tr></thead>
        <tbody><tr><td>100</td><td>Пятёрочка</td></tr></tbody>
      </table>`,
    measure: () => {
      const box = (id) => document.querySelector('#' + id).getBoundingClientRect()
      // Зазор между подписью и стрелкой: у колонки края он равен gap'у, у
      // обычной — растянут на всю свободную ширину ячейки. Пара, потому что
      // одно число само по себе не отличает «прижато» от «ячейка узкая».
      return {
        endGap: +(box('endArrow').left - box('endLabel').right).toFixed(1),
        startGap: +(box('startArrow').left - box('startLabel').right).toFixed(1),
      }
    },
    expect: (m) => (m.endGap < 12 && m.startGap > m.endGap * 3)
      || `зазор в колонке края ${m.endGap}px против обычной ${m.startGap}px`,
  },
  {
    name: 'Раскладка fixed: у сортируемого заголовка стрелка остаётся внутри ячейки',
    why: 'кнопка сортировки — inline-flex со space-between; под nowrap длинный заголовок выталкивает стрелку за пределы th, и колонка выглядит несортируемой',
    html: `
      <div class="ds-table-wrap" style="width:300px">
        <table class="ds-table ds-table--fixed">
          <colgroup><col style="width:80px"><col></colgroup>
          <thead><tr>
            <th id="th" scope="col" aria-sort="none">
              <button type="button" class="ds-table__sortbtn">
                <span class="ds-table__sortlabel">Дата последнего платежа</span>
                <span class="ds-table__sortarrow" id="arrow" aria-hidden="true">↕</span>
              </button>
            </th>
            <th scope="col">Сумма</th>
          </tr></thead>
          <tbody><tr><td>01.09</td><td>100</td></tr></tbody>
        </table>
      </div>`,
    measure: () => {
      const th = document.querySelector('#th').getBoundingClientRect()
      const arrow = document.querySelector('#arrow').getBoundingClientRect()
      return {
        overhang: +(arrow.right - th.right).toFixed(1),
        arrowWidth: +arrow.width.toFixed(1),
      }
    },
    // Стрелка целиком внутри ячейки. Ноль ширины у стрелки означал бы, что её
    // схлопнуло, — это тот же отказ, а не успех.
    expect: (m) => (m.overhang <= 0.5 && m.arrowWidth > 2)
      || `стрелка вылезла на ${m.overhang}px (ширина стрелки ${m.arrowWidth}px)`,
  },
  {
    name: 'Масштаб: ширина колонки едет вместе с высотой строки',
    why: 'высота строки задана токеном и масштабируется, ширина колонки приходит пропом — рассогласование видно только на паре (DS-82)',
    html: `
      <div id="plain">
        <div class="ds-table-wrap" style="width:400px">
          <table class="ds-table ds-table--dense ds-table--fixed">
            <colgroup><col style="width: calc(144px * var(--ds-ui-scale, 1))"><col></colgroup>
            <tbody><tr><td id="plainCell">Водитель</td><td>—</td></tr></tbody>
          </table>
        </div>
      </div>
      <div id="scaled" class="ds-scale" style="--ds-ui-scale:1.25">
        <div class="ds-table-wrap" style="width:400px">
          <table class="ds-table ds-table--dense ds-table--fixed">
            <colgroup><col style="width: calc(144px * var(--ds-ui-scale, 1))"><col></colgroup>
            <tbody><tr><td id="scaledCell">Водитель</td><td>—</td></tr></tbody>
          </table>
        </div>
      </div>`,
    measure: () => {
      const box = (sel) => document.querySelector(sel).getBoundingClientRect()
      const a = box('#plainCell')
      const b = box('#scaledCell')
      return {
        widthRatio: +(b.width / a.width).toFixed(3),
        heightRatio: +(b.height / a.height).toFixed(3),
      }
    },
    // Утверждается ОТНОШЕНИЕ, а не два числа: ширина, выросшая сама по себе,
    // и высота, выросшая сама по себе, — не то же, что сетка, оставшаяся
    // сеткой. Голый rem дал бы ширину ×1 при высоте ×1.25.
    expect: (m) => (Math.abs(m.widthRatio - m.heightRatio) < 0.02 && m.widthRatio > 1.2)
      || `ширина ×${m.widthRatio}, высота строки ×${m.heightRatio} — сетка разъехалась`,
  },
  {
    name: 'Масштаб: ширина колонки tree-grid едет вместе с высотой строки',
    why: 'у Tree свой тип колонок, и разбор ширины разъехался с DataTable — та же пара чисел ловит это в гриде (DS-83)',
    html: `
      <div id="plain">
        <div class="ds-tree ds-tree--grid" style="width:400px; --ds-tree-cols: minmax(0, 1fr) calc(90px * var(--ds-ui-scale, 1))">
          <div class="ds-tree__item ds-tree__item--grid" role="row">
            <span class="ds-tree__cell ds-tree__cell--tree" role="rowheader">
              <span class="ds-tree__row" id="plainRow">
                <span class="ds-tree__gutter"></span><span class="ds-tree__label">package.json</span>
              </span>
            </span>
            <span class="ds-tree__cell" id="plainSize" role="gridcell">1,1 КБ</span>
          </div>
        </div>
      </div>
      <div id="scaled" class="ds-scale" style="--ds-ui-scale:1.25">
        <div class="ds-tree ds-tree--grid" style="width:400px; --ds-tree-cols: minmax(0, 1fr) calc(90px * var(--ds-ui-scale, 1))">
          <div class="ds-tree__item ds-tree__item--grid" role="row">
            <span class="ds-tree__cell ds-tree__cell--tree" role="rowheader">
              <span class="ds-tree__row" id="scaledRow">
                <span class="ds-tree__gutter"></span><span class="ds-tree__label">package.json</span>
              </span>
            </span>
            <span class="ds-tree__cell" id="scaledSize" role="gridcell">1,1 КБ</span>
          </div>
        </div>
      </div>`,
    measure: () => {
      const box = (sel) => document.querySelector(sel).getBoundingClientRect()
      return {
        widthRatio: +(box('#scaledSize').width / box('#plainSize').width).toFixed(3),
        heightRatio: +(box('#scaledRow').height / box('#plainRow').height).toFixed(3),
      }
    },
    // Та же пара, что у DataTable, и по той же причине: ширина приходит пропом,
    // высота строки — из токена, и рассогласование видно только на отношении.
    // Голое '90px' в треке дало бы ширину ×1 при высоте ×1.25.
    expect: (m) => (Math.abs(m.widthRatio - m.heightRatio) < 0.02 && m.widthRatio > 1.2)
      || `ширина ×${m.widthRatio}, высота строки ×${m.heightRatio} — сетка разъехалась`,
  },
  {
    name: 'Раскладка fixed: перенос и сокращение — два различимых состояния',
    why: 'порознь каждое состояние схлопывается в «строка стала выше»; дефект живёт ровно в том, что их не отличают (DS-79)',
    html: `
      <div class="ds-table-wrap" style="width:260px">
        <table class="ds-table ds-table--fixed"><colgroup><col style="width:5rem"><col></colgroup>
          <tbody><tr id="plainRow"><td id="plainCell">Кредитная карта, рассрочка</td><td>—</td></tr></tbody>
        </table>
      </div>
      <div class="ds-table-wrap" style="width:260px">
        <table class="ds-table ds-table--fixed"><colgroup><col style="width:5rem"><col></colgroup>
          <tbody><tr id="wrapRow"><td id="wrapCell" class="ds-table__wrap">Кредитная карта, рассрочка</td><td>—</td></tr></tbody>
        </table>
      </div>`,
    measure: () => {
      const plain = document.querySelector('#plainCell')
      const wrapped = document.querySelector('#wrapCell')
      return {
        plainH: +document.querySelector('#plainRow').getBoundingClientRect().height.toFixed(1),
        wrapH: +document.querySelector('#wrapRow').getBoundingClientRect().height.toFixed(1),
        plainClipped: plain.scrollWidth > plain.clientWidth,
        wrapClipped: wrapped.scrollWidth > wrapped.clientWidth,
        // Санитары с заранее известным ответом: лист не доехал — обе ячейки
        // окажутся `normal`, и провал будет читаться как «стилей нет», а не
        // как «правило проиграло».
        plainWS: getComputedStyle(plain).whiteSpace,
        wrapWS: getComputedStyle(wrapped).whiteSpace,
      }
    },
    expect: (m) =>
      (m.wrapH > m.plainH && m.plainClipped && !m.wrapClipped)
      || `перенос ${m.wrapH}px против ${m.plainH}px, сокращение ${m.plainClipped}/${m.wrapClipped}`
         + ` (white-space ${m.plainWS}/${m.wrapWS})`,
  },
  {
    name: 'Раскладка fixed: неразрывный токен в переносимой колонке разрывается, а не срезается',
    why: 'перенос по словам не спасает от токена без пробелов; горизонтальное переполнение тут мерить нельзя — его прячет overflow:hidden, и проверка проходила бы всегда',
    html: `
      <div class="ds-table-wrap" style="width:260px">
        <table class="ds-table ds-table--fixed"><colgroup><col style="width:5rem"><col></colgroup>
          <tbody><tr id="shortRow"><td class="ds-table__wrap">код</td><td>—</td></tr></tbody>
        </table>
      </div>
      <div class="ds-table-wrap" style="width:260px">
        <table class="ds-table ds-table--fixed"><colgroup><col style="width:5rem"><col></colgroup>
          <tbody><tr id="tokenRow"><td id="tokenCell" class="ds-table__wrap">JIGTABLE79регрессияраскладки</td><td>—</td></tr></tbody>
        </table>
      </div>`,
    measure: () => {
      const cell = document.querySelector('#tokenCell')
      return {
        // Токен разорван — ячейка стала многострочной и выросла. Срезан —
        // высота осталась как у соседней с коротким словом.
        shortH: +document.querySelector('#shortRow').getBoundingClientRect().height.toFixed(1),
        tokenH: +document.querySelector('#tokenRow').getBoundingClientRect().height.toFixed(1),
        // И весь текст помещается: разорвать по буквам, но обрезать по низу —
        // тот же дефект под другим углом.
        clippedVertically: cell.scrollHeight > cell.clientHeight,
      }
    },
    expect: (m) => (m.tokenH > m.shortH && !m.clippedVertically)
      || `токен ${m.tokenH}px против короткого ${m.shortH}px, срез по низу ${m.clippedVertically}`,
  },
  {
    name: 'Tooltip: пузырёк наводим и связан с триггером без разрыва (WCAG 1.4.13)',
    why: 'подсказка гаснет ровно в тот момент, когда к ней тянутся мышью — jsdom этого не видит',
    html: `<div style="padding:60px 40px">
      <span class="ds-tooltip" id="wrap">
        <button id="trig">Стоимость</button>
        <span class="ds-tooltip__bubble" id="bub" role="tooltip">Anthropic · input 12k</span>
      </span></div>`,
    measure: () => {
      const bub = document.querySelector('#bub')
      const trig = document.querySelector('#trig')
      const b = bub.getBoundingClientRect()
      const t = trig.getBoundingClientRect()
      const cs = getComputedStyle(bub)
      const bridge = getComputedStyle(bub, '::after')
      return {
        // Санитар, меняющийся вместе с проверяемым: если лист стилей не доехал,
        // пузырёк не позиционирован и лежит в потоке — тогда он НЕ выше кнопки.
        bubbleAboveTrigger: b.bottom <= t.top + 0.5,
        pointerEvents: cs.pointerEvents,
        gap: +(t.top - b.bottom).toFixed(2),
        // 'auto' у ::after значит, что псевдоэлемента нет вовсе — это отдельный
        // отказ («мостика нет»), а не «мостик нулевой высоты».
        bridgeHeight: bridge.content === 'none' || bridge.height === 'auto'
          ? null : +parseFloat(bridge.height).toFixed(2),
        bridgeTop: bridge.top,
      }
    },
    expect: (m) => {
      if (!m.bubbleAboveTrigger) return 'пузырёк не над триггером — стили не доехали, замер бессмыслен'
      if (m.pointerEvents === 'none') return 'pointer-events: none — пузырёк не навести (WCAG 1.4.13)'
      // Мостик обязан закрыть зазор целиком: недобор в доли пикселя и есть та
      // щель, в которую проваливается курсор.
      if (m.bridgeHeight === null) return `зазор ${m.gap}px, мостика нет — курсор проваливается между триггером и пузырьком`
      return m.bridgeHeight >= m.gap - 0.5
        || `зазор ${m.gap}px, мостик ${m.bridgeHeight}px — курсор проваливается между ними`
    },
  },
  {
    name: 'theme-auto: явно выбранная светлая побеждает системную тёмную',
    why: 'иначе файл, обещающий «явный выбор побеждает системный», сам его и отменяет',
    colorScheme: 'dark',
    extraLink: 'theme-auto.css',
    html: `<div id="probe">проба</div>`,
    measure: () => {
      const read = () => getComputedStyle(document.documentElement).getPropertyValue('--ds-surface').trim()
      const html = document.documentElement
      const out = {}
      // Санитар, меняющийся вместе с проверяемым: без атрибута системная тёмная
      // ОБЯЗАНА сработать. Если и здесь светло — theme-auto не доехал, и
      // остальные два измерения ничего не значат.
      html.removeAttribute('data-theme')
      out.noAttr = read()
      html.setAttribute('data-theme', 'light')
      out.explicitLight = read()
      html.setAttribute('data-theme', 'dark')
      out.explicitDark = read()
      html.removeAttribute('data-theme')
      return out
    },
    expect: (m) => {
      if (m.noAttr === m.explicitDark) {
        // Обе тёмные — так и должно быть.
      } else {
        return `theme-auto не сработал: без атрибута ${m.noAttr}, а тёмная ${m.explicitDark}`
      }
      if (m.explicitLight === m.explicitDark) {
        return `явная светлая (${m.explicitLight}) не отличается от тёмной — выбор пользователя отменён`
      }
      return true
    },
  },
  {
    name: 'DataTable: заданные ширины колонок соблюдаются, остаток делится',
    why: 'у auto-раскладки текстовая колонка забирает место у числовых — и это поведение по умолчанию, а не особенность данных',
    width: 900,
    html: `<div class="ds-table-wrap"><table class="ds-table ds-table--fixed">
      <colgroup><col style="width:180px"><col><col style="width:140px"></colgroup>
      <thead><tr><th id="h1">Банк</th><th id="h2">Продукты</th><th id="h3">Долг</th></tr></thead>
      <tbody><tr>
        <td>ОЗОН Банк</td>
        <td>Кредитная карта, рассрочка, длинный перечень продуктов банка</td>
        <td class="ds-table__end ds-table__num">82 040</td>
      </tr></tbody></table></div>`,
    measure: () => {
      const w = (id) => +document.querySelector('#' + id).getBoundingClientRect().width.toFixed(1)
      const table = document.querySelector('table').getBoundingClientRect().width
      return {
        // Санитар меняется вместе с проверяемым: если лист стилей не доехал,
        // table-layout остаётся auto и ширины поплывут — но тогда и режим
        // прочитается как auto, и это надо назвать, а не молча сравнивать.
        layout: getComputedStyle(document.querySelector('table')).tableLayout,
        bank: w('h1'), products: w('h2'), debt: w('h3'), table,
      }
    },
    expect: (m) => {
      if (m.layout !== 'fixed') return `table-layout = ${m.layout}, а не fixed — стили не доехали, замер бессмыслен`
      // Допуск 1px: границы 1px схлопнуты border-collapse и делятся между колонками.
      if (Math.abs(m.bank - 180) > 1.5) return `колонка с width:180px получила ${m.bank}px`
      if (Math.abs(m.debt - 140) > 1.5) return `колонка с width:140px получила ${m.debt}px`
      // Колонка без ширины забирает ОСТАТОК, а не долю по содержимому.
      const rest = m.table - m.bank - m.debt
      return Math.abs(m.products - rest) <= 1.5
        || `колонка без ширины получила ${m.products}px вместо остатка ${rest.toFixed(1)}px`
    },
  },
  {
    name: 'DataTable: итог под numeric-колонкой правым краем совпадает с ячейками данных',
    why: 'итог, попавший не в свою колонку или без numeric-выравнивания, разъедется с числами; jsdom раскладки не видит',
    width: 600,
    // Значения обёрнуты в span и меряется правый край ТЕКСТА, а не ячейки:
    // правый край <td> совпадает по колонке при любом text-align (это ширина
    // столбца), поэтому по ячейке проверка неопровержима — снятие ds-table__end
    // её не роняет (проверено мутацией). Правое выравнивание двигает именно
    // текст, и его край — то, что расходится, когда итог теряет класс края.
    html: `<div class="ds-table-wrap"><table class="ds-table" data-ds-managed-rows>
      <thead><tr><th>Операция</th><th class="ds-table__end ds-table__num"><span id="head">Сумма</span></th></tr></thead>
      <tbody>
        <tr class="ds-table__group"><td class="ds-table__lead" colspan="1">Итого</td>
          <td class="ds-table__end ds-table__num"><span id="tot">4 600</span></td></tr>
        <tr><td class="ds-table__lead">Товар А</td><td class="ds-table__end ds-table__num"><span id="cell">1 200</span></td></tr>
      </tbody></table></div>`,
    measure: () => {
      const right = (id) => +document.querySelector('#' + id).getBoundingClientRect().right.toFixed(1)
      // Санитар с известным значением: правый край текста заголовка той же
      // колонки — он выровнен по построению, и врущий инструмент выдаст себя на нём.
      return { tot: right('tot'), cell: right('cell'), head: right('head') }
    },
    expect: (m) => (Math.abs(m.tot - m.cell) <= 0.6 && Math.abs(m.cell - m.head) <= 0.6)
      || `итог ${m.tot} vs ячейка ${m.cell} vs заголовок ${m.head}`,
  },
  {
    name: 'Stack/Grid: без gap дети стоят на базовом шаге, а gap={0} — вплотную',
    why: 'DS-179. У раскладочных примитивов не было умолчания зазора: не передали `gap` — в `style` не попадало ничего, у флекса оставался `gap: normal`, то есть ноль. Потребитель ставил два компонента рядом, они слипались, и он тянулся за своим `margin` — это и есть «хаки», о которых пришла жалоба. При этом `0` в `StackGap` есть ЯВНО, значит «хочу вплотную» и «не подумал про зазор» давали один результат и не различались ни глазом, ни грепом. Шаг выбран замером наших же вызовов (разбором ТЕГА, не строки): явных числовых 38 — `3` 16 раз, `2` 14, `4` 5, `5` 2, `1` 1. Умолчание объявлено в ЛИСТЕ, а не инлайном, чтобы правило потребителя могло его перебить, а `gap={n}` оставался сильнее обоих. Случай меряет ПИКСЕЛИ между детьми, потому что jsdom листов не считает и «умолчание работает» там утверждать не о чем; заодно он держит нулевую ступень: `--ds-space-0` объявлен ради `gap={0}`, и без него подстановка давала бы невалидное объявление — раньше оно падало в `normal` и «работало» по совпадению, а с умолчанием в листе означало бы молча вернувшийся зазор',
    // Разметка снята со `Stack.tsx` и `Grid.tsx`: класс плюс инлайновый `gap`
    // ровно в той форме, которую пишет компонент.
    //
    // Дети — фиксированной ширины и высоты, чтобы расстояние между ними
    // считалось вычитанием коробок, а не зависело от текста. У сетки треки
    // заданы В ТУ ЖЕ ширину намеренно: на `minmax(0, 1fr)` между детьми лежал
    // бы ещё и остаток трека, и первая редакция случая намеряла 63px вместо 6 —
    // число правдоподобное и не о зазоре.
    html: (() => {
      const kid = (id) => `<div id="${id}" style="width:40px;height:20px;background:var(--ds-surface-subtle)"></div>`
      return `
        <div class="ds-stack" data-direction="row" id="st-default">${kid('st-d-a')}${kid('st-d-b')}</div>
        <div class="ds-stack" data-direction="row" id="st-zero" style="gap: var(--ds-space-0)">${kid('st-z-a')}${kid('st-z-b')}</div>
        <div class="ds-stack" data-direction="row" id="st-six" style="gap: var(--ds-space-6)">${kid('st-s-a')}${kid('st-s-b')}</div>
        <div class="ds-scale" style="--ds-ui-scale: 1.5">
          <div class="ds-stack" data-direction="row" id="st-scaled">${kid('st-x-a')}${kid('st-x-b')}</div>
        </div>
        <div class="ds-grid" id="gr-default" style="grid-template-columns: 40px 40px; width: max-content">${kid('gr-d-a')}${kid('gr-d-b')}</div>
        <div class="ds-grid" id="gr-zero" style="grid-template-columns: 40px 40px; width: max-content; gap: var(--ds-space-0)">${kid('gr-z-a')}${kid('gr-z-b')}</div>`
    })(),
    measure: () => {
      // Расстояние между детьми, а не значение свойства: `gap` в computed
      // отдаёт вычисленную длину и тогда, когда объявление отброшено, — то есть
      // читать надо результат, а не намерение.
      const between = (a, b) => {
        const l = document.getElementById(a).getBoundingClientRect()
        const r = document.getElementById(b).getBoundingClientRect()
        return +(r.left - l.right).toFixed(2)
      }
      const cs = getComputedStyle(document.documentElement)
      return {
        token3: cs.getPropertyValue('--ds-space-3').trim(),
        stackDefault: between('st-d-a', 'st-d-b'),
        stackZero: between('st-z-a', 'st-z-b'),
        stackSix: between('st-s-a', 'st-s-b'),
        stackScaled: between('st-x-a', 'st-x-b'),
        gridDefault: between('gr-d-a', 'gr-d-b'),
        gridZero: between('gr-z-a', 'gr-z-b'),
        declared: getComputedStyle(document.getElementById('st-default')).gap,
      }
    },
    expect: (m) => {
      const fails = []
      // САНИТАР: шкала обязана объявлять шаг. Обнулись `--ds-space-3` — всё
      // ниже сошлось бы на «ноль равен нулю», и умолчание молча вернулось бы к
      // дефекту, ради которого случай написан.
      if (!m.token3 || m.token3 === '0') fails.push(`--ds-space-3 = «${m.token3}» — шкала не объявляет базовый шаг`)
      // Ради чего всё: БЕЗ пропа дети НЕ слипаются.
      if (m.stackDefault < 5.5 || m.stackDefault > 6.5) {
        fails.push(`Stack без gap: между детьми ${m.stackDefault}px, а базовый шаг --ds-space-3 это 6px на шкале 1 — умолчание зазора не сработало`)
      }
      if (m.gridDefault < 5.5 || m.gridDefault > 6.5) {
        fails.push(`Grid без gap: между ячейками ${m.gridDefault}px вместо 6 — умолчание объявлено не для обоих примитивов`)
      }
      // ...и ноль остаётся выразим. Без этой половины «умолчание работает»
      // прошло бы и у примитива, который игнорирует `gap` вовсе.
      if (m.stackZero !== 0) fails.push(`Stack gap={0}: между детьми ${m.stackZero}px вместо 0 — «вплотную» стало невыразимо`)
      if (m.gridZero !== 0) fails.push(`Grid gap={0}: между ячейками ${m.gridZero}px вместо 0`)
      // Явное число сильнее умолчания, и оно не «просто не ноль».
      if (m.stackSix < 15.5 || m.stackSix > 16.5) {
        fails.push(`Stack gap={6}: ${m.stackSix}px вместо 16 — инлайновое значение не перебило лист`)
      }
      // Умолчание — ТОКЕН, а не прибитые пиксели: едет со шкалой поддерева.
      if (m.stackScaled < 8.5 || m.stackScaled > 9.5) {
        fails.push(`Stack без gap при --ds-ui-scale 1.5: ${m.stackScaled}px вместо 9 — умолчание написано числом, а не шагом шкалы`)
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'PivotTable: липнет колонка, а шапка и строка итога — нет, пока высоту обёртки не ограничили',
    why: 'DS-241. Комментарий в шапке `PivotTable.css` обещал, что прокрутка на обёртке даёт `position: sticky` опору, и был верен ровно наполовину: `max-width: 100%` делает обёртку контейнером прокрутки по ГОРИЗОНТАЛИ, а высоты у неё нет — по вертикали она равна содержимому и не листается вовсе, листается ДОКУМЕНТ. Значит из трёх липких мест работает одно (колонка имени строки), а шапка и строка итога уезжают со страницей. Тот же расклад разобран у `.ds-table-wrap.is-scrollable` (DS-169), там же перебраны все четыре формы `overflow`. Случай держит ОБЕ половины сразу — и цену, и лечение, — чтобы они не разъехались молча: ограничь высоту обёртки, и шапка липнет; сними ограничение — и снова нет. Задавать высоту умолчанием система не стала: любое число здесь отбирает у страницы вертикальный ритм и врёт в невысокой карточке',
    // Разметка снята с `PivotTable.tsx` (классы и вложенность оттуда). Ширина
    // кадра НЕ задаётся через `c.width`: тот пришпиливает `body { width }`, а
    // случаю нужен настоящий документ, который едет вниз.
    //
    // Две обёртки в одном документе, и это не дубль: одна как её отдаёт
    // компонент, вторая с `max-height` потребителя. Порознь каждая половина
    // доказуема тривиально — обёртка без прокрутки «держит» шапку просто
    // потому, что внутри ничего не двигали.
    html: (() => {
      const COLS = 14
      const head = Array.from({ length: COLS }, (_, i) => `<th class="ds-pivot__colhead ds-pivot__colhead--leaf" scope="col">${String(i + 1).padStart(2, '0')}.03</th>`).join('')
      const body = (k) => Array.from({ length: 12 }, (_, r) => `<tr class="ds-pivot__row"><th class="ds-pivot__rowhead" scope="row" id="pv-rh-${k}-${r}" style="--ds-pivot-depth:1">Иванов И.&nbsp;И. ${r + 1}</th>${Array.from({ length: COLS }, () => '<td class="ds-pivot__cell">1&nbsp;440,00</td>').join('')}</tr>`).join('')
      const pivot = (k, style) => `<div class="ds-pivot" id="pv-${k}"${style ? ` style="${style}"` : ''}>
        <table class="ds-pivot__table">
          <thead><tr style="--ds-pivot-level:0"><th class="ds-pivot__corner" scope="col">Парк / Водитель</th>${head}</tr></thead>
          <tbody>${body(k)}
            <tr class="ds-pivot__row ds-pivot__row--total"><th class="ds-pivot__rowhead" scope="row" style="--ds-pivot-depth:0">Итого</th>${Array.from({ length: COLS }, () => '<td class="ds-pivot__cell ds-pivot__cell--total">1&nbsp;022,00</td>').join('')}</tr>
          </tbody>
        </table></div>`
      return `${pivot('free', '')}<div style="height:24px"></div>${pivot('bound', 'max-height: 320px')}<div style="height:1200px"></div>`
    })(),
    measure: () => {
      // `scrollingElement`, а не `documentElement`: страница `measure` живёт в
      // quirks mode, и документ листает `body` (та же ловушка записана у
      // случая `PageShell`).
      const sc = document.scrollingElement
      const read = (k) => {
        const wrap = document.getElementById(`pv-${k}`)
        const box = () => wrap.getBoundingClientRect()
        const head = wrap.querySelector('.ds-pivot__colhead')
        const total = wrap.querySelector('.ds-pivot__row--total > .ds-pivot__cell')
        const rowhead = document.getElementById(`pv-rh-${k}-2`)
        const out = {
          clientH: wrap.clientHeight, scrollH: wrap.scrollHeight,
          clientW: wrap.clientWidth, scrollW: wrap.scrollWidth,
        }
        // ВЕРТИКАЛЬ внутри обёртки: домотали до упора и смотрим, куда встали
        // липкие. `reachedY` 0 значит, что мотать было нечего.
        wrap.scrollTop = 99999
        out.reachedY = wrap.scrollTop
        out.headTopRel = Math.round(head.getBoundingClientRect().top - box().top)
        out.totalBottomRel = Math.round(box().bottom - total.getBoundingClientRect().bottom)
        wrap.scrollTop = 0
        // ГОРИЗОНТАЛЬ: имя строки обязано держать своё место относительно
        // обёртки и до, и после прокрутки вбок.
        out.rowheadLeftBefore = Math.round(rowhead.getBoundingClientRect().left - box().left)
        wrap.scrollLeft = 99999
        out.reachedX = wrap.scrollLeft
        out.rowheadLeftAfter = Math.round(rowhead.getBoundingClientRect().left - box().left)
        wrap.scrollLeft = 0
        return out
      }
      const free = read('free')
      const bound = read('bound')
      // Липкость по вертикали проверяется прокруткой ДОКУМЕНТА — того, что на
      // самом деле едет у обёртки без высоты.
      const docBefore = { scrollH: sc.scrollHeight, clientH: sc.clientHeight }
      sc.scrollTop = 400
      const scrolledTo = sc.scrollTop
      const headTopFree = Math.round(document.querySelector('#pv-free .ds-pivot__colhead').getBoundingClientRect().top)
      sc.scrollTop = 0
      return { free, bound, ...docBefore, scrolledTo, headTopFree }
    },
    expect: (m) => {
      const fails = []
      // САНИТАРЫ. Без них половина утверждений верна тривиально.
      if (m.scrollH <= m.clientH + 100) fails.push(`документ ${m.scrollH} при кадре ${m.clientH} — прокручивать нечего, случай не о липкости`)
      if (m.scrolledTo < 300) fails.push(`документ не пролистался: просили 400, доехали до ${m.scrolledTo}`)
      for (const [k, p] of Object.entries({ free: m.free, bound: m.bound })) {
        if (p.scrollW <= p.clientW + 1) fails.push(`${k}: таблица (${p.scrollW}) влезла в обёртку (${p.clientW}) — горизонталь не о прокрутке`)
        // ГОРИЗОНТАЛЬ работает у обеих, и это половина, которую комментарий
        // обещал правильно.
        if (p.reachedX <= 0) fails.push(`${k}: обёртка не листается вбок (scrollLeft ${p.reachedX}) — колонки за краем недостижимы`)
        if (Math.abs(p.rowheadLeftAfter - p.rowheadLeftBefore) > 1) fails.push(`${k}: имя строки уехало с ${p.rowheadLeftBefore} на ${p.rowheadLeftAfter} — липкая колонка не липнет, числа теряют имя`)
      }
      // ЦЕНА. Обёртка как её отдаёт компонент по вертикали НЕ контейнер
      // прокрутки, и шапка уезжает вместе с документом. Это утверждение о
      // сегодняшнем положении дел, а не о желаемом: сойдись оно с обратным —
      // комментарий в `PivotTable.css` и `AGENTS.md` называют цену, которой
      // больше нет.
      if (m.free.scrollH > m.free.clientH + 1 || m.free.reachedY > 0) {
        fails.push(`обёртка без ограничения высоты стала листаться по вертикали (${m.free.scrollH} при ${m.free.clientH}, доехали до ${m.free.reachedY}) — цена, названная в PivotTable.css и AGENTS.md, устарела: перепиши её вместе с этим случаем`)
      }
      if (m.headTopFree > -100) {
        fails.push(`шапка на top ${m.headTopFree} после прокрутки документа на 400 — она НЕ уехала, то есть цена названа неверно`)
      }
      // ЛЕЧЕНИЕ. С `max-height` та же разметка липнет обеими полосами.
      if (m.bound.reachedY <= 0) {
        fails.push(`обёртка с max-height не листается по вертикали (scrollTop ${m.bound.reachedY}) — лечение не состоялось, и сравнивать не с чем`)
      } else {
        if (m.bound.headTopRel > 2) fails.push(`с max-height шапка на ${m.bound.headTopRel} от верха обёртки после прокрутки до упора — лечение, обещанное комментарием, не работает`)
        if (m.bound.totalBottomRel > 2) fails.push(`с max-height строка итога на ${m.bound.totalBottomRel} от низа обёртки — липкий низ не работает`)
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'PivotTable: числа выключены вправо, имя строки — влево',
    why: 'общее правило `.ds-pivot__table td` весит 0,2,0 и перебивает одиночный класс: `text-align: right` у ячейки было ОБЪЯВЛЕНО и отброшено каскадом, числа стояли влево. Тест по дереву такого не видит — класс на месте, применилось другое',
    width: 600,
    // Два числа РАЗНОЙ длины в одной колонке. Правая выключка равняет их правые
    // края и разводит левые, левая — ровно наоборот, поэтому проверяются оба:
    // одно равенство верно и у текста, который вообще не двигали.
    // Имена строк — санитар с известным наперёд значением: они выключены влево
    // по построению, и врущий инструмент выдаст себя на них.
    html: `<div class="ds-pivot"><table class="ds-pivot__table">
      <thead><tr style="--ds-pivot-level:0">
        <th class="ds-pivot__corner" scope="col">Парк</th>
        <th class="ds-pivot__colhead ds-pivot__colhead--leaf" scope="col">пн</th>
      </tr></thead>
      <tbody>
        <tr class="ds-pivot__row"><th class="ds-pivot__rowhead" scope="row"><span id="n1">Северный</span></th>
          <td class="ds-pivot__cell"><span id="short">7</span></td></tr>
        <tr class="ds-pivot__row"><th class="ds-pivot__rowhead" scope="row"><span id="n2">Ю</span></th>
          <td class="ds-pivot__cell"><span id="long">1 234 567,00</span></td></tr>
      </tbody></table></div>`,
    measure: () => {
      const box = (id) => {
        const b = document.querySelector('#' + id).getBoundingClientRect()
        return { l: +b.left.toFixed(1), r: +b.right.toFixed(1) }
      }
      return { short: box('short'), long: box('long'), n1: box('n1'), n2: box('n2') }
    },
    expect: (m) => (
      Math.abs(m.short.r - m.long.r) <= 0.6
      && m.long.l < m.short.l - 5
      && Math.abs(m.n1.l - m.n2.l) <= 0.6
    ) || `числа: правые ${m.short.r}/${m.long.r}, левые ${m.short.l}/${m.long.l}; `
      + `имена строк слева ${m.n1.l}/${m.n2.l}`,
  },
  {
    name: 'PivotTable: колонка итога отличима от обычной ячейки',
    why: 'у `.ds-pivot__cell--total` и насыщенность, и фон перебивались общим правилом ячейки — итог выглядел обычным числом, и таблица переставала отличать итог от данных',
    width: 600,
    html: `<div class="ds-pivot"><table class="ds-pivot__table"><tbody>
      <tr class="ds-pivot__row">
        <th class="ds-pivot__rowhead" scope="row">Северный</th>
        <td class="ds-pivot__cell" id="plain">1 200,00</td>
        <td class="ds-pivot__cell ds-pivot__cell--total" id="total">1 200,00</td>
      </tr></tbody></table></div>`,
    // Утверждается РАЗЛИЧИМОСТЬ, а не конкретные значения: схлопнувшиеся
    // состояния поодиночке проходят любую проверку на «жирный» и «серый».
    measure: () => {
      const st = (id) => {
        const cs = getComputedStyle(document.querySelector('#' + id))
        return { w: cs.fontWeight, bg: cs.backgroundColor }
      }
      return { plain: st('plain'), total: st('total') }
    },
    expect: (m) => (m.plain.w !== m.total.w && m.plain.bg !== m.total.bg)
      || `обычная ${m.plain.w}/${m.plain.bg} против итоговой ${m.total.w}/${m.total.bg}`,
  },
  /* Два прежних кейса — «muted красит фон, а не текст описания» и «muted
     побеждает зебру на чётной строке» — сняты на DS-137 вместе с
     решением, которое они стерегли. Первый утверждал ровно перевёрнутый знак:
     подложкой было `--ds-surface-subtle`, и в тёмной теме она СВЕТЛЕЕ строки.
     Второй мерил спор весов, которого больше нет: приглушение бьёт в `color`,
     зебра — в `background`, спорить им нечем. Полезная половина второго —
     «зебра уцелела» — стоит кейсом ниже. */
  {
    name: 'DataTable: зебра доживает до приглушённой строки, а не гасится ею',
    why: 'полезная половина снятого кейса про спор весов (DS-137). Приглушение переехало в `color`, и подложка чётной строки обязана остаться зеброй — если правило снова начнёт красить фон, полоса пропадёт молча, а таблица потеряет ритм ровно на тех строках, которые приглушены',
    html: `<table class="ds-table" data-ds-managed-rows><tbody>
      <tr class="ds-table__row--even" id="zebra"><td class="ds-table__lead">чётная</td></tr>
      <tr class="ds-table__row--even ds-table__row--muted" id="mutedeven"><td class="ds-table__lead">чётная muted</td></tr>
      <tr id="odd"><td class="ds-table__lead">нечётная</td></tr>
    </tbody></table>`,
    measure: () => {
      const bg = (id) => getComputedStyle(document.getElementById(id)).backgroundColor
      return { zebra: bg('zebra'), mutedeven: bg('mutedeven'), odd: bg('odd') }
    },
    expect: (m) => {
      // Санитар: полоса вообще существует. Без него «muted равен зебре» прошло
      // бы и на таблице, где зебры нет вовсе и обе строки прозрачны.
      if (m.zebra === m.odd) return `зебры нет: чётная и нечётная одного фона (${m.zebra})`
      return m.mutedeven === m.zebra || `чётная muted ${m.mutedeven} вместо зебры ${m.zebra}`
    },
  },
  {
    name: 'RouteBar: счётчик раздела — пилюля, а не квадрат',
    why: 'токен --ds-radius-pill не был определён ни разу: var() без фолбэка невалиден на этапе '
      + 'вычисления, border-radius падал в 0, и счётчик ехал квадратом во всех выпусках с 1.43.0. '
      + 'Соседний .ds-routebar__link меряется тем же прогоном с заведомо известными 3px — '
      + 'на нём видно, что инструмент читает радиусы, а не возвращает ноль всему подряд',
    html: `<nav class="ds-routebar"><ul class="ds-routebar__list">
      <li class="ds-routebar__item"><a class="ds-routebar__link" id="link" href="/debts"
        ><span class="ds-routebar__label">Долги</span
        ><span class="ds-routebar__count" id="count">2</span></a></li>
    </ul></nav>`,
    measure: () => {
      const el = document.querySelector('#count')
      return {
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
        height: el.getBoundingClientRect().height,
        neighbour: parseFloat(getComputedStyle(document.querySelector('#link')).borderTopLeftRadius),
      }
    },
    expect: (m) => (m.neighbour > 0 && m.radius >= m.height / 2)
      || `радиус ${m.radius} при высоте ${m.height} (сосед-контроль ${m.neighbour})`,
  },
  {
    name: 'LedgerList: колонки сводки выровнены между строками (subgrid)',
    why: 'раздельные гриды не делят треки; без subgrid правые края чисел разъедутся, jsdom этого не видит',
    width: 600,
    html: `<section class="ds-ledger" style="grid-template-columns: minmax(0,1fr) max-content">
      <div class="ds-ledger__head"><div>Операция</div><div class="ds-ledger__end ds-ledger__num"><span id="head">Сумма</span></div></div>
      <div class="ds-ledger__group" role="group">
        <details class="ds-ledger__rec"><summary class="ds-ledger__summary">
          <div class="ds-ledger__lead">Пятёрочка</div><div class="ds-ledger__end ds-ledger__num"><span id="a">1 200</span></div>
        </summary><div class="ds-ledger__detail">деталь</div></details>
        <div class="ds-ledger__rec ds-ledger__rec--plain"><div class="ds-ledger__summary">
          <div class="ds-ledger__lead">Очень длинное описание операции</div><div class="ds-ledger__end ds-ledger__num"><span id="b">999 999</span></div>
        </div></div>
      </div>
    </section>`,
    measure: () => {
      // Левый край ЯЧЕЙКИ суммы — то, что пришивает subgrid: колонка начинается
      // на одном x во всех строках. Правый край ТЕКСТА в 2 колонках тривиально
      // равен краю контейнера при right-align (и совпал бы даже без subgrid),
      // поэтому главная проверка — левый край колонки.
      const cellLeft = (id) => +document.getElementById(id).parentElement.getBoundingClientRect().left.toFixed(1)
      const textRight = (id) => +document.getElementById(id).getBoundingClientRect().right.toFixed(1)
      return { headL: cellLeft('head'), aL: cellLeft('a'), bL: cellLeft('b'), aR: textRight('a'), bR: textRight('b') }
    },
    expect: (m) => {
      if (!(Math.abs(m.aL - m.bL) <= 0.6 && Math.abs(m.aL - m.headL) <= 0.6))
        return `левый край колонки суммы разъехался: заголовок ${m.headL}, A ${m.aL}, B ${m.bL}`
      if (Math.abs(m.aR - m.bR) > 0.6) return `правый край числа разъехался: A ${m.aR} vs B ${m.bR}`
      return true
    },
  },
  {
    name: 'LedgerList: каретка не занимает грид-трек',
    why: 'каретка отдельным грид-элементом сдвинула бы колонку; ::before на ведущей ячейке — нет',
    width: 600,
    html: `<section class="ds-ledger" style="grid-template-columns: minmax(0,1fr) max-content">
      <details class="ds-ledger__rec"><summary class="ds-ledger__summary">
        <div class="ds-ledger__lead">С кареткой</div><div class="ds-ledger__end ds-ledger__num"><span id="exp">1 200</span></div>
      </summary><div class="ds-ledger__detail">деталь</div></details>
      <div class="ds-ledger__rec ds-ledger__rec--plain"><div class="ds-ledger__summary">
        <div class="ds-ledger__lead">Без каретки</div><div class="ds-ledger__end ds-ledger__num"><span id="plain">1 200</span></div>
      </div></div>
    </section>`,
    measure: () => {
      const right = (id) => +document.getElementById(id).getBoundingClientRect().right.toFixed(1)
      return { exp: right('exp'), plain: right('plain') }
    },
    expect: (m) => Math.abs(m.exp - m.plain) <= 0.6
      || `с кареткой ${m.exp} vs без ${m.plain} — каретка сдвинула колонку`,
  },
  /* «LedgerList: muted красит фон, а не текст» снят там же и по той же причине
     (DS-137): у записи знак переворачивался темой ровно так же, как у
     строки таблицы. Утверждение не потеряно, а переехало в общий кейс про
     приглушённую строку — он требует, чтобы тон записи и тон строки СОВПАДАЛИ:
     слово `muted` в системе одно. */
  {
    name: 'Токены темы: тёмная действительно переопределяет светлую',
    why: 'единственная точка, где ломается вся тёмная тема сразу',
    html: `<div id="light"></div><div data-theme="dark" id="dark"></div>`,
    measure: () => {
      const read = (el) => getComputedStyle(el).getPropertyValue('--ds-surface').trim()
      return { light: read(document.querySelector('#light')), dark: read(document.querySelector('#dark')) }
    },
    expect: (m) => (m.light && m.dark && m.light !== m.dark) || `light ${m.light}, dark ${m.dark}`,
  },
  {
    name: 'Timeline: маркер стоит на первой строке заголовка, а не в центре блока',
    why: 'у события с длинным телом маркер уехал бы вниз и перестал указывать на событие',
    html: `<ol class="ds-timeline">
      <li class="ds-timeline__item" id="one">
        <span class="ds-timeline__marker ds-timeline__marker--info" id="dot"></span>
        <div class="ds-timeline__head"><span class="ds-timeline__kind" id="kind">Статус</span></div>
        <div class="ds-timeline__body">Очень длинное тело события, которое обязано
          занять несколько строк, чтобы центр блока заметно разошёлся с центром
          первой строки заголовка. Ещё немного текста для верности.</div>
      </li></ol>`,
    width: 440,
    measure: () => {
      const dot = document.querySelector('#dot').getBoundingClientRect()
      const kind = document.querySelector('#kind').getBoundingClientRect()
      const item = document.querySelector('#one').getBoundingClientRect()
      return {
        dot: dot.top + dot.height / 2,
        line: kind.top + kind.height / 2,
        block: item.top + item.height / 2,
      }
    },
    expect: (m) => (Math.abs(m.dot - m.line) < 1.5 && Math.abs(m.dot - m.block) > 4)
      || `маркер ${m.dot.toFixed(2)}, строка ${m.line.toFixed(2)}, центр блока ${m.block.toFixed(2)}`,
  },
  {
    name: 'Timeline: рельс не торчит над первым маркером и под последним',
    why: 'хвост линии в пустоту читается как оборванная лента',
    html: `<ol class="ds-timeline">
      <li class="ds-timeline__day" id="day">27 июля 2026</li>
      <li class="ds-timeline__item" id="first">
        <span class="ds-timeline__marker ds-timeline__marker--info" id="d1"></span>
        <div class="ds-timeline__head"><span class="ds-timeline__kind">Статус</span></div>
        <div class="ds-timeline__body">первое</div></li>
      <li class="ds-timeline__item" id="last">
        <span class="ds-timeline__marker ds-timeline__marker--neutral" id="d2"></span>
        <div class="ds-timeline__head"><span class="ds-timeline__kind">Заметка</span></div>
        <div class="ds-timeline__body">последнее</div></li></ol>`,
    measure: () => {
      const rail = (sel) => {
        const el = document.querySelector(sel)
        const box = el.getBoundingClientRect()
        const cs = getComputedStyle(el, '::before')
        if (cs.content === 'none') return null
        return { top: box.top + parseFloat(cs.top), height: parseFloat(cs.height) }
      }
      const d1 = document.querySelector('#d1').getBoundingClientRect()
      const d2 = document.querySelector('#d2').getBoundingClientRect()
      const rFirst = rail('#first')
      const rLast = rail('#last')
      return {
        dayRail: rail('#day') !== null,
        headGap: rFirst === null ? null : rFirst.top - (d1.top + d1.height / 2),
        tailGap: rLast === null ? null : (rLast.top + rLast.height) - (d2.top + d2.height / 2),
      }
    },
    expect: (m) => (m.dayRail === false && Math.abs(m.headGap) < 1.5 && Math.abs(m.tailGap) < 1.5)
      || `рельс у заголовка: ${m.dayRail}, сверху ${m.headGap}, снизу ${m.tailGap}`,
  },
  {
    name: 'Timeline: рельс не рвётся на разделителе дня',
    why: 'разрыв линии на границе суток читается как начало другой ленты',
    html: `<ol class="ds-timeline">
      <li class="ds-timeline__item" id="before">
        <span class="ds-timeline__marker ds-timeline__marker--info"></span>
        <div class="ds-timeline__head"><span class="ds-timeline__kind">Статус</span></div>
        <div class="ds-timeline__body">до полуночи</div></li>
      <li class="ds-timeline__day" id="day">28 июля 2026</li>
      <li class="ds-timeline__item" id="after">
        <span class="ds-timeline__marker ds-timeline__marker--neutral"></span>
        <div class="ds-timeline__head"><span class="ds-timeline__kind">Заметка</span></div>
        <div class="ds-timeline__body">после</div></li></ol>`,
    measure: () => {
      const seg = (sel) => {
        const el = document.querySelector(sel)
        const box = el.getBoundingClientRect()
        const cs = getComputedStyle(el, '::before')
        return {
          none: cs.content === 'none',
          top: box.top + parseFloat(cs.top),
          bottom: box.top + parseFloat(cs.top) + parseFloat(cs.height),
          left: parseFloat(cs.left),
        }
      }
      const a = seg('#before'), d = seg('#day'), b = seg('#after')
      return {
        missing: a.none || d.none || b.none,
        gap1: d.top - a.bottom,
        gap2: b.top - d.bottom,
        drift: Math.abs(d.left - a.left) + Math.abs(b.left - a.left),
      }
    },
    expect: (m) => (!m.missing && Math.abs(m.gap1) < 1 && Math.abs(m.gap2) < 1 && m.drift < 0.5)
      || `пропуск ${m.missing}, зазоры ${m.gap1}/${m.gap2}, сдвиг по x ${m.drift}`,
  },
  {
    name: 'Timeline: рельс видно на подложке в обеих темах, а не только отрисован',
    why: 'соединительная линия — определяющий признак ленты; --ds-border на --ds-bg-app давал 1.275 и почти пропадал',
    html: ['light', 'dark'].map((t) => `<div ${t === 'dark' ? 'data-theme="dark"' : ''}
      style="background: var(--ds-bg-app); padding: 8px">
      <ol class="ds-timeline">
      <li class="ds-timeline__item" id="rail-${t}"><span class="ds-timeline__marker ds-timeline__marker--info"></span>
        <div class="ds-timeline__head"><span class="ds-timeline__kind">Статус</span></div>
        <div class="ds-timeline__body">одно</div></li>
      <li class="ds-timeline__item"><span class="ds-timeline__marker ds-timeline__marker--info"></span>
        <div class="ds-timeline__head"><span class="ds-timeline__kind">Статус</span></div>
        <div class="ds-timeline__body">два</div></li></ol></div>`).join(''),
    measure: () => {
      const lum = (css) => {
        const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const read = (theme) => {
        const item = document.querySelector(`#rail-${theme}`)
        const rail = getComputedStyle(item, '::before').backgroundColor
        // Фон берём с самой подложки, а не из токена: так учитывается тема,
        // объявленная на обёртке, а не только та, что стоит на :root.
        const back = getComputedStyle(item.closest('div')).backgroundColor
        return { rail, back, ratio: +ratio(lum(rail), lum(back)).toFixed(3) }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => (m.light.ratio >= 1.4 && m.dark.ratio >= 1.4)
      || `светлая ${m.light.rail} на ${m.light.back} = ${m.light.ratio}, `
        + `тёмная ${m.dark.rail} на ${m.dark.back} = ${m.dark.ratio}`,
  },
  {
    name: 'Timeline: dense действительно уменьшает шаг',
    why: 'MetricStrip.dense уехал в 1.6.0 с существующим классом и бессмысленным селектором',
    html: `<ol class="ds-timeline" id="plain">
        <li class="ds-timeline__item"><span class="ds-timeline__marker ds-timeline__marker--info"></span>
          <div class="ds-timeline__head"><span class="ds-timeline__kind">Статус</span></div>
          <div class="ds-timeline__body">одно</div></li>
        <li class="ds-timeline__item"><span class="ds-timeline__marker ds-timeline__marker--info"></span>
          <div class="ds-timeline__head"><span class="ds-timeline__kind">Статус</span></div>
          <div class="ds-timeline__body">два</div></li></ol>
      <ol class="ds-timeline ds-timeline--dense" id="dense">
        <li class="ds-timeline__item"><span class="ds-timeline__marker ds-timeline__marker--info"></span>
          <div class="ds-timeline__head"><span class="ds-timeline__kind">Статус</span></div>
          <div class="ds-timeline__body">одно</div></li>
        <li class="ds-timeline__item"><span class="ds-timeline__marker ds-timeline__marker--info"></span>
          <div class="ds-timeline__head"><span class="ds-timeline__kind">Статус</span></div>
          <div class="ds-timeline__body">два</div></li></ol>`,
    measure: () => ({
      plain: document.querySelector('#plain').getBoundingClientRect().height,
      dense: document.querySelector('#dense').getBoundingClientRect().height,
    }),
    expect: (m) => m.dense < m.plain - 4
      || `плотная ${m.dense.toFixed(2)} против обычной ${m.plain.toFixed(2)}`,
  },
  {
    name: 'LogViewer: колонка времени не пляшет между строками',
    why: 'при пропорциональном шрифте «1» уже «0», и текст лога дрожит по горизонтали при прокрутке',
    html: `<div class="ds-log" style="height:200px"><div class="ds-log__scroll">
      <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
        <time class="ds-log__time" id="t1">11:11:11</time>
        <span class="ds-log__kind ds-log__kind--info">Вид</span>
        <span class="ds-log__text" id="x1" style="--ds-log-clamp:3">раз</span></div>
      <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
        <time class="ds-log__time" id="t2">00:08:40</time>
        <span class="ds-log__kind ds-log__kind--info">Вид</span>
        <span class="ds-log__text" id="x2" style="--ds-log-clamp:3">два</span></div>
    </div></div>`,
    measure: () => ({
      t1: +document.querySelector('#t1').getBoundingClientRect().width.toFixed(2),
      t2: +document.querySelector('#t2').getBoundingClientRect().width.toFixed(2),
      x1: +document.querySelector('#x1').getBoundingClientRect().left.toFixed(2),
      x2: +document.querySelector('#x2').getBoundingClientRect().left.toFixed(2),
    }),
    expect: (m) => (Math.abs(m.t1 - m.t2) < 0.5 && Math.abs(m.x1 - m.x2) < 0.5)
      || `ширина времени ${m.t1} против ${m.t2}, левый край текста ${m.x1} против ${m.x2}`,
  },
  {
    name: 'LogViewer: обрезанная строка занимает ровно объявленное число строк',
    why: 'обрезка, не дающая обрезки, оставляет строку на весь экран и рушит оценку высоты в окне',
    html: `<div class="ds-log" style="height:400px"><div class="ds-log__scroll">
      <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
        <time class="ds-log__time">12:00:00</time><span class="ds-log__kind ds-log__kind--info">Вид</span>
        <span class="ds-log__text" id="one" style="--ds-log-clamp:3">коротко</span></div>
      <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
        <time class="ds-log__time">12:00:01</time><span class="ds-log__kind ds-log__kind--info">Вид</span>
        <span class="ds-log__text" id="cut" style="--ds-log-clamp:3">Очень длинная строка, которая обязана упереться в обрезку: слов тут заведомо больше, чем помещается в три строки при этой ширине панели, поэтому дальше идёт многоточие и продолжение не видно до разворота.</span></div>
      <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
        <time class="ds-log__time">12:00:02</time><span class="ds-log__kind ds-log__kind--info">Вид</span>
        <span class="ds-log__text ds-log__text--open" id="open">Очень длинная строка, которая обязана упереться в обрезку: слов тут заведомо больше, чем помещается в три строки при этой ширине панели, поэтому дальше идёт многоточие и продолжение не видно до разворота.</span></div>
    </div></div>`,
    width: 440,
    measure: () => {
      const h = (s) => document.querySelector(s).getBoundingClientRect().height
      const one = h('#one')
      return { one, cut: h('#cut'), open: h('#open'), ratio: +(h('#cut') / one).toFixed(2) }
    },
    expect: (m) => (Math.abs(m.ratio - 3) < 0.35 && m.open > m.cut + 4)
      || `одна ${m.one.toFixed(1)}, обрезанная ${m.cut.toFixed(1)} (×${m.ratio}), развёрнутая ${m.open.toFixed(1)}`,
  },
  {
    name: 'LogViewer: токен без пробелов переносится, а не распирает панель',
    why: 'в логе сплошные пути, хеши и base64; без переноса появляется горизонтальный скролл на весь лог',
    html: `<div class="ds-log" id="panel" style="height:200px"><div class="ds-log__scroll" id="scroll">
      <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
        <time class="ds-log__time">12:00:00</time><span class="ds-log__kind ds-log__kind--info">Вид</span>
        <span class="ds-log__text" id="blob" style="--ds-log-clamp:3">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsZXgiLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c</span></div>
    </div></div>`,
    width: 440,
    measure: () => {
      const scroll = document.querySelector('#scroll')
      const blob = document.querySelector('#blob').getBoundingClientRect()
      const panel = document.querySelector('#panel').getBoundingClientRect()
      return {
        overflowX: scroll.scrollWidth - scroll.clientWidth,
        blobRight: +blob.right.toFixed(2),
        panelRight: +panel.right.toFixed(2),
        lines: +(blob.height / parseFloat(getComputedStyle(document.querySelector('#blob')).lineHeight)).toFixed(2),
      }
    },
    expect: (m) => (m.overflowX <= 1 && m.blobRight <= m.panelRight + 1 && m.lines > 1.5)
      || `горизонтальный вылет ${m.overflowX}, правый край ${m.blobRight} против ${m.panelRight}, строк ${m.lines}`,
  },
  {
    name: 'LogViewer: панель действительно прокручивается, а не просто выглядит прокручиваемой',
    why: 'при overflow:visible геометрия остаётся прежней — содержимое вываливается наружу, прокрутки нет, и окно вырождается во весь список',
    html: `<div class="ds-log" id="panel" style="height:160px"><div class="ds-log__scroll" id="scroll">
      ${Array.from({ length: 40 }, (_, i) => `
        <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
          <time class="ds-log__time">12:00:${String(i).padStart(2, '0')}</time>
          <span class="ds-log__kind ds-log__kind--info">Вид</span>
          <span class="ds-log__text" style="--ds-log-clamp:3">строка ${i}</span></div>`).join('')}
    </div></div>`,
    measure: () => {
      const panel = document.querySelector('#panel')
      const scroll = document.querySelector('#scroll')
      // Проверяем не подобие прокрутки, а саму прокрутку: геометрия при
      // overflow:visible остаётся той же самой, отличается только то, что
      // scrollTop не двигается. Это единственный способ отличить одно от
      // другого — три предыдущие формулировки этого случая мутацию пережили.
      scroll.scrollTop = 9999
      const moved = scroll.scrollTop
      scroll.scrollTop = 0
      return {
        panel: +panel.getBoundingClientRect().height.toFixed(2),
        view: scroll.clientHeight,
        content: scroll.scrollHeight,
        moved,
      }
    },
    expect: (m) => (Math.abs(m.panel - 160) < 1 && m.view <= 160 && m.moved > 0)
      || `панель ${m.panel}, область ${m.view} при объявленных 160, `
        + `содержимое ${m.content}, прокрутилось на ${m.moved}`,
  },
  {
    name: 'LogViewer: кнопка возврата не отбирает высоту у области прокрутки',
    why: 'кнопка появляется при паузе — заняв место в колонке, она пересчитала бы окно и дёрнула лог ровно в момент прокрутки вверх',
    html: ['plain', 'tailed'].map((t) => `<div class="ds-log" id="p-${t}" style="height:160px">
      <div class="ds-log__scroll" id="s-${t}">
        ${Array.from({ length: 20 }, (_, i) => `
          <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
            <time class="ds-log__time">12:00:${String(i).padStart(2, '0')}</time>
            <span class="ds-log__kind ds-log__kind--info">Вид</span>
            <span class="ds-log__text" style="--ds-log-clamp:3">строка ${i}</span></div>`).join('')}
      </div>
      ${t === 'tailed' ? '<button type="button" class="ds-log__tail">К последним</button>' : ''}
    </div>`).join(''),
    measure: () => ({
      plain: +document.querySelector('#s-plain').getBoundingClientRect().height.toFixed(2),
      tailed: +document.querySelector('#s-tailed').getBoundingClientRect().height.toFixed(2),
    }),
    expect: (m) => Math.abs(m.plain - m.tailed) < 0.5
      || `без кнопки ${m.plain}, с кнопкой ${m.tailed} — кнопка отобрала высоту`,
  },
  {
    name: 'LogViewer: навигатор совпадений не отбирает высоту у области прокрутки',
    why: 'навигатор плавает (position:absolute), как «К последним»: заняв место в колонке, он пересчитывал бы окно и дёргал лог в момент появления query',
    html: ['plain', 'nav'].map((t) => `<div class="ds-log" id="p-${t}" style="height:160px">
      <div class="ds-log__scroll" id="s-${t}">
        ${Array.from({ length: 20 }, (_, i) => `
          <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
            <time class="ds-log__time">12:00:${String(i).padStart(2, '0')}</time>
            <span class="ds-log__kind ds-log__kind--info">Вид</span>
            <span class="ds-log__text" style="--ds-log-clamp:3">строка ${i}</span></div>`).join('')}
      </div>
      ${t === 'nav' ? '<div class="ds-log__nav"><button type="button" class="ds-log__nav-btn">‹</button><span class="ds-log__nav-count">1/3</span><button type="button" class="ds-log__nav-btn">›</button></div>' : ''}
    </div>`).join(''),
    measure: () => ({
      plain: +document.querySelector('#s-plain').getBoundingClientRect().height.toFixed(2),
      nav: +document.querySelector('#s-nav').getBoundingClientRect().height.toFixed(2),
    }),
    expect: (m) => Math.abs(m.plain - m.nav) < 0.5
      || `без навигатора ${m.plain}, с навигатором ${m.nav} — навигатор отобрал высоту`,
  },
  {
    name: 'BarChart: нулевая категория видна дорожкой и невидима без неё',
    why: 'нулевой столбец рисуется путём нулевой высоты — категория исчезает, и её не отличить от отсутствия данных',
    html: `<svg width="200" height="120" id="bare">
        <path class="ds-bar__rect" d="M 10 100 L 50 100 L 50 100 L 10 100 Z"/>
      </svg>
      <svg width="200" height="120" id="tracked">
        <rect class="ds-bar__track" x="10" y="10" width="40" height="90"/>
        <path class="ds-bar__rect" d="M 10 100 L 50 100 L 50 100 L 10 100 Z"/>
      </svg>`,
    measure: () => {
      const box = (sel) => {
        const el = document.querySelector(sel)
        const r = el.getBBox ? el.getBBox() : el.getBoundingClientRect()
        return +(r.height).toFixed(2)
      }
      return {
        bareBar: box('#bare .ds-bar__rect'),
        trackHeight: box('#tracked .ds-bar__track'),
        trackFill: getComputedStyle(document.querySelector('#tracked .ds-bar__track')).fill,
      }
    },
    // Столбец нулевой в обоих случаях — это данные. Дорожка обязана дать
    // категории видимую высоту и заливку, отличную от прозрачной.
    expect: (m) => (m.bareBar === 0 && m.trackHeight > 10 && m.trackFill !== 'none'
      && !m.trackFill.startsWith('rgba(0, 0, 0, 0'))
      || `столбец ${m.bareBar}, дорожка ${m.trackHeight}, заливка ${m.trackFill}`,
  },
  {
    name: 'BarChart: тон дорожки не совпадает с обычной — состояние читается',
    why: 'тон, который не отличается от нейтральной дорожки, есть в разметке и не виден на экране',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''}
      style="background: var(--ds-surface); padding: 6px">
      <svg width="200" height="60">
        <rect class="ds-bar__track" id="plain-${t}" x="0" y="0" width="40" height="50"/>
        <rect class="ds-bar__track ds-bar__track--accent" id="acc-${t}" x="50" y="0" width="40" height="50"/>
        <rect class="ds-bar__track ds-bar__track--error" id="err-${t}" x="100" y="0" width="40" height="50"/>
      </svg></div>`).join(''),
    measure: () => {
      const f = (id) => getComputedStyle(document.querySelector(`#${id}`)).fill
      const out = {}
      for (const t of ['light', 'dark']) {
        out[t] = { plain: f(`plain-${t}`), accent: f(`acc-${t}`), error: f(`err-${t}`) }
      }
      return out
    },
    expect: (m) => {
      const bad = []
      for (const t of ['light', 'dark']) {
        if (m[t].accent === m[t].plain) bad.push(`${t}: accent == обычная (${m[t].plain})`)
        if (m[t].error === m[t].plain) bad.push(`${t}: error == обычная`)
        if (m[t].accent === m[t].error) bad.push(`${t}: accent == error`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'BarChart горизонтальный: подпись категории не срезается с начала',
    why: 'поле подписей было константой 44px, а подпись прижата к нему концом (`textAnchor="end"`): всё длиннее ~7 знаков уезжало за левый край SVG, и «Центральный таксопарк» читалось как «ый таксопарк» — срезанное начало нельзя ни прочитать, ни узнать. DS-185: поле по самой длинной подписи в пределах 40% ширины, длиннее — многоточие С КОНЦА и полное имя в `<title>`. Потолок УСТУПАЕТ ИМЕНИ (DS-291), и с DS-295 «имя» значит не долю символов, а требование `catKeepChars`: символ сверх общего начала с каждым чужим именем, но не меньше четырёх. Доля была ПРОКСИ и промахивалась в обе стороны — «Центральны…» из 21 символа владелец прочитал верно, а «Автопарк…» у двух РАЗНЫХ парков долю проходит и не называет ни одного. Требование здесь считается заново, а не берётся из компонента: импортируй гейт ту же функцию, и он проверял бы согласие компонента с самим собой. Живой React, а не SSR: шрифт и ширина холста приходят после монтирования, статическая разметка мерила бы оценку на 520px',
    bundle: 'scripts/measure-charts.tsx',
    // Два набора. `long` — длинные имена без общего начала, где требование
    // держит ПОЛ. `twins` — «Центральный таксопарк» и «Центральный автопарк»,
    // расходящиеся на 13-м символе: там требование держит УНИКАЛЬНОСТЬ, и
    // только на нём жёлоб выходит за 40 % ширины. Без `twins` эта ветка потолка
    // не исполнялась бы ни разу и умерла бы молча (DS-295).
    html: ['long', 'twins'].flatMap((set) => [HOST_440, 440, 900, 1189].flatMap((w) => ['1', '1.5'].map((sc) =>
      `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-bar="${set}" data-w="${w}" data-sc="${sc}"></div>`))).join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-bar]')]
      for (const h of hosts) {
        WB.mountBar(h, {
          categories: h.dataset.bar === 'twins' ? WB.BAR_TWIN_CATEGORIES : WB.BAR_LONG_CATEGORIES,
          series: WB.BAR_SERIES,
          orientation: 'horizontal', height: 240,
        })
      }
      await document.fonts.ready
      // ResizeObserver → setState → перерисовка: ждём, пока холст не примет
      // ширину хоста, а не фиксированное число кадров.
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      for (let i = 0; i < 60; i++) {
        await frame()
        if (hosts.every((h) => +h.querySelector('svg').getAttribute('width') === h.clientWidth)) break
      }
      await frame(); await frame()
      return hosts.map((h) => {
        const svg = h.querySelector('svg')
        const W = +svg.getAttribute('width')
        const cats = [...svg.querySelectorAll('text.ds-bar__axis[text-anchor="end"]')].map((t) => ({
          shown: [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join(''),
          title: t.querySelector('title')?.textContent ?? null,
          x: +t.getBBox().x.toFixed(2),
        }))
        const gx = [...svg.querySelectorAll('.ds-bar__grid')].map((l) => +l.getAttribute('x1'))
        // Левая сетка стоит ровно на `pad.l` — это и есть жёлоб подписей.
        return {
          set: h.dataset.bar, w: +h.dataset.w, sc: +h.dataset.sc, host: h.clientWidth, W, cats,
          right: +(W - Math.max(...gx)).toFixed(2), gutter: +Math.min(...gx).toFixed(2),
        }
      })
    },
    expect: (m) => {
      const bad = []
      let cut = 0, whole = 0, grew = 0
      for (const r of m) {
        const at = `${r.set} ${r.w}px×${r.sc}`
        if (r.set === 'twins' && r.gutter > CAT_GUTTER_SHARE * r.W + 0.5) grew++
        if (r.W !== r.host) { bad.push(`${at}: холст ${r.W} при хосте ${r.host} — ResizeObserver не доехал, замер не о том`); continue }
        if (r.cats.length === 0) { bad.push(`${at}: подписей категорий нет — мерить нечего`); continue }
        // Правое поле подписей значений не трогалось: (18 + 26) × шкала.
        if (Math.abs(r.right - 44 * r.sc) > 0.5) bad.push(`${at}: правое поле ${r.right}, ожидалось ${44 * r.sc}`)
        // ПРАВИЛО ИМЕНИ — то же требование, что у нижнего ряда вертикали
        // (DS-280/295), распространённое на жёлоб (DS-291). Один
        // вопрос — один ответ: до 291 горизонталь, существующая РАДИ длинных
        // имён, резала их сильнее, чем вертикаль, для них не предназначенная.
        // Жёсткий предел в половину холста на данных случая не достигается —
        // достигнет, и гейт покраснеет: это и есть правильный момент посмотреть,
        // а не оговорка, которую надо заранее внести в условие.
        bad.push(...catNameFaults(at, r.cats))
        r.cats.forEach((c) => {
          if (c.x < 0) bad.push(`${at}: «${c.title ?? c.shown}» срезана с начала на ${(-c.x).toFixed(1)}px`)
          if (c.shown.endsWith('…')) {
            cut++
            if (!c.title) bad.push(`${at}: «${c.shown}» обрезана, а полного имени в <title> нет`)
            else if (!c.title.startsWith(c.shown.slice(0, -1).trimEnd())) bad.push(`${at}: «${c.shown}» не начало «${c.title}» — обрезка не с конца`)
          } else {
            whole++
            if (c.title) bad.push(`${at}: «${c.shown}» целая, но несёт <title> «${c.title}»`)
          }
        })
      }
      // Оба состояния обязаны встретиться: без обрезки случай не проверял бы
      // многоточие, без целых — что поле растёт под подпись.
      if (!bad.length && cut === 0) bad.push('ни одной обрезанной подписи — многоточие и <title> не проверены')
      if (!bad.length && whole === 0) bad.push('ни одной целой подписи — рост поля под подпись не проверен')
      // Санитар на саму ветку потолка (DS-291/295): набор `twins` заведён
      // ровно ради неё, и если жёлоб нигде не вышел за 40 %, ветка не
      // исполнилась — зелёный тогда говорит только то, что её не звали.
      if (!bad.length && grew === 0) bad.push('жёлоб ни разу не вышел за 40 % ширины — уступка потолка ради различающего символа не проверена')
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Подписи категорий вертикального BarChart и оси X LineChart не перекрываются и не выходят за холст',
    why: 'DS-274. Подпись категории вертикального BarChart стояла по центру полосы без ограничения ширины: на 360 × 1 соседние перекрывались на 6.6–38.3 px, последняя уходила за правый край на 16.2 px, на 1.5 — до 93 px. Теперь она обрезается С КОНЦА по ширине полосы, полное имя в `<title>`: категории номинальные, прореживать их нельзя. У LineChart ось X — порядок, и там шаг подписей берётся по самой широкой из них, а крайние прижимаются к холсту: на 360 × 1.5 «Сентябрь» и «Октябрь» наезжали друг на друга. Попарное пересечение bbox, а не «стало меньше»: меньше даёт и сломанная в другую сторону обрезка. DS-296: на 300 × 1.5 набор `weeks` прямым рядом оставлял ОДНУ подпись из двенадцати — ось порядка без шага и направления. Когда прямой ряд даёт меньше двух подписей, ряд оси X поворачивается ЦЕЛИКОМ на −45° якорем `end` у своей точки (тот же приём и та же геометрия, что у категорий BarChart), прореживание остаётся ровным от последней точки назад, а условие непересечения — для параллельных диагоналей; нижнее поле растёт под самую длинную показанную подпись. Не обрезка: обрезанная дата врёт, а формат даты — данные потребителя. Для повёрнутого ряда здесь попарный SAT по углам через CTM, края холста и посимвольное совпадение текста с данными',
    bundle: 'scripts/measure-charts.tsx',
    // У LineChart два набора и две защиты: `line` (шесть месяцев) держит уход
    // предыдущей подписи перед последней, `weeks` (двенадцать недель диапазонами дат) — шаг по
    // ширине, когда тесно подряд. Каждая мутация краснеет только на своём.
    // Точка владельца (`HOST_440`) вернулась на DS-296. Она краснела не
    // оснасткой: на 300×1.5 прямой ряд оставлял из двенадцати недель ОДНУ
    // подпись, и санитар «перекрывать нечему» говорил правду — ось порядка с
    // одной меткой не говорит ни шага, ни направления. Теперь там ряд
    // повёрнут целиком, и для него здесь своя честная проверка: попарно SAT по
    // углам через CTM, края холста, текст подписи — посимвольно из данных.
    html: ['bar', 'line', 'weeks'].flatMap((kind) => [HOST_440, 440, 900, 1189].flatMap((w) => ['1', '1.5'].map((sc) =>
      `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-xlab="${kind}" data-w="${w}" data-sc="${sc}"></div>`))).join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-xlab]')]
      for (const h of hosts) {
        if (h.dataset.xlab === 'bar') {
          WB.mountBar(h, { categories: WB.BAR_LONG_CATEGORIES, series: WB.BAR_SERIES, orientation: 'vertical', height: 240 })
        } else {
          WB.mountLine(h, { series: h.dataset.xlab === 'weeks' ? WB.LINE_WEEKS_SERIES : WB.LINE_SHORT_SERIES, height: 220 })
        }
      }
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const width = (svg) => +svg.getAttribute('viewBox').split(' ')[2]
      for (let i = 0; i < 60; i++) {
        await frame()
        if (hosts.every((h) => width(h.querySelector('svg')) === h.clientWidth)) break
      }
      await frame(); await frame()
      return hosts.map((h) => {
        const svg = h.querySelector('svg')
        const bar = h.dataset.xlab === 'bar'
        const pt = svg.createSVGPoint()
        const labels = [...svg.querySelectorAll(bar ? ':scope > g > text.ds-bar__axis' : 'text.ds-chart__xlabel')]
          // Подпись категории у BarChart лежит внутри группы своей категории, а
          // подпись тика числовой оси — прямым ребёнком `svg`. По якорю их
          // больше не различить: повёрнутая подпись категории прижата концом
          // так же, как число (DS-280). Пустой текст (полоса уже «…») не
          // рисуется.
          .filter((t) => [...t.childNodes].some((n) => n.nodeType === 3 && n.data))
          .map((t) => {
            const b = t.getBBox(), m = t.getCTM()
            return {
              shown: [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join(''),
              title: t.querySelector('title')?.textContent ?? null,
              // Угол нужен не ради поворота, а ради ЧЕСТНОСТИ этих двух чисел:
              // у повёрнутого текста `getBBox` отдаёт коробку ДО поворота.
              angle: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI),
              l: +b.x.toFixed(2), r: +(b.x + b.width).toFixed(2),
              // Четыре угла через CTM — для повёрнутого ряда оси X LineChart
              // (DS-296), где пара `l/r` не описывает ничего.
              box: [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]]
                .map(([x, y]) => { pt.x = x; pt.y = y; const p = pt.matrixTransform(m); return [+p.x.toFixed(2), +p.y.toFixed(2)] }),
            }
          })
        // Подписи оси X — ИЗ ДАННЫХ: обрезанная дата врёт, и сверять показанное
        // надо с тем, что компонент получил, а не с тем, что он нарисовал.
        const source = bar ? null
          : (h.dataset.xlab === 'weeks' ? WB.LINE_WEEKS_SERIES : WB.LINE_SHORT_SERIES)
            .reduce((b, s) => (s.points.length > b.length ? s.points : b), []).map((p) => String(p.x))
        return {
          kind: h.dataset.xlab, w: +h.dataset.w, sc: +h.dataset.sc, host: h.clientWidth,
          W: width(svg), H: +svg.getAttribute('viewBox').split(' ')[3], labels, source,
        }
      })
    },
    expect: (m) => {
      const bad = []
      let cut = 0, whole = 0, flat = 0
      // Ряды оси X LineChart: повёрнутые где угодно и прямые на 440 и шире (JIG-29, было 360).
      let lineTurned = 0, lineFlatWide = 0
      for (const r of m) {
        const at = `${r.kind} ${r.w}px×${r.sc}`
        if (r.W !== r.host) { bad.push(`${at}: холст ${r.W} при хосте ${r.host} — ResizeObserver не доехал, замер не о том`); continue }
        if (r.labels.length < 2) { bad.push(`${at}: подписей ${r.labels.length} — перекрывать нечему`); continue }
        // Повёрнутый ряд категорий (DS-280) эти два числа не описывают:
        // `getBBox` отдаёт коробку ДО поворота, и попарное сравнение по ней
        // напечатало бы пересечения там, где идут параллельные диагонали.
        // Повёрнутая раскладка живёт в соседнем случае, по углам через CTM;
        // здесь остаётся ПРЯМОЙ ряд — предмет самой 274.
        const turned = r.labels.some((l) => l.angle !== 0)
        if (r.kind !== 'bar') {
          // Ни одна подпись оси X не обрезана — ни в прямом ряду, ни в
          // повёрнутом (DS-296): дата без хвоста — другая дата.
          for (const l of r.labels) {
            if (!r.source.includes(l.shown)) bad.push(`${at}: подпись оси X «${l.shown}» не совпадает ни с одной точкой данных — обрезана или чужая`)
          }
          if (!turned && r.w >= 440) lineFlatWide++
        }
        if (turned && r.kind !== 'bar') {
          // Повёрнутый ряд оси X LineChart (DS-296): ЦЕЛИКОМ на −45°,
          // параллельные диагонали попарно не пересекаются по SAT, ни одна не
          // выходит за края холста. Коробка — через CTM, не `getBBox`.
          lineTurned++
          const angles = [...new Set(r.labels.map((l) => l.angle))]
          if (angles.length !== 1 || angles[0] !== -45) bad.push(`${at}: ряд оси X повёрнут на ${angles.join('°, ')}°, а не целиком на −45`)
          for (const l of r.labels) {
            const xs = l.box.map((p) => p[0]), ys = l.box.map((p) => p[1])
            if (Math.min(...xs) < -0.5) bad.push(`${at}: «${l.shown}» за левым краем на ${(-Math.min(...xs)).toFixed(1)}px`)
            if (Math.max(...xs) > r.W + 0.5) bad.push(`${at}: «${l.shown}» за правым краем на ${(Math.max(...xs) - r.W).toFixed(1)}px`)
            if (Math.max(...ys) > r.H + 0.5) bad.push(`${at}: «${l.shown}» уходит за нижний край на ${(Math.max(...ys) - r.H).toFixed(1)}px`)
          }
          for (let i = 0; i < r.labels.length; i++) {
            for (let j = i + 1; j < r.labels.length; j++) {
              const d = satDepth(r.labels[i].box, r.labels[j].box)
              if (d > 0.5) bad.push(`${at}: «${r.labels[i].shown}» и «${r.labels[j].shown}» перекрываются на ${d.toFixed(1)}px`)
            }
          }
        }
        if (!turned) {
          if (r.kind === 'bar') flat++
          const ls = [...r.labels].sort((a, b) => a.l - b.l)
          for (let i = 1; i < ls.length; i++) {
            const over = ls[i - 1].r - ls[i].l
            if (over > 0) bad.push(`${at}: «${ls[i - 1].shown}» и «${ls[i].shown}» перекрываются на ${over.toFixed(1)}px`)
          }
          if (ls[0].l < 0) bad.push(`${at}: «${ls[0].shown}» за левым краем на ${(-ls[0].l).toFixed(1)}px`)
          const last = ls[ls.length - 1]
          if (last.r > r.W) bad.push(`${at}: «${last.shown}» за правым краем на ${(last.r - r.W).toFixed(1)}px`)
        }
        if (r.kind === 'bar') {
          for (const c of r.labels) {
            if (c.shown.endsWith('…')) {
              cut++
              if (!c.title || !c.title.startsWith(c.shown.slice(0, -1).trimEnd())) bad.push(`${at}: «${c.shown}» обрезана, а <title> «${c.title}» — не её полное имя`)
            } else {
              whole++
              if (c.title) bad.push(`${at}: «${c.shown}» целая, но несёт <title>`)
            }
          }
        }
      }
      if (!bad.length && cut === 0) bad.push('ни одной обрезанной подписи категории — многоточие не проверено')
      if (!bad.length && whole === 0) bad.push('ни одной целой подписи категории — случай не видит простор')
      // Санитар на сам пропуск повёрнутых: поверни компонент ВЕЗДЕ — и случай
      // проверял бы только `<title>`, молча перестав быть про ширину полосы.
      if (!bad.length && flat === 0) bad.push('ни одного ПРЯМОГО ряда категорий — обрезка по ширине полосы не проверена вовсе, вся раскладка ушла в поворот')
      // Санитары DS-296: без первого зелёный значил бы «ветку поворота
      // оси X не звали», без второго — «повернули везде», и прямой ряд 274
      // перестал бы проверяться молча.
      if (!bad.length && lineTurned === 0) bad.push('ни одного повёрнутого ряда оси X LineChart — ветка поворота не исполнилась, проверка SAT не о чем')
      if (!bad.length && lineFlatWide === 0) bad.push('на 440 и шире ни одного ПРЯМОГО ряда оси X LineChart — вся ось ушла в поворот')
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Подпись категории вертикального BarChart называет категорию: имя опознаётся, ряд повёрнут целиком',
    why: 'DS-280, правило переписано DS-295. Обрезка с конца (DS-274) обещала «не перекрываются и не выходят за холст» и на узком холсте выполнила обещание буквально: на 360 подписи ужимались до «Ав…» и «Ав…» у РАЗНЫХ парков, «Юг / С… / В… / За… / Ц…» — многоточие читается, категория нет. Предмет случая поэтому не ширина. До 295 предметом звалась ДОЛЯ ИМЕНИ (не меньше половины символов), и это был прокси: на 300×1.5 «Центральны…» — 10 символов из 21, по доле дефект, а владелец прочитал имя посимвольно верно (DS-290); в другую сторону доля пропускала «Автопарк…» у двух разных парков. Предмет — НЕОДНОЗНАЧНОСТЬ, и требований два: показанное длиннее общего начала с каждым ЧУЖИМ именем хотя бы на символ (у одинаковых имён требования нет — его не дала бы никакая длина) и не короче пола в 4 символа, а имя короче пола показывается целиком. Когда столбец уже требуемого, ряд поворачивается на −45° якорем `end` у своей риски, предел обрезки считается по диагонали, а нижнее поле растёт под самую длинную повёрнутую подпись — на узком холсте есть высота, но нет ширины. Ряд поворачивается ЦЕЛИКОМ: вперемешку прямые и повёрнутые читаются как два ряда. Пересечения — по осям самих прямоугольников (SAT), а не по AABB: у соседних диагоналей AABB пересекаются всегда, и случай краснел бы на здоровой раскладке. Живой React: шрифт и ширина холста приходят после монтирования',
    bundle: 'scripts/measure-charts.tsx',
    // Два набора: `long` — длинные имена парков (случай фикстуры `long-vertical`),
    // `big` — короткие имена при семизначной шкале (`base&data=big`), где полосу
    // сужает выросшее поле чисел, а не длина самих имён.
    // Точка владельца (`HOST_440`) вернулась на DS-295. Она краснела не
    // оснасткой: на 300×1.5 ряд УЖЕ повёрнут и по диагонали даёт «Центральны…»
    // — 10 символов из 21, и прежний порог «половина» требовал 11. Правило
    // имени требует там 4 (соседей с общим началом у него нет), и та же точка
    // зелена БЕЗ ослабления: «Автопарк-Ю…» против «Автопарк-С…» требуют 10 и
    // получают ровно 10.
    html: ['long', 'big'].flatMap((set) => [HOST_440, 440, 900].flatMap((w) => ['1', '1.5'].map((sc) =>
      `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-rot="${set}" data-w="${w}" data-sc="${sc}"></div>`))).join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-rot]')]
      for (const h of hosts) {
        const long = h.dataset.rot === 'long'
        WB.mountBar(h, {
          categories: long ? WB.BAR_LONG_CATEGORIES : WB.BAR_CATEGORIES,
          series: long ? WB.BAR_SERIES : WB.BAR_BIG_SERIES,
          orientation: 'vertical', height: 240,
        })
      }
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const vb = (svg) => svg.getAttribute('viewBox').split(' ').map(Number)
      for (let i = 0; i < 60; i++) {
        await frame()
        if (hosts.every((h) => vb(h.querySelector('svg'))[2] === h.clientWidth)) break
      }
      await frame(); await frame()
      return hosts.map((h) => {
        const svg = h.querySelector('svg')
        const pt = svg.createSVGPoint()
        // Подпись категории — текст ВНУТРИ группы своей категории; подписи тиков
        // шкалы лежат прямыми детьми `svg`. Различать их по `text-anchor` нельзя:
        // у повёрнутой подписи якорь тоже `end`, и селектор по якорю молча
        // поменял бы предмет замера на числа оси.
        const labels = [...svg.querySelectorAll(':scope > g > text.ds-bar__axis')].map((t) => {
          const b = t.getBBox(), m = t.getCTM()
          // Четыре угла через CTM, а не `getBBox`: у повёрнутого текста bbox
          // отдаёт коробку ДО поворота, в локальных координатах.
          const at = (x, y) => { pt.x = x; pt.y = y; const p = pt.matrixTransform(m); return [+p.x.toFixed(2), +p.y.toFixed(2)] }
          return {
            shown: [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join(''),
            title: t.querySelector('title')?.textContent ?? null,
            angle: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI),
            box: [at(b.x, b.y), at(b.x + b.width, b.y), at(b.x + b.width, b.y + b.height), at(b.x, b.y + b.height)],
          }
        })
        const [, , W, H] = vb(svg)
        return {
          set: h.dataset.rot, w: +h.dataset.w, sc: +h.dataset.sc, host: h.clientWidth, W, H,
          cats: (h.dataset.rot === 'long' ? WB.BAR_LONG_CATEGORIES : WB.BAR_CATEGORIES).length,
          labels,
        }
      })
    },
    expect: (m) => {
      const bad = []
      let rotated = 0, straight = 0
      const depth = satDepth
      for (const r of m) {
        const at = `${r.set} ${r.w}px×${r.sc}`
        if (r.W !== r.host) { bad.push(`${at}: холст ${r.W} при хосте ${r.host} — ResizeObserver не доехал, замер не о том`); continue }
        if (r.labels.length !== r.cats) { bad.push(`${at}: подписей ${r.labels.length} при ${r.cats} категориях — столбец без имени не опознать`); continue }
        const angles = [...new Set(r.labels.map((l) => l.angle))]
        const turned = angles.some((a) => a !== 0)
        if (angles.length > 1) bad.push(`${at}: ряд повёрнут вперемешку (${angles.join('°, ')}°) — два ряда вместо одного`)
        if (turned) {
          rotated++
          if (angles.some((a) => a !== -45)) bad.push(`${at}: угол ${angles.join('°, ')}°, а не −45`)
          if (r.w === 900 && r.sc === 1) bad.push(`${at}: ряд повёрнут там, где подписи влезают прямыми — поворот платится высотой поля`)
        } else straight++
        bad.push(...catNameFaults(at, r.labels))
        for (const l of r.labels) {
          if (l.shown.endsWith('…')) {
            if (!l.title || !l.title.startsWith(l.shown.slice(0, -1).trimEnd())) bad.push(`${at}: «${l.shown}» обрезана, а <title> «${l.title}» — не её полное имя`)
          } else if (l.title) bad.push(`${at}: «${l.shown}» целая, но несёт <title> «${l.title}»`)
          const xs = l.box.map((p) => p[0]), ys = l.box.map((p) => p[1])
          if (Math.max(...ys) > r.H + 0.5) bad.push(`${at}: «${l.shown}» уходит за нижний край на ${(Math.max(...ys) - r.H).toFixed(1)}px`)
          if (Math.min(...xs) < -0.5) bad.push(`${at}: «${l.shown}» за левым краем на ${(-Math.min(...xs)).toFixed(1)}px`)
          if (Math.max(...xs) > r.W + 0.5) bad.push(`${at}: «${l.shown}» за правым краем на ${(Math.max(...xs) - r.W).toFixed(1)}px`)
        }
        for (let i = 0; i < r.labels.length; i++) {
          for (let j = i + 1; j < r.labels.length; j++) {
            const d = depth(r.labels[i].box, r.labels[j].box)
            if (d > 0.5) bad.push(`${at}: «${r.labels[i].shown}» и «${r.labels[j].shown}» перекрываются на ${d.toFixed(1)}px`)
          }
        }
      }
      // Оба состояния обязаны встретиться: без повёрнутого ряда случай не о
      // повороте вовсе, без прямого — не о том, что на просторе поворота нет.
      if (!bad.length && rotated === 0) bad.push('ни одного повёрнутого ряда — поворот не проверен')
      if (!bad.length && straight === 0) bad.push('ни одного прямого ряда — «на просторе не поворачивать» не проверено')
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'LineChart: крайняя подпись оси X стоит НА своей точке, шаг прореживания ровный, под подписью риска',
    why: 'DS-281, доработка 274. Прижатие крайней подписи к холсту делалось сдвигом ЦЕНТРА внутрь, и центр переставал совпадать с точкой: на 900 первая уезжала со своей точки на +19, последняя на −43.2 — до ЧУЖОЙ точки ей оставалось 28.3, то есть в полтора раза ближе, чем до своей. Привязать подпись глазом было не к чему: точки до наведения не рисуются (`r=0`), засечек у оси не было. Теперь крайние не сдвигаются, а ЯКОРЯТСЯ (последняя концом, первая началом), под каждой подписанной точкой стоит риска 4 px × шкала, а прореживание идёт ровным шагом от ПОСЛЕДНЕЙ точки назад — прежний жадный проход слева с принудительной последней давал шаг 2,2,2,2,3 и промежутки 123.9 / 142.9 × 3 / 171.2. Замер сверяет КРАЙ подписи с координатой точки, а не «стало ближе»: ближе даёт и сдвиг, сломанный в другую сторону',
    bundle: 'scripts/measure-charts.tsx',
    // Те же два набора, что у 274: `line` (шесть месяцев, подписи короткие и
    // помещаются почти все) и `weeks` (двенадцать диапазонов дат, шаг растёт до
    // упора). Узкий кадр и шкала 1.5 разводят их по тесноте.
    html: ['line', 'weeks'].flatMap((kind) => [HOST_440, 440, 900].flatMap((w) => ['1', '1.5'].map((sc) =>
      `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-xanchor="${kind}" data-w="${w}" data-sc="${sc}"></div>`))).join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-xanchor]')]
      const SET = (h) => (h.dataset.xanchor === 'weeks' ? WB.LINE_WEEKS_SERIES : WB.LINE_SHORT_SERIES)
      for (const h of hosts) WB.mountLine(h, { series: SET(h), height: 220 })
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const width = (svg) => +svg.getAttribute('viewBox').split(' ')[2]
      for (let i = 0; i < 60; i++) {
        await frame()
        if (hosts.every((h) => width(h.querySelector('svg')) === h.clientWidth)) break
      }
      await frame(); await frame()
      return hosts.map((h) => {
        const svg = h.querySelector('svg')
        // Подписи — ИЗ ФИКСТУРЫ: по тексту подписи узнаётся её индекс, а по
        // индексу — координата точки. Считать координату формулой значило бы
        // сверять свою копию расчёта с чужой.
        const xs = SET(h).reduce((b, s) => (s.points.length > b.length ? s.points : b), []).map((p) => String(p.x))
        // Координаты точек — `cx` кружков: они стоят у каждой точки всегда,
        // радиус нулевой до наведения.
        const pointX = [...new Set([...svg.querySelectorAll('.ds-chart__dot')].map((c) => +c.getAttribute('cx')))]
          .sort((a, b) => a - b)
        const labels = [...svg.querySelectorAll('text.ds-chart__xlabel')].map((t) => {
          const b = t.getBBox(), m = t.getCTM()
          return {
            text: t.textContent,
            i: xs.indexOf(t.textContent),
            anchor: t.getAttribute('text-anchor'),
            // `getBBox` — коробка ДО собственного поворота: у повёрнутой подписи
            // её правый край и есть опорная точка, поэтому «конец на точке»
            // сверяется той же парой l/r (DS-296).
            angle: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI),
            l: +b.x.toFixed(2), r: +(b.x + b.width).toFixed(2),
          }
        })
        const ticks = [...svg.querySelectorAll('.ds-chart__xtick')].map((t) => ({
          x: +(+t.getAttribute('x1')).toFixed(2),
          h: +(+t.getAttribute('y2') - +t.getAttribute('y1')).toFixed(2),
          slant: +(+t.getAttribute('x2') - +t.getAttribute('x1')).toFixed(2),
        }))
        return {
          kind: h.dataset.xanchor, w: +h.dataset.w, sc: +h.dataset.sc,
          host: h.clientWidth, W: width(svg), n: xs.length, pointX, labels, ticks,
        }
      })
    },
    expect: (m) => {
      const bad = []
      const tol = 0.5
      let firstStart = 0, innerMiddle = 0, evenSteps = 0
      for (const r of m) {
        const at = `${r.kind} ${r.w}px×${r.sc}`
        if (r.W !== r.host) { bad.push(`${at}: холст ${r.W} при хосте ${r.host} — ResizeObserver не доехал, замер не о том`); continue }
        if (r.pointX.length !== r.n) { bad.push(`${at}: точек в разметке ${r.pointX.length} при ${r.n} в данных — индекс подписи не с чем сопоставить`); continue }
        if (!r.labels.length) { bad.push(`${at}: ни одной подписи оси X`); continue }
        const stray = r.labels.find((l) => l.i < 0)
        if (stray) { bad.push(`${at}: подпись «${stray.text}» не из данных — индекс не сопоставить`); continue }
        const ls = [...r.labels].sort((a, b) => a.i - b.i)
        const last = ls[ls.length - 1]
        const first = ls[0]
        // Повёрнутый ряд (DS-296): у КАЖДОЙ подписи якорь `end`, и конец
        // стоит на своей точке. Серединные и `start`-якоря, а с ними попарное
        // сравнение по l/r, к диагоналям неприменимы — их пересечения мерит
        // случай 274 по SAT. Шаг и риски — общие, ниже.
        const turned = ls.some((c) => c.angle !== 0)
        if (turned) {
          if (last.i !== r.n - 1) bad.push(`${at}: последняя подписана точка ${last.i}, а не ${r.n - 1} — «сейчас» без подписи`)
          for (const c of ls) {
            if (c.anchor !== 'end') { bad.push(`${at}: повёрнутая подпись «${c.text}» якорем ${c.anchor}, а не end`); continue }
            const d = Math.abs(c.r - r.pointX[c.i])
            if (d > tol) bad.push(`${at}: конец повёрнутой подписи «${c.text}» в ${c.r} при точке ${r.pointX[c.i]} — сдвиг ${d.toFixed(1)}px`)
          }
        } else {
          // 1. Последняя подписанная — последняя точка ряда («сейчас»), и её КОНЕЦ
          //    стоит на точке. Сдвиг центра внутрь сюда и не проходит.
          if (last.i !== r.n - 1) bad.push(`${at}: последняя подписана точка ${last.i}, а не ${r.n - 1} — «сейчас» без подписи`)
          else if (last.anchor !== 'end') bad.push(`${at}: последняя подпись «${last.text}» якорем ${last.anchor}, а не end`)
          else {
            const d = Math.abs(last.r - r.pointX[last.i])
            if (d > tol) bad.push(`${at}: конец последней подписи «${last.text}» в ${last.r} при точке ${r.pointX[last.i]} — сдвиг ${d.toFixed(1)}px`)
          }

          // 2. Первая подписанная: точка 0 — НАЧАЛОМ на точке. Внутренняя —
          //    серединой, и `start` ей позволен только когда серединой она вышла
          //    бы за левый край; иначе якорем можно было бы двигать что угодно.
          if (first !== last) {
            const px = r.pointX[first.i]
            const halfOut = px - (first.r - first.l) / 2
            if (first.i === 0 && first.anchor !== 'start') {
              bad.push(`${at}: первая точка подписана якорем ${first.anchor}, а не start`)
            } else if (first.anchor === 'start') {
              if (first.i === 0) firstStart++
              else if (halfOut > 2 * r.sc + tol) bad.push(`${at}: первая подпись «${first.text}» якорем start, хотя серединой (край ${halfOut.toFixed(1)}) в холст влезала`)
              const d = Math.abs(first.l - px)
              if (d > tol) bad.push(`${at}: начало первой подписи «${first.text}» в ${first.l} при точке ${px} — сдвиг ${d.toFixed(1)}px`)
            } else if (first.anchor !== 'middle') {
              bad.push(`${at}: первая подпись «${first.text}» якорем ${first.anchor}`)
            } else {
              const d = Math.abs((first.l + first.r) / 2 - px)
              if (d > tol) bad.push(`${at}: центр первой подписи «${first.text}» в ${((first.l + first.r) / 2).toFixed(1)} при точке ${px} — сдвиг ${d.toFixed(1)}px`)
            }
          }

          // 3. Внутренние — серединой НА своей точке.
          for (let j = 1; j < ls.length - 1; j++) {
            const c = ls[j]
            if (c.anchor !== 'middle') { bad.push(`${at}: внутренняя подпись «${c.text}» якорем ${c.anchor}`); continue }
            innerMiddle++
            const d = Math.abs((c.l + c.r) / 2 - r.pointX[c.i])
            if (d > tol) bad.push(`${at}: центр внутренней подписи «${c.text}» в ${((c.l + c.r) / 2).toFixed(1)} при точке ${r.pointX[c.i]} — сдвиг ${d.toFixed(1)}px`)
          }
        }

        // 4. Ровный шаг: разности индексов подписанных равны между собой.
        //    Принудительная первая подпись ломается ровно здесь.
        const gaps = ls.slice(1).map((c, j) => c.i - ls[j].i)
        if (gaps.length > 1) {
          if (new Set(gaps).size > 1) bad.push(`${at}: шаг рваный — подписаны точки ${ls.map((c) => c.i).join(',')}, промежутки ${gaps.join(',')}`)
          else evenSteps++
        }

        // 5. Ни одна подпись не выходит за холст и не наезжает на соседку.
        for (let j = 0; j < ls.length && !turned; j++) {
          if (ls[j].l < -tol) bad.push(`${at}: «${ls[j].text}» за левым краем на ${(-ls[j].l).toFixed(1)}px`)
          if (ls[j].r > r.W + tol) bad.push(`${at}: «${ls[j].text}» за правым краем на ${(ls[j].r - r.W).toFixed(1)}px`)
          if (j && ls[j].l < ls[j - 1].r) bad.push(`${at}: «${ls[j - 1].text}» и «${ls[j].text}» перекрываются на ${(ls[j - 1].r - ls[j].l).toFixed(1)}px`)
        }

        // 6. Риска под КАЖДОЙ подписанной точкой и только под ней: без неё
        //    якорение остаётся невидимым в статике, то есть сделанным зря.
        if (r.ticks.length !== ls.length) bad.push(`${at}: рисок ${r.ticks.length} при ${ls.length} подписях`)
        for (const c of ls) {
          const tick = r.ticks.find((t) => Math.abs(t.x - r.pointX[c.i]) <= tol)
          if (!tick) { bad.push(`${at}: под подписью «${c.text}» (точка ${r.pointX[c.i]}) нет риски`); continue }
          if (Math.abs(tick.h - 4 * r.sc) > tol) bad.push(`${at}: риска под «${c.text}» высотой ${tick.h} при 4 × ${r.sc}`)
          if (Math.abs(tick.slant) > tol) bad.push(`${at}: риска под «${c.text}» наклонена на ${tick.slant}px — это не засечка`)
        }
      }
      // Санитары: без них случай зелен и на коде, который не якорит вовсе.
      if (!bad.length && !firstStart) bad.push('нигде не подписана первая точка ряда — якорь start не проверен')
      if (!bad.length && !innerMiddle) bad.push('ни одной внутренней подписи — середина не проверена')
      if (!bad.length && !evenSteps) bad.push('нигде нет трёх подписей — ровный шаг не с чем сравнить')
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'LineChart и вертикальный BarChart: число оси Y не срезается с начала',
    why: 'DS-275. Поле подписей оси Y было константой (40 px у LineChart, 44 у вертикального BarChart), а подпись прижата к нему концом (`textAnchor="end"`): семизначное число уезжало за левый край SVG и срезалось С НАЧАЛА — «1400000» читалось как «00000», то есть как другое число. У числа нет многоточия и нет потолка поля: обрезанное число врёт. Теперь поле = самая широкая подпись тика + зазоры, прежняя константа — пол, и короткие шкалы обязаны остаться на полу, иначе правка сдвинула бы раскладку потребителя без причины. Пол `bar` — 44 → 53 (DS-375): `CAT_GUTTER_MIN` в `BarChart.tsx` пересчитан под `--ds-fs-sm` (12px) вместо удалённого `--ds-fs-2xs` (10px) — тот же +20%, что подвинул пол горизонтальных подписей категорий, и та же причина, по которой повёрнутым подписям категорий вертикали (её `keepChars`) стало не хватать диагонального запаса `padL`: `CAT_GUTTER_MIN` — общий пол обеих осей, и его нельзя поднять для одной оси, не подняв для другой. `line` не тронут — `LineChart` не участвовал в этом случае. Живой React: шрифт и ширина холста приходят после монтирования',
    bundle: 'scripts/measure-charts.tsx',
    html: ['line', 'bar'].flatMap((kind) => ['big', 'short'].flatMap((set) => [HOST_440, 440, 1189].flatMap((w) => ['1', '1.5'].map((sc) =>
      `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-chart="${kind}" data-set="${set}" data-w="${w}" data-sc="${sc}"></div>`)))).join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-chart]')]
      for (const h of hosts) {
        const big = h.dataset.set === 'big'
        if (h.dataset.chart === 'line') {
          WB.mountLine(h, { series: big ? WB.LINE_BIG_SERIES : WB.LINE_SHORT_SERIES, height: 220 })
        } else {
          WB.mountBar(h, { categories: WB.BAR_CATEGORIES, series: big ? WB.BAR_BIG_SERIES : WB.BAR_SERIES, height: 240 })
        }
      }
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const width = (svg) => +svg.getAttribute('viewBox').split(' ')[2]
      for (let i = 0; i < 60; i++) {
        await frame()
        if (hosts.every((h) => width(h.querySelector('svg')) === h.clientWidth)) break
      }
      await frame(); await frame()
      return hosts.map((h) => {
        const svg = h.querySelector('svg')
        const line = h.dataset.chart === 'line'
        // Подписи тиков — ПРЯМЫЕ дети `svg`; подписи категорий лежат внутри
        // группы своей категории. Якорь их больше не различает: с DS-280
        // повёрнутая подпись категории тоже прижата концом, и селектор по
        // `text-anchor="end"` молча подменил бы предмет замера (DS-280).
        const labels = [...svg.querySelectorAll(line ? 'text.ds-chart__ylabel' : ':scope > text.ds-bar__axis')]
          .map((t) => ({ text: t.textContent, x: +t.getBBox().x.toFixed(2) }))
        const grid = svg.querySelector(line ? '.ds-chart__grid' : '.ds-bar__grid')
        return {
          chart: h.dataset.chart, set: h.dataset.set, w: +h.dataset.w, sc: +h.dataset.sc,
          host: h.clientWidth, W: width(svg), labels, gridX: +(+grid.getAttribute('x1')).toFixed(2),
        }
      })
    },
    expect: (m) => {
      const bad = []
      for (const r of m) {
        const at = `${r.chart}/${r.set} ${r.w}px×${r.sc}`
        if (r.W !== r.host) { bad.push(`${at}: холст ${r.W} при хосте ${r.host} — ResizeObserver не доехал, замер не о том`); continue }
        if (r.labels.length < 2) { bad.push(`${at}: подписей оси ${r.labels.length} — мерить нечего`); continue }
        const floor = (r.chart === 'line' ? 40 : 53) * r.sc
        for (const l of r.labels) {
          if (l.x < 0) bad.push(`${at}: «${l.text}» срезана с начала на ${(-l.x).toFixed(1)}px`)
        }
        // Оба состояния поля: короткая шкала на полу, длинная — выше пола.
        if (r.set === 'short' && Math.abs(r.gridX - floor) > 0.5) bad.push(`${at}: короткая шкала сдвинула поле ${r.gridX} с пола ${floor}`)
        if (r.set === 'big' && !(r.gridX > floor + 1)) bad.push(`${at}: поле ${r.gridX} не выросло над полом ${floor} — случай не о семизначных числах`)
        if (r.set === 'big' && !r.labels.some((l) => l.text.replace(/\D/g, '').length >= 7)) bad.push(`${at}: ни одной семизначной подписи (${r.labels.map((l) => l.text).join(' / ')})`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'LineChart: подсказка наведения лежит в поле данных и не накрывает ни подсвеченную точку, ни подписи осей',
    why: 'DS-279. Плашка ставилась от направляющей БЕЗ ограничения: на последней точке кадра 900 её правый край приходился на 931.4 при холсте 900 — вылет 31.4px и горизонтальное переполнение документа (`scrollWidth` 931), на 360 значение резалось посреди слова. Граница — ХОЛСТ, а не окно: график живёт в карточке, и прижимать плашку к краю экрана значило бы уводить её от своего графика. У правых точек плашка переворачивается на левую сторону от направляющей, вертикально — над точкой, а если не влезает, под ней. Отступ от направляющей больше радиуса подсвеченной точки (3.5 × шкала): до правки плашка накрывала точку верхнего ряда, то есть прятала ровно то, о чём рассказывает. Живой React и настоящий mousemove по координатам точки: положение считается из замера плашки после монтирования, SSR-разметка мерила бы нулевую высоту. DS-286 сузила область с `svg` до ПОЛЯ ДАННЫХ: потолок ширины считался от левого края svg, и на 360 × 1.5 плашка ложилась на подпись оси Y «1 400» — в кадре читалось «1 40», то есть другое число; снизу граница была низом холста, и плашка накрывала «Август» и «Октябрь» (до 58.3 × 17 px на `big` 360). Подписи оси — часть графика, накрывать их нельзя так же, как подсвеченную точку. Набор `eight` добавлен сюда же: он единственный даёт плашку ВЫШЕ поля данных, и на нём видно, что 286 — про потолок, а не про размер (размер — эпик 253). DS-297 вернула сюда ширину 300 и починила то, из-за чего она краснела: ПОЛ ширины стоял в CSS (`min-width: min(6rem × scale, 100%)`), а потолок — в разметке по измеренному месту, и `100%` мерит не ту коробку (содержащий блок, то есть весь холст, а не место от подписей оси Y до края); в CSS `min-width` сильнее `max-width`, так что пол 144 молча перебивал место 140 — вылет за холст 3.6 px, а на перевёрнутой плашке 27.5 px поверх «1 200». Вторая половина — `white-space: nowrap` на ячейке значения: неделимым становилось «1 000 000 тыс ₽» целиком, на треть длиннее числа. Снят, потому что число неразрывно и без него (`Intl` ставит неразрывный пробел между разрядами), а пробел перед единицей обычный: единица уходит строкой ниже при своём числе, врёт только обрезанное ЧИСЛО',
    bundle: 'scripts/measure-charts.tsx',
    // Три набора неспроста: `base` — шесть точек и две серии (плашка в два
    // ряда), `weeks` — двенадцать точек и подпись-диапазон, самая широкая
    // плашка системы, `big` — семизначные значения. Узкий кадр и шкала 1.5
    // разводят те же случаи по тесноте.
    // Обе темы — потому что предмет 286 называет подписи оси, а их цвет и
    // подложка плашки тему различают; геометрия от неё не зависит, и это
    // утверждение тоже надо было проверить, а не предположить.
    html: ['light', 'dark'].map((th) =>
      `<div class="ds-root"${th === 'dark' ? ' data-theme="dark"' : ''}>`
      // Точка владельца (`HOST_440`) вернулась на DS-297. Она краснела не
      // оснасткой: пол ширины плашки стоял в CSS с процентом от ХОЛСТА, а
      // потолок — в разметке по измеренному месту, и на 300×1.5 пол 144
      // перебивал место 140. Полосу ширины теперь ставит одно место, и эта
      // точка — единственная, где пол и место вообще расходятся.
      + ['base', 'weeks', 'big', 'eight'].flatMap((set) => [HOST_440, 440, 900].flatMap((w) => ['1', '1.5'].map((sc) =>
        `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-tip="${set}" data-w="${w}" data-sc="${sc}" data-th="${th}"></div>`))).join('')
      + '</div>').join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-tip]')]
      const SET = { base: () => WB.LINE_SHORT_SERIES, weeks: () => WB.LINE_WEEKS_SERIES, big: () => WB.LINE_BIG_SERIES, eight: () => WB.LINE_EIGHT_SERIES }
      for (const h of hosts) WB.mountLine(h, { series: SET[h.dataset.tip](), height: 220, yUnit: 'тыс ₽' })
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const width = (svg) => +svg.getAttribute('viewBox').split(' ')[2]
      for (let i = 0; i < 60; i++) {
        await frame()
        if (hosts.every((h) => width(h.querySelector('svg')) === h.clientWidth)) break
      }
      await frame(); await frame()
      const rect = (el) => { const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(2), r: +b.right.toFixed(2), t: +b.top.toFixed(2), b: +b.bottom.toFixed(2) } }
      const out = []
      for (const h of hosts) {
        const svg = h.querySelector('svg')
        const W = width(svg)
        // Подписи осей — часть графика, и накрывать их нельзя так же, как
        // подсвеченную точку (DS-286). Снимаются ДО наведения: от него
        // они не двигаются, а внутри цикла по точкам стоили бы лишний обход.
        const axis = [...svg.querySelectorAll('text.ds-chart__ylabel, text.ds-chart__xlabel')]
          .map((t) => ({ ax: t.classList.contains('ds-chart__ylabel') ? 'Y' : 'X', text: t.textContent, ...rect(t) }))
        // Поле данных по вертикали — от верхней линии сетки до нижней: они и
        // стоят ровно на границах поля. Берётся из разметки, а не из полей
        // компонента: замер не должен повторять его арифметику.
        const grids = [...svg.querySelectorAll('.ds-chart__grid')].map(rect)
        const plot = { t: Math.min(...grids.map((g) => g.t)), b: Math.max(...grids.map((g) => g.b)) }
        // Места наведения — по САМИМ точкам: `cx` кружка это и есть координата
        // ряда, а вычислять её заново в замере значило бы проверять свою
        // формулу против чужой.
        const xs = [...new Set([...svg.querySelectorAll('.ds-chart__dot')].map((c) => +c.getAttribute('cx')))]
          .sort((a, b) => a - b)
        const points = []
        for (const cx of xs) {
          const box = svg.getBoundingClientRect()
          svg.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: box.left + (cx / W) * box.width,
            clientY: box.top + box.height / 2,
          }))
          // Состояние React доезжает до DOM не синхронно с событием.
          await frame(); await frame()
          const tip = h.querySelector('.ds-chart__tip')
          const dots = [...svg.querySelectorAll('.ds-chart__dot')].filter((c) => +c.getAttribute('r') > 0)
          let tipBox = null
          if (tip) {
            tipBox = rect(tip)
            // Видимые границы, а не коробка: строка с `white-space: nowrap`
            // уже своего содержимого не становится, и плашка, зажатая
            // `max-width`, может влезать САМА, выпуская текст наружу. Коробка
            // при этом зелёная, а значение на экране срезано краем холста —
            // ровно тот дефект, о котором случай.
            for (const el of tip.querySelectorAll('*')) {
              const b = el.getBoundingClientRect()
              if (b.width === 0 && b.height === 0) continue
              tipBox.l = Math.min(tipBox.l, +b.left.toFixed(2)); tipBox.r = Math.max(tipBox.r, +b.right.toFixed(2))
              tipBox.t = Math.min(tipBox.t, +b.top.toFixed(2)); tipBox.b = Math.max(tipBox.b, +b.bottom.toFixed(2))
            }
          }
          points.push({
            cx,
            svg: rect(svg),
            tip: tipBox,
            label: tip?.querySelector('.ds-chart__tip-x')?.textContent ?? null,
            dots: dots.map((c) => ({ cx: +c.getAttribute('cx'), ...rect(c) })),
          })
        }
        out.push({ set: h.dataset.tip, th: h.dataset.th, w: +h.dataset.w, sc: +h.dataset.sc, host: h.clientWidth, W, axis, plot, points })
      }
      return out
    },
    expect: (m) => {
      const bad = []
      let left = 0, right = 0
      /** Сколько пар «плашка — подпись оси» вообще сравнено: освобождение выше
       *  не должно тихо съесть проверку целиком. */
      const pairs = { X: 0, Y: 0 }
      for (const r of m) {
        const at = `${r.set} ${r.w}px×${r.sc} ${r.th}`
        if (r.W !== r.host) { bad.push(`${at}: холст ${r.W} при хосте ${r.host} — ResizeObserver не доехал, замер не о том`); continue }
        if (r.points.length < 3) { bad.push(`${at}: точек ${r.points.length} — наводить не на что`); continue }
        if (!r.axis.some((a) => a.ax === 'Y') || !r.axis.some((a) => a.ax === 'X')) { bad.push(`${at}: подписей осей нет — накрывать нечего`); continue }
        for (const p of r.points) {
          const where = `${at} точка x=${p.cx}`
          // Санитар на доставку ввода: без него «дефектов нет» значило бы
          // «наведения не было», и случай был бы зелен на любом коде.
          if (!p.tip) { bad.push(`${where}: подсказки нет — наведение не доехало`); continue }
          if (!p.dots.length) { bad.push(`${where}: ни одной подсвеченной точки — наведение не доехало`); continue }
          const wrong = p.dots.filter((d) => Math.abs(d.cx - p.cx) > 0.5)
          if (wrong.length) { bad.push(`${where}: подсвечена точка x=${wrong[0].cx} — наведение село не на ту`); continue }
          if (p.tip.r > p.svg.r + 0.5) bad.push(`${where}: плашка за правым краем холста на ${(p.tip.r - p.svg.r).toFixed(1)}px`)
          if (p.tip.l < p.svg.l - 0.5) bad.push(`${where}: плашка за левым краем холста на ${(p.svg.l - p.tip.l).toFixed(1)}px`)
          // Плашка ВЫШЕ ПОЛЯ ДАННЫХ в него не помещается никаким размещением,
          // и подписи оси X она накроет, где её ни поставь: восемь рядов на
          // 360 × 1.5 дают 476 px при поле 273 (а на соседней точке, где
          // плашке шире и строки не переносятся, — 280 при том же поле). Это
          // решение системы о РАЗМЕРЕ плашки (эпик JIG-23), названное в
          // 286 прямо и оставленное ему: красное отсюда читалось бы как дефект
          // РАЗМЕЩЕНИЯ. Оба условия ИЗМЕРЕНЫ, а не приписаны набору — станет
          // плашка ниже, проверки вернутся сами.
          const tipH = p.tip.b - p.tip.t
          const overPlot = tipH > r.plot.b - r.plot.t
          const overCanvas = tipH > p.svg.b - p.svg.t
          if (!overCanvas) {
            if (p.tip.t < p.svg.t - 0.5) bad.push(`${where}: плашка выше верха холста на ${(p.svg.t - p.tip.t).toFixed(1)}px`)
            if (p.tip.b > p.svg.b + 0.5) bad.push(`${where}: плашка ниже низа холста на ${(p.tip.b - p.svg.b).toFixed(1)}px`)
          }
          for (const d of p.dots) {
            const ox = Math.min(p.tip.r, d.r) - Math.max(p.tip.l, d.l)
            const oy = Math.min(p.tip.b, d.b) - Math.max(p.tip.t, d.t)
            if (ox > 0 && oy > 0) bad.push(`${where}: плашка накрывает подсвеченную точку на ${ox.toFixed(1)}×${oy.toFixed(1)}px`)
          }
          // Подписи оси — такая же часть графика, как подсвеченная точка
          // (DS-286). Плашка живёт в области ДАННЫХ, а не во всём svg:
          // потолок её ширины, отсчитанный от левого края svg, давал на
          // 360 × 1.5 девять пикселей поверх «1 400» — в кадре читалось «1 40»,
          // то есть другое число.
          for (const a of r.axis) {
            // Подписи оси X у плашки выше холста — та же цена размера: ей
            // некуда деться по вертикали. Подписи оси Y проверяются и на ней:
            // потолок ширины — предмет 286, и от высоты плашки он не зависит.
            if (a.ax === 'X' && overPlot) continue
            pairs[a.ax]++
            const ox = Math.min(p.tip.r, a.r) - Math.max(p.tip.l, a.l)
            const oy = Math.min(p.tip.b, a.b) - Math.max(p.tip.t, a.t)
            if (ox > 0.5 && oy > 0.5) bad.push(`${where}: плашка накрывает подпись оси ${a.ax} «${a.text}» на ${ox.toFixed(1)}×${oy.toFixed(1)}px`)
          }
          // Сторона от направляющей — по итоговому положению, а не по замыслу.
          const guide = p.svg.l + (p.cx / r.W) * (p.svg.r - p.svg.l)
          if (p.tip.r <= guide) left++
          else if (p.tip.l >= guide) right++
          else bad.push(`${where}: плашка лежит НА направляющей (${p.tip.l}…${p.tip.r} при x=${guide.toFixed(1)}) — стороны нет`)
        }
      }
      // Оба положения обязаны встретиться, иначе переворот не проверен: случай
      // без единой левой плашки зелен и на коде, который не умеет переворачивать.
      if (!bad.length && !left) bad.push('ни одной плашки слева от направляющей — переворот не проверен')
      if (!bad.length && !right) bad.push('ни одной плашки справа от направляющей — обычная сторона не проверена')
      if (!bad.length && !pairs.Y) bad.push('ни одна подпись оси Y не сверена с плашкой — потолок ширины не проверен')
      if (!bad.length && !pairs.X) bad.push('ни одна подпись оси X не сверена с плашкой — вся вертикаль ушла в освобождение')
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Card: тон не лезет в содержимое и не двигает геометрию',
    why: 'карточка это контейнер содержимого, а не плашка статуса; border-top вместо тени делал её на 2px выше и разъезжал сетку дашборда',
    html: `<div class="ds-card" id="plain" style="width:230px">
        <div class="ds-card__header">Задача TK-418</div>
        <div class="ds-card__body" id="plain-body">Ждём ответа заказчика.</div></div>
      <div class="ds-card ds-card--tone-error" id="toned" style="width:230px">
        <div class="ds-card__header">Задача TK-418</div>
        <div class="ds-card__body" id="toned-body">Ждём ответа заказчика.</div></div>
      <div class="ds-card ds-card--tone-error" id="nohead" style="width:230px">
        <div class="ds-card__body">Только тело.</div></div>`,
    measure: () => {
      const bg = (id) => getComputedStyle(document.querySelector(`#${id}`)).backgroundColor
      const h = (id) => +document.querySelector(`#${id}`).getBoundingClientRect().height.toFixed(2)
      return {
        cardBg: { plain: bg('plain'), toned: bg('toned') },
        bodyBg: { plain: bg('plain-body'), toned: bg('toned-body') },
        height: { plain: h('plain'), toned: h('toned') },
        // Полоса живёт на самой карточке, поэтому обязана быть и без шапки —
        // это то, что отвергло вариант «тонировать шапку».
        noHeadShadow: getComputedStyle(document.querySelector('#nohead')).boxShadow,
      }
    },
    expect: (m) => {
      const problems = []
      // Никакой заливки — это и есть машинное отличие от Alert.
      if (m.cardBg.toned !== m.cardBg.plain) problems.push(`заливка карточки ${m.cardBg.toned} вместо ${m.cardBg.plain}`)
      if (m.bodyBg.toned !== m.bodyBg.plain) problems.push(`фон тела ${m.bodyBg.toned} вместо ${m.bodyBg.plain}`)
      if (Math.abs(m.height.toned - m.height.plain) > 0.5) problems.push(`высота ${m.height.toned} против ${m.height.plain}`)
      if (!m.noHeadShadow || m.noHeadShadow === 'none') problems.push('без шапки полосы нет')
      return problems.length === 0 || problems.join('; ')
    },
  },
  {
    name: 'Card: полосу тона видно в обеих темах',
    why: 'тон, который есть в разметке и не виден на экране, — тот же класс, что невидимый рельс Timeline',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''}
      style="background: var(--ds-surface); padding: 8px">
      <div class="ds-card ds-card--tone-error" id="c-${t}" style="width:200px">
        <div class="ds-card__body">тело</div></div></div>`).join(''),
    measure: () => {
      const lum = (css) => {
        const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const read = (t) => {
        const el = document.querySelector(`#c-${t}`)
        const cs = getComputedStyle(el)
        const bar = cs.boxShadow.match(/rgba?\([^)]+\)/)?.[0] ?? ''
        return { bar, ratio: +ratio(lum(bar), lum(cs.backgroundColor)).toFixed(3) }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => (m.light.ratio >= 1.6 && m.dark.ratio >= 1.6)
      || `светлая ${m.light.bar} = ${m.light.ratio}, тёмная ${m.dark.bar} = ${m.dark.ratio}`,
  },
  {
    name: 'Card: содержимое выходит за кромку, а заливка шапки — нет',
    why: 'клип ради углов шапки резал тултипы графиков по всей карточке — потребитель снимал overflow у себя на шести карточках дашборда',
    // Текст тултипа — `color: transparent`, а не убран вовсе: разметка держит
    // форму настоящего тултипа (подпись есть), но не мешает замеру.
    // `pixels()` сэмплирует РОВНО ОДИН пиксель в центре коробки — а туда с
    // самого начала могла попасть буква своим сглаженным краем, не чистая
    // заливка: сетка 7×7 вокруг центра скачет 38…51 (не 51 ровно), и «7
    // коммитов» тёмным по тёмному могло дать и rgb(51,51,51), и штрих глифа
    // рядом (rgb(50,50,50)) — какой из двух увидит один пиксель, решала
    // случайность раскладки текста, а зелёный до DS-375 был везением,
    // не гарантией. Предмет случая («клипа нет») текста не касается вовсе —
    // подъём кегля `--ds-fs-base` 13→14 хрупкость не завёл, а лишь подвинул
    // рендер тех же глифов на другие субпиксели и наконец вскрыл её.
    html: `<div style="padding: 60px">
      <div class="ds-card" id="card" style="width: 220px">
        <div class="ds-card__header ds-card__header--widget" id="head">
          <div class="ds-card__titles"><div class="ds-card__title">Коммиты</div></div></div>
        <div class="ds-card__body">
          <div style="position: relative; height: 40px">
            <div id="tip" style="position: absolute; left: 0; top: -100px; width: 90px; height: 22px;
              background: rgb(51, 51, 51); color: transparent">7 коммитов</div>
          </div>
        </div>
      </div></div>`,
    measure: () => {
      const card = document.querySelector('#card').getBoundingClientRect()
      const tip = document.querySelector('#tip').getBoundingClientRect()
      return {
        // Тултип обязан быть выведен ВЫШЕ кромки — иначе замер ниже проверяет
        // обычное содержимое карточки и не может покраснеть никогда.
        tipAboveCard: +(card.top - tip.bottom).toFixed(2),
        fill: getComputedStyle(document.querySelector('#head')).backgroundColor,
        surface: getComputedStyle(document.querySelector('#card')).backgroundColor,
        borderColor: getComputedStyle(document.querySelector('#card')).borderTopColor,
      }
    },
    // Точки во вьюпорте: над кромкой, в углу шапки и в её середине.
    pixels: () => {
      const head = document.querySelector('#head').getBoundingClientRect()
      const tip = document.querySelector('#tip').getBoundingClientRect()
      return {
        above: [tip.left + tip.width / 2, tip.top + tip.height / 2],
        // Самый угловой пиксель шапки. Скруглённая заливка его почти не
        // накрывает (арка проходит внутри), прямоугольная — накрывает целиком.
        corner: [head.left, head.top],
        head: [head.left + head.width / 2, head.top + head.height / 2],
      }
    },
    expect: (m) => {
      const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number)
      const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]))
      const problems = []
      if (m.tipAboveCard <= 0) problems.push(`тултип не выведен за кромку (зазор ${m.tipAboveCard})`)
      if (m.at.above !== 'rgb(51, 51, 51)') problems.push(`над кромкой ${m.at.above} вместо тултипа`)
      // Сосед с заведомо известным значением: в середине шапки её заливка есть
      // при любом исходе. Если и там не она — врёт инструмент, а не карточка.
      if (m.at.head !== m.fill) problems.push(`в шапке ${m.at.head} вместо заливки ${m.fill}`)
      // Не равенство, а «к чему ближе»: угловой пиксель сглажен аркой, и чистого
      // цвета там нет ни при какой починке. Свои у этой точки два — поверхность
      // карточки и её рамка (арка рамки проходит ровно здесь); чужой один.
      const own = Math.min(dist(m.at.corner, m.surface), dist(m.at.corner, m.borderColor))
      if (dist(m.at.corner, m.fill) <= own) {
        problems.push(`в углу ${m.at.corner} — это заливка шапки ${m.fill}, а не карточка`
          + ` (${m.surface}/${m.borderColor})`)
      }
      return problems.length === 0 || problems.join('; ')
    },
  },
  {
    name: 'Heatmap: в тесном контейнере прокручивается, а не теряет первые недели',
    why: 'inline-flex во flex-родителе сжимаем: годовой диапазон обрезался с начала — исчезали самые старые недели, ровно те, ради которых календарь открывают',
    // Тесный флекс-родитель — то, во что календарь поставлен у потребителя.
    html: `<div style="display: flex; width: 320px">
      <div class="ds-heat" id="heat">
        <div class="ds-heat__scroll" id="scroll">
          <div class="ds-heat__months" style="--ds-heat-cols: 53">
            <span class="ds-heat__month" style="grid-column: 1">янв</span></div>
          <div class="ds-heat__body">
            <div class="ds-heat__weekdays">${Array.from({ length: 7 }, () => '<span class="ds-heat__weekday">пн</span>').join('')}</div>
            <div class="ds-heat__grid" id="grid">
              ${Array.from({ length: 371 }, (_, i) => `<span class="ds-heat__day ds-heat__swatch ds-heat__swatch--1"
                ${i === 0 ? 'id="first"' : ''}></span>`).join('')}
            </div>
          </div>
        </div>
        <div class="ds-heat__legend"><span class="ds-heat__legend-text">меньше</span>
          <span class="ds-heat__swatch ds-heat__swatch--0"></span>
          <span class="ds-heat__legend-text">больше</span></div>
      </div></div>`,
    measure: () => {
      const scroll = document.querySelector('#scroll')
      const first = document.querySelector('#first').getBoundingClientRect()
      const view = scroll.getBoundingClientRect()
      // Прокрутку от простого переполнения отличает только то, что scrollLeft
      // двигается: геометрия при overflow:visible ровно та же самая.
      scroll.scrollLeft = 9999
      const moved = scroll.scrollLeft
      // В конце прокрутки за последней ячейкой обязан остаться запас под кольцо
      // фокуса: у блочного содержимого скролл-контейнер правый padding теряет.
      const tailGap = +(scroll.getBoundingClientRect().right
        - document.querySelector('#grid').lastElementChild.getBoundingClientRect().right).toFixed(2)
      scroll.scrollLeft = 0
      return {
        tailGap,
        content: scroll.scrollWidth,
        viewport: scroll.clientWidth,
        moved,
        // Первая неделя на месте, а не срезана слева.
        firstOffset: +(first.left - view.left).toFixed(2),
        // Страница по горизонтали ехать не должна: широкое содержимое обязано
        // прокручиваться внутри своего контейнера, а не распирать документ.
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
      }
    },
    expect: (m) => {
      const problems = []
      if (m.content <= m.viewport + 1) problems.push(`содержимое ${m.content} влезло в ${m.viewport} — календарь сжат, а не прокручивается`)
      if (m.moved <= 0) problems.push('scrollLeft не двинулся — переполнение без прокрутки')
      if (m.firstOffset < -0.5) problems.push(`первая неделя срезана на ${-m.firstOffset}px`)
      if (m.doc > m.win + 1) problems.push(`документ разъехался по горизонтали: ${m.doc} при окне ${m.win}`)
      if (m.tailGap < 1.5) problems.push(`в конце прокрутки за последней ячейкой ${m.tailGap}px — кольцу фокуса негде`)
      return problems.length === 0 || problems.join('; ')
    },
  },
  {
    name: 'Heatmap: сетка ровно из семи строк при любом диапазоне',
    why: 'восьмая строка означает, что колонка перестала быть неделей, и весь календарь читается неверно',
    html: [3, 40, 364].map((n, k) => `<div class="ds-heat">
      <div class="ds-heat__body"><div class="ds-heat__grid" id="g${k}">
        ${Array.from({ length: n }, () => '<span class="ds-heat__day ds-heat__swatch ds-heat__swatch--1"></span>').join('')}
      </div></div></div>`).join(''),
    measure: () => {
      const rows = (sel) => {
        const cells = [...document.querySelectorAll(`${sel} .ds-heat__day`)]
        return new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top))).size
      }
      return { small: rows('#g0'), mid: rows('#g1'), year: rows('#g2') }
    },
    expect: (m) => (m.small === 3 && m.mid === 7 && m.year === 7)
      || `строк: 3 дня → ${m.small}, 40 дней → ${m.mid}, год → ${m.year}`,
  },
  {
    name: 'Heatmap: ячейка растёт вместе с масштабом интерфейса',
    why: 'зашитый размер оставил бы календарь прежним, когда весь интерфейс вырос — размер тут интерфейсный, не декоративный',
    html: `<div class="ds-heat"><div class="ds-heat__body"><div class="ds-heat__grid">
        <span class="ds-heat__day ds-heat__swatch ds-heat__swatch--1" id="plain"></span>
      </div></div></div>
      <div style="--ds-ui-scale: 2"><div class="ds-heat"><div class="ds-heat__body"><div class="ds-heat__grid">
        <span class="ds-heat__day ds-heat__swatch ds-heat__swatch--1" id="scaled"></span>
      </div></div></div></div>`,
    measure: () => ({
      plain: +document.querySelector('#plain').getBoundingClientRect().width.toFixed(2),
      scaled: +document.querySelector('#scaled').getBoundingClientRect().width.toFixed(2),
    }),
    expect: (m) => Math.abs(m.scaled / m.plain - 2) < 0.1
      || `${m.plain} → ${m.scaled}, отношение ${(m.scaled / m.plain).toFixed(2)} вместо 2`,
  },
  {
    name: 'Heatmap: размер задан ячейкой — геометрия держит её долю, подпись растёт',
    why: 'ячейки выросли в 1.6 раза, подписи месяцев и дней недели нет — рассогласование выглядит принятым решением и потому не чинится само',
    // Три способа получить размер: дефолт, проп (cellSize кладёт ту же
    // переменную) и старый обход потребителя — шкала на обёртке. Утверждение
    // на все три: колонка дней недели держит долю ячейки, а кегль подписи НЕ
    // ЗАМЕРЗАЕТ на прежнем.
    //
    // Про кегль здесь сказано только «вырос». С DS-94 у него есть потолок
    // --ds-fs-base, и постоянной долей ячейки он больше не является: крупная
    // ячейка упирается в потолок, доля падает. Границы кегля меряет соседний
    // случай («подпись не перерастает основной текст карточки»), и повторять их
    // здесь нельзя — доля, посчитанная на упёршейся подписи, зелена при любой
    // формуле с потолком и молча перестала бы проверять рассогласование.
    html: ['plain', 'sized', 'wrapped'].map((k) => `
      <div ${k === 'wrapped' ? 'style="--ds-ui-scale: 1.6"' : ''}>
        <div class="ds-heat" id="h-${k}"
          ${k === 'sized' ? 'style="--ds-heat-cell: calc(22px * var(--ds-ui-scale, 1))"' : ''}>
          <div class="ds-heat__scroll">
            <div class="ds-heat__months" style="--ds-heat-cols: 4">
              <span class="ds-heat__month" id="m-${k}" style="grid-column: 1">янв</span></div>
            <div class="ds-heat__body">
              <div class="ds-heat__weekdays" id="w-${k}">
                ${Array.from({ length: 7 }, () => '<span class="ds-heat__weekday">пн</span>').join('')}</div>
              <div class="ds-heat__grid">
                ${Array.from({ length: 28 }, (_, i) => `<span class="ds-heat__day ds-heat__swatch ds-heat__swatch--1"
                  ${i === 0 ? `id="c-${k}"` : ''}></span>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`).join(''),
    measure: () => {
      const read = (k) => {
        const cell = document.querySelector(`#c-${k}`).getBoundingClientRect().width
        return {
          cell: +cell.toFixed(2),
          // Кегль подписи месяца и ширина колонки дней недели — то, что в
          // дефекте оставалось прежним, когда ячейка росла. Кегль абсолютный,
          // а не долей: доля у него теперь переменная (см. комментарий выше).
          fs: +parseFloat(getComputedStyle(document.querySelector(`#m-${k}`)).fontSize).toFixed(2),
          weekdays: +(document.querySelector(`#w-${k}`).getBoundingClientRect().width / cell).toFixed(3),
        }
      }
      return { plain: read('plain'), sized: read('sized'), wrapped: read('wrapped') }
    },
    expect: (m) => {
      const problems = []
      // Без этого утверждение о долях нечем опровергнуть: если размер нигде не
      // изменился, доли совпадут при любой починке и при любом дефекте.
      if (m.sized.cell <= m.plain.cell + 1) problems.push(`проп размера не подействовал: ${m.plain.cell} → ${m.sized.cell}`)
      if (m.wrapped.cell <= m.plain.cell + 1) problems.push(`шкала на обёртке не подействовала: ${m.plain.cell} → ${m.wrapped.cell}`)
      for (const k of ['sized', 'wrapped']) {
        if (m[k].fs <= m.plain.fs + 0.5) {
          problems.push(`${k}: ячейка ${m.plain.cell} → ${m[k].cell}, а кегль подписи замер на ${m[k].fs}`)
        }
        if (Math.abs(m[k].weekdays - m.plain.weekdays) > 0.05) {
          problems.push(`${k}: колонка дней ${m[k].weekdays} доли ячейки против ${m.plain.weekdays}`)
        }
      }
      return problems.length === 0 || problems.join('; ')
    },
  },
  {
    name: 'Heatmap: подпись не перерастает основной текст карточки',
    why: 'max() написан как пол, а работал как множитель: на cellSize={18} при --ds-ui-scale:1.15 месяцы вышли 20.7px — крупнее заголовка карточки, которая их содержит (--ds-fs-lg, 18.4px). Потолок при этом --ds-fs-base (16.1, было 14.95 при базе `--ds-fs-base` 13 — DS-375 подняла её до 14), а НЕ --ds-fs-lg: довод про заголовок показывает, насколько далеко зашло, а границу задаёт основной текст карточки — подпись не перерастает его тем более (DS-94)',
    // Мерить надо НЕ ДЕФОЛТ, и это главное про этот случай. На дефолте
    // --ds-heat-cell и --ds-fs-sm — буква в букву одно выражение
    // (calc(0.75rem * var(--ds-ui-scale))), max() и clamp() отдают одно и то
    // же число, и случай остался бы зелен при обеих формулах: ловушка №3 из
    // docs/writing-checks.md в чистом виде.
    //
    // Пол читался токеном `--ds-fs-xs` до DS-375: тот убрал `--ds-fs-xs`
    // из пятиступенчатой шкалы, а `Heatmap.css:61` давно берёт пол из
    // `--ds-fs-sm` (`clamp(var(--ds-fs-sm), var(--ds-heat-cell), var(--ds-fs-base))`,
    // компонент проверен `grep -n "clamp(var(--ds-fs" src/components/Heatmap/Heatmap.css`).
    // Проба следом читала несуществующий токен: `var(--ds-fs-xs)` на
    // невалидном значении не применяется вовсе, и `#probe-xs` наследовал
    // кегль от `body` (тот сам сидит на `--ds-fs-base`) — оба соседа-пробника
    // показывали ОДНО И ТО ЖЕ число, и случай был бы зелён, даже если пол
    // компонента совсем не держит: тот же приём ловушки №3, только на замере,
    // а не на цвете.
    //
    // Поэтому портальный масштаб на :root и три размера ячейки — по одному на
    // каждую ветку clamp(): ниже пола, внутри полосы, выше потолка. Ячейка
    // задана так же, как её кладёт проп cellSize (Heatmap.tsx:195), то есть
    // это его замер, а не похожий на него.
    //
    // Полосная ячейка — 13px, а не 12 (DS-375). Пол-токен переехал с
    // `--ds-fs-xs` (0.6875rem) на `--ds-fs-sm` (0.75rem) вместе с сокращением
    // шкалы до пяти ступеней — сам компонент от этого не изменился
    // (`Heatmap.css:61` по-прежнему `clamp(var(--ds-fs-sm), ...)`), но пол
    // стал ЧИСЛЕННО БОЛЬШЕ: 0.75rem это ровно 12px без масштаба, и старые
    // 12px «полосы» на масштабе 1.15 (13.8px) стали НЕОТЛИЧИМЫ от пола (тоже
    // 13.8px) — ветки схлопывались не потому, что подпись перестала следовать
    // за ячейкой, а потому, что сама проба выбрала полосу ровно на новом полу.
    // 13px даёт 14.95px — между полом 13.8 и потолком 16.1, различимо с обоих.
    extraCss: ':root { --ds-ui-scale: 1.15 }',
    html: `
      <div id="probe-sm" style="font-size: var(--ds-fs-sm)">sm</div>
      <div id="probe-base" style="font-size: var(--ds-fs-base)">base</div>
      ${[['small', 8], ['band', 13], ['big', 18]].map(([k, px]) => `
        <div class="ds-heat" id="h-${k}" style="--ds-heat-cell: calc(${px}px * var(--ds-ui-scale, 1))">
          <div class="ds-heat__scroll">
            <div class="ds-heat__months" style="--ds-heat-cols: 4">
              <span class="ds-heat__month" id="m-${k}" style="grid-column: 1">янв</span></div>
            <div class="ds-heat__body">
              <div class="ds-heat__weekdays">
                ${Array.from({ length: 7 }, () => '<span class="ds-heat__weekday">пн</span>').join('')}</div>
              <div class="ds-heat__grid">
                ${Array.from({ length: 28 }, (_, i) => `<span class="ds-heat__day ds-heat__swatch ds-heat__swatch--1"
                  ${i === 0 ? `id="c-${k}"` : ''}></span>`).join('')}
              </div>
            </div>
          </div>
        </div>`).join('')}`,
    measure: () => {
      const fs = (sel) => +parseFloat(getComputedStyle(document.querySelector(sel)).fontSize).toFixed(2)
      const read = (k) => ({
        cell: +document.querySelector(`#c-${k}`).getBoundingClientRect().width.toFixed(2),
        label: fs(`#m-${k}`),
      })
      return {
        // Соседи с заранее известным значением: 0.75rem и 0.875rem при
        // масштабе 1.15 — это 13.8 и 16.1 (было 0.6875rem/0.8125rem → 12.65 и
        // 14.95 при базе 13 и токене `--ds-fs-xs`, снятом DS-375). Врут
        // они — врёт и весь замер, и числа ниже были бы правдоподобны, но не
        // о том.
        sm: fs('#probe-sm'),
        base: fs('#probe-base'),
        small: read('small'), band: read('band'), big: read('big'),
      }
    },
    expect: (m) => {
      if (Math.abs(m.sm - 13.8) > 0.1 || Math.abs(m.base - 16.1) > 0.1) {
        return `масштаб не доехал до :root: sm ${m.sm} (ждали 13.8), base ${m.base} (ждали 16.1)`
      }
      const problems = []
      // Потолок — предмет задачи. Ячейка 20.7, подпись обязана встать на base.
      if (Math.abs(m.big.label - m.base) > 0.1) {
        problems.push(`потолка нет: ячейка ${m.big.cell}, подпись ${m.big.label} вместо ${m.base}`)
      }
      // Пол — прежний довод, и он не снят: у текста предел читаемости есть,
      // у квадрата нет.
      if (Math.abs(m.small.label - m.sm) > 0.1) {
        problems.push(`пол не держит: ячейка ${m.small.cell}, подпись ${m.small.label} вместо ${m.sm}`)
      }
      // Средняя ветка жива: без этого потолок можно было бы поставить, прибив
      // кегль к base намертво, и обе проверки выше остались бы зелёными.
      if (Math.abs(m.band.label - m.band.cell) > 0.1) {
        problems.push(`в полосе подпись отвязалась от ячейки: ${m.band.cell} → ${m.band.label}`)
      }
      // И три ветки обязаны быть РАЗЛИЧИМЫ между собой: схлопнись они в одно
      // число, каждое утверждение по отдельности всё равно прошло бы.
      const labels = [m.small.label, m.band.label, m.big.label]
      if (new Set(labels).size < 3) problems.push(`ветки схлопнулись: ${labels.join(' / ')}`)
      return problems.length === 0 || problems.join('; ')
    },
  },
  {
    name: 'Heatmap: в узком родителе сжимается сам — и во флекс-ряду, и в блоке',
    why: 'потребитель держал у себя `flex: none` на .ds-heat и вреда не видел — его дашборд широк, календарь всегда помещался целиком, а когда помещается, `flex: none` и дефолт неотличимы (DS-94)',
    // Отличие от соседнего случая про тесный контейнер: там календарь ОДИН в
    // родителе, и вопрос был к обрезке С НАЧАЛА. Здесь вопрос к тому, кто
    // платит за переполнение, и хостов два, потому что держат их две РАЗНЫЕ
    // строки, а не одна:
    //   flex-ряд с соседом  — min-width: 0 (автоминимум флекс-элемента
    //                         считается по содержимому: 774px, год недель);
    //   блочный родитель    — max-width: 100% (shrink-to-fit не опускается
    //                         ниже min-content, те же 774px).
    // Замерено: снятие любой из двух даёт переполнение, снятие обеих — оба.
    // Одного хоста мало ровно потому же, почему мало дефолтного cellSize:
    // пока календарь один во флексе, min-width: 0 и max-width: 100% дают одно
    // число и подменяют друг друга молча.
    html: `<div id="row" style="display: flex; gap: 8px; width: 420px; align-items: flex-start">
      <div class="ds-heat" id="heat">
        <div class="ds-heat__scroll" id="scroll">
          <div class="ds-heat__months" style="--ds-heat-cols: 53">
            <span class="ds-heat__month" style="grid-column: 1">янв</span></div>
          <div class="ds-heat__body">
            <div class="ds-heat__weekdays">${Array.from({ length: 7 }, () => '<span class="ds-heat__weekday">пн</span>').join('')}</div>
            <div class="ds-heat__grid">
              ${Array.from({ length: 371 }, () => '<span class="ds-heat__day ds-heat__swatch ds-heat__swatch--1"></span>').join('')}
            </div>
          </div>
        </div>
        <div class="ds-heat__legend"><span class="ds-heat__legend-text">меньше</span>
          <span class="ds-heat__swatch ds-heat__swatch--0"></span>
          <span class="ds-heat__legend-text">больше</span></div>
      </div>
      <div id="mate" style="flex: 0 0 120px; height: 40px">рядом</div>
    </div>
    <div id="box" style="width: 320px">
      <div class="ds-heat" id="heat-b">
        <div class="ds-heat__scroll" id="scroll-b">
          <div class="ds-heat__months" style="--ds-heat-cols: 53">
            <span class="ds-heat__month" style="grid-column: 1">янв</span></div>
          <div class="ds-heat__body">
            <div class="ds-heat__weekdays">${Array.from({ length: 7 }, () => '<span class="ds-heat__weekday">пн</span>').join('')}</div>
            <div class="ds-heat__grid">
              ${Array.from({ length: 371 }, () => '<span class="ds-heat__day ds-heat__swatch ds-heat__swatch--1"></span>').join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`,
    measure: () => {
      const moved = (sel) => {
        const el = document.querySelector(sel)
        el.scrollLeft = 9999
        const n = el.scrollLeft
        el.scrollLeft = 0
        return n
      }
      const w = (sel) => +document.querySelector(sel).getBoundingClientRect().width.toFixed(2)
      const over = (sel) => {
        const el = document.querySelector(sel)
        return +(el.scrollWidth - el.clientWidth).toFixed(2)
      }
      const scroll = document.querySelector('#scroll')
      return {
        // `gap` читается из вычисленного стиля, а не повторяется числом: литерал
        // здесь развязан с разметкой того же случая и при правке `gap` в HTML
        // молча ЗАВЫШАЕТ доступную ширину, то есть отказ проверять происходит
        // в тихую сторону — случай остаётся зелёным и перестаёт утверждать то,
        // что называет.
        row: {
          host: w('#row'), heat: w('#heat'), overflow: over('#row'), moved: moved('#scroll'),
          gap: parseFloat(getComputedStyle(document.querySelector('#row')).columnGap),
        },
        // Сосед с заранее известной шириной: 120 и ни пикселем меньше, он
        // нерастяжим и несжимаем. Разъедься геометрия ряда — соврёт он первым.
        mate: w('#mate'),
        block: { host: w('#box'), heat: w('#heat-b'), overflow: over('#box'), moved: moved('#scroll-b') },
        // Санитар: календарь обязан НЕ помещаться. Влезь он — сжатие и его
        // отсутствие дали бы одно и то же, и случай не проверил бы ничего.
        content: scroll.scrollWidth,
        viewport: scroll.clientWidth,
      }
    },
    expect: (m) => {
      if (Math.abs(m.mate - 120) > 0.5) return `ряд устроен не так, как думает случай: сосед ${m.mate} вместо 120`
      if (!Number.isFinite(m.row.gap)) return `зазор ряда не прочитался (${m.row.gap}) — доступную ширину не из чего считать`
      if (m.content <= m.viewport + 1) return `содержимое ${m.content} влезло в ${m.viewport} — родители не узкие, случай ничего не проверил`
      const problems = []
      const room = +(m.row.host - m.mate - m.row.gap).toFixed(2)
      if (m.row.heat > room + 0.5) problems.push(`во флекс-ряду календарь ${m.row.heat} при доступных ${room} — не сжался`)
      if (m.row.overflow > 1) problems.push(`ряд переполнен на ${m.row.overflow}px — за календарь платит сосед`)
      if (m.block.heat > m.block.host + 0.5) problems.push(`в блоке календарь ${m.block.heat} при родителе ${m.block.host} — не сжался`)
      if (m.block.overflow > 1) problems.push(`блок переполнен на ${m.block.overflow}px`)
      // Сжался — но переполнение обязано было уйти во внутреннюю прокрутку,
      // а не пропасть: без этого «сжался» неотличимо от «обрезался».
      if (m.row.moved <= 0) problems.push('во флекс-ряду scrollLeft не двинулся — сжатие без прокрутки')
      if (m.block.moved <= 0) problems.push('в блоке scrollLeft не двинулся — сжатие без прокрутки')
      return problems.length === 0 || problems.join('; ')
    },
  },
  {
    name: 'Heatmap: соседние ступени различимы на экране в обеих темах',
    why: 'первый рамп давал ΔL* 4.9 между «пусто» и «один» — один коммит выглядел как ни одного',
    html: ['light', 'dark'].map((t) => `<div ${t === 'dark' ? 'data-theme="dark"' : ''}>
      <div class="ds-heat"><div class="ds-heat__body"><div class="ds-heat__grid">
        ${[0, 1, 2, 3, 4].map((l) => `<span class="ds-heat__day ds-heat__swatch ds-heat__swatch--${l}" id="s${l}-${t}"></span>`).join('')}
      </div></div></div></div>`).join(''),
    measure: () => {
      const lstar = (css) => {
        const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        const y = 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
        return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
      }
      const read = (t) => {
        const ls = [0, 1, 2, 3, 4].map((l) =>
          lstar(getComputedStyle(document.querySelector(`#s${l}-${t}`)).backgroundColor))
        const steps = ls.slice(1).map((v, i) => v - ls[i])
        return {
          min: +Math.min(...steps.map(Math.abs)).toFixed(1),
          monotone: steps.every((s) => s > 0) || steps.every((s) => s < 0),
        }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => (m.light.min >= 8 && m.dark.min >= 8 && m.light.monotone && m.dark.monotone)
      || `светлая мин.шаг ${m.light.min} монотонно ${m.light.monotone}, `
        + `тёмная мин.шаг ${m.dark.min} монотонно ${m.dark.monotone}`,
  },
  {
    name: 'Heatmap: кольцо фокуса видно на КАЖДОЙ ступени рампа, в обеих темах',
    why: 'DS-193. `--ds-heat-4` в светлой теме побайтово равен `--ds-accent` (#0E7C7C), и кольцо фокуса на верхней ступени рисовалось её же цветом: контраст 1.00, замерено настоящим Tab на `?c=Heatmap&case=pick`. Одно значение несло два смысла сразу — фокус (состояние) и «максимум поездок» (величина), — то есть нарушался системный закон о цвете, а не «было неудобно видно». Утверждение здесь устроено как ИЛИ, и это не послабление: рамп по построению проходит через всю светлоту ровными шагами, поэтому НИ ОДИН одиночный цвет не берёт 3 : 1 на всех пяти ступенях, и требовать этого от обоих слоёв значило бы требовать невозможного. Требуется, чтобы на каждой земле работал ХОТЬ ОДИН слой: акцент держит нижние ступени (4.10 и 3.11), тёмная кромка — верхние (6.33 и 4.19). Земли — пять ступеней И поверхность в зазорах между ячейками: кольцо ложится и туда',
    // Ровно две фокусируемые кнопки на странице, по одной на тему: `focusRings`
    // жмёт Tab по разу на селектор, и лишний фокусируемый узел увёл бы кольцо
    // не туда — числа при этом остались бы правдоподобными.
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:12px">
      <div class="ds-heat"><div class="ds-heat__body"><div class="ds-heat__grid">
        ${[0, 1, 2, 3, 4].map((l) => `<span class="ds-heat__day ds-heat__swatch ds-heat__swatch--${l}" id="fr-step${l}-${t}"></span>`).join('')}
        <button type="button" class="ds-heat__day ds-heat__swatch ds-heat__swatch--4" id="fr-ring-${t}"></button>
      </div></div></div>
      <span id="fr-surface-${t}" style="background: var(--ds-surface)"></span>
    </div>`).join(''),
    focusRings: ['#fr-ring-light', '#fr-ring-dark'],
    measure: () => {
      const out = {}
      for (const t of ['light', 'dark']) {
        out[t] = {
          steps: [0, 1, 2, 3, 4].map((l) =>
            getComputedStyle(document.getElementById(`fr-step${l}-${t}`)).backgroundColor),
          surface: getComputedStyle(document.getElementById(`fr-surface-${t}`)).backgroundColor,
        }
      }
      return out
    },
    expect: (m) => {
      const fails = []
      for (const t of ['light', 'dark']) {
        const shadow = m.rings[`#fr-ring-${t}`]
        // Санитар на сам замер: без настоящего Tab `:focus-visible` не
        // срабатывает вовсе, и `boxShadow` приходит `none` — а «слоёв не два»
        // читалось бы как дефект кольца.
        if (!shadow || shadow === 'none') {
          fails.push(`${t}: кольца нет вовсе (${shadow}) — Tab не доехал или :focus-visible не сработал`)
          continue
        }
        // Цвета берутся ИЗ НАРИСОВАННОГО кольца, а не из токенов: токен мог бы
        // быть верным, а компонент брать другой.
        const layers = shadow.split(/,(?![^(]*\))/).map((s) => s.trim())
        if (layers.length !== 2) {
          fails.push(`${t}: слоёв ${layers.length}, а не 2 — кольцо снова однослойное, и на верхней ступени ему нечем отделиться от заливки`)
          continue
        }
        if (!layers.every((l) => /\binset\b/.test(l))) {
          fails.push(`${t}: кольцо рисуется наружу — на ячейке в 11px оно ложится на соседей, и «какая именно в фокусе» не читается`)
        }
        const colours = layers.map((l) => (l.match(/rgba?\([^)]*\)/) || [])[0])
        if (colours.some((c) => !c)) {
          fails.push(`${t}: цвет слоя не разобран (${shadow})`)
          continue
        }
        const grounds = [...m[t].steps.map((c, i) => [`heat-${i}`, c]), ['поверхность в зазоре', m[t].surface]]
        for (const [name, ground] of grounds) {
          const best = Math.max(...colours.map((c) => contrastOf(c, ground)))
          if (best < 3) {
            const each = colours.map((c) => `${c} ${contrastOf(c, ground).toFixed(2)}`).join(', ')
            fails.push(`${t}: на ${name} (${ground}) ни один слой кольца не берёт 3 — ${each}`)
          }
        }
        // И отдельно то, с чего задача началась: слои обязаны быть РАЗНЫМИ.
        // Совпади они, проверка выше осталась бы зелёной на нижних ступенях и
        // молча вернула бы однослойное кольцо.
        if (colours[0] === colours[1]) {
          fails.push(`${t}: оба слоя одного цвета (${colours[0]}) — кольцо двухслойно только на вид`)
        }
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'Heatmap: метка типа не меняет заливку — величина остаётся честной',
    why: 'рамп кодирует количество; подкрасить помеченный день значит соврать о нём — ровно то ограничение, ради которого метки вынесены в отдельный канал',
    html: [0, 1, 2, 3, 4].map((l) => `<div class="ds-heat"><div class="ds-heat__body"><div class="ds-heat__grid">
        <span class="ds-heat__day ds-heat__swatch ds-heat__swatch--${l}" id="plain-${l}"></span>
        <span class="ds-heat__day ds-heat__swatch ds-heat__swatch--${l}" id="ring-${l}">
          <span class="ds-heat__mark ds-heat__mark--ring"></span></span>
        <span class="ds-heat__day ds-heat__swatch ds-heat__swatch--${l}" id="bar-${l}">
          <span class="ds-heat__mark ds-heat__mark--bar ds-heat__mark--error"></span></span>
        <span class="ds-heat__day ds-heat__swatch ds-heat__swatch--${l}" id="note-${l}">
          <span class="ds-heat__note"></span></span>
      </div></div></div>`).join(''),
    measure: () => {
      const bad = []
      for (const l of [0, 1, 2, 3, 4]) {
        const base = getComputedStyle(document.querySelector(`#plain-${l}`)).backgroundColor
        for (const v of ['ring', 'bar', 'note']) {
          const got = getComputedStyle(document.querySelector(`#${v}-${l}`)).backgroundColor
          if (got !== base) bad.push(`${v}@${l}: ${got} вместо ${base}`)
        }
      }
      return { bad }
    },
    expect: (m) => m.bad.length === 0 || m.bad.join('; '),
  },
  {
    name: 'Heatmap: метки видны на всех ступенях в обеих темах',
    why: 'метка обязана читаться и на нулевой ступени (почти цвет поверхности), и на четвёртой (насыщенный акцент) — цвета, контрастного к обоим краям, не существует',
    html: ['light', 'dark'].map((t) => `<div ${t === 'dark' ? 'data-theme="dark"' : ''}
      style="background: var(--ds-surface); padding: 6px">
      ${[0, 4].map((l) => `<div class="ds-heat"><div class="ds-heat__body"><div class="ds-heat__grid">
        <span class="ds-heat__day ds-heat__swatch ds-heat__swatch--${l}" id="p-${t}-${l}"></span>
        <span class="ds-heat__day ds-heat__swatch ds-heat__swatch--${l}" id="r-${t}-${l}">
          <span class="ds-heat__mark ds-heat__mark--ring"></span></span>
        <span class="ds-heat__day ds-heat__swatch ds-heat__swatch--${l}" id="n-${t}-${l}">
          <span class="ds-heat__note"></span></span>
      </div></div></div>`).join('')}</div>`).join(''),
    measure: () => {
      const lum = (css) => {
        const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const weak = []
      for (const t of ['light', 'dark']) {
        for (const l of [0, 4]) {
          const fill = getComputedStyle(document.querySelector(`#p-${t}-${l}`)).backgroundColor
          // Кольцо и ядро метки заметки обязаны отличаться от заливки, иначе
          // метка есть в разметке и её не видно — ровно тот класс дефектов,
          // который эта секция и стережёт.
          const ring = getComputedStyle(document.querySelector(`#r-${t}-${l} .ds-heat__mark`)).boxShadow
          const ringColor = ring.match(/rgba?\([^)]+\)/)?.[0] ?? ''
          const note = getComputedStyle(document.querySelector(`#n-${t}-${l} .ds-heat__note`)).backgroundColor
          const rr = +ratio(lum(ringColor), lum(fill)).toFixed(3)
          const nr = +ratio(lum(note), lum(fill)).toFixed(3)
          if (rr < 1.12) weak.push(`кольцо ${t}@${l} = ${rr}`)
          if (nr < 1.5) weak.push(`заметка ${t}@${l} = ${nr}`)
        }
      }
      return { weak }
    },
    expect: (m) => m.weak.length === 0 || m.weak.join('; '),
  },
  {
    name: 'Heatmap: легенда идёт в ту же сторону, что и шкала',
    why: 'перевёрнутая легенда врёт молча — сетка и подпись под ней противоречат друг другу',
    html: `<div class="ds-heat"><div class="ds-heat__legend" id="lg">
      <span class="ds-heat__legend-text">меньше</span>
      ${[0, 1, 2, 3, 4].map((l) => `<span class="ds-heat__swatch ds-heat__swatch--${l}"></span>`).join('')}
      <span class="ds-heat__legend-text">больше</span>
    </div></div>`,
    measure: () => {
      const lstar = (css) => {
        const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        const y = 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
        return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
      }
      const sw = [...document.querySelectorAll('#lg .ds-heat__swatch')]
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        .map((el) => lstar(getComputedStyle(el).backgroundColor))
      const texts = [...document.querySelectorAll('#lg .ds-heat__legend-text')]
      return {
        first: texts[0].textContent.trim(),
        // «меньше» слева, значит слева обязана быть нулевая ступень: в светлой
        // теме она самая светлая, и L* должна убывать вправо.
        descending: sw.every((v, i) => i === 0 || v < sw[i - 1]),
      }
    },
    expect: (m) => (m.first === 'меньше' && m.descending)
      || `слева «${m.first}», светлота убывает вправо: ${m.descending}`,
  },
  {
    name: 'DataTable: скрытая колонка уходит заголовком и ячейками вместе',
    why: 'спрятать только `th` или только `td` — это не скрытая колонка, а съехавшие данные: значения встают под чужие заголовки, и таблица врёт молча',
    html: `<div style="width:360px"><div class="ds-table-wrap"><table class="ds-table" id="t360">
      <thead><tr><th>Задача</th><th class="ds-table__hide-sm">Автор</th><th class="ds-table__hide-sm">Обновлена</th></tr></thead>
      <tbody><tr><td class="ds-table__lead">A</td><td class="ds-table__hide-sm">Б</td><td class="ds-table__hide-sm">вчера</td></tr>
      <tr><td class="ds-table__lead">B</td><td class="ds-table__hide-sm">В</td><td class="ds-table__hide-sm">сегодня</td></tr></tbody>
      </table></div></div><div style="width:900px"><div class="ds-table-wrap"><table class="ds-table" id="t900">
      <thead><tr><th>Задача</th><th class="ds-table__hide-sm">Автор</th><th class="ds-table__hide-sm">Обновлена</th></tr></thead>
      <tbody><tr><td class="ds-table__lead">A</td><td class="ds-table__hide-sm">Б</td><td class="ds-table__hide-sm">вчера</td></tr>
      <tr><td class="ds-table__lead">B</td><td class="ds-table__hide-sm">В</td><td class="ds-table__hide-sm">сегодня</td></tr></tbody>
      </table></div></div>`,
    measure: () => {
      const count = (id) => {
        const t = document.querySelector(id)
        const vis = (sel) => [...t.querySelectorAll(sel)].filter((e) => e.getClientRects().length).length
        const rows = [...t.querySelectorAll('tbody tr')]
        return {
          th: vis('thead th'),
          tdPerRow: rows.map((r) => [...r.querySelectorAll('td')].filter((e) => e.getClientRects().length).length),
        }
      }
      return { narrow: count('#t360'), wide: count('#t900') }
    },
    expect: (m) => {
      const ok = (c, n) => c.th === n && c.tdPerRow.every((v) => v === n)
      return (ok(m.narrow, 1) && ok(m.wide, 3))
        || `узкая: ${m.narrow.th} заголовков / ячейки ${m.narrow.tdPerRow.join(',')}; широкая: ${m.wide.th} / ${m.wide.tdPerRow.join(',')}`
    },
  },
  {
    name: 'DataTable: порог скрытия едет вместе с масштабом интерфейса',
    why: 'при масштабе 1.5 в ту же ширину влезает меньше содержимого; порог в сырых пикселях был бы единственной частью таблицы, игнорирующей `--ds-ui-scale`',
    // Масштаб ставится на `:root`, а не на обёртку: метрические токены объявлены
    // там, и `var(--ds-ui-scale)` внутри их `calc()` вычисляется там же. Это уже
    // записано в `consumption.md` — инвариант обязан проверять поддержанный
    // способ, иначе он проверяет чужую ошибку.
    extraCss: ':root { --ds-ui-scale: 1.5 }',
    html: `${[560, 900].map((w) => `<div style="width:${w}px"><div class="ds-table-wrap">
      <table class="ds-table" id="t${w}">
      <thead><tr><th>A</th><th class="ds-table__hide-sm">B</th></tr></thead>
      <tbody><tr><td>a</td><td class="ds-table__hide-sm">b</td></tr></tbody></table></div></div>`).join('')}`,
    measure: () => {
      const vis = (id) => [...document.querySelectorAll(`#${id} thead th`)].filter((e) => e.getClientRects().length).length
      return { at560: vis('t560'), at900: vis('t900') }
    },
    // При масштабе 1 порог ≈560px (было ≈520px при базе `--ds-fs-base` 13,
    // DS-375 подняла её до 14). При 1.5 он уезжает к ≈840px (было
    // ≈780px), и ширина 560 из этого случая — ниже порога на обеих шкалах —
    // обязана прятать.
    expect: (m) => (m.at560 === 1 && m.at900 === 2)
      || `при масштабе 1.5: 560px → ${m.at560} колонки, 900px → ${m.at900}`,
  },
  {
    name: 'DataTable: порог скрытия не зависит от шрифта окружения',
    why: 'порог задан в `em`, и без явного `font-size` на контейнере таблица в компактной панели прятала бы колонки на другой ширине, чем такая же таблица на странице',
    // Обе ширины по обе стороны порога, а не одна: проверка «на 600px видно обе»
    // сама по себе верна и тогда, когда скрытие сломано целиком. Мутация
    // «container-type на таблице вместо обёртки» ровно так её и пережила.
    //
    // 600, а не 560 (DS-375). Порог сам — 40em, круглое число, а не замер
    // содержимого, и подъём базы `--ds-fs-base` 13→14 его не тронул. Но 40em —
    // это РОВНО 560px при кегле 14px (было 520px при 13), и старая широкая
    // ширина 560 у пробы БЕЗ обёртки легла ТОЧНО НА порог: `@container
    // (max-width: 40em)` включает границу, 560px/14px = 40.0em ровно, колонка
    // пряталась там, где проба хотела её видеть. 600px даёт 42.86em — запас
    // 2.86em ≈ 40px, безопасно по обе стороны сравнения.
    html: `${['', 'font-size: 24px'].map((f, k) => [600, 360].map((w) => `<div style="width:${w}px; ${f}">
      <div class="ds-table-wrap"><table class="ds-table" id="f${k}w${w}">
      <thead><tr><th>A</th><th class="ds-table__hide-sm">B</th></tr></thead>
      <tbody><tr><td>a</td><td class="ds-table__hide-sm">b</td></tr></tbody></table></div></div>`).join('')).join('')}`,
    measure: () => {
      const vis = (id) => [...document.querySelectorAll(`#${id} thead th`)].filter((e) => e.getClientRects().length).length
      return {
        plain: { wide: vis('f0w600'), narrow: vis('f0w360') },
        inBigFont: { wide: vis('f1w600'), narrow: vis('f1w360') },
      }
    },
    expect: (m) => {
      const ok = (c) => c.wide === 2 && c.narrow === 1
      return (ok(m.plain) && ok(m.inBigFont))
        || `обычное окружение: 600px → ${m.plain.wide}, 360px → ${m.plain.narrow}; крупный шрифт: 600px → ${m.inBigFont.wide}, 360px → ${m.inBigFont.narrow}`
    },
  },
  {
    name: 'Pagination: диапазон стоит по центру полосы, а не рядом с селектором',
    why: 'на space-between исчезнувший селектор утащил бы метку влево, и «центр» оказался бы центром только на одном сочетании пропов',
    html: `<div style="width:800px">
      <nav class="ds-pager ds-pager--bar" id="full">
        <div class="ds-pager__size"><span class="ds-pager__sizelabel">На странице</span>
          <select class="ds-pager__select"><option>20</option></select></div>
        <span class="ds-pager__range">21–40 из 347</span>
        <div class="ds-pager__nav"><button class="ds-pager__btn">‹</button><button class="ds-pager__btn">›</button></div>
      </nav></div>
      <div style="width:800px">
      <nav class="ds-pager ds-pager--bar" id="nosize">
        <div class="ds-pager__size"></div>
        <span class="ds-pager__range">21–40 из 347</span>
        <div class="ds-pager__nav"><button class="ds-pager__btn">‹</button><button class="ds-pager__btn">›</button></div>
      </nav></div>`,
    measure: () => {
      const off = (id) => {
        const nav = document.querySelector(`#${id}`)
        const r = document.querySelector(`#${id} .ds-pager__range`).getBoundingClientRect()
        const n = nav.getBoundingClientRect()
        // Насколько центр метки отклонился от центра полосы.
        return +Math.abs((r.left + r.right) / 2 - (n.left + n.right) / 2).toFixed(2)
      }
      return { withSelector: off('full'), withoutSelector: off('nosize') }
    },
    expect: (m) => (m.withSelector < 1 && m.withoutSelector < 1)
      || `смещение центра: с селектором ${m.withSelector}px, без селектора ${m.withoutSelector}px`,
  },
  {
    name: 'Pagination: прежняя форма не сдвинулась ни на пиксель',
    why: 'обёртка `__nav` появилась ради полосы, а у портала пагинация — inline-блок: `gap` применился бы к одному ребёнку, и кнопки разъехались бы у живого потребителя',
    html: `<div id="direct"><nav class="ds-pager">
        ${[...'12'].map(() => '').join('')}
        <button class="ds-pager__btn">Назад</button><button class="ds-pager__btn">1</button>
        <button class="ds-pager__btn is-active">2</button><button class="ds-pager__btn">Вперёд</button>
      </nav></div>
      <div id="wrapped"><nav class="ds-pager"><div class="ds-pager__nav">
        <button class="ds-pager__btn">Назад</button><button class="ds-pager__btn">1</button>
        <button class="ds-pager__btn is-active">2</button><button class="ds-pager__btn">Вперёд</button>
      </div></nav></div>`,
    measure: () => {
      const geo = (id) => {
        const nav = document.querySelector(`#${id} .ds-pager`)
        return {
          w: +nav.getBoundingClientRect().width.toFixed(2),
          lefts: [...nav.querySelectorAll('button')].map((b) => +b.getBoundingClientRect().left.toFixed(2)),
        }
      }
      return { direct: geo('direct'), wrapped: geo('wrapped') }
    },
    expect: (m) => (m.direct.w === m.wrapped.w && JSON.stringify(m.direct.lefts) === JSON.stringify(m.wrapped.lefts))
      || `ширина ${m.direct.w} → ${m.wrapped.w}; левые края ${m.direct.lefts.join(',')} → ${m.wrapped.lefts.join(',')}`,
  },
  {
    name: 'Avatar: кольцо не съедает лицо',
    why: 'рамка вместо тени внешний размер не меняет (в системе box-sizing: border-box) — она ужимает содержимое: фотография теряет почти четверть площади, а аватар выглядит прежним, и причину по виду не найти',
    html: `${['plain', 'online', 'busy', 'away', 'offline'].map((k) => `<span class="ds-avatar ds-avatar--md ds-avatar--neutral ${k === 'plain' ? '' : `ds-avatar--presence-${k}`}" id="p-${k}"><img class="ds-avatar__img" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='teal'/%3E%3C/svg%3E"></span>`).join('')}`,
    measure: () => {
      const read = (id) => {
        const el = document.querySelector(`#${id}`)
        const box = el.getBoundingClientRect()
        const face = el.querySelector('img').getBoundingClientRect()
        return { outer: `${box.width.toFixed(2)}x${box.height.toFixed(2)}`, face: `${face.width.toFixed(2)}x${face.height.toFixed(2)}` }
      }
      return {
        plain: read('p-plain'),
        withRing: ['online', 'busy', 'away', 'offline'].map((k) => ({ k, ...read(`p-${k}`) })),
      }
    },
    expect: (m) => {
      const bad = m.withRing.filter((x) => x.face !== m.plain.face || x.outer !== m.plain.outer)
      return bad.length === 0
        || `без кольца ${m.plain.outer} / лицо ${m.plain.face}; ${bad.map((x) => `${x.k} ${x.outer} / лицо ${x.face}`).join(', ')}`
    },
  },
  {
    name: 'Avatar: кольцо видно на поверхности в обеих темах',
    why: 'кольцо кодирует состояние цветом; слившееся с фоном означает «состояние не показано», а проп при этом задан',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''}
      style="background: var(--ds-surface); padding: 12px">
      ${['online', 'busy', 'away', 'offline'].map((k) => `<span class="ds-avatar ds-avatar--md ds-avatar--neutral ds-avatar--presence-${k}" id="${t}-${k}"><span class="ds-avatar__initials">ПИ</span></span>`).join('')}
      </div>`).join(''),
    measure: () => {
      const lum = (css) => {
        const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const read = (t) => ['online', 'busy', 'away', 'offline'].map((k) => {
        const el = document.querySelector(`#${t}-${k}`)
        // Второй слой тени — сам цвет состояния.
        const ring = getComputedStyle(el).boxShadow.match(/rgba?\([^)]+\)/g)?.[1] ?? ''
        const surface = getComputedStyle(el.parentElement).backgroundColor
        // Тени может не быть вовсе — тогда это ноль, а не падение измерителя:
        // «кольца нет» должно читаться как провал инварианта, а не как ошибка.
        return { k, ring: ring || 'нет тени', ratio: ring ? +ratio(lum(ring), lum(surface)).toFixed(2) : 0 }
      })
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => {
      const bad = [...m.light, ...m.dark].filter((x) => x.ratio < 1.5)
      return bad.length === 0
        || `сливаются с поверхностью: ${bad.map((x) => `${x.k} ${x.ring} = ${x.ratio}`).join(', ')}`
    },
  },
  {
    name: 'Button: три размера дают три высоты, иконочная кнопка квадратная в каждом',
    why: 'без .ds-btn--icon.ds-btn--lg иконка в lg выходит 2.25×2rem; без .ds-btn--lg все три высоты совпадают с md',
    html: `<div style="display:flex;gap:12px;align-items:flex-start">
      <button class="ds-btn ds-btn--primary ds-btn--sm" id="bs"><span class="ds-btn__label">S</span></button>
      <button class="ds-btn ds-btn--primary ds-btn--md" id="bm"><span class="ds-btn__label">M</span></button>
      <button class="ds-btn ds-btn--primary ds-btn--lg" id="bl"><span class="ds-btn__label">L</span></button>
      <button class="ds-btn ds-btn--primary ds-btn--icon ds-btn--sm" id="is" aria-label="i"><span class="ds-btn__label">⌂</span></button>
      <button class="ds-btn ds-btn--primary ds-btn--icon ds-btn--md" id="im" aria-label="i"><span class="ds-btn__label">⌂</span></button>
      <button class="ds-btn ds-btn--primary ds-btn--icon ds-btn--lg" id="il" aria-label="i"><span class="ds-btn__label">⌂</span></button>
    </div>`,
    measure: () => {
      const box = (id) => {
        const r = document.querySelector(`#${id}`).getBoundingClientRect()
        return { h: +r.height.toFixed(2), w: +r.width.toFixed(2) }
      }
      return { sm: box('bs'), md: box('bm'), lg: box('bl'), is: box('is'), im: box('im'), il: box('il') }
    },
    expect: (m) => {
      if (!(m.sm.h < m.md.h && m.md.h < m.lg.h)) {
        return `высоты не растут: sm=${m.sm.h} md=${m.md.h} lg=${m.lg.h}`
      }
      for (const [k, v] of [['is', m.is], ['im', m.im], ['il', m.il]]) {
        if (Math.abs(v.w - v.h) > 0.5) return `${k} не квадрат: ${v.w}×${v.h}`
      }
      return true
    },
  },
  {
    name: 'Button: подпись success читается на заливке в обеих темах',
    why: 'в тёмной теме заливка светлая, и белый текст на ней даёт 2.78 — кнопка выглядит нажимаемой и не читается; danger лечится тем же приёмом, и success обязан идти за ним, а не мимо',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''}
      style="background: var(--ds-surface); padding: 8px">
      <button class="ds-btn ds-btn--success ds-btn--md" id="b-${t}"><span class="ds-btn__label">Старт</span></button>
      </div>`).join(''),
    measure: () => {
      const lum = (css) => {
        const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const read = (t) => {
        const cs = getComputedStyle(document.querySelector(`#b-${t}`))
        return { fg: cs.color, bg: cs.backgroundColor, ratio: +ratio(lum(cs.color), lum(cs.backgroundColor)).toFixed(2) }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => (m.light.ratio >= 4.5 && m.dark.ratio >= 4.5)
      || `светлая ${m.light.fg} на ${m.light.bg} = ${m.light.ratio}, тёмная ${m.dark.fg} на ${m.dark.bg} = ${m.dark.ratio}`,
  },
  {
    name: 'CodeBlock: хвост команды не прячется под кнопкой',
    why: 'наложением кнопки поверх прокрутки под ней исчезало 74px команды — а в конце обычно самый важный флаг; человек копирует вслепую и не видит, что именно',
    html: `<div style="width:520px"><div class="ds-codeblock" id="cb">
      <pre class="ds-codeblock__pre" id="cbpre"><code class="ds-codeblock__code" id="cbcode">php bin/console app:tracker:task:add consumer-demo &quot;длинная команда для проверки хвоста&quot; --priority=high --END</code></pre>
      <button class="ds-codeblock__copy" id="cbbtn"><span class="ds-codeblock__copytext">Копировать</span><span class="ds-codeblock__copysizer" aria-hidden="true"><span>Копировать</span><span>Скопировано</span><span>Не удалось</span></span></button>
      </div></div>`,
    measure: () => {
      const pre = document.querySelector('#cbpre')
      pre.scrollLeft = pre.scrollWidth
      const code = document.querySelector('#cbcode').getBoundingClientRect()
      const btn = document.querySelector('#cbbtn').getBoundingClientRect()
      return {
        scrolls: pre.scrollWidth > pre.clientWidth,
        codeRight: +code.right.toFixed(2),
        btnLeft: +btn.left.toFixed(2),
      }
    },
    expect: (m) => (m.scrolls && m.codeRight <= m.btnLeft)
      || (!m.scrolls
        ? 'команда не прокручивается — случай не проверен'
        : `хвост кода на ${m.codeRight}, кнопка начинается на ${m.btnLeft}: скрыто ${(m.codeRight - m.btnLeft).toFixed(2)}px`),
  },
  {
    name: 'CodeBlock: смена подписи кнопки не дёргает код',
    why: 'кнопка по содержимому расширялась бы на «Скопировано», область кода сжималась, и текст прыгал в ответ на действие, которое его не касается',
    html: `${['Копировать', 'Скопировано', 'Не удалось'].map((t, i) => `<div style="width:520px"><div class="ds-codeblock" id="w${i}">
      <pre class="ds-codeblock__pre"><code class="ds-codeblock__code">php bin/console app:tracker:task:add consumer-demo &quot;длинная команда для проверки хвоста&quot; --priority=high --END</code></pre>
      <button class="ds-codeblock__copy"><span class="ds-codeblock__copytext">${t}</span><span class="ds-codeblock__copysizer" aria-hidden="true"><span>Копировать</span><span>Скопировано</span><span>Не удалось</span></span></button>
      </div></div>`).join('')}`,
    measure: () => [0, 1, 2].map((i) => {
      const box = document.querySelector(`#w${i}`)
      return {
        btn: +box.querySelector('button').getBoundingClientRect().width.toFixed(2),
        pre: +box.querySelector('pre').getBoundingClientRect().width.toFixed(2),
      }
    }),
    expect: (m) => (m.every((x) => x.btn === m[0].btn && x.pre === m[0].pre))
      || `ширины кнопки ${m.map((x) => x.btn).join(', ')}; ширины кода ${m.map((x) => x.pre).join(', ')}`,
  },
  {
    name: 'Stat: единица не набрана кеглем значения',
    why: 'единица — подпись к величине, а не сама величина; тем же кеглем и весом она кричит наравне с числом, и плитка перестаёт читаться с одного взгляда',
    html: `<div class="ds-stat" id="st"><div class="ds-stat__labelrow"><div class="ds-stat__label">Среднее время</div></div>
      <div class="ds-stat__row"><div class="ds-stat__value" id="stv">347</div><span class="ds-stat__unit" id="stu">мс</span></div></div>`,
    measure: () => {
      const v = document.querySelector('#stv'), u = document.querySelector('#stu')
      const cv = getComputedStyle(v), cu = getComputedStyle(u)
      return {
        valueFs: parseFloat(cv.fontSize), unitFs: parseFloat(cu.fontSize),
        valueWeight: +cv.fontWeight, unitWeight: +cu.fontWeight,
        // Общая базовая линия: у `.ds-stat__row` уже `align-items: baseline`.
        baselineGap: +Math.abs(v.getBoundingClientRect().bottom - u.getBoundingClientRect().bottom).toFixed(2),
      }
    },
    expect: (m) => (m.unitFs < m.valueFs * 0.75 && m.unitWeight < m.valueWeight && m.baselineGap < 4)
      || `значение ${m.valueFs}px/${m.valueWeight}, единица ${m.unitFs}px/${m.unitWeight}, расхождение низа ${m.baselineGap}px`,
  },
  {
    name: 'Stat: адорнмент не сдвигает значение',
    why: 'плитки стоят рядом в сетке дашборда; уехавшее вниз значение на одной из них читается как «эта плитка другая», хотя отличается только бейдж',
    html: `${[false, true].map((withAdorn, i) => `<div class="ds-stat" id="s${i}" style="width:220px">
      <div class="ds-stat__labelrow"><div class="ds-stat__label">За последний час</div>
      ${withAdorn ? '<span class="ds-stat__adornment"><span class="ds-badge ds-badge--success">новый коммит</span></span>' : ''}</div>
      <div class="ds-stat__row"><div class="ds-stat__value">12</div></div></div>`).join('')}`,
    measure: () => [0, 1].map((i) => {
      const box = document.querySelector(`#s${i}`)
      const val = box.querySelector('.ds-stat__value').getBoundingClientRect()
      const b = box.getBoundingClientRect()
      return { valueTopInBox: +(val.top - b.top).toFixed(2), height: +b.height.toFixed(2) }
    }),
    expect: (m) => (m[0].valueTopInBox === m[1].valueTopInBox && m[0].height === m[1].height)
      || `без бейджа значение на ${m[0].valueTopInBox}, высота ${m[0].height}; с бейджем ${m[1].valueTopInBox} и ${m[1].height}`,
  },
  {
    name: 'Tabs: значок занимает место, а не лежит поверх подписи',
    why: 'первая версия гасила высоту значка приёмом от `Stat` — там он нужен, здесь нет: у вкладки высота фиксированная. Гашение делало коробку значка нулевой, и он налезал бы на текст; проверка «все вкладки одной высоты» этого не видела вовсе, потому что `.ds-tabs` — флекс-ряд и высоты равны всегда',
    html: `<div class="ds-tabs"><button class="ds-tabs__tab is-active" id="t"><span class=\"ds-tabs__icon\" aria-hidden=\"true\"><svg width=\"14\" height=\"14\" viewBox=\"0 0 14 14\"><circle cx=\"7\" cy=\"7\" r=\"6\" fill=\"currentColor\"/></svg></span>Задачи<span class="ds-tabs__count">42</span></button></div>`,
    measure: () => {
      const tab = document.querySelector('#t')
      const ico = tab.querySelector('.ds-tabs__icon').getBoundingClientRect()
      // Подпись — голый текстовый узел; его коробку даёт Range.
      const text = [...tab.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
      const r = document.createRange(); r.selectNode(text)
      const label = r.getBoundingClientRect()
      return {
        iconW: +ico.width.toFixed(2), iconH: +ico.height.toFixed(2),
        iconRight: +ico.right.toFixed(2), labelLeft: +label.left.toFixed(2),
      }
    },
    expect: (m) => (m.iconW > 0 && m.iconH > 0 && m.iconRight <= m.labelLeft)
      || `значок ${m.iconW}x${m.iconH}, его правый край ${m.iconRight}, подпись начинается на ${m.labelLeft}`,
  },
  {
    name: 'Pagination: полоса подвала не жмёт контролы к краям',
    why: 'без собственного паддинга полоса садилась вплотную к последней строке таблицы и к краям карточки — потребитель прочитал её как обрезок, а не как подвал; высота полосы равнялась высоте селектора',
    html: `<div style="width:700px"><nav class="ds-pager ds-pager--bar" id="pb">
      <div class="ds-pager__size"><span class="ds-pager__sizelabel">На странице</span><select class="ds-pager__select"><option>8</option></select></div>
      <span class="ds-pager__range">1–8 из 59</span>
      <div class="ds-pager__nav"><button class="ds-pager__btn">‹</button><button class="ds-pager__btn">›</button></div>
      </nav></div>`,
    measure: () => {
      const bar = document.querySelector('#pb')
      const r = bar.getBoundingClientRect()
      const sel = bar.querySelector('.ds-pager__select').getBoundingClientRect()
      const nav = bar.querySelector('.ds-pager__nav').getBoundingClientRect()
      return {
        top: +(sel.top - r.top).toFixed(2),
        bottom: +(r.bottom - sel.bottom).toFixed(2),
        left: +(bar.querySelector('.ds-pager__sizelabel').getBoundingClientRect().left - r.left).toFixed(2),
        right: +(r.right - nav.right).toFixed(2),
      }
    },
    expect: (m) => (m.top >= 6 && m.bottom >= 6 && m.left >= 6 && m.right >= 6)
      || `отступы полосы: сверху ${m.top}, снизу ${m.bottom}, слева ${m.left}, справа ${m.right}`,
  },
  {
    name: 'Pagination: под таблицей стык не даёт двойной линии',
    why: 'у таблицы своя нижняя рамка; собственная рамка полосы легла бы вплотную и дала линию в два пикселя из двух разных токенов — тяжелее любой линии внутри таблицы',
    html: `<div style="width:700px">
      <div class="ds-table-wrap" id="tw"><table class="ds-table">
        <thead><tr><th>Ветка</th></tr></thead><tbody><tr><td class="ds-table__lead">main</td></tr></tbody></table></div>
      <nav class="ds-pager ds-pager--bar" id="pbar"><div class="ds-pager__size"></div>
        <span class="ds-pager__range">1–8 из 59</span>
        <div class="ds-pager__nav"><button class="ds-pager__btn">›</button></div></nav>
      </div>
      <div style="width:700px;margin-top:40px"><nav class="ds-pager ds-pager--bar" id="palone">
        <div class="ds-pager__size"></div><span class="ds-pager__range">1–8 из 59</span>
        <div class="ds-pager__nav"><button class="ds-pager__btn">›</button></div></nav></div>`,
    measure: () => ({
      подТаблицей: getComputedStyle(document.querySelector('#pbar')).borderTopWidth,
      самостоятельно: getComputedStyle(document.querySelector('#palone')).borderTopWidth,
      зазор: +(document.querySelector('#pbar').getBoundingClientRect().top
        - document.querySelector('#tw').getBoundingClientRect().bottom).toFixed(2),
    }),
    expect: (m) => (m.подТаблицей === '0px' && m.самостоятельно !== '0px' && m.зазор === 0)
      || `под таблицей рамка ${m.подТаблицей}, отдельно ${m.самостоятельно}, зазор ${m.зазор}`,
  },
  {
    name: 'Tabs: активная вкладка размыкает линию в тело, неактивная — нет',
    why: 'до панели полоса красила поверх собственной линии фоном КАЖДОЙ вкладки, и с телом неактивные выглядели бы такими же открытыми, как активная — вместо виджета получалась бы полоса прямоугольников над коробкой',
    html: `<div style="width:600px">
      <div class="ds-tabs" data-position="top" id="tp-strip">
        <div class="ds-tabs__list" role="tablist" id="tp-list">
          <div class="ds-tabs__item"><button class="ds-tabs__tab is-active" id="tp-act">Ветки</button></div>
          <div class="ds-tabs__item"><button class="ds-tabs__tab" id="tp-ina">Языки</button></div>
        </div>
      </div>
      <div class="ds-tabs__panel" id="tp-panel">тело</div></div>`,
    measure: () => {
      const cs = (id) => getComputedStyle(document.querySelector(`#${id}`))
      const g = (id) => document.querySelector(`#${id}`).getBoundingClientRect()
      return {
        active: cs('tp-act').borderBottomColor,
        inactive: cs('tp-ina').borderBottomColor,
        panelBg: cs('tp-panel').backgroundColor,
        // Линию-полосу несёт список (`.ds-tabs__list`) — внутренней тенью по
        // кромке padding-box, а не границей: тень лежит внутри области обрезки,
        // поэтому у прокручиваемой полосы активная вкладка тоже её размыкает.
        stripLine: cs('tp-list').boxShadow,
        gap: +(g('tp-panel').top - g('tp-strip').bottom).toFixed(2),
        panelTopBorder: cs('tp-panel').borderTopWidth,
      }
    },
    expect: (m) => (m.active === m.panelBg && m.stripLine.includes('inset')
      && m.stripLine.includes(m.inactive) && m.active !== m.inactive
      && m.gap === 0 && m.panelTopBorder === '0px')
      || `активная ${m.active}, неактивная ${m.inactive}, фон панели ${m.panelBg}, линия полосы ${m.stripLine}, зазор ${m.gap}, верх панели ${m.panelTopBorder}`,
  },
  {
    name: 'Tabs: вкладка не вылезает за content-box списка',
    why: 'линию раньше несла ГРАНИЦА списка — она снаружи content-box, и вкладке приходилось доставать до неё сдвигом отрисовки (`top: 1px`), то есть жить свесом наружу. Свес давал два дефекта. Первый: у прокручиваемой полосы (`overflow="scroll"` → `overflow: auto`) свес обрезался областью прокрутки, и активная вкладка не могла разомкнуть линию — шов оставался закрытым поперёк её устья. Второй: сдвиг задан в CSS-px, а ширина границы округляется до целого device-px, и при дробном devicePixelRatio (125% масштаб системы) кромка вкладки и линия садились на разные ряды пикселей — под вкладками линия шла на ряд выше, чем в пустом хвосте, что и читалось как «неактивная вкладка перекрыла линию на 2px». Замеряется именно свес, а не сами пиксели: эмуляция дробного dpr в headless округления не воспроизводит, а свес — воспроизводит, и он первопричина обоих',
    html: `<div style="width:600px">
      <div class="ds-tabs" data-position="top">
        <div class="ds-tabs__list" role="tablist" id="sp-list">
          <div class="ds-tabs__item"><button class="ds-tabs__tab is-active" id="sp-act">Ветки</button></div>
          <div class="ds-tabs__item"><button class="ds-tabs__tab" id="sp-ina">Языки</button></div>
        </div>
      </div>
      <div class="ds-tabs" data-position="top">
        <div class="ds-tabs__list is-scrollable" role="tablist" id="sc-list">
          <div class="ds-tabs__item"><button class="ds-tabs__tab is-active" id="sc-act">Ветки</button></div>
          <div class="ds-tabs__item"><button class="ds-tabs__tab" id="sc-ina">Языки</button></div>
        </div>
      </div></div>`,
    measure: () => {
      const el = (id) => document.querySelector(`#${id}`)
      // Свес наружу виден как разница прокручиваемой и видимой высоты списка:
      // ровно ту часть и срезает `overflow: auto` у вытесняющей полосы.
      const свес = (id) => el(id).scrollHeight - el(id).clientHeight
      return {
        обычная: свес('sp-list'),
        прокручиваемая: свес('sc-list'),
        обрезка: getComputedStyle(el('sc-list')).overflow,
        // Линия должна лежать внутри области обрезки — то есть быть тенью, а не границей.
        линия: getComputedStyle(el('sp-list')).boxShadow,
        нижняяГраницаСписка: getComputedStyle(el('sp-list')).borderBottomWidth,
      }
    },
    expect: (m) => (m.обычная === 0 && m.прокручиваемая === 0 && m.обрезка === 'auto'
      && m.линия.includes('inset') && m.нижняяГраницаСписка === '0px')
      || `свес обычной ${m.обычная}px, прокручиваемой ${m.прокручиваемая}px (обрезка ${m.обрезка}); `
        + `линия ${m.линия}, нижняя граница списка ${m.нижняяГраницаСписка}`,
  },
  {
    name: 'Tabs: полоса-шов тянется на всю ширину виджета, а не до последней вкладки',
    why: 'линию несёт список (.ds-tabs__list); без flex:1 его граница обрывалась на последней вкладке, а панель под ним шла на всю ширину — шов не доходил до края, и невытесняющий framed читался сломанным. Overflow-случай маскировал баг: там список и так flex:1',
    html: `<div style="width:600px" id="fw-wrap">
      <div class="ds-tabs" data-position="top">
        <div class="ds-tabs__list" role="tablist" id="fw-list">
          <div class="ds-tabs__item"><button class="ds-tabs__tab is-active">А</button></div>
          <div class="ds-tabs__item"><button class="ds-tabs__tab">Б</button></div>
        </div>
      </div>
      <div class="ds-tabs__panel" id="fw-panel">тело</div></div>`,
    measure: () => {
      const w = (id) => Math.round(document.querySelector(`#${id}`).getBoundingClientRect().width)
      return { list: w('fw-list'), panel: w('fw-panel') }
    },
    expect: (m) => m.list >= m.panel * 0.98
      || `список ${m.list}, панель ${m.panel} — полоса обрывается, не доходит до края`,
  },
  {
    name: 'Tabs: виджет скруглён сверху и снизу одинаково',
    why: 'панель была единственным обрамлённым блоком системы с прямыми углами — у Card, DataTable, Alert, Pagination и CodeBlock радиус есть; рядом с ними виджет читался недоделанным',
    html: `<div style="width:400px">
      <div class="ds-tabs"><button class="ds-tabs__tab is-active" id="rt">Ветки</button></div>
      <div class="ds-tabs__panel" id="rp">тело</div></div>`,
    measure: () => {
      const tab = getComputedStyle(document.querySelector('#rt'))
      const panel = getComputedStyle(document.querySelector('#rp'))
      return {
        вкладкаСверху: tab.borderTopLeftRadius,
        панельСнизу: panel.borderBottomLeftRadius,
        панельСверху: panel.borderTopLeftRadius,
      }
    },
    expect: (m) => (m.панельСнизу === m.вкладкаСверху && parseFloat(m.панельСнизу) > 0
      && m.панельСверху === '0px')
      || `вкладка сверху ${m.вкладкаСверху}, панель снизу ${m.панельСнизу}, панель сверху ${m.панельСверху}`,
  },
  {
    name: 'Tabs: тело без паддинга отдаёт содержимому всю ширину',
    why: 'у `DataTable` строки идут от границы до границы и несут свои разделители — внутренний отступ панели дал бы им второй, а график без отступа прилип бы к рамке',
    html: `<div style="width:600px">
      <div class="ds-tabs__panel" id="tp-pad"><div id="tp-c1">x</div></div>
      <div class="ds-tabs__panel ds-tabs__panel--flush" id="tp-flush"><div id="tp-c2">x</div></div>
      </div>`,
    measure: () => {
      const inset = (panel, child) => {
        const p = document.querySelector(`#${panel}`).getBoundingClientRect()
        const c = document.querySelector(`#${child}`).getBoundingClientRect()
        return { left: +(c.left - p.left).toFixed(2), width: +c.width.toFixed(2) }
      }
      return { withPadding: inset('tp-pad', 'tp-c1'), flush: inset('tp-flush', 'tp-c2') }
    },
    expect: (m) => (m.withPadding.left > 1 && m.flush.left <= 1 && m.flush.width > m.withPadding.width)
      || `с паддингом отступ ${m.withPadding.left} ширина ${m.withPadding.width}; без — отступ ${m.flush.left} ширина ${m.flush.width}`,
  },
  {
    name: 'DataTable: кольцо фокуса строки видно на подложке наведения и выбора, в обеих темах',
    why: 'этот случай написан ПОСЛЕ правки доступности и про то, до чего она дотянулась, а не про то, что чинила (docs/writing-checks.md). До DS-92 строка была недостижима с клавиатуры вовсе — фокуса в ней не было, и совпасть ему было не с чем. Дав кнопку, шов создал новое состояние на объекте, у которого уже есть два своих фона: наведение (--ds-table-hover) и выбор (--ds-table-selected). Кольцо, неотличимое на них, означало бы, что клавиатура доехала и молчит: разметка на месте, фокус ловится, а показать его нечем. Порог 3 — нетекстовый контраст, как у кольца в хроме верстака. Проверяются ОБА фона, а не только обычный: кнопка чаще всего оказывается ровно на текущей строке, то есть на выбранной',
    focusVsHover: ['#rb-light', '#rb-dark'],
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px">
      <div class="ds-table-wrap"><table class="ds-table">
      <thead><tr><th scope="col">Водитель</th><th scope="col">Сумма</th></tr></thead>
      <tbody>
        <tr class="is-clickable"><th scope="row" class="ds-table__lead ds-table__rowhead"><button type="button" class="ds-table__rowbtn" id="rb-${t}">Иванов И. И.</button></th><td>12 400,00</td></tr>
        <tr class="is-clickable is-selected" aria-current="true"><th scope="row" class="ds-table__lead ds-table__rowhead">Петров П. П.</th><td>8 150,50</td></tr>
      </tbody>
      </table></div>
      <span id="probe-hover-${t}" style="background:var(--ds-table-hover)"></span>
      <span id="probe-sel-${t}" style="background:var(--ds-table-selected)"></span>
    </div>`).join(''),
    // Пробники, а не чтение custom property: `getPropertyValue` отдаёт токен
    // как записан (`#F0F7F7`), а вся арифметика контраста ниже разбирает
    // `rgb(...)`. Пробник заставляет браузер посчитать цвет так же, как он
    // считает его строке.
    measure: () => {
      const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor
      const out = {}
      for (const t of ['light', 'dark']) out[t] = { hover: bg(`#probe-hover-${t}`), selected: bg(`#probe-sel-${t}`) }
      return { fills: out }
    },
    expect: (m) => {
      for (const t of ['light', 'dark']) {
        const st = m.states[`#rb-${t}`]
        if (!st.focus.focused) return `${t}: Tab привёл не на кнопку строки — замер не про фокус`
        // Три состояния сравниваются между собой, а не каждое с идеалом:
        // схлопнутые состояния проходят проверку поодиночке.
        if (st.focus.ring === st.rest.ring) return `${t}: фокус не рисует кольца (${st.rest.ring})`
        if (st.focus.ring === st.hover.ring) return `${t}: кольцо под фокусом и под курсором одинаково`
        const color = st.focus.ring.match(/rgba?\([^)]+\)/)
        if (!color) return `${t}: в кольце нет цвета: ${st.focus.ring}`
        // БЕЗ «как видно» намеренно (DS-209). Здесь сравниваются два
        // сырых значения: цвет кольца, вынутый из `box-shadow`, и заливка
        // ПРОБНИКА — отдельного `<span>`, который ничей текст не изображает.
        // Предка с `opacity` ни у того, ни у другого нет по построению, а
        // собственной альфы у `--ds-focus-ring` нет по значению
        // (`0 0 0 2px var(--ds-accent)`). Складывать тут нечего.
        for (const [what, fill] of Object.entries(m.fills[t])) {
          const k = contrastOf(color[0], fill)
          if (k < 3) return `${t}: кольцо ${color[0]} на подложке «${what}» ${fill} даёт ${k.toFixed(2)} при нужных 3`
        }
      }
      return true
    },
  },
  {
    name: 'DataTable: зебру видно на фоне таблицы в обеих темах',
    why: 'зебра существует, чтобы глаз не соскальзывал на соседнюю строку; полоса ниже порога различения выглядит как реализованная функция — разметка на месте, цвет задан, проверка «зебра есть» проходит — и не делает своей работы. Так и было: ΔE 1.73 в светлой и 1.95 в тёмной, потребитель не различал две соседние строки глазами',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px">
      <div class="ds-table-wrap"><table class="ds-table" id="z-${t}">
      <thead><tr><th>Дата</th></tr></thead>
      <tbody><tr><td class="ds-table__lead">1</td></tr><tr><td class="ds-table__lead">2</td></tr></tbody>
      </table></div></div>`).join(''),
    measure: () => {
      // ΔE (CIE76): расстояние в Lab, а не разность каналов. Порог различения
      // соседних заливок ≈2.3 — ниже него человек два цвета рядом не разделяет.
      const lab = (css) => {
        const [r0, g0, b0] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const f = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        const [r, g, b] = [f(r0), f(g0), f(b0)]
        const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
        const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
        const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
        const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
        const [x, y, z] = [k(X), k(Y), k(Z)]
        return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
      }
      const dE = (a, b) => {
        const [la, lb] = [lab(a), lab(b)]
        return +Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]).toFixed(2)
      }
      const read = (t) => {
        const table = document.querySelector(`#z-${t}`)
        const even = document.querySelector(`#z-${t} tbody tr:nth-child(even)`)
        // Нечётная строка прозрачна и показывает фон таблицы — сравнивать надо
        // с ним, а не с фоном страницы: на этом потребитель и ошибся, получив
        // 5.9 там, где на самом деле 1.95.
        const surface = getComputedStyle(table).backgroundColor
        const zebra = getComputedStyle(even).backgroundColor
        const grid = getComputedStyle(table.querySelector('td')).borderBottomColor
        return { zebra, surface, dE: dE(zebra, surface), dEgrid: dE(zebra, grid) }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => {
      const bad = ['light', 'dark'].filter((t) => m[t].dE < 2.3)
      // Полоса не должна подходить к линии сетки: иначе она её съедает, и
      // разделители перестают читаться.
      const eaten = ['light', 'dark'].filter((t) => m[t].dEgrid < 2.3)
      return (bad.length === 0 && eaten.length === 0)
        || (bad.length
          ? `ниже порога различения: ${bad.map((t) => `${t} ΔE ${m[t].dE} (${m[t].zebra} на ${m[t].surface})`).join(', ')}`
          : `полоса съедает линию сетки: ${eaten.map((t) => `${t} ΔE ${m[t].dEgrid}`).join(', ')}`)
    },
  },
  {
    name: 'LogViewer: подсветку видно на фоне строки в обеих темах',
    why: 'залитый фон проходит проверку «класс доехал» и может не отличаться глазами — урок рельса Timeline',
    html: ['light', 'dark'].map((t) => `<div ${t === 'dark' ? 'data-theme="dark"' : ''}>
      <div class="ds-log" style="height:120px"><div class="ds-log__scroll">
        <div class="ds-log__line"><span class="ds-log__toggle ds-log__toggle--empty"></span>
          <time class="ds-log__time">12:00:00</time><span class="ds-log__kind ds-log__kind--info">Вид</span>
          <span class="ds-log__text" style="--ds-log-clamp:3">до <mark class="ds-log__hit" id="hit-${t}">найдено</mark> после</span></div>
      </div></div></div>`).join(''),
    measure: () => {
      const lum = (css) => {
        const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const read = (t) => {
        const hit = document.querySelector(`#hit-${t}`)
        const bg = getComputedStyle(hit).backgroundColor
        const back = getComputedStyle(hit.closest('.ds-log')).backgroundColor
        return { bg, back, ratio: +ratio(lum(bg), lum(back)).toFixed(3) }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => (m.light.ratio >= 1.4 && m.dark.ratio >= 1.4)
      || `светлая ${m.light.bg} на ${m.light.back} = ${m.light.ratio}, `
        + `тёмная ${m.dark.bg} на ${m.dark.back} = ${m.dark.ratio}`,
  },
  {
    name: 'Тостер: новое сообщение не двигает то, что уже читают',
    why: 'у нижних положений стопка росла ВВЕРХ от прибитого края и уносила первый тост на 47px с каждым новым (454 → 407 → 359 на `case=live`). Тост исчезает сам, и читают его в тот единственный момент, когда он на экране; уехавшая строка читается заново. Лечение — `column-reverse` у `bottom-*`: новая карточка встаёт СВЕРХУ стопки, показанные остаются у угла. DOM-порядок прежний — живая область объявляет в порядке появления. Замер ведёт не rect карточки, а top контейнера плюс offsetTop: карточка въезжает `translateY`-анимацией, и rect в первые 180 мс врёт — DS-162',
    html: '',
    measure: () => {
      const out = {}
      for (const pos of ['bottom-right', 'bottom-left', 'bottom-center', 'top-right', 'top-left', 'top-center']) {
        const box = document.createElement('div')
        box.className = `ds-toaster ds-toaster--${pos}`
        document.body.appendChild(box)
        const tops = []
        const heights = []
        for (let i = 1; i <= 3; i++) {
          const t = document.createElement('div')
          t.className = 'ds-toast'
          t.id = `${pos}-${i}`
          t.textContent = `Сообщение ${i}`
          box.appendChild(t)
          const first = box.firstElementChild
          tops.push(Math.round(box.getBoundingClientRect().top + first.offsetTop))
          heights.push(Math.round(box.getBoundingClientRect().height))
        }
        out[pos] = { tops, heights, order: [...box.children].map((c) => c.id.split('-').pop()) }
        box.remove()
      }
      return out
    },
    expect: (m) => {
      const bad = []
      for (const [pos, r] of Object.entries(m)) {
        // Стопка обязана расти: без этого «top не изменился» держалось бы и на
        // тостах, которые не отрисовались вовсе.
        if (!(r.heights[2] > r.heights[0])) bad.push(`${pos}: стопка не растёт (${r.heights.join(' → ')})`)
        // Допуск 1px — субпиксель, а не дефект: строка «тост плюс зазор» 41.5px,
        // и округление уводит top на единицу туда-обратно (648 → 649 → 648).
        // Дефект — 47px за шаг, и с допуском он различим на два порядка.
        if (Math.max(...r.tops) - Math.min(...r.tops) > 1) bad.push(`${pos}: top первого тоста ${r.tops.join(' → ')}`)
        if (r.order.join('') !== '123') bad.push(`${pos}: DOM-порядок ${r.order.join('')}`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'DropdownMenu/Popover: панель растёт под содержимое, а не переносит его в строку фиксированной высоты',
    why: 'у `.ds-dropdown__menu` и `.ds-popover__panel` была одна `min-width`, а как абсолютный блок панель ужималась по содержащему блоку — по кебабу 28px — и выходила ВСЕГДА ровно 180px (207 на 1.15): «Отменить проведение» ломалось на две строки в пункте фиксированной высоты (clientHeight 28 при scrollHeight 30), текст подходил вплотную к разделителю; поповер переносил абзац при объявленном у содержимого `max-width: 20rem`. Лечение — `width: max-content` с потолком и `min-height` у пункта. Что нельзя потерять: `*-end` считает правый край от якоря, растущая панель обязана ехать ВЛЕВО, и оба направления переворота обязаны остаться на месте — DS-159',
    width: 900,
    html: ['1', '1.15', '1.5'].map((sc) => {
      const id = sc.replace('.', '_')
      const items = (labels) => labels.map((l, i) =>
        `<button class="ds-dropdown__item" role="menuitem" id="${id}-i${i}"><span class="ds-dropdown__item-icon" aria-hidden="true"></span><span class="ds-dropdown__item-label">${l}</span></button>`).join('')
      const menu = (mid, align, up, labels, pos) => `
        <span class="ds-dropdown" style="position:absolute; ${pos}">
          <button class="ds-dropdown__kebab" id="${mid}-t">⋯</button>
          <div class="ds-dropdown__menu ds-dropdown__menu--${align}${up ? ' ds-dropdown__menu--up' : ''}" role="menu" id="${mid}">${items(labels)}</div>
        </span>`
      const LONG = ['Открыть', 'Отменить проведение', 'Отправить на согласование']
      const HUGE = ['Открыть', 'Отменить проведение и вернуть документ в статус черновика с пересчётом остатков по всем складам']
      return `
      <div class="ds-scale" style="--ds-ui-scale: ${sc}; position: relative; height: 320px">
        <span class="probe-floor" style="position:absolute; width: calc(11.25rem * var(--ds-ui-scale))"></span>
        <span class="probe-max" style="position:absolute; width: calc(20rem * var(--ds-ui-scale))"></span>
        ${menu(`long-${id}`, 'start', false, LONG, 'left:0; top:0')}
        ${menu(`short-${id}`, 'start', false, ['Открыть', 'Удалить'], 'left:0; top:160px')}
        ${menu(`end-${id}`, 'end', false, LONG, 'right:40px; top:0')}
        ${menu(`endup-${id}`, 'end', true, LONG, 'right:40px; top:200px')}
        ${menu(`startup-${id}`, 'start', true, LONG, 'left:0; top:280px')}
        ${menu(`huge-${id}`, 'start', false, HUGE, 'left:300px; top:0')}
        <span class="ds-popover" style="position:absolute; left:300px; top:200px">
          <button class="ds-btn" id="pop-${id}-t">Что случилось</button>
          <div class="ds-popover__panel ds-popover__panel--bottom-start" id="pop-${id}">
            <div style="max-width: 20rem" id="pop-${id}-p">Проведение отменено: документ возвращён в статус черновика, движения по регистрам сторнированы, остатки пересчитаны по всем складам организации</div>
          </div>
        </span>
      </div>`
    }).join(''),
    measure: () => {
      const r = (el) => el.getBoundingClientRect()
      const out = {}
      for (const sc of ['1', '1.15', '1.5']) {
        const id = sc.replace('.', '_')
        const box = document.getElementById(`long-${id}`).closest('.ds-scale')
        const floor = r(box.querySelector('.probe-floor')).width
        const max = r(box.querySelector('.probe-max')).width
        const m = (k) => document.getElementById(`${k}-${id}`)
        const t = (k) => document.getElementById(`${k}-${id}-t`)
        const item = (k, i) => document.getElementById(`${id}-i${i}`) // items are per-scale ids, first menu of the box
        // «Отменить проведение» в меню long: второй пункт первого меню этого блока.
        const longItems = m('long').querySelectorAll('.ds-dropdown__item')
        const oneLine = r(longItems[0].querySelector('.ds-dropdown__item-label')).height
        const cancel = longItems[1]
        const hugeItem = m('huge').querySelectorAll('.ds-dropdown__item')[1]
        const p = document.getElementById(`pop-${id}-p`)
        out[sc] = {
          floor: +floor.toFixed(1), max: +max.toFixed(1),
          long: +r(m('long')).width.toFixed(1),
          cancelLines: +(r(cancel.querySelector('.ds-dropdown__item-label')).height / oneLine).toFixed(2),
          cancelClip: cancel.scrollHeight - cancel.clientHeight,
          short: +r(m('short')).width.toFixed(1),
          endRight: +(r(m('end')).right - r(t('end')).right).toFixed(1),
          endBelow: +(r(m('end')).top - r(t('end')).bottom).toFixed(1),
          endupRight: +(r(m('endup')).right - r(t('endup')).right).toFixed(1),
          endupAbove: +(r(t('endup')).top - r(m('endup')).bottom).toFixed(1),
          startLeft: +(r(m('long')).left - r(t('long')).left).toFixed(1),
          startupLeft: +(r(m('startup')).left - r(t('startup')).left).toFixed(1),
          startupAbove: +(r(t('startup')).top - r(m('startup')).bottom).toFixed(1),
          huge: +r(m('huge')).width.toFixed(1),
          hugeLines: +(r(hugeItem.querySelector('.ds-dropdown__item-label')).height / oneLine).toFixed(2),
          hugeClip: hugeItem.scrollHeight - hugeItem.clientHeight,
          pop: +r(m('pop')).width.toFixed(1),
          popOverflow: p.scrollWidth - p.clientWidth,
        }
      }
      return out
    },
    expect: (m) => {
      const bad = []
      for (const [sc, v] of Object.entries(m)) {
        const at = (msg) => bad.push(`×${sc}: ${msg}`)
        if (!(v.long > v.floor + 1)) at(`long-меню ${v.long} не шире пола ${v.floor} — ширина не следует за содержимым`)
        if (v.cancelLines > 1.2) at(`«Отменить проведение» в ${v.cancelLines} строки`)
        if (v.cancelClip > 0) at(`пункт режет текст по высоте на ${v.cancelClip}px`)
        if (Math.abs(v.short - v.floor) > 1) at(`короткое меню ${v.short} ушло от пола ${v.floor} — растёт без нужды`)
        if (Math.abs(v.endRight) > 0.6) at(`align=end: правый край меню от правого края кебаба на ${v.endRight}px`)
        if (!(v.endBelow > 0)) at(`align=end вниз: меню не под якорем (${v.endBelow})`)
        if (Math.abs(v.endupRight) > 0.6) at(`align=end вверх: правый край от якоря на ${v.endupRight}px`)
        if (!(v.endupAbove > 0)) at(`align=end вверх: меню не над якорем (${v.endupAbove})`)
        if (Math.abs(v.startLeft) > 0.6) at(`align=start: левый край от якоря на ${v.startLeft}px`)
        if (Math.abs(v.startupLeft) > 0.6) at(`align=start вверх: левый край от якоря на ${v.startupLeft}px`)
        if (!(v.startupAbove > 0)) at(`align=start вверх: меню не над якорем (${v.startupAbove})`)
        if (v.huge > v.max + 1) at(`меню с длиннейшим пунктом ${v.huge} шире потолка ${v.max}`)
        if (!(v.hugeLines > 1.5)) at(`длиннейший пункт не перенёсся (${v.hugeLines} строки) — потолка нет или текст ушёл за край`)
        if (v.hugeClip > 0) at(`перенесённый пункт обрезан по высоте на ${v.hugeClip}px — height вместо min-height`)
        if (!(v.pop > v.floor + 1)) at(`поповер ${v.pop} не шире пола ${v.floor}`)
        if (v.pop > v.max + 1) at(`поповер ${v.pop} шире потолка ${v.max}`)
        if (v.popOverflow > 0) at(`абзац поповера вылезает на ${v.popOverflow}px — перенос поперёк слова`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Слои: тост виден поверх подложки модалки',
    why: '«не удалось сохранить» тонуло под подложкой: toast 200 < modal 1000 — DS-1',
    html: `
      <div class="ds-modal__overlay"><div class="ds-modal" role="dialog"><div class="ds-modal__body">тело</div></div></div>
      <div class="ds-toaster ds-toaster--top-right"><div class="ds-toast" id="toast">не удалось сохранить</div></div>`,
    measure: () => {
      const t = document.querySelector('#toast').getBoundingClientRect()
      const el = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2)
      return { hit: el.className || el.tagName, inside: !!el.closest('.ds-toaster') }
    },
    expect: (m) => m.inside || `в точке тоста ${m.hit}`,
  },
  {
    name: 'Кольцо фокуса: невалидное поле расходится со здоровым цветом, а не толщиной',
    why: 'кольцо ошибки было литералом в четырёх полях — правка --ds-focus-ring прошла бы мимо них, и невалидное поле осталось бы с прежним. Текстовый гард видит имя токена, но не то, что var(--ds-focus-ring-error) вообще во что-то разрешился: опечатка в имени даёт box-shadow: none и зелёные тесты — DS-10',
    html: `
      <input class="ds-input" id="ok" value="Ромашка ООО">
      <input class="ds-input is-error" id="bad" value="Ромашка ООО">
      <span id="probe-accent" style="color: var(--ds-accent)"></span>
      <span id="probe-error" style="color: var(--ds-error)"></span>`,
    // Кольцо приезжает переходом .12s, и getComputedStyle сразу после Tab читает
    // его на полпути: `rgba(14,124,124,0.467) … 0.935309px` — цвет уже почти
    // верный, а толщина ещё нет. Замер должен спрашивать про конечное состояние,
    // а не про кадр анимации, поэтому переход здесь выключен.
    extraCss: '.ds-input { transition: none }',
    focusRings: ['#ok', '#bad'],
    measure: () => {
      const color = (sel) => getComputedStyle(document.querySelector(sel)).color
      return { accent: color('#probe-accent'), error: color('#probe-error') }
    },
    expect: (m) => {
      const ok = m.rings['#ok'], bad = m.rings['#bad']
      // Chromium сериализует тень как «<цвет> <смещения> [inset]».
      const geometry = (s) => s.replace(/^rgba?\([^)]*\)/, '').trim()
      const paint = (s) => s.match(/^rgba?\([^)]*\)/)?.[0] ?? 'без цвета'
      if (geometry(ok) !== geometry(bad)) return `толщина разошлась: здоровое ${ok}, невалидное ${bad}`
      // Соседи с заведомо известным значением: если врёт не система, а замер,
      // это видно здесь — здоровое кольцо обязано быть акцентным.
      if (paint(ok) !== m.accent) return `здоровое кольцо не акцентное: ${ok} при --ds-accent ${m.accent}`
      if (paint(bad) !== m.error) return `кольцо ошибки не цвета ошибки: ${bad} при --ds-error ${m.error}`
      return true
    },
  },
  {
    name: 'Поверхность поля: восемь элементов системы рисуются одинаково',
    why: 'десять деклараций стояли копиями в восьми листах, три копии были усечены. Гейт по тексту видит, что декларация есть, но не какое правило выиграло: у потребителя со сборщиком порядок CSS задаётся порядком импортов в JS — DS-11',
    html: `
      <input class="ds-input" id="f-input" value="Ромашка">
      <textarea class="ds-textarea" id="f-textarea">Ромашка</textarea>
      <select class="ds-select" id="f-select"><option>Ромашка</option></select>
      <select class="ds-pager__select" id="f-pager"><option>20</option></select>
      <input class="ds-searchbar__input" id="f-search" type="search">
      <button class="ds-combobox__trigger" id="f-combo">Ромашка</button>
      <input class="ds-code__cell" id="f-code" value="7">
      <div class="ds-numfield__control" id="f-num"><input class="ds-numfield__input" value="1"></div>
      <button class="ds-btn ds-btn--primary" id="not-a-field">Сохранить</button>
      <span id="probe-surface" style="background: var(--ds-surface)"></span>
      <span id="probe-border" style="background: var(--ds-control-border)"></span>`,
    measure: () => {
      const surface = (sel) => {
        const s = getComputedStyle(document.querySelector(sel))
        return [s.backgroundColor, s.borderTopWidth, s.borderTopStyle, s.borderTopColor, s.borderTopLeftRadius].join(' ')
      }
      const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor
      const ids = ['#f-input', '#f-textarea', '#f-select', '#f-pager', '#f-search', '#f-combo', '#f-code', '#f-num']
      return {
        fields: Object.fromEntries(ids.map((i) => [i, surface(i)])),
        tokenSurface: bg('#probe-surface'),
        tokenBorder: bg('#probe-border'),
        button: bg('#not-a-field'),
      }
    },
    expect: (m) => {
      const values = Object.values(m.fields)
      const uniq = [...new Set(values)]
      if (uniq.length !== 1) {
        const odd = Object.entries(m.fields).filter(([, v]) => v !== uniq[0])
        return `поверхности разошлись: ${odd.map(([k, v]) => `${k} → ${v}`).join('; ')} против ${uniq[0]}`
      }
      // Соседи с заведомо известным значением. Первый — токены: если бы замер
      // читал не то (или лист не доехал), совпадение восьми пустых значений
      // было бы таким же зелёным. Второй — кнопка: она обязана НЕ совпасть,
      // иначе инструмент возвращает одно и то же на любой вопрос.
      if (!uniq[0].includes(m.tokenSurface)) return `фон полей ${uniq[0]} мимо --ds-surface ${m.tokenSurface}`
      if (!uniq[0].includes(m.tokenBorder)) return `рамка полей ${uniq[0]} мимо --ds-control-border ${m.tokenBorder}`
      if (m.button === m.tokenSurface) return `контрольная кнопка того же фона, что поле (${m.button}) — замер не различает элементы`
      return true
    },
  },
  {
    name: 'Выключенное поле выглядит выключенным — все пять, а не только TextField',
    why: 'у Select, SearchBar и Combobox не было правила :disabled вовсе: выключенный селект рисовался фоном живого. Проп проходил насквозь через SelectHTMLAttributes, атрибут в DOM стоял — и не значил ничего — DS-11',
    html: `
      <input class="ds-input" id="d-input" value="Ромашка" disabled>
      <input class="ds-input" id="l-input" value="Ромашка">
      <select class="ds-select" id="d-select" disabled><option>Ромашка</option></select>
      <select class="ds-select" id="l-select"><option>Ромашка</option></select>
      <input class="ds-searchbar__input" id="d-search" type="search" disabled>
      <span id="probe-subtle" style="background: var(--ds-surface-subtle)"></span>
      <span id="probe-surface" style="background: var(--ds-surface)"></span>`,
    measure: () => {
      const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor
      return {
        dInput: bg('#d-input'), lInput: bg('#l-input'),
        dSelect: bg('#d-select'), lSelect: bg('#l-select'),
        dSearch: bg('#d-search'),
        subtle: bg('#probe-subtle'), surface: bg('#probe-surface'),
      }
    },
    expect: (m) => {
      // Сосед с заведомо известным значением: живой селект обязан остаться на
      // --ds-surface. Если и он уехал, врёт замер, а не система.
      if (m.lSelect !== m.surface) return `живой селект не на --ds-surface: ${m.lSelect} против ${m.surface}`
      if (m.subtle === m.surface) return `--ds-surface-subtle совпал с --ds-surface (${m.subtle}) — различать нечем`
      const wrong = Object.entries({ dInput: m.dInput, dSelect: m.dSelect, dSearch: m.dSearch })
        .filter(([, v]) => v !== m.subtle)
      return wrong.length === 0
        || `выключенные не приглушены: ${wrong.map(([k, v]) => `${k} → ${v}`).join('; ')} при --ds-surface-subtle ${m.subtle}`
    },
  },
  {
    name: 'Выключенное поле не подсвечивает рамку под курсором',
    why: '`.ds-select:hover` был написан без :not(:disabled) — выключенное поле под курсором обещало, что с ним можно работать. Читается только настоящим указателем: из JS :hover не выставить',
    extraCss: '.ds-select { transition: none }',
    hoverBorders: ['#l-select', '#d-select'],
    html: `
      <select class="ds-select" id="l-select"><option>Ромашка</option></select>
      <select class="ds-select" id="d-select" disabled><option>Ромашка</option></select>
      <span id="probe-accent" style="background: var(--ds-accent)"></span>
      <span id="probe-border" style="background: var(--ds-control-border)"></span>`,
    measure: () => {
      const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor
      return { accent: bg('#probe-accent'), strong: bg('#probe-border') }
    },
    expect: (m) => {
      const live = m.borders['#l-select'], dead = m.borders['#d-select']
      // Сосед с заведомо известным значением: живой селект под курсором обязан
      // стать акцентным. Не стал — значит указатель не доехал, и вывод про
      // выключенный ничего не стоит.
      if (live !== m.accent) return `живой селект под курсором не акцентный: ${live} при --ds-accent ${m.accent}`
      return dead === m.strong || `выключенный селект под курсором подсветил рамку: ${dead} при --ds-control-border ${m.strong}`
    },
  },
  {
    name: 'Слои: последний открытый попап — поверх соседней панели',
    why: 'панель Popover (60) накрывала открытый список Combobox-соседа (40); инлайновые calc — то, что выдаёт usePopupLayer — DS-1',
    html: `
      <div style="position:relative;">
        <div class="ds-combobox" style="position:absolute; top:60px; left:20px; width:240px;">
          <div class="ds-combobox__popover" id="list" style="z-index: calc(var(--ds-z-popup) + 2)"><ul class="ds-combobox__list" role="listbox">
            <li class="ds-combobox__option" role="option" aria-selected="false"><span>Ромашка ООО</span></li>
          </ul></div>
        </div>
        <div class="ds-popover" style="position:absolute; top:0; left:20px;">
          <div class="ds-popover__panel ds-popover__panel--bottom-start" style="width:240px; height:200px; z-index: calc(var(--ds-z-popup) + 1)"></div>
        </div>
      </div>`,
    measure: () => {
      const r = document.querySelector('#list').getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { hit: el.className || el.tagName, inside: !!el.closest('#list') }
    },
    expect: (m) => m.inside || `в точке списка ${m.hit}`,
  },
  {
    name: 'Слои: вложенный в панель Popover попап рисуется над ней (гард)',
    why: 'гард, не фикс: stacking context панели держит вложенный список сверху и до шкалы; ловит перепутанный порядок слоёв при переводе на токены',
    html: `
      <div class="ds-popover" style="position:absolute; top:20px; left:20px;">
        <div class="ds-popover__panel ds-popover__panel--bottom-start" style="width:260px; height:200px;">
          <div class="ds-combobox">
            <div class="ds-combobox__popover" id="nested"><ul class="ds-combobox__list" role="listbox">
              <li class="ds-combobox__option" role="option" aria-selected="false"><span>Ромашка ООО</span></li>
            </ul></div>
          </div>
          <p>текст панели под списком</p>
        </div>
      </div>`,
    measure: () => {
      const r = document.querySelector('#nested').getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { hit: el.className || el.tagName, inside: !!el.closest('#nested') }
    },
    expect: (m) => m.inside || `в точке списка ${m.hit}`,
  },
  {
    name: 'RouteBar: в шапке под полосой одна линия, отдельно — две',
    why: 'своя нижняя граница безусловна, и в шапке с собственной разделительной линией выходили две подряд — гасить было нечем, потребитель лез в .ds-routebar руками',
    // Шапка со своей разделительной линией — та самая раскладка, ради которой
    // признак и заведён. Полоса стоит в ней последней, границы встык.
    // Прежняя форма — оверрайд класса компонента у потребителя, ограниченный
    // третьим вариантом. Если признак работает, оверрайд ничего не добавляет;
    // если бы не работал, линию гасил бы по-прежнему он, и проп был бы пустым.
    extraCss: '#head-over .ds-routebar { border-bottom: none }',
    html: ['plain', 'emb', 'over'].map((k) => `
      <div style="background: var(--ds-surface); padding: 12px 0">
        <div style="border-bottom: 1px solid var(--ds-border)" id="head-${k}">
          <nav class="ds-routebar${k === 'plain' ? '' : ' ds-routebar--embedded'}">
            <ul class="ds-routebar__list"><li class="ds-routebar__item">
              <a class="ds-routebar__link is-active" href="/">Сводка</a></li></ul>
          </nav>
        </div>
      </div>`).join(''),
    measure: () => ({
      border: getComputedStyle(document.querySelector('#head-plain')).borderBottomColor,
      // Высота полосы отличается ровно на свою границу — больше ничем.
      height: ['plain', 'emb', 'over'].map((k) =>
        +document.querySelector(`#head-${k} .ds-routebar`).getBoundingClientRect().height.toFixed(2)),
    }),
    // Четыре ряда пикселей вверх от нижней кромки шапки: сколько из них
    // прокрашено цветом границы — столько линий под полосой и видно.
    pixels: () => {
      const out = {}
      for (const k of ['plain', 'emb', 'over']) {
        const r = document.querySelector(`#head-${k}`).getBoundingClientRect()
        for (let i = 1; i <= 4; i++) out[`${k}${i}`] = [r.left + r.width / 2, r.bottom - i]
      }
      return out
    },
    expect: (m) => {
      const lines = (k) => [1, 2, 3, 4].filter((i) => m.at[`${k}${i}`] === m.border).length
      const problems = []
      // Оба состояния сразу: «одна линия» без «двух» не отличает погашенную
      // границу от той, которой никогда не было.
      if (lines('plain') !== 2) problems.push(`отдельная полоса дала ${lines('plain')} линии вместо двух`)
      if (lines('emb') !== 1) problems.push(`встроенная дала ${lines('emb')} вместо одной`)
      // Прежняя форма поверх признака не меняет ничего — значит гасит признак,
      // а не оверрайд, и потребителю есть что снять у себя.
      if (lines('over') !== lines('emb')) problems.push(`с оверрайдом ${lines('over')}, без него ${lines('emb')}`)
      if (Math.abs(m.height[0] - m.height[1] - 1) > 0.1) {
        problems.push(`высота разошлась на ${(m.height[0] - m.height[1]).toFixed(2)}px вместо 1px границы`)
      }
      return problems.length === 0 || problems.join('; ')
    },
  },
  {
    name: 'RouteBar: текущий раздел помечен не только цветом',
    why: 'полосу читают в монохроме и при дальтонизме, а «где я» на странице без JS больше подсказать нечем: активного состояния тут не существует, кроме этой пометки. Цвет один — значит для части читателей пометки нет вовсе',
    html: `
      <nav class="ds-routebar">
        <ul class="ds-routebar__list">
          <li class="ds-routebar__item"><a class="ds-routebar__link" id="idle" href="#a">Счета</a></li>
          <li class="ds-routebar__item"><a class="ds-routebar__link is-active" id="cur" href="#b" aria-current="page">Долги</a></li>
        </ul>
      </nav>`,
    measure: () => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel))
      return {
        idleShadow: cs('#idle').boxShadow, curShadow: cs('#cur').boxShadow,
        idleColor: cs('#idle').color, curColor: cs('#cur').color,
      }
    },
    expect: (m) => {
      // Сосед с заведомо известным значением: цвет обязан разойтись. Не
      // разошёлся — значит лист не доехал, и вывод про тень ничего не стоит.
      if (m.idleColor === m.curColor) return `цвет не разошёлся вовсе: оба ${m.curColor} — лист не приехал`
      return m.curShadow !== m.idleShadow
        || `пометка только цветом: тень у текущего и у соседнего одна (${m.curShadow})`
    },
  },
  {
    name: 'Badge: цвет из данных потребителя читается в обеих темах на всех трёх подложках',
    why: 'сырой хекс из базы, положенный в background и в color, проходит любую проверку на классы и при этом бывает нечитаем: почти белый тег теряет подложку целиком (ΔE 0.00 от поверхности), почти чёрный на тёмной теме теряет метку. Компонент выводит из одного значения ОБА цвета, и утверждение об этом обязано быть числом — «класс доехал» здесь верно и ничего не значит. Числа снимаются с ПИКСЕЛЕЙ: подложка полупрозрачна, а метка вычисляется относительным цветом с отображением в гамму, и ни то ни другое не читается со строки computed-стиля. Подложек ТРИ, и это не полнота ради полноты: до DS-101 замер знал одну (--ds-surface), а утверждение «ни на одном из 228 хексов» читалось как 228 замеров, будучи 228 × 1. Потребитель померил на своих поверхностях и принёс 4.89 там, где мы обещали 5.2 — величина мерилась честно, промахнулась ПЛОЩАДЬ',
    html: ['light', 'dark'].map((t) => [
      // Три поверхности, на которых бейдж живёт у потребителя. Зебра здесь не
      // экзотика: `DataTable` включает её ПО УМОЛЧАНИЮ (DataTable.css, правило
      // на :nth-child(even) и на .ds-table__row--even), то есть половина тегов
      // сидит на ней, и никто её не включал. muted-строка красится
      // --ds-surface-subtle тем же файлом.
      ['surface', '--ds-surface'],
      ['subtle', '--ds-surface-subtle'],
      ['zebra', '--ds-table-zebra'],
    ].map(([s, token]) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''}
      id="host-${t}-${s}" style="background: var(${token}); padding: 6px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center">
      ${['#d97706', '#4f46e5', '#c026d3', '#f5f5f4', '#111827', '#00ff00', '#ffffff', '#000000',
         // Восьмизначные и четырёхзначные — не довесок к списку, а отдельная
         // поломка: относительный цвет наследует альфу ИСТОЧНИКА, и без `/ 1`
         // метка приезжала в половину непрозрачности (2.6:1 при полу 5.0).
         // Пока замер кормился только шестизначными, он этого не видел вовсе.
         '#c026d380', '#4f46e540', '#0891b2c0', '#c0f8',
         // Токены категориальной палитры едут тем же замером, что и хекс: со
         // строки computed-стиля их не отличить — метка вычислена относительным
         // цветом с отображением в гамму что у хекса, что у токена, а подложка
         // всегда полупрозрачна. Разница у токена одна: значение зависит от
         // ТЕМЫ и переключается вместе с ней, хекс неизменен. Отдельный стенд
         // под это не нужен — темы `light`/`dark` уже в разметке выше, и все
         // восемь токенов проходят те же две группы host.
         'var(--ds-chart-1)', 'var(--ds-chart-2)', 'var(--ds-chart-3)', 'var(--ds-chart-4)',
         'var(--ds-chart-5)', 'var(--ds-chart-6)', 'var(--ds-chart-7)', 'var(--ds-chart-8)']
        .map((c, i) => `<span class="ds-badge ds-badge--brand" id="b-${t}-${s}-${i}" style="--ds-badge-brand: ${c}">тег</span>`)
        .join('')}
      </div>`).join('')).join(''),
    measure: () => {
      // Метку с экрана не снять — её съедает сглаживание, — поэтому вычисленный
      // цвет переносится в СПЛОШНОЙ образец, и уже он читается с пикселей.
      // Подложка, наоборот, снимается с самого бейджа: она полупрозрачна, и
      // важно именно то, что получилось поверх поверхности.
      const sw = document.createElement('div')
      // Перенос, а не подгонка ширины под счёт: список хексов растёт, и любое
      // число здесь (10px, ширина ряда) снова разойдётся с ним при следующем
      // росте. Перенос этого не требует — `getBoundingClientRect()`, которым
      // читатель потом берёт точку съёма, переносу безразличен.
      sw.style.cssText = 'display:flex;flex-wrap:wrap'
      document.body.appendChild(sw)
      const add = (key, color) => {
        const d = document.createElement('div')
        d.className = 'probe'
        d.dataset.k = key
        d.style.cssText = `width:10px;height:10px;background:${color}`
        sw.appendChild(d)
      }
      const out = {
        // Санитар: без относительного цвета весь замер сравнивал бы запасное
        // правило с самим собой и был бы зелёным всегда.
        supports: CSS.supports('color', 'oklch(from red 0.5 min(c, 0.16) h)'),
        ids: [],
        surfaces: [],
      }
      for (const host of document.querySelectorAll('[id^="host-"]')) {
        const key = host.id.slice('host-'.length)
        out.surfaces.push(key)
        add(`surface-${key}`, getComputedStyle(host).backgroundColor)
        for (const b of host.querySelectorAll('.ds-badge--brand')) {
          out.ids.push(b.id)
          add(`ink-${b.id}`, getComputedStyle(b).color)
        }
      }
      // Перенос лечит переполнение ряда, но не доказывает сам себя: снимок —
      // ВЬЮПОРТ (`page.screenshot()` без `fullPage`), и точка съёма за его
      // краем тихо вернула бы чёрный пиксель — правдоподобное число вместо
      // ошибки. Поэтому здесь же снимается край каждого узла, с которого потом
      // берётся точка (`.probe` через `add()` выше, `.ds-badge--brand` — в
      // `pixels()`), и `expect` первым делом сверяет его с окном: вышло —
      // отказ, а не тихий чёрный.
      out.innerWidth = window.innerWidth
      out.innerHeight = window.innerHeight
      let maxRight = 0
      let maxBottom = 0
      for (const el of document.querySelectorAll('.probe, .ds-badge--brand')) {
        const r = el.getBoundingClientRect()
        if (r.right > maxRight) maxRight = r.right
        if (r.bottom > maxBottom) maxBottom = r.bottom
      }
      out.maxRight = maxRight
      out.maxBottom = maxBottom
      return out
    },
    pixels: () => {
      const out = {}
      for (const el of document.querySelectorAll('.probe')) {
        const r = el.getBoundingClientRect()
        out[el.dataset.k] = [r.x + 5, r.y + 5]
      }
      for (const b of document.querySelectorAll('.ds-badge--brand')) {
        const r = b.getBoundingClientRect()
        // Слева от текста, внутри рамки: там только подложка.
        out[`tint-${b.id}`] = [r.x + 3, r.y + r.height / 2]
      }
      return out
    },
    expect: (m) => {
      // Первым делом, раньше порогов контраста и сверки счётчиков: снимок —
      // ВЬЮПОРТ, и узел за его краем читался бы как чёрный пиксель — число,
      // неотличимое от настоящего провала контраста. Перенос (`flex-wrap`) у
      // `sw` и у `host-*` решает это для текущего счёта, но список хексов
      // будет расти дальше, и следующий рост обязан упасть здесь, а не молчать
      // числом.
      const overflow = []
      if (m.maxRight > m.innerWidth) {
        overflow.push(`вправо на ${(m.maxRight - m.innerWidth).toFixed(1)}px (край узла ${m.maxRight.toFixed(1)} при вьюпорте ${m.innerWidth})`)
      }
      if (m.maxBottom > m.innerHeight) {
        overflow.push(`вниз на ${(m.maxBottom - m.innerHeight).toFixed(1)}px (край узла ${m.maxBottom.toFixed(1)} при вьюпорте ${m.innerHeight})`)
      }
      if (overflow.length > 0) {
        return `узел съёма вышел за кадр: ${overflow.join('; ')} — снимок это обрезает, числа этого прогона недействительны`
      }
      if (!m.supports) return 'браузер не понял относительный цвет — замер оказался бы о запасном правиле'
      // Шесть поверхностей и 120 пар — ЛИТЕРАЛАМИ, а не длиной списка из
      // разметки. Возьми счёт оттуда — и подмена трёх подложек одной сошлась бы
      // сама с собой и осталась зелёной: ровно так дефект и прожил до
      // DS-101. Растёт список хексов — число здесь переписывается руками,
      // и это дешевле, чем счётчик, который не умеет краснеть. Было 72 при
      // двенадцати хексах, восемь токенов подняли счёт до 120 (двадцать × шесть).
      if (m.surfaces.length !== 6) {
        return `осмотрено поверхностей ${m.surfaces.length} из 6 (${m.surfaces.join(', ') || 'ни одной'})`
      }
      if (m.ids.length !== 120) return `осмотрено пар ${m.ids.length} из 120`
      // БЕЗ «как видно» намеренно (DS-209): пары `ink-*`/`tint-*` уже
      // сняты С ПИКСЕЛЕЙ снимка экрана, то есть это и есть «как видно» —
      // сильнее, чем любое сложение слоёв в node. Пропусти их через помощник —
      // и он сложил бы уже сложенное второй раз.
      const fails = []
      let worstK = { v: Infinity, id: '' }
      let worstD = { v: Infinity, id: '' }
      for (const id of m.ids) {
        const [, theme, surf] = id.split('-')
        const k = contrastOf(m.at[`ink-${id}`], m.at[`tint-${id}`])
        const d = deltaE76(m.at[`tint-${id}`], m.at[`surface-${theme}-${surf}`])
        if (k < worstK.v) worstK = { v: k, id }
        if (d < worstD.v) worstD = { v: d, id }
        // Пол 5.0, а не 4.5: тот же запас, что купил разделение тона и `-fg`
        // (tokens/badgeTintContrast.test.ts).
        if (k < 5) fails.push(`${id}: метка на подложке ${k.toFixed(2)}:1`)
        // Порог различения соседних заливок — тот же, что у зебры таблицы.
        if (d < 2.3) fails.push(`${id}: подложка ΔE ${d.toFixed(2)} от поверхности`)
      }
      // Второй ярус: не «держится ли требование», а «правда ли то, что написано
      // в Badge.css и в CHANGELOG». Требование — 5.0 и 2.3 выше; здесь стоят
      // ОБЕЩАННЫЕ минимумы, и разъедься они с замером — красным станет число в
      // документе, а не цвет. Числа снял этот же прогон, худшее ΔE — на зебре.
      if (worstK.v < 5.9) fails.push(`обещанный минимум контраста 5.9:1 не держится: ${worstK.v.toFixed(2)} на ${worstK.id}`)
      if (worstD.v < 4.5) fails.push(`обещанный минимум ΔE 4.5 не держится: ${worstD.v.toFixed(2)} на ${worstD.id}`)
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'Badge: цвет из данных читается и при СИСТЕМНОЙ тёмной теме',
    why: 'светлота метки приезжает токеном именно поэтому: theme-auto.css переобъявляет только токены, и правило вида `[data-theme="dark"] .ds-badge--brand` при системной тёмной не сработало бы вовсе. Отдельным кейсом, потому что соседний замер ставит атрибут руками и эту поломку не увидит',
    colorScheme: 'dark',
    extraLink: 'theme-auto.css',
    html: `<div class="ds-root" id="host-auto" style="background: var(--ds-surface); padding: 10px; display: flex; gap: 6px">
      ${['#d97706', '#4f46e5', '#c026d3', '#f5f5f4', '#111827', '#00ff00', '#ffffff', '#000000',
         // Восьмизначные и четырёхзначные — не довесок к списку, а отдельная
         // поломка: относительный цвет наследует альфу ИСТОЧНИКА, и без `/ 1`
         // метка приезжала в половину непрозрачности (2.6:1 при полу 5.0).
         // Пока замер кормился только шестизначными, он этого не видел вовсе.
         '#c026d380', '#4f46e540', '#0891b2c0', '#c0f8']
        .map((c, i) => `<span class="ds-badge ds-badge--brand" id="b-auto-${i}" style="--ds-badge-brand: ${c}">тег</span>`)
        .join('')}
      </div>`,
    measure: () => {
      document.documentElement.removeAttribute('data-theme')
      const sw = document.createElement('div')
      sw.style.cssText = 'display:flex'
      document.body.appendChild(sw)
      const add = (key, color) => {
        const d = document.createElement('div')
        d.className = 'probe'
        d.dataset.k = key
        d.style.cssText = `width:14px;height:14px;background:${color}`
        sw.appendChild(d)
      }
      // Санитарное число снимается ПАРОЙ, а не сверяется с литералом: сначала
      // светлая при явном атрибуте, потом системная без него. Литерал «0.82»
      // проверял бы не то — светлота выведена из рукописных `-fg`, а не
      // назначена, и её законная перенастройка красила бы этот кейс с
      // диагнозом «theme-auto не доехал», то есть указывала бы не туда.
      document.documentElement.setAttribute('data-theme', 'light')
      const lLight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ds-brand-fg-l'))
      document.documentElement.removeAttribute('data-theme')
      const lAuto = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ds-brand-fg-l'))
      const out = { ids: [], lLight, lAuto }
      add('surface-auto', getComputedStyle(document.getElementById('host-auto')).backgroundColor)
      for (const b of document.querySelectorAll('[id^="b-auto-"]')) {
        out.ids.push(b.id)
        add(`ink-${b.id}`, getComputedStyle(b).color)
      }
      return out
    },
    pixels: () => {
      const out = {}
      for (const el of document.querySelectorAll('.probe')) {
        const r = el.getBoundingClientRect()
        out[el.dataset.k] = [r.x + 7, r.y + 7]
      }
      for (const b of document.querySelectorAll('.ds-badge--brand')) {
        const r = b.getBoundingClientRect()
        out[`tint-${b.id}`] = [r.x + 3, r.y + r.height / 2]
      }
      return out
    },
    expect: (m) => {
      // Санитар: если theme-auto не доехал, страница светлая, и всё остальное
      // сходится на светлых числах, ничего не проверив. Признак — что светлота
      // метки при системной тёмной ВЫШЕ, чем при явной светлой; какая именно,
      // решает токен, и этот кейс в тот спор не лезет.
      if (!(m.lAuto > m.lLight)) {
        return `--ds-brand-fg-l: системная тёмная ${m.lAuto} против светлой ${m.lLight} — theme-auto не доехал`
      }
      // Как у соседнего случая: цвета сняты с ПИКСЕЛЕЙ, слои уже сложил
      // браузер, помощнику «как видно» тут складывать нечего (DS-209).
      const fails = m.ids
        .map((id) => [id, contrastOf(m.at[`ink-${id}`], m.at[`tint-${id}`]), deltaE76(m.at[`tint-${id}`], m.at['surface-auto'])])
        .filter(([, k, d]) => k < 5 || d < 2.3)
        .map(([id, k, d]) => `${id}: ${k.toFixed(2)}:1, ΔE ${d.toFixed(2)}`)
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'OrgBadge: фирменная буква читается на плитке в обеих темах',
    why: 'до DS-95 цвет буквы приезжал сырым из листа потребителя, и худшее из 228 хексов на этой плитке было 1.00:1 — буква, совпадающая с подложкой. Числа Badge сюда перенеслись, но это выяснилось замером: подложка здесь не полупрозрачный тинт, а нейтральная плитка --ds-surface-subtle, и совпадение не было предрешено. Норма 4.5, а не 3:1, потому что буква НЕ крупный текст: самый большой размер 13px при весе 600, а крупным WCAG считает от 18.66px полужирного. Читается с ПИКСЕЛЕЙ: относительный цвет отображается в гамму, и со строки computed-стиля этого не видно',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''}
      style="background: var(--ds-surface-subtle); padding: 8px; display: flex; gap: 4px" id="tile-${t}">
      ${['#00ffff', '#cc0033', '#ff66cc', '#00ff00', '#ffffff', '#000000', '#d97706', '#4f46e5', '#c026d380']
        .map((c, i) => `<span class="ds-orgbadge ds-orgbadge--md ds-orgbadge--placeholder" id="o-${t}-${i}"
          style="--ds-orgbadge-brand: ${c}"><span class="ds-orgbadge__letter">О</span></span>`).join('')}
      <span class="ds-orgbadge ds-orgbadge--md ds-orgbadge--placeholder" id="plain-${t}"><span class="ds-orgbadge__letter">О</span></span>
      </div>`).join(''),
    measure: () => {
      const sw = document.createElement('div')
      sw.style.cssText = 'display:flex'
      document.body.appendChild(sw)
      const add = (key, color) => {
        const d = document.createElement('div')
        d.className = 'probe'; d.dataset.k = key
        d.style.cssText = `width:14px;height:14px;background:${color}`
        sw.appendChild(d)
      }
      const out = { ids: [], unset: {}, secondary: {} }
      for (const t of ['light', 'dark']) {
        add(`tile-${t}`, getComputedStyle(document.getElementById(`tile-${t}`)).backgroundColor)
        // Шов НЕ задан: цвет буквы обязан остаться ровно вторичным текстом.
        // Здесь строка computed-стиля читается честно — объявление с
        // относительным цветом отброшено, и color пришёл наследованием.
        const host = document.getElementById(`plain-${t}`)
        out.unset[t] = getComputedStyle(host.firstElementChild).color
        out.secondary[t] = getComputedStyle(host).color
        for (const el of document.querySelectorAll(`[id^="o-${t}-"]`)) {
          out.ids.push(el.id)
          add(`ink-${el.id}`, getComputedStyle(el.firstElementChild).color)
        }
      }
      return out
    },
    pixels: () => {
      const out = {}
      for (const el of document.querySelectorAll('.probe')) {
        const r = el.getBoundingClientRect()
        out[el.dataset.k] = [r.x + 7, r.y + 7]
      }
      return out
    },
    expect: (m) => {
      const fails = []
      for (const t of ['light', 'dark']) {
        // Шов не задан — буква ровно `--ds-text-secondary`, унаследованный от
        // плитки. Мутация «дописать запасное значение внутрь var()» краснит
        // именно здесь: серый нормализуется и уезжает на ΔRGB 38–62.
        if (m.unset[t] !== m.secondary[t]) {
          fails.push(`${t}: без шва буква ${m.unset[t]}, а вторичный текст ${m.secondary[t]} — умолчание сдвинулось`)
        }
      }
      // И здесь тоже пиксели, а не computed-строки: см. соседний Badge
      // (DS-209).
      for (const id of m.ids) {
        const theme = id.split('-')[1]
        const k = contrastOf(m.at[`ink-${id}`], m.at[`tile-${theme}`])
        if (k < 4.5) fails.push(`${id}: буква на плитке ${k.toFixed(2)}:1`)
      }
      return fails.length === 0 || fails.join('; ')
    },
  },
  {
    name: 'OrgBadge: заглушка отличима от логотипа',
    why: 'требование про инвентаризацию, а не про красоту: пока заглушка выглядит как логотип, по экрану не видно, у каких банков логотип ещё не приехал. Пунктир у заглушки и его отсутствие у логотипа — то, что можно посчитать, и то, чего скриншот не докажет',
    html: `
      <span class="ds-orgbadge ds-orgbadge--md ds-orgbadge--placeholder" id="ph"><span class="ds-orgbadge__letter">О</span></span>
      <span class="ds-orgbadge ds-orgbadge--md" id="logo"><img class="ds-orgbadge__img" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></span>`,
    measure: () => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel))
      return {
        phStyle: cs('#ph').borderTopStyle, phWidth: cs('#ph').borderTopWidth,
        logoStyle: cs('#logo').borderTopStyle,
      }
    },
    expect: (m) => {
      // Заглушка — пунктир видимой толщины; логотип — без рамки. Пропал пунктир
      // (мутация border→none) или логотип обзавёлся такой же рамкой — на экране
      // их уже не отличить, а значит не видно, чего не хватает.
      if (m.phStyle !== 'dashed' || m.phWidth === '0px') return `у заглушки нет пунктирной рамки: ${m.phStyle} ${m.phWidth} (лист приехал?)`
      if (m.logoStyle === 'dashed') return 'логотип тоже пунктирный — не отличить от заглушки'
      return true
    },
  },
  {
    name: 'Money: знак различим цветом и читается в обеих темах',
    why: 'цвет по знаку — единственная пометка состояния у суммы; один токен на оба знака сделал бы «+» и «−» неотличимыми, а в тёмной теме -fg-цвет обязан ещё и читаться на поверхности, иначе минус невидим',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''}
      style="background: var(--ds-surface); padding: 8px">
      <span class="ds-money ds-money--md ds-money--positive" id="pos-${t}">+1 234,56</span>
      <span class="ds-money ds-money--md ds-money--negative" id="neg-${t}">−1 234,56</span>
      </div>`).join(''),
    measure: () => {
      const lum = (css) => {
        const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const read = (t) => {
        const pos = getComputedStyle(document.querySelector(`#pos-${t}`))
        const neg = getComputedStyle(document.querySelector(`#neg-${t}`))
        const bg = getComputedStyle(document.querySelector(`#pos-${t}`).parentElement).backgroundColor
        return {
          pos: pos.color, neg: neg.color,
          posRatio: +ratio(lum(pos.color), lum(bg)).toFixed(2),
          negRatio: +ratio(lum(neg.color), lum(bg)).toFixed(2),
        }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => {
      for (const t of ['light', 'dark']) {
        const r = m[t]
        // Различимость: один токен на оба знака (мутация) схлопнул бы цвета.
        if (r.pos === r.neg) return `${t}: «+» и «−» одного цвета (${r.pos}) — знак цветом не различить`
        if (r.posRatio < 4.5 || r.negRatio < 4.5) return `${t}: контраст +${r.posRatio} / −${r.negRatio} < 4.5`
      }
      return true
    },
  },
  {
    name: 'EstimateMark: пояснение звучит, но не видно',
    why: 'звёздочка объяснялась через title, недостижимый и с клавиатуры, и со скринридера. Пояснение стало текстом, и держать его надо в обе стороны сразу: на экране его быть не должно (иначе колонка залита повтором у каждого числа), а в дереве доступности — должно. jsdom раскладки не знает и видит только класс; провалить можно ровно тут — `display:none` выглядит решением и убирает текст ОБОИМ, вместе со скринридером',
    html: `
      <span class="ds-estmark">
        <span class="ds-estmark__star" id="star">*</span>
        <span class="ds-visually-hidden" id="hint">оценочная величина</span>
      </span>`,
    measure: () => {
      const box = (sel) => {
        const el = document.querySelector(sel)
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), display: cs.display, visibility: cs.visibility }
      }
      return { hint: box('#hint'), star: box('#star') }
    },
    expect: (m) => {
      // Сосед с заведомо известным значением: звёздочка обязана иметь размер.
      // Ноль у неё значит, что не приехало ничего, и вывод про пояснение пуст.
      if (m.star.w <= 1) return `звёздочка нулевой ширины (${m.star.w}) — лист не приехал, мерить нечего`
      // С экрана убрано.
      if (m.hint.w > 1 || m.hint.h > 1) return `пояснение видно на экране: ${m.hint.w}×${m.hint.h} — класс не применился`
      // Но НЕ убрано из дерева доступности: ровно та подмена, которой боимся.
      if (m.hint.display === 'none') return 'пояснение спрятано display:none — скринридер его тоже не услышит'
      if (m.hint.visibility === 'hidden') return 'пояснение спрятано visibility:hidden — скринридер его тоже не услышит'
      return true
    },
  },
  {
    name: 'NumberField: выключение достижимо поверхностью поля',
    why: 'обёртка составного поля — `<div>`, и `:disabled` к ней не применим: пока пропа `disabled` не было, правило на неё было бы мёртвым и его намеренно не писали. Проп появился (DS-108), признак стал классом `.is-disabled`, и вместе с ним появилось ДВА места, где легко ошибиться: приглушение и `:hover:not(...)`. Второе особенно — `:not(:disabled)` на `<div>` истинно всегда, то есть выключенное поле подсвечивало бы рамку под курсором, обещая, что с ним можно работать. Из JS :hover не выставить, только настоящим указателем',
    extraCss: '.ds-numfield__control { transition: none }',
    hoverBorders: ['#n-live-h', '#n-dis-h'],
    html: `
      <div class="ds-numfield__control" id="n-live"></div>
      <div class="ds-numfield__control is-disabled" id="n-dis"></div>
      <div class="ds-numfield__control" id="n-live-h"></div>
      <div class="ds-numfield__control is-disabled" id="n-dis-h"></div>
      <span id="probe-subtle" style="background: var(--ds-surface-subtle)"></span>
      <span id="probe-surface" style="background: var(--ds-surface)"></span>
      <span id="probe-accent" style="background: var(--ds-accent)"></span>`,
    measure: () => {
      const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor
      const border = (sel) => getComputedStyle(document.querySelector(sel)).borderTopColor
      return {
        live: bg('#n-live'), dis: bg('#n-dis'),
        liveRest: border('#n-live'), deadRest: border('#n-dis'),
        subtle: bg('#probe-subtle'), surface: bg('#probe-surface'),
        accent: bg('#probe-accent'),
      }
    },
    expect: (m) => {
      // Соседи с заведомо известными значениями: живая обёртка обязана остаться
      // на --ds-surface, а живая под курсором — сменить рамку на акцентную. Не
      // сменила — указатель не доехал, и вывод про выключенную ничего не стоит.
      if (m.live !== m.surface) return `живая обёртка не на --ds-surface: ${m.live} против ${m.surface}`
      if (m.subtle === m.surface) return '--ds-surface-subtle совпал с --ds-surface — различать нечем'
      const liveHover = m.borders['#n-live-h']
      if (liveHover !== m.accent) return `живая обёртка под курсором не акцентная: ${liveHover} при --ds-accent ${m.accent}`
      if (liveHover === m.liveRest) return `рамка живой обёртки под курсором не изменилась (${liveHover}) — различать нечем`
      if (m.dis !== m.subtle) return `выключенное числовое поле не приглушено: ${m.dis} при --ds-surface-subtle ${m.subtle}`
      // Утверждение не про КОНКРЕТНЫЙ токен рамки, а про то, что курсор её не
      // трогает: какой токен носит выключенная обёртка в покое — дело листа.
      const deadHover = m.borders['#n-dis-h']
      return deadHover === m.deadRest
        || `выключенное числовое поле под курсором сменило рамку: ${m.deadRest} → ${deadHover}`
    },
  },
  {
    name: 'Combobox: выключение и ошибка достижимы поверхностью поля',
    why: 'триггер Combobox рисовался литеральным классом, и до него нельзя было дотянуться ни disabled, ни is-error — в field-surface он намеренно не входил в эти группы. Появился проп (DS-36); снимешь селектор из группы — выключенный combobox снова нарисуется фоном живого, а ошибочный обычной рамкой, и jsdom этого не увидит',
    html: `
      <button class="ds-combobox__trigger" id="c-live">Рубль</button>
      <button class="ds-combobox__trigger" id="c-dis" disabled>Рубль</button>
      <button class="ds-combobox__trigger is-error" id="c-err">Рубль</button>
      <span id="probe-subtle" style="background: var(--ds-surface-subtle)"></span>
      <span id="probe-surface" style="background: var(--ds-surface)"></span>
      <span id="probe-error" style="background: var(--ds-error)"></span>`,
    measure: () => {
      const bg = (s) => getComputedStyle(document.querySelector(s)).backgroundColor
      const border = (s) => getComputedStyle(document.querySelector(s)).borderTopColor
      return {
        live: bg('#c-live'), dis: bg('#c-dis'), errBorder: border('#c-err'),
        subtle: bg('#probe-subtle'), surface: bg('#probe-surface'), error: bg('#probe-error'),
      }
    },
    expect: (m) => {
      // Сосед с известным значением: живой триггер обязан остаться на surface.
      if (m.live !== m.surface) return `живой триггер не на --ds-surface: ${m.live} против ${m.surface}`
      if (m.subtle === m.surface) return '--ds-surface-subtle совпал с --ds-surface — различать нечем'
      if (m.dis !== m.subtle) return `выключенный combobox не приглушён: ${m.dis} при --ds-surface-subtle ${m.subtle}`
      if (m.errBorder !== m.error) return `рамка ошибки не цвета ошибки: ${m.errBorder} при --ds-error ${m.error}`
      return true
    },
  },
  {
    name: 'DataTable: всплывающее в ячейке действий видно целиком',
    why: 'меню строки — самый частый табличный приём, и в `--fixed`-раскладке оно было видно НА НОЛЬ ПРОЦЕНТОВ: `overflow: hidden` на ячейках стоит ради длинного текста, а режет `Tooltip` и `DropdownMenu` — оба кладут пузырёк `absolute` внутрь ячейки. Ни ошибки, ни следа в DOM: узел отрисован, роль есть, пункты есть, координатами кликается. Тест по дереву такое проходит, и геометрия тоже: getBoundingClientRect отдаёт полный размер и у обрезанного узла. Поэтому кейс читает ПИКСЕЛИ. Включалось пропом `width`: без него раскладка не `fixed` и всего блока правил нет',
    width: 800,
    // Подложка заведомо чужого цвета и таблица в ОДНУ строку: меню свисает с
    // таблицы на подложку, и вопрос «видно ли» становится вопросом о цвете
    // точки. Обрезано — под ней красное; видно — поверхность меню.
    html: `
      <div style="background: rgb(220, 0, 0); padding: 8px 8px 90px">
      <table class="ds-table ds-table--fixed" style="width: 700px">
        <colgroup><col><col style="width: 6rem"></colgroup>
        <tbody>
          <tr>
            <td id="text-cell-2">Не закрывать задачу без ссылки на коммит</td>
            <td class="ds-table__actions-cell"><div class="ds-table__actions">
              <span class="ds-dropdown">
                <button class="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon">⋯</button>
                <div class="ds-dropdown__menu" id="menu" role="menu" style="display:block">
                  <button class="ds-dropdown__item" role="menuitem">Открыть</button>
                  <button class="ds-dropdown__item" role="menuitem">Дублировать</button>
                </div>
              </span>
            </div></td>
          </tr>
        </tbody>
      </table></div>`,
    measure: () => {
      const cell = document.querySelector('.ds-table__actions-cell')
      const menu = document.getElementById('menu')
      const m = menu.getBoundingClientRect()
      const c = cell.getBoundingClientRect()
      return {
        cellOverflow: getComputedStyle(cell).overflow,
        // Сосед с заведомо известным значением: обычная текстовая ячейка обязана
        // СОХРАНИТЬ клип — иначе окажется, что я выключил его всей таблице, и
        // длинный текст поедет в соседнюю колонку.
        textCellOverflow: getComputedStyle(document.querySelector('#text-cell-2')).overflow,
        menuH: +m.height.toFixed(1),
        // Сколько меню свисает ниже ячейки: если ноль, точка ниже кромки
        // попала бы в саму ячейку и ничего бы не проверила.
        belowCell: +(m.bottom - c.bottom).toFixed(1),
      }
    },
    pixels: () => {
      const c = document.querySelector('.ds-table__actions-cell').getBoundingClientRect()
      const m = document.getElementById('menu').getBoundingClientRect()
      // Точка ЗАВЕДОМО ниже кромки ячейки и внутри меню: ровно та область,
      // которую съедал клип. Отступ в 6px от кромок — чтобы не попасть в
      // границу меню и не зависеть от округления.
      return { inside: [m.x + m.width / 2, Math.max(c.bottom + 6, m.y + 6)] }
    },
    expect: (m) => {
      if (m.menuH < 10) return `меню высотой ${m.menuH} — оно не отрисовалось, замер ни о чём`
      if (m.belowCell < 12) return `меню свисает ниже ячейки всего на ${m.belowCell}px — точка замера не в спорной области`
      if (m.textCellOverflow !== 'hidden') return `клип снят и с ТЕКСТОВОЙ ячейки (${m.textCellOverflow}) — длинный текст поедет в соседнюю колонку`
      // Предмет: цвет ПИКСЕЛЯ. Красный там означает, что на этом месте подложка,
      // то есть меню обрезано ячейкой, — при том что и DOM, и геометрия целы.
      if (m.at.inside === 'rgb(220, 0, 0)') return `под кромкой ячейки подложка (${m.at.inside}) — меню обрезано клипом ячейки`
      if (m.cellOverflow === 'hidden') return `ячейка действий режет: overflow ${m.cellOverflow}`
      return true
    },
  },
  {
    name: 'DataTable: колонка действий не режет кнопки заниженной шириной',
    why: 'при table-layout:fixed правило `overflow:hidden; text-overflow:ellipsis` вешалось на ВСЕ ячейки, включая ячейку действий, где текста нет — только кнопки. Стоит потребителю занизить `width` (а задавать её он обязан руками), и браузер дорисовывает многоточие вплотную к бордеру: выглядит как обрезанное содержимое. Многоточия нет ни в DOM, ни в ::after — его рисует браузер, поэтому ни один тест по дереву этого не видит (DS-57)',
    width: 600,
    html: `
      <table class="ds-table ds-table--fixed" style="width: 400px">
        <colgroup><col><col style="width: 4.5rem"></colgroup>
        <tbody><tr>
          <td id="text-cell">Не закрывать задачу без ссылки на коммит</td>
          <td class="ds-table__end ds-table__actions-cell" id="cell"><div class="ds-table__actions" id="acts">
            <button class="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon"><span class="ds-btn__label"><svg width="16" height="16" viewBox="0 0 24 24"></svg></span></button>
            <button class="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon"><span class="ds-btn__label"><svg width="16" height="16" viewBox="0 0 24 24"></svg></span></button>
          </div></td>
        </tr></tbody>
      </table>`,
    measure: () => {
      const acts = document.querySelector('#acts')
      const cell = document.querySelector('#cell')
      const a = acts.getBoundingClientRect()
      const c = cell.getBoundingClientRect()
      return {
        cell: +c.width.toFixed(1), content: +a.width.toFixed(1),
        // Правый край кнопок против правого края ячейки: отрицательное — вылезли.
        room: +(c.right - a.right).toFixed(1),
        clip: getComputedStyle(cell).textOverflow,
        // Сосед с заведомо известным значением: обычная текстовая ячейка обязана
        // СОХРАНИТЬ сокращение — иначе окажется, что я выключил его всей таблице.
        textCell: getComputedStyle(document.querySelector('#text-cell')).textOverflow,
      }
    },
    expect: (m) => {
      if (m.room < 0) return `кнопки вылезли из ячейки: ${m.content} в ${m.cell}, запас ${m.room}`
      if (m.textCell !== 'ellipsis') return `сокращение пропало у обычной ячейки: ${m.textCell}`
      if (m.clip !== 'clip') return `ячейка действий всё ещё сокращает содержимое: ${m.clip}`
      return true
    },
  },
  {
    name: 'Select: ошибочный список отличим от здорового рамкой',
    why: 'проп `error` появился в DS-56, а рисовать ошибку общий field-surface.css умел и до него — `.ds-select.is-error` уже стоял в группе. Ровно поэтому связь хрупкая: уберут селектор из группы при чистке списка, и проп останется, а поверхность перестанет краситься. Тест по классу этого не увидит — класс на месте, цвет прежний',
    html: `
      <select class="ds-select" id="s-live"><option>Рубль</option></select>
      <select class="ds-select is-error" id="s-err"><option>Рубль</option></select>
      <span id="probe-error" style="background: var(--ds-error)"></span>
      <span id="probe-border" style="background: var(--ds-control-border)"></span>`,
    measure: () => {
      const border = (s) => getComputedStyle(document.querySelector(s)).borderTopColor
      const bg = (s) => getComputedStyle(document.querySelector(s)).backgroundColor
      return {
        live: border('#s-live'), err: border('#s-err'),
        error: bg('#probe-error'), normal: bg('#probe-border'),
      }
    },
    expect: (m) => {
      // Сосед с заведомо известным значением: поля стоят на --ds-control-border,
      // а не на --ds-border (на этой пробе когда-то и вскрылось, что посылка
      // «поле на обычной рамке» неверна: тогда там был --ds-border-strong
      // #C2C2C2 против #D6D6D6, с DS-267 — #878787).
      // Если сюда приедет цвет ошибки, врёт инструмент, а не ДС.
      if (m.live !== m.normal) return `здоровый список не на --ds-control-border: ${m.live} против ${m.normal}`
      if (m.err !== m.error) return `рамка ошибки не цвета ошибки: ${m.err} при --ds-error ${m.error}`
      // Утверждается РАЗЛИЧИМОСТЬ, а не каждое состояние порознь: схлопнутся оба
      // в один цвет — обе проверки выше пройдут, а отличить поля станет нечем.
      if (m.err === m.live) return `ошибочный и здоровый списки нарисованы одинаково: ${m.err}`
      return true
    },
  },
  {
    name: 'Кнопка-на-фоне: четыре элемента рисуются одной рамкой, три — одной заливкой',
    why: 'три декларации (фон/рамка/скругление) стояли копиями в четырёх листах; вынесены в общий button-surface.css. Гейт по тексту видит, что декларация есть, но не какое правило выиграло — а вынос мог разъехаться, если компонентный лист переобъявит поверхность. С DS-269 заливка общая у ТРЁХ — ступень `--ds-surface-subtle`, нажимаемое отличается от заполняемого, — а кнопка копирования `CodeBlock` берёт `--ds-surface` сама: блок под ней и есть subtle',
    html: `
      <button class="ds-codeblock__copy" id="b-copy">A</button>
      <button class="ds-pager__btn" id="b-pager">A</button>
      <button class="ds-searchbar__go" id="b-go">A</button>
      <button class="ds-theme-toggle" id="b-tt">A</button>
      <button class="ds-btn ds-btn--primary ds-btn--md" id="b-not">A</button>
      <span id="probe-surface" style="background: var(--ds-surface)"></span>
      <span id="probe-subtle" style="background: var(--ds-surface-subtle)"></span>
      <span id="probe-border" style="background: var(--ds-control-border)"></span>`,
    measure: () => {
      const frame = (sel) => {
        const s = getComputedStyle(document.querySelector(sel))
        return [s.borderTopWidth, s.borderTopStyle, s.borderTopColor, s.borderTopLeftRadius].join(' ')
      }
      const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor
      const ids = ['#b-copy', '#b-pager', '#b-go', '#b-tt']
      return {
        frames: Object.fromEntries(ids.map((i) => [i, frame(i)])),
        fills: Object.fromEntries(ids.map((i) => [i, bg(i)])),
        tokenSurface: bg('#probe-surface'), tokenSubtle: bg('#probe-subtle'), tokenBorder: bg('#probe-border'),
        notBtn: frame('#b-not'),
      }
    },
    expect: (m) => {
      const uniq = [...new Set(Object.values(m.frames))]
      if (uniq.length !== 1) {
        const odd = Object.entries(m.frames).filter(([, v]) => v !== uniq[0])
        return `рамки разошлись: ${odd.map(([k, v]) => `${k} → ${v}`).join('; ')} против ${uniq[0]}`
      }
      if (!uniq[0].includes(m.tokenBorder)) return `рамка ${uniq[0]} мимо --ds-control-border ${m.tokenBorder}`
      // Соседи с известным значением: токены (лист приехал) и primary-кнопка,
      // которая обязана НЕ совпасть, иначе замер возвращает одно на любой вопрос.
      if (m.notBtn === uniq[0]) return `контрольная primary-кнопка той же рамки (${m.notBtn}) — замер не различает элементы`
      for (const id of ['#b-pager', '#b-go', '#b-tt']) {
        if (m.fills[id] !== m.tokenSubtle) return `${id}: заливка ${m.fills[id]} мимо --ds-surface-subtle ${m.tokenSubtle}`
      }
      if (m.fills['#b-copy'] !== m.tokenSurface) return `#b-copy: заливка ${m.fills['#b-copy']} мимо --ds-surface ${m.tokenSurface}`
      return true
    },
  },
  {
    name: 'Граница контрола ДОЕЗЖАЕТ ДО ЭКРАНА объявленным цветом и берёт 3:1 на худшей подложке',
    why: 'DS-267. Номинальный гейт `tokens/controlBorder.test.ts` считает ЗАДАННЫЕ цвета и по устройству не знает, что попало в буфер кадра: правило могло не выиграть, рамку мог перекрыть сосед, ширина могла схлопнуться в ноль. Этот случай читает НАПИСАННЫЕ пиксели. Подложка взята ХУДШАЯ из настоящих (`--ds-section-bar`, обход каталога дал 1.494 до правки при пороге 3), обе темы. Что именно доказывается краской, а не номиналом: при dpr 1 краска обязана совпасть с номиналом ТОЧНО — замерено по 16 субпиксельным позициям, расхождений нет; расхождение появляется только на дробном dpr, и там линия ложится на два пикселя с СОХРАНЕНИЕМ интеграла краски (96–102%), поэтому порог остаётся на заданных цветах, а этот случай сторожит доезд',
    // Подложка равна заливке намеренно: тогда в срезе нет ничего, кроме линии.
    // Первая редакция этого замера в песочнице мерила кнопку с белой заливкой на
    // сером фоне и посчитала заливку за краску — вышло 200–400%.
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''}
        style="background: var(--ds-section-bar); padding: 20px">
        <div id="edge-${t}" style="width:120px;height:24px;box-sizing:border-box;
             background: var(--ds-section-bar); border: 1px solid var(--ds-control-border)"></div>
        <span id="tok-${t}" style="background: var(--ds-control-border)"></span>
        <span id="bed-${t}" style="background: var(--ds-section-bar)"></span>
      </div>`).join(''),
    pixels: () => {
      const pts = {}
      for (const t of ['light', 'dark']) {
        const r = document.querySelector('#edge-' + t).getBoundingClientRect()
        const y = Math.round(r.top + r.height / 2)
        // Левая грань и точка ВНУТРИ коробки: вторая доказывает, что мерили
        // именно линию, а не залитый прямоугольник.
        pts['line-' + t] = [r.left + 0.5, y]
        pts['in-' + t] = [r.left + 8, y]
      }
      return pts
    },
    measure: () => {
      const read = (id) => getComputedStyle(document.querySelector(id)).backgroundColor
      const out = {}
      for (const t of ['light', 'dark']) out[t] = { token: read('#tok-' + t), bed: read('#bed-' + t) }
      return out
    },
    expect: (m) => {
      for (const t of ['light', 'dark']) {
        const line = m.at['line-' + t]
        const inside = m.at['in-' + t]
        const { token, bed } = m[t]
        if (line !== token) return `${t}: написанная линия ${line} не равна объявленному --ds-control-border ${token}`
        // Санитар: без него случай зелен и на разметке, где рамки нет вовсе, —
        // «линия» совпала бы с заливкой, а заливка с токеном.
        if (inside !== bed) return `${t}: точка внутри коробки ${inside} не равна подложке ${bed} — мерили не линию`
        if (line === bed) return `${t}: линия и подложка совпали (${line}) — рамки на экране нет`
        const k = contrastOf(line, bed)
        if (k < 3) return `${t}: написанная линия ${line} на ${bed} даёт ${k.toFixed(2)} при пороге 3`
      }
      return true
    },
  },
  {
    name: 'Tile: две формы — показатель на обычной рамке и без пальца, кнопка на рамке контрола и с наведением',
    why: 'DS-272. `Tile` без `onClick` рендерит `<div class="ds-tile--static">`, с ним — `<button>`. Разница живёт ТОЛЬКО в каскаде: базовое правило `.ds-tile` — нажимаемое (палец, `--ds-control-border` из 267), и статичная форма обязана его перебить. jsdom этого не видит — класс на месте при любом исходе. Наведение настоящим курсором в этом стенде не воспроизводится (см. комментарий в Split.css), поэтому оно проверяется по ПРАВИЛАМ: каждое правило листа с `:hover` и `.ds-tile` в селекторе, со снятым `:hover`, обязано совпасть с кнопкой и НЕ совпасть с показателем. Сосед-кнопка обязателен в каждой паре: без него «у статичной не палец» верно и на листе, где пальца нет ни у кого',
    html: `
      <div class="ds-dashboard">
        <div class="ds-tile ds-tile--static ds-tile--neutral" id="t-static"><span class="ds-tile__title">Заказов</span></div>
        <div class="ds-tile ds-tile--static ds-tile--accent" id="t-static-acc"><span class="ds-tile__title">Выручка</span></div>
        <button type="button" class="ds-tile ds-tile--neutral" id="t-press"><span class="ds-tile__title">Документов</span></button>
      </div>
      <span id="probe-border" style="background: var(--ds-border)"></span>
      <span id="probe-control" style="background: var(--ds-control-border)"></span>`,
    measure: () => {
      const cs = (s) => getComputedStyle(document.querySelector(s))
      const hover = []
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        const walk = (list) => {
          for (const r of list) {
            // `styles.css` собран из `@import`: правила компонентов лежат во
            // ВЛОЖЕННЫХ листах, и обход верхнего уровня находит ноль.
            if (r.styleSheet) { try { walk(r.styleSheet.cssRules) } catch { /* чужой origin */ } }
            if (r.cssRules) walk(r.cssRules)
            if (r.selectorText && r.selectorText.includes(':hover') && r.selectorText.includes('.ds-tile')) hover.push(r.selectorText)
          }
        }
        walk(rules)
      }
      const matches = (id) => hover.map((sel) => {
        // Каждый член списка селекторов порознь: `a:hover, b` без разбора
        // совпал бы с чем угодно, что совпадает с `b`.
        const parts = sel.split(',').filter((p) => p.includes(':hover') && p.includes('.ds-tile'))
        return parts.some((p) => document.querySelector(id).matches(p.replace(/:hover/g, '')))
      })
      return {
        hover,
        staticHover: matches('#t-static'), accHover: matches('#t-static-acc'), pressHover: matches('#t-press'),
        staticCursor: cs('#t-static').cursor, pressCursor: cs('#t-press').cursor,
        staticBorder: cs('#t-static').borderLeftColor, accBorder: cs('#t-static-acc').borderLeftColor,
        pressBorder: cs('#t-press').borderLeftColor,
        border: cs('#probe-border').backgroundColor, control: cs('#probe-control').backgroundColor,
        // Гарнитура и интерлиньяж — у самих плиток: `<button>` не наследует
        // шрифт страницы, и форма-кнопка была Arial рядом с Inter показателя.
        staticFont: [cs('#t-static').fontFamily, cs('#t-static').fontSize, cs('#t-static').lineHeight].join(' / '),
        pressFont: [cs('#t-press').fontFamily, cs('#t-press').fontSize, cs('#t-press').lineHeight].join(' / '),
      }
    },
    expect: (m) => {
      // Санитары: без них случай зелен там, где мерить нечего.
      if (m.border === m.control) return `--ds-border и --ds-control-border совпали (${m.border}) — рамки не различить`
      if (m.hover.length === 0) return 'в листе нет ни одного правила с :hover и .ds-tile — проверять наведение не на чем'
      if (m.pressCursor !== 'pointer') return `кнопка-плитка без пальца: cursor ${m.pressCursor}`
      if (m.pressBorder !== m.control) return `кнопка-плитка не на --ds-control-border: ${m.pressBorder} при ${m.control}`
      if (m.staticCursor === 'pointer') return 'статичная плитка показывает палец — обещает нажатие, которого нет'
      if (m.staticBorder !== m.border) return `статичная плитка не на --ds-border: ${m.staticBorder} при ${m.border}`
      if (m.accBorder !== m.border) return `статичная accent-плитка не на --ds-border: ${m.accBorder} при ${m.border}`
      if (!m.pressHover.some(Boolean)) return `ни одно правило наведения не совпало с кнопкой-плиткой: ${m.hover.join(' | ')}`
      const leak = m.hover.filter((_, i) => m.staticHover[i] || m.accHover[i])
      if (leak.length) return `правило наведения совпадает со статичной плиткой: ${leak.join(' | ')}`
      if (m.pressFont !== m.staticFont) return `формы разошлись шрифтом: кнопка ${m.pressFont}, показатель ${m.staticFont}`
      return true
    },
  },
  {
    name: 'FunctionPanel: ссылка как кнопка — шов renderItem не меняет вида пункта',
    why: 'DS-273. Шов `renderItem` кладёт тот же класс `.ds-fnpanel__link` на `<a>` потребителя вместо `<button>`. У двух тегов РАЗНЫЕ умолчания UA: ссылка подчёркнута и наследует шрифт, кнопка не подчёркнута и шрифт страницы не наследует. Класс обязан стереть обе разницы, иначе панель со швом читается иначе, чем без него, — и jsdom этого не видит, класс на месте при любом исходе. Сосед — голая `<a href>` без класса: без него «подчёркивания нет» верно и в браузере, который ссылки не подчёркивает вовсе',
    html: `
      <nav class="ds-fnpanel"><ul class="ds-fnpanel__list">
        <li><button type="button" class="ds-fnpanel__link" id="fn-btn">Заказы курьеров</button></li>
        <li><a href="#x" class="ds-fnpanel__link" id="fn-a">Заказы курьеров</a></li>
      </ul></nav>
      <nav class="ds-fnpanel" style="width:120px"><ul class="ds-fnpanel__list" style="width:90px">
        <li><button type="button" class="ds-fnpanel__link" id="fn-btn2">Акты выполненных работ</button></li>
        <li><a href="#z" class="ds-fnpanel__link" id="fn-a2">Акты выполненных работ</a></li>
      </ul></nav>
      <a href="#y" id="fn-bare">Заказы курьеров</a>`,
    measure: () => {
      const read = (sel) => {
        const el = document.querySelector(sel)
        const cs = getComputedStyle(el)
        return {
          color: cs.color, 'text-decoration-line': cs.textDecorationLine,
          'font-family': cs.fontFamily, 'font-size': cs.fontSize,
          height: el.getBoundingClientRect().height, cursor: cs.cursor,
        }
      }
      // Пункт в ДВЕ строки: у однострочного разницу интерлиньяжа прячет
      // `min-height`, и первое сравнение ниже её не видит (DS-276, З-4).
      const tall = (sel) => { const el = document.querySelector(sel); return { h: +el.getBoundingClientRect().height.toFixed(1), lh: getComputedStyle(el).lineHeight } }
      return { btn: read('#fn-btn'), a: read('#fn-a'), bare: getComputedStyle(document.querySelector('#fn-bare')).textDecorationLine, btn2: tall('#fn-btn2'), a2: tall('#fn-a2') }
    },
    expect: (m) => {
      if (m.bare !== 'underline') return `голая ссылка не подчёркнута (${m.bare}) — умолчания UA, которое класс обязан стереть, здесь нет`
      if (m.btn['text-decoration-line'] !== 'none') return `text-decoration: кнопка-пункт подчёркнута в покое (${m.btn['text-decoration-line']})`
      if (m.btn.cursor !== 'pointer') return `кнопка-пункт без пальца: cursor ${m.btn.cursor}`
      for (const k of Object.keys(m.btn)) {
        if (m.btn[k] !== m.a[k]) return `${k}: кнопка ${m.btn[k]}, ссылка ${m.a[k]} — пункт со швом выглядит иначе`
      }
      // Сосед: пункт действительно перенёсся, иначе сравнение ниже — ещё одно однострочное.
      if (!(m.a2.h > 30)) return `пункт «Акты выполненных работ» не перенёсся (${m.a2.h}px) — двухстрочное сравнение не про что`
      if (m.btn2.h !== m.a2.h) return `пункт в две строки: кнопка ${m.btn2.h}px (line-height ${m.btn2.lh}), ссылка ${m.a2.h}px (${m.a2.lh}) — колонка со швом съезжает`
      return true
    },
  },
  {
    name: 'MetricStrip: «данных нет» отличимо от значения двумя каналами, в обеих темах',
    why: 'потребитель перевёл полосу счётчиков на MetricStrip и получил на карточке без прогонов три жирных тёмных прочерка, читающихся как три значения. Замерено ДО правки: голый прочерк в .ds-metrics__value давал font-weight 700 и color rgb(38,38,38) — побуквенно то же, что соседнее настоящее число, то есть состояния были не похожи, а НЕОТЛИЧИМЫ. Проверяются оба канала сразу и именно ПАРОЙ: одного цвета мало — приглушённый жирный прочерк рядом с тёмным жирным числом расходится только светлотой, а на этом разряде разницы система уже обожглась с зеброй (ΔE 1.73 при пороге различения 2.3). Сосед с заведомо известным значением обязателен: без него «прочерк приглушён» верно и на разметке, где приглушено ВСЁ',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px">
      <ul class="ds-metrics">
        <li class="ds-metrics__cell"><div class="ds-metrics__label">Прогонов</div>
          <div class="ds-metrics__value ds-metrics__value--empty" id="dash-${t}"><span aria-hidden="true">—</span><span class="ds-visually-hidden">данных нет</span></div>
          <div class="ds-metrics__hint">прогонов не было</div></li>
        <li class="ds-metrics__cell"><div class="ds-metrics__label">Сообщений</div>
          <div class="ds-metrics__value" id="real-${t}">1 240</div></li>
      </ul>
    </div>`).join(''),
    measure: () => {
      const read = (sel) => {
        const el = document.querySelector(sel)
        const cs = getComputedStyle(el)
        // `видно` — снимок слоёв до корня (DS-209). Подложка ячейки
        // прозрачна, и раньше на её месте стоял ЛИТЕРАЛ `rgb(20, 20, 20)` для
        // тёмной: он разошёлся с `--ds-bg-app` (#1A1A1A) и мерил цвет,
        // которого на странице нет. Снимок берёт подложку со страницы.
        return { вес: cs.fontWeight, цвет: cs.color, видно: window.__seen(el) }
      }
      const out = {}
      for (const t of ['light', 'dark']) out[t] = { dash: read(`#dash-${t}`), real: read(`#real-${t}`) }
      return out
    },
    expect: (m) => {
      for (const [t, r] of Object.entries(m)) {
        if (r.dash.вес === r.real.вес) return `${t}: начертание прочерка и значения одинаково (${r.dash.вес})`
        if (r.dash.цвет === r.real.цвет) return `${t}: цвет прочерка и значения одинаков (${r.dash.цвет})`
        // Приглушить — не значит спрятать: прочерк остаётся сведением, и его
        // надо видеть. Фон ячейки прозрачен, поэтому подложка ищется вверх по
        // предкам — и с DS-209 её ищет общий помощник, а не литерал.
        const { color, background: bg } = seenPair(r.dash.видно)
        const k = contrastOf(color, bg)
        if (k < 3) return `${t}: прочерк ${color} на ${bg} даёт ${k.toFixed(2)} при нужных 3 — приглушили до невидимости`
      }
      return true
    },
  },
  {
    name: 'MetricStrip: columns=5 даёт пять колонок',
    why: 'bem-modifiers видит, что .ds-metrics--cols-5 где-то стилизован, но не что колонок именно пять — опечатка repeat(4, 1fr) прошла бы её насквозь, а пять метрик карточки результата встали бы 4+дырка',
    html: `<ul class="ds-metrics ds-metrics--cols-5" style="width: 600px">
      <li class="ds-metrics__cell">a</li><li class="ds-metrics__cell">b</li>
      <li class="ds-metrics__cell">c</li><li class="ds-metrics__cell">d</li>
      <li class="ds-metrics__cell">e</li></ul>`,
    measure: () => {
      const cs = getComputedStyle(document.querySelector('.ds-metrics'))
      return { tracks: cs.gridTemplateColumns.trim().split(/\s+/).length }
    },
    expect: (m) => m.tracks === 5 || `колонок ${m.tracks}, а не 5`,
  },
  {
    name: 'Select labelPosition=inline — метка на одной строке с контролом',
    why: 'метка над контролом делала Select выше соседей в тулбаре (лечили align-items: flex-end на всю строку). inline обязан ставить метку в ряд — jsdom раскладку не считает',
    html: `
      <div class="ds-field ds-field--inline" id="inl"><label class="ds-field__label" for="i-sel">Валюта</label><span class="ds-select-wrap"><select id="i-sel" class="ds-select ds-select--md"><option>Рубль</option></select></span></div>
      <div class="ds-field" id="top"><label class="ds-field__label" for="t-sel">Валюта</label><span class="ds-select-wrap"><select id="t-sel" class="ds-select ds-select--md"><option>Рубль</option></select></span></div>`,
    measure: () => {
      const rect = (sel) => document.querySelector(sel).getBoundingClientRect()
      const il = rect('#inl .ds-field__label'), is = rect('#inl .ds-select')
      const tl = rect('#top .ds-field__label'), ts = rect('#top .ds-select')
      return {
        inlineSameRow: il.top < is.bottom && il.bottom > is.top,
        topStacked: tl.bottom <= ts.top + 1,
      }
    },
    expect: (m) => {
      if (!m.inlineSameRow) return 'inline: метка не пересекается по вертикали с контролом (не в строку)'
      // Сосед-контроль: top-режим обязан оставаться столбиком, иначе замер не различает режимы.
      if (!m.topStacked) return 'top: метка не над контролом — замер не различает раскладки'
      return true
    },
  },
  {
    name: 'ToggleGroup: активный сегмент отличим от неактивного (framed)',
    why: 'заливка активного сегмента должна отличаться от фона контейнера, на котором он лежит — неактивный сегмент прозрачен и сквозь него виден именно контейнер; совпади заливка с контейнером, выбранный сегмент визуально слился бы с рамкой и «что выбрано» не читалось бы',
    html: `<div class="ds-togglegroup ds-togglegroup--framed ds-togglegroup--md" id="container" role="radiogroup" aria-label="Тип">
      <button class="ds-togglegroup__item is-active" role="radio" aria-checked="true" id="on">Все</button>
      <button class="ds-togglegroup__item" role="radio" aria-checked="false" id="off">message</button>
    </div>`,
    measure: () => ({
      on: getComputedStyle(document.querySelector('#on')).backgroundColor,
      container: getComputedStyle(document.querySelector('#container')).backgroundColor,
      // Сосед с известным значением: токен рамки обязан быть непустым. Пусто =
      // лист стилей не доехал и любой замер цвета врёт (случай №5 CLAUDE.md).
      control: getComputedStyle(document.documentElement).getPropertyValue('--ds-border').trim(),
    }),
    expect: (m) => (m.control !== '' && m.on !== m.container)
      || `активный ${m.on} vs контейнер ${m.container}, контроль рамки "${m.control}"`,
  },
  {
    name: 'ToggleGroup framed: выбранный сегмент не красит за контуром группы',
    why: 'выбор в framed держится заливкой и текстом, а не подъёмом (DS-271). `--ds-shadow-md` — токен летящего слоя; на сегменте в потоке он выходил наружу общей рамки, и у крайнего левого сегмента пятно лежало на подложке страницы слева и снизу. Мерится ВНЕШНЯЯ часть теней (inset не выходит за box по построению), плюс что без тени у выбора остаётся носитель, не зависящий от цвета. С DS-311 это НАЧЕРТАНИЕ, а не светлота текста: выбранный стал `accent-fg`, и в светлой теме он против `text-secondary` по яркости 1.38 — на `grayscale(1)` выбор держит 500 против 400, а цвет его подтверждает. Прежний порог «текст ≥ 1.5 по яркости» красил бы ровно это решение, при том что носитель на месте',
    html: `<div class="ds-togglegroup ds-togglegroup--framed ds-togglegroup--md" id="fg" role="radiogroup" aria-label="Тип">
      <button class="ds-togglegroup__item is-active" role="radio" aria-checked="true" id="fon">Все</button>
      <button class="ds-togglegroup__item" role="radio" aria-checked="false" id="foff">message</button>
    </div>`,
    measure: () => {
      const on = getComputedStyle(document.querySelector('#fon'))
      const off = getComputedStyle(document.querySelector('#foff'))
      // Тени без inset: каждая «цвет x y blur spread». Выход наружу — ненулевой
      // сдвиг, размытие или разлёт. Разбор по запятым вне скобок rgba().
      const outer = on.boxShadow === 'none' ? [] : on.boxShadow.split(/,(?![^(]*\))/)
        .filter((sh) => !/inset/.test(sh))
        .filter((sh) => (sh.replace(/rgba?\([^)]*\)/, '').match(/-?\d+(?:\.\d+)?px/g) || []).some((v) => parseFloat(v) !== 0))
      return { outer, onColor: on.color, offColor: off.color, weight: on.fontWeight, offWeight: off.fontWeight }
    },
    expect: (m) => {
      if (m.outer.length) return `выбранный сегмент красит наружу: ${m.outer.join(' | ')}`
      // Сосед: без тени признак обязан остаться вне цвета, иначе снятая тень —
      // потерянный носитель, а не лишний. Носитель — начертание; цвет текста
      // обязан его подтверждать, а не совпадать.
      if (!(parseInt(m.weight, 10) >= 500 && parseInt(m.offWeight, 10) < 500)) {
        return `начертание выбранного ${m.weight} против ${m.offWeight} — на grayscale(1) выбор держится одной заливкой`
      }
      return m.onColor !== m.offColor || `текст выбранного и невыбранного одного цвета ${m.onColor} — цвет не подтверждает выбор`
    },
  },
  {
    name: 'ToggleGroup framed: выбор не красится цветом наведения — под настоящим курсором',
    why: 'DS-311. Наведение (`:hover:not(.is-active)`) и выбор красились одним `--ds-surface` с `text-primary`, и невыбранный сегмент под курсором выглядел выбранным — различало их одно начертание. Выбор переведён на `--ds-accent-subtle`, а с DS-315 — на сплошной `--ds-accent`. Утверждение не «выбор акцентный», а «фон наведённого невыбранного не равен фону выбранного»: :hover из JS не выставить, поэтому наведение настоящим указателем. Санитар — фон невыбранного в покое: если курсор не доехал, наведённый равен покою, и сравнение было бы о покое',
    html: `<div class="ds-togglegroup ds-togglegroup--framed ds-togglegroup--md" id="hv" role="radiogroup" aria-label="Тип">
      <button class="ds-togglegroup__item is-active" role="radio" aria-checked="true" id="hv-on">Все</button>
      <button class="ds-togglegroup__item" role="radio" aria-checked="false" id="hv-off">message</button>
    </div>`,
    measure: () => ({ offRest: getComputedStyle(document.querySelector('#hv-off')).backgroundColor }),
    hoverPair: ['#hv-off', '#hv-on'],
    expect: (m) => {
      if (m.plainHovered === m.offRest) return `курсор не доехал: невыбранный под курсором ${m.plainHovered} равен покою — замер о покое`
      return m.plainHovered !== m.selHovered
        || `наведённый невыбранный ${m.plainHovered} равен выбранному ${m.selHovered}`
    },
  },
  {
    name: 'ToggleGroup framed: выбор на акцентной подложке и в акцентной рамке поверх соседа — обе темы',
    why: 'DS-311, заливка переехала на DS-315. Курсорный случай выше меряет одну тему, а разводить состояния обязаны обе. Цвет наведения — токен `--ds-surface`, поэтому в тёмной его можно сверить без курсора: выбранный сегмент обязан лечь на `--ds-accent` (тот же носитель «выбрано», что у узла `Tree` и у выбранного дня `Calendar`) и НЕ на `--ds-surface`. Рамка выбранного — `--ds-accent` (приёмка: серая `control-border` на `accent-subtle` в тёмной 2.69 при поле 3, шов двух выбранных в `multiple` лежал ниже пола с обеих сторон), и общий с правым соседом пиксель рамки обязан рисовать ВЫБРАННЫЙ: рамки схлопнуты отрицательным полем, и без `z-index` верхним был бы поздний сосед. Счётчик выбранного — `text-on-accent`: на сплошной акцентной заливке объявлена одна пара, а `text-secondary` стоял там, пока заливкой была `accent-subtle`. Зонды токенов стоят в той же теме — сравнение с литералом прошло бы и на сломанном листе',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px">
      <div class="ds-togglegroup ds-togglegroup--framed ds-togglegroup--md" role="radiogroup" aria-label="Тип">
        <button class="ds-togglegroup__item is-active" role="radio" aria-checked="true" id="th-on-${t}">Все<span class="ds-togglegroup__count" id="th-cnt-${t}">3</span></button>
        <button class="ds-togglegroup__item" role="radio" aria-checked="false">message</button>
      </div>
      <span id="th-sub-${t}" style="background: var(--ds-accent)"></span>
      <span id="th-surf-${t}" style="background: var(--ds-surface)"></span>
      <span id="th-sec-${t}" style="color: var(--ds-text-on-accent)"></span>
      <span id="th-acc-${t}" style="border-left: 1px solid var(--ds-accent)"></span>
    </div>`).join(''),
    measure: () => Object.fromEntries(['light', 'dark'].map((t) => {
      const cs = (id) => getComputedStyle(document.getElementById(`${id}-${t}`))
      // Кто рисует ОБЩИЙ пиксель рамки выбранного и его правого соседа: без
      // подъёма верхним оказывается сосед, и край выбора серый.
      const on = document.getElementById(`th-on-${t}`), r = on.getBoundingClientRect()
      const top = document.elementFromPoint(r.right - 0.5, r.top + r.height / 2)
      return [t, { on: cs('th-on').backgroundColor, sub: cs('th-sub').backgroundColor, surf: cs('th-surf').backgroundColor, cnt: cs('th-cnt').color, sec: cs('th-sec').color,
        edge: cs('th-on').borderRightColor, acc: cs('th-acc').borderLeftColor, seamOwner: top === on || on.contains(top) ? 'on' : (top?.textContent ?? 'none') }]
    })),
    expect: (m) => {
      for (const t of ['light', 'dark']) {
        const x = m[t]
        if (x.sub === x.surf) return `${t}: зонды accent и surface равны (${x.sub}) — лист не доехал, замер врёт`
        if (x.on !== x.sub) return `${t}: выбранный ${x.on}, а --ds-accent ${x.sub}`
        if (x.cnt !== x.sec) return `${t}: счётчик выбранного ${x.cnt}, а объявленная на accent пара — text-on-accent ${x.sec}`
        if (x.edge !== x.acc) return `${t}: рамка выбранного ${x.edge}, а --ds-accent ${x.acc} — control-border на accent-subtle в тёмной 2.69 при поле 3`
        if (x.seamOwner !== 'on') return `${t}: общий пиксель рамки с правым соседом рисует «${x.seamOwner}», а не выбранный — край выбора серый`
      }
      return true
    },
  },
  {
    name: 'Выбор без цвета: сплошная заливка несёт светлоту — ToggleGroup framed и Tree, обе темы',
    why: 'DS-315. Под `grayscale(1)` выбранный сегмент находился медленно: `accent-subtle` давала заливку против подложки группы 1.03 по яркости, и весь признак держало начертание 500. Слепой взгляд владельца при СМЕНЁННОМ порядке дважды выбрал сплошную акцентную заливку из трёх видов (третий — подложка плюс полоса 3px, отклонён: форма есть, светлоты нет). Меряется ЯРКОСТЬ, а не цвет: серый фильтр светлоту не меняет, поэтому число, снятое здесь, и есть число под фильтром, и снимать его с картинки не надо. Отношение считает `contrastOf` в expect — для двух непрозрачных цветов это ровно отношение яркостей; свой разбор цвета в этом файле запрещён гейтом `colour-parse`. Пол 3 — тот же, что у нетекстовых носителей системы. Пять утверждений в одном случае, потому что носитель один: сегмент, строка `Tree`, ОТМЕЧЕННЫЙ ФЛАЖОК на ней ШЕВРОН раскрытия и ШОВ между двумя выбранными подряд — два последних добавлены приёмкой: `.ds-caret` красится `--ds-text-secondary` (один цвет на систему) и на сплошной акцентной строке давал 1.15 в светлой, 1.07 в тёмной — флажок красится `--ds-accent` телом и на акцентной строке исчезал целиком. Соседом с известным ответом стоит зонд прежнего вида (`accent-subtle` той же темы): он ОБЯЗАН не дотянуть до пола, иначе замер не различает виды и зелёный ничего не значит',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} style="padding:8px;background:var(--ds-surface)">
      <div class="ds-togglegroup ds-togglegroup--framed ds-togglegroup--md" id="ca-g-${t}" role="radiogroup" aria-label="Тип">
        <button class="ds-togglegroup__item is-active" role="checkbox" aria-checked="true" id="ca-on-${t}">Поездки</button>
        <button class="ds-togglegroup__item is-active" role="checkbox" aria-checked="true" id="ca-on2-${t}">Заказы</button>
        <button class="ds-togglegroup__item" role="checkbox" aria-checked="false" id="ca-off-${t}">Смены</button>
      </div>
      <div class="ds-tree" id="ca-tree-${t}" style="background:var(--ds-surface);width:200px">
        <div class="ds-tree__item" id="ca-rest-${t}"><div class="ds-tree__row"><span class="ds-tree__label">Парк</span></div></div>
        <div class="ds-tree__item is-selected" id="ca-row-${t}"><div class="ds-tree__row">
          <span class="ds-tree__toggle"><svg class="ds-caret ds-caret--branch" id="ca-car-${t}"><path d="M0 0"/></svg></span>
          <span class="ds-tree__check is-checked" id="ca-chk-${t}"></span><span class="ds-tree__label">Смена 12.09</span></div></div>
      </div>
      <span id="ca-was-${t}" style="background: var(--ds-accent-subtle)"></span>
    </div>`).join(''),
    measure: () => Object.fromEntries(['light', 'dark'].map((t) => {
      const bg = (id, pseudo) => getComputedStyle(document.getElementById(id), pseudo || null).backgroundColor
      const on = document.getElementById(`ca-on-${t}`)
      return [t, {
        seg: bg(`ca-on-${t}`), group: bg(`ca-g-${t}`),
        row: bg(`ca-row-${t}`), rest: bg(`ca-tree-${t}`),
        // Тело флажка рисует ::before — сам input скрыт (Tree.css).
        check: bg(`ca-chk-${t}`, '::before'),
        // Шеврон раскрытия: `.ds-caret` красится одним цветом на систему, и на
        // сплошной заливке он тонет, если строка его не перекрасила.
        caret: getComputedStyle(document.getElementById(`ca-car-${t}`)).color,
        // Шов ДВУХ выбранных подряд: общий пиксель рисует поздний сосед, и на
        // сплошной заливке акцентная рамка совпала с ней (1.00).
        seam: getComputedStyle(document.getElementById(`ca-on2-${t}`)).borderInlineStartColor,
        was: bg(`ca-was-${t}`),
        weight: getComputedStyle(on).fontWeight,
        offWeight: getComputedStyle(document.getElementById(`ca-off-${t}`)).fontWeight,
      }]
    })),
    expect: (m) => {
      for (const t of ['light', 'dark']) {
        const x = m[t]
        const seg = contrastOf(x.seg, x.group)
        const row = contrastOf(x.row, x.rest)
        const check = contrastOf(x.check, x.row)
        const was = contrastOf(x.was, x.group)
        // Сосед с известным ответом: прежний вид обязан провалиться, иначе
        // случай зелен независимо от того, что нарисовано.
        if (was >= 3) return `${t}: зонд прежнего вида (accent-subtle) даёт ${was.toFixed(2)} — замер не различает виды`
        if (seg < 3) return `${t}: заливка выбранного сегмента против подложки группы ${seg.toFixed(2)} по яркости при поле 3 — под grayscale(1) выбор держится одним начертанием`
        if (row < 3) return `${t}: выбранная строка Tree против остальных ${row.toFixed(2)} по яркости при поле 3`
        if (check < 3) return `${t}: отмеченный флажок на выбранной строке ${check.toFixed(2)} по яркости при поле 3 — на акцентной строке он исчезает`
        const seam = contrastOf(x.seam, x.seg)
        if (seam < 3) return `${t}: шов между двумя выбранными ${seam.toFixed(2)} по яркости при поле 3 — в multiple они сливаются в один сегмент`
        const caret = contrastOf(x.caret, x.row)
        if (caret < 3) return `${t}: шеврон раскрытия на выбранной строке ${caret.toFixed(2)} по яркости при поле 3 — единственный признак «раскрывается» тонет в заливке`
        // Начертание не заменено заливкой, а добавлено к ней: носителей два.
        if (!(parseInt(x.weight, 10) >= 500 && parseInt(x.offWeight, 10) < 500)) {
          return `${t}: начертание выбранного ${x.weight} против ${x.offWeight} — заливка не отменяет второй носитель`
        }
      }
      return true
    },
  },
  // Эти два случая охраняют ОСНОВАНИЕ верстака и краснеют от двух разных
  // причин, которые важно не спутать:
  //  - кадр перестал быть отдельным вьюпортом (сломан инструмент);
  //  - Drawer перестал зависеть от вьюпорта (изменилась система).
  // Поэтому оба печатают вьюпорты обеих половин: по ним видно, что именно
  // произошло. Отдельно стоит помнить, чего пара НЕ доказывает: @container
  // в кадре не нуждается — контейнерные запросы меряют контейнер и в div
  // работают правильно. Правил `@media` по ширине в src сегодня НЕТ НИ ОДНОГО
  // (все 10 — про prefers-reduced-motion и hover), так что кадр держится на
  // vw, position:fixed и на @media у потребителя.
  {
    name: 'Кадр не бутафория: vw в кадре мерит кадр, а в общем документе — окно',
    why: 'на этом стоит весь верстак. Ширина, отданная div-у, показывает правду про @container и враньё про всё, что зависит от вьюпорта: у зонда `min(100rem, 50vw)` 100rem (1600px) заведомо больше окна любого размера, так что везде побеждает VW-ветка, а её число — половина того вьюпорта, в котором зонд стоит. В общем документе это половина окна раннера, в кадре — половина кадра, и расхождение чисел доказывает ровно то, от чего считается vw',
    // ПЕРЕЕХАЛО НА 440 (JIG-29, второй круг, решение владельца — отменяет
    // прежнее «не переехало»/320 первого круга). Довод первого круга не
    // ошибочен технически (у `min(22.5rem, 90vw)` VW-ветка на кадре 440
    // действительно уступает rem-ветке), но чинился он ТЕМ ЖЕ приёмом, что и
    // «Оверлеи на кадре 440»/Drawer-контроль: формулу переписали под пол.
    // Здесь переписан не порог, а САМ ЗОНД: `min(100rem, 50vw)` не Drawer, а
    // нейтральный div, и 100rem (1600px) не проигрывает VW-ветке ни на одном
    // разумном вьюпорте — рем-ветка тут ВООБЩЕ не участвует, поэтому кадр 440
    // и документ (900px раннера) дают РАЗНЫЕ числа (220 и 450) по ОДНОЙ и той
    // же причине (VW), а не по разным (VW против rem), как было бы с прежним
    // зондом. Лист системы (`workbench/frame.css`/`styles.css`) зонду не
    // нужен вовсе — `position:fixed`-санитар снят вместе с ним.
    html: `
      <div id="host"><div id="probe" style="width:min(100rem, 50vw)">зонд</div></div>
      <iframe id="f" src="/" style="width:440px;height:120px;border:0"></iframe>`,
    measure: async () => {
      const f = document.getElementById('f')
      if (f.contentDocument.readyState !== 'complete') {
        await new Promise((r) => f.addEventListener('load', r, { once: true }))
      }
      const fd = f.contentDocument
      fd.body.insertAdjacentHTML('beforeend', '<div id="probe" style="width:min(100rem, 50vw)">зонд</div>')
      const w = (root) => +root.querySelector('#probe').getBoundingClientRect().width.toFixed(1)
      return {
        doc: w(document),
        frame: w(fd),
        docViewport: document.documentElement.clientWidth,
        frameViewport: fd.documentElement.clientWidth,
      }
    },
    expect: (m) => {
      if (m.frameViewport !== 440) return `вьюпорт кадра ${m.frameViewport}, а не 440 — мерили не кадр (полоса прокрутки?)`
      if (m.docViewport < 500) return `окно ${m.docViewport} — слишком узкое, пара не про что`
      const wantFrame = +(m.frameViewport * 0.5).toFixed(1)
      if (Math.abs(m.frame - wantFrame) > 1) return `в кадре ${m.frame}, а 50vw от ${m.frameViewport} это ${wantFrame} — vw в кадре считает не от кадра`
      const wantDoc = +(m.docViewport * 0.5).toFixed(1)
      if (Math.abs(m.doc - wantDoc) > 1) return `в общем документе ${m.doc}, а 50vw от окна ${m.docViewport} это ${wantDoc} — vw в документе считает не от окна`
      if (Math.abs(m.frame - m.doc) < 1) return `кадр ${m.frame} совпал с документом ${m.doc} — вьюпорты не различаются, зонд ничего не доказывает`
      return true
    },
  },
  {
    name: 'Кадр не бутафория: position:fixed накрывает кадр, а не окно',
    why: 'подложка Drawer в общем документе накрывает всё окно поверх инструмента, а в кадре — ровно кадр. Второй механизм той же зависимости от вьюпорта: если однажды из Drawer уйдёт 90vw, этот случай останется',
    html: `
      <div id="host" style="width:320px"><div class="ds-drawer__overlay" id="o"></div></div>
      <iframe id="f" src="/" style="width:320px;height:260px;border:0"></iframe>`,
    measure: async () => {
      const f = document.getElementById('f')
      if (f.contentDocument.readyState !== 'complete') {
        await new Promise((r) => f.addEventListener('load', r, { once: true }))
      }
      const fd = f.contentDocument
      fd.body.insertAdjacentHTML('beforeend', '<div class="ds-drawer__overlay" id="o"></div>')
      const box = (root) => {
        const r = root.querySelector('#o').getBoundingClientRect()
        return [Math.round(r.width), Math.round(r.height)]
      }
      return {
        doc: box(document),
        frame: box(fd),
        window: [document.documentElement.clientWidth, document.documentElement.clientHeight],
        frameViewport: [fd.documentElement.clientWidth, fd.documentElement.clientHeight],
      }
    },
    expect: (m) => {
      const same = (a, b) => a[0] === b[0] && a[1] === b[1]
      if (!same(m.doc, m.window)) return `в общем документе подложка ${m.doc}, а окно ${m.window} — должна накрывать окно целиком`
      if (!same(m.frame, m.frameViewport)) return `в кадре подложка ${m.frame}, а вьюпорт кадра ${m.frameViewport}`
      if (same(m.doc, m.frame)) return `обе подложки одинаковы (${m.doc}) — кадр перестал быть отдельным вьюпортом`
      return true
    },
  },
  {
    name: 'Кадр верстака отдаёт компоненту кадр МИНУС поле хоста, и гейт знает это число не по памяти',
    why: 'DS-290. Гейт ставил хост РОВНО в заданную ширину, а кадр верстака несёт у `.wbf-host` поле 30px на сторону: на «кадре 360» (прежний пол, до DS-380) владелец смотрел контейнер 300, и самая узкая точка гейта была шире самой узкой точки человека — полоса между ними не измерялась ни разу, а зелёный на ней означал только это. Что числа гейта и кадра не сходятся по величине, законно и записано в CLAUDE.md; здесь расходился НАБОР ТОЧЕК. Теперь 30 читается из `workbench/frame.css` (`FRAME_PAD`), и случай проверяет само ЧТЕНИЕ — настоящей отрисовкой, а не арифметикой: правило в листе перепишут, а гейт продолжит считать по-старому, и разойтись они смогут молча. Кадр здесь НАСТОЯЩИЙ iframe, а не div: вьюпорт обязан остаться равным ширине кадра (на него смотрят `vw` и медиазапросы), а контейнер компонента — стать уже на поле хоста. Один div не различает эти две ширины вовсе — ровно та подмена, из которой дефект и вырос',
    // Ширина та же, что у пары «Кадр не бутафория» выше по смыслу, но здесь она
    // ЗНАЧАЩАЯ: 440 — ПОЛ поддерживаемой ширины экрана (DS-380,
    // `WIDTH_FLOOR` в `scripts/width-surface.mjs`, `workbench/frame-width.ts`),
    // самый узкий пресет верстака, а не «телефон» (JIG-29, было 360). Та
    // самая ширина, на которой владелец теперь смотрит находки; вся
    // арифметика ниже читает `FRAME_PAD`/`hostOf` живьём, а не литералом, и
    // переезд числа её не касается.
    html: `<iframe id="f" src="/" style="width:440px;height:220px;border:0"></iframe>`,
    measure: async () => {
      const f = document.getElementById('f')
      if (f.contentDocument.readyState !== 'complete') {
        await new Promise((r) => f.addEventListener('load', r, { once: true }))
      }
      const fd = f.contentDocument
      // Лист КАДРА, а не системы: `.wbf-host` живёт только в нём.
      const link = fd.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/workbench/frame.css'
      const loaded = new Promise((r) => link.addEventListener('load', r, { once: true }))
      fd.head.appendChild(link)
      await loaded
      fd.body.insertAdjacentHTML('beforeend', '<div class="wbf-host" id="host"><div id="kid"></div></div>')
      const host = fd.getElementById('host')
      const cs = fd.defaultView.getComputedStyle(host)
      return {
        viewport: fd.documentElement.clientWidth,
        host: +host.getBoundingClientRect().width.toFixed(2),
        // Блочный ребёнок хоста и есть содержащий блок компонента: ширину
        // компонент считает от него, а не от кадра.
        kid: +fd.getElementById('kid').getBoundingClientRect().width.toFixed(2),
        padLeft: cs.paddingLeft,
        padRight: cs.paddingRight,
        display: cs.display,
      }
    },
    expect: (m) => {
      if (m.display !== 'block') return `лист кадра не доехал: у .wbf-host display ${m.display}, а не block — все числа ниже про голый div`
      if (m.viewport !== 440) return `вьюпорт кадра ${m.viewport}, а не 440 — мерили не кадр (полоса прокрутки?)`
      if (m.host !== m.viewport) return `хост ${m.host} при кадре ${m.viewport} — поле хоста ВНУТРЕННЕЕ, снаружи он во всю ширину кадра`
      const side = `${FRAME_PAD / 2}px`
      if (m.padLeft !== side || m.padRight !== side) {
        return `у .wbf-host поле ${m.padLeft}/${m.padRight}, а гейт прочитал из frame.css ${side} на сторону — FRAME_PAD разошёлся с листом`
      }
      if (m.kid !== hostOf(m.viewport)) {
        return `в кадре ${m.viewport} компонент получил ${m.kid}, а гейт считает ${hostOf(m.viewport)} — арифметика hostOf разошлась с отрисовкой`
      }
      return true
    },
  },

  // ФОРС-СОСТОЯНИЯ (Задача 28). Три случая на один механизм, и разрез между
  // ними по предмету: красит ли он тем же, чем настоящее наведение; несёт ли
  // порядок вставки; честен ли счётчик пропущенных. Все трое гоняют НАСТОЯЩИЙ
  // `workbench/force-states.ts`, собранный в страницу (см. `bundleOf`), поверх
  // настоящего листа системы со всеми его `@import`, `@media` и `@container`.
  {
    name: 'Хром верстака: признак расхождения не двигает то, что справа от него',
    why: 'признак «расходится с сохранённым» появляется и пропадает по ходу правки раскладки, а стоит он ПОСЕРЕДИНЕ группы «Наборы» — перед списком чипов загрузки, «в файл» и «из файла». Появляясь, он сдвигал всё правее примерно на 110px, и целиться приходилось в движущуюся мишень: человек ведёт курсор к чипу набора, признак загорается, чип уезжает из-под курсора ([13] ручного QA). Место под признак резервируется всегда; проверка утверждает РАВЕНСТВО координат соседа справа при погашенном и зажжённом признаке, а не наличие правила — способ резервирования может смениться, а координата разъехаться не имеет права',
    extraSheet: 'workbench/shell.css',
    html: `
      <div class="wb">
        <div class="wb__bar">
          <span class="wb__group">
            <span class="wb__group-label">набор</span>
            <button type="button" class="wb__chip">сохранить</button>
            <span class="wb__group-label wb__drift wb__drift--off">расходится с сохранённым</span>
            <span class="wb__sep">·</span>
            <button type="button" class="wb__chip wb__chip--set" id="off-chip">заказ</button>
          </span>
        </div>
        <div class="wb__bar">
          <span class="wb__group">
            <span class="wb__group-label">набор</span>
            <button type="button" class="wb__chip">сохранить</button>
            <span class="wb__group-label wb__drift">расходится с сохранённым</span>
            <span class="wb__sep">·</span>
            <button type="button" class="wb__chip wb__chip--set" id="on-chip">заказ</button>
          </span>
        </div>
      </div>`,
    measure: () => {
      const x = (sel) => document.querySelector(sel).getBoundingClientRect().left
      const drift = document.querySelector('.wb__drift:not(.wb__drift--off)')
      return {
        off: x('#off-chip'), on: x('#on-chip'),
        driftW: drift.getBoundingClientRect().width,
      }
    },
    expect: (m) => {
      // Сосед с заведомо ненулевой шириной: признак, схлопнувшийся в ноль,
      // «не двигает» соседа по причине, которая проверку обессмысливает.
      if (m.driftW < 40) return `признак шириной ${m.driftW}px — мерить нечего`
      return m.off === m.on || `чип набора стоит на ${m.off}px без признака и на ${m.on}px с ним — сдвиг ${Math.abs(m.on - m.off)}px`
    },
  },
  {
    name: 'Док верстака: широкий экран достаётся сниппету, а не колонке крутилок',
    why: 'ширины дока были посчитаны под 1280 и сложились ровно в потолок; на 3840 те же 1050px — четверть экрана, а сниппет набора (962px содержимого) по-прежнему читался через перенос в колонке 250px. «Стало шире» — утверждение, верное на одной ширине окна и ложное на другой, поэтому обе ширины стоят В ОДНОЙ странице и сравниваются друг с другом: два дока рядом, узкий и широкий. Порознь каждый из них проходит любую проверку на «колонки помещаются»',
    extraSheet: 'workbench/shell.css',
    // 1050 и 3610 — доступное доку место на 1280 и на 3840 (минус хром окна,
    // как измерено в DS-128). Колонок крутилок четыре: столько даёт
    // фикстура с двадцатью крутилками, то есть самый плотный случай каталога.
    html: `
      <div class="wb">
        <div class="wb__dock" id="narrow" style="inline-size: 1050px">
          <div class="wb__dock-body">
            <div class="wb__dock-col wb__dock-col--cases"></div>
            <div class="wb__dock-col n-col"></div>
            <div class="wb__dock-col"></div>
            <div class="wb__dock-col"></div>
            <div class="wb__dock-col"></div>
            <div class="wb__dock-col wb__dock-col--right n-right"></div>
          </div>
        </div>
        <div class="wb__dock" id="wide" style="inline-size: 3610px">
          <div class="wb__dock-body">
            <div class="wb__dock-col wb__dock-col--cases"></div>
            <div class="wb__dock-col w-col"></div>
            <div class="wb__dock-col"></div>
            <div class="wb__dock-col"></div>
            <div class="wb__dock-col"></div>
            <div class="wb__dock-col wb__dock-col--right w-right"></div>
          </div>
        </div>
      </div>`,
    width: 3900,
    measure: () => {
      const w = (sel) => +document.querySelector(sel).getBoundingClientRect().width.toFixed(1)
      const sum = (id) => [...document.querySelectorAll('#' + id + ' .wb__dock-col')]
        .reduce((a, el) => a + el.getBoundingClientRect().width, 0)
      return {
        nCol: w('.n-col'), nRight: w('.n-right'), nSum: +sum('narrow').toFixed(1),
        wCol: w('.w-col'), wRight: w('.w-right'), wSum: +sum('wide').toFixed(1),
        // Корень нужен, чтобы потолок утверждался в rem — единице, в которой он
        // записан. См. довод у проверки потолка ниже.
        root: +parseFloat(getComputedStyle(document.documentElement).fontSize).toFixed(3),
      }
    },
    expect: (m) => {
      // Санитар: узкий док не переполнен. Колонки, вылезшие за свой док,
      // «выросли» бы на широком тоже — и рост означал бы не то.
      if (m.nSum > 1051) return `узкий док переполнен: колонки в сумме ${m.nSum}px при 1050px`
      // Остаток экрана уходит правой колонке, а не размазывается по крутилкам.
      if (m.wRight < m.nRight * 3) {
        return `правая колонка ${m.nRight}px на узком и ${m.wRight}px на широком — остаток экрана до неё не дошёл`
      }
      // Потолок держит: колонка крутилок шире стала, но не растянулась.
      //
      // В rem, а не в пикселях, и это не педантизм. Потолок записан как
      // `max-inline-size: 26rem`, а с DS-141 корень оболочки — 115%:
      // пиксельный порог 417.5, стоявший здесь, покраснел на 479.4px, хотя
      // потолок держал ровно так же, как держал. Порог, записанный не в той
      // единице, что проверяемое правило, ловит смену масштаба вместо
      // растянувшейся колонки — то есть отвечает на другой вопрос.
      //
      // 26.1, а не 26: потолок задан по КОНТЕНТНОМУ боксу, а у колонки есть
      // ещё хэйрлайн разделителя справа — 1px, то есть меньше десятой доли rem.
      const capRem = +(m.wCol / m.root).toFixed(3)
      if (capRem > 26.1) return `колонка крутилок растянулась до ${m.wCol}px (${capRem}rem при корне ${m.root}px) — потолок не держит`
      if (!(m.wCol > m.nCol)) return `колонка крутилок ${m.nCol}px и ${m.wCol}px — потолок так и остался константой под 1280`
      return true
    },
  },
  {
    name: 'Хром верстака: длинное имя набора не растягивает полосу тулбара',
    why: 'имя набору даёт человек, и «экран заказа со всеми колонками и подвалом» — законное имя. Чип загрузки не был ограничен ничем: одно такое имя растягивало группу «Наборы» на пол-экрана и выдавливало соседние группы на новую строку тулбара, отнимая высоту у кадра ([13] ручного QA). Проверка утверждает три вещи: длинное имя не шире потолка, текст при этом действительно не влез (иначе мерился бы короткий) и подрезка идёт МНОГОТОЧИЕМ — последнее единственное во всём замере утверждается правилом, а не эффектом, и вынужденно: ширины с `clip` и с `ellipsis` совпадают до пикселя, в тексте узла многоточия нет, API под него нет. Полное имя лежит в `title`, как у имени узла в прицеле',
    extraSheet: 'workbench/shell.css',
    html: `
      <div class="wb">
        <div class="wb__bar">
          <span class="wb__group">
            <button type="button" class="wb__chip wb__chip--set" id="short-name">заказ</button>
            <button type="button" class="wb__chip wb__chip--set" id="long-name"
                    title="экран заказа со всеми колонками и подвалом">экран заказа со всеми колонками и подвалом</button>
          </span>
        </div>
      </div>`,
    measure: () => {
      const el = document.querySelector('#long-name')
      return {
        short: document.querySelector('#short-name').getBoundingClientRect().width,
        long: el.getBoundingClientRect().width,
        clipped: el.scrollWidth > el.clientWidth,
        // ЕДИНСТВЕННОЕ УТВЕРЖДЕНИЕ ПРО ПРАВИЛО, А НЕ ПРО ЭФФЕКТ, во всём этом
        // замере — и вынужденно. Нарисованное многоточие ничем не читается:
        // ширины с `clip` и с `ellipsis` совпадают до пикселя, в тексте узла
        // его нет, отдельного API под него нет тоже. Мутация «снять
        // text-overflow» замер переживала, пока здесь стояла одна геометрия.
        ellipsis: getComputedStyle(el).textOverflow,
      }
    },
    expect: (m) => {
      if (m.long <= m.short) return `длинное имя не шире короткого (${m.long}px против ${m.short}px) — замер не про ширину`
      if (m.long > 260) return `чип с длинным именем ${m.long}px — потолка нет`
      if (!m.clipped) return 'текст не обрезан: имя влезло целиком, и проверка не про подрезку'
      return m.ellipsis === 'ellipsis' || `подрезка без многоточия (text-overflow: ${m.ellipsis}) — имя обрывается на букве, и «есть ещё» не сказано ничем`
    },
  },
  {
    name: 'Хром верстака: сегментный переключатель не налезает на соседнюю строку',
    why: 'у `.wb__ctl` была фиксированная `height: 1.625rem`, а у `.wb__ctl-enum` — `flex-wrap: wrap`: самый широкий переключатель каталога (`tone` у Stat: пустое значение плюс positive/negative/neutral) в колонку 280px не влезал, переносился и рисовался ПОВЕРХ соседней строки — [14] ручного QA. Утверждаются две разные вещи, и обе нужны: строка ВМЕЩАЕТ своё содержимое (это чинит перенос при любой ширине, в том числе у переключателя из шести значений, которого сегодня нет) и самый широкий НАСТОЯЩИЙ переключатель в одну строку и помещается (это и есть ширина колонки, выбранная замером, а не на глаз). Значения взяты из Stat.fixture.tsx дословно: набранный руками короткий список дал бы зелёное на любой ширине',
    extraSheet: 'workbench/shell.css',
    html: `
      <div class="wb">
        <div class="wb__dock-col">
          <div class="wb__dock-head">крутилки 3</div>
          <div class="wb__ctl" id="wide">
            <span class="wb__ctl-name">tone</span>
            <span class="wb__ctl-enum" id="wide-enum">
              <button type="button" class="wb__chip" id="chip"></button>
              <button type="button" class="wb__chip">positive</button>
              <button type="button" class="wb__chip">negative</button>
              <button type="button" class="wb__chip">neutral</button>
            </span>
          </div>
          <div class="wb__ctl" id="short">
            <span class="wb__ctl-name">size</span>
            <span class="wb__ctl-enum" id="short-enum">
              <button type="button" class="wb__chip">s</button>
              <button type="button" class="wb__chip">m</button>
            </span>
          </div>
          <!-- ПЕРЕКЛЮЧАТЕЛЬ, КОТОРОГО В КАТАЛОГЕ НЕТ, и он тут обязателен.
               Без него вторая половина проверки («строка вмещает содержимое»)
               НЕДОСТИЖИМА: на выбранной ширине настоящий переключатель не
               переносится, значит строке нечего вмещать сверх одной, и мутация
               «вернуть фиксированную height» замер переживала. Поймано ею же. -->
          <div class="wb__ctl" id="over">
            <span class="wb__ctl-name">variant</span>
            <span class="wb__ctl-enum" id="over-enum">
              <button type="button" class="wb__chip">positive</button>
              <button type="button" class="wb__chip">negative</button>
              <button type="button" class="wb__chip">neutral</button>
              <button type="button" class="wb__chip">informative</button>
              <button type="button" class="wb__chip">destructive</button>
              <button type="button" class="wb__chip">emphasized</button>
            </span>
          </div>
        </div>
      </div>`,
    measure: () => {
      const h = (sel) => document.querySelector(sel).getBoundingClientRect().height
      return {
        col: document.querySelector('.wb__dock-col').getBoundingClientRect().width,
        row: h('#wide'), rowEnum: h('#wide-enum'), chip: h('#chip'),
        shortRow: h('#short'), shortEnum: h('#short-enum'),
        overRow: h('#over'), overEnum: h('#over-enum'),
      }
    },
    expect: (m) => {
      // Сосед с заведомо однострочным переключателем: если и он оказался в две
      // строки, мерится не перенос, а что-нибудь сломанное у обоих.
      if (m.shortEnum > m.chip + 1) {
        return `короткий переключатель тоже перенёсся (${m.shortEnum}px при чипе ${m.chip}px) — замер не про перенос`
      }
      if (m.rowEnum > m.chip + 1) {
        return `самый широкий переключатель каталога перенёсся в колонке ${m.col}px: ${m.rowEnum}px при чипе ${m.chip}px`
      }
      if (m.row < m.rowEnum) {
        return `строка ${m.row}px ниже своего содержимого ${m.rowEnum}px — переключатель нарисуется поверх соседней`
      }
      // Заведомо переносящийся переключатель: он и делает утверждение выше
      // достижимым. Сначала убеждаемся, что он ПРАВДА перенёсся, иначе «строка
      // вмещает содержимое» снова окажется про одну строку.
      if (m.overEnum <= m.chip + 1) {
        return `нарочно широкий переключатель не перенёсся (${m.overEnum}px) — вмещать нечего, замер не про высоту строки`
      }
      if (m.overRow < m.overEnum) {
        return `перенёсшийся переключатель не вместился: строка ${m.overRow}px, содержимое ${m.overEnum}px`
      }
      return true
    },
  },
  {
    name: 'Хром верстака: полоса состояния не меняет высоту, когда в ней появляется сообщение',
    why: 'полоса стоит в разметке всегда и пустеет по таймеру ([10] ручного QA, DS-128) — а `display:flex` без детей схлопывается до одних отступов. Тогда каждое появление и гашение сообщения двигало бы кадр по вертикали на высоту строки, причём гашение — через шесть секунд после действия, то есть ровно когда в кадр уже целятся (тот же шов, что горел в DS-126). Проверка утверждает РАВЕНСТВО высот пустой и однострочной, а не наличие `min-block-size`: значение может смениться вместе со шрифтом, а разойтись эти две высоты не имеют права никогда',
    extraSheet: 'workbench/shell.css',
    html: `
      <div class="wb">
        <div class="wb__bar">
          <div class="wb__note" id="empty"></div>
        </div>
        <div class="wb__bar">
          <div class="wb__note" id="full"><span>набор «экран заказа» сохранён, мест: 12</span></div>
        </div>
        <!-- Контрольный сосед: две строки ОБЯЗАНЫ быть выше одной, иначе
             мерится не высота, а что-нибудь схлопнутое в ноль у всех троих.
             Перенос вызван узкой полосой, а не двумя узлами: перенос флексом
             при широком контейнере кладёт оба span в одну строку, и первая
             редакция этого замера получила 21px против 21px на здоровом коде.
             (Обратных кавычек тут быть не может: разметка живёт в шаблонной
             строке JS, и первая же закрыла бы её посреди комментария.) -->
        <div class="wb__bar" style="inline-size:60px">
          <div class="wb__note" id="two">
            <span>первое сообщение подлиннее</span>
            <span class="wb__note-line">и второе тоже</span>
          </div>
        </div>
      </div>`,
    measure: () => {
      const h = (sel) => document.querySelector(sel).getBoundingClientRect().height
      return { empty: h('#empty'), full: h('#full'), two: h('#two') }
    },
    expect: (m) => {
      if (m.empty !== m.full) return `пустая ${m.empty}px против однострочной ${m.full}px — появление сообщения двигает кадр`
      // Сосед с заведомо ИНОЙ высотой: если и он совпал, мерится не высота, а
      // что-нибудь схлопнутое в ноль у всех троих.
      if (m.two <= m.full) return `две строки (${m.two}px) не выше одной (${m.full}px) — замер не про высоту`
      return true
    },
  },
  {
    name: 'Хром верстака: погашенная крутилка отличима от живой',
    why: 'ровно этот дефект уже стоил линии защиты: чип «убрать» стоял `disabled` с комментарием «гасим, а не прячем», а гасить было нечем — браузер приглушает текст своим цветом, но `.wb__chip` задаёт `color` явно и перекрывает его. В [3] ручного QA (DS-128) `disabled` появился ещё у трёх контролов хрома — полей крутилок, — и `.wb__ctl-input` задаёт `color` точно так же. Утверждение поэтому не «атрибут стоит» (он стоит и ничего не значит), а «цвет разошёлся». Чип проверяется рядом не для полноты: без него мутация «снять правило .wb__chip:disabled» вернула бы старый дефект молча',
    extraSheet: 'workbench/shell.css',
    html: `
      <div class="wb">
        <input class="wb__ctl-input" id="l-text" value="Ромашка">
        <input class="wb__ctl-input" id="d-text" value="Ромашка" disabled>
        <input class="wb__ctl-input" type="number" id="l-num" value="3">
        <input class="wb__ctl-input" type="number" id="d-num" value="3" disabled>
        <button type="button" class="wb__chip" id="l-chip">чип</button>
        <button type="button" class="wb__chip" id="d-chip" disabled>чип</button>
      </div>`,
    measure: () => {
      const c = (sel) => getComputedStyle(document.querySelector(sel)).color
      return {
        lText: c('#l-text'), dText: c('#d-text'),
        lNum: c('#l-num'), dNum: c('#d-num'),
        lChip: c('#l-chip'), dChip: c('#d-chip'),
      }
    },
    // Проверяется РАСХОЖДЕНИЕ пары, а не попадание в конкретный токен: цвет
    // приглушения хрома — его дело и может смениться, а вот совпасть с живым
    // он не имеет права никогда. Пары три, потому что правил тоже могло
    // оказаться три разных, и одно забытое — это один контрол, который врёт.
    //
    // ЧЕКБОКСА ЗДЕСЬ НЕТ НАМЕРЕННО: его выключенный вид рисует браузер, и в
    // `getComputedStyle` он не виден вовсе — утверждать про него этим замером
    // нечего, а утверждение «цвет тот же» было бы правдой на здоровом коде.
    expect: (m) => {
      const same = Object.entries({
        'текстовое поле': [m.lText, m.dText],
        'числовое поле': [m.lNum, m.dNum],
        чип: [m.lChip, m.dChip],
      }).filter(([, [a, b]]) => a === b)
      return same.length === 0
        || `погашенное не отличается от живого: ${same.map(([k, [a]]) => `${k} → ${a}`).join('; ')}`
    },
  },
  {
    name: 'Хром верстака: фокус виден на своей подложке и не путается с наведением',
    why: 'до фазы 5 `:focus-visible` в хроме не встречался ВООБЩЕ, и фокус держался на кольце браузера. Замерено: Chrome отдаёт `auto 1px rgb(16, 16, 16)` на тёмной подложке хрома контрастом 1.05 — то есть клавиатура не показана ничем. Поэтому утверждение не «обвод есть», а «обвод виден на СВОЕЙ подложке» — иначе проверка проходила бы и без единой строки CSS, на кольце браузера (так и было в первой редакции этого случая). Разметка держит два блока `.wb`, один с `data-theme="dark"`: с DS-125 у хрома тем НЕТ, и второй блок здесь не про тему, а про то, что чужой атрибут его не красит — подложки обязаны совпасть, иначе замер третьего блока (`#dark`) молча мерил бы другой цвет',
    extraSheet: 'workbench/shell.css',
    // Порядок в списке — порядок Tab, то есть порядок разметки. Чип позиции
    // здесь не для полноты: до этой правки он был единственной кнопкой хрома,
    // не отвечавшей на курсор ВООБЩЕ, и без него мутация «снять у него
    // наведение» проходила бы незамеченной.
    //
    // Рукоятка дока (DS-126) стоит здесь по прямому правилу
    // docs/writing-checks.md: правка доступности СОЗДАЁТ состояние там, где
    // его не было. Разделитель до этой задачи не существовал вовсе, а
    // появившись — получил `tabindex` и собственное наведение, красящее
    // ПОДЛОЖКУ (`--wb-border`). Совпади канал фокуса с каналом наведения —
    // клавиатура доезжала бы и молчала: разметка на месте, фокус ловится,
    // показать его нечем. Утверждение обязано быть про различимость трёх
    // состояний, а не про наличие обвода.
    //
    // Обёртка настоящая (`.wb__dock-wrap`, `position: relative`), а не
    // `<div>` с инлайновым стилем: рукоятка позиционируется абсолютно и без
    // позиционированного предка уехала бы к краю документа — `page.hover`
    // целился бы мимо, а замер остался бы правдоподобным.
    focusVsHover: ['#light', '#slot', '#grip', '#dark'],
    html: `
      <div class="wb">
        <button type="button" class="wb__chip" id="light">чип</button>
        <button type="button" class="wb__slot-chip wb__slot-chip--empty" id="slot">пусто</button>
        <div class="wb__dock-wrap" style="block-size:40px;margin-block-start:12px">
          <div class="wb__dock-grip" id="grip" role="separator" aria-orientation="horizontal"
               aria-label="Высота панели" aria-valuenow="340" aria-valuemin="76"
               aria-valuemax="640" tabindex="0"></div>
        </div>
      </div>
      <div class="wb" data-theme="dark"><button type="button" class="wb__chip" id="dark">чип</button></div>`,
    expect: (m) => {
      for (const [sel, st] of Object.entries(m.states)) {
        if (!st.focus.focused) return `${sel}: Tab привёл не сюда — замер не про фокус`
        if (st.rest.bg === st.hover.bg) return `${sel}: наведение не меняет подложку (${st.rest.bg})`
        if (st.focus.outline === st.rest.outline) return `${sel}: фокус не меняет обвод (${st.rest.outline})`
        if (st.focus.outline === st.hover.outline) return `${sel}: обвод под фокусом и под курсором одинаков`
        // Через «как видно» (DS-209): обвод и подложка берутся сложенными
        // с `opacity` предков, а не номинальными. Сегодня в хроме верстака
        // прозрачности нет, и число не меняется — но появись она, номинальная
        // пара осталась бы зелёной ровно тогда, когда обвода не видно.
        const hostBg = seenPair(st.focus.hostSeen).background
        const line = seenOn(st.focus.outlineSeen, hostBg)
        const k = contrastOf(line, hostBg)
        if (k < 3) return `${sel}: обвод ${line} на подложке ${hostBg} даёт ${k.toFixed(2)} при нужных 3`
      }
      return true
    },
  },
  {
    name: 'Блок JSX: сниппет всего набора укладывается в свою колонку, а не уезжает вбок',
    why: 'колонка блока — `.wb__dock-col--right`, то есть 15.625rem, и это НЕ подстраивается под окно: замерено в живом хроме при окне 3339px — те же 250px. Сниппет всего набора (DS-128, шаг 7) даёт при этом 962px содержимого, то есть видно четверть самой длинной строки, а добраться до остального можно только протащив блок мышкой. Блок стоит здесь ровно затем, чтобы ПОСМОТРЕТЬ перед копированием; нечитаемый он превращается в украшение над кнопкой. Утверждение — про ширину содержимого против ширины колонки, а не про наличие `white-space` в стилях: значение свойства ничего не обещает, пока не спрошено, влезло ли',
    extraSheet: 'workbench/shell.css',
    // Настоящий `canvasSnippetOf`, а не его вчерашний вывод строкой в кейсе:
    // строку никто не обновит, когда контейнер сетки получит пятое свойство,
    // и санитар останется зелёным ровно в тот день, когда он нужен.
    bundle: 'workbench/jsx-snippet.ts',
    html: `
      <div class="wb"><div class="wb__dock-col wb__dock-col--right">
        <pre class="wb__dock-jsx" id="jsx"></pre>
      </div></div>`,
    measure: () => {
      // Пара мест — та же, что стоит на канвасе по умолчанию, с покрученным
      // как в живом прогоне: пустой набор дал бы короткие строки и влез бы
      // при любом `white-space`, то есть проверка была бы неопровержимой.
      const spots = [
        { id: 'table', component: 'DataTable', caseId: 'row-open', col: 1, span: 12, props: {}, data: null },
        { id: 'pages', component: 'Pagination', caseId: 'base', col: 1, span: 12, props: {}, data: null },
      ]
      const kase = (id, values) => ({ id, title: id, values, slots: {} })
      const metaById = {
        // `prop` и `unexpressed` ПОВТОРЯЮТ настоящие фикстуры (DS-128), а
        // не проставлены «чтобы не падало»: у DataTable `emptyText` — это
        // `emptyContent` у компонента, `clickable` пропом не выражается вовсе,
        // а `rows` задан фикстурой и строкой не выразим. Соврав здесь, санитар
        // мерил бы более короткий сниппет, чем видит человек, — то есть
        // проходил бы ровно в том случае, ради которого написан.
        table: {
          name: 'DataTable', group: 'g', data: [], slots: {}, unexpressed: ['rows'],
          controls: { emptyText: { kind: 'text', prop: 'emptyContent' }, clickable: { kind: 'bool', prop: false } },
          cases: [kase('row-open', { emptyText: 'Данных нет', clickable: 'true' })],
        },
        pages: {
          name: 'Pagination', group: 'g', data: [], slots: {}, unexpressed: [],
          controls: {
            page: { kind: 'number', prop: true }, pageCount: { kind: 'number', prop: true },
            variant: { kind: 'text', prop: true },
            total: { kind: 'number', prop: true }, pageSize: { kind: 'number', prop: true },
          },
          cases: [kase('base', { page: '3', pageCount: '18', variant: 'pages', total: '347', pageSize: '20' })],
        },
      }
      const el = document.getElementById('jsx')
      el.textContent = WB.canvasSnippetOf(spots, metaById)
      const lines = el.textContent.split('\n')
      // СТРОКИ КОНТЕЙНЕРА И ОБЁРТОК ОТБРОШЕНЫ. Их длина и количество —
      // константы функции: восемь строк и ~120 знаков даёт сама обёртка, даже
      // когда внутри нет ни одного компонента. Считать по ним «мерили набор»
      // значило бы, что страж проходит на любом входе, включая набор из одних
      // отказов (поймано ревью: подмена `metaById` на `{}` оставляла санитар
      // зелёным при нуле тегов и двух `undefined`).
      const body = lines.filter((l) => !l.includes('style={{'))
      return {
        col: el.clientWidth,
        content: el.scrollWidth,
        tags: body.filter((l) => /^\s*<[A-Z]/.test(l)).length,
        longestTag: Math.max(0, ...body.map((l) => l.length)),
      }
    },
    expect: (m) => {
      // Сначала — что мерили не пустоту. Сниппет из одной короткой строки влез
      // бы и с `white-space: pre`, и проверка прошла бы, ничего не утверждая.
      // Утверждается НАЛИЧИЕ ТЕГОВ, а не число строк: строки даёт обёртка.
      if (m.tags < 2) return `в сниппете ${m.tags} тегов компонентов — это не набор, замер не о чём`
      if (m.longestTag < 40) return `самая длинная строка НЕ СЧИТАЯ контейнера — ${m.longestTag} знаков; такой сниппет влез бы и с прокруткой`
      // Единица допуска: `scrollWidth` округляет вверх, и на дробной ширине
      // колонки честно влезшее содержимое даёт на пиксель больше.
      if (m.content > m.col + 1) return `содержимое ${m.content}px в колонке ${m.col}px — блок уезжает вбок на ${m.content - m.col}px`
      return true
    },
  },
  {
    name: 'Прицел: самое длинное имя системы целиком видно на бейдже, а тулбар его режет',
    why: 'после снятия порога MAX_CLASSES (30.08.2026) имя печатается целиком, и замысел держится на РАЗДЕЛЕНИИ ТРУДА: тулбар — превью и режет, бейдж над узлом — ответ и не режет никогда. Первая редакция этого санитара утверждала обратное («половина «узел» влезает в тулбар») и была зелена только потому, что её множество — две строки, набранные руками из одного холста: настоящий `Avatar` с `presence` даёт четыре класса, `Button` с `tone` и `iconOnly` — пять, и половина «узел» у них 353px и больше при бюджете 288. Утверждать надо не «влезает», а «не влезает В ТУЛБАР и влезает НА БЕЙДЖЕ» — иначе отдушина, на которой стоит решение, не проверена ничем, а проверено ложное. Порядок слов (место в хвосте) держит юнит `aim.test.ts`, здесь только пиксели',
    extraSheet: ['workbench/shell.css', 'workbench/frame.css'],
    extraLink: 'ds.css',
    // Бейдж вынут из своего `position: absolute`, иначе у него нет
    // содержащего блока и `clientWidth` мерил бы не то. Всё остальное —
    // шрифт, размер, отступы — настоящее, из `frame.css`.
    extraCss: '.probe-badge { position: static; display: inline-block }',
    bundle: 'workbench/aim.ts',
    html: `
      <div class="wb"><span class="wb__mono wb__aim-node" id="bar"></span></div>
      <span class="wbf-aim__label probe-badge" id="badge"></span>`,
    measure: () => {
      // Классы НАСТОЯЩИЕ, из src/components: Avatar.tsx:66 и Button.tsx:84-88.
      // Строку строит настоящий `describeNode` — вписанная руками разошлась бы
      // с кодом молча, чем первая редакция и болела.
      const t = document.createElement('template')
      t.innerHTML =
        '<div data-wb-spot="pages">' +
        '<span class="ds-avatar ds-avatar--md ds-avatar--neutral ds-avatar--presence-busy"></span>' +
        '<button class="ds-btn ds-btn--ghost ds-btn--sm ds-btn--tone-error ds-btn--icon"></button>' +
        '</div>'
      const bar = document.getElementById('bar')
      const badge = document.getElementById('badge')
      const out = {}
      for (const sel of ['span', 'button']) {
        const name = WB.describeNode(t.content.querySelector(sel))
        bar.textContent = name
        badge.textContent = name
        out[sel] = {
          name,
          // `scrollWidth` отдаёт ширину СОДЕРЖИМОГО и при включённой обрезке —
          // единственный способ спросить «сколько бы заняло целое».
          barBudget: bar.clientWidth,
          barContent: bar.scrollWidth,
          badgeBox: badge.clientWidth,
          badgeContent: badge.scrollWidth,
          badgeEllipsis: getComputedStyle(badge).textOverflow,
          // САНИТАР НА САМ ЛИСТ. «Не обрезается» верно и для голого `<span>`
          // без единого правила — то есть кейс, забывший подключить
          // `frame.css`, прошёл бы зелёным, ничего не проверив (мутация
          // «убрать лист из extraSheet» это и показала). Подложка бейджа
          // задана только в `frame.css` (`background: #111`); прозрачная
          // значит, что мерили не бейдж, а пустой span.
          badgeBg: getComputedStyle(badge).backgroundColor,
        }
      }
      return out
    },
    expect: (m) => {
      for (const [sel, r] of Object.entries(m)) {
        // Санитар на сам замер: если бы имя влезало в тулбар, второе
        // утверждение (бейдж спасает) было бы неопровержимым.
        if (r.barContent <= r.barBudget) {
          return `${sel}: «${r.name}» влезает в тулбар (${r.barContent} в ${r.barBudget}) — бейдж ничего не спасает, случай не о чём`
        }
        // ГЛАВНОЕ: бейдж показывает то же имя ЦЕЛИКОМ. На нём стоит всё
        // решение — и снятие порога, и место в хвосте строки тулбара.
        if (r.badgeContent > r.badgeBox) {
          return `${sel}: бейдж режет «${r.name}» (${r.badgeContent} в ${r.badgeBox}) — целого имени не видно НИГДЕ`
        }
        if (r.badgeEllipsis === 'ellipsis') {
          return `${sel}: у бейджа text-overflow: ellipsis — он перестал быть отдушиной`
        }
        if (/transparent|rgba\(0, 0, 0, 0\)/.test(r.badgeBg)) {
          return `${sel}: подложка бейджа ${r.badgeBg} — правила .wbf-aim__label не приложились, мерили голый span`
        }
      }
      return true
    },
  },
  {
    name: 'Прицел: бейдж не растит ширину прокрутки кадра — кадр мерит компонент, а не инструмент',
    why: 'находка [5] ручного QA: щелчок прицелом по кнопке листалки у правого края давал кадру горизонтальную полосу, которой до щелчка не было — scrollWidth 875 при clientWidth 768. Кадр 768 существует ровно ради вопроса «лезет ли что-нибудь за 768?», и прицел отвечал на него собственным присутствием: человек видит полосу и заводит баг на вёрстку, которой нет, либо привыкает к полосе и перестаёт замечать настоящее переполнение. Случай меряет ОБА состояния — без прижатия и с ним, — потому что одно «влезает» неотличимо от «переполнения и не было»: если бейдж перестанет вылезать сам по себе (укоротят имя, сузят шрифт), санитар обязан покраснеть, а не тихо проходить',
    extraSheet: 'workbench/frame.css',
    extraLink: 'ds.css',
    bundle: 'workbench/aim.ts',
    html: `
      <div id="frame" style="inline-size:768px;position:relative;overflow:auto">
        <div style="block-size:120px"></div>
        <div class="wbf-aim" id="box" style="transform:translate(700px,60px);inline-size:44px;block-size:24px">
          <span class="wbf-aim__label wbf-mono" id="label"></span>
        </div>
      </div>`,
    measure: () => {
      const frame = document.getElementById('frame')
      const label = document.getElementById('label')
      // Имя строит настоящий `describeNode` из настоящих классов листалки —
      // то самое, на котором отчёт и намерил 875.
      const t = document.createElement('template')
      t.innerHTML = '<div data-wb-spot="pages"><button class="ds-pager__btn is-active"></button></div>'
      label.textContent = WB.describeNode(t.content.querySelector('button'))
      const frameW = frame.clientWidth
      label.style.marginInlineStart = '0px'
      const loose = frame.scrollWidth
      // Левый край МЕРИТСЯ, тем же способом, что в кадре: вывод его из правил
      // (`transform` минус рамка плюс отступ) — второе описание того же CSS, и
      // оно уже один раз разошлось с ним на 2px.
      const r = label.getBoundingClientRect()
      const left = r.left - frame.getBoundingClientRect().left + frame.scrollLeft
      const shift = WB.labelShiftOf(left, r.width, frameW)
      label.style.marginInlineStart = shift + 'px'
      const pinned = frame.scrollWidth
      return { name: label.textContent, frameW, labelW: r.width, labelLeft: left, loose, pinned, shift }
    },
    expect: (m) => {
      // САНИТАР НА САМ ЗАМЕР. Не вылезай бейдж без прижатия — второе
      // утверждение было бы неопровержимым.
      if (m.loose <= m.frameW) {
        return `бейдж «${m.name}» (${m.labelW}px) на 700px не вылезает за ${m.frameW} и без прижатия (${m.loose}) — случай ничего не проверяет`
      }
      if (m.shift >= 0) return `прижатие дало сдвиг ${m.shift} — бейдж не двинулся`
      if (m.pinned > m.frameW) {
        return `после прижатия ширина прокрутки ${m.pinned} при кадре ${m.frameW} — прицел по-прежнему растит полосу`
      }
      return true
    },
  },
  {
    name: 'Прицел: двойной контур читается и на белом, и на чёрном, в обеих темах',
    why: 'рамка прицела лежит ПОВЕРХ предмета изучения — компонента, чей фон может совпасть с любым цветом темы. Одноцветная рамка на таком фоне исчезает ровно тогда, когда она нужнее всего. Пара «тёмная линия + светлая обводка» держится на том, что цвета фиксированные (#111 и #fff), а не токены: `--ds-text-primary` в тёмной теме светлый, и белая обводка под светлой линией дала бы кашу. Санитар краснеет, если кто-то заменит их на токены',
    extraSheet: 'workbench/frame.css',
    html: `
      <div id="lightbox"><div class="wbf-aim" id="a1" style="inline-size:40px;block-size:20px"></div></div>
      <div id="darkbox" data-theme="dark"><div class="wbf-aim" id="a2" style="inline-size:40px;block-size:20px"></div></div>`,
    measure: () => {
      const read = (sel) => {
        const cs = getComputedStyle(document.querySelector(sel))
        return { line: cs.borderTopColor, halo: cs.outlineColor }
      }
      return { light: read('#a1'), dark: read('#a2') }
    },
    expect: (m) => {
      for (const [theme, r] of Object.entries(m)) {
        // Две линии обязаны отличаться друг от друга: на этом и держится
        // «видно на любом фоне» — какой бы ни был фон, одна из них к нему
        // контрастна.
        //
        // БЕЗ «как видно» намеренно (DS-209): утверждение здесь не про
        // элемент на подложке, а про ПАРУ ЗНАЧЕНИЙ — линия против обводки и обе
        // против названных белого и чёрного. Подложки в вопросе нет вовсе,
        // складывать не с чем.
        const pair = contrastOf(r.line, r.halo)
        if (pair < 3) return `${theme}: линия ${r.line} и обводка ${r.halo} дают ${pair.toFixed(2)} — контур одноцветный`
        const onWhite = contrastOf(r.line, 'rgb(255, 255, 255)')
        if (onWhite < 3) return `${theme}: на белом фоне линия ${r.line} даёт ${onWhite.toFixed(2)}`
        const onBlack = contrastOf(r.halo, 'rgb(0, 0, 0)')
        if (onBlack < 3) return `${theme}: на чёрном фоне обводка ${r.halo} даёт ${onBlack.toFixed(2)}`
      }
      return true
    },
  },
  {
    name: 'Вкладка axe: узел стоит рядом с нарушением, а не у противоположного края',
    why: 'док во всю ширину окна — это 1440px, и узел, прижатый к концу строки, отрывается от правила и текста на километр: глаз читает «empty-table-header … » и ищет продолжение где-то в другом конце экрана. Строка обязана читаться слева направо одним движением: правило → что не так → где. Санитар меряет ОТСТУП узла от начала, а не порядок узлов в разметке: порядок был правильным и в той редакции, которая читалась плохо',
    extraSheet: 'workbench/shell.css',
    html: `
      <div class="wb__dock-body wb__dock-body--axe" style="inline-size:1200px">
        <ol class="wb__flaws"><li class="wb__flaw">
          <span class="wb__flaw-id">empty-table-header</span>
          <span class="wb__flaw-help">Table header text should not be empty</span>
          <span class="wb__flaw-nodes" id="nodes">th</span>
        </li></ol>
      </div>`,
    measure: () => {
      const row = document.querySelector('.wb__flaw').getBoundingClientRect()
      const nodes = document.querySelector('#nodes').getBoundingClientRect()
      return { rowLeft: row.left, rowWidth: row.width, nodesLeft: nodes.left }
    },
    expect: (m) => {
      const offset = m.nodesLeft - m.rowLeft
      if (offset > m.rowWidth / 2)
        return `узел начинается на ${offset.toFixed(0)}px из ${m.rowWidth.toFixed(0)}px строки — он оторван от текста`
      return true
    },
  },
  {
    name: 'Слой axe: контур совпадает с узлом, который обводит',
    why: 'размеры контуру задаёт JS из `getBoundingClientRect()` узла, а рамка 2px без `border-box` прибавляется СНАРУЖИ — контур выходит на 4px шире и выше узла, то есть левая линия уходит внутрь узла, а правая на 2-4px наружу. На иконке 16px это четверть элемента. Скоуп `box-sizing` в tokens.css идёт по префиксу `ds-`, а слои кадра носят `wbf-` — под общее правило системы они не попадают по построению, и это надо было заметить, а не унаследовать. Тот же дефект был у рамки прицела',
    extraSheet: 'workbench/frame.css',
    html: `
      <button id="node" style="inline-size:40px;block-size:20px;padding:0;border:0">x</button>
      <div class="wbf-flaw" id="flaw"></div>
      <div class="wbf-aim" id="aim"></div>`,
    measure: () => {
      // Ровно то, что делает кадр: размеры контура берутся из прямоугольника
      // УЗЛА. Сравнение с собственным inline-размером проверяло бы `box-sizing`
      // и называло бы это согласием двух элементов, которого в случае нет.
      const node = document.querySelector('#node').getBoundingClientRect()
      const box = (sel) => {
        const el = document.querySelector(sel)
        el.style.inlineSize = `${node.width}px`
        el.style.blockSize = `${node.height}px`
        const r = el.getBoundingClientRect()
        return { w: r.width, h: r.height }
      }
      return { node: { w: node.width, h: node.height }, flaw: box('#flaw'), aim: box('#aim') }
    },
    expect: (m) => {
      for (const name of ['flaw', 'aim']) {
        const r = m[name]
        if (Math.abs(r.w - m.node.w) > 0.5 || Math.abs(r.h - m.node.h) > 0.5)
          return `${name}: узел ${m.node.w.toFixed(1)}×${m.node.h.toFixed(1)}, контур ${r.w.toFixed(1)}×${r.h.toFixed(1)} — рамка снаружи, обводится не тот прямоугольник`
      }
      return true
    },
  },
  {
    name: 'Вкладка axe: заметки идут одним блоком, а не разъезжаются на отдельные',
    why: 'заметки под списком — `<p>`, и без явного обнуления они несут браузерные `1em` сверху и снизу; в флекс-колонке поля не схлопываются, поэтому между двумя заметками встаёт 24px при строке в 16px. В теле дока высотой 150px это не косметика: две строки, которые вместе отвечают на один вопрос («чего слой не смотрел»), читаются как два несвязанных сообщения. Все соседи в файле (`wb__dock-empty`, `wb__flaws`, `wb__stops`) обнуляют поля явно — этот класс пропустили',
    extraSheet: 'workbench/shell.css',
    html: `
      <div class="wb__dock-body wb__dock-body--axe" style="inline-size:600px">
        <p class="wb__dock-note wb__dock-note--axe" id="n1">не решено: color-contrast</p>
        <p class="wb__dock-note wb__dock-note--axe" id="n2">axe ловит меньше трети</p>
      </div>`,
    measure: () => {
      const a = document.querySelector('#n1').getBoundingClientRect()
      const b = document.querySelector('#n2').getBoundingClientRect()
      const line = parseFloat(getComputedStyle(document.querySelector('#n1')).lineHeight)
      return { gap: b.top - a.bottom, line }
    },
    expect: (m) =>
      m.gap <= m.line
        ? true
        : `между заметками ${m.gap.toFixed(1)}px при строке ${m.line.toFixed(1)}px — они читаются как отдельные блоки`,
  },
  {
    name: 'Вкладка axe: заметка стоит ПОД списком, а не сбоку от него',
    why: 'тело дока — флекс-РЯД (там четыре колонки панели), и вкладка axe кладёт в него три блока подряд: список нарушений и две заметки. В ряду они встают друг рядом с другом, и постоянная строка «axe ловит меньше трети» оказывается сбоку от нарушений — то есть читается как их продолжение, а не как оговорка ко всей вкладке. Поймано глазами на живом верстаке; jsdom этого не видит вовсе',
    extraSheet: 'workbench/shell.css',
    html: `
      <div class="wb__dock-body wb__dock-body--axe" style="inline-size:600px">
        <ol class="wb__flaws" id="list"><li class="wb__flaw"><span class="wb__flaw-id">button-name</span></li></ol>
        <p class="wb__dock-note wb__dock-note--axe" id="note">axe ловит меньше трети</p>
      </div>`,
    measure: () => {
      const box = (sel) => {
        const r = document.querySelector(sel).getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, left: r.left }
      }
      return { list: box('#list'), note: box('#note') }
    },
    expect: (m) => {
      if (m.note.top < m.list.bottom)
        return `заметка начинается на ${m.note.top.toFixed(1)}, а список кончается на ${m.list.bottom.toFixed(1)} — они в одном ряду`
      if (Math.abs(m.note.left - m.list.left) > 1)
        return `заметка отступила от списка на ${(m.note.left - m.list.left).toFixed(1)}px — она не под ним`
      return true
    },
  },
  {
    name: 'Слой axe: контур нарушения читается на любом фоне и отличим от прицела',
    why: 'контур нарушения лежит поверх компонента ровно как рамка прицела, и включают эти два слоя ВМЕСТЕ — значит различать их приходится глазами, на живом экране, а не по памяти. Единственное, чем они расходятся, — стиль линии (штрих против сплошной): цветом нельзя, потому что цветом здесь ничего не кодируется, а серьёзность нарушения — упорядоченная величина, которой цвет запрещён законом системы. Санитар краснеет, если контуры сравняются по стилю или если кто-то заменит фиксированные #111/#fff на токены темы',
    extraSheet: 'workbench/frame.css',
    html: `
      <div id="lightbox">
        <div class="wbf-flaw" id="f1" style="inline-size:40px;block-size:20px"></div>
        <div class="wbf-aim" id="m1" style="inline-size:40px;block-size:20px"></div>
      </div>
      <div id="darkbox" data-theme="dark">
        <div class="wbf-flaw" id="f2" style="inline-size:40px;block-size:20px"></div>
        <div class="wbf-aim" id="m2" style="inline-size:40px;block-size:20px"></div>
      </div>`,
    measure: () => {
      const read = (sel) => {
        const cs = getComputedStyle(document.querySelector(sel))
        return { line: cs.borderTopColor, halo: cs.outlineColor, style: cs.borderTopStyle }
      }
      return {
        light: { flaw: read('#f1'), aim: read('#m1') },
        dark: { flaw: read('#f2'), aim: read('#m2') },
      }
    },
    expect: (m) => {
      // Как у прицела: пара значений против названных белого и чёрного,
      // подложки в вопросе нет — «как видно» не применяется (DS-209).
      for (const [theme, r] of Object.entries(m)) {
        const pair = contrastOf(r.flaw.line, r.flaw.halo)
        if (pair < 3)
          return `${theme}: линия ${r.flaw.line} и обводка ${r.flaw.halo} дают ${pair.toFixed(2)} — контур одноцветный`
        const onWhite = contrastOf(r.flaw.line, 'rgb(255, 255, 255)')
        if (onWhite < 3) return `${theme}: на белом фоне линия ${r.flaw.line} даёт ${onWhite.toFixed(2)}`
        const onBlack = contrastOf(r.flaw.halo, 'rgb(0, 0, 0)')
        if (onBlack < 3) return `${theme}: на чёрном фоне обводка ${r.flaw.halo} даёт ${onBlack.toFixed(2)}`
        // Сосед с заведомо известным значением: рамка прицела обязана быть
        // сплошной. Совпади стили — два включённых слоя стали бы одним.
        if (r.aim.style !== 'solid') return `${theme}: рамка прицела ${r.aim.style}, а не solid — мерить нечем`
        if (r.flaw.style === r.aim.style)
          return `${theme}: контур нарушения и рамка прицела оба ${r.flaw.style} — слои неразличимы`
      }
      return true
    },
  },
  {
    name: 'Форс: подмена псевдокласса красит тем же, чем настоящее наведение',
    why: 'без этого весь режим «Состояния» — картинка: правила переписаны, атрибут проставлен, а на экране прежний тон. Пара «под курсором / без курсора» здесь обязательна: сравнение с одним только forced совпало бы при любой реализации',
    forceProbe: true,
    html: `
      <button class="ds-btn ds-btn--primary" id="self">Кнопка</button>
      <div id="root"><button class="ds-btn ds-btn--primary" id="inner">Кнопка</button></div>`,
    expect: (m) => {
      const f = m.force
      if (f.plain === f.hovered) return `наведение не меняет тон (${f.plain}) — замерять нечего`
      if (f.forced !== f.hovered) return `форс дал ${f.forced}, а настоящее наведение ${f.hovered}`
      if (f.viaAncestor !== f.hovered) return `атрибут на предке дал ${f.viaAncestor}, а наведение ${f.hovered}`
      return true
    },
  },
  {
    name: 'Форс: лист, вставленный не последним, перестаёт красить',
    why: 'дубликат равен оригиналу по специфичности (снятый псевдокласс заменён ровно одним атрибутом), поэтому спор решает только порядок. Пара «закреплено раньше / наведение позже» той же специфичности — обычная форма записи в системе; на голой кнопке порядок не виден, потому что спорить не с кем, и санитар был бы неопровержимым',
    forceProbe: true,
    extraCss: `.probe { display: block; height: 20px; }
      .probe.probe--pinned { background: rgb(128, 0, 0); }
      .probe:hover { background: rgb(0, 128, 0); }`,
    html: `
      <span class="probe probe--pinned" id="self"></span>
      <div id="root"><span class="probe probe--pinned" id="inner"></span></div>`,
    expect: (m) => {
      const f = m.force
      if (f.plain !== 'rgb(128, 0, 0)') return `закреплённый тон ${f.plain}, ожидался rgb(128, 0, 0)`
      if (f.hovered !== 'rgb(0, 128, 0)') return `под курсором ${f.hovered}, ожидался rgb(0, 128, 0)`
      if (f.forced !== f.hovered) return `форс последним листом дал ${f.forced}, а наведение ${f.hovered}`
      if (f.wrongOrder !== f.plain) return `лист форса первым дал ${f.wrongOrder} — он выиграл спор, которого не должен выигрывать`
      return true
    },
  },
  {
    name: 'Форс: обход укладывается в бюджет и не пропускает правил',
    why: '«пропущено 0» ничего не значит без числа обойдённых: ноль из нуля — это «мы туда не смотрели». Весь CSS системы лежит за `@import` в styles.css, и плоский обход дал бы ровно такой ноль. Порог времени — 25 мс, а не 16 из спеки, и это не поблажка: замер холодного прогона на этой машине дал 4.5 / 12.4 / 13.9 / 14.6 мс (разброс от ЛЕНИВОГО построения CSSOM за цепочкой @import — правила материализуются на первое чтение), и гейт на 16 был бы монеткой, а не проверкой. 25 краснеет на том, ради чего он написан: обход перестал быть одноразовым (пошёл на каждый патч) или в лист приехал второй такой же CSS. Само число 16 живёт в панели у человека — там оно и уместно',
    forceProbe: true,
    html: `
      <button class="ds-btn ds-btn--primary" id="self">Кнопка</button>
      <div id="root"><button class="ds-btn ds-btn--primary" id="inner">Кнопка</button></div>`,
    expect: (m) => {
      const f = m.force
      if (f.scanned < 500) return `обойдено ${f.scanned} правил — обход не спустился в @import`
      if (f.matched < 50) return `переписано ${f.matched} правил из ${f.scanned} — интерактивных в системе около 115`
      if (f.skipped !== 0) return `пропущено ${f.skipped} правил: в CSS появился :not(:hover), :has() или вложенность`
      if (f.opaque !== 0) return `${f.opaque} листов не отдали правила`
      if (f.ms >= 25) return `обход занял ${f.ms} мс — механизм перестал быть одноразовым (бюджет спеки 16, разброс холодного прогона 4.5–14.6)`
      return true
    },
  },
  {
    name: 'Цель клика: ни один интерактивный элемент не мельче 24×24',
    why: 'SC 2.5.8 Target Size (Minimum), уровень AA. До этого кейса система не держала минимум и не знала об этом: первый замер дал 34 нарушения из 138 целей в девяти компонентах — от 12×12 у каретки лога до 20×20 у крестика тоста. Внутри превью обход ОБЩИЙ, а не список имён: поимённые исключения превратили бы гейт в реестр разрешённых нарушений. НО САМ НАБОР ПРЕВЬЮ — ВЫБОРКА, и это надо говорить прямо: первая редакция называла себя общим обходом, а семь компонентов не встречались ни в одном превью и везли цели ниже пола (крестик Alert 18×18, ползунок Slider 900×4) при зелёном замере. Превью этим семи написаны, а пробел в остальном закрыт не обещанием, а гейтом `preview-coverage`: у компонента либо есть превью, либо имя в списке долга. Два исключения самого критерия (spacing и inline) здесь не применяются намеренно — оба про расстояние до соседа и про чужой межстрочный, то есть про раскладку ПОТРЕБИТЕЛЯ, которой система не владеет; обещание, которое держит кто-то другой, — не обещание. НЕ ПО ФОРМЕ: гейт не выводит «это inline» из разметки сам — снятое здесь исключение критерия касается ЧУЖОЙ раскладки в принципе, а не конкретного узла, и `Case.tinyTargets`, объявленный на своём компоненте (`Prose`, `KeyValueList` со значением-узлом, ссылкой на то же SC 2.5.8 «inline»), — не пересмотр этого запрета, а другой довод для другого случая: там межстрочный интервал — СТРОКА СИСТЕМЫ, не потребителя, и снимает его объявленная причина в фикстуре, а не форма узла. Случай меряет ЧЕТЫРЕ ШКАЛЫ (0.875/1/1.15/1.5), а не одну: пол цели, записанный как `calc(<n>rem * var(--ds-ui-scale))`, на шкале 1 даёт ровно 24 и проходит, а на рабочей 0.875 — 21 и нарушает; замерено на чипе легенды — 23.995 против 20.992 (DS-176). И ЭТИМ ЗАКРЫТА ТОЛЬКО ОДНА ИЗ ДВУХ ДЫР, они перпендикулярны: развёртка по шкалам не лечит ВЫБОРКУ. Чего нет ни в одном превью, того случай не мерит ни на одной шкале — легенда графика ровно такова (DS-155), и её нарушение нашлось глазами, а не здесь. ОДНО ИСКЛЮЧЕНИЕ, И ОНО ПО ФОРМЕ: прокручиваемая область, фокусируемая ТОЛЬКО через `tabindex` и являющаяся контейнером прокрутки по вычисленному `overflow`, целью не считается — клик по ней не выполняет действия, `tabindex` там стоит ради клавиатуры (DS-192 поставила его `.ds-heat__scroll`, `.ds-log__scroll`, `.ds-transcript__scroll`, у `.ds-codeblock__pre` он был и раньше). Иначе гейт требовал бы растить `<pre>` с одной строкой команды до 24px ради указателя, которому там нечего нажимать; на шкале 1 тот же `<pre>` давал 24.2 и проходил ПО СЛУЧАЙНОСТИ, что и вскрыло вопрос (DS-207). Исключение считается и печатается: ноль пропущенных областей роняет случай, потому что сужение, ни на что не совпадающее, неотличимо от работающего иначе как числом. ДВА СУЖЕНИЯ ПРЕДИКАТА, общие со строкой 1 матрицы (DS-177): цель в поддереве `[inert]` (фон под Modal/Drawer) и цель, обрезанная предком в ноль в покое (кнопка в свёрнутой панели), целями не считаются и в число осмотренных не входят; предикат считает их отдельно (`inert`, `clipped`), вердикт этого случая их не судит',
    visit: readdirSync(new URL('../previews', import.meta.url)).filter((n) => n.endsWith('.html')).map((n) => `previews/${n}`),
    // РАЗВЁРТКА ПО ШКАЛАМ, а не одна точка (DS-176). До неё случай мерил
    // только `--ds-ui-scale: 1`, и ему был невидим ЦЕЛЫЙ КЛАСС дефектов: пол
    // цели, записанный как `calc(<n>rem * var(--ds-ui-scale))`. На шкале 1 он
    // даёт ровно 24 и проходит, на 0.875 — 21 и нарушает. Замерено на чипе
    // легенды: 23.995 при 1, 20.992 при 0.875 (DS-155).
    //
    // 0.875 — рабочая шкала потребителя, названная в CHANGELOG 4.0.1 наравне с
    // 1 и 1.15, а не край диапазона. 1.5 включена как верх: пол, едущий по
    // шкале, на ней проходит с запасом, и её задача — не пропустить обратный
    // промах, когда на крупной шкале что-то ломается раскладкой.
    //
    // Шкала ставится на корне документа. Превью, несущее собственный
    // `.ds-scale` со своим значением, корневую перебивает — и правильно: такая
    // страница мерится на ТОЙ шкале, которую сама показывает.
    // МОДУЛЬ, А НЕ КОПИЯ (DS-222). Обход целей и само исключение живут
    // в `workbench/gate-predicates.ts` и приезжают сюда сборкой esbuild под
    // именем `WB`. Тот же файл отдаёт дев-сервер по адресу
    // `/api/gate/predicate/target-size`, поэтому санитар, посчитанный
    // браузерным агентом, и санитар гейта — одно число ПО ПОСТРОЕНИЮ, а не по
    // совпадению. До этого агент воспроизводил предикат по описанию из промта:
    // приближение сошлось с точным ответом, и это ничего не доказывало.
    bundle: 'workbench/gate-predicates.ts',
    measure: () => {
      const at = (scale) => {
        document.documentElement.style.setProperty('--ds-ui-scale', String(scale))
        return { scale, ...WB.scanTargets() }
      }
      const perScale = [0.875, 1, 1.15, 1.5].map(at)
      document.documentElement.style.removeProperty('--ds-ui-scale')
      return { perScale }
    },
    expect: (m) => {
      const one = (v) => v.perScale.find((p) => p.scale === 1)
      const total = m.visited.reduce((n, v) => n + one(v).total, 0)
      // Санитар: «ноль нарушений» из нуля осмотренных — это «мы туда не
      // смотрели». Превью 31, целей на них было 138 до правок. Считается по
      // шкале 1, чтобы число осталось сравнимым с тем, что было записано.
      if (total < 100) return `осмотрено всего ${total} целей на шкале 1 — превью не отрисовались, замер ни о чём`
      // Санитар развёртки: она обязана быть НЕ ДЕКОРАЦИЕЙ. Хотя бы одна
      // страница обязана менять геометрию вместе с корневой шкалой, иначе
      // четыре прогона — это один прогон, повторённый четырежды.
      const moved = m.visited.filter((v) => new Set(v.perScale.map((p) => p.boxSum)).size === v.perScale.length)
      if (moved.length === 0) return 'корневая шкала не двинула ни одной страницы — развёртка мерит одну точку четыре раза'
      // Санитар САМОГО ИСКЛЮЧЕНИЯ: сужение, которое ни на что не совпадает, —
      // мёртвый код, и отличить его от работающего можно только числом. Ноль
      // значит, что превью больше не показывают ни одной фокусируемой области
      // прокрутки, а значит исключение надо снимать, а не держать про запас.
      const scrollers = m.visited.reduce((n, v) => n + one(v).scrollers, 0)
      if (scrollers === 0) return 'ни одной прокручиваемой области в превью — исключение для них ни на что не совпадает и стало мёртвым'
      // Судит ТОЛЬКО `small`. `unhittable` и `unreachable` предикат отдаёт с
      // DS-177 ради строки 1 матрицы случаев; этот случай про превью, и
      // расширять его на попадание — отдельное решение, а не попутное.
      const bad = m.visited.flatMap((v) => v.perScale.flatMap((p) => p.small.map((s) => `${v.path}: ${s.path} ${s.width.toFixed(1)}×${s.height.toFixed(1)} при ${p.scale}`)))
      // Не только число и адрес, но и ШКАЛА: «21×86 при 0.875» и «21×86» —
      // разные замечания, и второе отправляет искать дефект туда, где его нет.
      return bad.length === 0 || `${bad.length} целей мельче 24×24 — ${[...new Set(bad)].slice(0, 12).join('; ')}`
    },
  },
  {
    name: 'Чип легенды: пол цели держится на любой шкале и не зажимает рост',
    why: 'чип легенды не встречается НИ В ОДНОМ превью — он появляется только при `series.length > 1 && !spark`, а превью рисуют один ряд, — поэтому обход целей смотрит мимо него на всех четырёх шкалах, и развёртка DS-176 этого не лечит: дыры перпендикулярны, одна про шкалу, другая про состав. Пол был написан как `calc(1.5rem * var(--ds-ui-scale))`, что на шкале 1 даёт РОВНО 24 — чип стоял на полу без запаса и пробивался любой шкалой ниже единицы: 20.992 при 0.875, 17.989 при 0.75 (DS-155). Ровно этот чип уже чинили однажды (DS-29), и правка была верной настолько, насколько её проверили — на одной шкале. Второе утверждение случая, про 1.5, стережёт починку от очевидной ошибки: двумя строками `min-height` подряд пол превратился бы в потолок, и чип сжался бы с 36 до 24 — то есть выглядел бы исправленным там, где его сломали',
    // ТРИ ПРЕФИКСА, а не один: правило в `chart-legend.css` объявлено списком
    // селекторов, и разной высоты у графика и календаря чип быть не должен —
    // на это правило файл и заведён. Проверять один значило бы держать
    // утверждение об общем правиле на одной трети его площади.
    html: ['ds-chart', 'ds-bar', 'ds-eventcal'].map((b) => `
      <div class="${b}__legend">
        <button type="button" class="${b}__chip" id="${b}">
          <span class="${b}__chip-dot"></span>Выручка</button>
      </div>`).join(''),
    measure: () => {
      const at = (scale) => {
        document.documentElement.style.setProperty('--ds-ui-scale', String(scale))
        return Object.fromEntries(['ds-chart', 'ds-bar', 'ds-eventcal'].map((b) =>
          [b, +document.getElementById(b).getBoundingClientRect().height.toFixed(3)]))
      }
      const out = Object.fromEntries([0.75, 0.875, 1, 1.15, 1.5].map((s) => [s, at(s)]))
      document.documentElement.style.removeProperty('--ds-ui-scale')
      return out
    },
    expect: (m) => {
      const B = ['ds-chart', 'ds-bar', 'ds-eventcal']
      const low = []
      for (const [scale, h] of Object.entries(m)) {
        for (const b of B) if (h[b] < 24) low.push(`${b} ${h[b]} при ${scale}`)
      }
      if (low.length) return `чип ниже пола цели 24: ${low.join('; ')}`
      // Пол не должен зажимать рост: на 1.5 чип обязан быть 36, а не 24.
      // Без этого утверждения `min-height: var(--ds-target-min)` вместо calc()
      // выглядел бы починкой.
      const clamped = B.filter((b) => Math.abs(m['1.5'][b] - 36) > 0.5)
      if (clamped.length) return `пол зажал рост: на 1.5 ожидалось 36, вышло ${clamped.map((b) => `${b} ${m['1.5'][b]}`).join('; ')}`
      // Одна высота у всех трёх префиксов — предмет самого файла.
      const spread = Math.max(...B.map((b) => m['1'][b])) - Math.min(...B.map((b) => m['1'][b]))
      return spread < 0.01 || `префиксы разъехались по высоте на шкале 1: ${B.map((b) => `${b} ${m['1'][b]}`).join('; ')}`
    },
  },
  {
    name: 'EventCalendar: лесенка плотного кластера — у каждого события свой левый край',
    why: 'шесть пересекающихся событий делят колонку недели на равные доли по 19px: полоски, в которые не попасть и в которых нечего прочесть. Решение 19 спецификации — `min-width` плюс НАЕЗД: каждое следующее сдвигается ровно настолько, насколько позволяет `calc(i * (100% − min-w) / (n−1))`, и у всех остаётся видимый левый край с цветом календаря. Ни одного из этих чисел jsdom не знает: layout там не считается вовсе, а `layout.test.ts` проверяет доли в процентах — то есть ровно ту величину, которую `min-width` и переопределяет. Сосед-различитель обязателен: без него случай зеленел бы и на разметке, в которой `min-width` не применился вообще — ширины в кластере из шести и так «какие-то», и отличить сработавший пол от несработавшего можно только сняв его',
    // ДВЕ копии одного блока превью, и вторая — с СНЯТЫМ полом. Разметка обеих
    // читается с диска, поэтому подмена ровно одна и названа явно.
    html: `<div id="ec-on">${previewBlock('eventcalendar.html', 'ec-dense')}</div>`
      + `<div id="ec-off">${previewBlock('eventcalendar.html', 'ec-dense')}</div>`,
    measure: () => {
      const read = (rootId) => {
        const root = document.getElementById(rootId)
        const evs = [...root.querySelectorAll('.ds-eventcal__event')]
          .map((el) => {
            const cs = getComputedStyle(el)
            return {
              r: el.getBoundingClientRect(),
              z: Number(cs.zIndex),
              minW: parseFloat(cs.minWidth),
              bar: parseFloat(cs.borderLeftWidth),
            }
          })
          .sort((a, b) => a.z - b.z)
        return evs.map((e, i) => ({
          w: +e.r.width.toFixed(2),
          minW: +e.minW.toFixed(2),
          bar: +e.bar.toFixed(2),
          // Видимая слева полоска: до левого края СЛЕДУЮЩЕГО по z. У последнего
          // сверху никого нет, поэтому видна его коробка целиком.
          visible: +((evs[i + 1] ? evs[i + 1].r.left : e.r.right) - e.r.left).toFixed(2),
        }))
      }
      // Пол снимается ИНЛАЙНОМ на самом `.ds-eventcal`: переменную объявляет
      // правило класса, и значение, поставленное предку, до него не доходит.
      document.querySelector('#ec-off .ds-eventcal').style.setProperty('--ds-eventcal-min-w', '0px')
      return {
        col: +document.querySelector('#ec-on .ds-eventcal__col').getBoundingClientRect().width.toFixed(2),
        on: read('ec-on'),
        off: read('ec-off'),
      }
    },
    expect: (m) => {
      // Санитар состава: шесть событий — предмет случая. Пять — это уже другой
      // кластер, и «нарушений нет» на нём ничего не значит.
      if (m.on.length !== 6) return `в блоке ${m.on.length} событий вместо шести — превью перерисовали, случай мерит не тот кластер`
      const thin = m.on.filter((e) => e.w < e.minW - 0.01 || e.w < 24)
      if (thin.length) return `событие уже пола: ${thin.map((e) => `${e.w} при min-width ${e.minW}`).join('; ')}`
      const hidden = m.on.filter((e) => e.visible < e.bar)
      if (hidden.length) {
        return `левый край накрыт соседом — от события видно меньше, чем его цветная полоса: `
          + hidden.map((e) => `${e.visible}px при полосе ${e.bar}px`).join('; ')
      }
      // РАЗЛИЧИТЕЛЬ. Со снятым `min-width` доли обязаны схлопнуться под пол
      // цели: иначе случай мерит разметку, а не правило.
      if (m.off.some((e) => e.minW !== 0)) return 'пол не снялся у соседа — различитель ничего не различает'
      const wide = m.off.filter((e) => e.w >= 24)
      if (wide.length) {
        return `без min-width событие осталось ${wide[0].w}px при колонке ${m.col}px — доля кластера сама по себе шире пола, `
          + 'случай ничего не доказывает: возьмите более плотный кластер или более узкую колонку'
      }
      return true
    },
  },
  {
    name: 'EventCalendar: чип месяца и счётчик клетки держат пол цели на любой шкале',
    why: 'чип месяца ОТКРЫВАЕТ событие, а счётчик `+N ещё` уводит в день — обе цели указателя по SC 2.5.8, и обе жили без пола: высоту давал один текст, 16.2px на шкале 1 и 14.2 на 0.875. Не мерил этого никто: месяца не было ни в одном превью (DS-156 его туда и принесла), а jsdom проверяет чип ролью, не геометрией. Общий обход «Цель клика» теперь это тоже видит, но по имени превью — а замечание должно называть EventCalendar, иначе искать придётся по всей странице. Четыре шкалы, а не одна: пол, записанный как `calc(1.5rem * scale)`, на шкале 1 даёт ровно 24 и проходит, на рабочей 0.875 — 21',
    html: previewBlock('eventcalendar.html', 'ec-month'),
    measure: () => {
      const at = (scale) => {
        document.documentElement.style.setProperty('--ds-ui-scale', String(scale))
        const box = (sel) => [...document.querySelectorAll(sel)].map((el) => {
          const r = el.getBoundingClientRect()
          return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), text: el.textContent.trim() }
        })
        return { scale, chips: box('.ds-eventcal__chip-event'), more: box('.ds-eventcal__more') }
      }
      const out = [0.875, 1, 1.15, 1.5].map(at)
      document.documentElement.style.removeProperty('--ds-ui-scale')
      return { out }
    },
    expect: (m) => {
      const one = m.out.find((p) => p.scale === 1)
      // Санитары состава: клетка сверх порога — предмет случая. Без счётчика
      // мерить было бы нечего, а без трёх чипов клетка не переполнена.
      if (one.chips.length !== 3) return `в блоке ${one.chips.length} чипов вместо трёх — клетка не переполнена, случай не о том`
      if (one.more.length !== 1) return `счётчиков ${one.more.length} вместо одного — переполнения в блоке нет`
      if (one.more[0].text !== '+3 ещё') return `счётчик читается «${one.more[0].text}», а событий сверх порога три`
      const small = m.out.flatMap((p) =>
        [...p.chips.map((b) => ['чип', b]), ...p.more.map((b) => ['счётчик', b])]
          .filter(([, b]) => b.w < 24 || b.h < 24)
          .map(([kind, b]) => `${kind} ${b.w}×${b.h} при ${p.scale}`))
      if (small.length) return `${small.length} целей месяца мельче 24×24 — ${[...new Set(small)].join('; ')}`
      // Пол не должен становиться потолком: на 1.5 строка обязана вырасти.
      const big = m.out.find((p) => p.scale === 1.5)
      return big.chips[0].h > 24.5 || `на шкале 1.5 чип остался ${big.chips[0].h} — пол зажал рост`
    },
  },
  {
    name: 'EventCalendar: каждая неделя месяца закрыта линией с ОБЕИХ сторон, и последняя тоже',
    why: 'сетка месяца рисовалась только `border-top` у недели: пять недель давали пять линий сверху и ни одной снизу, вертикальные разделители колонок последней недели обрывались в пустоту (DS-232). Нашёл это человеческий глаз, и не мог найти никто другой: в jsdom границ нет вовсе, а ночной обход прошёл мимо, потому что кадр был 700px и последняя неделя в него не влезала — артефакт кадра («месяц уходит в прокрутку») закрыл собой настоящий дефект под ним. Предмет утверждения — ОТНОШЕНИЕ, а не «граница есть»: «у месяца есть border-bottom» верно и тогда, когда линию случайно нарисовал сосед или когда она уехала на другой край. Спрашивается поэтому другое: у каждой недели на её верхней и нижней кромке лежит горизонтальная линия — чья угодно, своя, соседней недели или контейнера. Цвет сверяется с цветом разделителей: закрывающая линия обязана быть ТОЙ ЖЕ линией, иначе сетка кончается чем-то другим',
    // ДВЕ копии, у второй закрывающая линия снята инлайном. Различитель здесь
    // обязателен: предикат «у каждой недели линия сверху и снизу» на четырёх
    // неделях из пяти зелен и без правки, и без соседа случай зеленел бы на
    // ровно том дефекте, ради которого написан.
    html: `<div id="ecm-on">${previewBlock('eventcalendar.html', 'ec-month')}</div>`
      + `<div id="ecm-off">${previewBlock('eventcalendar.html', 'ec-month')}</div>`,
    measure: () => {
      const read = (rootId) => {
        const month = document.querySelector(`#${rootId} .ds-eventcal__month`)
        const mr = month.getBoundingClientRect()
        const mcs = getComputedStyle(month)
        const weeks = [...month.querySelectorAll('.ds-eventcal__week')].map((el) => {
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          return {
            top: +r.top.toFixed(2),
            bottom: +r.bottom.toFixed(2),
            borderTop: parseFloat(cs.borderTopWidth),
            borderBottom: parseFloat(cs.borderBottomWidth),
            topColour: cs.borderTopColor,
          }
        })
        return {
          weeks,
          monthBottom: +mr.bottom.toFixed(2),
          monthBorderBottom: parseFloat(mcs.borderBottomWidth),
          monthColour: mcs.borderBottomColor,
        }
      }
      document.querySelector('#ecm-off .ds-eventcal__month').style.borderBottom = 'none'
      return { on: read('ecm-on'), off: read('ecm-off') }
    },
    expect: (m) => {
      // Санитар состава: пять недель — предмет случая. На одной неделе
      // «закрыта с обеих сторон» ничего не значит.
      if (m.on.weeks.length !== 5) return `недель в блоке ${m.on.weeks.length} вместо пяти — превью перерисовали, случай мерит не ту сетку`
      // Все горизонтальные линии сетки: верх недели плюс низ контейнера. Кто
      // именно её рисует — неважно, важно, что на кромке она есть.
      const linesOf = (b) => [
        ...b.weeks.filter((w) => w.borderTop > 0).map((w) => w.top),
        ...b.weeks.filter((w) => w.borderBottom > 0).map((w) => w.bottom),
        ...(b.monthBorderBottom > 0 ? [b.monthBottom] : []),
      ]
      const openOf = (b) => {
        const lines = linesOf(b)
        // Допуск 1.5px: `getBoundingClientRect` контейнера включает его
        // границу, поэтому низ последней недели и низ месяца расходятся ровно
        // на её толщину.
        const near = (y) => lines.some((l) => Math.abs(l - y) <= 1.5)
        return b.weeks
          .map((w, i) => ({ i, top: near(w.top), bottom: near(w.bottom) }))
          .filter((w) => !w.top || !w.bottom)
      }
      const open = openOf(m.on)
      if (open.length) {
        return `неделя месяца не закрыта линией: `
          + open.map((w) => `${w.i + 1}-я — ${[!w.top && 'сверху', !w.bottom && 'снизу'].filter(Boolean).join(' и ')}`).join('; ')
          + ` (недель ${m.on.weeks.length}, горизонтальных линий ${linesOf(m.on).length})`
      }
      if (m.on.monthColour !== m.on.weeks[0].topColour) {
        return `закрывающая линия ${m.on.monthColour}, а разделители ${m.on.weeks[0].topColour} — сетка кончается не той линией, которой рисуется`
      }
      // РАЗЛИЧИТЕЛЬ. Со снятой закрывающей линией последняя неделя обязана
      // остаться открытой: иначе предикат меряет не то, о чём говорит.
      if (m.off.monthBorderBottom !== 0) return 'закрывающая линия не снялась у соседа — различитель ничего не различает'
      const openOff = openOf(m.off)
      if (!openOff.some((w) => w.i === m.off.weeks.length - 1 && !w.bottom)) {
        return `без закрывающей линии последняя неделя всё равно закрыта — её низ рисует что-то ещё, и случай зеленел бы на дефекте`
      }
      return true
    },
  },
  {
    name: 'EventCalendar: пояс сверх потолка занимает ровно три строки, и последняя отдана счётчику',
    why: 'решение 22 спецификации: без потолка пояс суточных событий выталкивает сетку за экран, поэтому строк не больше `allDayRows`, а последняя отдаётся счётчику — видимых полос на одну меньше, чем строк. Ни высота пояса, ни это «на одну меньше» в jsdom не проверяются: высота — строки грида пояса (`grid-auto-rows: var(--ds-eventcal-lane)`, DS-328), и сколько их реально нарисовано — вопрос к layout. Рамка у грида прибавляется к строкам: пояс с `border-bottom` мерил 73 при строке 24, и этот случай поймал её при переезде на грид. Сосед на ОДНУ строку обязателен: «пояс высотой 72px» верно и там, где строка стала 24 вместо 18 по другой причине; предмет утверждения — ОТНОШЕНИЕ, три к одному',
    html: previewBlock('eventcalendar.html', 'ec-band'),
    measure: () => {
      const band = document.querySelector('.ds-eventcal__band')
      // Сосед-линейка: ТОТ ЖЕ узел компонента, у которого переписано одно
      // число — множитель строк. Всё остальное в нём совпадает побайтно,
      // поэтому разница высот — это разница ровно в множителе.
      const one = band.cloneNode(true)
      one.style.height = 'calc(1 * var(--ds-eventcal-lane))'
      band.parentNode.appendChild(one)
      const box = (el) => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(2), h: +r.height.toFixed(2) } }
      return {
        three: box(band),
        oneRow: box(one),
        bars: [...band.querySelectorAll('.ds-eventcal__bar')].map((el) => ({ ...box(el), text: el.textContent.trim() })),
        more: [...band.querySelectorAll('.ds-eventcal__band-more')].map((el) => ({ ...box(el), text: el.textContent.trim() })),
      }
    },
    expect: (m) => {
      if (m.bars.length !== 2) return `полос ${m.bars.length} вместо двух — при allDayRows=3 видимых полос обязано быть на одну меньше строк`
      if (m.more.length === 0) return 'счётчика в поясе нет — пять событий уложились в потолок, случай не о переполнении'
      const wrong = m.more.filter((b) => b.text !== '+3 ещё')
      if (wrong.length) return `счётчик читается «${wrong[0].text}», а под потолком осталось три события`
      const low = [...m.bars, ...m.more].filter((b) => b.h < 24 || b.w < 24)
      if (low.length) return `строка пояса ниже пола цели: ${low.map((b) => `${b.w}×${b.h}`).join('; ')}`
      const ratio = m.three.h / m.oneRow.h
      return Math.abs(ratio - 3) < 0.02
        || `пояс высотой ${m.three.h} при строке ${m.oneRow.h} — это ${ratio.toFixed(2)} строки, а не три`
    },
  },
  {
    name: 'KeyValueList: длинное значение не съедает метку',
    why: 'метка и значение лежат в одном флекс-ряду, и сжатие распределяется пропорционально флекс-базам. У значения база равна max-content, то есть тысячи пикселей на абзаце текста, поэтому сжимается вместе с ним и метка — а её автоминимум разрешён в ноль собственным `overflow: hidden`. Замерено на странице настроек потребителя: «Project description» получала 31px из нужных 133 и печаталась как «Pr…», на ширине 1024px — 14px (DS-136). Ни ошибки, ни следа в DOM: текст в узле целиком, режет его браузер',
    // Два ряда с ОДИНАКОВОЙ меткой и разными по длине значениями. Утверждение —
    // что ширина метки от длины значения НЕ зависит; проверка «метка не обрезана»
    // сама по себе прошла бы и на списке, где обрезано всё сразу (writing-checks,
    // п.6). Короткий ряд здесь и есть сосед с заранее известным значением: его
    // метка обязана быть целой при любом состоянии дефекта.
    html: `<div style="width:1200px">
      <dl class="ds-kv ds-kv--cols-1 ds-kv--dividers ds-kv--dense" id="kv-long">
        <div class="ds-kv__row"><dt class="ds-kv__label" id="lab-short">Project description</dt><dd class="ds-kv__value">v1</dd></div>
        <div class="ds-kv__row"><dt class="ds-kv__label" id="lab-long">Project description</dt><dd class="ds-kv__value">${'Инструмент одного решения, повторяемого раз в месяц: какие платежи сделать сейчас и что дальше. '.repeat(12)}</dd></div>
      </dl>
    </div>`,
    measure: () => {
      const read = (id) => {
        const el = document.getElementById(id)
        return { client: el.clientWidth, scroll: el.scrollWidth }
      }
      return { short: read('lab-short'), long: read('lab-long') }
    },
    expect: (m) => {
      if (m.short.client < m.short.scroll) {
        return `метка обрезана даже рядом с коротким значением (${m.short.client} из ${m.short.scroll}) — замер не про длинное значение`
      }
      if (m.long.client < m.long.scroll) {
        return `длинное значение съело метку: ${m.long.client}px из нужных ${m.long.scroll}px`
      }
      return m.long.client === m.short.client
        || `ширина метки зависит от длины значения: ${m.short.client}px против ${m.long.client}px`
    },
  },
  {
    name: 'KeyValueList: мера колонки ограничена и упирается в предел, а не в контейнер',
    why: 'список пар — структура для чтения, а не раскладка. В карточке во всю ширину ряд разносил метку и значение на 1946px («Limit, per role» и «1»), связать их взглядом нельзя. Потребитель, у которого есть ширина, тратит её на `columns` — для этого колонки и заведены (DS-136)',
    // Две ширины по обе стороны предела, а не одна. «Ряд уже контейнера» верно и
    // для предела в 1px, и для сломанного вусмерть списка: проверка обязана
    // показать, что на узком контейнере колонка берёт ВСЮ ширину, а на широком
    // останавливается. Предел — 44em от --ds-fs-base (0.875rem, было 0.8125rem
    // до DS-375), то есть ≈616px при масштабе 1 (было ≈572px).
    html: `${[440, 1600].map((w) => `<div style="width:${w}px"><dl class="ds-kv ds-kv--cols-1" id="kv${w}">
      <div class="ds-kv__row"><dt class="ds-kv__label">Limit, per role</dt><dd class="ds-kv__value">1</dd></div>
      </dl></div>`).join('')}`,
    measure: () => {
      const row = (id) => {
        const r = document.querySelector(`#${id} .ds-kv__row`).getBoundingClientRect()
        const lab = document.querySelector(`#${id} .ds-kv__label`).getBoundingClientRect()
        const val = document.querySelector(`#${id} .ds-kv__value`).getBoundingClientRect()
        return { width: +r.width.toFixed(1), gap: +(val.left - lab.right).toFixed(1) }
      }
      return { narrow: row('kv440'), wide: row('kv1600') }
    },
    expect: (m) => {
      // На узком контейнере колонка обязана взять его целиком: иначе «ограничено»
      // означало бы «сломано на любой ширине». Узкая сторона поднята с 420 до
      // 440 (JIG-29, пол системы DS-380): порог ≈616px остаётся много выше, пара
      // всё так же по разные стороны от него.
      if (m.narrow.width < 400) return `на 440px колонка сжалась до ${m.narrow.width}px — предел режет там, где резать нечего`
      if (m.wide.width > 700) return `на 1600px колонка ${m.wide.width}px — предел не сработал`
      if (m.wide.width <= m.narrow.width) return `узкая ${m.narrow.width}px, широкая ${m.wide.width}px — колонка не растёт вовсе`
      return m.wide.gap < 600
        || `на широком контейнере метка и значение разъехались на ${m.wide.gap}px`
    },
  },
  {
    name: 'DataTable: колонка без ширины не уезжает под пол, а на просторе берёт остаток',
    why: 'в `table-layout: fixed` колонка без `width` получает ОСТАТОК, и пола у остатка нет. У потребителя при контейнере 342px и заданных 192+80+64 четвёртая колонка приходила 6px: «Note» показывал 0 символов из 30, ячейка «Review» — 20 из 89 (DS-137, число историческое — контейнер того случая). Столбец при этом объявлен диктору и подписан в шапке — данные невидимы, и об этом ничто не сообщает. Пол живёт как `min-width` ТАБЛИЦЫ, потому что остальные три места замерены и не работают: `min-width` на ячейке первой строки в fixed игнорируется, любое `calc()`/`min()` с процентом внутри `<col>` chromium отбрасывает в пользу auto, а прокрутка обёртки воскрешает DS-97 (замерено 1px видимой высоты меню из 90)',
    // Две ширины контейнера, а не одна. «Колонка не уже 64px» верно и для
    // раскладки, которая просто раздала всем поровну, то есть перестала
    // держать заданные ширины. Широкий случай — тот самый различитель: там
    // min-width НЕ действует, заданные ширины обязаны прийти точными, а
    // остаток целиком уйти колонке без ширины.
    // Слагаемые пола — на обёртке, сумму собирает лист: фрагмент обязан
    // повторять то, что эмитит компонент (DS-138), иначе зелёный ничего
    // не значит. Скрываемых колонок здесь нет, поэтому `sm`/`md` — нули.
    //
    // КОЛОНКИ И УЗКИЙ КОНТЕЙНЕР ПЕРЕСЧИТАНЫ (JIG-29, второй круг, решение
    // владельца — «отовсюду значит отовсюду», контейнеры тоже поднимаются).
    // Различитель требует narrow < (сумма трёх колонок + пол), иначе min-width
    // таблицы просто никогда не становится теснее контейнера, и утверждение
    // «колонка получает ровно пол» перестаёт что-либо отличать. При поле 64px
    // (`--ds-w-col-min`, 4rem × шкала 1) старые 192+80+64=336 давали порог
    // 400px — ниже нового пола 440, поднять narrow без пересчёта было нельзя.
    // Колонки увеличены до 300/150/100=550 (порог 614px), narrow — 460px
    // (пол 440 + запас: раскладка меняется резко на самой границе, запас не
    // даёт мутации совпасть по случайности). Замерено `npm run measure`:
    // последняя колонка на narrow по-прежнему приходит РОВНО полом (64px).
    html: ['narrow', 'wide'].map((id) => `
      <div class="ds-table-wrap" id="${id}" style="width:${id === 'narrow' ? 460 : 1000}px;
           --ds-table-min-base: calc(300px + 150px + 100px + var(--ds-w-col-min));
           --ds-table-min-sm: 0px; --ds-table-min-md: 0px">
        <table class="ds-table ds-table--fixed" data-ds-managed-rows>
          <colgroup><col style="width:300px"><col style="width:150px"><col style="width:100px"><col></colgroup>
          <thead><tr><th>Задача</th><th>Статус</th><th>Оценка</th><th>Note</th></tr></thead>
          <tbody><tr><td>DS-137</td><td>Review</td><td>M</td><td>Заметка, которую надо прочитать</td></tr></tbody>
        </table>
      </div>`).join(''),
    measure: () => {
      const read = (id) => {
        const wrap = document.getElementById(id)
        const table = wrap.querySelector('table')
        return {
          wrap: +wrap.getBoundingClientRect().width.toFixed(1),
          table: +table.getBoundingClientRect().width.toFixed(1),
          cols: [...table.querySelectorAll('thead th')].map((c) => +c.getBoundingClientRect().width.toFixed(1)),
        }
      }
      // Пол — через ПРОБНИК, а не через `getPropertyValue`: токен объявлен как
      // `calc(4rem * var(--ds-ui-scale))`, и сырое значение приходит строкой
      // `calc(4rem * 1)`, из которой `parseFloat` делает NaN. Ноль пикселей и
      // NaN читались бы здесь одинаково — «пола нет».
      const probe = document.createElement('div')
      probe.style.cssText = 'width: var(--ds-w-col-min); position: absolute; visibility: hidden'
      document.body.appendChild(probe)
      const floor = probe.getBoundingClientRect().width
      probe.remove()
      return { narrow: read('narrow'), wide: read('wide'), floor }
    },
    expect: (m) => {
      const floor = m.floor
      if (!(floor > 0)) return '--ds-w-col-min не объявлен — пола нет вовсе'
      const last = m.narrow.cols[3]
      // Минус пиксель — сетка: при `border-collapse: collapse` правая рамка
      // таблицы съедает его из коробки последней ячейки. Допуск назван числом,
      // а не «примерно»: дефект здесь меряется в шестых долях пола (5px против
      // 64), и пиксель его не спрячет.
      if (last < floor - 1) return `колонка без ширины пришла ${last}px при поле ${floor}px`
      if (m.narrow.table <= m.narrow.wrap) {
        return `таблица ${m.narrow.table}px не переросла обёртку ${m.narrow.wrap}px — min-width не действует, а колонка ${last}px пришла откуда-то ещё`
      }
      const [a, b, c] = m.wide.cols
      if (a !== 300 || b !== 150 || c !== 100) {
        return `на просторе заданные ширины уехали: ${a}/${b}/${c} вместо 300/150/100 — пол начал раздавать место всем`
      }
      const rest = m.wide.cols[3]
      return rest > 400 || `на просторе колонка без ширины взяла ${rest}px вместо остатка (~450px)`
    },
  },
  {
    name: 'DataTable: скрытая по тесноте колонка отдаёт ширину соседке, а не оставляет мёртвую полосу',
    why: 'в `table-layout: fixed` ширины считаются по `<colgroup>`, и `display: none` на ячейках их не пересчитывает: содержимое уходит, ТРЕК остаётся. Замер до правки — обёртка 400px, колонки 100/100/100/остаток: после скрытия второй видимые заняли 300px, а последние 100 остались пустыми, и колонка-остаток от скрытия соседки не получила НИЧЕГО (DS-138). Пока это живо, `hideBelow` — половина стратегии: шум убирает, тесноту нет. Найдено замером на DS-137, потребитель не сообщал: совет «вылезла за обёртку — объявите hideBelow» был бы правдоподобен и неверен',
    // Две ширины обёртки, и широкая здесь — не украшение. «Полосы нет» верно и
    // для правила, которое прячет колонку ВСЕГДА: там полосы тоже нет, просто
    // колонки нет никогда. Широкий случай требует все четыре на месте и ширины
    // точными — то есть различает «скрытие работает» и «скрытие залипло».
    //
    // Узкая обёртка ПОДНЯТА 400 → 440 (JIG-29, второй круг, решение владельца).
    // Здесь `min-width` таблицы (100+100+пол=264) ничего не форсирует ни на
    // 400, ни на 440 — предмет случая (перераспределение места скрытой
    // колонки) от точного числа обёртки не зависит, порог `hideBelow`
    // по-прежнему срабатывает на 440 (замерено `npm run measure`).
    html: ['narrow', 'wide'].map((id) => `
      <div class="ds-table-wrap" id="hb-${id}" style="width:${id === 'narrow' ? 440 : 900}px;
           --ds-table-min-base: calc(100px + 100px + var(--ds-w-col-min));
           --ds-table-min-sm: 100px; --ds-table-min-md: 0px">
        <table class="ds-table ds-table--fixed" data-ds-managed-rows>
          <colgroup>
            <col style="width:100px">
            <col class="ds-table__hide-sm" style="width:100px">
            <col style="width:100px">
            <col>
          </colgroup>
          <thead><tr><th>Задача</th><th class="ds-table__hide-sm">Статус</th><th>Оценка</th><th>Note</th></tr></thead>
          <tbody><tr><td>DS-138</td><td class="ds-table__hide-sm">Review</td><td>M</td><td>Заметка</td></tr></tbody>
        </table>
      </div>`).join(''),
    measure: () => {
      const read = (id) => {
        const wrap = document.getElementById(id)
        const table = wrap.querySelector('table')
        const box = table.getBoundingClientRect()
        const cells = [...table.querySelectorAll('thead th')]
          .filter((c) => c.getClientRects().length)
          .map((c) => {
            const b = c.getBoundingClientRect()
            return { text: c.textContent, left: +(b.left - box.left).toFixed(1), w: +b.width.toFixed(1) }
          })
        const last = cells[cells.length - 1]
        return {
          table: +box.width.toFixed(1),
          cells,
          // Мёртвая полоса — это ровно расстояние от правого края последней
          // видимой ячейки до правого края таблицы.
          tail: +(box.width - (last.left + last.w)).toFixed(1),
        }
      }
      return { narrow: read('hb-narrow'), wide: read('hb-wide') }
    },
    expect: (m) => {
      if (m.narrow.cells.length !== 3) {
        return `на 440px видно ${m.narrow.cells.length} колонки из 3 — hideBelow не сработал вовсе`
      }
      // Допуск 2px, а не «примерно»: дефект здесь размером с колонку (100px из
      // 400), и пиксель рамки при `border-collapse: collapse` его не спрячет.
      if (m.narrow.tail > 2) {
        return `после скрытой колонки осталась мёртвая полоса ${m.narrow.tail}px из ${m.narrow.table}px`
      }
      const rest = m.narrow.cells[2].w
      if (rest < 150) {
        return `колонка-остаток взяла ${rest}px — освободившиеся 100px ушли не ей (ожидалось ~199)`
      }
      if (m.wide.cells.length !== 4) {
        return `на 900px видно ${m.wide.cells.length} колонки из 4 — скрытие залипло вне тесноты`
      }
      const [a, b, c] = m.wide.cells.map((x) => x.w)
      return (a === 100 && b === 100 && c === 100)
        || `на просторе заданные ширины уехали: ${a}/${b}/${c} вместо 100/100/100`
    },
  },
  {
    name: 'DataTable: пол ширины не держит скрытую колонку — hideBelow лечит и тесноту',
    why: 'пол таблицы (DS-137) считался одним числом по ВСЕМ колонкам, а скрытая по тесноте колонка трек уже теряет (DS-138). То есть пол держал таблицу широкой за колонку, которой на экране нет: `hideBelow` объявлен адаптивной стратегией таблицы («не прокрутка, а скрытие колонок» — ответ потребителю в 4.1.1), и пол забирал обратно ровно то, ради чего её объявляют. Считать это в JS нечем: тесноту знает только container-запрос, а ширину обёртки компонент не меряет — поэтому слагаемых три, а обнуляет ненужные лист',
    // Ширины подобраны так, чтобы пол упирался и ПОСЛЕ скрытия. Тогда одна
    // величина — ширина таблицы — различает ТРИ состояния, а не два: пол
    // держит скрытую колонку (дефект), пол уменьшился на неё и остался полом
    // (чинили это), пола нет вовсе (правка, которая «починила» тесноту, убрав
    // пол целиком; колонка-остаток тогда снова уезжает).
    //
    // ПЕРЕСЧИТАНО (JIG-29, второй круг, решение владельца — контейнеры тоже
    // поднимаются). Было 192+120=312 плюс поле 64 = 376 против обёртки 342
    // (342 ниже пола 440, поднять без пересчёта было нельзя: 376 тоже ниже
    // 440). Колонки увеличены до 300 («Задача») + 150 («Оценка») = 450,
    // скрываемая («Статус») — до 100. Три состояния теперь: 614 (300+100+150+64
    // — пол держит скрытую колонку, дефект), 514 (300+150+64 — пол уменьшился
    // и остался полом, чинили это), 460 (обёртка без изменений — пола нет
    // вовсе). 460 < 514 < 614, различитель работает тем же приёмом.
    html: ['narrow', 'wide'].map((id) => `
      <div class="ds-table-wrap" id="fl-${id}" style="width:${id === 'narrow' ? 460 : 900}px;
           --ds-table-min-base: calc(300px + 150px + var(--ds-w-col-min));
           --ds-table-min-sm: 100px; --ds-table-min-md: 0px">
        <table class="ds-table ds-table--fixed" data-ds-managed-rows>
          <colgroup>
            <col style="width:300px">
            <col class="ds-table__hide-sm" style="width:100px">
            <col style="width:150px">
            <col>
          </colgroup>
          <thead><tr><th>Задача</th><th class="ds-table__hide-sm">Статус</th><th>Оценка</th><th>Note</th></tr></thead>
          <tbody><tr><td>DS-138</td><td class="ds-table__hide-sm">Review</td><td>M</td><td>Заметка</td></tr></tbody>
        </table>
      </div>`).join(''),
    measure: () => {
      const read = (id) => {
        const wrap = document.getElementById(id)
        const table = wrap.querySelector('table')
        return {
          wrap: +wrap.getBoundingClientRect().width.toFixed(1),
          table: +table.getBoundingClientRect().width.toFixed(1),
          minW: getComputedStyle(table).minWidth,
          cols: [...table.querySelectorAll('thead th')]
            .filter((c) => c.getClientRects().length)
            .map((c) => +c.getBoundingClientRect().width.toFixed(1)),
        }
      }
      // Пол — пробником, а не разбором строки: `--ds-w-col-min` объявлен как
      // `calc(4rem * var(--ds-ui-scale))`, и `parseFloat` сырого значения даёт
      // NaN, неотличимый здесь от нуля.
      const probe = document.createElement('div')
      probe.style.cssText = 'width: var(--ds-w-col-min); position: absolute; visibility: hidden'
      document.body.appendChild(probe)
      const floor = probe.getBoundingClientRect().width
      probe.remove()
      return { narrow: read('fl-narrow'), wide: read('fl-wide'), floor }
    },
    expect: (m) => {
      if (!(m.floor > 0)) return '--ds-w-col-min не объявлен — пола нет вовсе'
      if (m.narrow.cols.length !== 3) {
        return `на 460px видно ${m.narrow.cols.length} колонки из 3 — hideBelow не сработал`
      }
      // Ожидаемое считается из тех же чисел, что и во фрагменте: 300 + 150 плюс
      // метрика на колонку без ширины. Литерал здесь молча разошёлся бы с
      // фрагментом при первой же правке ширин.
      const want = 300 + 150 + m.floor
      if (Math.abs(m.narrow.table - want) > 1) {
        const what = m.narrow.table > want
          ? `пол ${m.narrow.minW} держит скрытую колонку`
          : 'пола нет вовсе — колонка-остаток снова без нижней границы'
        return `таблица ${m.narrow.table}px при обёртке ${m.narrow.wrap}px, ожидалось ${want}px: ${what}`
      }
      const rest = m.narrow.cols[2]
      if (rest < m.floor - 1) {
        return `колонка-остаток взяла ${rest}px при поле ${m.floor}px`
      }
      if (m.wide.cols.length !== 4) {
        return `на 900px видно ${m.wide.cols.length} колонки из 4 — скрытие залипло вне тесноты`
      }
      // На просторе ничего не скрыто, и заданные ширины обязаны прийти точными:
      // пол, начавший раздавать место всем, ловится здесь.
      const [a, b, c] = m.wide.cols
      return (a === 300 && b === 100 && c === 150)
        || `на просторе заданные ширины уехали: ${a}/${b}/${c} вместо 300/100/150`
    },
  },
  {
    name: 'DataTable/LedgerList: приглушённая строка глуше обычной в ОБЕИХ темах и держит пол 4.5',
    why: 'приглушение было подложкой `--ds-surface-subtle` — токеном ПОВЕРХНОСТИ, взятым на роль состояния. Знак у поверхности зависит от темы: светлая #F7F7F7 темнее белой строки, тёмная #2E2E2E СВЕТЛЕЕ подложки карточки #262626, и мягко удалённая запись словаря читалась ГРОМЧЕ живой (DS-137, замер потребителя rgb(46,46,46) совпал с токеном точно). Тон текста верен в обеих темах по построению, но пол 4.5:1 обязан меряться на ЧЕТЫРЁХ подложках строки, а не на одной: `--ds-text-muted` (#6B6B6B) даёт на выборе #DCEFEF 4.48 — из-за этого тон отдельный',
    html: ['light', 'dark'].map((t) => `<div class="ds-root" ${t === 'dark' ? 'data-theme="dark"' : ''} id="row-${t}">
      <table class="ds-table" data-ds-managed-rows>
        <tbody>
          <tr id="plain-${t}"><td>живая запись</td></tr>
          <tr class="ds-table__row--muted" id="muted-${t}"><td>снятая запись</td></tr>
        </tbody>
      </table>
      <div class="ds-ledger"><div class="ds-ledger__rec ds-ledger__rec--muted" id="rec-${t}">
        <div class="ds-ledger__summary"><div>снятая запись</div></div></div></div>
    </div>`).join(''),
    measure: () => {
      const read = (theme) => {
        const root = document.getElementById(`row-${theme}`)
        const cs = (sel) => getComputedStyle(root.querySelector(sel))
        // Подложки — через ПРОБНИК: `getPropertyValue` отдаёт токен как есть
        // (`#F5F5F5`), а разбор контраста ждёт `rgb(...)`, как их печатает
        // браузер. Сырой хекс дал бы не «неверный контраст», а падение.
        const tok = (n) => {
          const probe = document.createElement('div')
          probe.style.cssText = `background: var(${n}); position: absolute; visibility: hidden`
          root.appendChild(probe)
          const v = getComputedStyle(probe).backgroundColor
          probe.remove()
          return v
        }
        return {
          plain: cs(`#plain-${theme} td`).color,
          muted: cs(`#muted-${theme} td`).color,
          rec: cs(`#rec-${theme}`).color,
          // Снимки слоёв (DS-209): подложки ниже — ПРОБНИКИ токенов, то
          // есть вопрос гипотетический («а как это будет на зебре»), и брать
          // подложку из снимка здесь нельзя. А накопленную прозрачность — надо:
          // приглуши кто-нибудь строку `opacity` вместо цвета, номинальные
          // числа не шелохнутся.
          plainSeen: window.__seen(root.querySelector(`#plain-${theme} td`)),
          mutedSeen: window.__seen(root.querySelector(`#muted-${theme} td`)),
          // Подложка строки — то, что правка обязана НЕ трогать: раньше именно
          // она и была приглушением, и знак у неё переворачивался темой.
          plainBg: getComputedStyle(document.getElementById(`plain-${theme}`)).backgroundColor,
          mutedBg: getComputedStyle(document.getElementById(`muted-${theme}`)).backgroundColor,
          surface: tok('--ds-surface'),
          zebra: tok('--ds-table-zebra'),
          hover: tok('--ds-table-hover'),
          selected: tok('--ds-table-selected'),
        }
      }
      return { light: read('light'), dark: read('dark') }
    },
    expect: (m) => {
      for (const theme of ['light', 'dark']) {
        const t = m[theme]
        if (t.mutedBg !== t.plainBg) {
          return `${theme}: приглушение снова красит подложку (${t.mutedBg} против ${t.plainBg}) — знак опять зависит от темы`
        }
        if (t.muted === t.plain) return `${theme}: приглушённая строка того же тона, что живая (${t.muted}) — приглушения нет`
        if (t.rec !== t.muted) return `${theme}: запись LedgerList (${t.rec}) и строка DataTable (${t.muted}) разошлись — одно слово muted значит разное`
        // ГЛУШЕ, а не просто «другая»: ровно этим прежняя подложка и была
        // неверна — она делала строку заметнее, и проверка «отличается»
        // прошла бы на ней.
        const on = (bg) => contrastOf(seenOn(t.mutedSeen, bg), bg)
        const live = (bg) => contrastOf(seenOn(t.plainSeen, bg), bg)
        if (on(t.surface) >= live(t.surface)) {
          return `${theme}: приглушённая строка контрастнее живой (${on(t.surface).toFixed(2)} против ${live(t.surface).toFixed(2)})`
        }
        for (const [name, bg] of [['обычной', t.surface], ['зебре', t.zebra], ['наведении', t.hover], ['выборе', t.selected]]) {
          const cr = on(bg)
          if (cr < 4.5) return `${theme}: приглушённый текст на ${name} подложке даёт ${cr.toFixed(2)} при поле 4.5`
        }
      }
      return true
    },
  },
  {
    name: 'Pagination: полоса подвала переживает длину текста и приходит к компактному виду на узком',
    why: 'треки `1fr` не сжимаются ниже содержимого, и полоса выезжала за карточку: на 1.5× случай `page-size` требовал 1272px при полосе 300, кнопка «вперёд» уходила под правый край, у кадра появлялась горизонтальная прокрутка. Русский текст короткий — дефект был невидим до псевдолокали и существовал до словаря (DS-142). Замер до правки: 66 переполнений из 240 сочетаний, 18 из них в русском. Переносом это вылечено НЕ ДО КОНЦА, и вторую половину принесла DS-149: на кадре 360 ряд номеров переносился, и полоса становилась блоком из 4–6 рядов — не пагинацией, а списком. Раскладкой это не чинится вовсе, семь кнопок с длинными «назад»/«вперёд» требуют 33.49em в одну строку (замер, псевдолокаль, настоящее окно `pageWindow(97,200)`; было 34.18em при базе `--ds-fs-base` 13, DS-375 подняла её до 14), а кадр 360 даёт полосе самое большее 28.24em содержимого (было 30.42em). Единственный способ не переносить — не показывать столько кнопок',
    // 1800, а не 900: с DS-282 в группе есть полоса 1700px — ширина, на
    // которой псевдоключевой ряд помещается в свою колонку. Ширина `body`
    // здесь ни на что не влияет (каждая полоса лежит в своём `.ds-scale` с
    // явной шириной), но полоса шире `body` читалась бы как недосмотр.
    width: 1800,
    /**
     * Текст — ПСЕВДОЛОКАЛЬ верстака (`?text=pseudo`), тот же, которым дефект
     * нашли. Немецкий здесь пробовали и он оказался слишком коротким: с ним
     * возврат `1fr`, снятый `overflow-wrap` и выключенный `@container` — три
     * мутации из четырёх — прогон ПЕРЕЖИВАЛИ. Проверка, откалиброванная по
     * сегодняшнему самому длинному переводу, перестаёт ловить дефект в тот
     * день, когда появляется перевод длиннее; псевдоключ длиннее любого
     * перевода по построению и не требует второго словаря.
     *
     * Ключ ещё и НЕРАЗРЫВЕН — в нём нет пробелов, — то есть он проверяет
     * `overflow-wrap: anywhere` отдельно от переноса: без него минимум трека
     * равен всему слову, и полоса вылезает при любом сжатии.
     *
     * РЯД НОМЕРОВ ТЕПЕРЬ НАСТОЯЩИЙ — вывод `renderWindow(pageWindow(97, 200))`,
     * то есть `1 … 96 97 98 … 200`, семь элементов ряда со стрелками. До
     * DS-149 здесь стояло сокращение из пяти (`1 …97 …200`), и оно
     * занижало требование ряда на две кнопки: было 29.19em вместо 34.18em при
     * базе 13 (сейчас, после подъёма базы 13→14 DS-375, полный ряд
     * просит 33.49em — усечённый здесь заново не мерился, вопрос давно закрыт
     * DS-149). Разница решает вопрос, а не уточняет его: усечённое
     * требование лежало НИЖЕ тогдашнего порога складывания 34em, то есть по
     * заниженной разметке выходило, что сложенный ряд номеров в одну строку
     * помещается, а по настоящей — не помещается никогда.
     *
     * Ширины 440 и 1700 (JIG-29, второй круг: было 300 и 1700, узкая сторона
     * переехала на пол системы) — две ветки правила складывания одним
     * прогоном: первая складывается на всех шкалах, вторая не складывается ни
     * на одной. 1700 стоит на месте прежней 708: с
     * DS-282 порог складывания считается по КОЛОНКЕ ряда, а не по ширине
     * полосы, и 708 теперь сложена на двух шкалах из трёх. Заодно 1700 —
     * единственная ширина, на которой у ПСЕВДОКЛЮЧЕВОГО ряда колонка своя
     * (требование на шкале 1 — 83.5em, было 84.8em при базе 13), то есть
     * единственная, где вопрос «стоит ли диапазон по центру» вообще имеет
     * ответ.
     *
     * 440 добавлена DS-149 и держит то, что компактный вид у группы
     * отнял: на 440 при шкале 1 содержимое 30.29em (было 32.6em при базе 13) —
     * выше порога компактного вида (29em), номера на месте, полоса сложена.
     * Псевдоключевой ряд просит там 33.49em, то есть КОЛОНКИ ему мало даже в
     * сложенной полосе: ширина проверяет, что уступает при этом слово в кнопке
     * (`overflow-wrap`), а не ряд переносом и не полоса выездом.
     *
     * 900 — ширина ради ЕДИНИЦЫ порога, а не ради ещё одного замера, и она
     * заменила прежнюю 500 вместе с самим порогом. Порог написан в `em`, то
     * есть едет вместе с `--ds-ui-scale`: на 0.875 содержимое 72.33em и полоса
     * ряд держит, на 1.5 — 41.71em и складывается (было 77.9em / 44.9em при
     * базе 13 — САМО СОДЕРЖИМОЕ в пикселях, 886 и 876, подъём базы не
     * заметил вовсе, оно рем-based; изменился только знаменатель em). Тот же
     * порог в пикселях (`826px`, ровно 59em при шкале 1, было 780px) даёт на
     * 900px ОДИН И ТОТ ЖЕ ответ на обеих шкалах — содержимое 886 и 876px, оба
     * выше 826, — и без этой ширины мутация «перевести порог в px» прогон
     * переживала.
     */
    html: (() => {
      const RU = {
        prev: 'Назад', next: 'Вперёд', size: 'На странице',
        // «Стр.» — умолчание `pagination.position` с DS-283. Набор RU
        // здесь мерит ШИРИНУ настоящего текста, поэтому приписка обязана в нём
        // быть: без неё замер отвечал бы про строку, которой на экране нет.
        range: '1921&ndash;1940 из 4000', pos: 'Стр. 97 из 200',
      }
      const PSEUDO = {
        prev: '&#10214;pagination.prev&#10215;',
        next: '&#10214;pagination.next&#10215;',
        size: '&#10214;pagination.pageSizeLabel&#10215;',
        range: '&#10214;pagination.range:1921,1940,4000&#10215;',
        pos: '&#10214;pagination.position:97,200&#10215;',
      }
      // Разметка — вывод компонента при `variant="pages"`, page 97 из 200.
      // Стрелка несёт ОБА написания: слово видно в широкой полосе, знак — в
      // компактной. Одна пара кнопок, а не две (решение DS-149).
      const step = (t, glyph) => `<button class="ds-pager__btn">`
        + `<span class="ds-pager__word">${t}</span>`
        + `<span class="ds-pager__arrow" aria-hidden="true">${glyph}</span></button>`
      const bar = (id, sc, t, w) => `
      <div class="ds-scale" style="--ds-ui-scale: ${sc}; width: ${w}px">
        <nav class="ds-pager ds-pager--bar ds-pager--pages" id="${id}">
          <div class="ds-pager__size">
            <span class="ds-pager__sizelabel">${t.size}</span>
            <select class="ds-pager__select"><option>20</option></select>
          </div>
          <span class="ds-pager__range">${t.range}</span>
          <div class="ds-pager__nav">
            ${step(t.prev, '&lsaquo;')}
            <button class="ds-pager__btn ds-pager__btn--page">1</button>
            <span class="ds-pager__jump"><span class="ds-pager__gap">&hellip;</span><button class="ds-pager__btn ds-pager__btn--page">96</button></span>
            <button class="ds-pager__btn ds-pager__btn--page is-active">97</button>
            <button class="ds-pager__btn ds-pager__btn--page">98</button>
            <span class="ds-pager__jump"><span class="ds-pager__gap">&hellip;</span><button class="ds-pager__btn ds-pager__btn--page">200</button></span>
            <span class="ds-pager__pos">${t.pos}</span>
            ${step(t.next, '&rsaquo;')}
          </div>
        </nav>
      </div>`
      const out = []
      // Прежняя группа: псевдолокаль, три шкалы, четыре ширины.
      for (const sc of PAGER_LEGACY_SCALES) {
        for (const w of PAGER_LEGACY_WIDTHS) out.push(bar(`pg-${scaleKey(sc)}-${w}`, sc, PSEUDO, w))
      }
      // Компактная группа: ТРИ шкалы из пяти (`PAGER_COMPACT_SCALES`, JIG-29 —
      // 0.875 и 1 сняты, см. докблок `PAGER_SCALES`), ОБА набора текста, пол
      // системы 440 с двух сторон — полоса 440 и полоса 460. Вторая ширина
      // здесь не для полноты, а для того же довода, что раньше держали
      // 300/360 (две реализации одной ширины не должны разойтись): полоса 440
      // требует от порога 19.81…34.78em по шкале, полоса 460 — 20.76…36.41em,
      // и обе на трёх оставшихся шкалах лежат выше порога компактного вида.
      for (const sc of PAGER_COMPACT_SCALES) {
        for (const [set, t] of [['ru', RU], ['pseudo', PSEUDO]]) {
          for (const w of [440, 460]) out.push(bar(`cm-${scaleKey(sc)}-${set}-${w}`, sc, t, w))
        }
      }
      // Полоса ПОЛОСА: сложена, но номера на месте. Содержимое 30.29em и
      // 29.91em — между вторым порогом и первым (было 32.62em / 32.21em при
      // базе 13). Без этой группы «компактный вид всегда» прошло бы все
      // проверки выше, а второй порог перестал бы быть вторым.
      for (const [sc, w] of [['1', 440], ['1.15', 500]]) {
        for (const [set, t] of [['ru', RU], ['pseudo', PSEUDO]]) {
          out.push(bar(`bd-${scaleKey(sc)}-${set}-${w}`, sc, t, w))
        }
      }
      return out.join('')
    })(),
    measure: () => {
      // Невидимая коробка — НЕ ряд. Номера в компактном виде сняты через
      // `display: none`, их прямоугольник весь нулевой, и по центру он сел бы в
      // строку 0 с левой кромкой 0 — то есть верная вёрстка читалась бы как
      // разъехавшиеся кромки. Ловушка не теоретическая: первый прогон этого
      // случая после правки упал именно так.
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0 }
      // Ряд — это всё, что стоит на одной высоте. Ряды считаются по ЦЕНТРУ, а
      // не по верхней кромке: коробки в ряду разной высоты — многоточие 17.5px
      // против кнопки 28px, селект против двухстрочной подписи — и все они
      // центрированы, так что по верхней кромке соседи по ряду разъезжаются на
      // 5–8px и каждый становится «своим рядом». Первая редакция этой проверки
      // так и считала и объявляла разорванным всё подряд.
      const rowKey = (el) => {
        const r = el.getBoundingClientRect()
        return Math.round((r.top + r.height / 2) / 4)
      }
      const read = (id) => {
        const bar = document.querySelector(`#${id}`)
        const cs = getComputedStyle(bar)
        const br = bar.getBoundingClientRect()
        const padR = parseFloat(cs.paddingRight)
        const fs = parseFloat(cs.fontSize)
        const nav = bar.querySelector('.ds-pager__nav')
        const nr = nav.getBoundingClientRect()
        const kids = [...nav.children].filter(vis)
        // По ВСЕМ потомкам, а не по трём зонам: зона с `min-width: 0` сама
        // остаётся в треке, а наружу вылезает кнопка внутри неё.
        const right = Math.max(...[...bar.querySelectorAll('*')].filter(vis)
          .map((el) => el.getBoundingClientRect().right))
        const range = bar.querySelector('.ds-pager__range').getBoundingClientRect()
        const pos = bar.querySelector('.ds-pager__pos')
        const pr = pos.getBoundingClientRect()
        return {
          over: +(right + padR - br.left - br.width).toFixed(2),
          // Ширина СОДЕРЖИМОГО в единицах порога. Печатается всегда: порог
          // написан в `em`, и число рядом с вердиктом отвечает на «а почему
          // тут сработало», не заставляя считать в уме.
          em: +((br.width - parseFloat(cs.paddingLeft) - padR) / fs).toFixed(2),
          // Кромки РЯДОВ полосы: зоны и, внутри ряда номеров, каждая
          // перенесённая строка кнопок.
          lefts: (() => {
            const leaves = [...bar.querySelectorAll('.ds-pager__size > *, .ds-pager__nav > *')]
              .concat([bar.querySelector('.ds-pager__range')]).filter(vis)
            const rows = new Map()
            for (const el of leaves) {
              const r = el.getBoundingClientRect()
              const k = rowKey(el)
              rows.set(k, Math.min(rows.get(k) ?? Infinity, r.left))
            }
            const v = [...rows.values()]
            return +(Math.max(...v) - Math.min(...v)).toFixed(2)
          })(),
          // Сколько рядов занимает САМ ряд номеров. Это и есть предмет
          // DS-149: на 360 их было 2–3, а вместе со сложенными зонами
          // полоса выходила блоком из 4–6.
          navRows: new Set(kids.map(rowKey)).size,
          // Сколько рядов у всей полосы. Сложенная полоса — это ТРИ ряда
          // (селектор, диапазон, навигация), и больше трёх значит перенос.
          barRows: new Set([...bar.querySelectorAll('.ds-pager__size > *, .ds-pager__nav > *')]
            .concat([bar.querySelector('.ds-pager__range')]).filter(vis).map(rowKey)).size,
          // Разорвана ли пара «многоточие + его страница» переносом — тем же
          // центром, по той же причине. Невидимые пары не считаются: у них
          // обе коробки в нуле, разницы нет, и «не разорвано» было бы
          // утверждением ни о чём.
          jumpSplit: [...bar.querySelectorAll('.ds-pager__jump')].filter(vis).filter((j) => {
            const [g, b] = [...j.children].map((c) => {
              const r = c.getBoundingClientRect()
              return r.top + r.height / 2
            })
            return Math.abs(g - b) > 1
          }).length,
          // Сложена ли полоса в столбец — по ПРАВИЛУ, а не по координатам.
          // Считать по `top` нельзя: при `align-items: center` зоны разной
          // высоты и так стоят на разных отметках, и несложенная полоса с
          // перенесённым рядом номеров читалась как сложенная. Мутация
          // «выключить @container» на такой проверке проходила.
          stacked: getComputedStyle(nav).gridColumnEnd === '-1',
          // Компактный вид — тоже по СОСТАВУ ряда, а не по ширине: сколько
          // номеров видно и виден ли указатель позиции.
          nums: [...nav.querySelectorAll('.ds-pager__btn--page, .ds-pager__jump')].filter(vis).length,
          posShown: vis(pos),
          // Слово в стрелке против знака: в компактном виде видно РОВНО ОДНО
          // из двух. Обе мутации («не прятать слово», «не показывать знак»)
          // ловятся здесь, а не по ширине кнопки.
          words: [...nav.querySelectorAll('.ds-pager__word')].filter(vis).length,
          arrows: [...nav.querySelectorAll('.ds-pager__arrow')].filter(vis).length,
          // Указатель — по центру РЯДА стрелок. `space-between` дал бы центр
          // только при стрелках одинаковой ширины, а «Назад» и «Вперёд» разной.
          posOff: vis(pos)
            ? +Math.abs((pr.left + pr.right) / 2 - (nr.left + nr.width / 2)).toFixed(2)
            : null,
          // Вылез ли кто-то за свой ряд В ЛЮБУЮ сторону. Правостороннее `over`
          // этого не видит: элемент, выровненный по концу трека, при нехватке
          // места уезжает ВЛЕВО и накладывается на соседа, а правый край
          // полосы остаётся чистым. Первая редакция компактного вида так и
          // сделала — 593px содержимого в ряду шириной 276, `over` ноль.
          outside: kids.filter((el) => {
            const r = el.getBoundingClientRect()
            return r.left < nr.left - 0.5 || r.right > nr.right + 0.5
          }).length,
          overlap: (() => {
            const s = kids.map((el) => el.getBoundingClientRect()).sort((a, b) => a.left - b.left)
            let n = 0
            for (let i = 1; i < s.length; i++) if (s[i].left < s[i - 1].right - 0.5) n++
            return n
          })(),
          // Центр диапазона против центра полосы — на несложенной полосе они
          // обязаны совпасть, иначе три колонки перестали быть тремя колонками.
          off: +Math.abs((range.left + range.right) / 2 - (br.left + br.width / 2)).toFixed(2),
        }
      }
      const out = {}
      for (const el of document.querySelectorAll('.ds-pager--bar')) out[el.id] = read(el.id)
      return out
    },
    expect: (m) => {
      const keys = (p) => Object.keys(m).filter((k) => k.startsWith(p))
      const over = Object.entries(m).filter(([, v]) => v.over > 0.5)
      if (over.length) {
        return `полоса не вместила свой текст: ${over.map(([k, v]) => `${k} на +${v.over}px`).join(', ')}`
      }
      // Обратные мутации. Без них «сложить всё и всегда» прошло бы: полоса,
      // сложенная в столбец на любой ширине, не переполняется никогда — и
      // перестаёт быть полосой из трёх колонок.
      //
      // «Узкая» сторона ПЕРЕЕХАЛА С 300 НА 440 (JIG-29, второй круг, решение
      // владельца): грандфазер «дефект однажды увидели глазами» из CLAUDE.md
      // отменён, и 300 снят из PAGER_LEGACY_WIDTHS. Замена не выдумана —
      // проверена живым прогоном (`npm run measure`): на 440 полоса СКЛАДЫВАЕТСЯ
      // на ВСЕХ ТРЁХ шкалах (0.875 em 34.78, 1 em 30.29, 1.5 em 19.81), то есть
      // 440 держит то же утверждение, что раньше держал 300, без потери предмета.
      const wide = ['pg-0_875-1700', 'pg-1-1700', 'pg-1_5-1700']
      const narrow = ['pg-0_875-440', 'pg-1-440', 'pg-1_5-440']
      const stuck = wide.filter((k) => m[k].stacked)
      if (stuck.length) return `на 1700px полоса сложилась в столбец: ${stuck.join(', ')} — ряд отдали там, где он ещё помещается`
      const flat = narrow.filter((k) => !m[k].stacked)
      if (flat.length) return `на 440px полоса не сложилась: ${flat.join(', ')} — зоны сжаты в столбик вместо рядов`
      // Ряд номеров НЕ ПЕРЕНОСИТСЯ (DS-282). Прежде здесь стояла пара
      // утверждений про многоточие: «пара „… N“ нигде не разорвана» плюс
      // страховка «а перенос вообще где-нибудь случился, иначе ноль разрывов —
      // ноль ни о чём». Обе сняты вместе с переносом: разорвать пару теперь
      // нечем, то есть первое стало НЕОПРОВЕРЖИМЫМ (docs/writing-checks.md,
      // п.3), а страховка — заведомо красной. Их место заняло утверждение
      // сильнее: рядов у ряда ровно один. Оно опровержимо здесь же —
      // псевдоключевой ряд на 440 просит 34.17em при 32.6em содержимого, и
      // возврат `flex-wrap: wrap` немедленно даёт ему второй ряд.
      const wrapped = keys('pg-').filter((k) => m[k].nums > 0 && m[k].navRows > 1)
      if (wrapped.length) {
        return `ряд номеров разорван переносом: ${wrapped.map((k) => `${k} в ${m[k].navRows} ряда при ${m[k].em}em`).join(', ')}`
      }
      // У сложенной полосы ОДНА левая кромка. Центрирование каждого ряда по
      // себе писали первым, и оно не читалось: ряды сильно разной ширины,
      // кромки шли 112.6 / 139.3 / 64.3 / 149.5, блок плавал.
      const ragged = narrow.filter((k) => m[k].lefts > 0.5)
      if (ragged.length) {
        return `кромки рядов сложенной полосы разъехались: ${ragged.map((k) => `${k} на ${m[k].lefts}px`).join(', ')}`
      }
      // Порог ЕДЕТ СО ШКАЛОЙ. На одной и той же физической ширине 900px
      // разреженный интерфейс ряд держит, а плотный складывается — потому что
      // порог в `em`. Порог, написанный в px (826px — это 59em при шкале 1,
      // было 780px при базе 13), дал бы здесь ОДИН ответ на обеих шкалах:
      // содержимое 886 и 876px, оба выше 826. Ширина подобрана именно так, а
      // не «поудобнее».
      if (m['pg-0_875-900'].stacked) return 'на 900px при шкале 0.875 полоса сложилась — порог перестал ехать со шкалой'
      if (!m['pg-1_5-900'].stacked) return 'на 900px при шкале 1.5 полоса не сложилась — порог перестал ехать со шкалой'
      // Центр остаётся центром — тот самый довод, ради которого здесь сетка, а
      // не space-between.
      const skew = wide.filter((k) => m[k].off > 1)
      if (skew.length) return `диапазон уехал из центра полосы: ${skew.map((k) => `${k} на ${m[k].off}px`).join(', ')}`

      // --- DS-149: на полу 440 полоса приходит к компактному виду (JIG-29, было 360) ---
      // Площадь названа ЛИТЕРАЛОМ, а не длиной того же списка, из которого
      // собрана разметка (docs/writing-checks.md, п.7): счёт, прочитанный
      // оттуда же, согласится сам с собой и останется зелёным, когда площадь
      // сожмётся до одного случая.
      const cm = keys('cm-')
      if (cm.length !== 12) {
        return `компактную группу обошли на ${cm.length} случаях вместо 12 (3 шкалы × 2 набора текста × 2 ширины пола 440)`
      }
      const busy = cm.filter((k) => m[k].navRows !== 1)
      if (busy.length) {
        return `на полу 440 ряд номеров всё ещё переносится: ${busy.map((k) => `${k} в ${m[k].navRows} ряда при ${m[k].em}em`).join(', ')}`
      }
      const tall = cm.filter((k) => m[k].barRows !== 3)
      if (tall.length) {
        return `на полу 440 полоса не уложилась в три ряда: ${tall.map((k) => `${k} в ${m[k].barRows}`).join(', ')}`
      }
      const shown = cm.filter((k) => m[k].nums !== 0)
      if (shown.length) {
        return `в компактном виде остались номера: ${shown.map((k) => `${k} — ${m[k].nums}`).join(', ')}`
      }
      const blind = cm.filter((k) => !m[k].posShown)
      if (blind.length) return `в компактном виде не видно указателя позиции: ${blind.join(', ')}`
      // Слово и знак в стрелке — РОВНО ОДНО из двух, и именно знак. Пара
      // стрелок одна: две (слово плюс знак) значили бы удвоенное управление.
      const spoken = cm.filter((k) => m[k].words !== 0 || m[k].arrows !== 2)
      if (spoken.length) {
        return `стрелки компактного вида не свелись к знакам: ${spoken.map((k) => `${k} — слов ${m[k].words}, знаков ${m[k].arrows}`).join(', ')}`
      }
      const spilled = cm.filter((k) => m[k].outside || m[k].overlap)
      if (spilled.length) {
        return `в компактном ряду коробки наложились или вылезли: ${spilled.map((k) => `${k} — наружу ${m[k].outside}, внахлёст ${m[k].overlap}`).join(', ')}`
      }
      const offcentre = cm.filter((k) => m[k].posOff > 1)
      if (offcentre.length) {
        return `указатель позиции не по центру ряда: ${offcentre.map((k) => `${k} на ${m[k].posOff}px`).join(', ')}`
      }

      // --- Второй порог ОБЯЗАН быть ниже первого ---
      // Полоса сложена, а номера на месте: между 29em и 34em есть живая
      // ширина, и компактный вид не съел форму, ради которой писали 34em
      // (было 31em при базе `--ds-fs-base` 13, DS-375 подняла её до 14).
      const bd = keys('bd-')
      if (bd.length !== 4) return `полосу между порогами обошли на ${bd.length} случаях вместо 4`
      const collapsed = bd.filter((k) => m[k].nums === 0 || m[k].posShown)
      if (collapsed.length) {
        return `между порогами компактный вид сработал раньше времени: ${collapsed.map((k) => `${k} при ${m[k].em}em`).join(', ')} — второй порог перестал быть вторым`
      }
      const unfolded = bd.filter((k) => !m[k].stacked)
      if (unfolded.length) {
        return `между порогами полоса не сложилась: ${unfolded.map((k) => `${k} при ${m[k].em}em`).join(', ')} — случай проверяет не то`
      }
      return true
    },
  },
  {
    name: 'Оверлеи на кадре 440: предел ширины уступает вьюпорту, а не выносит окно за край',
    why: 'пределы ширины семейства были написаны как `calc(<rem> * scale)` без слагаемого о вьюпорте, и на прежнем кадре 360 (до переезда пола, DS-380) при шкале 1.5 разъезжались все разом: Modal 480 (слева −60, справа 420 — начало заголовка срезано на 35px, крестик закрытия на 371..407, то есть закрыть окно мышью было нельзя), Toast 390 с крестиком за краем, центр уведомлений 480, подсказка 829.7 (−234.9..594.9, режется с ОБЕИХ сторон), строка поиска 480 — документ уезжал в горизонтальную прокрутку (scrollWidth 579 при clientWidth 360, числа исторические). Виновата `min-width`, а не `max-width`: потолок лишь не даёт расти, пол ОТКАЗЫВАЕТСЯ сжиматься. Приём в системе уже был и противоречил сам себе: `.ds-toaster` зажат `min(calc(22.5rem*scale), calc(100vw - calc(2rem*scale)))`, а его собственный ребёнок `.ds-toast` пробивал этот зажим своей `min-width` (DS-167)',
    viewport: 440,
    // Настоящая настройка браузера, а не `extraCss`: у `.ds-drawer--right`
    // въезд начинается с `translateX(100%)`, и без `reduce` контрольный ящик
    // меряется В ПОЛЁТЕ.
    reducedMotion: 'reduce',
    html: overlayFamilyHtml(),
    measure: overlayFamilyMeasure,
    expect: (m) => {
      const edge = m.doc.client
      // Кадр обязан быть узким. Без этой строки случай, потерявший `viewport`,
      // прошёл бы на общих 900px, ничего не проверив, — ловушка 1 из
      // docs/writing-checks.md.
      if (edge > 500) return `кадр ${edge}px — это не узкий экран, поле viewport до страницы не доехало`
      const bad = []
      if (m.doc.scroll !== edge) bad.push(`документ уехал вбок: scrollWidth ${m.doc.scroll} при clientWidth ${edge}`)
      for (const sc of OVERLAY_SCALES) {
        for (const [key, name] of Object.entries(OVERLAY_NAMES)) {
          const b = m[sc][key]
          if (!b) continue
          if (b.l < -0.5) bad.push(`×${sc}: ${name} срезан слева — левый край ${b.l}`)
          if (b.r > edge + 0.5) bad.push(`×${sc}: ${name} за правым краем — правый край ${b.r} при кадре ${edge}`)
        }
      }
      // Drawer — КОНТРОЛЬ, а не ещё один подопечный: он знал про вьюпорт и до
      // правки (`min(calc(22.5rem*scale), 90vw)`), с него семейство и списано.
      //
      // НА КАДРЕ 440 ПОБЕДИТЕЛЬ РАЗНЫЙ ПО ШКАЛЕ (JIG-29, было «90vw от 360 —
      // 324 на всех трёх», переезд пола 360 → 440 это утверждение сломал, а
      // не просто сдвинул число). 22.5rem — это 360px (rem 16, без scale),
      // 90vw от 440 — 396px. На шкале 1 побеждает REM (360 < 396) — впервые
      // здесь контроль сам садится на рем-константу, а не на долю экрана;
      // на 1.25 и 1.5 рем растёт (450, 540) и побеждает вьюпорт (396 на
      // обеих). Числа сняты живым прогоном `npm run measure` после переезда.
      const want = { 1: 360, '1.25': 396, '1.5': 396 }
      for (const sc of OVERLAY_SCALES) {
        const w = m[sc].drawer.w
        if (Math.abs(w - want[sc]) > 0.5) bad.push(`×${sc}: Drawer ${w} вместо ${want[sc]} — сдвинулся образец, по которому выправлено остальное`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Оверлеи на кадре 1024: зажим НЕ срабатывает там, где место есть',
    why: 'зажим по вьюпорту чинит узкий экран и ровно поэтому способен незаметно испортить широкий: константы 20rem / 16.25rem / 35rem / 25rem / 22.5rem — это решение о плотности, а не запас, и «заодно» уменьшать их нельзя. Числа здесь сняты с ЭТОГО ЖЕ прогона ДО правки (docs/writing-checks.md, п.7 — площадь называется литералом): Modal 560/700/840 по потолку и 320/400/480 по полу, Toast 260/325/390 по полу и 400/500/600 по потолку, центр уведомлений 320/400/480, строка поиска 320/400/480, Drawer 360/450/540. Пол окна виден ТОЛЬКО в узкой подложке: при `width: 100%` в подложке во всю ширину `min-width` не проявляется вовсе, и уменьшение 20rem прошло бы молча (DS-167)',
    viewport: 1024,
    reducedMotion: 'reduce',
    html: overlayFamilyHtml({ narrowModal: true }),
    measure: overlayFamilyMeasure,
    expect: (m) => {
      const edge = m.doc.client
      if (edge < 1000) return `кадр ${edge}px — на нём зажим по вьюпорту срабатывает законно, случай проверяет не то`
      const want = {
        '1': { modal: 560, narrowModal: 320, toast: 260, toastLong: 400, notifs: 320, gs: 320, gsBar: 320, drawer: 360 },
        '1.25': { modal: 700, narrowModal: 400, toast: 325, toastLong: 500, notifs: 400, gs: 400, gsBar: 400, drawer: 450 },
        '1.5': { modal: 840, narrowModal: 480, toast: 390, toastLong: 600, notifs: 480, gs: 480, gsBar: 480, drawer: 540 },
      }
      const bad = []
      if (m.doc.scroll !== edge) bad.push(`документ уехал вбок: scrollWidth ${m.doc.scroll} при clientWidth ${edge}`)
      for (const sc of OVERLAY_SCALES) {
        for (const [key, px] of Object.entries(want[sc])) {
          const got = m[sc][key].w
          if (Math.abs(got - px) > 0.5) bad.push(`×${sc}: ${OVERLAY_NAMES[key]} ${got} вместо ${px} — размер поехал там, где места вдоволь`)
        }
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Tooltip на кадре 440: длинная подсказка переносится по пределу, короткая остаётся в одну строку',
    why: 'у пузырька не было предела ширины вовсе, а `white-space: nowrap` запрещал перенос: на прежнем кадре 360 (до переезда пола, DS-380) подсказка выходила 829.7px и обрезалась с ОБЕИХ сторон сразу (−234.9..594.9, число историческое). Предложение в подсказке по-прежнему значит, что потребителю нужен Popover, — но обрезанный с двух сторон текст это не сигнал, это нечитаемая строка; две строки хуже одной, обрезка с двух сторон хуже двух строк. Короткая подсказка обязана остаться однострочной: `width: max-content` — единственное, что отличает «перенос по пределу» от «блок во всю доступную ширину» (DS-167)',
    viewport: 440,
    html: OVERLAY_SCALES.map((sc) => `<div class="ds-scale" style="--ds-ui-scale: ${sc}; height: 140px">${tooltipRowHtml(sc)}</div>`).join(''),
    measure: overlayFamilyMeasure,
    expect: (m) => {
      // Потолок считается от 440 буквально, поэтому кадр обязан быть ровно им
      // и без вертикальной полосы (`100vw` её ширину включает, `clientWidth` —
      // нет). Фикстура на 420px по высоте полосу не заводит.
      if (m.doc.client !== 440) return `кадр ${m.doc.client}px вместо 440 — литералы потолка ниже посчитаны не про него`
      const bad = []
      for (const sc of OVERLAY_SCALES) {
        const v = m[sc]
        const ceiling = Math.min(320 * +sc, 440 - 32 * +sc)
        if (v.tipShortLines !== 1) bad.push(`×${sc}: короткая подсказка легла в ${v.tipShortLines} строк(и) — она обязана остаться однострочной`)
        if (v.tipShort.w > ceiling - 1) bad.push(`×${sc}: короткая подсказка ${v.tipShort.w} упёрлась в потолок ${ceiling} — фикстура не отличает короткую от длинной`)
        if (v.tipLongLines < 2) bad.push(`×${sc}: длинная подсказка легла в ${v.tipLongLines} строку шириной ${v.tipLong.w} — переноса нет, текст режется по краям`)
        if (Math.abs(v.tipLong.w - ceiling) > 0.5) bad.push(`×${sc}: длинная подсказка ${v.tipLong.w} вместо потолка ${ceiling} (min(20rem×шкала, 100vw − 2rem×шкала))`)
        if (v.tipLong.l < -0.5) bad.push(`×${sc}: длинная подсказка срезана слева — левый край ${v.tipLong.l}`)
        if (v.tipLong.r > 440.5) bad.push(`×${sc}: длинная подсказка за правым краем — правый край ${v.tipLong.r}`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Tooltip на кадре 1024: потолок ровно 20rem×шкала, короткая подсказка не тронута',
    why: 'перенос по пределу чинит узкий экран, но константа 20rem — это решение о том, где длинная подсказка перестаёт быть подсказкой, и она не должна уехать заодно. На широком кадре доля вьюпорта (992/984/976) заведомо больше 20rem×шкала (320/400/480), значит потолок обязан быть равен именно rem-константе; короткая подсказка обязана по-прежнему считаться по содержимому, а не по потолку (DS-167)',
    viewport: 1024,
    html: OVERLAY_SCALES.map((sc) => `<div class="ds-scale" style="--ds-ui-scale: ${sc}; height: 140px">${tooltipRowHtml(sc)}</div>`).join(''),
    measure: overlayFamilyMeasure,
    expect: (m) => {
      if (m.doc.client < 1000) return `кадр ${m.doc.client}px — на нём потолок задаёт вьюпорт, а случай про rem-константу`
      const bad = []
      for (const sc of OVERLAY_SCALES) {
        const v = m[sc]
        const ceiling = 320 * +sc
        if (v.tipShortLines !== 1) bad.push(`×${sc}: короткая подсказка легла в ${v.tipShortLines} строк(и)`)
        if (v.tipShort.w > ceiling - 1) bad.push(`×${sc}: короткая подсказка ${v.tipShort.w} упёрлась в потолок ${ceiling} — её ширину перестало решать содержимое`)
        if (v.tipLongLines < 2) bad.push(`×${sc}: длинная подсказка легла в ${v.tipLongLines} строку шириной ${v.tipLong.w}`)
        if (Math.abs(v.tipLong.w - ceiling) > 0.5) bad.push(`×${sc}: длинная подсказка ${v.tipLong.w} вместо 20rem×${sc} = ${ceiling}`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Tabs на кадре 440: слот в конце бара остаётся на экране, а листается лента под ним',
    why: 'слот `trailing` рисовался ПОСЛЕДНИМ РЕБЁНКОМ `.ds-tabs__list`, то есть внутри прокручиваемого содержимого. Из этого следовали два дефекта. Первый: замер `scrollWidth > clientWidth`, которым Tabs решает «вкладок больше, чем места» и включает стрелки или «⋯», считал начинку слота ЗА ВКЛАДКУ — защита от переполнения у компонента есть, а отвечала она не на свой вопрос. Второй, и он хуже: начинка уезжала вместе с лентой. В верстаке на прежнем кадре 360 (до переезда пола, DS-380) кнопка слота стояла на 416..551 при правом крае бара 330 — за экраном, достать её можно было только домотав ленту вкладок до конца; а в гонке, когда начинка приезжает асинхронно и `ResizeObserver` ленты не срабатывает (её бокс не изменился), лента не получала `is-scrollable` вовсе, и лишнее забирал документ: scrollWidth 551 при clientWidth 470 (числа исторические). Стало: слот — СОСЕД ленты и последний ребёнок бара, резервирует свою ширину первым (`flex: 0 0 auto`), лента берёт остаток (`flex: 1 1 auto; min-width: 0`), и переполнение считается против остатка (DS-205)',
    viewport: 440,
    html: TABS_TRAILING_BAR,
    measure: tabsTrailingMeasure,
    expect: (m) => {
      const edge = m.doc.client
      // Кадр обязан быть узким. Без этой строки кейс, потерявший `viewport`,
      // прошёл бы на общих 900px, ничего не проверив, — ловушка 1 из
      // docs/writing-checks.md.
      if (edge > 500) return `кадр ${edge}px — это не узкий экран, поле viewport до страницы не доехало`
      if (m.tabs !== 6) return `вкладок ${m.tabs} вместо 6 — снимок с компонента разошёлся с кейсом`
      const bad = []
      // Место в дереве — предмет задачи. Числа ниже старая раскладка
      // проходила бы ровно там, где лента и так обрезает всё подряд.
      if (m.slotInTablist) bad.push('слот снова внутри role="tablist" — он опять едет вместе с лентой и опять считается вкладкой')
      if (!m.slotIsLastInBar) bad.push('слот не последний ребёнок бара — он встал перед стрелками или «⋯» и будет прыгать, когда те появляются')
      // Лента ОБЯЗАНА быть переполненной: иначе кейс мерит бар, у которого
      // вопроса «вкладок больше, чем места» не возникает вовсе.
      if (m.list.scroll <= m.list.client + 1) {
        bad.push(`лента не переполнена (${m.list.scroll} при ${m.list.client}) — на этом кадре вкладки обязаны не влезать, иначе кейс не про переполнение`)
      }
      if (m.doc.scroll !== edge) bad.push(`документ уехал вбок: scrollWidth ${m.doc.scroll} при clientWidth ${edge}`)
      if (m.slot.r > edge + 0.5) bad.push(`слот за правым краем: правый край ${m.slot.r} при кадре ${edge}`)
      if (m.slot.l < -0.5) bad.push(`слот срезан слева: левый край ${m.slot.l}`)
      // «Виден целиком» — это не только «в кадре», но и «не под лентой»:
      // лента обрезает своё содержимое, и слот, начавшийся левее её правого
      // края, был бы наполовину съеден.
      if (m.slot.l < m.list.r - 0.5) bad.push(`слот заезжает под ленту: его левый край ${m.slot.l} левее правого края ленты ${m.list.r}`)
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Tabs на кадре 768: места вдоволь — лента не переполнена, слот на том же месте',
    why: 'зажим и прокрутка чинят узкий экран и ровно поэтому способны незаметно испортить широкий: та же разметка на 768 обязана дать ленту БЕЗ переполнения (`scrollWidth === clientWidth`), иначе «вкладок больше, чем места» стало бы вечно истинным и стрелки со «⋯» висели бы всегда. Пара к кейсу на 360: без неё утверждение «слот в кадре» проходило бы и у бара, который просто всё обрезает (DS-205)',
    viewport: 768,
    html: TABS_TRAILING_BAR,
    measure: tabsTrailingMeasure,
    expect: (m) => {
      const edge = m.doc.client
      if (edge < 700) return `кадр ${edge}px — на нём вкладки законно не влезают, кейс проверяет не то`
      if (m.tabs !== 6) return `вкладок ${m.tabs} вместо 6 — снимок с компонента разошёлся с кейсом`
      const bad = []
      if (m.slotInTablist) bad.push('слот снова внутри role="tablist"')
      if (!m.slotIsLastInBar) bad.push('слот не последний ребёнок бара')
      if (m.list.scroll > m.list.client + 1) {
        bad.push(`лента переполнена там, где места вдоволь: scrollWidth ${m.list.scroll} при clientWidth ${m.list.client}`)
      }
      if (m.doc.scroll !== edge) bad.push(`документ уехал вбок: scrollWidth ${m.doc.scroll} при clientWidth ${edge}`)
      if (m.slot.r > edge + 0.5) bad.push(`слот за правым краем: правый край ${m.slot.r} при кадре ${edge}`)
      if (m.slot.l < m.list.r - 0.5) bad.push(`слот заезжает под ленту: его левый край ${m.slot.l} левее правого края ленты ${m.list.r}`)
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'SectionPanel horizontal: край, за которым есть разделы, затухает в каждом положении ленты; активный раздел выводится из-под края',
    why: 'DS-313. Решение 305 держало знак «за краем есть ещё» на видимой полосе прокрутки, а на системе с плавающими полосами (macOS по умолчанию) в покое её нет вовсе. Второй знак — маска края: у начала ленты гаснет правый, в конце — левый, в середине — оба. Утверждение про МАСКУ как функцию положения, а не про классы: класс может стоять, а маска не доехать или перебиться. Сторона читается по вычисленному градиенту — какой конец прозрачен. Положения задаются настоящим `scrollLeft` и событием `scroll`, которое ловит компонент. Полоса здесь не проверяется намеренно: знак обязан держаться без неё. Второе утверждение: выбранный за краем раздел лента сама прокручивает в видимую часть — выбранный под погашенным краем читается как «ничего не выбрано». Сосед: без прокрутки (ширина 1400) масок нет вовсе, иначе гасился бы край ленты, которой нечего листать',
    bundle: 'scripts/measure-sections.tsx',
    html: `<div class="ds-scale" style="--ds-ui-scale:1;width:440px" id="sp-narrow"></div>
      <div class="ds-scale" style="--ds-ui-scale:1;width:440px" id="sp-far"></div>
      <div class="ds-scale" style="--ds-ui-scale:1;width:1400px" id="sp-wide"></div>`,
    measure: async () => {
      WB.mountSections(document.getElementById('sp-narrow'), 'main')
      WB.mountSections(document.getElementById('sp-far'), 'extra')
      WB.mountSections(document.getElementById('sp-wide'), 'main')
      await document.fonts.ready
      const wait = () => new Promise((r) => setTimeout(r, 80))
      await wait()
      // Сторона маски: прозрачен ли левый и правый конец градиента.
      const sides = (el) => {
        const m = getComputedStyle(el).maskImage
        if (!m || m === 'none') return 'none'
        const stops = m.replace(/^linear-gradient\(to right,\s*/, '').split(/,(?![^(]*\))/).map((x) => x.trim())
        const clear = (stop) => /rgba\(0, 0, 0, 0\)|transparent/.test(stop)
        return `${clear(stops[0]) ? 'L' : '-'}${clear(stops[stops.length - 1]) ? 'R' : '-'}`
      }
      const el = document.querySelector('#sp-narrow .ds-sections')
      const at = async (pos) => { el.scrollLeft = pos; el.dispatchEvent(new Event('scroll')); await wait(); return { sl: Math.round(el.scrollLeft), sides: sides(el), cls: el.className } }
      const max = el.scrollWidth - el.clientWidth
      const start = await at(0)
      const middle = await at(max / 2)
      const end = await at(max)
      const far = document.querySelector('#sp-far .ds-sections')
      const fr = far.getBoundingClientRect(), ar = far.querySelector('.is-active').getBoundingClientRect()
      const wide = document.querySelector('#sp-wide .ds-sections')
      return {
        max, start, middle, end,
        far: { left: +(ar.left - fr.left).toFixed(1), right: +(ar.right - fr.left).toFixed(1), width: far.clientWidth, sl: Math.round(far.scrollLeft) },
        wide: { scrollable: wide.classList.contains('is-scrollable'), sides: sides(wide) },
      }
    },
    expect: (m) => {
      if (!(m.max > 40)) return `лента 440 не листается (запас ${m.max}) — замер не о прокрутке`
      if (m.middle.sl <= 1 || m.middle.sl >= m.max - 1) return `середина не встала в середину: scrollLeft ${m.middle.sl} из ${m.max}`
      const want = { start: '-R', middle: 'LR', end: 'L-' }
      const bad = Object.entries(want).filter(([k, v]) => m[k].sides !== v).map(([k, v]) => `${k}: маска ${m[k].sides}, ждали ${v} (${m[k].cls})`)
      if (m.far.left < 0 || m.far.right > m.far.width + 0.5) bad.push(`выбранный «Дополнительно» за краем: ${m.far.left}..${m.far.right} при ширине ${m.far.width}, scrollLeft ${m.far.sl}`)
      if (m.wide.scrollable || m.wide.sides !== 'none') bad.push(`лента 1400 без прокрутки, а маска ${m.wide.sides}, is-scrollable ${m.wide.scrollable}`)
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'LedgerList на развёртке 440…740: линия записи — border, шапки — border-strong, в обоих режимах ленты',
    why: 'DS-312, приёмка 310. Записи в две строки разводила линия `--ds-table-grid` 1.27 : 1, и её ослабление отдавало дату соседней записи — линия записи поднята до `--ds-border` в ОБОИХ режимах (лента не меняет вид на пороге). Попутно: общее правило «запись и шапка сеткой» стояло ниже `border-strong` шапки с тем же весом и молча его перебивало; разведено, иначе запись стала бы ярче шапки. Ритм внутри записи НЕ утверждается: ужатый (внутри 8.3 против 20 между) вслепую дважды проиграл прежнему по читаемости при той же группировке, и правка ритма отменена. Цвета сверяются с зондами токенов в той же ленте; оба режима обязаны встретиться, иначе развёртка про один. РАЗВЁРТКА ПЕРЕЕХАЛА (JIG-29, было 300…600): порог `@container (max-width: 28.4em)` живёт в компоненте и не сдвинулся, но на шкале 1 (28.4em ≈ 398px) он теперь НИЖЕ пола 440 и на этой шкале развёртка всегда «в одну строку» — держит оба режима шкала 1.5 (28.4em ≈ 597px), внутри нового диапазона',
    bundle: 'scripts/measure-ledger.tsx',
    html: [false, true].flatMap((dense) =>
      Array.from({ length: 16 }, (_, i) => 440 + i * 20).flatMap((w) => ['1', '1.5'].map((sc) =>
        `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-ledger="${dense}" data-w="${w}" data-sc="${sc}"></div>`))).join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-ledger]')]
      for (const el of hosts) WB.mountLedger(el, { dense: el.dataset.ledger === 'true' })
      await document.fonts.ready
      const probe = (root, v) => { const s = document.createElement('span'); s.style.color = `var(${v})`; root.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c }
      return hosts.map((el) => {
        const root = el.querySelector('.ds-ledger')
        const rec = root.querySelector('.ds-ledger__rec')
        return {
          dense: el.dataset.ledger, w: +el.dataset.w, sc: +el.dataset.sc,
          narrow: getComputedStyle(rec).display === 'block',
          recLine: getComputedStyle(rec).borderBottomColor, headLine: getComputedStyle(root.querySelector('.ds-ledger__head')).borderBottomColor,
          border: probe(root, '--ds-border'), strong: probe(root, '--ds-border-strong'),
        }
      })
    },
    expect: (m) => {
      // Литералом: 2 плотности × 16 ширин × 2 шкалы (ловушка 7).
      if (m.length !== 64) return `хостов ${m.length} вместо 64`
      const bad = []
      let narrow = 0, wide = 0
      for (const r of m) {
        const at = `${r.dense === 'true' ? 'dense ' : ''}${r.w}px×${r.sc}`
        if (r.border === r.strong) { bad.push(`${at}: зонды border и border-strong равны — лист не доехал`); continue }
        if (r.recLine !== r.border) bad.push(`${at}: линия записи ${r.recLine}, а --ds-border ${r.border}`)
        if (r.headLine !== r.strong) bad.push(`${at}: линия шапки ${r.headLine}, а --ds-border-strong ${r.strong}`)
        if (r.narrow) narrow++; else wide++
      }
      if (!narrow || !wide) bad.push(`режимы не встретились: в две строки ${narrow}, в одну ${wide}`)
      return bad.length === 0 || bad.slice(0, 8).join('; ') + (bad.length > 8 ? ` …ещё ${bad.length - 8}` : '')
    },
  },
  {
    name: 'AppBar на развёртке 440…840: центр не ложится на бренд, хвост и «Ещё», уступки идут по порядку',
    why: 'DS-309, найдено исполнителем DS-306. Центр шапки сжимался до `min-width: 0`, и на нуле его начинка (поиск, навигация) рисовалась ПОВЕРХ бренда и кнопок. Гейт `overflow` этого не видит: документ не едет, едет начинка поверх соседа. Решение — не обрезка (обрезанный поиск молча недоступен): у центра пол `max(12em, min-content начинки)`, и если он не влезает даже при полностью свёрнутых действиях, центр встаёт ВТОРЫМ РЯДОМ. Порядок уступок: центр до пола → свёртка → второй ряд → перенос бренда. Утверждения — про ПЕРЕСЕЧЕНИЕ прямоугольников, а не про классы: `is-stacked` может стоять и при центре поверх бренда. Порядок проверяется накоплением — второй ряд только при всём свёрнутом, многострочный бренд только при всём свёрнутом и уже поднятом центре, — и оба режима центра обязаны встретиться, иначе случай про один из них. Живой React из фикстуры: раскладку решает замер после монтирования. РАЗВЁРТКА ПЕРЕЕХАЛА (JIG-29, было 300…700 — переезд пола 360 → 440, DS-380): порог у AppBar считает JS-замер, не CSS-константа, поэтому нижняя точка просто поднята на 140, а верх — на ту же величину, чтобы ширина диапазона (400px, 21 точка через 20) не поменялась',
    bundle: 'scripts/measure-appbar.tsx',
    html: ['search', 'crowded', 'long', 'trailing'].flatMap((id) =>
      Array.from({ length: 21 }, (_, i) => 440 + i * 20).flatMap((w) => ['1', '1.5'].map((sc) =>
        `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-appbar="${id}" data-w="${w}" data-sc="${sc}"></div>`))).join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-appbar]')]
      for (const el of hosts) WB.mountAppBar(el, el.dataset.appbar)
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      // Замер → `setState` → второй ряд или свёртка → новый замер. Ждём, пока
      // раскладка не перестанет меняться, а не фиксированное число кадров.
      let prev = null, settled = false
      for (let i = 0; i < 60; i++) {
        await frame()
        const now = hosts.map((el) => { const h = el.querySelector('.ds-appbar'); return h ? `${h.className}:${h.offsetHeight}` : '-' }).join(',')
        if (now === prev) { settled = true; break }
        prev = now
      }
      // Раскладка, не успокоившаяся за 60 кадров, — это качели между рядами, и
      // снимок с неё случаен. Кладётся в каждую строку: `expect` видит строки.
      for (const el of hosts) el.dataset.settled = String(settled)
      const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height } }
      const cross = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
      return hosts.map((el) => {
        const h = el.querySelector('.ds-appbar')
        if (!h) return { id: el.dataset.appbar, w: +el.dataset.w, sc: +el.dataset.sc, mounted: false }
        const brand = h.querySelector('.ds-appbar__brand')
        const center = h.querySelector('.ds-appbar__center')
        const inner = [...h.querySelectorAll('.ds-appbar__centerbox > *')]
        const neighbours = [
          ['бренд', brand],
          ['хвост', h.querySelector('[data-ds-trailing]')],
          ['«Ещё»', h.querySelector('.ds-appbar__more:not(.is-idle)')],
          ...[...h.querySelectorAll('[data-ds-action]:not([data-ds-folded])')].map((b) => [`«${b.textContent}»`, b]),
        ].filter(([, n]) => n)
        const hits = []
        for (const [who, c] of [['центр', center], ...inner.map((n) => ['начинка центра', n])]) {
          for (const [name, n] of neighbours) {
            const a = cross(box(c), box(n))
            if (a > 0.5) hits.push(`${who} ∩ ${name} ${a.toFixed(1)}px²`)
          }
        }
        const lh = parseFloat(getComputedStyle(brand).lineHeight)
        return {
          id: el.dataset.appbar, w: +el.dataset.w, sc: +el.dataset.sc, mounted: true,
          settled: el.dataset.settled === 'true',
          host: el.clientWidth,
          hasCenter: inner.length > 0,
          stacked: h.classList.contains('is-stacked'),
          actions: h.querySelectorAll('[data-ds-action]').length,
          shown: h.querySelectorAll('[data-ds-action]:not([data-ds-folded])').length,
          brandLines: Number.isFinite(lh) && lh > 0 ? Math.round(box(brand).h / lh) : null,
          over: +(h.scrollWidth - h.clientWidth).toFixed(1),
          hits,
        }
      })
    },
    expect: (m) => {
      // Литералом: 4 случая × 21 ширина × 2 шкалы. Счёт, снятый с того же
      // списка, что строил разметку, согласен сам с собой и тогда, когда
      // область схлопнулась до одной ширины (ловушка 7).
      if (m.length !== 168) return `хостов ${m.length} вместо 168 — четыре случая на 21 ширину на две шкалы`
      if (m.some((r) => r.mounted && !r.settled)) return 'раскладка не успокоилась за 60 кадров — шапка качается между рядами, снимок случаен'
      const bad = []
      let stacked = 0, inline = 0, wrapped = 0
      for (const r of m) {
        const at = `${r.id} ${r.w}px×${r.sc}`
        if (!r.mounted) { bad.push(`${at}: шапка не смонтировалась`); continue }
        if (r.host !== r.w) { bad.push(`${at}: хост ${r.host} — ширина не доехала`); continue }
        // Предмет.
        if (r.hits.length) bad.push(`${at}: ${r.hits.join(', ')}`)
        if (r.over > 0.5) bad.push(`${at}: шапка шире себя на ${r.over}px`)
        // Порядок уступок.
        const allFolded = r.actions > 0 && r.shown === 0
        if (r.stacked && !allFolded && r.actions > 0) bad.push(`${at}: центр вторым рядом при ${r.shown} из ${r.actions} видимых действий`)
        if (r.brandLines > 1) {
          wrapped++
          if (r.actions > 0 && !allFolded) bad.push(`${at}: бренд в ${r.brandLines} строки при ${r.shown} видимых действиях`)
          if (r.hasCenter && !r.stacked) bad.push(`${at}: бренд переносится, а центр ещё в первом ряду`)
        }
        if (r.hasCenter) { if (r.stacked) stacked++; else inline++ }
      }
      // Пол 12em — ТОЛЬКО центру с полем ввода. ПЕРЕСНЯТО на новой нижней
      // точке 440 (JIG-29, переезд пола 360 → 440, DS-380; было 300).
      // Живой прогон `npm run measure` на 440 нашёл РАЗНУЮ шкалу для двух
      // сторон пары: короткий чип `crowded` на 440 своим min-content
      // помещается в строку на ОБЕИХ шкалах (stacked=false и на ×1, и на
      // ×1.5 — на 300 хватало и одной ×1, лишний запас 440 не рушит
      // утверждение, просто делает его верным сильнее). Поле поиска
      // `search`, наоборот, на ×1 в строке НЕ упирается в свой пол 12em
      // (stacked=false — на 300 упиралось, на 440 уже нет вовсе, ни при
      // одной ширине развёртки: пол 440 просто шире floor-ширины поиска на
      // этой шкале) и упирается только на ×1.5 (stacked=true), то есть
      // случай сохранил обе половины пары, но сторона поиска переехала со
      // шкалы ×1 на ×1.5.
      const chip = m.find((r) => r.id === 'crowded' && r.w === 440 && r.sc === 1)
      if (chip && chip.stacked) bad.push('crowded 440px×1: короткий чип ушёл во второй ряд — пол 12em достался центру без поля ввода')
      const field = m.find((r) => r.id === 'search' && r.w === 440 && r.sc === 1.5)
      if (field && !field.stacked) bad.push('search 440px×1.5: поиск остался в строке — у поля ввода нет объявленного пола')
      if (!bad.length && stacked === 0) bad.push('ни на одной ширине центр не встал вторым рядом — случай не про узкий экран')
      if (!bad.length && inline === 0) bad.push('ни на одной ширине центр не остался в строке — пол проверен только в вырожденном режиме')
      if (!bad.length && wrapped === 0) bad.push('бренд не перенёсся ни разу — последняя уступка не проверена')
      return bad.length === 0 || bad.join('; ')
    },
  },
  {
    name: 'Tabs на узком кадре: у ленты есть пол, и первая вкладка достижима целиком',
    why: 'DS-236. `trailing` резервирует ширину первым (DS-205), у остатка не было ПОЛА, и на телефоне лента вырождалась: замер владельца на кадре 360 (шкала 1.5, случай `?c=Tabs&case=trailing`) дал ленту 52.1 px при первой вкладке 126 — видно 40 из 126, то есть «Вс» вместо «Все 128». Полоса вкладок перестаёт читаться как полоса вкладок и выглядит дефектом отрисовки. Утверждение — про ОТНОШЕНИЕ видимой доли первой вкладки к её собственной ширине, а не про «лента шире N»: число «лента 92» одинаково верно и там, где вкладка стала уже, и там, где её срезало. Лента домматывается в начало перед замером — «достижима» это про существование положения прокрутки, а не про то, где лента стоит сейчас. Живой React, а не SSR: стрелки и `is-scrollable` компонент ставит после монтирования, а стрелки — `flex: 0 0 auto` соседи ленты, то есть ровно те, кто отнимает у неё ширину',
    bundle: 'scripts/measure-tabs.tsx',
    // БЫЛО [360, 380, 400, 440, 520] (плюс прежняя точка hostOf(360)=300,
    // снятая ещё первым кругом JIG-29). Второй круг снял и 360/380/400:
    // грандфазер «дефект однажды увидели глазами» из CLAUDE.md отменён
    // владельцем, находки ниже пола 440 точками не остаются ни по какому
    // доводу. Остаются 440 и 520 — оба держат предмет случая («первая вкладка
    // видна целиком», ratio ≥ 0.999) и оба дают ПЕРЕПОЛНЕННУЮ ленту хотя бы на
    // одной шкале (санитар `tight`), замерено `npm run measure`.
    html: [440, 520].flatMap((w) => ['1', '1.5'].map((sc) =>
      `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-tabs data-w="${w}" data-sc="${sc}"></div>`)).join(''),
    measure: async () => {
      const hosts = [...document.querySelectorAll('[data-tabs]')]
      for (const el of hosts) WB.mountTabs(el, { trailing: true })
      await document.fonts.ready
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      // `ResizeObserver` → `setState` → появляются стрелки → бокс ленты снова
      // меняется → второй заход. Ждём, пока ширина ленты не перестанет
      // меняться, а не фиксированное число кадров.
      let prev = null
      for (let i = 0; i < 60; i++) {
        await frame()
        const now = hosts.map((el) => el.querySelector('.ds-tabs__list')?.clientWidth ?? -1).join(',')
        if (now === prev) break
        prev = now
      }
      // Домотать в начало: у первой вкладки это её лучшее положение, и
      // утверждение «видна целиком» надо проверять именно на нём.
      for (const el of hosts) { const l = el.querySelector('.ds-tabs__list'); if (l) l.scrollLeft = 0 }
      await frame(); await frame()
      const box = (el) => {
        const b = el.getBoundingClientRect()
        return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1) }
      }
      return hosts.map((el) => {
        const bar = el.querySelector('.ds-tabs')
        const list = el.querySelector('.ds-tabs__list')
        const slot = el.querySelector('.ds-tabs__trailing')
        const tab = el.querySelector('[role="tab"]')
        const t = tab ? box(tab) : null
        const L = list ? box(list) : null
        const vis = t && L ? Math.max(0, Math.min(t.r, L.r) - Math.max(t.l, L.l)) : 0
        return {
          w: +el.dataset.w, sc: +el.dataset.sc, host: el.clientWidth,
          bar: bar ? box(bar) : null,
          list: list ? { ...L, scroll: list.scrollWidth, client: list.clientWidth } : null,
          slot: slot ? box(slot) : null,
          // Начинка слота отдельно от его КОРОБКИ: коробку выдаёт бар, а
          // ужмётся ли содержимое — дело потребителя (DS-205). Без этой
          // пары «вылезло» нельзя приписать виновнику, и утверждение
          // выродилось бы в «ничего не вылезает», которое на узком кадре с
          // толстым довеском неверно ни при какой раскладке.
          slotInner: slot && slot.firstElementChild ? box(slot.firstElementChild) : null,
          tab: t,
          ratio: t && t.w > 0 ? +(vis / t.w).toFixed(3) : null,
          scrollable: !!list && list.classList.contains('is-scrollable'),
          controls: el.querySelectorAll('.ds-tabs__scroller, .ds-tabs__overflow-btn').length,
          tabs: el.querySelectorAll('[role="tab"]').length,
          over: +(el.scrollWidth - el.clientWidth).toFixed(1),
        }
      })
    },
    expect: (m) => {
      // Литералом, а не длиной списка, который строил разметку: счёт, снятый
      // с того же массива, согласен сам с собой и остаётся зелёным, когда
      // область схлопнулась до одного случая (ловушка 7, docs/writing-checks.md).
      if (m.length !== 4) return `хостов ${m.length} вместо 4 — две ширины на две шкалы`
      const bad = []
      let tight = 0, roomy = 0
      for (const r of m) {
        const at = `${r.w}px×${r.sc}`
        if (r.host !== r.w) { bad.push(`${at}: хост ${r.host} — ширина до кадра не доехала`); continue }
        if (r.tabs !== 4) { bad.push(`${at}: вкладок ${r.tabs} вместо 4 — набор разошёлся с фикстурой`); continue }
        if (!r.bar || !r.list || !r.slot || !r.tab) { bad.push(`${at}: бар не смонтировался`); continue }
        if (Math.abs(r.bar.w - r.w) > 0.5) bad.push(`${at}: бар ${r.bar.w} при кадре ${r.w}`)
        // Предмет.
        if (r.ratio < 0.999) {
          bad.push(`${at}: первая вкладка видна на ${Math.round(r.ratio * 100)}% — ${(r.ratio * r.tab.w).toFixed(1)} из ${r.tab.w} при ленте ${r.list.client} (стрелок ${r.controls}, слот ${r.slot.w})`)
        }
        // Обратная половина: пол не должен чиниться выталкиванием слота за
        // экран — это ровно тот дефект, который закрыла DS-205.
        if (r.slot.r > r.bar.r + 0.5) bad.push(`${at}: КОРОБКА слота за правым краем бара — ${r.slot.r} при ${r.bar.r}`)
        if (r.slot.l < r.list.r - 0.5) bad.push(`${at}: слот заезжает под ленту — ${r.slot.l} левее ${r.list.r}`)
        // Вылезти за кадр позволено РОВНО начинке слота и ровно настолько,
        // насколько она сама шире выданной ей коробки: это правило
        // DS-205 («за это отвечает содержимое слота, а не полоса»),
        // просто теперь коробку сужает ещё и пол ленты. Утверждение «за кадр
        // не вылезает ничего» здесь было бы неверным при ЛЮБОЙ раскладке —
        // довесок шириной 186.2 в кадр 360 вместе с полом и стрелкой не
        // помещается арифметически, — и, записанное, оно требовало бы чинить
        // то, чего компонент не решает.
        // С DS-284 правило ЖЁСТЧЕ: за кадр не выходит ничего. Начинка
        // по-прежнему шире выданной ей коробки (`spill` называет это число), но
        // лишнее режет граница бара (`overflow-x: clip`), а не край вьюпорта.
        // Прежняя редакция пускала на кадр ровно `spill` — и была верна ровно
        // до того дня, когда выяснилось, что документ от этого РЕАЛЬНО ездит.
        const spill = r.slotInner ? Math.max(0, +(r.slotInner.r - r.bar.r).toFixed(1)) : 0
        if (r.over > 0.5) {
          bad.push(`${at}: за кадр вылезло ${r.over}px при начинке, торчащей из своей коробки на ${spill} — бар опять отдаёт лишнее странице`)
        }
        // Оба режима обязаны встретиться, иначе случай проверяет один из них.
        if (r.list.scroll > r.list.client + 1) tight++ ; else roomy++
      }
      if (!bad.length && tight === 0) bad.push('ни на одной ширине лента не переполнена — случай не про узкий экран вовсе')
      if (!bad.length && roomy === 0) bad.push('ни на одной ширине вкладки не влезли целиком — пол проверен только в вырожденном режиме')
      return bad.length === 0 || bad.join('; ')
    },
  },
  ...TABS_ARROW_FRAMES.map((w) => ({
    name: `Tabs на кадре ${w}: пролистывание ленты не двигает слот и не отдаёт документу боковую прокрутку`,
    why: 'DS-284, найдено приёмкой DS-236 глазами — настоящим кликом по стрелке. Пол ленты из 236 держит, а дефект начинался ПОСЛЕ первого пролистывания: стрелка «к началу» рисовалась только когда лента сдвинута, то есть раскладка бара зависела от положения прокрутки. На 360×1.5 появление второй стрелки забирало у слота её 54px (слот 102 → 48), «Добавить» уходил за правый край, и документ получал боковую прокрутку до 57px — `documentElement.scrollLeft` реально доезжал. Заодно кнопки слота дёргались вправо на 54px (`trailing.left` 228 → 282) при каждом первом пролистывании. Решение: при переполненной ленте стрелки рендерятся ОБЕ всегда, крайняя приглушена (`disabled`), — тогда раскладка от прокрутки не зависит вовсе; и `.ds-tabs { overflow-x: clip }` — лишнее содержимое слота режет граница БАРА, а не край вьюпорта. Кнопка «Добавить» на 360×1.5 при этом остаётся срезанной: это цена содержимого слота (DS-205), но документ не ездит. Прежние случаи 205/236 этого не ловили: они снимают ленту ТОЛЬКО В НАЧАЛЕ, а 236 к тому же меряет хост, а не документ',
    viewport: w,
    bundle: 'scripts/measure-tabs.tsx',
    html: ['1', '1.5'].map((sc) =>
      `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${w}px" data-tabs data-sc="${sc}"></div>`).join(''),
    measure: tabsArrowsMeasure,
    expect: tabsArrowsExpect,
  })),
  ...TABS_SIDE_FRAMES.map((frame) => ({
    name: `Tabs position=left на кадре ${frame}: лента не столбец, телу хватает колонки`,
    why: 'DS-285, найдено приёмкой DS-236 глазами на прежнем кадре 360 (контейнер 300, шкала 1.5): вертикальная лента забирала 194.7, телу оставалось 105.3 при слове «Содержимое» шириной 144 — слово срезано, документ переполнен на 9px. Боковой бар на телефоне отдавал вкладкам больше половины ширины — не форма для телефона вовсе, поэтому ниже порога `position="left"`/`right` приходил к `top`. JIG-29 (второй круг, решение владельца): порог компонента лежит ниже пола 440, и «пришёл к верхней» сценарий на ≥440 не воспроизводится — 360 СНЯТ. Что остаётся: на floor 440 и на просторе 900 лента ОБЯЗАНА оставаться столбцом (`position=left` не превращается в `top` там, где системе есть что показать), а телу — доставаться не меньше `--ds-w-col-min`. Пин на 440 — граница защиты: регресс старого дефекта («столбец» превращается в «строку») красит именно её первой',
    viewport: frame,
    bundle: 'scripts/measure-tabs.tsx',
    html: ['1', '1.5'].map((sc) =>
      `<div class="ds-scale" style="--ds-ui-scale:${sc};width:${hostOf(frame)}px" data-tabs-side data-sc="${sc}"></div>`).join(''),
    measure: tabsSideMeasure,
    expect: (m) => {
      const verdict = tabsSideExpect(m)
      const bad = verdict === true ? [] : [verdict]
      // Кадр и хост обязаны доехать до страницы: без этих строк случай,
      // потерявший `viewport`, прошёл бы на общих 900px, ничего не проверив.
      if (m.doc.client !== frame) bad.push(`кадр ${m.doc.client}px вместо ${frame} — поле viewport до страницы не доехало`)
      for (const h of m.hosts) {
        if (h.host !== hostOf(frame)) bad.push(`×${h.sc}: контейнер ${h.host} вместо ${hostOf(frame)} — ширина до хоста не доехала`)
      }
      // ПИН НА ОБОИХ КОНЦАХ (JIG-29, второй круг): 360 снят, «пришёл к
      // верхней» демонстрировать больше нечему — раскладка на ОБОИХ
      // оставшихся кадрах обязана оставаться СТОЛБЦОМ. Без пина утверждения
      // выше держались бы и у бара, который сложился ВСЕГДА (боковой бар
      // исчез бы из системы как форма).
      for (const h of m.hosts) {
        if (h.rows !== h.tabs) bad.push(`×${h.sc}: на кадре ${frame} лента уже не столбец (${h.rows} ряд(а)) — порог съел то, ради чего есть position`)
      }
      return bad.length === 0 || bad.join('; ')
    },
  })),
  {
    name: 'Pagination: ряд номеров не переносится ни на одной ширине, а полоса складывается раньше',
    why: 'между обычным видом и сложенным лежала ЗОНА ПЕРЕНОСА, и в ней полоса читалась хуже, чем на телефоне: на кадре 560 ряд шёл «Назад 1 2 3 4» и «… 18 Вперёд», на 640 — «Назад 1 2 3 4 … 18» и отдельной строкой одна «Вперёд», оторванная от своей пары. Виноват не перенос как таковой, а то, что порог складывания мерил ширину ПОЛОСЫ, а ряд живёт в КОЛОНКЕ: у сетки `1fr auto 1fr` колонке ряда достаётся (ширина − диапазон − зазоры)/2, то есть вдвое меньше полосы. Русский ряд `page-size` требует 21.73em, а самый широкий русский подвал (200 страниц) — 24.19em, и колонка такой ширины появляется только с 58.01em содержимого (было 22.75em / 25.14em / 59.69em при базе `--ds-fs-base` 13; DS-375 подняла её до 14 и порог складывания — с 60em на 59em, DS-282 остаётся источником самой формулы)',
    width: 1300,
    /**
     * ДВЕ ГРУППЫ, и у них разный предмет.
     *
     * `sw-` — обход того, на чём дефект виден глазами: случай `page-size`
     * верстака (страница 3 из 18, окно `pageWindow(3,18)` = `1 2 3 4 … 18`),
     * кадры 440…880 через 40, три шкалы, оба набора текста. Ширина ПОЛОСЫ —
     * кадр минус 60: по 30px карточки с каждой стороны, как в группе
     * DS-142. Эта группа отвечает на «а не рвётся ли где-нибудь ряд» и
     * держит пол: ниже 34em содержимого полоса обязана быть сложена, между 29em
     * и 34em — сложена И с номерами, ниже 29em — компактна (было 31em при базе
     * `--ds-fs-base` 13, DS-375 подняла её до 14 и второй порог — с 31em
     * на 29em; 34em остаётся тем же безопасным «полом», он ниже нового порога
     * складывания 59em с тем же запасом, что и раньше).
     *
     * `ed-` — пара «сразу под порогом / сразу над ним» на ВСЕХ ПЯТИ шкалах, с
     * окном `pageWindow(97,200)` и русским текстом. Здесь проверяется САМО
     * ЧИСЛО 59em (было 60em): ряд, ради которого оно посчитано, — самый широкий
     * русский, а не тот, что в `sw-`. Ширины сняты из порога: полоса
     * `844.8 × шкала` даёт ровно 59.2em содержимого, `839.2 × шкала` — 58.8em
     * (было `798.6 × шкала` → 60.2em, `793.4 × шкала` → 59.8em при базе 13), то
     * есть пара лежит по разные стороны порога на любой шкале. Без неё
     * «складывать всегда» прошло бы весь обход выше, а мутация «порог 55em» —
     * половину.
     */
    html: (() => {
      const RU = {
        prev: 'Назад', next: 'Вперёд', size: 'На странице',
        // «Стр.» — умолчание `pagination.position` с DS-283, см. выше.
        range18: '41&ndash;60 из 347', range200: '1921&ndash;1940 из 4000', pos: 'Стр. 3 из 18',
      }
      const PSEUDO = {
        prev: '&#10214;pagination.prev&#10215;',
        next: '&#10214;pagination.next&#10215;',
        size: '&#10214;pagination.pageSizeLabel&#10215;',
        range18: '&#10214;pagination.range:41,60,347&#10215;',
        range200: '&#10214;pagination.range:1921,1940,4000&#10215;',
        pos: '&#10214;pagination.position:3,18&#10215;',
      }
      const step = (t, glyph) => `<button class="ds-pager__btn">`
        + `<span class="ds-pager__word">${t}</span>`
        + `<span class="ds-pager__arrow" aria-hidden="true">${glyph}</span></button>`
      const num = (n, active) => `<button class="ds-pager__btn ds-pager__btn--page${active ? ' is-active' : ''}">${n}</button>`
      const jump = (n) => `<span class="ds-pager__jump"><span class="ds-pager__gap">&hellip;</span>${num(n)}</span>`
      // Окна — настоящий вывод `renderWindow(pageWindow(...))`, а не сокращение:
      // именно на этом обжёгся замер DS-149, где ряд из пяти элементов
      // занижал требование на две кнопки.
      const WIN18 = `${num(1)}${num(2)}${num(3, true)}${num(4)}${jump(18)}`
      const WIN200 = `${num(1)}${jump(96)}${num(97, true)}${num(98)}${jump(200)}`
      const bar = (id, sc, t, range, win, w) => `
      <div class="ds-scale" style="--ds-ui-scale: ${sc}; width: ${w}px">
        <nav class="ds-pager ds-pager--bar ds-pager--pages" id="${id}">
          <div class="ds-pager__size">
            <span class="ds-pager__sizelabel">${t.size}</span>
            <select class="ds-pager__select"><option>20</option></select>
          </div>
          <span class="ds-pager__range">${range}</span>
          <div class="ds-pager__nav">
            ${step(t.prev, '&lsaquo;')}${win}
            <span class="ds-pager__pos">${t.pos}</span>
            ${step(t.next, '&rsaquo;')}
          </div>
        </nav>
      </div>`
      const out = []
      for (const sc of PAGER_SWEEP_SCALES) {
        for (const [set, t] of [['ru', RU], ['pseudo', PSEUDO]]) {
          for (const frame of PAGER_SWEEP_FRAMES) {
            out.push(bar(`sw-${scaleKey(sc)}-${set}-${frame}`, sc, t, t.range18, WIN18, frame - PAGER_CARD))
          }
        }
      }
      for (const [sc, lo, hi] of PAGER_EDGE) {
        out.push(bar(`ed-${scaleKey(sc)}-lo`, sc, RU, RU.range200, WIN200, lo))
        out.push(bar(`ed-${scaleKey(sc)}-hi`, sc, RU, RU.range200, WIN200, hi))
      }
      return out.join('')
    })(),
    measure: () => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0 }
      // Ряды — по ЦЕНТРУ коробок, а не по верхней кромке: соседи по ряду разной
      // высоты (многоточие против кнопки) и по верху разъезжаются на 5–8px.
      const rowKey = (el) => {
        const r = el.getBoundingClientRect()
        return Math.round((r.top + r.height / 2) / 4)
      }
      const read = (bar) => {
        const cs = getComputedStyle(bar)
        const fs = parseFloat(cs.fontSize)
        const br = bar.getBoundingClientRect()
        const padR = parseFloat(cs.paddingRight)
        const nav = bar.querySelector('.ds-pager__nav')
        const kids = [...nav.children].filter(vis)
        const right = Math.max(...[...bar.querySelectorAll('*')].filter(vis)
          .map((el) => el.getBoundingClientRect().right))
        const range = bar.querySelector('.ds-pager__range').getBoundingClientRect()
        const pos = bar.querySelector('.ds-pager__pos')
        const steps = [...nav.querySelectorAll('.ds-pager__btn:not(.ds-pager__btn--page)')]
        return {
          em: +((br.width - parseFloat(cs.paddingLeft) - padR) / fs).toFixed(2),
          over: +(right + padR - br.left - br.width).toFixed(2),
          navRows: new Set(kids.map(rowKey)).size,
          stacked: getComputedStyle(nav).gridColumnEnd === '-1',
          nums: [...nav.querySelectorAll('.ds-pager__btn--page, .ds-pager__jump')].filter(vis).length,
          posShown: vis(pos),
          // Высота кнопки шага против высоты СЕЛЕКТОРА — соседа, чья высота
          // известна заранее и не зависит от текста (тот же `--ds-h-compact`).
          // Ряд, которому не хватило колонки, не выезжает и не переносится:
          // он ломает слово внутри кнопки, и кнопка становится выше. Мерить
          // это выездом нельзя — выезда нет.
          stepH: +Math.max(...steps.map((b) => b.getBoundingClientRect().height)).toFixed(2),
          refH: +bar.querySelector('.ds-pager__select').getBoundingClientRect().height.toFixed(2),
          // Вылезла ли вторая строка слова ИЗ кнопки. Отдельно от `stepH`:
          // высота кнопки растёт только при `min-height`, а при жёсткой
          // `height` она та же, и сломанное слово просто выходит наружу — то
          // есть по одной высоте два состояния неразличимы.
          spill: +Math.max(...steps.map((b) => b.scrollHeight - b.clientHeight)).toFixed(2),
          off: +Math.abs((range.left + range.right) / 2 - (br.left + br.width / 2)).toFixed(2),
        }
      }
      const out = {}
      for (const el of document.querySelectorAll('.ds-pager--bar')) out[el.id] = read(el)
      return out
    },
    expect: (m) => {
      const keys = (p) => Object.keys(m).filter((k) => k.startsWith(p))
      const all = Object.keys(m)
      // Площадь названа ЛИТЕРАЛОМ, а не длиной списка, из которого собрана
      // разметка (docs/writing-checks.md, п.7).
      const sweep = keys('sw-')
      if (sweep.length !== 72) return `обход дал ${sweep.length} полос вместо 72 (3 шкалы × 2 набора текста × 12 кадров)`
      const edge = keys('ed-')
      if (edge.length !== 10) return `пару вокруг порога обошли на ${edge.length} полосах вместо 10 (5 шкал × 2 стороны)`

      // 1. РЯД НЕ ПЕРЕНОСИТСЯ. Ни на одной ширине, ни в одном наборе текста.
      const torn = all.filter((k) => m[k].navRows !== 1)
      if (torn.length) {
        return `ряд номеров разорван переносом: ${torn.map((k) => `${k} в ${m[k].navRows} ряда при ${m[k].em}em`).join(', ')}`
      }
      // 2. И НЕ ВЫЕЗЖАЕТ. Без этой строки «снять перенос» прошло бы первую.
      const over = all.filter((k) => m[k].over > 0.5)
      if (over.length) {
        return `полоса не вместила свой ряд: ${over.map((k) => `${k} на +${m[k].over}px при ${m[k].em}em`).join(', ')}`
      }
      // 3. ПОЛ НЕ СДВИНУЛСЯ: ниже 34em содержимого полоса сложена всегда.
      const flat = all.filter((k) => m[k].em < 34 && !m[k].stacked)
      if (flat.length) {
        return `ниже 34em полоса не сложилась: ${flat.map((k) => `${k} при ${m[k].em}em`).join(', ')} — пол складывания уехал`
      }
      // 4. Между 29em и 34em номера ВИДНЫ: компактный вид не съел форму, ради
      // которой написан пол. Обратная сторона к пункту 5. Было 31em/6 при базе
      // 13 (DS-375 подняла её до 14 и второй порог — с 31em на 29em;
      // подъём базы заодно сдвинул, сколько именно из 72 фиксированных
      // пиксельных ширин обхода попадает в эту зону — 5 на шкалу × 2 набора
      // текста = 10, не 6, — это факт распределения sw-фикстур при НОВОМ
      // кегле, а не решение).
      const band = sweep.filter((k) => m[k].em > 29 && m[k].em < 34)
      if (band.length !== 10) return `между порогами оказалось ${band.length} полос вместо 10 — ширины обхода разошлись с порогами`
      const eaten = band.filter((k) => m[k].nums === 0 || m[k].posShown)
      if (eaten.length) {
        return `между 29em и 34em компактный вид сработал раньше времени: ${eaten.map((k) => `${k} при ${m[k].em}em`).join(', ')}`
      }
      // 5. Ниже 29em — компактный вид, и это не «заодно»: без него ряд с
      // номерами не помещается в сложенную полосу никогда (DS-149). Было
      // 31em/22 при базе 13; при базе 14 меньше фикстур попадает под 29em, чем
      // попадало под 31em, — счёт пересчитан прогоном, а не переписан на глаз.
      const narrow = sweep.filter((k) => m[k].em < 29)
      if (narrow.length !== 24) return `ниже 29em оказалось ${narrow.length} полос вместо 24 — ширины обхода разошлись с порогами`
      const loud = narrow.filter((k) => m[k].nums !== 0 || !m[k].posShown)
      if (loud.length) {
        return `ниже 29em полоса не пришла к компактному виду: ${loud.map((k) => `${k} при ${m[k].em}em`).join(', ')}`
      }
      // 6. РУССКИЙ ряд не сжимается НИГДЕ: кнопка шага остаётся в одну строку,
      // то есть той же высоты, что селектор. Порог на то и посчитан из
      // колонки, а не из полосы. Псевдоключ сюда не входит намеренно: он
      // длиннее любого перевода по построению, и одно число в CSS не может
      // обслужить два словаря — тот же размен записан у порога 29em.
      const squeezed = [...sweep.filter((k) => k.includes('-ru-')), ...edge]
        .filter((k) => m[k].stepH > m[k].refH + 0.5)
      if (squeezed.length) {
        return `русскому ряду не хватило колонки, слово в кнопке шага сломалось: ${squeezed.map((k) => `${k} — кнопка ${m[k].stepH}px против селектора ${m[k].refH}px при ${m[k].em}em`).join(', ')}`
      }
      // 6b. И сломанное слово остаётся ВНУТРИ кнопки. Это про словарь длиннее
      // русского: у него слово ломается, и при жёстко заданной высоте кнопки
      // вторая строка вышла бы наружу — на высоту кнопки это не влияет вовсе,
      // так что утверждение выше его не видит.
      const spilled = all.filter((k) => m[k].spill > 0.5)
      if (spilled.length) {
        return `слово вышло за кнопку шага: ${spilled.map((k) => `${k} на ${m[k].spill}px при ${m[k].em}em`).join(', ')}`
      }
      // 7. САМО ЧИСЛО. Пара вокруг порога: 58.8em складывается, 59.2em — нет
      // (было 59.8em/60.3em при базе 13).
      const early = edge.filter((k) => k.endsWith('-lo') && !m[k].stacked)
      if (early.length) {
        return `под порогом полоса не сложилась: ${early.map((k) => `${k} при ${m[k].em}em`).join(', ')} — порог опустили ниже требования ряда`
      }
      const late = edge.filter((k) => k.endsWith('-hi') && m[k].stacked)
      if (late.length) {
        return `над порогом полоса всё равно сложилась: ${late.map((k) => `${k} при ${m[k].em}em`).join(', ')} — ряд отдали там, где он помещается`
      }
      // 8. И там, где полоса не сложена, диапазон стоит ПО ЦЕНТРУ: ровно это
      // обещают три колонки, и ровно это ломается, когда колонка ряда растёт
      // за свою долю.
      const skew = all.filter((k) => !m[k].stacked && m[k].off > 1)
      if (skew.length) {
        return `диапазон уехал из центра несложенной полосы: ${skew.map((k) => `${k} на ${m[k].off}px при ${m[k].em}em`).join(', ')}`
      }
      return true
    },
  },
  {
    name: 'Form: трек подписи строки формы не уже своей подписи, когда поле в строке не хочет сжиматься',
    why: 'DS-372, приёмка глазами DS-356: `.ds-combobox` несёт свой `min-width` (12.5rem × шкала; довода под этим числом в его листе не записано вовсе) и в строке формы не сжимается — вторая колонка грида была голым `1fr`, то есть `minmax(auto, 1fr)`, и её пол по min-content содержимого забирал себе ширину, которую первая колонка не собиралась отдавать. Замерено ДО правки: кадр 480, шкала 1.5 — колонки грида `52.28px 300px` вместо `210px 142.28px`, подпись «Организация» clientWidth 52 при собственном содержимом (scrollWidth) 124. Глаз владельца добавил то, чего нет в числах: подпись не обрезается многоточием, а уходит ПОД поле — признака продолжения нет вовсе. Развёртка по ШИРИНАМ, а не одна ширина, но диапазон не про порог складывания: утверждение проверяется ТОЛЬКО на ячейках, где раскладка легла СБОКУ (`label.right <= control.left`), а НЕ требует ни одной ячейки «сверху» — на переложенных наверх подпись занимает всю ширину строки и тривиально не уже себя, считать их значило бы утверждать про случай, где дефекту неоткуда взяться. Правка держится на ДВУХ половинах (`Form.css`, докблок «ШИРИНОЙ В СТРОКЕ…»): `minmax(0, …)` на обоих треках грида и структурное `.ds-formrow .ds-formrow__control > *`. Каждая нужна порознь — без структурного правила трек подписи цел, но контрол переполняет СВОЙ трек вправо (полю никто не запрещает быть шире выделенной ему колонки), и это дефект другой формы, который первое утверждение (clientWidth/scrollWidth подписи) не видит вовсе: подпись остаётся нетронутой, переполняется сосед. Поэтому здесь второе утверждение — ширина контрола против ширины его трека. Хост — `class="ds-root ds-scale"`, а не голый `.ds-scale`: `.ds-scale` переобъявляет ТОКЕНЫ шкалы, но `font-size` не ставит — его ставят `body` и `.ds-root` (`tokens/tokens.css`). Без `ds-root` `.ds-formrow` наследует кегль 14px (фолбэк документа) независимо от `--ds-ui-scale`, и порог `@container` у него равен одному числу на ВСЕХ четырёх шкалах разом — именно поэтому мутация «убрать структурное правило» на первом прогоне этого случая (тогда развёртка ещё была 240…560, до переезда пола, и порог ещё был 18.6em) нашла только 12 «сбоку»-ячеек из 164 (ширины 240/248/256 × 4 шкалы: единственный нескалированный порог, случайно задетый шагом 8px), хотя при скалированном пороге их должно быть 30. РАЗВЁРТКА ПЕРЕЕХАЛА (JIG-29, было 240…560), А ПОРОГ ПОДНЯТ 18.6em → 24em (JIG-37): при 18.6em все четыре порога `@container` (227.9/260.4/299.5/390.6px на шкалах 0.875/1/1.15/1.5) лежали НИЖЕ пола 440, то есть каждая ячейка развёртки 440…560 ложилась «сбоку» на всех шкалах разом. При 24em это верно ТОЛЬКО для трёх шкал (294/336/386.4px на 0.875/1/1.15 — по-прежнему ниже пола); на шкале 1.5 порог (504px) стоит ВЫШЕ пола и попадает внутрь развёртки — поднятой до 440…680 ради этого самого перехода (см. новый случай JIG-37 ниже) — так что на 1.5 нижняя часть развёртки (440…504) укладывается «сверху», а «сбоку» остаётся верхняя (512…680). Обе проверки ЭТОГО случая (трек подписи и трек контрола) от этого не страдают: они идут по ЛЮБОЙ «сбоку»-ячейке на своей шкале, а условие «на каждой шкале есть хотя бы одна такая» по-прежнему держит минимум. Ячейка, которой измерялся сам дефект DS-372 (кадр 480, шкала 1.5), при 24em уже не «сбоку» (480 ≤ 504) — это не потеря покрытия предмета DS-372 (трек подписи/трек контрола проверяется по ячейкам 512…680 тем же способом), а прямое следствие починки JIG-37: то, что раньше было тесным «сбоку», теперь корректно легло «сверху».',
    html: (() => {
      const SCALES = ['0.875', '1', '1.15', '1.5']
      const WIDTHS = []
      // ВЕРХНЯЯ ГРАНИЦА ПОДНЯТА 560 → 680 (JIG-37): порог `@container` на
      // шкале 1.5 переехал с 390.6px (18.6em, ниже пола) на 504px (24em, ВЫШЕ
      // пола) и попал внутрь развёртки — 680 держит margin выше него (176px,
      // 22 ячейки «сбоку» на 1.5), сравнимый с прежним margin выше порога
      // 390.6 (169px до границы 560).
      for (let w = 440; w <= 680; w += 8) WIDTHS.push(w)
      // Разметка — настоящий вывод компонентов по классам (Form.tsx: `.ds-formrow`
      // → `.ds-formrow__label` + `.ds-formrow__control`; Combobox.tsx:135-155 —
      // корень `.ds-combobox`, триггер `.ds-combobox__trigger`, значение
      // `.ds-combobox__value`), не бандл: случай про раскладку строки и трека, а
      // не про поведение поповера, и статическая разметка её не прячет.
      const cell = (w, sc) => `
      <div class="ds-root ds-scale" style="--ds-ui-scale: ${sc}; width: ${w}px" data-frcase data-w="${w}" data-sc="${sc}">
        <div class="ds-formrow">
          <label class="ds-formrow__label">Организация</label>
          <div class="ds-formrow__control">
            <div class="ds-combobox ds-combobox--md">
              <button type="button" class="ds-combobox__trigger">
                <span class="ds-combobox__value">ООО «Ромашка-Пром»</span>
              </button>
            </div>
          </div>
        </div>
      </div>`
      const out = []
      for (const sc of SCALES) for (const w of WIDTHS) out.push(cell(w, sc))
      return out.join('')
    })(),
    measure: () => {
      const read = (host) => {
        const row = host.querySelector('.ds-formrow')
        const label = host.querySelector('.ds-formrow__label')
        const control = host.querySelector('.ds-formrow__control')
        const child = control.firstElementChild
        const lr = label.getBoundingClientRect()
        const cr = control.getBoundingClientRect()
        const cols = getComputedStyle(row).gridTemplateColumns
        // Второе число колонок грида — трек КОНТРОЛА (первое — трек подписи).
        const trackWidths = cols.split(/\s+/).map(parseFloat)
        return {
          w: host.dataset.w, sc: host.dataset.sc,
          // «Сбоку» — правый край подписи не заезжает за левый край контрола;
          // иначе `@container` уже переложил их друг под друга (см. `why`).
          side: lr.right <= cr.left + 0.5,
          clientWidth: label.clientWidth, scrollWidth: label.scrollWidth,
          cols,
          controlTrack: +trackWidths[1].toFixed(2),
          controlBox: +cr.width.toFixed(2),
          childBox: +(child ? child.getBoundingClientRect().width : NaN).toFixed(2),
        }
      }
      return [...document.querySelectorAll('[data-frcase]')].map(read)
    },
    expect: (m) => {
      const side = m.filter((r) => r.side)
      const top = m.length - side.length
      if (side.length === 0) {
        return `ни одна из ${m.length} ячеек не легла раскладкой «сбоку» (везде подпись переложена наверх) — случай ничего не проверил`
      }
      // Каждая шкала обязана дать хотя бы одну ячейку «сбоку» — иначе выпадение
      // ОДНОЙ шкалы из проверки молчит внутри общего «сбоку 30 из 164».
      const scalesWithoutSide = [...new Set(m.map((r) => r.sc))].filter((sc) => !side.some((r) => r.sc === sc))
      if (scalesWithoutSide.length) {
        return `на шкале ${scalesWithoutSide.join(', ')} ни одна ячейка не легла «сбоку» (везде подпись переложена наверх) — случай не проверил эту шкалу вовсе`
      }
      const bad = side.filter((r) => r.scrollWidth > r.clientWidth + 0.5)
      if (bad.length) {
        return `трек подписи уже своего содержимого на ${bad.length} из ${side.length} ячеек «сбоку»: `
          + bad.slice(0, 6).map((r) => `ширина ${r.w}/шкала ${r.sc} — подпись clientWidth ${r.clientWidth} < scrollWidth ${r.scrollWidth}, колонки «${r.cols}»`).join('; ')
          + (bad.length > 6 ? `; и ещё ${bad.length - 6}` : '')
          + ` (сбоку ${side.length}, сверху ${top} из ${m.length})`
      }
      // Второе утверждение: контрол не шире своего трека. Ловит обратную половину
      // дефекта — снятое структурное правило `> *` оставляет подпись целой, но
      // поле с `min-width` переполняет СВОЙ трек вправо, а первое утверждение
      // (clientWidth/scrollWidth подписи) этого не видит вовсе.
      const overflow = side.filter((r) => r.childBox > r.controlTrack + 0.5)
      if (overflow.length) {
        return `контрол шире своего трека на ${overflow.length} из ${side.length} ячеек «сбоку»: `
          + overflow.slice(0, 6).map((r) => `ширина ${r.w}/шкала ${r.sc} — трек контрола ${r.controlTrack}, коробка control ${r.controlBox}, коробка её первого ребёнка ${r.childBox}, колонки «${r.cols}»`).join('; ')
          + (overflow.length > 6 ? `; и ещё ${overflow.length - 6}` : '')
          + ` (сбоку ${side.length}, сверху ${top} из ${m.length})`
      }
      return true
    },
  },
  {
    name: 'Form: поле в строке не уже колонки подписи, когда раскладка лежит «сбоку» (JIG-37)',
    why: 'JIG-37, решение владельца 24.09.2026: порог складывания `.ds-formrow` (`@container (max-width: …)`) поднят с 18.6em до 24em. Довод у СТАРОГО числа был только про перенос ДАТЫ в поле (241 px = трек 8.75rem + зазор 0.75rem + обвязка поля 1.125rem + `31.12.2026` целиком 3.9375rem + запас на каретку 0.5rem) — про то, ЧЕМ становится колонка подписи РЯДОМ с полем на кромке этого же порога, довод молчал. На кромке 18.6em (390.6 px на шкале 1.5, 336 при кегле «было 13» — но кегль строки поднят DS-375 до 14, отсюда и сама надобность пересчёта) полю оставалось `порог − подпись(210) − зазор(18)` ≈ 163 px против 210 px подписи — поле становилось УЖЕ своей же подписи, и `17.03.2026`/`ООО «Ромашка»` переставали помещаться (Form/overlay, кадр 528, шкала 1.5, поле 175 px — числа владельца, не этого случая). Фикстура здесь — не голая строка (там на полу 440 запас у СТАРОГО порога ещё держался: 440 − 228 = 212 ≥ 210, случай ничего бы не поймал), а `.ds-formrow` внутри `.ds-card__body` (тот же класс, что несёт реальный `padding: var(--ds-space-6)` = 1rem × шкала на сторону) — ИМЕННО так строка формы стоит у потребителя (Card — контейнер `FormRow`, см. секцию Card в этом файле), и именно эта обёртка забирает у строки ровно столько ширины, сколько нужно, чтобы кромка СТАРОГО порога попала внутрь развёртки шириной от пола 440: на кадре 440, шкале 1.5 строке достаётся 440 − 2×24 = 392 px, что уже выше СТАРОГО порога 390.6 (раскладка «сбоку»), и полю на этой ширине остаётся 392 − 228 = 164 px против 210 px подписи — воспроизводит те самые ~163. На НОВОМ пороге (504 px) та же ячейка (392 px) лежит НИЖЕ порога, то есть «сверху» — она перестаёт быть «сбоку» и утверждение по ней не проверяется, что и есть цель починки: там, где раньше поле стояло у́же подписи, теперь подпись просто переехала наверх. Развёртка 440…640: на шкалах 0.875/1/1.15 порог (294/336/386.4 px) остаётся ниже пола (как и раньше), «сбоку» лежит вся развёртка; на 1.5 порог (504 px) внутри развёртки — «сверху» 440…552, «сбоку» 560…640 (после вычета padding), и на верхней ячейке полю ≈184 px запаса выше подписи (592 − 228 = 364 против 210 — щедро). Запас на кромке НОВОГО порога держится на любой шкале один раз, если он положителен на одной, потому что колонка подписи (`calc(8.75rem × var(--ds-ui-scale))`), зазор (`--ds-space-5`) и порог (em контейнера, тот же кегль строки) растут ОДНИМ множителем `--ds-ui-scale`. Мутация: вернуть `@container (max-width: 18.6em)` в `Form.css` — случай красит на кадре 440/шкала 1.5 сообщением «поле уже колонки подписи»; откат обратной правкой (значение назад на 24em).',
    html: (() => {
      const SCALES = ['0.875', '1', '1.15', '1.5']
      const WIDTHS = []
      for (let w = 440; w <= 640; w += 8) WIDTHS.push(w)
      // Разметка — как у случая DS-372 выше (Form.tsx/Combobox.tsx), плюс
      // РЕАЛЬНЫЙ `.ds-card__body`: предмет ЭТОГО случая — ширина, которую
      // строке оставляет обёртка потребителя, а не голый `.ds-formrow`.
      const cell = (w, sc) => `
      <div class="ds-root ds-scale" style="--ds-ui-scale: ${sc}; width: ${w}px" data-jig37 data-w="${w}" data-sc="${sc}">
        <div class="ds-card__body">
          <div class="ds-formrow">
            <label class="ds-formrow__label">Организация</label>
            <div class="ds-formrow__control">
              <div class="ds-combobox ds-combobox--md">
                <button type="button" class="ds-combobox__trigger">
                  <span class="ds-combobox__value">ООО «Ромашка-Пром»</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`
      const out = []
      for (const sc of SCALES) for (const w of WIDTHS) out.push(cell(w, sc))
      return out.join('')
    })(),
    measure: () => {
      const read = (host) => {
        const label = host.querySelector('.ds-formrow__label')
        const control = host.querySelector('.ds-formrow__control')
        const lr = label.getBoundingClientRect()
        const cr = control.getBoundingClientRect()
        return {
          w: host.dataset.w, sc: host.dataset.sc,
          // «Сбоку» — тот же критерий, что у случая DS-372 выше.
          side: lr.right <= cr.left + 0.5,
          labelWidth: +lr.width.toFixed(2),
          controlWidth: +cr.width.toFixed(2),
        }
      }
      return [...document.querySelectorAll('[data-jig37]')].map(read)
    },
    expect: (m) => {
      const side = m.filter((r) => r.side)
      const top = m.length - side.length
      if (side.length === 0) {
        return `ни одна из ${m.length} ячеек не легла раскладкой «сбоку» (везде подпись переложена наверх) — случай ничего не проверил`
      }
      const scalesWithoutSide = [...new Set(m.map((r) => r.sc))].filter((sc) => !side.some((r) => r.sc === sc))
      if (scalesWithoutSide.length) {
        return `на шкале ${scalesWithoutSide.join(', ')} ни одна ячейка не легла «сбоку» (везде подпись переложена наверх) — случай не проверил эту шкалу вовсе`
      }
      const narrow = side.filter((r) => r.controlWidth < r.labelWidth - 0.5)
      if (narrow.length) {
        return `поле уже колонки подписи на ${narrow.length} из ${side.length} ячеек «сбоку»: `
          + narrow.slice(0, 6).map((r) => `ширина ${r.w}/шкала ${r.sc} — поле ${r.controlWidth} px < подпись ${r.labelWidth} px`).join('; ')
          + (narrow.length > 6 ? `; и ещё ${narrow.length - 6}` : '')
          + ` (сбоку ${side.length}, сверху ${top} из ${m.length})`
      }
      return true
    },
  },
  {
    name: 'DatePicker: текст поля не заходит под кнопку очистки',
    why: 'JIG-38, найдено на верстаке 24.09.2026: кадр 528, шкала 1.5, поле'
      + ' 175px, «17.03.202×» — крестик очистки съедал хвост даты. Причина —'
      + ' `.ds-datepicker__input` резервировал `--ds-h-default + --ds-space-5`'
      + ' (только кнопка календаря плюс зазор МЕЖДУ кнопкой и крестиком), а сам'
      + ' крестик — `max(1.5rem*scale, --ds-target-min)`, позиционированный'
      + ' `right: --ds-h-default` — в счёт не входил вовсе. На шкале 1.15'
      + ' крестик 27.6px против зазора 13.8px — крестик перекрывал текст на'
      + ' 13.8px при ЛЮБОЙ ширине поля, потому что резерв меньше занятого места'
      + ' арифметически, а не только на узком кадре. Резерв для `sm` был ещё'
      + ' меньше (`--ds-h-compact` вместо `--ds-h-default`), хотя кнопка'
      + ' календаря и крестик у `sm` фактически остаются md-ширины (в системе'
      + ' нет sm-варианта инлайновой кнопки поля — ни здесь, ни у `Combobox`,'
      + ' ни у `Select`), так что `sm` был перекрыт сильнее `md`.'
      + ' Правка (`DatePicker.css`): резерв = `--ds-h-default` (кнопка'
      + ' календаря) + `--ds-datepicker-clear-w` (фактическая ширина крестика,'
      + ' та же переменная, что задаёт его собственные width/height) +'
      + ' `--ds-space-2` (зазор текст—крестик), один резерв для `md` и `sm`.'
      + ' Утверждение читает ПИКСЕЛИ на живой разметке компонента (классы'
      + ' `.ds-datepicker*`, `.ds-input*` — из `DatePicker.tsx`), не CSS-текст:'
      + ' `padding-right`, объявленный верно, ничего не доказывает, если'
      + ' крестик или кнопка стоят не там, где предполагает арифметика.'
      + ' Хост `.ds-root.ds-scale` — 500px, выше пола 440 (DS-380/JIG-29): поле'
      + ' самого компонента 175px — предмет случая, а не ширина документа,'
      + ' и ниже пола её никто не смотрит.',
    html: (() => {
      const SCALES = ['0.875', '1', '1.15', '1.5']
      const SIZES = ['md', 'sm']
      const cell = (sc, size) => `
      <div class="ds-root ds-scale" style="--ds-ui-scale: ${sc}; width: 500px" data-dpcase data-sc="${sc}" data-size="${size}">
        <div class="ds-field ds-field--block ds-datepicker" style="width: 175px">
          <div class="ds-datepicker__control">
            <input class="ds-input ds-input--${size} ds-datepicker__input" value="17.03.2026" readonly />
            <button type="button" class="ds-datepicker__clear">×</button>
            <button type="button" class="ds-datepicker__btn">
              <svg width="15" height="15" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /></svg>
            </button>
          </div>
        </div>
      </div>`
      const out = []
      for (const sc of SCALES) for (const size of SIZES) out.push(cell(sc, size))
      return out.join('')
    })(),
    measure: () => {
      const cells = [...document.querySelectorAll('[data-dpcase]')]
      return cells.map((host) => {
        const input = host.querySelector('.ds-datepicker__input')
        const clear = host.querySelector('.ds-datepicker__clear')
        const cs = getComputedStyle(input)
        const rect = input.getBoundingClientRect()
        // Граница текста — правый край контентной области, БЕЗ падинга и
        // рамки: `box-sizing: border-box` у всех `.ds-*` (tokens.css), значит
        // `rect.right` включает и то, и другое.
        const contentRight = rect.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
        const clearLeft = clear.getBoundingClientRect().left
        return {
          sc: host.dataset.sc, size: host.dataset.size,
          contentRight: +contentRight.toFixed(2),
          clearLeft: +clearLeft.toFixed(2),
          gap: +(clearLeft - contentRight).toFixed(2),
        }
      })
    },
    expect: (m) => {
      const bad = m.filter((r) => r.contentRight > r.clearLeft + 0.5)
      if (bad.length) {
        return `текст заходит под крестик очистки на ${bad.length} из ${m.length}: `
          + bad.map((r) => `size=${r.size}/шкала=${r.sc} — граница текста ${r.contentRight}px правее левого края крестика ${r.clearLeft}px (нахлёст ${(r.contentRight - r.clearLeft).toFixed(2)}px)`).join('; ')
      }
      return true
    },
  },
]

/**
 * Модуль верстака, собранный в страницу. Нужен ровно одному предмету — форсу:
 * его механизм это ПЕРЕПИСАННЫЙ CSS настоящего листа системы, и проверить его
 * можно только там, где есть каскад. Собираем НАСТОЯЩИЙ исходник, а не его
 * пересказ: пересказ проверял бы сам себя (ловушка «верное не о том»).
 */
const bundles = new Map()
async function bundleOf(rel) {
  if (!bundles.has(rel)) {
    const out = await esbuild.build({
      entryPoints: [join(ROOT, rel)],
      bundle: true, write: false, format: 'iife', globalName: 'WB', target: 'es2022',
      // Компонент тянет свой лист импортом; каскад в странице уже есть из
      // `dist/src/styles.css`, второй экземпляр правил мерил бы не то.
      loader: { '.css': 'empty' },
    })
    bundles.set(rel, out.outputFiles[0].text)
  }
  return bundles.get(rel)
}

const port = await new Promise((r) => server.listen(0, () => r(server.address().port)))
const browser = await chromium.launch()
const VIEWPORT = { width: 900, height: 700 }
const page = await browser.newPage({ viewport: VIEWPORT })
/** Текущая ширина вьюпорта: следующий кейс без `viewport` вернёт её к общей. */
let viewportW = VIEWPORT.width

let failed = 0
for (const c of CASES) {
  // `viewport` — НАСТОЯЩИЙ вьюпорт, а не `width` (тот задаёт ширину `body`).
  // Разница не косметическая: `100vw`, медиазапросы и `clientWidth` документа
  // смотрят на вьюпорт и про ширину body не знают вовсе — случай про зажим
  // «доля экрана» с одним лишь `width` мерил бы ФОРМУЛУ НА 900px и проходил
  // бы при любом узком кадре (DS-167).
  // Восстановление — не в конце тела цикла, а здесь: у ветки `visit` есть
  // `continue`, и хвост цикла до неё не доходит. Сравнение с текущей
  // шириной, чтобы не платить `setViewportSize` на каждом из полутора сотен
  // случаев, которым вьюпорт безразличен.
  {
    const want = c.viewport ?? VIEWPORT.width
    if (want !== viewportW) { await page.setViewportSize({ width: want, height: VIEWPORT.height }); viewportW = want }
  }
  // `visit` — кейс не о вёрстке в вакууме, а о наборе готовых страниц: он
  // обходит их как есть, со своим `data-theme` на <html> и своими обёртками.
  // Собрать их тела в один `setContent` было бы дешевле и неверно: половина
  // разницы между превью живёт как раз в корне документа.
  if (c.visit) {
    await page.emulateMedia({ colorScheme: c.colorScheme ?? 'light', reducedMotion: c.reducedMotion ?? 'no-preference' })
    const visited = []
    for (const path of c.visit) {
      await page.goto(`http://127.0.0.1:${port}/${path}`, { waitUntil: 'load' })
      // Тот же увод курсора, что и на основном пути: страница переиспользуется,
      // и точка вьюпорта от предыдущего кейса может накрыть элемент этой —
      // тогда `:hover` молча подменит измеряемое. Здесь это сегодня безвредно
      // (наведение размеров не меняет), но отсутствие гигиены наследует
      // следующий кейс с `visit`, а он может мерить цвет.
      await page.mouse.move(899, 699)
      await page.evaluate(SEEN_INSTALL)
      // `bundle` и здесь, а не только на плоском пути (DS-222): случай,
      // которому нужен НАСТОЯЩИЙ модуль, обходит готовые страницы — и без
      // этой строки он был бы обязан пересказать модуль своей копией.
      if (c.bundle) await page.addScriptTag({ content: await bundleOf(c.bundle) })
      visited.push({ path, ...(await page.evaluate(c.measure)) })
    }
    const verdict = c.expect({ visited })
    if (verdict === true) { console.log(`  ok   ${c.name}`) } else {
      failed++
      console.log(`  FAIL ${c.name}`)
      console.log(`       ${verdict}`)
      console.log(`       почему это проверяется: ${c.why}`)
    }
    continue
  }
  await page.goto(`http://127.0.0.1:${port}/`)
  if (c.extraCss) await page.addStyleTag({ content: c.extraCss })
  // Системная тема эмулируется по-настоящему: `prefers-color-scheme` нельзя
  // подделать ни атрибутом, ни стилем — только настройкой браузера.
  // `reducedMotion` — такая же настройка браузера, как и схема цвета: правило
  // под `@media (prefers-reduced-motion: reduce)` иначе не сработает вовсе, и
  // случай про погашенную анимацию мерил бы её включённой (DS-209).
  await page.emulateMedia({ colorScheme: c.colorScheme ?? 'light', reducedMotion: c.reducedMotion ?? 'no-preference' })
  if (c.width) await page.evaluate((w) => { document.body.style.width = `${w}px` }, c.width)
  await page.setContent(
    `<link rel="stylesheet" href="http://127.0.0.1:${port}/dist/src/styles.css">`
    + (c.extraLink ? `<link rel="stylesheet" href="http://127.0.0.1:${port}/dist/${c.extraLink}">` : '')
    // `extraSheet` — путь ОТ КОРНЯ репозитория, а не от `dist`: хром верстака
    // (`workbench/shell.css`) в пакет не собирается и в `dist` его нет, а
    // проверять его надо там же, где остальное, — в настоящем каскаде.
    // Списком ТОЖЕ, а не только строкой: случай про прицел живёт сразу в двух
    // листах — строка тулбара в `shell.css`, бейдж над узлом в `frame.css`, —
    // и подключив один, он мерил бы голый `<span>` без единого правила
    // проверяемого класса. Ловушка 8 из docs/writing-checks.md: свойство,
    // которое не применилось вовсе, поймана мутацией уже на этом кейсе.
    + [c.extraSheet ?? []].flat()
        .map((f) => `<link rel="stylesheet" href="http://127.0.0.1:${port}/${f}">`).join('')
    + (c.extraCss ? `<style>${c.extraCss}</style>` : '')
    + `<body${c.width ? ` style="width:${c.width}px"` : ''}>${c.html}</body>`,
    { waitUntil: 'load' },
  )
  // Курсор общий на весь прогон (page переиспользуется). Кейс с hoverPair
  // оставляет мышь над своим элементом, и после setContent эта же точка вьюпорта
  // может накрыть строку следующего кейса — тогда :hover (выше по весу) молча
  // подменит измеряемый фон. Уводим курсор в дальний угол перед замером; кейсы
  // hoverPair/hoverBorders наводят мышь заново уже после него.
  await page.mouse.move(899, 699)

  // `window.__seen` заводится ПОСЛЕ setContent: тот заменяет документ, и всё,
  // что было в window, вместе с ним пропадает (DS-209).
  await page.evaluate(SEEN_INSTALL)

  // `bundle` — НАСТОЯЩИЙ модуль верстака в страницу, под именем `WB`. Тот же
  // приём, что у `forceProbe`, вынесенный в общий флаг: замер, проверяющий
  // вывод функции, обязан звать функцию, а не хранить её вчерашний ответ
  // строкой в кейсе. Скопированная строка расходится с кодом молча — и
  // санитар продолжает утверждать про текст, которого больше никто не
  // печатает.
  if (c.bundle) await page.addScriptTag({ content: await bundleOf(c.bundle) })

  let m = c.measure ? await page.evaluate(c.measure, { factor: c.scale ?? null, tokens: SCALED_TOKENS }) : {}
  if (c.pixels) {
    // Единственный способ утверждать «этого не видно на экране».
    // Хит-тест не годится: `border-radius` его не клипует — замерено, шапка со
    // скруглением 3px всё равно отвечает на elementFromPoint в углу карточки.
    // Поэтому снимок вьюпорта возвращается в страницу картинкой и читается
    // канвой: `c.pixels` отдаёт точки в координатах вьюпорта, сюда приходят
    // цвета в этих точках.
    const points = await page.evaluate(c.pixels)
    const shot = (await page.screenshot({ type: 'png' })).toString('base64')
    const at = await page.evaluate(async ({ shot, points }) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + shot
      await img.decode()
      const cv = document.createElement('canvas')
      cv.width = img.width; cv.height = img.height
      const ctx = cv.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const out = {}
      for (const [name, [x, y]] of Object.entries(points)) {
        const [r, g, b] = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
        out[name] = `rgb(${r}, ${g}, ${b})`
      }
      return out
    }, { shot, points })
    m = { ...m, at }
  }
  if (c.focusRings) {
    // :focus-visible, как и :hover, из JS не выставить: `el.focus()` без
    // предшествующего ввода даёт голый :focus, и кольцо не рисуется вовсе
    // (проверено — обе тени вышли `0px 0px 0px 0px`). Нужен настоящий Tab.
    const shadow = (s) => page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).boxShadow, s)
    const rings = {}
    for (const sel of c.focusRings) {
      await page.keyboard.press('Tab')
      rings[sel] = await shadow(sel)
    }
    m = { ...m, rings }
  }
  if (c.hoverWeights) {
    // То же, что hoverSeen, но вопрос про НАЧЕРТАНИЕ, а не про цвет
    // (DS-234). Нужен отдельный ключ, потому что `window.__seen`
    // складывает СЛОИ и о типографике молчит по устройству: он отвечает «какой
    // цвет виден на экране», а начертание слоями не складывается.
    //
    // Предмет — единственный случай, где второй носитель остаётся ОДИН:
    // под курсором чужой день берёт обычный тон (DS-229), то есть
    // цветовой носитель там снят намеренно. Прочитать это в покое нельзя, а
    // из JS `:hover` не выставить.
    //
    // `landed` — тот же санитар, что у hoverSeen, и по той же причине: мышь
    // может не доехать, и тогда читался бы покой. Здесь он устроен иначе —
    // сравнивать снимок покоя с наведённым бесполезно, потому что вес под
    // курсором обязан НЕ меняться.
    //
    // Доезд меряется по ФОНУ, а не по цвету текста, и это не мелочь: цвет
    // текста и есть предмет проверки (`--out:hover` возвращает обычный тон,
    // DS-229). Первая редакция брала цвет — и на мутации «снять правило
    // 229» кейс краснел с сообщением «курсор не доехал», то есть санитар
    // ЗАСЛОНЯЛ собой настоящий дефект и звал чинить не то. Фон красит другое
    // правило (`.ds-cal__day:hover`), поэтому сигналы независимы.
    const read = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s)
      const cs = getComputedStyle(el)
      return { weight: cs.fontWeight, color: cs.color, background: cs.backgroundColor }
    }, sel)
    const weights = {}
    for (const [at, target] of c.hoverWeights) {
      await page.mouse.move(899, 699)
      const rest = await read(target)
      await page.hover(at)
      const seen = await read(target)
      weights[target] = { rest, seen, landed: rest.background !== seen.background }
    }
    m = { ...m, weights }
  }
  if (c.hoverBorders) {
    // То же, что hoverPair, но вопрос про рамку своего элемента, а не про фон:
    // «выключенное поле не подсвечивается» — утверждение про border-color.
    const border = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).borderTopColor, sel)
    const borders = {}
    for (const sel of c.hoverBorders) { await page.hover(sel, { force: true }); borders[sel] = await border(sel) }
    m = { ...m, borders }
  }
  if (c.forceProbe) {
    // Порядок здесь — часть замера, а не оформление кода:
    //  1) настоящее наведение (единственный способ узнать, чем красит :hover);
    //  2) курсор уводится, и снимается тон БЕЗ наведения — без него сравнение
    //     «форс красит тем же» было бы неопровержимым (совпало бы всегда);
    //  3) форс включается атрибутом — на самом элементе и на предке;
    //  4) лист форса переставляется В НАЧАЛО головы: мутация, встроенная
    //     в санитар. Дубликат равен оригиналу по специфичности, значит спор
    //     решает порядок, и не последним он обязан ПРОИГРАТЬ.
    await page.addScriptTag({ content: await bundleOf('workbench/force-states.ts') })
    // Переходы гасятся ДО замеров, и это не косметика: у `.ds-btn` объявлен
    // `transition: background .12s`, и первая редакция санитара читала цвет
    // на полпути — тот же прогон давал то `rgb(14,121,121)`, то `rgb(14,124,124)`
    // на одном и том же коде. Мигающий санитар хуже отсутствующего: он учит
    // перезапускать проверку. Правило трогает только длительность — вопрос
    // «какое правило выиграло» оно не меняет.
    await page.addStyleTag({ content: '* { transition-duration: 0s !important; animation-duration: 0s !important; }' })
    const bg = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel)
    await page.hover('#self')
    const hovered = await bg('#self')
    await page.mouse.move(899, 699)
    const plain = await bg('#self')
    const stats = await page.evaluate(() => {
      const s = WB.installForce(document)
      document.getElementById('self').setAttribute(WB.FORCE_ATTR, 'hover')
      document.getElementById('root').setAttribute(WB.FORCE_ATTR, 'hover')
      // `css` наружу не едет: это десятки килобайт, а вопрос к нему один —
      // не пуст ли он, и на него отвечает `matched`.
      return { scanned: s.scanned, matched: s.matched, skipped: s.skipped, opaque: s.opaque, ms: +s.ms.toFixed(2) }
    })
    const forced = await bg('#self')
    const viaAncestor = await bg('#inner')
    await page.evaluate(() => {
      const s = document.getElementById('wb-force')
      document.head.insertBefore(s, document.head.firstChild)
    })
    const wrongOrder = await bg('#self')
    m = { ...m, force: { plain, hovered, forced, viaAncestor, wrongOrder, ...stats } }
  }
  if (c.focusVsHover) {
    // ТРИ состояния каждого элемента, снятые по очереди, и вопрос к ним один:
    // различимы ли они между собой. В CLAUDE.md записан живой случай, где
    // правка доступности СОЗДАЛА дефект — дала клавиатуре доступ туда, где
    // подсветка фокуса совпадала с наведением; поймать это можно только
    // сравнением, а не проверкой каждого состояния по отдельности.
    //
    // `:focus-visible` из JS не выставить: `el.focus()` даёт голый `:focus`
    // (проверено в соседнем случае про кольца). Нужен настоящий Tab, поэтому
    // элементы обходятся В ПОРЯДКЕ РАЗМЕТКИ, и каждый замер несёт `focused` —
    // заведомо известного соседа: разъедься порядок обхода с разметкой, числа
    // остались бы правдоподобными, а замер — не про тот элемент.
    const read = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s)
      const cs = getComputedStyle(el)
      const host = el.closest('.wb') ?? document.body
      return {
        outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
        color: cs.outlineColor,
        // Кольцо системы — box-shadow, а не outline (`--ds-focus-ring`), и без
        // этой строки механизм умел проверять только хром верстака: у любого
        // компонента DS `outline` под фокусом снят намеренно, то есть все три
        // состояния отдавали `none 0px` и сравнение проходило ТРИВИАЛЬНО —
        // случай №3 из docs/writing-checks.md, неопровержимое утверждение.
        ring: cs.boxShadow,
        bg: cs.backgroundColor,
        hostBg: getComputedStyle(host).backgroundColor,
        // Снимки слоёв (DS-209). Обвод фокуса гаснет под `opacity`
        // предка ровно так же, как текст, — а лежит не в `color`, поэтому
        // цвет подменяется вторым аргументом. Подложка хоста берётся снимком
        // же: `backgroundColor` у неё может оказаться прозрачным, и тогда
        // сравнение шло бы с `rgba(0, 0, 0, 0)`, то есть с чёрным.
        outlineSeen: window.__seen(el, cs.outlineColor),
        hostSeen: window.__seen(host),
        focused: document.activeElement === el,
      }
    }, sel)
    const states = {}
    await page.mouse.move(899, 699)
    for (const sel of c.focusVsHover) states[sel] = { rest: await read(sel) }
    for (const sel of c.focusVsHover) {
      await page.hover(sel)
      states[sel].hover = await read(sel)
    }
    await page.mouse.move(899, 699)
    for (const sel of c.focusVsHover) {
      await page.keyboard.press('Tab')
      states[sel].focus = await read(sel)
    }
    m = { ...m, states }
  }
  if (c.hoverSeen) {
    // То же, что hoverPair, но вопрос про ТЕКСТ, а не про фон: подложка
    // наведения съедает контраст тона, который на ней лежит, и увидеть это
    // можно только сложив слои ПОД настоящим курсором (DS-229).
    // `hoverPair` отдаёт `backgroundColor` двух элементов и о тексте молчит.
    //
    // Пара — [где навести, что читать]: тон обычно лежит на потомке (число дня
    // в своём `<span>`, ячейка внутри строки), а подложку красит предок.
    //
    // `landed` — САНИТАР на сам приём: снимок покоя против снимка под курсором.
    // Мышь может не доехать (элемент нулевой высоты, перекрыт, уехал за
    // вьюпорт), и тогда читался бы ПОКОЙ: числа выходят правдоподобные и
    // зелёные, а утверждение — не о наведении вовсе. Тот же класс, что «ввод не
    // доставлен» в ручном обходе.
    //
    // Спросить `matches(':hover')` было бы короче и было бы НЕВЕРНО: в headless
    // Chromium правила :hover применяются, а селектор их не находит — проверено,
    // `querySelectorAll(':hover').length` равен 0 на элементе, который в этот же
    // миг покрашен своим hover-фоном. Санитар на этом отвечал бы «курсор не
    // доехал» всегда, то есть красил бы кейс независимо от предмета.
    const snap = (r) => page.evaluate((sel) => window.__seen(document.querySelector(sel)), r)
    const hovered = {}
    for (const [at, read] of c.hoverSeen) {
      await page.mouse.move(899, 699)
      const rest = await snap(read)
      await page.hover(at)
      const seen = await snap(read)
      hovered[read] = { seen, rest, landed: JSON.stringify(rest) !== JSON.stringify(seen) }
    }
    m = { ...m, hovered }
  }
  if (c.hoverPair) {
    // :hover нельзя выставить из JS — только настоящим указателем, по очереди.
    const bg = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel)
    await page.hover(c.hoverPair[0]); const plainHovered = await bg(c.hoverPair[0])
    await page.hover(c.hoverPair[1]); const selHovered = await bg(c.hoverPair[1])
    m = { ...m, plainHovered, selHovered }
  }
  if (c.hoverStyles) {
    // НАБОР свойств каждого узла в покое и под курсором (DS-359).
    // Соседи по механизму отвечают на более узкие вопросы: `hoverPair` — про
    // фон двух узлов, `hoverBorders` — про рамку, `hoverWeights` — про
    // начертание, `hoverSeen` — про сложенный цвет текста. Здесь вопрос
    // «выглядят ли два элемента ОДИНАКОВО», и он задаётся списком свойств
    // сразу: различие в любом из них и есть ответ.
    //
    // Селекторы — статический список, а `id` на узлы вешает `measure`
    // этого же кейса: какое именно действие осталось видимым в полосе, решает
    // свёртка, и знать это до замера нельзя. Порядок в цикле гарантирован:
    // `measure` отрабатывает раньше всех hover-ключей.
    //
    // Переходы гасятся, как и у `forceProbe`, и по той же причине: у `.ds-btn`
    // объявлен `transition: background .12s`, и замер на полпути давал бы то
    // один цвет, то другой на одном и том же коде.
    await page.addStyleTag({ content: '* { transition-duration: 0s !important; animation-duration: 0s !important; }' })
    const props = c.hoverProps ?? BUTTON_LOOK
    const read = (sel) => page.evaluate(({ s, p }) => {
      const el = document.querySelector(s)
      if (!el) return null
      const cs = getComputedStyle(el)
      const o = {}
      for (const name of p) o[name] = cs.getPropertyValue(name)
      return o
    }, { s: sel, p: props })
    const looks = {}
    for (const sel of c.hoverStyles) {
      // Парковка в дальнем углу ТЕКУЩЕГО вьюпорта, а не в 899×699: у кейса с
      // широким кадром та точка лежит внутри страницы и может накрыть соседа.
      await page.mouse.move(viewportW - 1, VIEWPORT.height - 1)
      const rest = await read(sel)
      // `force` — ради выключенного узла: `pointer-events: none` снимает
      // проверку достижимости, и без него наведение на него не состоится
      // вовсе. Тот же приём и по той же причине, что у `hoverBorders`.
      await page.hover(sel, { force: true })
      looks[sel] = { rest, seen: await read(sel) }
    }
    m = { ...m, looks }
  }

  const verdict = c.expect(m)
  if (verdict === true) {
    console.log(`  ok   ${c.name}`)
  } else {
    failed++
    console.log(`  FAIL ${c.name}`)
    console.log(`       ${verdict}`)
    console.log(`       почему это проверяется: ${c.why}`)
    console.log(`       измерено: ${JSON.stringify(m)}`)
  }
}

await browser.close()
server.close()

console.log(`\nmeasure: ${CASES.length - failed}/${CASES.length} инвариантов держатся`)
if (failed) {
  console.log('Это утверждения о видимом результате — падение значит, что потребитель увидит другое.')
  process.exit(1)
}
