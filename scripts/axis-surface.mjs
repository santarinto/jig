/**
 * ОСЬ МАТРИЦЫ: общая механика площади, сверки и вердикта (DS-347).
 *
 * Ось — это второй проход по ТЕМ ЖЕ случаям в других условиях: сенсорный
 * контекст вместо мышиного (DS-336), кадр 440 вместо 360 (DS-347).
 * У обеих осей всё одинаково, кроме того, ЧТО ищется в листах: у сенсорной —
 * прелюдия `@media` про указатель, у ширины — прелюдия `@container` про
 * ширину. Различие в одну регулярку и одно имя ат-правила.
 *
 * ПОЭТОМУ МОДУЛЬ ОДИН, А НЕ ДВА ПОХОЖИХ. Вторая ось писалась копией первой, и
 * копия эта разошлась бы с оригиналом при первой же правке площади — молча, в
 * ту сторону, где обход меньше, а отчёт по-прежнему зелёный. Ровно тот довод,
 * по которому `casesPlan` живёт рядом с `showsPlan` и берёт тот же `mods`.
 *
 * ЗДЕСЬ ТОЛЬКО ЧИСТОЕ — без браузера и без дев-сервера, чтение файла через
 * переданный `read`; функции со словом «в странице» уходят в `page.evaluate`
 * целиком и потому самодостаточны (ни импортов, ни замыканий).
 */
import { dirname, join, relative } from 'node:path'

/** Комментарий — пробелами той же длины: номера строк в находках остаются верными. */
const blankComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

const IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g

/**
 * Площадь с ДИСКА: листы, достижимые `@import` от входа, и в них — прелюдии
 * ат-правила `at`, где стоит `cond`. Не список компонентов: новый компонент с
 * такой веткой попадает в обход сам, а вписанный руками список отстаёт молча.
 *
 * Приписывается компонент по пути листа (`src/components/<Имя>/…`). Лист вне
 * компонентов (`src/styles/*.css` — общие листы) приписать некому: его правила
 * ложатся на несколько компонентов сразу. Такая ветка идёт в `unattributed`, и
 * ходок краснеет на ней ДО обхода — молча её пропустить значило бы объявить
 * раскладку этих компонентов судимой, не посмотрев её ни разу.
 *
 * @param {{ root: string, entry: string, read: (abs: string) => string,
 *           at: string, cond: RegExp }} o
 * @returns {{ byComponent: Map<string, { files: string[], hits: string[] }>, unattributed: string[], sheets: number }}
 */
export function axisSurface({ root, entry, read, at, cond }) {
  const rule = new RegExp(`@${at}\\b([^{;]*)\\{`, 'g')
  const byComponent = new Map()
  const unattributed = []
  const seen = new Set()
  const visit = (abs) => {
    if (seen.has(abs)) return
    seen.add(abs)
    const css = blankComments(read(abs))
    const rel = relative(root, abs)
    for (const m of css.matchAll(rule)) {
      if (!cond.test(m[1])) continue
      const line = css.slice(0, m.index).split('\n').length
      const hit = `${rel}:${line} @${at} ${m[1].trim()}`
      const c = /^src\/components\/([^/]+)\//.exec(rel)?.[1]
      if (!c) {
        unattributed.push(hit)
        continue
      }
      const entryOf = byComponent.get(c) ?? { files: [], hits: [] }
      if (!entryOf.files.includes(abs)) entryOf.files.push(abs)
      entryOf.hits.push(hit)
      byComponent.set(c, entryOf)
    }
    for (const m of css.matchAll(IMPORT)) visit(join(dirname(abs), m[1]))
  }
  visit(join(root, entry))
  return { byComponent, unattributed, sheets: seen.size }
}

/**
 * В СТРАНИЦЕ: правила оси, какими лист разобрал БРАУЗЕР. Уходит в
 * `page.evaluate` целиком, условие приходит строкой в объекте-аргументе.
 *
 * Это второй, НЕЗАВИСИМЫЙ вывод той же площади: диск читает текст регуляркой,
 * CSSOM — парсер chromium. Площадь, посчитанная одним способом, согласна сама
 * с собой и тогда, когда потеряла компонент (ловушка 7, `docs/writing-checks.md`).
 *
 * Имя класса правила приходит СТРОКОЙ (`CSSMediaRule`, `CSSContainerRule`), а
 * не конструктором: функция сериализуется в страницу, и замыкание на класс из
 * ходка туда не доедет. Условие читается с самого правила — `mediaText` у
 * медиа, `containerQuery` у контейнерного.
 */
