/**
 * Форс-состояния: дубликат интерактивных правил, включаемый атрибутом.
 *
 * `:hover` из JS не выставить — событий указателя не подделать, а
 * `:focus-visible` браузер даёт только после настоящего ввода с клавиатуры
 * (проверено в `measure-invariants.mjs`: `el.focus()` без Tab даёт голый
 * `:focus`, и кольцо не рисуется вовсе). Единственный способ увидеть состояние
 * по требованию — переписать сами правила: обойти листы кадра, у правил с
 * `:hover`/`:focus`/`:focus-visible`/`:active` собрать дубликат, где псевдокласс
 * заменён на `[data-wb-force~="…"]`, и вставить одним `<style>`.
 *
 * ДВЕ ФОРМЫ на каждое правило, и обе несущие:
 *  - «сам»    `.ds-btn[data-wb-force~="hover"]` — атрибут на самом элементе
 *             (прицел, Задача 32: выбран конкретный узел);
 *  - «предок» `[data-wb-force~="hover"] .ds-btn` — атрибут на корне превью,
 *             форсируется всё внутри (умолчание; для одиночной кнопки этого
 *             хватает, для таблицы «подсветится всё» — за тем и заведён прицел).
 *
 * СПЕЦИФИЧНОСТЬ СОХРАНЯЕТСЯ ТОЧНО, и это не совпадение, а условие работы:
 * каждый снятый псевдокласс (0,1,0) заменяется ровно одним атрибутом (0,1,0) —
 * в форме «сам» на месте, в форме «предок» приставкой. Дубликат выходит той же
 * специфичности, что оригинал, а значит спор решает ТОЛЬКО ПОРЯДОК: лист форса
 * обязан идти последним. Вставленный раньше — молча проиграет, и форс «работает»
 * ровно до первого взгляда. Санитар — случай «Форс» в `measure-invariants.mjs`,
 * который сам ломает порядок и требует, чтобы цвет перестал совпадать.
 *
 * ЧЕГО ЗДЕСЬ НЕТ НАМЕРЕННО: парсера CSS. Разбор селектора минимальный —
 * посимвольный проход, знающий про кавычки, `[…]` и скобки функциональных
 * псевдоклассов. Всё, что он не берётся переписать безопасно, ПРОПУСКАЕТСЯ и
 * СЧИТАЕТСЯ: `:not(:hover)` при текстовой замене переворачивает смысл, и
 * дубликат красил бы ровно наоборот. Счётчик пропущенных — не украшение: без
 * него утверждение «форс работает» пустое (та же логика, что у счётчика
 * обойдённых в `no-nul-bytes.test.ts`). Измерено по `src` на 2026-08-22:
 * `:not(:hover)` и `:has(` — ноль вхождений, то есть счётчик обязан показывать
 * 0, и любое другое число значит, что в CSS появилась новая конструкция.
 */

/** Состояния, которые умеет форсировать верстак. */
export const FORCE_STATES = ['hover', 'focus', 'focus-visible', 'active'] as const
export type ForceState = (typeof FORCE_STATES)[number]

/** Атрибут-выключатель. Значения — через пробел, отсюда `~=` в селекторе. */
export const FORCE_ATTR = 'data-wb-force'

/** Идентификатор листа форса: он же — способ не обойти самого себя. */
export const FORCE_STYLE_ID = 'wb-force'

/**
 * Итог разбора одного селектора. ТРИ исхода, а не два: «нечего переписывать»
 * и «не взялся переписать» — разные вещи, и схлопывать их в `null` нельзя.
 * Из 1070 правил системы интерактивных примерно 115; если бы `none` и
 * `skipped` считались вместе, счётчик пропущенных показывал бы девять сотен и
 * не значил бы ничего.
 */
export type SelectorRewrite =
  | { kind: 'rewritten'; selector: string }
  | { kind: 'none' }
  | { kind: 'skipped'; reason: string }

const TARGETS: readonly string[] = FORCE_STATES

/** Групповые правила, внутрь которых надо спускаться. */
const GROUPING = /^@(media|supports|container|layer|scope)\b/i

const NAME_CHAR = /[A-Za-z0-9_-]/

/** Часть селекторного списка, разобранная на две формы. */
interface Part {
  /** Форма «сам»: псевдоклассы заменены на месте. */
  self: string
  /** Форма «предок»: псевдоклассы сняты, приставка собрана отдельно. */
  bare: string
  /** Приставка формы «предок» — по атрибуту на каждый снятый псевдокласс. */
  prefix: string
}

