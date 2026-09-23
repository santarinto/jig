import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import ts from 'typescript'

/**
 * Каждый тип «действия» в каталоге объявлен ЧЕРЕЗ `ActionBase`
 * (`src/internal/action.ts`), а не своим независимым набором полей
 * (DS-361, слой 1 по JIG-17, ПОСЛЕ DS-358 — судить нечего,
 * пока ядра нет).
 *
 * ЗАЧЕМ. До 4.3.x одно и то же — «кнопка с иконкой, подписью и обработчиком» —
 * было объявлено ЧЕТЫРЬМЯ независимыми наборами полей (докблок `action.ts`).
 * Разошлись не злым умыслом, а по одному за раз — каждый писался под свой
 * компонент и выглядел разумно. Без проверки пятый заведут через месяц тем же
 * способом, и разойдётся он снова по мелочи (`onClick` против `onSelect`,
 * `ariaLabel` против `label`) — то есть незаметно, компилируясь.
 *
 * СУДИМ ПО ОБЪЯВЛЕНИЮ, ЧЕРЕЗ AST — НЕ ПО ИМЕНИ ТИПА И НЕ РЕГУЛЯРКОЙ ПО
 * ТЕКСТУ. Имя ненадёжно в обе стороны: `RowTreeNode` и `TreeNode` в этом
 * репозитории уже показали цену суждения по имени (`src/index.ts:69-75`).
 * Комментарии не считаются — тип судится по членам и по heritage/intersection,
 * а не по тому, что о нём написано рядом. Полного тайпчекера не нужно: разбора
 * `ts.createSourceFile` хватает, потому что «выведен из ActionBase» — синтаксический
 * факт (идентификатор `ActionBase` стоит в heritage clause, в intersection или
 * первым аргументом `Omit`/`Pick`), а не факт совместимости типов.
 *
 * ДВА НЕЗАВИСИМЫХ МЕХАНИЗМА, и оба обязательны — один не покрывает то, что
 * ловит другой:
 *
 * 1. ОБЩИЙ ОБХОД `src/**`. Кандидат — интерфейс или алиас типа, у которого
 *    среди СОБСТВЕННЫХ членов (объявленных прямо в теле — не унаследованных,
 *    не пришедших через ссылку на другой тип) есть поле-подпись (`label` |
 *    `ariaLabel`) И поле-обработчик выбора (`onSelect` | `onClick`). Ловит
 *    НОВЫЙ тип, заведённый мимо ядра где угодно в дереве (мутация 1).
 *
 * 2. ЗАСТАВА НА `action.ts`. Каждое объявление в `src/internal/action.ts`,
 *    кроме самого `ActionBase` и перечислений вроде `ActionTone` (union
 *    строковых литералов — не форма действия вовсе), обязано быть выведено из
 *    `ActionBase` или стоять в `EXEMPT` с доводом. Механизм (1) не видит
 *    `CommandAction`: `ActionBase & { variant?, group?, href? }` не
 *    ПЕРЕОБЪЯВЛЯЕТ `label`/`onSelect` — они приходят из intersection, а не
 *    лежат в собственном теле, — так что если снять `ActionBase &` и НЕ
 *    вписать поля руками, `CommandAction` перестаёт быть кандидатом (1) вовсе,
 *    хотя это ровно тот регресс, ради которого гейт заведён. Застава (2) судит
 *    по МЕСТУ (это канонический модуль ядра), а не по форме собственных полей,
 *    и молчаливую деградацию такого рода ловит именно она.
 *
 * ДЫРА, НАЙДЕННАЯ РЕВЬЮ (DS-361, круг 2): на HEAD все пять судимых
 * (`RowAction`/`CardTool`/`DropdownAction`/`CommandAction`/`LegacyAction`)
 * живут в `action.ts` и приходят через заставу (2) — значит санитары «судимых
 * > 0» и «выведенных судимых > 0» остаются зелёными, даже если МЕХАНИЗМ (1)
 * ВЫКЛЮЧЕН ЦЕЛИКОМ (`SIG_FIELDS = new Set([])`). Число на живом дереве не
 * умеет отличить «обход нашёл кандидата» от «кандидата перекрыла застава» —
 * это ровно ловушка «санитар не на том, что лжёт» (`docs/writing-checks.md`,
 * п.5) поверх «правда не о том» (п.4). ЛЕКАРСТВО — канарейка ПО ЛИТЕРАЛУ
 * (там же, п.7): суждение вынесено в чистые функции `parseDecls` →
 * `computeDerived`/`computeJudged` → `classify`, склеенные в `analyze`, и
 * ОДНА И ТА ЖЕ `analyze` прогоняется и на живом дереве (`LIVE_SOURCES`, читает
 * файлы `src/**`), и на литеральных исходниках-строках `CANARY_SOURCES`, вовсе
 * не лежащих в `src/`. Другой путь для канарейки проверял бы её копию, а не
 * механизм, который меняют мутацией.
 *
 * СУЖЕНИЯ ПРОПСОВ КОМПОНЕНТА — НЕ ОПИСАТЕЛИ ДЕЙСТВИЯ, хотя механически бывают
 * кандидатами (1): `GlobalSearchProps` несёт СОБСТВЕННЫЕ `label?: string` и
 * `onSelect?: (id) => void` — не сужение действия, а пропсы строки поиска.
 * Различаем не суффиксом имени (`*Props` — конвенция, не гарантия) и не одной
 * позицией параметра, а тем, что ФУНКЦИЯ — КОМПОНЕНТ: тип стоит типом первого
 * параметра функции (объявления, стрелки или выражения) в ЭТОМ ЖЕ файле, И
 * тело функции несёт JSX-узел (`JsxElement`/`JsxSelfClosingElement`/
 * `JsxFragment`) — либо вторым генериком `forwardRef<Ref, Props>`. Проверка на
 * JSX — тоже решение по ОБЪЯВЛЕНИЮ, не по заглавной букве имени: функция без
 * JSX в теле, чей первый параметр назван похоже на пропсы (найдено ревью,
 * DS-361 круг 2: `function Foo(a: MyActionLikeType) { return a.label }`
 * рядом с типом `{label, onSelect}` в одном файле), остаётся судимой и красной
 * — она не компонент, а простая функция над данными действия. `forwardRef` в
 * кодовой базе сейчас не встречается (React 19, `ref` — обычный проп), эта
 * ветка держится ради будущего и ничего не стоит.
 *
 * ГРАНИЦА ДЕРИВАЦИИ — ПО ИМЕНИ, НЕ ПО ИМПОРТУ. `derived` — глобальный набор
 * имён с неподвижной точкой (интерфейс/алиас с полем-ссылкой на уже выведенное
 * имя сам становится выведенным), без разрешения импортов: два разных типа с
 * одинаковым именем в разных файлах делили бы вывод. В этом репозитории имена
 * действий не повторяются (проверено обходом при заведении гейта), и полный
 * граф импортов стоил бы дороже, чем эта проверка когда-либо поймает —
 * типовой чекер и есть тот инструмент, который эту цену уже не оправдывает.
 *
 * EXEMPT — ЗАКОННЫЕ ИСКЛЮЧЕНИЯ, `Record<имя, довод>`. Единственная запись —
 * `LegacyAction`: РАСПОЗНАЁТ старую форму вызова (`id`/`ariaLabel`/`onClick`)
 * внутри `assertAction`, а не описывает настоящее действие системы; вывести её
 * из `ActionBase` значило бы узаконить форму, которую функция как раз бракует.
 * `FormTab` (`FormTabs.tsx`) и `Tab` (`Tabs.tsx`) сюда НЕ включены и включать
 * не нужно: `{ id, label, disabled? }` не несёт поля-обработчика вовсе — это
 * пункт выбора, а не действие (решение DS-363), и он никогда не
 * становится кандидатом ни одним из двух механизмов. Запись про
 * несуществующего кандидата в `EXEMPT` — красная (мутация 4): решение
 * DS-363 задокументировано в `AGENTS.md`, а не подделкой записи здесь.
 */

