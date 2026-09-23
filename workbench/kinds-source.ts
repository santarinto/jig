/**
 * Вид фикстуры (`kind`) — ИЗ ИСХОДНИКА, без исполнения модуля (DS-67).
 *
 * Карта видов нужна панели, чтобы предлагать в позицию только совместимые
 * начинки. Раньше кадр строил её загрузкой ВСЕХ модулей фикстур: на тринадцати
 * фикстурах это тринадцать динамических импортов, каждый исполняет модуль
 * компонента со всеми его стресс-данными — и всё это ровно в тот момент, когда
 * человек ждёт список. Здесь та же карта читается разбором текста.
 *
 * РАЗБОР, А НЕ РЕГУЛЯРКА. Слово `kind:` встречается в фикстуре по пять-восемь
 * раз — у каждой крутилки своё (`tone: { kind: 'enum' }`), — и верхнее среди
 * них ничем не помечено.
 *
 * Замерено, а не предположено: сегодня регулярка «первое `kind:` в файле»
 * вернула бы ВЕРНЫЙ ответ на всех тринадцати фикстурах, потому что во всех
 * тринадцати `kind` объявлен выше блока `controls`. Это не оправдание
 * регулярки, а её приговор: она была бы зелёной сейчас и соврала бы на первой
 * же фикстуре, где порядок другой, — молча. `'enum'` не проходит `fitsSlot`,
 * счётчик совместимых просто стал бы меньше, и никто бы не связал одно с
 * другим. Санитар различает этот случай на входе, подобранном нарочно:
 * `kinds-source.test.ts`, «kind крутилки ВЫШЕ по файлу».
 *
 * ЧЕГО ЗДЕСЬ НЕТ: догадок. Всё, что не сводится к строковому литералу верхнего
 * уровня (вычисленный `kind`, спред чужой шапки, отсутствие `export default`),
 * едет как `unread` — «вид не прочитан», а не как «вида нет». Разница
 * существенная: `fitsSlot(accepts, undefined)` истинно, то есть «вида нет»
 * пускает фикстуру КУДА УГОДНО. Молча выдать это за прочитанный ответ значило
 * бы предлагать блочный компонент в строчную ячейку и не сказать ни слова.
 */
import ts from 'typescript'
import type { SlotKind } from '../src/internal/fixture.js'

/** Прочитанный вид, либо честный отказ. */
export type KindRead = { kind?: SlotKind } | { unread: true }

/**
 * Таблицей, а не списком строк: `Record<SlotKind, …>` требует ПОЛНОГО набора,
 * и новый вид в `SlotKind` сломает компиляцию здесь. Список строк принял бы
 * новый вид молча — и разбор считал бы его «не прочитан», то есть новая
 * фикстура тихо предлагалась бы в любую позицию.
 */
const SLOT_KINDS: Record<SlotKind, true> = { inline: true, block: true, any: true }

/**
 * Разворачивает выражение до объектного литерала шапки фикстуры.
 *
 * Формы, которые встречаются и обязаны читаться: `defineFixture<P>({…})`
 * (все тринадцать сегодняшних фикстур), голый `export default {…}` и
 * `export default f` при `const f = defineFixture({…})` выше. Обёртки
 * `as`/`satisfies`/скобки снимаются — они ничего не меняют в составе.
 *
 * `depth` не декоративен: `const a = b; const b = a` даёт бесконечный спуск, а
 * упасть здесь значит уронить дев-сервер на чужой опечатке.
 */
function objectOf(
  expr: ts.Expression,
  sf: ts.SourceFile,
  depth = 0,
): ts.ObjectLiteralExpression | null {
  if (depth > 8) return null
  if (ts.isObjectLiteralExpression(expr)) return expr
  if (ts.isParenthesizedExpression(expr)) return objectOf(expr.expression, sf, depth + 1)
  if (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr))
    return objectOf(expr.expression, sf, depth + 1)
  if (ts.isNonNullExpression(expr)) return objectOf(expr.expression, sf, depth + 1)
  // `defineFixture<P>({…})` — шапка всегда первый аргумент. Второго у него нет,
  // и угадывать «какой-нибудь объектный аргумент» здесь нельзя: это уже догадка.
  if (ts.isCallExpression(expr))
    return expr.arguments.length > 0 ? objectOf(expr.arguments[0]!, sf, depth + 1) : null
  if (ts.isIdentifier(expr)) {
    const name = expr.text
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer)
          return objectOf(d.initializer, sf, depth + 1)
      }
    }
  }
  return null
}

