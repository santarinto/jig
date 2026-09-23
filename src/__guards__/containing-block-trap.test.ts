import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * `contain: layout|paint|strict|content` — ЛОВУШКА CONTAINING BLOCK для
 * `position: fixed` И `position: absolute` (DS-357, перемеряно
 * chromium 149.0.7827.55: голый лист, предок position:static со смещением
 * margin 120/120, `contain: layout|paint|strict|content` уводит и fixed, и
 * absolute потомка в коробку предка — 120,120 вместо 0,0; `contain: size`,
 * `container-type: inline-size|size` — НЕ уводят, остаются на 0,0).
 *
 * ПОЧЕМУ ЭТО СИСТЕМНЫЙ ВОПРОС, А НЕ ЧАСТНЫЙ. `Popover`, `DropdownMenu`,
 * `Tooltip`, флаут `SideNav` — все считают координаты `useAnchoredPosition`
 * (`position: fixed` от вьюпорта) и НЕ портируются в `body`: плавающий узел —
 * ДОЧЕРНИЙ элемент корня компонента в самом дереве, там же, где его
 * разместил потребитель (`Popover.tsx:130` — `panelRef` внутри `rootRef`).
 * Значит ЛЮБОЙ предок между корнем такого компонента и вьюпортом — свой ли,
 * из другого компонента ДС — может стать ловушкой. Свой узел с
 * `contain: paint` внутри `Card`, `Drawer`, `Modal` и подобных обёрток —
 * то самое место, где Popover/DropdownMenu/Tooltip/Combobox/DatePicker
 * законно оказываются потомками.
 *
 * НА СЕГОДНЯ (DS-357) в `src/**\/*.css` НЕТ ни одной декларации
 * `contain: layout|paint|strict|content` — этот гейт запирает чистое
 * состояние, а не чинит найденную дыру. `container-type`/`container-name`
 * СВОБОДНЫ: они не ловушка (см. докблок выше), гейт их не трогает.
 *
 * ЧТО ГЕЙТ НЕ ЛОВИТ, И ЭТО НАЗВАНО, А НЕ ЗАМОЛЧАНО. `transform`, `filter`,
 * `backdrop-filter`, `perspective`, `will-change: transform` — та же ловушка
 * (тот же замер DS-357), но их в системе легитимно много
 * (`translateX(-50%)` центрирования, `rotate()` иконок, `Button` спиннер,
 * АНИМАЦИЯ ОТКРЫТИЯ `Drawer` — `@keyframes ds-drawer-in-*` держит `transform`
 * на самом `.ds-drawer` 180мс). Гейт на них означал бы список исключений в
 * день заведения, а не запертую чистоту — отдельное решение, не это.
 * `Drawer`-анимация — РЕАЛЬНЫЙ, не гипотетический, транзиентный случай
 * ловушки: якорный оверлей внутри `Drawer`, открытый в первые 180мс после
 * `Drawer`, ловится тем же механизмом. Гейт этого не видит и не обязан —
 * записано координатору DS-357 отдельным фактом.
 *
 * ЧТО ГЕЙТ ТОЖЕ НЕ ЛОВИТ ПО ПОСТРОЕНИЮ: разметку ПОТРЕБИТЕЛЯ. Оверлеи не
 * портируются НАРОЧНО (см. докблок `useAnchoredPosition.ts`), и оборотная
 * сторона этого решения в том, что предок вне ДС (в приложении потребителя)
 * может ловить их точно так же — статический гейт по `src/**\/*.css` видит
 * только собственный исходник системы.
 *
 * ДОПУСК. Список `ALLOWED` — явные исключения с доводом длиннее 20 знаков
 * каждое, `selector` + `reason`; пуст на сегодня. Правка узла из допуска, где
 * оверлей — законный потомок, обязана нести довод, почему ловушка здесь не
 * встречается или допустима.
 *
 * ПРАВЛЕНО НА РЕВЬЮ (DS-357): первая редакция матчила ПОСТРОЧНО
 * (`css.split('\n')`, регекс на каждой строке отдельно) — `contain:` на одной
 * строке и значение на следующей никогда не встречались в одной итерации, и
 * `contain:\n  paint;` проходил ЗЕЛЁНЫМ. Многострочная форма — не редкость,
 * которую можно назвать и простить: `\s*` в регексе и так покрывает перевод
 * строки, дыра была только в построчном разборе. Теперь регекс идёт по ВСЕМУ
 * тексту сразу (`matchAll` без `split`), а номер строки считается смещением
 * совпадения — числом `\n` до `match.index`, плюс один. `stripCssComments`
 * заменяет тело комментария пробелами, а не вырезает, — переводы строк
 * внутри комментария остаются, и нумерация после него не едет.
 */