const ROOT = resolve(__dirname, '../..')
const SRC = resolve(ROOT, 'src')
const CORE_FILE = 'src/internal/action.ts'
const CORE_NAME = 'ActionBase'

const rel = (f: string) => relative(ROOT, f).split('\\').join('/')

/** Поле-подпись и поле-обработчик выбора. Список закрыт намеренно: ровно то,
 * что разошлось у четырёх узаконенных сужений (докблок `action.ts`). Инвентарь
 * на заведении гейта (DS-361) не нашёл ни одного члена того же смысла
 * под другим именем — единственный найденный «лишний» кандидат,
 * `GlobalSearchProps`, отсекается объявлением, а не третьим именем здесь. */
const SIG_FIELDS = new Set(['label', 'ariaLabel'])
const HANDLER_FIELDS = new Set(['onSelect', 'onClick'])

function collect(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== '__guards__') out.push(...collect(p)) }
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.') && !e.name.includes('.fixture.')) out.push(p)
  }
  return out
}

/** Исходник как ДАННЫЕ: живое дерево читает `{file, text}` с диска, канарейка
 * несёт то же самое литералом — один и тот же `analyze` не различает, откуда
 * пара взялась. */
interface VirtualSource { file: string; text: string }

interface Decl {
  file: string
  line: number
  name: string
  kind: 'interface' | 'type'
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration
}