export const cssomAxisRules = ({ src, kind }) => {
  const re = new RegExp(src)
  const out = []
  const textOf = (r) => (kind === 'CSSContainerRule' ? r.containerQuery : r.media.mediaText)
  const isAxis = (r) => r.constructor.name === kind
  const walk = (rules, cond) => {
    for (const r of rules) {
      if (isAxis(r)) {
        const text = textOf(r)
        walk(r.cssRules, cond ?? (re.test(text) ? text : null))
      } else if (r instanceof CSSStyleRule) {
        if (cond) out.push({ media: cond, selector: r.selectorText })
      } else if (r.cssRules) walk(r.cssRules, cond)
    }
  }
  for (const s of document.styleSheets) {
    try {
      walk(s.cssRules, null)
    } catch {
      /* чужой лист без доступа к правилам — у кадра таких нет */
    }
  }
  return out
}

/**
 * Площадь диска против CSSOM страницы — в ОБЕ стороны.
 *
 * Правило CSSOM принадлежит компоненту, если хоть один класс его селектора
 * определён в листе этого компонента. Не нашлось хозяина в площади — компонент
 * с веткой из площади выпал (регулярка, приписка, `@import` другой формы), и
 * его раскладка не судится, хотя браузер её рисует. Компонент площади без
 * единого своего правила в CSSOM — ветка есть в тексте, но не в странице (лист
 * не доехал, прелюдия в строке, которую регулярка приняла за ветку), и ось
 * судила бы ячейки, ничем не отличные от обычных.
 *
 * @param {{ selector: string, media: string }[]} rules из `cssomAxisRules`
 * @param {Map<string, string>} sheetText компонент площади → текст его листов
 * @param {{ axis: string }} [names] чем ось зовётся в тексте расхождения
 * @returns {string[]} расхождения; пусто — площади сошлись
 */