function attr(name: string): string {
  return `[${FORCE_ATTR}~="${name}"]`
}

/**
 * Переписывание одного `selectorText`. Селекторный список разбирается по
 * запятым ВЕРХНЕГО УРОВНЯ, и части без интерактивного псевдокласса
 * ВЫБРАСЫВАЮТСЯ, а не едут в дубликат.
 *
 * Выбрасывать обязательно. `.chip:hover, .chip--active { background: … }` —
 * обычная форма записи в этой системе; сохрани мы вторую часть, дубликат
 * добавил бы в САМЫЙ КОНЕЦ листа правило `.chip--active { background: … }`
 * той же специфичности, и оно перебило бы всё, что перекрашивало `.chip--active`
 * ниже по файлу. Форс сломал бы вид ДО того, как его включили: атрибута на
 * элементе нет, а цвет уже другой.
 */
export function rewriteSelector(selectorText: string): SelectorRewrite {
  const parts: Part[] = []
  let self = ''
  let bare = ''
  let prefix = ''
  let touched = false
  let depth = 0
  let quote: string | null = null
  let bracket = false
  let i = 0

  const flush = (): void => {
    if (touched) parts.push({ self: self.trim(), bare: bare.trim(), prefix })
    self = ''
    bare = ''
    prefix = ''
    touched = false
  }
  const put = (s: string): void => {
    self += s
    bare += s
  }

  while (i < selectorText.length) {
    const ch = selectorText[i]!
    if (quote) {
      if (ch === '\\') {
        put(ch + (selectorText[i + 1] ?? ''))
        i += 2
        continue
      }
      put(ch)
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '\\') {
      put(ch + (selectorText[i + 1] ?? ''))
      i += 2
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      put(ch)
      i++
      continue
    }
    if (bracket) {
      put(ch)
      if (ch === ']') bracket = false
      i++
      continue
    }
    if (ch === '[') {
      bracket = true
      put(ch)
      i++
      continue
    }
    if (ch === '(') {
      depth++
      put(ch)
      i++
      continue
    }
    if (ch === ')') {
      if (depth > 0) depth--
      put(ch)
      i++
      continue
    }
    if (ch === ',' && depth === 0) {
      flush()
      i++
      continue
    }
    if (ch === ':') {
      // `::before` — псевдоЭЛЕМЕНТ, и `:hover` внутри него не встречается.
      // Съедаем оба двоеточия разом, иначе разбор имени начался бы со второго
      // и увидел бы пустое имя на каждом псевдоэлементе.
      if (selectorText[i + 1] === ':') {
        put('::')
        i += 2
        continue
      }
      let j = i + 1
      while (j < selectorText.length && NAME_CHAR.test(selectorText[j]!)) j++
      const name = selectorText.slice(i + 1, j)
      if (TARGETS.includes(name)) {
        // ГЛУБИНА > 0 — внутри `:not(…)`/`:has(…)`/`:is(…)`. Текстовая замена
        // здесь переворачивает смысл (`:not(:hover)` — «когда НЕ наведено»),
        // поэтому правило целиком уходит в пропущенные. Заметь границу: в
        // `.ds-btn--primary:hover:not(:disabled)` — а так записана добрая
        // половина интерактивных правил системы — цель на глубине 0, а внутри
        // скобок стоит `:disabled`, который нам не цель. Такое правило
        // переписывается, и обязано: пропусти мы его, форс не красил бы ничего
        // из того, ради чего заведён.
        if (depth > 0) {
          return { kind: 'skipped', reason: `:${name} внутри функционального псевдокласса` }
        }
        self += attr(name)
        prefix += attr(name)
        touched = true
        i = j
        continue
      }
      put(selectorText.slice(i, j))
      i = j
      continue
    }
    put(ch)
    i++
  }
  flush()

  if (!parts.length) return { kind: 'none' }
  const out: string[] = []
  for (const p of parts) {
    out.push(p.self)
    out.push(`${p.prefix} ${p.bare}`)
  }
  return { kind: 'rewritten', selector: out.join(', ') }
}

/**
 * Правило в том виде, в каком его читает обход. Утиный тип, а не `CSSRule`:
 * обход проверяется на своём дереве правил в vitest, где настоящего CSSOM нет
 * (jsdom его разбирает лишь отчасти и на `@container` спотыкается), а
 * проверять надо ИМЕННО обход — рекурсию внутрь `@media`/`@container`.
 */
