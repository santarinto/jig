import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import ts from 'typescript'
import { TARGET_ACT } from '../../workbench/gate-predicates.js'

/**
 * Узел с ДЕЙСТВУЮЩИМ обработчиком указателя либо опознаётся замером сам (тег,
 * роль), либо ОБЪЯВЛЯЕТ себя целью атрибутом `data-ds-target` (DS-353).
 *
 * ЗАЧЕМ. `scanTargets` («Цель клика» в `make measure` и в матрице) спрашивает
 * DOM селектором `TARGET_SEL`. Спросить DOM, висит ли обработчик, нельзя
 * вовсе: React вешает слушателя на корень контейнера, и ни атрибута `onclick`,
 * ни свойства на узле не остаётся — назначение снаружи НЕ ВИДНО. Значит
 * `<span onClick>` без тега и роли мимо замера едет молча: не мал, не велик,
 * не перекрыт — его просто нет в кадре. Мутация «крестик 20×20» на такой цели
 * остаётся зелёной, и починка не проверяется ничем.
 *
 * ПОЧЕМУ ГЕЙТ, А НЕ КОНВЕНЦИЯ. Шапка `workbench/gate-predicates.ts` завела
 * объявление на DS-346 и там же назвала цену вслух: обход исходника
 * нашёл ещё девять узлов с действующим обработчиком мимо предиката. Крестик
 * `FormTabs` прожил так всё время своей жизни, а комментарий в `Tree.css`
 * полтора года УТВЕРЖДАЛ про шеврон «судится по 24px», не судясь ни разу.
 * Забывают молча — ровно то, что гейт и держит.
 *
 * ЧТО СЧИТАЕТСЯ УЗЛОМ, и почему обход именно такой:
 * - HOST-элемент, то есть имя тега с малой буквы. `<Button onClick>` — проп
 *   компонента, а куда компонент его повесит, решает он сам и судится в своём
 *   файле;
 * - обработчик из `POINTER` — только указатель. `onKeyDown`, `onChange`,
 *   `onFocus` к размеру цели отношения не имеют;
 * - ГЛУШИТЕЛЬ — не назначение. `onClick={(e) => e.stopPropagation()}` не
 *   делает НИЧЕГО: он мешает событию всплыть к настоящей цели (`<td>` с
 *   флажком внутри кликабельной строки). Требовать объявления от него значило
 *   бы заводить цель там, где нажимать нечего. Тело из одних
 *   `stopPropagation()`/`preventDefault()` — глушитель; любой другой вызов
 *   рядом (`{ e.stopPropagation(); onToggleExpand(id) }`) — уже действие;
 * - тег и роль сверяются с `TARGET_ACT`, РАЗОБРАННЫМ ИЗ НЕГО ЖЕ, а не со
 *   вторым списком в этом файле. Две копии разошлись бы молча, и гейт судил
 *   бы не то, что меряет замер.
 *
 * РАЗБОР — ПО AST, не регуляркой: `className`, `role` и обработчик лежат в
 * одном теге через переносы и комментарии на двадцать строк (`<tr>` в
 * `DataTable`), и «то же в пределах `[^>]*`» врёт в обе стороны.
 *
 * ГРАНИЦА. Гейт судит ИСХОДНИК, а не кадр: он говорит «этот узел замеру не
 * виден», и не говорит ничего о том, какого он размера. Размер — дело
 * `make measure`, и объявление ровно туда узел и отдаёт.
 */

const ROOT = resolve(__dirname, '../..')
const COMPONENTS = resolve(ROOT, 'src/components')
const TOKENS = resolve(ROOT, 'tokens/tokens.css')
const CASE_TARGETS = resolve(ROOT, 'scripts/case-targets.mjs')

const rel = (f: string) => relative(ROOT, f).split('\\').join('/')

/** Указатель, и только он: размер цели — вопрос про палец и мышь. */
const POINTER = new Set(['onClick', 'onPointerDown', 'onPointerUp', 'onMouseDown', 'onMouseUp', 'onDoubleClick'])

/** Имя атрибута CSS → имя пропа JSX. Остальные совпадают. */
const JSX_ATTR: Record<string, string> = { tabindex: 'tabIndex', class: 'className' }

/**
 * Одна ветка `TARGET_ACT`, разобранная: `a[href]` — тег плюс обязательный
 * атрибут, `[role=row][tabindex]` — роль плюс обязательный атрибут.
 *
 * `:not(...)` отбрасывается, и это названный предел: единственное такое
 * условие — `input:not([type=hidden])`, а скрытый `input` коробки не имеет,
 * то есть целью не бывает ни при каком объявлении.
 */