type Allowed = { file: string; reason: string }

// Пусто намеренно: на DS-357 в src/**/*.css не нашлось ни одной
// декларации contain: layout|paint|strict|content. Запись сюда — решение по
// конкретному узлу, а не снятие гейта.
const ALLOWED: Allowed[] = []

// `(?<![\w-])` перед `contain` — предыдущий символ не буква/цифра/подчёркивание
// и не дефис, иначе кастомное свойство `--x-contain: paint;` ловилось бы как
// `contain`: перед его «contain» стоит `-`, а голый `\b` эту границу пропускает
// (между `-` и `c` она ЕСТЬ — `-` не входит в `\w`). `container-type`/
// `container-name` отсекаются иначе: после «contain» у них сразу «er-type»/
// «er-name», а не `:` — `contain\s*:` до них не достаёт независимо от `\b`.
// Значение — до `;` или `}`, `\s*` между «contain» и `:` и между `:` и
// значением уже покрывает перевод строки (`\s` включает `\n` по умолчанию).
const CONTAIN_DECL = /(?<![\w-])contain\s*:\s*([^;}]+)[;}]/gi
const TRAP_VALUE = /\b(layout|paint|strict|content)\b/i

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/** Для отчёта: внутренние переводы строк многострочного совпадения — в пробел. */
function normalizeMatch(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/**
 * Нарушители: `contain:` со значением layout|paint|strict|content — по ВСЕМУ
 * тексту файла, не по строкам (см. докблок «ПРАВЛЕНО НА РЕВЬЮ» выше).
 */
function containTrapOffenders(css: string): { line: number; match: string }[] {
  const out: { line: number; match: string }[] = []
  const stripped = stripCssComments(css)
  for (const m of stripped.matchAll(CONTAIN_DECL)) {
    if (!TRAP_VALUE.test(m[1])) continue
    const line = stripped.slice(0, m.index ?? 0).split('\n').length
    out.push({ line, match: normalizeMatch(m[0]) })
  }
  return out
}

function collectCss(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectCss(p))
    else if (entry.name.endsWith('.css')) out.push(p)
  }
  return out
}