export interface RuleLike {
  cssText?: string
  selectorText?: string
  style?: { cssText?: string } | null
  cssRules?: ArrayLike<RuleLike> | null
  /** `@import`: лист, на который правило ссылается. */
  styleSheet?: { cssRules?: ArrayLike<RuleLike> | null } | null
  /** Условие у `@import url(…) print` — иначе пустая строка. */
  media?: { mediaText?: string } | null
}

export interface ForceScan {
  /** Текст листа форса. Пустой — законный результат, если правил нет. */
  css: string
  /** Обойдено правил-стилей. Без этого числа «пропущено: 0» ничего не значит. */
  scanned: number
  /** Дало дубликат. */
  matched: number
  /** Есть интерактивный псевдокласс, но разобрать не взялись. */
  skipped: number
  /** Листов, не отдавших `cssRules` (чужой origin — у нас таких быть не должно). */
  opaque: number
}

function walk(rules: ArrayLike<RuleLike>, out: string[], acc: ForceScan): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!
    const nested = rule.cssRules

    // `@import` — НЕСУЩИЙ случай, а не экзотика: `src/styles.css` это список
    // импортов, и весь CSS системы (включая все интерактивные правила) лежит
    // ЗА ними. Плоский проход по листу кадра увидел бы полтора десятка
    // `@import` и ни одного правила — счётчик обойдённых показал бы ноль, а
    // форс молча не красил бы ничего.
    if (rule.styleSheet) {
      let imported: ArrayLike<RuleLike> | null | undefined
      try {
        imported = rule.styleSheet.cssRules
      } catch {
        acc.opaque++
        continue
      }
      if (!imported) continue
      const media = rule.media?.mediaText ?? ''
      const inner: string[] = []
      walk(imported, inner, acc)
      if (!inner.length) continue
      out.push(media ? `@media ${media} {\n${inner.join('\n')}\n}` : inner.join('\n'))
      continue
    }

    // ПРЕЛЮДИЯ ЧИТАЕТСЯ ТОЛЬКО У ГРУППОВЫХ. `cssText` браузер не хранит — он
    // сериализует правило на каждое чтение, и на 1028 правилах системы это
    // сериализация всего CSS целиком: замер до правки — 20.8 мс при бюджете 16,
    // после — вчетверо меньше. Правилу-стилю прелюдия не нужна вовсе: у него
    // есть `selectorText`, а тело берётся из `style.cssText` и только у тех
    // ста с небольшим, что дали дубликат.
    const nestedText =
      nested && nested.length && typeof rule.cssText === 'string' ? rule.cssText : ''
    const brace = nestedText.indexOf('{')
    const prelude = brace === -1 ? nestedText.trim() : nestedText.slice(0, brace).trim()

    if (nested && nested.length && GROUPING.test(prelude)) {
      // РЕКУРСИЯ ОБЯЗАТЕЛЬНА. Плоский проход по `cssRules` пропустил бы ровно
      // интересное: `@media (hover: none)` и `@media (prefers-reduced-motion)`
      // в восьми компонентах и `@container` у DataTable. Форс «работал бы» на
      // всём, кроме того, ради чего в кадре вообще заведён отдельный вьюпорт.
      const inner: string[] = []
      walk(nested, inner, acc)
      if (inner.length) out.push(`${prelude} {\n${inner.join('\n')}\n}`)
      continue
    }

    // `@keyframes` сюда и попадает: у него есть `cssRules`, но прелюдия не
    // групповая, а `selectorText` нет ни у него, ни у его шагов (`keyText`).
    // Форсировать в анимации нечего, и лезть внутрь незачем.
    if (typeof rule.selectorText !== 'string') continue

    acc.scanned++

    if (nested && nested.length) {
      // Вложенный CSS (`&`) — у правила есть и селектор, и дети. Разбирать его
      // этот обход не берётся: сегодня в `src` такого нет (стили плоские), а
      // молча взять только верхние объявления значило бы соврать про остальные.
      // Считаем пропущенным — тем же счётчиком, что и `:not(:hover)`: появится
      // вложенность — число перестанет быть нулём, и это будет видно.
      acc.skipped++
      continue
    }

    const rewrite = rewriteSelector(rule.selectorText)
    if (rewrite.kind === 'skipped') {
      acc.skipped++
      continue
    }
    if (rewrite.kind === 'none') continue
    acc.matched++
    out.push(`${rewrite.selector} { ${rule.style?.cssText ?? ''} }`)
  }
}