interface Clause { tag: string | null; role: string | null; needs: string[] }

const CLAUSES: Clause[] = TARGET_ACT.split(',').map((s) => s.trim()).filter(Boolean).map((part) => {
  const bare = part.replace(/:not\([^)]*\)/g, '')
  const tag = /^([a-z][a-z0-9]*)/.exec(bare)?.[1] ?? null
  let role: string | null = null
  const needs: string[] = []
  for (const [, name, , value] of bare.matchAll(/\[([a-zA-Z-]+)(=([^\]]+))?\]/g)) {
    if (name === 'role') role = value ?? null
    else needs.push(JSX_ATTR[name!] ?? name!)
  }
  return { tag, role, needs }
})

interface Candidate {
  file: string
  line: number
  tag: string
  /**
   * АДРЕС УЗЛА в списке ниже: первый `ds-`-литерал `className` БЕЗ `--`, а у
   * узла без такого литерала — имя тега.
   *
   * Модификатор в адрес не годится, и это не вкус. Строка `DataTable` несёт
   * только условные `ds-table__row--even` и `--muted`: возьми гейт первый
   * попавшийся литерал — и запись про КЛИКАБЕЛЬНУЮ СТРОКУ адресуется
   * чередованием фона. Уберут зебру — запись покраснеет протухшей, хотя про
   * её предмет не изменилось ничего, и чинить пойдут не то.
   */
  key: string
  /** Все `ds-`-литералы `className` — для читаемого адреса в отказе. */
  classes: string[]
  handlers: string[]
  /** Текст значения `tabIndex`, как он написан; `null` — атрибута нет. */
  tabIndex: string | null
}

/**
 * Тело обработчика — одни только `stopPropagation()`/`preventDefault()`.
 *
 * Стрелка разбирается, ссылка на функцию (`onClick={close}`) — нет: что
 * делает названная функция, здесь не видно, и молчаливое «наверное, гасит»
 * было бы ровно той дырой, ради которой гейт заведён. Ссылка считается
 * действием.
 */
function isMuffler(init: ts.JsxAttributeValue | undefined): boolean {
  if (!init || !ts.isJsxExpression(init) || !init.expression) return false
  const fn = init.expression
  if (!ts.isArrowFunction(fn)) return false
  const body = ts.isBlock(fn.body) ? [...fn.body.statements] : [fn.body]
  const calls: ts.Node[] = []
  for (const s of body) {
    if (ts.isExpressionStatement(s)) calls.push(s.expression)
    else if (!ts.isStatement(s)) calls.push(s)
    else return false
  }
  if (calls.length === 0) return false
  return calls.every((c) => ts.isCallExpression(c) && ts.isPropertyAccessExpression(c.expression)
    && (c.expression.name.text === 'stopPropagation' || c.expression.name.text === 'preventDefault')
    && c.arguments.length === 0)
}

function collect(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...collect(p))
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.') && !e.name.includes('.fixture.')) out.push(p)
  }
  return out
}

const FILES = collect(COMPONENTS).sort()

/** Файлы, в которых обход не нашёл НИ ОДНОГО host-элемента: разбор мёртв. */
const BLIND: string[] = []
let hostSeen = 0