/** Имя свойства строкой — и `kind:`, и `'kind':`. Вычисленные имена не читаются. */
function propName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name)) return name.text
  return null
}

/**
 * Вид фикстуры из текста её модуля.
 *
 * Возвращает `{}` — «вида нет, объявления не было» — только когда шапка
 * прочитана целиком и `kind` в ней действительно отсутствует. Во всех
 * остальных случаях `{ unread: true }`.
 */
export function readFixtureKind(source: string): KindRead {
  const sf = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  const def = sf.statements.find(
    (st): st is ts.ExportAssignment => ts.isExportAssignment(st) && !st.isExportEquals,
  )
  if (!def) return { unread: true }

  const obj = objectOf(def.expression, sf)
  if (!obj) return { unread: true }

  let found: ts.PropertyAssignment | null = null
  for (const p of obj.properties) {
    // Спред чужой шапки (`...base`) может принести `kind`, которого в тексте
    // здесь нет вовсе. Читать состав спреда — значит разрешать импорты, то есть
    // возвращаться к исполнению модулей, от которого вся задача и уходит.
    if (ts.isSpreadAssignment(p)) return { unread: true }
    if (!ts.isPropertyAssignment(p)) {
      // `kind` сокращённой записью или методом — форма, которую этот разбор не
      // читает. Молчать про неё нельзя по той же причине, что про вычисленную.
      if (propName(p.name as ts.PropertyName) === 'kind') return { unread: true }
      continue
    }
    const n = propName(p.name)
    // ВЫЧИСЛЕННОЕ имя (`['kind']: 'block'`, `[K]: …`) — «не прочитан», а не
    // «чужое свойство, идём дальше». Пропустить его значило бы ответить «вида
    // нет» на шапку, где вид, возможно, объявлен: `fitsSlot(accepts, undefined)`
    // истинно, и блочная фикстура поехала бы в строчную позицию без пометки —
    // ровно та тишина, которую этот модуль обещает не производить.
    if (n === null) return { unread: true }
    if (n === 'kind') found = p
  }

  if (!found) return {}
  const v = found.initializer
  if (!ts.isStringLiteral(v)) return { unread: true }
  // `hasOwnProperty`, а не `in`: `'toString' in SLOT_KINDS` истинно по цепочке
  // прототипов, и `kind: 'toString'` проехало бы как настоящий вид.
  const known = Object.prototype.hasOwnProperty.call(SLOT_KINDS, v.text)
  return known ? { kind: v.text as SlotKind } : { unread: true }
}

/**
 * Группа фикстуры из текста её модуля (DS-152).
 *
 * Тем же разбором и по тому же доводу, что `kind`: список компонентов
 * группируется тем, что фикстуры УЖЕ про себя говорят, а не второй
 * классификацией рядом. Источник правды один — шапка фикстуры; протухнуть
 * нечему, потому что копии нет.
 *
 * ОТДЕЛЬНОЙ ФУНКЦИЕЙ, а не полем в `KindRead`. `unread` у вида означает вполне
 * определённое: «вид не прочитан, и потому нельзя решать, куда фикстура
 * годится». У группы такого следствия нет — непрочитанная группа это просто
 * заголовок «прочее», и смешивать два разных отказа в одном значении значило бы
 * заставить читателя гадать, про что он.
 *
 * `null` — «не прочитана», и заголовок это честно называет. Догадок здесь нет
 * ровно по той же причине, что у вида: вычисленное имя, спред чужой шапки и
 * нестроковое значение дают `null`, а не выдуманную группу.
 */
export function readFixtureGroup(source: string): string | null {
  const sf = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  const def = sf.statements.find(
    (st): st is ts.ExportAssignment => ts.isExportAssignment(st) && !st.isExportEquals,
  )
  if (!def) return null

  const obj = objectOf(def.expression, sf)
  if (!obj) return null

  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) continue
    if (propName(p.name) !== 'group') continue
    // Пустая строка — не группа: заголовок из пустоты читался бы как поломка
    // разметки, а не как «группа не названа».
    return ts.isStringLiteral(p.initializer) && p.initializer.text.trim() !== ''
      ? p.initializer.text
      : null
  }
  return null
}