function parseDecls(sources: VirtualSource[]): { decls: Decl[]; sourceFiles: Map<string, ts.SourceFile> } {
  const decls: Decl[] = []
  const sourceFiles = new Map<string, ts.SourceFile>()
  for (const { file, text } of sources) {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    sourceFiles.set(file, sf)
    const visit = (node: ts.Node): void => {
      if (ts.isInterfaceDeclaration(node)) {
        decls.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, name: node.name.text, kind: 'interface', node })
      } else if (ts.isTypeAliasDeclaration(node)) {
        decls.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, name: node.name.text, kind: 'type', node })
      }
      node.forEachChild(visit)
    }
    visit(sf)
  }
  return { decls, sourceFiles }
}

/**
 * Имена в ПОЗИЦИИ ВЫВОДА: heritage clause интерфейса, ветки intersection у
 * алиаса, голая ссылка (`type X = ActionBase`), первый аргумент `Omit`/`Pick`.
 * Собственные члены (`TypeLiteralNode`) сюда НЕ входят — деривация и форма
 * собственных полей две разные вещи, и candidate-механизм судит вторую.
 */
function namesFromHeritageType(t: ts.ExpressionWithTypeArguments): string[] {
  const headText = t.expression.getText()
  if ((headText === 'Omit' || headText === 'Pick') && t.typeArguments?.[0]) return namesFromTypeNode(t.typeArguments[0])
  return [headText]
}
function namesFromTypeNode(t: ts.TypeNode): string[] {
  if (ts.isIntersectionTypeNode(t)) return t.types.flatMap(namesFromTypeNode)
  if (ts.isTypeReferenceNode(t)) {
    const headText = t.typeName.getText()
    if ((headText === 'Omit' || headText === 'Pick') && t.typeArguments?.[0]) return namesFromTypeNode(t.typeArguments[0])
    return [headText]
  }
  return []
}
function derivationRefs(d: Decl): string[] {
  if (d.kind === 'interface') return ((d.node as ts.InterfaceDeclaration).heritageClauses ?? []).flatMap((h) => h.types.flatMap(namesFromHeritageType))
  return namesFromTypeNode((d.node as ts.TypeAliasDeclaration).type)
}

/** Неподвижная точка: имя выведено, если ссылается на `ActionBase` или на
 * уже выведенное имя — так `Omit<ActionBase,'label'> & {...}`, голое `type X
 * = ActionBase` и сужение ВТОРОГО уровня (сужение сужения) считаются
 * одинаково, без второго списка форм. */
function computeDerived(decls: Decl[]): Set<string> {
  const derived = new Set<string>([CORE_NAME])
  for (let guard = 0, changed = true; changed && guard < 20; guard += 1) {
    changed = false
    for (const d of decls) {
      if (derived.has(d.name)) continue
      if (derivationRefs(d).some((n) => derived.has(n))) { derived.add(d.name); changed = true }
    }
  }
  return derived
}

/** Собственные члены — узел объявления, включая `TypeLiteralNode` в любой
 * глубине intersection/`Omit` (`Omit`'у она не нужна — его первый аргумент
 * ссылка, а не литерал), но НЕ то, что приносит ссылка на другой тип. */
function ownMemberNames(d: Decl): Set<string> {
  const names = new Set<string>()
  const fromMembers = (members: ts.NodeArray<ts.TypeElement>) => {
    for (const m of members) {
      if ((ts.isPropertySignature(m) || ts.isMethodSignature(m)) && m.name && ts.isIdentifier(m.name)) names.add(m.name.text)
    }
  }
  if (d.kind === 'interface') fromMembers((d.node as ts.InterfaceDeclaration).members)
  else {
    const visit = (t: ts.Node): void => {
      if (ts.isTypeLiteralNode(t)) fromMembers(t.members)
      t.forEachChild(visit)
    }
    visit((d.node as ts.TypeAliasDeclaration).type)
  }
  return names
}

/** «Форма действия вообще» для заставы `action.ts`: НЕ перечисление строковых
 * литералов (`ActionTone`). Интерфейс — всегда объектный тип. */