const CANDIDATES: Candidate[] = []
for (const f of FILES) {
  const src = readFileSync(f, 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let inFile = 0
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningLikeElement(node)) {
      const tag = node.tagName.getText()
      if (/^[a-z]/.test(tag)) {
        inFile += 1
        hostSeen += 1
        const attrs = new Map<string, ts.JsxAttributeValue | undefined>()
        for (const a of node.attributes.properties) if (ts.isJsxAttribute(a)) attrs.set(a.name.getText(), a.initializer)
        const handlers = [...attrs.keys()].filter((k) => POINTER.has(k) && !isMuffler(attrs.get(k)))
        if (handlers.length > 0) {
          // Роль берётся только из СТРОКОВОГО литерала. Вычисленная
          // (`role={grid ? 'treegrid' : 'tree'}` у корня `Tree`) значит «здесь
          // не видно», и узел остаётся кандидатом: ошибиться в сторону лишнего
          // разбора дешевле, чем в сторону молчания — лишний узел стоит одной
          // записи с доводом, пропущенный не стоит ничего и ничего не ловит.
          const roleInit = attrs.get('role')
          const role = roleInit && ts.isStringLiteral(roleInit) ? roleInit.text : null
          const known = CLAUSES.some((c) =>
            (c.tag === null || c.tag === tag)
            && (c.role === null || c.role === role)
            // Ветка, разобранная в пустоту, матчила бы всё подряд и обнулила
            // бы обход молча. Её саму ловит отдельный случай ниже; здесь она
            // просто не судит. `[data-ds-target]` — ветка БЕЗ тега и роли, но
            // с обязательным атрибутом, и это ровно объявление.
            && (c.tag !== null || c.role !== null || c.needs.length > 0)
            && c.needs.every((n) => attrs.has(n)))
          if (!known) {
            const classes: string[] = []
            const literals = (x: ts.Node): void => {
              if ((ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) && x.text.startsWith('ds-')) classes.push(x.text)
              x.forEachChild(literals)
            }
            const cls = attrs.get('className')
            if (cls) literals(cls)
            const tabInit = attrs.get('tabIndex')
            CANDIDATES.push({
              file: rel(f),
              line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              tag,
              key: classes.find((c) => !c.includes('--')) ?? tag,
              classes,
              handlers,
              tabIndex: attrs.has('tabIndex') ? (tabInit ? tabInit.getText() : '') : null,
            })
          }
        }
      }
    }
    node.forEachChild(visit)
  }
  visit(sf)
  if (inFile === 0) BLIND.push(rel(f))
}

/** Числа из `tokens/tokens.css`: `calc(Nrem * var(--ds-ui-scale))` и голые px. */
const PX_PER_REM = 16
const tokens = readFileSync(TOKENS, 'utf8')
function tokenPx(name: string): number | null {
  const v = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(tokens)?.[1]?.trim()
  if (v === undefined) return null
  const rem = /^calc\(([\d.]+)rem \* var\(--ds-ui-scale\)\)$/.exec(v)
  if (rem) return Number(rem[1]) * PX_PER_REM
  const px = /^([\d.]+)px$/.exec(v)
  return px ? Number(px[1]) : null
}

/**
 * Шкалы матрицы — из `scripts/case-targets.mjs`, а не из памяти. Не нашлась
 * строка — отказ ПО ИМЕНИ: подставленное «ну, 0.875» пережило бы добавление
 * шкалы 0.75 и утверждало бы про пол на шкале, которой замер уже не ходит.
 */
const SCALES: number[] = (() => {
  const m = /^const SCALES = \[([^\]]+)\]/m.exec(readFileSync(CASE_TARGETS, 'utf8'))
  return m ? m[1]!.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)) : []
})()

/**
 * Узлы, которым объявление НЕ НУЖНО, поимённо и с доводом.
 *
 * Ключ — файл плюс первый `ds-`-литерал `className` без `--` (у узла без такого
 * литерала — имя тега, как у кликабельной строки `DataTable`). Каждая запись обязана совпасть РОВНО С ОДНИМ
 * кандидатом: ноль — запись протухла и молча разрешает несуществующее, два и
 * больше — ключ не адресует, а приблизительно указывает.
 *
 * `holds` — довод, который может перестать быть верным от правки в другом
 * месте. Такой довод проверяется, а не пересказывается: запись краснеет сама,
 * когда исчезает то, на чём она стояла.
 */
interface Exempt {
  file: string
  key: string
  why: string
  holds?: (c: Candidate) => string | null
}