/**
 * Обход листов. Один раз на загрузку кадра: результат — одна строка, дальше
 * переключение форса это запись атрибута, и CSSOM больше не трогается вовсе.
 * Сценарий «частое переключение убьёт 60 FPS» не наступает, потому что частое
 * переключение не делает работы.
 */
export function scanSheets(sheets: Iterable<{ cssRules?: ArrayLike<RuleLike> | null }>): ForceScan {
  const acc: ForceScan = { css: '', scanned: 0, matched: 0, skipped: 0, opaque: 0 }
  const out: string[] = []
  for (const sheet of sheets) {
    let rules: ArrayLike<RuleLike> | null | undefined
    try {
      rules = sheet.cssRules
    } catch {
      // Лист с чужого origin не отдаёт правила и бросает SecurityError.
      // У кадра таких нет (все стили свои), но молчать про необойдённый лист
      // нельзя — иначе «пропущено 0» означало бы «мы туда не смотрели».
      acc.opaque++
      continue
    }
    if (!rules) continue
    walk(rules, out, acc)
  }
  acc.css = out.join('\n')
  return acc
}

export interface ForceInstall extends ForceScan {
  /**
   * Время НАСТОЯЩЕГО обхода — того, чьим итогом является этот лист. У вызова,
   * взявшего готовое из кэша, это число прежнее, а не ноль: бюджет 16 мс —
   * утверждение про обход, и печатать вместо него честный ноль повторного
   * вызова значило бы показывать в панели «уложились» там, где никто никуда
   * не ходил. Различает эти два случая соседнее поле `cached`.
   */
  ms: number
  /** Лист взят из кэша, обхода в этом вызове не было. */
  cached: boolean
}

/**
 * Кэш собранной строки — на модуль, то есть на документ кадра (у каждого
 * `<iframe>` свой экземпляр модуля). Обход и так идёт один раз на загрузку,
 * поэтому кэш здесь не про скорость: он про то, чтобы ПОВТОРНЫЙ вызов
 * (переустановка листа последним, пересборка кадра в режиме сетки) не платил
 * заново и не врал новым числом. Сбрасывается снаружи — `resetForceCache()`,
 * и единственный сегодняшний повод для сброса — горячая замена стилей в
 * разработке: правка CSS доедет до кадра сама, а ДУБЛИКАТ останется прежним.
 */
let cache: { scan: ForceScan; ms: number } | null = null

export function resetForceCache(): void {
  cache = null
}

/**
 * Собрать лист форса и вставить его ПОСЛЕДНИМ в `<head>`.
 *
 * Последним — потому что дубликат равен оригиналу по специфичности (см. шапку
 * файла), и порядок здесь не стилевая опрятность, а весь механизм целиком.
 * Собственный лист из обхода исключается по узлу, а не по содержимому: иначе
 * второй вызов переписывал бы уже переписанное.
 */
export function installForce(doc: Document): ForceInstall {
  const existing = doc.getElementById(FORCE_STYLE_ID)
  const cached = cache !== null
  if (!cache) {
    const own = existing instanceof HTMLStyleElement ? existing.sheet : null
    const sheets: CSSStyleSheet[] = []
    for (const sheet of Array.from(doc.styleSheets)) {
      if (sheet === own) continue
      sheets.push(sheet)
    }
    const started = performance.now()
    const scan = scanSheets(sheets)
    cache = { scan, ms: performance.now() - started }
  }
  const { scan, ms } = cache

  const style = existing instanceof HTMLStyleElement ? existing : doc.createElement('style')
  style.id = FORCE_STYLE_ID
  style.textContent = scan.css
  // `appendChild` на уже вставленном узле ПЕРЕНОСИТ его в конец — это и нужно:
  // стили кадра приезжают асинхронно (в разработке их вставляет Vite, в сборке
  // это `<link>`), и лист форса, собранный до них, оказался бы не последним.
  doc.head.appendChild(style)

  return { ...scan, ms, cached }
}

/**
 * Состояния из адреса кадра в значение атрибута.
 *
 * В адресе — через запятую (как `layers`), в атрибуте — через пробел: `~=`
 * ищет слово в списке, разделённом пробелами. Неизвестные имена ОТБРАСЫВАЮТСЯ,
 * а не едут в атрибут: в атрибуте они молча не значили бы ничего, и `?force=hoverr`
 * читался бы как «форс включён, но не красит» — то есть как поломка механизма.
 */
export function forceAttrValue(force: string | null | undefined): string | null {
  if (!force) return null
  const states = force
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ForceState => (TARGETS as readonly string[]).includes(s))
  return states.length ? states.join(' ') : null
}