function isObjectShaped(d: Decl): boolean {
  if (d.kind === 'interface') return true
  const t = (d.node as ts.TypeAliasDeclaration).type
  if (ts.isUnionTypeNode(t) && t.types.every((m) => ts.isLiteralTypeNode(m))) return false
  return true
}

/** Узел несёт JSX — `ts.forEachChild` останавливается сам на первом true
 * (контракт метода, не самодельная петля). Признак «функция — компонент», а
 * не заглавная буква имени и не суффикс `Props`. */
function containsJsx(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true
  return !!ts.forEachChild(node, containsJsx)
}

/** Имя типа, стоящее ПЕРВЫМ ПАРАМЕТРОМ функции-КОМПОНЕНТА (тело несёт JSX) в
 * том же файле, или вторым генериком `forwardRef`, — пропсы компонента, а не
 * описатель действия. Ключ по файлу: тип-пропс и тип-действие с совпавшим
 * именем в разных файлах друг друга не гасят. Функция БЕЗ JSX в теле (найдено
 * ревью DS-361: `function Foo(a: MyAction) { return a.label }`) не
 * компонент — её первый параметр из исключения не выпадает. */
function computePropsTypeNames(sourceFiles: Map<string, ts.SourceFile>): Map<string, Set<string>> {
  const propsTypeNames = new Map<string, Set<string>>()
  for (const [file, sf] of sourceFiles) {
    const set = new Set<string>()
    const addFromTypeNode = (t: ts.TypeNode | undefined): void => {
      if (t && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) set.add(t.typeName.text)
    }
    const visit = (node: ts.Node): void => {
      if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))
        && node.parameters.length > 0 && node.body && containsJsx(node.body)) {
        addFromTypeNode(node.parameters[0]!.type)
      }
      if (ts.isCallExpression(node)) {
        const calleeText = node.expression.getText()
        if ((calleeText === 'forwardRef' || calleeText.endsWith('.forwardRef')) && node.typeArguments?.[1]) {
          addFromTypeNode(node.typeArguments[1])
        }
      }
      node.forEachChild(visit)
    }
    visit(sf)
    propsTypeNames.set(file, set)
  }
  return propsTypeNames
}

/** Судимые — оба механизма разом, кроме самого ядра и пропсов компонента. */
function computeJudged(decls: Decl[], propsTypeNames: Map<string, Set<string>>): Decl[] {
  const judged: Decl[] = []
  for (const d of decls) {
    if (d.file === CORE_FILE && d.name === CORE_NAME) continue
    if (propsTypeNames.get(d.file)?.has(d.name)) continue
    const m = ownMemberNames(d)
    const generalCandidate = [...SIG_FIELDS].some((s) => m.has(s)) && [...HANDLER_FIELDS].some((h) => m.has(h))
    const coreBackstop = d.file === CORE_FILE && isObjectShaped(d)
    if (generalCandidate || coreBackstop) judged.push(d)
  }
  return judged
}

function classify(judged: Decl[], derived: Set<string>, exempt: Record<string, string>) {
  const offenders = judged.filter((d) => !derived.has(d.name) && !(d.name in exempt))
  const exemptUsed = new Set(judged.filter((d) => !derived.has(d.name) && d.name in exempt).map((d) => d.name))
  return { offenders, exemptUsed }
}

/**
 * ОДИН код суждения — вызывается и на живом дереве, и на канарейке из
 * литеральных строк (`docs/writing-checks.md`, п.7: «посчитай площадь
 * литералом»). Другой путь для канарейки проверял бы её копию, а не механизм,
 * который двигает мутация.
 */
function analyze(sources: VirtualSource[]) {
  const { decls, sourceFiles } = parseDecls(sources)
  const derived = computeDerived(decls)
  const propsTypeNames = computePropsTypeNames(sourceFiles)
  const judged = computeJudged(decls, propsTypeNames)
  return { decls, derived, propsTypeNames, judged }
}

// ---- живое дерево ----------------------------------------------------

const FILES = collect(SRC).sort()
const LIVE_SOURCES: VirtualSource[] = FILES.map((f) => ({ file: rel(f), text: readFileSync(f, 'utf8') }))

const EXEMPT: Record<string, string> = {
  LegacyAction: 'старая форма действия под `any` в `assertAction` (DS-358) — распознаёт ЧУЖУЮ, старую форму'
    + ' вызова (`id`/`ariaLabel`/`onClick`), а не описывает настоящее действие системы. Сама никогда не используется'
    + ' как тип пропа, и вывести её из `ActionBase` значило бы узаконить форму, которую функция как раз бракует',
}