const EXEMPT: Exempt[] = [
  {
    file: 'src/components/Drawer/Drawer.tsx',
    key: 'ds-drawer__overlay',
    why: 'ПОВЕРХНОСТЬ УХОДА, а не цель: нажатие по фону закрывает панель. Размера у неё нет —'
      + ' она весь экран, промахнуться мимо неё нельзя, а углы её у Drawer накрыты самой панелью,'
      + ' то есть объявление дало бы ЛОЖНОЕ `unhittable` вместо факта',
  },
  {
    file: 'src/components/Modal/Modal.tsx',
    key: 'ds-modal__overlay',
    why: 'ПОВЕРХНОСТЬ УХОДА, как и у Drawer: закрытие по фону во весь экран. Мерить у неё'
      + ' 24×24 нечего, а попадание по ней — не вопрос: мимо экрана указателя не бывает',
  },
  {
    file: 'src/components/Tabs/Tabs.tsx',
    key: 'ds-tabs__list',
    why: 'ДЕЛЕГИРОВАНИЕ: `onPointerUp` висит на контейнере `role=tablist`, а целями являются'
      + ' кнопки вкладок внутри — они судятся замером сами, тегом `button`. Объявив контейнер,'
      + ' мы завели бы вторую цель поверх настоящих и вдобавок увели бы его из `scrollers`',
  },
  {
    file: 'src/components/Tabs/Tabs.tsx',
    key: 'ds-tabs__item',
    why: 'ЖЕСТ: `onPointerDown` начинает перетаскивание вкладки. Действие вкладки живёт на'
      + ' кнопке внутри, и она же цель; у жеста цели нет — его ведёт рука, а не попадание',
  },
  {
    file: 'src/components/Tree/Tree.tsx',
    key: 'ds-tree',
    why: 'ЖЕСТ: корень несёт `onPointerDown`/`Move`/`Up` перетаскивания узлов. Цели дерева —'
      + ' строки `role=treeitem`, они в `TARGET_ACT` и судятся поимённо',
  },
  {
    file: 'src/components/EventCalendar/EventCalendar.tsx',
    key: 'ds-eventcal__cols',
    why: 'ЖЕСТ: тяга по сетке выделяет интервал. Цели — слоты `[role=gridcell]` внутри,'
      + ' они судятся отдельно, а сетка целиком — область жеста, а не область попадания',
  },
  {
    file: 'src/components/Split/Split.tsx',
    key: 'ds-split__bar',
    why: 'УЖЕ СУДИТСЯ, и объявление было бы no-op: узел несёт `tabIndex={0}`, а `TARGET_SEL` —'
      + ' это `TARGET_ACT` ПЛЮС `[tabindex]:not([tabindex="-1"])`, то есть в обход `candidates`'
      + ' ручка попадает и без роли; ширину ей дал `--ds-target-min` на DS-326.'
      + ' Тело задачи 353 считало иначе («separator в TARGET_ACT не входит, мерить её 24 или'
      + ' объявить предел») — проверено, неверно, и запись называет проверенную причину',
    holds: (c) => c.tabIndex === null
      ? 'у ручки больше нет `tabIndex` — она выпала из `TARGET_SEL`, и замер её не видит вовсе:'
        + ' это настоящая дыра, верни `tabIndex={0}` либо объяви `data-ds-target=""`'
      : /-\s*1/.test(c.tabIndex)
        ? `tabIndex=${c.tabIndex}: \`[tabindex="-1"]\` из \`TARGET_SEL\` исключён, ручка выпала из замера`
        : null,
  },
  {
    file: 'src/components/DataTable/DataTable.tsx',
    key: 'tr',
    why: 'ЦЕЛЬ, У КОТОРОЙ РАЗМЕР НЕ ВОПРОС И ПРОМАХ НЕВОЗМОЖЕН: ширина строки — вся таблица,'
      + ' высота не меньше `--ds-h-compact`, и это проверено числом ниже, а не на слово.'
      + ' Отнять у строки нажатие могут только её собственные потомки, а попадание в потомка'
      + ' цели засчитывается цели (`ownerTarget`). Цена объявления при нулевой пользе —'
      + ' по цели на КАЖДУЮ строку КАЖДОЙ таблицы во всех случаях матрицы, плюс расширение'
      + ' прощения накладок через `within`',
    holds: () => {
      const h = tokenPx('--ds-h-compact')
      const floor = tokenPx('--ds-target-min')
      if (h === null || floor === null) {
        return 'не разобрать `--ds-h-compact`/`--ds-target-min` в tokens/tokens.css — довод записи'
          + ' стоит на числе, которого гейт больше не читает'
      }
      if (SCALES.length === 0) {
        return `не найдено \`const SCALES = [...]\` в ${rel(CASE_TARGETS)} — минимальную шкалу замера`
          + ' брать неоткуда, а подставленная тут соврала бы про пол'
      }
      const min = Math.min(...SCALES)
      const got = h * min
      return got >= floor ? null
        : `высота строки ${h}px × минимальная шкала замера ${min} = ${got.toFixed(2)}px, а пол`
          + ` \`--ds-target-min\` = ${floor}px: строка провалилась под порог, и довод «размер не вопрос»`
          + ' больше не верен — либо верни высоту, либо объяви строку `data-ds-target=""`'
    },
  },
]