export function crossCheckSurface(rules, sheetText, { axis = 'сенсорной' } = {}) {
  const out = []
  const owned = new Set()
  for (const { selector, media } of rules) {
    const classes = [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])
    const owners = [...sheetText].filter(([, text]) =>
      classes.some((cls) => new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}(?![\\w-])`).test(text)))
    if (!owners.length) {
      out.push(`в листе страницы есть ветка ${media} { ${selector} }, а компонента, чей лист его несёт, в ${axis} площади нет`)
    }
    for (const [c] of owners) owned.add(c)
  }
  for (const c of sheetText.keys()) {
    if (!owned.has(c)) out.push(`${c}: на диске ветка есть, в листе страницы ни одного её правила — ось судила бы обычный кадр`)
  }
  return out
}

/**
 * В СТРАНИЦЕ: ПРИМЕНЯЕТСЯ ЛИ ветка оси — по узлам, а не по вычисленным
 * значениям (DS-347).
 *
 * ПЕРВАЯ РЕДАКЦИЯ СРАВНИВАЛА ВЫЧИСЛЕННЫЕ ЗНАЧЕНИЯ свойств, объявленных в
 * ветке, и для сенсорной оси этого хватало: указатель двоичен, кадр либо
 * мышиный, либо нет. Для оси ширины она оказалась проверкой, КОТОРАЯ НЕ МОЖЕТ
 * ПОКРАСНЕТЬ: половина таких свойств (`width: 100cqi`, паддинги, треки) меняет
 * значение от ЛЮБОЙ смены ширины, ветка при этом с места не двигается. Мутация
 * «вторая ширина 361 вместо 440» — то есть заведомо та же ветка — осталась
 * зелёной на всех шести компонентах площади. Замер 20.09.2026.
 *
 * ОТСЮДА ДИСКРЕТНЫЙ ЗАМЕР, И СУДИТ ЕГО САМ БРАУЗЕР. В каждое СТИЛЕВОЕ правило
 * внутри ветки вписывается своя пользовательская метка (`--ds-axis-N: 1`), и
 * по каждому узлу `.wbf-host` читается, пришла ли она. Пришла — правило на этой
 * стороне оси ДЕЙСТВУЕТ; не пришла — нет. Условие ветки при этом вычисляет
 * chromium, а не мы: своего разбора `(max-width: 28.4em)` здесь нет и не будет,
 * он разошёлся бы с браузером молча.
 *
 * ПОЧЕМУ МЕТКА — ПОЛЬЗОВАТЕЛЬСКОЕ СВОЙСТВО, а не какое-нибудь `outline`:
 * она ничего не рисует и ни на что не влияет, а читается ровно там, где нужна.
 * Наследование метки потомкам не мешает: оно одинаково на обеих сторонах оси,
 * то есть в разницу не попадает, а флип ветки двигает весь набор разом.
 *
 * ЛИСТ ПРАВИТСЯ И ВОЗВРАЩАЕТСЯ (`finally`): отпечаток снимается ПОСЛЕ судей,
 * следующая ячейка — это новый `goto`, и всё же правило возвращается как взято
 * — страница живёт `recycle` ячеек, и метка, оставленная в чужом листе, была бы
 * ровно тем побочным эффектом, за который ходок краснит строки.
 */
export const axisPrint = ({ src, kind }) => {
  const re = new RegExp(src)
  const textOf = (r) => (kind === 'CSSContainerRule' ? r.containerQuery : r.media.mediaText)
  /** Стилевые правила ВНУТРИ веток оси — по всем листам кадра. */
  const inside = []
  const walk = (rules, on) => {
    for (const r of rules) {
      if (r.constructor.name === kind) walk(r.cssRules, on || re.test(textOf(r)))
      else if (r instanceof CSSStyleRule) {
        if (on) inside.push(r)
      } else if (r.cssRules) walk(r.cssRules, on)
    }
  }
  for (const s of document.styleSheets) {
    try {
      walk(s.cssRules, false)
    } catch {
      /* чужой лист без доступа к правилам — у кадра таких нет */
    }
  }
  const marks = inside.map((_, i) => `--ds-axis-${i}`)
  const host = document.querySelector('.wbf-host')
  const nodes = host ? [host, ...host.querySelectorAll('*')] : []
  try {
    inside.forEach((r, i) => r.style.setProperty(marks[i], '1'))
    return {
      props: marks,
      print: nodes.map((n) => {
        const cs = getComputedStyle(n)
        return marks.map((m) => (cs.getPropertyValue(m).trim() === '1' ? '1' : '0')).join('')
      }).join('|'),
    }
  } finally {
    inside.forEach((r, i) => r.style.removeProperty(marks[i]))
  }
}

/**
 * РАЗНИЦА ПО КОМПОНЕНТУ — вердикт оси.
 *
 *  - компонент площади, у которого НИ ОДНА пара (случай, шкала) не разошлась, —
 *    красный: ось его обошла и ничего не увидела;
 *  - кроме объявленных в `same` с доводом. Их объявление проверяется
 *    НАОБОРОТ: разошлась хоть одна пара — довод протух, красное, как
 *    устаревшее исключение `KNOWN`;
 *  - объявление на компоненте вне площади — красное: довод ни о чём;
 *  - пара без одного из отпечатков — не сравнена, и компонент, у которого не
 *    сравнена ни одна, судится как «не увидела» — отсутствие данных не
 *    превращается в «разницы нет, значит, объявлено верно».
 *
 * @param {{ surface: string[], prints: Map<string, object>, same: Map<string, string>,
 *           sides: [string, string], from: string, what: string }} o
 *   `sides` — два ключа отпечатка, `from` — как базовая сторона зовётся в
 *   отчёте («мыши», «кадра 440»), `what` — как зовётся сама ветка.
 * @returns {{ lines: string[], bad: string[] }}
 */
export function axisVerdict({ surface, prints, same, sides, from, what }) {
  const [base, other] = sides
  const lines = []
  const bad = []
  for (const c of [...surface].sort()) {
    const pairs = [...prints.values()].filter((p) => p.c === c)
    const compared = pairs.filter((p) => p[base] !== undefined && p[other] !== undefined)
    const differ = compared.filter((p) => p[base] !== p[other])
    const declared = same.get(c)
    const count = `${differ.length} из ${compared.length} пар (случай × шкала) отличаются от ${from}`
      + (compared.length < pairs.length ? `, не сравнено ${pairs.length - compared.length}` : '')
    if (declared !== undefined) {
      if (differ.length) bad.push(`${c}: объявлено «кадр тот же», а ${count} — довод «${declared}» протух`)
      else if (!compared.length) bad.push(`${c}: объявлено «кадр тот же», но ни одной пары не сравнено — объявление не проверено`)
      else lines.push(`${c}: ${count} — объявлено: ${declared}`)
    } else if (!differ.length) {
      bad.push(`${c}: ${count} — ${what} в кадре ничего не поменяла, ось зелёная на пустом множестве`)
    } else lines.push(`${c}: ${count}`)
  }
  for (const c of same.keys()) {
    if (!surface.includes(c)) bad.push(`${c}: объявлен «кадр тот же», но ветки у него на диске нет — снять объявление`)
  }
  return { lines, bad }
}