const live = analyze(LIVE_SOURCES)
const { offenders, exemptUsed } = classify(live.judged, live.derived, EXEMPT)
const derivedJudged = live.judged.filter((d) => live.derived.has(d.name))
const propsNamesTotal = [...live.propsTypeNames.values()].reduce((n, s) => n + s.size, 0)

// ---- канарейка по литералу (ревью DS-361, п.1) ------------------
//
// Живые числа (191/283/5/4/140) не двигаются, если МЕХАНИЗМ (1) выключить
// целиком (`SIG_FIELDS = new Set([])`): все пять судимых на HEAD приходят
// через заставу `action.ts`. Санитары по счёту этого не видят — видит только
// прямой прогон `analyze` на источниках, которых в `src/` вообще нет.
const CANARY_CORE = 'export interface ActionBase {\n  id: string\n  label: string\n  onSelect?: () => void\n}\n'
const CANARY_SOURCES: VirtualSource[] = [
  { file: 'canary/core.ts', text: CANARY_CORE },
  // (а) собственные label + onClick мимо ядра, в файле НЕ action.ts — нарушитель
  {
    file: 'canary/a-own-fields.ts',
    text: 'export interface CanaryOwnFields {\n  id: string\n  label: string\n  onClick: () => void\n}\n',
  },
  // (б) ariaLabel + onSelect() method signature мимо ядра — нарушитель
  {
    file: 'canary/b-method-signature.ts',
    text: 'export interface CanaryMethodSignature {\n  id: string\n  ariaLabel: string\n  onSelect(): void\n}\n',
  },
  // (в) Omit<ActionBase,'label'> & {label: string; onSelect: () => void} — чист
  {
    file: 'canary/c-legal-omit.ts',
    text: 'import type { ActionBase } from \'../core.js\'\nexport type CanaryLegalOmit = Omit<ActionBase, \'label\'> & {\n'
      + '  label: string\n  onSelect: () => void\n}\n',
  },
  // сужение первого уровня, нужное для (г)
  {
    file: 'canary/d1-row-action.ts',
    text: 'import type { ActionBase } from \'../core.js\'\nexport type CanaryRowAction = Omit<ActionBase, \'label\'> & {\n'
      + '  label: string\n  onSelect: () => void\n}\n',
  },
  // (г) выведен ТРАНЗИТИВНО через CanaryRowAction, не напрямую из ActionBase — чист
  {
    file: 'canary/d2-transitive.ts',
    text: 'import type { CanaryRowAction } from \'./d1-row-action.js\'\nexport type CanaryTransitive = Omit<CanaryRowAction, \'icon\'> & {\n'
      + '  label: string\n  onSelect: () => void\n}\n',
  },
  // (д) {id, label, disabled?} без обработчика, форма FormTab — не кандидат вовсе
  {
    file: 'canary/e-selection-item.ts',
    text: 'export interface CanarySelectionItem {\n  id: string\n  label: string\n  disabled?: boolean\n}\n',
  },
  // случай ревьюера (п.2): собственные поля действия, хозяин без JSX в теле —
  // НЕ компонент, тип обязан остаться судимым и стать нарушителем
  {
    file: 'canary/f-fake-props.ts',
    text: 'export type CanaryFakeProps = { label: string; onSelect: () => void }\n'
      + 'export function CanaryFoo(a: CanaryFakeProps) { return a.label }\n',
  },
]
const canary = analyze(CANARY_SOURCES)
const { offenders: canaryOffenders } = classify(canary.judged, canary.derived, {})
const canaryOffenderNames = new Set(canaryOffenders.map((d) => d.name))
const canaryJudgedNames = new Set(canary.judged.map((d) => d.name))