describe('узел с обработчиком указателя объявлен целью (DS-353)', () => {
  it('обход не выродился: файлы, host-элементы, кандидаты и записи посчитаны', () => {
    console.log(
      `target-declared: ${FILES.length} файлов, ${hostSeen} host-элементов, `
        + `${CANDIDATES.length} кандидатов мимо TARGET_ACT, ${EXEMPT.length} записей, `
        + `${CLAUSES.length} веток TARGET_ACT, шкалы замера [${SCALES.join(', ')}]`,
    )
    // Ноль в любом из четырёх — не чистое дерево, а сломанный обход.
    expect(FILES.length, 'файлов src/components/**/*.tsx').toBeGreaterThan(20)
    expect(hostSeen, 'host-элементов в обходе').toBeGreaterThan(100)
    expect(CANDIDATES.length, 'кандидатов: пустое множество — гейт зелен ни о чём').toBeGreaterThan(0)
    expect(EXEMPT.length, 'записей исключений').toBeGreaterThan(0)
    // Файл, из которого разбор не достал НИ ОДНОГО тега, — молчаливый пропуск:
    // такой файл не «чист», его просто не читали.
    expect(BLIND, `разбор не нашёл ни одного host-элемента: ${BLIND.join(', ')}`).toEqual([])
  })

  it('TARGET_ACT разобран, а не переписан второй копией', () => {
    // Список тегов и ролей здесь не продублирован намеренно: он импортируется
    // из `workbench/gate-predicates.ts`, того самого модуля, который исполняет
    // замер. Проверяется РАЗБОР: ветка без тега и без роли матчила бы всё
    // подряд, и кандидатов не осталось бы вовсе.
    expect(TARGET_ACT.length, 'TARGET_ACT приехал пустым — сломан импорт через границу src → workbench')
      .toBeGreaterThan(50)
    expect(CLAUSES.length, 'веток в TARGET_ACT').toBeGreaterThan(10)
    const empty = CLAUSES.filter((c) => c.tag === null && c.role === null && c.needs.length === 0)
    expect(empty, `ветка TARGET_ACT разобрана в пустоту (${empty.length}) — она матчит любой узел`).toEqual([])
  })

  it('каждый узел с действующим обработчиком указателя виден замеру или назван в списке', () => {
    const listed = new Set(EXEMPT.map((e) => `${e.file}\u0000${e.key}`))
    const offenders = CANDIDATES
      .filter((c) => !listed.has(`${c.file}\u0000${c.key}`))
      .map((c) => `${c.file}:${c.line} — <${c.tag}${c.classes.length ? ` class="${c.classes.join(' ')}"` : ''}>`
        + ` несёт ${c.handlers.join(', ')}, а ни тег, ни роль цели не объявляют: «Цель клика» этот узел`
        + ' НЕ СУДИТ вовсе. Поставь на него `data-ds-target=""` (и тот же атрибут в превью —'
        + ' этого требует `preview-classes`), либо заведи запись в EXEMPT этого гейта с доводом,'
        + ' почему цели здесь нет')
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('каждая запись списка совпадает РОВНО с одним узлом и несёт довод', () => {
    const problems: string[] = []
    for (const e of EXEMPT) {
      const hit = CANDIDATES.filter((c) => c.file === e.file && c.key === e.key)
      if (hit.length === 0) {
        problems.push(`${e.file} → ${e.key}: не совпала ни с одним узлом. Узел исчез, переименовался`
          + ' или уже опознаётся замером сам — запись протухла и молча разрешает несуществующее,'
          + ' сверь ключ (первый `ds-`-литерал className без `--`, у узла без него — имя тега) или убери запись')
      } else if (hit.length > 1) {
        problems.push(`${e.file} → ${e.key}: совпала с ${hit.length} узлами`
          + ` (строки ${hit.map((h) => h.line).join(', ')}) — ключ неоднозначен, и довод накрывает узлы,`
          + ' которых никто не разбирал')
      }
      if (e.why.trim().length < 40) problems.push(`${e.file} → ${e.key}: довод пуст или отписка`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('условные доводы ещё верны: `Split` в TARGET_SEL по tabIndex, строка `DataTable` выше пола', () => {
    const broken: string[] = []
    for (const e of EXEMPT) {
      if (!e.holds) continue
      const hit = CANDIDATES.filter((c) => c.file === e.file && c.key === e.key)
      // Ноль совпадений уже красен предыдущим случаем; здесь молчим, чтобы
      // одна правка не печатала два разных диагноза об одном узле.
      if (hit.length !== 1) continue
      const bad = e.holds(hit[0]!)
      if (bad) broken.push(`${e.file}:${hit[0]!.line} — запись «${e.key}» стояла на условии, которого больше нет: ${bad}`)
    }
    expect(broken, broken.join('\n')).toEqual([])
  })
})