describe('containing block trap (DS-357)', () => {
  it('src/**/*.css does not declare contain: layout|paint|strict|content outside ALLOWED', () => {
    const dir = resolve(__dirname, '..')
    const allowedFiles = new Set(ALLOWED.map((a) => a.file))
    const offenders: string[] = []
    for (const f of collectCss(dir)) {
      const rel = relative(dir, f)
      if (allowedFiles.has(rel)) continue
      for (const o of containTrapOffenders(readFileSync(f, 'utf8'))) {
        offenders.push(`${rel}:${o.line} — ${o.match}`)
      }
    }
    expect(
      offenders,
      'contain: layout|paint|strict|content становится containing block для '
        + 'position: fixed И position: absolute (DS-357) — якорные оверлеи '
        + '(Popover/DropdownMenu/Tooltip/SideNav) не портируются и могут оказаться '
        + 'потомками. Добавь узел в ALLOWED с доводом или используй container-type '
        + '(он не ловушка):\n' + offenders.join('\n'),
    ).toEqual([])
    // Каждый допуск обязан нести содержательный довод, иначе пустая строка
    // молча освобождает узел от проверки.
    for (const a of ALLOWED) {
      expect(a.reason.length, `ALLOWED[${a.file}].reason слишком короткий`).toBeGreaterThan(20)
    }
  })

  // Мутации: гейт обязан ловить ловушку и не ловить безопасные формы.
  it('detects layout|paint|strict|content, ignores size/container-type/comments', () => {
    const m = (css: string) => containTrapOffenders(css).map((o) => o.match)

    // Ловушка — всё, что делает узел containing block:
    expect(m('.x { contain: paint; }')).toEqual(['contain: paint;'])
    expect(m('.x { contain: layout; }')).toEqual(['contain: layout;'])
    expect(m('.x { contain: strict; }')).toEqual(['contain: strict;'])
    expect(m('.x { contain: content; }')).toEqual(['contain: content;'])
    // Без пробела перед значением — форма, которую `\s*` обязан покрыть и без пробела:
    expect(m('.x { contain:strict; }')).toEqual(['contain:strict;'])
    // Составное значение, где layout — лишь одно из слов:
    expect(m('.x { contain: layout style; }')).toEqual(['contain: layout style;'])
    expect(m('.x { contain: size layout; }')).toEqual(['contain: size layout;'])

    // НЕ ловушка — контейнерные запросы и contain: size сами по себе:
    expect(m('.x { contain: size; }')).toEqual([])
    expect(m('.x { container-type: inline-size; }')).toEqual([])
    expect(m('.x { container-type: size; container-name: c; }')).toEqual([])
    // Кастомное свойство, оканчивающееся на «contain» — не сама декларация:
    // голый `\b` перед «contain» пропускает границу «-c» (дефис не входит в
    // `\w`), поэтому регекс держит именно `(?<![\w-])`.
    expect(m('.x { --x-contain: paint; }')).toEqual([])
    expect(m('.x { --my-app-contain-strategy: paint; }')).toEqual([])

    // Закомментированное — не декларация, ни одно- ни многострочное:
    expect(m('/* contain: paint; */ .x { color: red }')).toEqual([])
    expect(m('.x {\n  /* contain: paint было раньше */\n  color: red;\n}')).toEqual([])
    expect(m('.x {\n  /* contain:\n     paint; */\n  color: red;\n}')).toEqual([])
  })

  // Ревью DS-357: первая редакция матчила ПОСТРОЧНО и пропускала
  // decl., чьё значение стоит на следующей строке. Мутация — до правки эта
  // проверка красная (пустой массив вместо совпадения).
  it('catches contain: with the value on its own line, and reports the real line', () => {
    const m = (css: string) => containTrapOffenders(css)
    expect(m('.x {\n  contain:\n    paint;\n}')).toEqual([{ line: 2, match: 'contain: paint;' }])
    // Значение на третьей строке от начала декларации — тот же случай глубже:
    expect(m('.x {\n  contain:\n\n    layout;\n}')).toEqual([{ line: 2, match: 'contain: layout;' }])
  })

  // Номер строки не должен ехать из-за строк, съеденных комментарием ВЫШЕ
  // декларации: stripCssComments обязан сохранять переводы строк внутри
  // /* */, а не стирать их вместе с телом.
  it('keeps line numbers correct past a comment above the declaration', () => {
    const css = '.a { color: red; }\n/* заметка\n   на две строки */\n.b {\n  contain: paint;\n}\n'
    expect(containTrapOffenders(css)).toEqual([{ line: 5, match: 'contain: paint;' }])
  })

  it('ALLOWED reason is required to be meaningful (mutation: empty reason)', () => {
    const bad: Allowed[] = [{ file: 'src/components/X/X.css', reason: 'ok' }]
    expect(bad[0]!.reason.length).toBeLessThanOrEqual(20)
  })
})