describe('каждый тип действия объявлен через ActionBase (DS-361)', () => {
  it('обход не выродился: файлы, объявления, кандидаты и вывод посчитаны', () => {
    console.log(
      `action-shape: ${FILES.length} файлов, ${live.decls.length} объявлений, ${live.judged.length} судимых, `
        + `${derivedJudged.length} выведенных, ${live.derived.size} имён в неподвижной точке, `
        + `${propsNamesTotal} имён-пропсов компонента, ${Object.keys(EXEMPT).length} записей EXEMPT`,
    )
    // Пороги ниже фактических чисел на момент заведения (191 файл, 283 объявления,
    // 5 судимых, 4 выведенных без EXEMPT, 140 имён-пропсов) — сломанный обход
    // (пустой glob, урезанный SRC) даёт ноль или около и красит гейт, а не
    // проходит тихо мимо предмета. Эти санитары ловят СЛОМАННЫЙ ОБХОД дерева;
    // жив ли механизм (1) как таковой, они не доказывают — это работа канарейки ниже.
    expect(FILES.length, 'файлов src/**/*.ts(x)').toBeGreaterThan(150)
    expect(live.decls.length, 'interface/type алиасов').toBeGreaterThan(200)
    expect(live.judged.length, 'судимых объявлений: пусто — обход не дошёл ни до чего').toBeGreaterThan(0)
    // Требование задачи буквально: гейт обязан падать, если КАНДИДАТОВ,
    // ВЫВЕДЕННЫХ из ActionBase, нашлось ноль — иначе сломанный обход зелёный.
    expect(derivedJudged.length, 'судимых, выведенных из ActionBase: ноль — обход сломан либо деривация не читается').toBeGreaterThan(0)
    expect(propsNamesTotal, 'имён типов, использованных первым параметром компонента: обход function/forwardRef сломан').toBeGreaterThan(50)
  })

  it('канарейка по литералу: механизм 1 сам ловит новый тип мимо ядра, независимо от живого дерева (ревью DS-361)', () => {
    // Источники — литеральные строки, не файлы src/: числа выше эту проверку
    // подделать не могут, потому что канарейка их вообще не читает.
    expect([...canaryOffenderNames].sort(), 'нарушители канарейки (а/б — собственные поля мимо ядра, ж — фальшивые пропсы)')
      .toEqual(['CanaryFakeProps', 'CanaryMethodSignature', 'CanaryOwnFields'])
    expect(canaryJudgedNames.has('CanaryLegalOmit'), '(в) легальный Omit — судим').toBe(true)
    expect(canaryOffenderNames.has('CanaryLegalOmit'), '(в) легальный Omit — не нарушитель').toBe(false)
    expect(canaryJudgedNames.has('CanaryTransitive'), '(г) транзитивно через CanaryRowAction — судим').toBe(true)
    expect(canaryOffenderNames.has('CanaryTransitive'), '(г) транзитивно через CanaryRowAction — не нарушитель').toBe(false)
    expect(canaryJudgedNames.has('CanarySelectionItem'), '(д) без обработчика, форма FormTab — не кандидат вовсе').toBe(false)
  })

  it('каждый узел-кандидат живого дерева либо выведен из ActionBase, либо назван в EXEMPT', () => {
    const offenderMessages = offenders.map((d) => {
      const own = ownMemberNames(d)
      const sig = [...SIG_FIELDS].filter((s) => own.has(s))
      const handler = [...HANDLER_FIELDS].filter((h) => own.has(h))
      // Общий обход нашёл СОБСТВЕННЫЕ поля мимо ядра; застава `action.ts`
      // может поймать объявление и без них (`CommandAction` без `ActionBase &`
      // не РЕСТАВИРУЕТ label/onSelect вовсе) — сообщение не выдумывает поля,
      // которых нет, а называет место.
      const shape = sig.length > 0 || handler.length > 0
        ? `несёт поле-подпись (${sig.join('/')}) и поле-обработчик (${handler.join('/')})`
        : `объявлен в каноническом модуле ядра (${CORE_FILE}), где каждое непустое объявление обязано выводиться`
      return `${d.file}:${d.line} — \`${d.name}\` ${shape} МИМО \`ActionBase\`. `
        + 'Выведи его: `Omit<ActionBase, \'label\'> & { label: string, onSelect: () => void }` — законная форма '
        + `(как \`RowAction\`), либо добавь запись в EXEMPT этого файла с доводом длиннее 20 знаков.`
    })
    expect(offenderMessages, offenderMessages.join('\n')).toEqual([])
  })

  it('EXEMPT: каждая запись совпадает с реальным неунаследованным судимым и несёт содержательный довод', () => {
    const problems: string[] = []
    for (const [name, why] of Object.entries(EXEMPT)) {
      if (!exemptUsed.has(name)) {
        problems.push(`EXEMPT.${name}: не нашлось судимого объявления с этим именем, которое не выводится из`
          + ' ActionBase — тип исчез, переименовался или стал выводиться сам. Запись протухла, убери её или сверь имя')
      }
      if (why.trim().length < 20) problems.push(`EXEMPT.${name}: довод пуст или отписка`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })
})
