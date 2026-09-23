/**
 * Предикаты гейтов, которые читают СНАРУЖИ (DS-222).
 *
 * ЗАЧЕМ. У браузерного агента нет чекаута: он видит только адреса. Санитар
 * случая «Цель клика» (число пропущенных прокручиваемых областей) он поэтому
 * ВОСПРОИЗВОДИЛ по описанию из промта — получил 5 и ту же поимённую пятёрку,
 * что и прогон гейта. Совпадение приближения с точным ответом остаётся
 * приближением: оно ничего не доказывает и разойдётся молча, как только промт
 * отстанет от кода (на приёмке DS-282 промт уже ошибся дважды).
 *
 * Отсюда форма решения: не «отдать файл», а ОДИН МОДУЛЬ НА ДВОИХ. Гейт
 * исполняет ровно то, что отдаёт адрес `/api/gate/predicate/target-size`
 * (`workbench/gate-plugin.ts`), и тождество здесь ПО ПОСТРОЕНИЮ, а не по
 * проверке: копии, которой можно разойтись, просто нет.
 *
 * ПОЧЕМУ В `workbench`, А НЕ В `scripts`. Отсюда его берут оба: плагин
 * дев-сервера — обычным импортом (vite отдаёт его транформированным по
 * `/@fs`), а `scripts/measure-invariants.mjs` — через esbuild (`bundle:`),
 * тем же приёмом, которым уже берёт `workbench/force-states.ts`. Обратно не
 * получается: `.mjs` в `scripts` из TS-плагина без объявлений не импортируется.
 *
 * В ПАКЕТ НЕ ВХОДИТ: `workbench/` не собирается в `dist` вовсе.
 */

import { readablePath } from './culprit-path.js'

/**
 * Что несёт ДЕЙСТВИЕ указателя: тег или роль так и говорят.
 *
 * Отдельно от голой фокусируемости намеренно. Цель по SC 2.5.8 — область,
 * принимающая указатель ДЛЯ ДЕЙСТВИЯ, а `[tabindex]` этого не обещает.
 *
 * РОЛИ С РОУМИНГОМ (DS-330). Роуминг (`src/internal/roving.ts`) ставит
 * `tabindex="-1"` всем членам группы, кроме одного, и `TARGET_SEL` с его
 * `:not([tabindex="-1"])` видел ровно одну цель из группы: у `Tree/base` —
 * одну строку из пяти, у слотов `EventCalendar` — один слот из сетки. Поэтому
 * роли, которые каталог несёт с действием и роумингом, перечислены здесь:
 * - `treeitem` — строка `Tree`, клик выбирает узел;
 * - `row` и `gridcell` — ТОЛЬКО с атрибутом `tabindex` (любым, `-1` тоже):
 *   так роуминг метит члена группы. Строка табличного `Tree` (`treegrid`)
 *   принимает клик сама — её ячейки обработчика не несут и атрибута тоже;
 *   слот `EventCalendar` (`gridcell`, нажатие создаёт событие) атрибут несёт.
 *   Строка-заголовок и ячейка статичной таблицы атрибута не несут — и не
 *   цели. `[role]` целиком не берётся: роль без действия — не цель.
 *
 * ОБЪЯВЛЕННАЯ ЦЕЛЬ `[data-ds-target]` (DS-346). Крестик вкладки
 * `FormTabs` (`span.ds-formtabs__close`) принимает нажатие — и тегом, и ролью
 * молчит: роли у него нет намеренно (DS-175), а поставить её нельзя,
 * потому что он лежит ВНУТРИ `button.ds-formtabs__label`, и кнопка в кнопке
 * запрещена гейтом `no-nested-interactive`. Мимо предиката он ехал в обоих
 * указателях: мутация «крестик 20×20 в сенсорной ветке» осталась зелёной,
 * хотя ветка `@media (hover: none)` показывает его на ВСЕХ вкладках, то есть
 * палец тапает именно по нему.
 *
 * Спросить DOM, висит ли обработчик, нельзя: React вешает слушателя на корень
 * контейнера, и ни атрибута `onclick`, ни свойства на узле не остаётся —
 * снаружи назначение НЕ ВИДНО ВООБЩЕ. Поэтому оно ОБЪЯВЛЯЕТСЯ. Не именем
 * класса (санитар `TARGET_ACT` запрещает `.ds-` намеренно: поимённое
 * исключение — реестр разрешённых нарушений), а атрибутом назначения, который
 * читается одинаково у любого компонента.
 *
 * ЦЕНА ЛЮБОГО ЧЛЕНА ЭТОГО СПИСКА, названная здесь потому, что из имени
 * константы её не видно: он решает не только, КОГО судят, но и КОМУ ПРОЩАЮТ.
 * `ownerTarget` отдаёт ближайшую цель под углом, а накладка прощается, если её
 * коробка лежит целиком внутри судимой (`within`). Объявив мелкий узел, мы
 * делаем хозяина угла глубже и мельче — то есть проходящим `within` ЧАЩЕ, и
 * чужое перекрытие перестаёт быть нарушением. Померено юнитом «объявление
 * УГЛУБЛЯЕТ `ownerTarget`»: тот же кадр без атрибута даёт соседа в
 * `unhittable`, с атрибутом — пустой список. Отсюда же: `targetExempt` читает
 * `TARGET_ACT`, так что объявленный узел перестаёт быть «прокручиваемой
 * областью, которая не цель», — для делегирующего контейнера с `overflow:auto`
 * это значило бы уехать из `scrollers` в `total`, а санитар `measure` роняет
 * случай при нулевых `scrollers`.
 *
 * ОБЪЯВЛЯЕТ ПРИСУТСТВИЕ, а не значение: `data-ds-target="false"` — такая же
 * цель, и React печатает `data-ds-target={false}` именно этой строкой. Условное
 * объявление пишется `cond ? '' : undefined`, а не булевым значением.
 *
 * ОБЪЯВЛЕНИЕ ПОКА ДЕРЖИТ ЧЕЛОВЕК, и это названо вслух. Обход исходника нашёл
 * ещё девять узлов с действующим обработчиком мимо предиката — из них четыре
 * цели (`Tree` шеврон 16×16 и флажок, строка `DataTable`, ручка `Split`), —
 * и один из них про себя уже УТВЕРЖДАЕТ, что судится по 24px (`Tree.css:31`),
 * не судясь ни разу. Разобрать их поимённо и завести гейт, который требует
 * атрибут, — DS-353: там у каждого своя цена в замере, и списком на
 * один присест это дешевле, чем по узлу за задачу.
 */
export const TARGET_ACT = 'button, a[href], input:not([type=hidden]), select, textarea, summary,'
  + ' [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch],'
  + ' [role=menuitem], [role=option], [role=link], [role=treeitem],'
  + ' [role=row][tabindex], [role=gridcell][tabindex], [data-ds-target]'

/** Ячейка сетки — нижний слой виджета, см. `corners`. */
const GRID_CELL = '[role=gridcell]'

/** Всё, что вообще может оказаться целью: действие плюс голая фокусируемость. */
export const TARGET_SEL = `${TARGET_ACT}, [tabindex]:not([tabindex="-1"])`

const scrolls = (v: string): boolean => v === 'auto' || v === 'scroll'

/**
 * ПРОКРУЧИВАЕМАЯ ОБЛАСТЬ — НЕ ЦЕЛЬ (DS-207, вместе с 192).
 *
 * Исключение по ФОРМЕ, а не по имени: элемент фокусируем ТОЛЬКО через
 * `tabindex` (ни тега, ни роли действия) и при этом является контейнером
 * прокрутки по вычисленному `overflow`. Клик по нему не делает ничего —
 * `tabindex` стоит ради клавиатуры, чтобы уехавшее вбок содержимое было
 * достижимо без мыши (ровно то, что поставила DS-192 у
 * `.ds-heat__scroll`, `.ds-log__scroll`, `.ds-transcript__scroll`). Требовать
 * от такой области 24px значило бы растить `<pre>` с одной строкой команды
 * ради указателя, которому там нечего нажимать.
 *
 * Поимённого списка тут нет намеренно: имя разрешило бы конкретное нарушение,
 * форма описывает класс.
 */
export function targetExempt(el: Element, cs: CSSStyleDeclaration): boolean {
  return !el.matches(TARGET_ACT) && (scrolls(cs.overflowX) || scrolls(cs.overflowY))
}

/** Цель, про которую есть что сказать: мельче пола или не попадаемая. */
export interface SmallTarget {
  /** Читаемый путь от `.wbf-host` (`readablePath`), а не список классов. */
  path: string
  width: number
  height: number
  /**
   * Углы, видимые во вьюпорте, попали в цель или её потомка.
   * `null` — попадание НЕ СНЯТО, а не «не попасть»: либо ни одного угла во
   * вьюпорте даже после прокрутки, либо цель отключена и по попаданию не
   * судится (такая бывает только в `small`: крупной отключённой сказать
   * нечего, и в `unreachable` она не идёт).
   */
  hit: boolean | null
  /**
   * ЧЕМ НАКРЫТА — только при `hit === false`, иначе поля нет. Первый
   * промахнувшийся угол (TL/TR/BL/BR, порядок обхода), его точка в CSS px
   * вьюпорта ПОСЛЕ `scrollIntoView` (в покое страница может стоять иначе) и
   * читаемый путь узла, который там отдал `elementFromPoint`:
   * `TR (192.0,34.0) div.ds-tabs > button.ds-tabs__scroller`. Сам хост —
   * `.wbf-host`, `null` — «за пределами документа».
   *
   * Дальше через «; » — ЦЕНТР видимой части: `центр (x,y) накрыт <путь>`
   * либо `центр (x,y) — сама цель` (DS-331): угол называет виновника
   * края, центр — цену ячейки. Цель, срезанная в ноль тем, что человек не
   * листает, — вместо угла `вне досягаемости — срезана overflow <x>/<y> у
   * <путь>`.
   *
   * Зачем: прогон гейта и chromium владельца расходятся на метриках текста
   * (ссылка Prose в гейте 238×55, у владельца — в одну строку), так что
   * воспроизвести промах глазами можно не всегда, и причину обязан назвать
   * сам замер. Угол и точка — чтобы путь накрывшего читался не догадкой, а
   * местом.
   */
  coveredBy?: string
}

export interface TargetScan {
  /**
   * Осмотренные цели: всё, что не отброшено невидимостью, инертностью,
   * обрезкой предком в ноль и исключением. Отключённые — в счёте.
   */
  total: number
  /**
   * Цели мельче 24×24. Размер — факт сам по себе, поэтому мелкая цель здесь
   * при ЛЮБОМ `hit` (он едет полем), и в два списка ниже она не попадает:
   * списки не пересекаются, одна цель — одно замечание.
   */
  small: SmallTarget[]
  /** Цели НЕ мельче 24, но по которым не попасть: перекрыты или не принимают указатель. */
  unhittable: SmallTarget[]
  /** Цели НЕ мельче 24, попадание по которым снять не вышло (`hit: null`): причина красная отдельно. */
  unreachable: SmallTarget[]
  /** Пропущенные прокручиваемые области. Не молча: см. санитар в гейте. */
  scrollers: number
  /**
   * Цели в поддереве `[inert]` — не цели (фон под Modal/Drawer), но СЧИТАЮТСЯ:
   * сужение, выпадающее из `total` молча, неотличимо от невидимого обхода.
   */
  inert: number
  /**
   * Цели, обрезанные в покое предком, который сам СХЛОПНУТ в ноль по этой оси
   * (свёрнутая панель), — счётчик того же рода. Только схлопнутый: цель за
   * краем живого клипа — цель, и о ней судят углы (DS-331).
   */
  clipped: number
  /** Сумма сторон — санитар развёртки по шкалам, а не метрика. */
  boxSum: number
}

/**
 * Смещение контейнера (`null` — окна) ДО первой прокрутки обхода, `[left,
 * top]`; `undefined` — неизвестно, и тогда ничего не прощается.
 */
type Rest = (a: Element | null) => readonly [number, number] | undefined

/** Прямоугольник во вьюпортных координатах; пустой, если `l >= r` или `t >= b`. */
interface Rect { l: number; t: number; r: number; b: number }

/**
 * ОБРЕЗАЮЩИЕ ПРЕДКИ цели — снизу вверх, до `.wbf-host` включительно (выше него
 * кадр верстака, а не компонент) или до корня документа. По каждой оси своё:
 * предок обрезает ось, чей вычисленный `overflow` не `visible`. `userX`/`userY`
 * — ось листает ЧЕЛОВЕК (`auto`, `scroll`). `hidden` сюда НЕ входит
 * (DS-331): `scrollIntoView` его двигает, а колесо, палец и полоса — нет,
 * и до этой задачи проба выводила цель из-под `hidden`-клипа сама и судила её
 * «попадаемой» там, где на экране её нет (`Split/base` ×1.5, ручка на x=391
 * при вьюпорте 360). `clip` не листается ничем.
 *
 * `position: fixed` на цепочке обрывает её: fixed-узел выходит из-под клипа
 * всех предков. ПРЕДЕЛ: `absolute` так же выходит из-под клипа предка, не
 * являющегося его содержащим блоком, и здесь этого не видно — такая цель
 * будет обрезана по предку, которого в браузере не касается.
 */
function* clippers(el: Element, doc: Document): Generator<{ a: Element; x: boolean; y: boolean; userX: boolean; userY: boolean }> {
  const view = doc.defaultView!
  if (view.getComputedStyle(el).position === 'fixed') return
  for (let a = el.parentElement; a && a !== doc.documentElement && a !== doc.body; a = a.parentElement) {
    const cs = view.getComputedStyle(a)
    const x = cs.overflowX !== 'visible' && cs.overflowX !== ''
    const y = cs.overflowY !== 'visible' && cs.overflowY !== ''
    if (x || y) yield { a, x, y, userX: scrolls(cs.overflowX), userY: scrolls(cs.overflowY) }
    if (a.classList.contains('wbf-host') || cs.position === 'fixed') return
  }
}

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  return { l: r.left, t: r.top, r: r.right, b: r.bottom }
}

/**
 * ВИДИМАЯ ЧАСТЬ коробки цели: пересечение с коробками обрезающих предков.
 *
 * `atRest` — вопрос «есть ли цель вообще», который задают `candidates` ДО
 * всякой прокрутки: предок обрезает, только если сам СХЛОПНУТ В НОЛЬ по этой
 * оси (свёрнутая панель `Split`), — какой бы ни был его `overflow`. Иначе
 * цель выпадала бы из замера молча: строка таблицы ниже фолда контейнера,
 * хотя прокрутка её достаёт, и — до DS-331 — вкладка `Tabs/closable`
 * за `overflow-x: clip` бара, хотя между ней и клипом лежит листаемый
 * список, и владелец закрыл её крестик с первого нажатия. Правило «только
 * схлопнутый в ноль» было записано в журнале плана 177, а код резал по
 * `clip` всегда: строка итога печатала «обрезано предком в ноль 212 (Tabs
 * 206)», и это был СИМПТОМ, а не законное сужение. Достанет ли цель человек,
 * решают углы (`cornerPoints`), а не этот вопрос. Ответ не зависит от текущих
 * смещений контейнеров, и подпись с замером видят одно множество целей.
 * Без `atRest` — честное пересечение после прокрутки, по которому ставятся
 * углы; `cut` тогда называет предка, срезавшего её в ноль первым.
 */
function visiblePart(el: Element, doc: Document, atRest: boolean, from: Rect = rectOf(el)): Rect & { cut?: Element } {
  const v: Rect & { cut?: Element } = { ...from }
  for (const { a, x, y } of clippers(el, doc)) {
    const c = rectOf(a)
    const cutX = x && (!atRest || c.r - c.l <= 0)
    const cutY = y && (!atRest || c.b - c.t <= 0)
    if (cutX) { v.l = Math.max(v.l, c.l); v.r = Math.min(v.r, c.r) }
    if (cutY) { v.t = Math.max(v.t, c.t); v.b = Math.min(v.b, c.b) }
    if (v.cut === undefined && empty(v)) v.cut = a
  }
  return v
}

const empty = (v: Rect) => v.r - v.l <= 0 || v.b - v.t <= 0

/**
 * ЦЕЛЬ, которой принадлежит узел: ближайший он сам или предок, который
 * `candidates` счёл бы целью по тем же правилам — селектор, не исключение по
 * форме, не инертен; поле внутри `<label>` — это label. Невидимость не
 * проверяется: узел только что вернул `elementFromPoint`.
 */
function ownerTarget(at: Element, doc: Document): Element | null {
  const view = doc.defaultView!
  for (let el = at.closest(TARGET_SEL); el; el = el.parentElement?.closest(TARGET_SEL) ?? null) {
    if (!targetExempt(el, view.getComputedStyle(el)) && !el.closest('[inert]')) {
      return el.tagName === 'INPUT' ? (el.closest('label') ?? el) : el
    }
  }
  return null
}

/** Коробка `inner` целиком внутри `outer` с допуском полпикселя на дробную раскладку. */
const within = (inner: Rect, outer: Rect) =>
  inner.l >= outer.l - 0.5 && inner.t >= outer.t - 0.5 && inner.r <= outer.r + 0.5 && inner.b <= outer.b + 0.5

/**
 * Четыре угла ВИДИМОЙ ЧАСТИ цели попадают в неё саму, в потомка или в
 * накладку. Точка отступает от угла НА РАДИУС скругления ПЛЮС ШИРИНУ РАМКИ
 * своей стороны — то есть ложится в коробку отступов (padding box), а не на
 * рамку.
 *
 * ВИДИМАЯ ЧАСТЬ (DS-177, второй живой прогон) — пересечение коробки с
 * обрезающими предками (`visiblePart`), снятое ПОСЛЕ `scrollIntoView`: вкладка,
 * уехавшая под край списка (`Tabs/trailing`), и подпись шире своего клипа
 * (`FormTabs/many`) — задуманная раскладка, человек жмёт видимую часть, а угол
 * за клипом честно отдавал соседа. Отступ зажат половиной ВИДИМОЙ коробки;
 * РАЗМЕР же судится по полной (`scanTargets`). Пусто после прокрутки — `null`
 * («не измерено»), а не «цели нет»: множество целей решают `candidates` до
 * прокрутки, и подпись обязана видеть то же. ПЛАТА: цель, обрезанная
 * контейнером до 1 px, по попаданию пройдёт.
 *
 * НАКЛАДКА — угол, под которым лежит ДРУГАЯ цель (`ownerTarget`: ближайший
 * узел-или-предок, которого `candidates` сочли бы целью), чья коробка целиком
 * внутри ПОЛНОЙ коробки судимой (допуск 0.5 px), промахом не считается:
 * крестик вкладки, очистка поиска, кнопка календаря в поле. `no-nested-
 * interactive` запрещает вложить кнопку в кнопку, так что накладка соседом —
 * узор самой системы. Цель, НЕ вложенная в коробку (соседнее событие
 * календаря, слот под ним), и НЕ-цель (svg сводной) остаются промахом.
 * Предок-цель той же коробки накладкой не бывает (`!owner.contains(el)`):
 * он и есть цель вокруг судимой. Накладка прощается, только если ЦЕНТР
 * судимой свободен — попадает в неё саму или потомка (DS-333): стопка
 * событий одной ширины (`EventCalendar/dense` ×0.875, x один, сдвиг только по
 * вертикали) кладёт каждое нижнее целиком в коробку верхнего, и «целиком
 * внутри» прощало пять событий, из которых рука открывает одно. Крестик
 * вкладки, очистка поля, кнопка календаря лежат у КРАЯ — центр их хозяина
 * свободен. Центр не во вьюпорте — не прощается: подтвердить нечем. Если под накладками ВСЕ углы во вьюпорте —
 * это одна крышка, а не четыре крестика: промах, `coveredBy` называет первую
 * (обзор 6a–6e, M2).
 *
 * ЗАКРЕПЛЁННЫЙ СЛОЙ (DS-177, четвёртый живой прогон). Угол, чей
 * накрывший узел `position: sticky` сам или через предка ниже общего с целью
 * предка (`stuckOver`), промахом не считается: содержимое уходит под
 * закреплённый хром по определению sticky, и человек его оттуда выкручивает
 * (`ds-formtabs__home`, `ds-pivot__corner`; после прокрутки к центру их стало
 * видно). Прощается УГОЛ, не цель: остальные углы судятся. И только когда
 * цель из-под слоя ВЫКРУЧЕНА (`scrolledUnder`, обзор 6a–6e, M1): ближайший
 * контейнер прокрутки слоя содержит цель, листается по оси слоя и прокручен
 * в сторону его отступа. Слой, лежащий на цели в покое или в чужом
 * контейнере, — обычное перекрытие. ПРЕДЕЛ: сколько именно контейнер обязан
 * пройти, чтобы цель вышла из-под слоя, не меряется — хватает любого
 * смещения в сторону отступа.
 *
 * ПЛАВАЮЩИЙ СЛОЙ (DS-331) — не-sticky узел, который при прокрутке
 * ближайшего листаемого контейнера цели СТОИТ, пока цель едет, причём
 * контейнер уже сдвинут обходом от покоя (`floatsOver`): кнопка «к
 * последнему» `AgentTranscript`, появившаяся оттого, что проба увела ленту с
 * хвоста. Опознаётся по форме, не по `position`: `absolute`, который окно
 * везёт вместе с соседом (раскрытое меню `DropdownMenu`, `ds-eventcal__
 * band-more` внутри своей сетки), остаётся промахом.
 *
 * ЯЧЕЙКА СЕТКИ ПОД ДРУГОЙ ЦЕЛЬЮ (DS-330, прогон после правок 331) —
 * не промах: сетка слотов `EventCalendar` — нижний слой, события лежат над
 * ней по замыслу, и нажатие на занятое время достаётся событию, а не
 * «создать поверх». Судимая — `[role=gridcell]`, накрывший — ЦЕЛЬ
 * (`ownerTarget`); прощается угол, и в «крышку» такие углы не идут. Размер
 * ячейки судится как прежде. Накрыта НЕ-целью — промах; событие над
 * событием (DS-328) — не ячейка, промах. Цена: ячейка, накрытая
 * чужим всплывающим слоем-целью, не ловится.
 *
 * ВНЕ ДОСЯГАЕМОСТИ (DS-331) — все фрагменты срезаны в ноль ПОСЛЕ
 * прокрутки человека (`cornerPoints` возвращает смещения `hidden`) —
 * промах `hit: false` с `coveredBy` «вне досягаемости — срезана overflow
 * <x>/<y> у <путь>». Не `null`: замер снят, и его ответ — на экране цели нет.
 *
 * Радиус — потому что на 1 px точка ложится за дугу `border-radius`, и
 * `elementFromPoint` честно отдаёт родителя (поймано на `Pagination` при 1.5).
 *
 * Рамка — потому что СВЕДЁННАЯ РАМКА соседей (`margin: -1px` в группе,
 * `ToggleGroup`) — приём раскладки, а не перекрытие: при нулевом радиусе
 * точка в 1 px от края ложилась ровно на ту полосу, которую уже накрыл сосед,
 * и крупная попадаемая кнопка приходила «не попасть» (DS-177, первый
 * живой прогон строки 1). ПЛАТА: перекрытие толщиной не больше рамки не видно
 * вовсе — объявленный предел. Перекрытие ТОЛЩЕ рамки, в том числе другой
 * целью, остаётся нарушением: отличить задуманный нахлёст от дефекта форма не
 * может, это разбирается глазом.
 *
 * Отступ по каждой оси — `max(1, радиус) + рамка` своей стороны, зажатый
 * половиной коробки. Радиус берётся наибольший из четырёх, потому что
 * `getComputedStyle` не резолвит проценты: `border-radius: 50%` возвращается
 * строкой «50%», и `parseFloat` даёт 50. Зажим не даёт точке выйти наружу.
 * ПЛАТА: на круглой цели все четыре точки схлопываются в центр, и проверка
 * вырождается в «центр не перекрыт» — объявленный предел, а не дефект.
 *
 * ПОЧЕМУ `scrollIntoView`. `elementFromPoint` работает в координатах ВЬЮПОРТА и
 * на точку за его пределами отдаёт `null`: на кадре 360×640 длинный компонент
 * выносит половину целей за фолд, и без прокрутки каждая пришла бы «не
 * попасть» — пачка ложных нарушений. Растянуть вьюпорт по высоте вместо
 * прокрутки нельзя: высота убирает вертикальную полосу, а полоса отнимает
 * 15 px ширины, и поехали бы числа строки переполнения. Прокрутку окна
 * возвращает `scanTargets`, а не этот помощник: он зовётся на каждую цель.
 *
 * К ЦЕНТРУ, а не `nearest` (DS-177, третий живой прогон). `nearest`
 * прижимает цель ровно к краю области прокрутки, а там и живут плавающие и
 * закреплённые слои: кнопка «к последнему» у `AgentTranscript`, строка итогов
 * в `tfoot` у `PivotTable`. Человек докручивает цель до удобного места, а не
 * до кромки. Если центр выносит за вьюпорт ВСЕ углы (цель шире или выше
 * окна), — к НАЧАЛУ: видны левые/верхние углы, их и судят. ПРЕДЕЛ:
 * закреплённый слой выше половины контейнера накрывает цель и в центре.
 *
 * ФРАГМЕНТЫ. Строчная цель, перенесённая на несколько строк
 * (`getClientRects().length > 1`, ссылка `Prose` ×1.5), — это несколько
 * коробок, а угол общей лежит на соседнем тексте абзаца. Судятся углы
 * КАЖДОГО фрагмента, каждый со своим пересечением с клипом и тем же
 * отступом; промах любого — промах, `coveredBy` называет первый. Размер
 * судится по общей коробке. Отступ на рамку берётся со всех сторон каждого
 * фрагмента (у строчной рамки середина переноса её не несёт) — лишний отступ,
 * а не пропущенный.
 *
 * `null`, а не `false`: цель, у которой даже после прокрутки ни один угол не
 * во вьюпорте (уехала за левый край, куда окно не листается), замером не
 * видна. Выдать её за перекрытую значило бы обвинить компонент в том, чего
 * замер не видел.
 *
 * `pointer-events: none` особым случаем НЕ разбирается: браузер такой узел в
 * `elementFromPoint` пропускает и отдаёт то, что под ним, — то есть цель
 * приходит «не попасть» тем же путём, что и перекрытая. У ОТКЛЮЧЁННОЙ цели,
 * где `pointer-events: none` задуман, сюда не доходит: её `scanTargets` по
 * попаданию не судит вовсе.
 */
function corners(el: Element, doc: Document, rest: Rest = () => undefined): { hit: boolean | null; coveredBy?: string } {
  // К центру; если так ни один угол не во вьюпорте (цель шире или выше окна:
  // центр выносит за край оба её края), — к НАЧАЛУ. Не `nearest`: тот считает
  // от текущей прокрутки, куда её только что увёл центр; для цели шире окна
  // это то же начало, но через состояние, а не по определению.
  let seen = cornerPoints(el, doc, 'center')
  if (seen.inside.length === 0) seen = cornerPoints(el, doc, 'start')
  const { box, inside, centre, cutBy } = seen
  // Срезана в ноль тем, что человек не листает: промах, названный клипом, а
  // не «не измерено» — замер как раз снят, и ответ его «на экране цели нет».
  if (inside.length === 0 && cutBy) {
    const k = doc.defaultView!.getComputedStyle(cutBy)
    return { hit: false, coveredBy: `вне досягаемости — срезана overflow ${k.overflowX}/${k.overflowY} у ${nameOf(cutBy, doc)}` }
  }
  if (inside.length === 0) return { hit: null }
  // Кто на ЦЕНТРЕ — рядом с углом (DS-331, п. 4): угол называет
  // виновника края, а цену ячейки показывает центр. На `DropdownMenu/structure`
  // ×1.5 угол назвал отключённый пункт, а рука владельца, целясь в кнопку,
  // попала в «Удалить» — его и назвал бы центр.
  const atCentre = centre && doc.elementFromPoint(centre[0], centre[1])
  const centreFree = !!atCentre && (atCentre === el || el.contains(atCentre))
  const centreWord = () => {
    if (!centre) return ''
    const where = `центр (${centre[0].toFixed(1)},${centre[1].toFixed(1)})`
    return centreFree ? `; ${where} — сама цель` : `; ${where} накрыт ${coverName(atCentre ?? null, doc)}`
  }
  const miss = (name: string, x: number, y: number, at: Element | null) =>
    ({ hit: false, coveredBy: `${name} (${x.toFixed(1)},${y.toFixed(1)}) ${coverName(at, doc)}${centreWord()}` })
  let firstAdorned: Parameters<typeof miss> | null = null
  let adorned = 0
  for (const [name, x, y] of inside) {
    const at = doc.elementFromPoint(x, y)
    if (at && (at === el || el.contains(at))) continue
    // Накладка: другая цель, целиком лежащая в коробке судимой, при СВОБОДНОМ
    // центре судимой. Не предок: цель вокруг судимой той же коробки — не
    // крестик на ней, а она сама.
    const owner = at && ownerTarget(at, doc)
    // Ячейка сетки под другой целью — слой виджета: нажатие там достаётся
    // тому, что лежит сверху (слот `EventCalendar` под событием). См. выше.
    if (owner && owner !== el && !owner.contains(el) && el.matches(GRID_CELL)) continue
    if (owner && owner !== el && !owner.contains(el) && centreFree && within(rectOf(owner), box)) {
      adorned++
      firstAdorned ??= [name, x, y, at]
      continue
    }
    // Закреплённый слой, из-под которого цель выкручена прокруткой.
    if (at && stuckOver(at, el, doc)) continue
    // Плавающий слой над прокруткой: стоит, пока цель едет.
    if (at && floatsOver(at, el, doc, rest)) continue
    return miss(name, x, y, at)
  }
  // Все углы под накладками — это одна крышка поверх цели, а не четыре
  // крестика по углам: промах, названный первой накладкой.
  if (firstAdorned && adorned === inside.length) return miss(...firstAdorned)
  return { hit: true }
}

/**
 * Прокрутить цель в вид и снять точки углов, видимые во вьюпорте.
 *
 * ПРОКРУТКА ЧЕЛОВЕКА, А НЕ `scrollIntoView` (DS-331). Тот листает и
 * `overflow: hidden`, которого человек не листает ничем, поэтому смещения
 * предков, скрытых по оси, возвращаются сразу после него, а окно ведётся к
 * видимой части заново. `body` не трогается: его `overflow` уходит во
 * вьюпорт, и окно кадра листается. ПРЕДЕЛ: промежуточные ЛИСТАЕМЫЕ
 * предки остаются там, куда их поставил `scrollIntoView` с учётом сдвинутого
 * скрытого, — цель в них может оказаться не в центре, а у края.
 *
 * `centre` — центр видимой части первого фрагмента, если он во вьюпорте;
 * `cutBy` — предок, срезавший в ноль ВСЕ фрагменты (см. `visiblePart`).
 */
function cornerPoints(el: Element, doc: Document, mode: ScrollLogicalPosition):
{ box: Rect; inside: [string, number, number][]; centre?: [number, number]; cutBy?: Element } {
  const view = doc.defaultView!
  const held: [Element, boolean, boolean, number, number][] = []
  for (let a = el.parentElement; a && a !== doc.body && a !== doc.documentElement; a = a.parentElement) {
    const k = view.getComputedStyle(a)
    const [hx, hy] = [k.overflowX === 'hidden', k.overflowY === 'hidden']
    if (hx || hy) held.push([a, hx, hy, a.scrollLeft, a.scrollTop])
  }
  el.scrollIntoView({ block: mode, inline: mode })
  let moved = false
  for (const [a, hx, hy, l, t] of held) {
    if (hx && a.scrollLeft !== l) { a.scrollLeft = l; moved = true }
    if (hy && a.scrollTop !== t) { a.scrollTop = t; moved = true }
  }
  if (moved) {
    const v = visiblePart(el, doc, false)
    if (!empty(v)) {
      const [dx, dy] = mode === 'center'
        ? [(v.l + v.r - view.innerWidth) / 2, (v.t + v.b - view.innerHeight) / 2]
        : [v.l, v.t]
      view.scrollTo(view.scrollX + dx, view.scrollY + dy)
    }
  }
  // Коробки читаются ПОСЛЕ прокрутки: она двигает и цель, и её клипы.
  const box = rectOf(el)
  // Строчный узел, перенесённый на несколько строк, — несколько коробок, и
  // угол общей лежит на соседнем тексте. Судятся углы КАЖДОГО фрагмента.
  const list = el.getClientRects()
  const pieces = list.length > 1
    ? [...list].map((f) => ({ l: f.left, t: f.top, r: f.right, b: f.bottom }))
    : [box]
  const cs = view.getComputedStyle(el)
  const px = (s: string) => parseFloat(s) || 0
  const radius = Math.max(1, ...[cs.borderTopLeftRadius, cs.borderTopRightRadius,
    cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map(px))
  const inside: [string, number, number][] = []
  let centre: [number, number] | undefined
  let cutBy: Element | undefined
  let cutAll = true
  for (const piece of pieces) {
    const v = visiblePart(el, doc, false, piece)
    if (empty(v)) { cutBy ??= v.cut; continue }
    cutAll = false
    const [cx, cy] = [(v.l + v.r) / 2, (v.t + v.b) / 2]
    if (!centre && cx >= 0 && cy >= 0 && cx < view.innerWidth && cy < view.innerHeight) centre = [cx, cy]
    const [hw, hh] = [(v.r - v.l) / 2, (v.b - v.t) / 2]
    const inset = (border: string, half: number) => Math.min(radius + px(border), half)
    const left = v.l + inset(cs.borderLeftWidth, hw)
    const right = v.r - inset(cs.borderRightWidth, hw)
    const top = v.t + inset(cs.borderTopWidth, hh)
    const bottom = v.b - inset(cs.borderBottomWidth, hh)
    const pts: [string, number, number][] = [['TL', left, top], ['TR', right, top], ['BL', left, bottom], ['BR', right, bottom]]
    inside.push(...pts.filter(([, x, y]) => x >= 0 && y >= 0 && x < view.innerWidth && y < view.innerHeight))
  }
  return { box, inside, ...(centre ? { centre } : {}), ...(cutAll && cutBy ? { cutBy } : {}) }
}

/**
 * ПЛАВАЮЩИЙ СЛОЙ над прокручиваемым содержимым (DS-331, п. 3): после
 * прокрутки ближайшего листаемого контейнера цели на Δ накрывший узел НЕ
 * сдвинулся, а цель сдвинулась. Тот же класс, что sticky, — слой стоит,
 * содержимое едет, и человек выводит цель из-под него прокруткой, — но
 * опознанный по ФОРМЕ, а не по `position`: кнопка «к последнему» у
 * `AgentTranscript` — `absolute`, соседка прокрутки, и появляется только
 * когда прокрутка ушла с хвоста (`auto && !following`), то есть её накрытие
 * вызвала сама проба, выводя цель к центру. Владелец домотал до конца —
 * кнопки уже нет.
 *
 * Почему не по `position: absolute`: меню `DropdownMenu`, раскрытое над
 * соседом ВНЕ прокрутки, тоже `absolute` и обязано остаться промахом. Форма
 * его отличает: у соседа нет своей прокрутки, окно везёт меню вместе с ним.
 *
 * Контейнер — ближайший предок, который листает человек (`auto`/`scroll`) и у
 * которого есть ход; нет такого — окно, если у документа есть ход. Δ — до
 * 32 px в ту сторону, где есть запас; смещение возвращается сразу. Накрывший,
 * содержащий цель, — не слой над ней, а она сама в чужой коробке.
 *
 * И ТОЛЬКО когда контейнер уже СДВИНУТ от покоя (`rest` — смещение до первой
 * прокрутки обхода): накрытие вызвала прокрутка, и прокрутка же его снимает.
 * Слой, лежащий на цели в покое, — обычное перекрытие, то же правило, что у
 * sticky (`scrolledUnder`, обзор 6a–6e, M1): иначе форма простила бы и
 * липкую шапку, наложенную на строку раскладкой, а не прокруткой.
 * Sticky сюда не доходит: у него своё правило, точнее этого.
 * ПРЕДЕЛ: слой, который едет медленнее содержимого (параллакс), не прощается.
 */
function floatsOver(at: Element, el: Element, doc: Document, rest: Rest): boolean {
  if (at.contains(el)) return false
  const view = doc.defaultView!
  // sticky судится своим правилом (`stuckOver`) и только им: у него сторона
  // отступа известна, и «из чужого контейнера» там решено промахом.
  for (let n: Element | null = at; n && !n.contains(el); n = n.parentElement) {
    if (view.getComputedStyle(n).position === 'sticky') return false
  }
  let box: Element | null = el.parentElement
  let axis: 'x' | 'y' | null = null
  for (; box && box !== doc.body && box !== doc.documentElement; box = box.parentElement) {
    const k = view.getComputedStyle(box)
    if (scrolls(k.overflowY) && box.scrollHeight > box.clientHeight) { axis = 'y'; break }
    if (scrolls(k.overflowX) && box.scrollWidth > box.clientWidth) { axis = 'x'; break }
  }
  const root = doc.documentElement
  const win = axis === null
  if (win) {
    if (root.scrollHeight > view.innerHeight) axis = 'y'
    else if (root.scrollWidth > view.innerWidth) axis = 'x'
    else return false
  }
  const get = () => (win
    ? (axis === 'y' ? view.scrollY : view.scrollX)
    : (axis === 'y' ? box!.scrollTop : box!.scrollLeft))
  const max = win
    ? (axis === 'y' ? root.scrollHeight - view.innerHeight : root.scrollWidth - view.innerWidth)
    : (axis === 'y' ? box!.scrollHeight - box!.clientHeight : box!.scrollWidth - box!.clientWidth)
  const put = (v: number) => {
    if (win) view.scrollTo(axis === 'y' ? view.scrollX : v, axis === 'y' ? v : view.scrollY)
    else if (axis === 'y') box!.scrollTop = v
    else box!.scrollLeft = v
  }
  const from = get()
  const was = rest(win ? null : box!)
  if (was === undefined || (axis === 'y' ? was[1] : was[0]) === from) return false
  const to = from + 32 <= max ? from + 32 : Math.max(0, from - 32)
  if (to === from) return false
  const pos = (n: Element) => (axis === 'y' ? n.getBoundingClientRect().top : n.getBoundingClientRect().left)
  const [layer0, target0] = [pos(at), pos(el)]
  put(to)
  const [layer1, target1] = [pos(at), pos(el)]
  put(from)
  return Math.abs(layer1 - layer0) < 0.5 && Math.abs(target1 - target0) >= 0.5
}

/**
 * Накрывший узел — sticky сам или через предка НИЖЕ общего с целью предка, и
 * цель из-под него ВЫКРУЧЕНА (`scrolledUnder`). Выше общего не считается: там
 * цель и накрывший едут в одной закреплённой полосе.
 */
function stuckOver(at: Element, el: Element, doc: Document): boolean {
  const view = doc.defaultView!
  for (let n: Element | null = at; n && !n.contains(el); n = n.parentElement) {
    if (view.getComputedStyle(n).position === 'sticky' && scrolledUnder(n, el, doc)) return true
  }
  return false
}

const listable = (v: string) => v === 'auto' || v === 'scroll' || v === 'hidden'

/**
 * Цель ушла под sticky-слой ПРОКРУТКОЙ, а не лежит под ним в покое. Все три
 * условия: ближайший контейнер прокрутки слоя (или окно) содержит цель; у него
 * есть ход по оси слоя; он прокручен в сторону отступа слоя — `top`/`left`
 * заданы и смещение > 0, `bottom`/`right` заданы и смещение < предела.
 * Слой, сдвинутый уже в покое (контейнер не прокручен), — обычное перекрытие.
 */
function scrolledUnder(sticky: Element, el: Element, doc: Document): boolean {
  const view = doc.defaultView!
  let box: Element | null = sticky.parentElement
  for (; box && box !== doc.body && box !== doc.documentElement; box = box.parentElement) {
    const k = view.getComputedStyle(box)
    if (listable(k.overflowX) || listable(k.overflowY)) break
  }
  const win = !box || box === doc.body || box === doc.documentElement
  if (!win && !box!.contains(el)) return false
  const root = doc.documentElement
  const [ox, oy] = win ? [view.scrollX, view.scrollY] : [box!.scrollLeft, box!.scrollTop]
  const [mx, my] = win
    ? [root.scrollWidth - view.innerWidth, root.scrollHeight - view.innerHeight]
    : [box!.scrollWidth - box!.clientWidth, box!.scrollHeight - box!.clientHeight]
  const cs = view.getComputedStyle(sticky)
  const set = (v: string) => v !== '' && v !== 'auto'
  const toward = (start: string, end: string, off: number, max: number) =>
    max > 0 && ((set(start) && off > 0) || (set(end) && off < max))
  return toward(cs.top, cs.bottom, oy, my) || toward(cs.left, cs.right, ox, mx)
}

/**
 * Накрывший в `coveredBy` — путь до ЦЕЛИ, которой принадлежит точка
 * (`ownerTarget`), а не до листа под ней (DS-333, З-4): рука попадает в
 * пункт меню, а не в его иконку. Не цель — путь до самого узла.
 */
function coverName(at: Element | null, doc: Document): string {
  return nameOf((at && ownerTarget(at, doc)) ?? at, doc)
}

/** Как назвать узел, отданный `elementFromPoint`, в `coveredBy`. */
function nameOf(at: Element | null, doc: Document): string {
  if (!at) return 'за пределами документа'
  const host = doc.querySelector('.wbf-host')
  if (at === host) return '.wbf-host'
  if (at === doc.body || at === doc.documentElement) return at.tagName.toLowerCase()
  return readablePath(at, host)
}

/**
 * ОТКЛЮЧЁННАЯ цель: `:disabled` (сам контрол или `<fieldset disabled>` над ним
 * — шире свойства `disabled`, которое про fieldset молчит) или
 * `aria-disabled="true"`. Значение `"false"` — включённая.
 */
function isDisabled(el: Element): boolean {
  return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true'
}

/**
 * Кандидаты в цели — ОДИН обход на двоих: `scanTargets` и `targetSignature`.
 * Разойдись они в том, что считают целью, отстаивание ждало бы не тех коробок,
 * которые потом мерятся.
 */
function* candidates(doc: Document, skipped: { inert: number; clipped: number } = { inert: 0, clipped: 0 }):
Generator<{ target: Element; r: DOMRect; exempt: boolean; disabled: boolean }> {
  const view = doc.defaultView!
  for (const el of doc.querySelectorAll(TARGET_SEL)) {
    // ЦЕЛЬ — область, принимающая действие указателя, а не обязательно сам
    // фокусируемый узел. У поля внутри `<label>` этой областью является label
    // целиком: так критерий и написан, и так ведут себя браузеры. Мерить
    // коробку самого `input` значило бы требовать, чтобы контрол РАЗМЕРОМ
    // отвечал за попадаемость, — на этом смешении флажок таблицы вырос до 24px
    // и стал самым громким элементом строки.
    const target = el.tagName === 'INPUT' ? (el.closest('label') ?? el) : el
    const r = target.getBoundingClientRect()
    const cs = view.getComputedStyle(el)
    // Невидимое целью не считается: нулевая коробка, display:none и
    // visibility:hidden — это не «мелкая цель», а отсутствие цели.
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue
    // Инертное поддерево (фон под Modal/Drawer) не принимает действие ни у
    // кого — это тоже отсутствие цели, а не «не попасть». Здесь, а не в
    // `scanTargets`: подпись обязана ждать ровно то, что затем мерится.
    // ПЛАТА: цель, по ошибке оставленная в инертном поддереве, строкой не
    // увидится вовсе.
    if (el.closest('[inert]')) { skipped.inert++; continue }
    // Обрезанная предком В НОЛЬ — тоже отсутствие цели (кнопка в свёрнутой
    // панели `Split`). Спрашивается «в покое», без прокрутки: см. `visiblePart`.
    if (empty(visiblePart(target, doc, true))) { skipped.clipped++; continue }
    yield { target, r, exempt: targetExempt(el, cs), disabled: isDisabled(el) }
  }
}

/**
 * ПОДПИСЬ КОРОБОК ЦЕЛЕЙ — для отстаивания кадра строкой цели клика
 * (DS-177). Два кадра подряд с одной подписью — раскладка целей
 * установилась; её и меряет затем `scanTargets`.
 *
 * Дешевле `scanTargets` и, главное, НИЧЕГО НЕ ЛИСТАЕТ: координаты берутся в
 * системе документа (`getBoundingClientRect` плюс прокрутка окна), попадание не
 * снимается. Зови её хоть каждый кадр — кадр остаётся, каким был.
 *
 * Не «число и сумма сторон», а коробки поимённо: цель, переехавшая без смены
 * размера (хвост ушёл в «Ещё», ряд сдвинулся), меняет попадание, а сумма бы её
 * не заметила. Прокручиваемые области входят отдельной меткой — их число тоже
 * часть того, что затем отчитывается.
 */
export function targetSignature(doc: Document = document): string {
  const view = doc.defaultView
  if (!view) throw new Error('targetSignature: у документа нет окна — мерить нечего')
  const [sx, sy] = [view.scrollX, view.scrollY]
  const parts: string[] = []
  for (const { r, exempt } of candidates(doc)) {
    parts.push(exempt ? 's' : [r.left + sx, r.top + sy, r.width, r.height].map((v) => v.toFixed(1)).join(','))
  }
  return parts.join(';')
}

/**
 * Обход целей документа НА ТЕКУЩЕЙ шкале.
 *
 * Шкалу этот обход не ставит и не снимает: кто меряет развёртку по шкалам,
 * тот ею и управляет. Здесь — один снимок одного состояния страницы.
 *
 * ОТКЛЮЧЁННАЯ ЦЕЛЬ (`:disabled`, `aria-disabled="true"`, см. `isDisabled`)
 * ПО РАЗМЕРУ СУДИТСЯ, ПО ПОПАДАНИЮ — НЕТ (DS-177). Размер переживает
 * состояние: включённая кнопка будет той же коробки. Попадание — нет:
 * `pointer-events: none` у отключённой задуман, и угол честно отдаёт родителя
 * (`Button/link`, `Button/loading` на первом живом прогоне). Углы у неё не
 * спрашиваются вовсе, и новой формы в интерфейсе нет: мелкая отключённая идёт
 * в `small` с `hit: null` («попадание не снято» — ровно так и есть), крупная —
 * только в `total`. Не `unreachable`: тот красный и значит «замер не достал»,
 * а здесь замер не нужен. ПЛАТА: отключённая кнопка, перекрытая чем-то,
 * найдётся только в случае, где она включена.
 *
 * Прокрутку обход ТРОГАЕТ (попадание снимается во вьюпорте, см. `corners`) и
 * потому сам же её возвращает — в `finally`, в то смещение, какое взял, а не в
 * ноль: страница одна на всех судей ячейки матрицы, и побочный эффект,
 * прибранный вызывающим, прибирается ровно до первого вызывающего, который
 * забудет. Возвращается не только окно: `scrollIntoView` листает и каждого
 * прокручиваемого ПРЕДКА цели. Смещение контейнера ширин не меняет, но меняет
 * координаты всего, что в нём лежит, — соседняя строка, спросившая
 * `elementFromPoint`, получила бы другой документ. Сверка состояния кадра в
 * ходке матрицы (`case-walk.mjs`) видит только прокрутку документа, так что
 * предков здесь не вернёт никто, кроме самого обхода.
 *
 * Предки запоминаются ДО первой прокрутки каждой цели, цепочкой до корня;
 * встретив уже запомненного, подъём останавливается — его предки запомнены
 * вместе с ним. Возвращаются только сдвинувшиеся: запись `scrollTop` у
 * нетронутого узла — лишняя раскладка, а не аккуратность.
 */
export function scanTargets(doc: Document = document): TargetScan {
  const view = doc.defaultView
  if (!view) throw new Error('scanTargets: у документа нет окна — мерить нечего')
  const small: SmallTarget[] = []
  const unhittable: SmallTarget[] = []
  const unreachable: SmallTarget[] = []
  const host = doc.querySelector('.wbf-host')
  let total = 0
  let scrollers = 0
  let boxSum = 0
  const [sx, sy] = [view.scrollX, view.scrollY]
  const ancestors = new Map<Element, [number, number]>()
  const remember = (el: Element) => {
    for (let a = el.parentElement; a && a !== doc.documentElement; a = a.parentElement) {
      if (ancestors.has(a)) break
      ancestors.set(a, [a.scrollLeft, a.scrollTop])
    }
  }
  // Множество целей — ДО первой прокрутки, целиком: ленивый обход спрашивал бы
  // «в покое»-обрезку следующей цели уже после того, как прокрутка ради
  // предыдущей сдвинула её контейнер, и замер разошёлся бы с подписью,
  // которая не листает ничего.
  const skipped = { inert: 0, clipped: 0 }
  const all = [...candidates(doc, skipped)]
  const rest: Rest = (a) => (a === null ? [sx, sy] : ancestors.get(a))
  try {
    for (const { target, r, exempt, disabled } of all) {
      if (exempt) { scrollers++; continue }
      total++
      boxSum += r.width + r.height
      // Отключённая по попаданию не судится (см. `scanTargets`): углы не
      // спрашиваются, `hit` — `null`, в списки попадания она не идёт.
      if (disabled && r.width >= 24 && r.height >= 24) continue
      if (!disabled) remember(target)
      const { hit, coveredBy } = disabled ? { hit: null } : corners(target, doc, rest)
      const isSmall = r.width < 24 || r.height < 24
      if (!isSmall && hit === true) continue
      const found: SmallTarget = {
        path: readablePath(target, host),
        width: +r.width.toFixed(1),
        height: +r.height.toFixed(1),
        hit,
        ...(coveredBy === undefined ? {} : { coveredBy }),
      }
      if (isSmall) small.push(found)
      else if (hit === null) unreachable.push(found)
      else unhittable.push(found)
    }
  } finally {
    for (const [a, [l, t]] of ancestors) {
      if (a.scrollLeft !== l) a.scrollLeft = l
      if (a.scrollTop !== t) a.scrollTop = t
    }
    view.scrollTo(sx, sy)
  }
  return { total, small, unhittable, unreachable, scrollers, ...skipped, boxSum: +boxSum.toFixed(1) }
}

/* ── ШИРИНА ПОЛЯ ВВОДА (DS-344) ───────────────────────────────────── */

/**
 * ОДНОСТРОЧНЫЙ ВВОД И ТЕКСТОВАЯ ОБЛАСТЬ — то, у чего ширина обязана держать
 * ЗНАЧЕНИЕ, а не только указатель.
 *
 * Отбор ПО ФОРМЕ: флажок, переключатель, ползунок, выбор файла и кнопки в
 * образе `input` ничего не показывают текстом — им ширина значения не нужна.
 * `select` тоже вне отбора: браузер сам режет его содержимое многоточием, и
 * пол на нём судил бы не поле, а платформу.
 */
export const FIELD_SEL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio])'
  + ':not([type=range]):not([type=file]):not([type=color])'
  + ':not([type=submit]):not([type=button]):not([type=reset]), textarea'

/**
 * ОБРАЗЦОВОЕ ЗНАЧЕНИЕ — дата, а не сумма и не название (DS-344).
 *
 * Сумму дочитывают по ходу набора, и поле само листает её к концу; дату
 * смотрят в покое и целиком — `31.12.2026` и `31.12.2028` в срезанном поле
 * неразличимы. Замер 20.09.2026 при шкале 1 (Inter 13 px): дата 63 px,
 * `1 234 567,89` — 80, `ООО «Ромашка»` — 110. Взят самый узкий из трёх: пол
 * покупает ЧИТАЕМОСТЬ, а не комфорт.
 */
export const FIELD_SAMPLE = '31.12.2026'

/**
 * ОБРАЗЕЦ ДЛЯ ЭТОГО ПОЛЯ — его собственное самое длинное значение, когда
 * разметка его называет (DS-344).
 *
 * Исключение ПО ФОРМЕ, а не по имени компонента, и потому оно не индульгенция:
 * - `maxlength` — поле, которое не может принять десять знаков, не судится по
 *   десяти (ячейка `CodeInput` держит один);
 * - ЧИСЛОВОЕ ПОЛЕ С ОБЪЯВЛЕННЫМ ДИАПАЗОНОМ — длина берётся из диапазона:
 *   «Машин на линии» 0–60 показывает 60 целиком в 3.5rem, и требовать от него
 *   места под `31.12.2026` значило бы судить узкое числовое поле как
 *   текстовое.
 * Поле БЕЗ таких объявлений судится по образцу: про него разметка ничего не
 * обещает, а показать оно обязано значение.
 *
 * ЧИСЛОВОЕ — ЭТО ТРИ РАЗНЫХ ОБЪЯВЛЕНИЯ, и перечислены все три: `type=number`,
 * `role=spinbutton` и `inputmode` цифрами. `NumberField` этой системы —
 * `<input role="spinbutton" inputmode="decimal">` БЕЗ `type`, потому что
 * нативный `type=number` приносит свои крутилки; ждать одного `type` значило
 * бы промахнуться мимо единственного числового поля каталога. Границы
 * читаются и как `min`/`max`, и как `aria-valuemin`/`aria-valuemax` — вторая
 * пара и есть та, которой объявляется диапазон у `spinbutton`.
 *
 * Дробная часть и знак берутся из САМОЙ ЗАПИСИ границы (`0.5` → `0,5`,
 * `-1000` → `-1000`), а не из `step`: у поля без `type=number` `step` в DOM не
 * живёт, а граница живёт всегда — иначе судить было бы не по чему.
 */
function fieldSample(el: Element): string {
  const max = Number(el.getAttribute('maxlength') ?? NaN)
  if (Number.isFinite(max) && max > 0) return FIELD_SAMPLE.slice(0, max)
  const numeric = (el as HTMLInputElement).type === 'number'
    || el.getAttribute('role') === 'spinbutton'
    || ['numeric', 'decimal'].includes(el.getAttribute('inputmode') ?? '')
  if (!numeric) return FIELD_SAMPLE
  const bounds = ['min', 'max', 'aria-valuemin', 'aria-valuemax']
    .map((n) => el.getAttribute(n))
    .filter((v): v is string => v !== null && v.trim() !== '' && Number.isFinite(Number(v)))
    .map((v) => v.trim().replace('.', ','))
  if (!bounds.length) return FIELD_SAMPLE
  return bounds.sort((a, b) => b.length - a.length)[0]
}

/** Поле, которому не хватает ширины на образцовое значение. */
export interface NarrowField {
  /** Читаемый путь от `.wbf-host` (`readablePath`), а не список классов. */
  path: string
  /** Ширина СОДЕРЖИМОГО (clientWidth минус падинги), CSS px. */
  inner: number
  /** Сколько нужно: образец плюс знак на каретку, в том же кегле. */
  need: number
  /** Что мерилось: образец целиком либо его начало под `maxlength`. */
  sample: string
}

export interface FieldScan {
  /** Осмотренные поля: всё, что не отброшено невидимостью, инертностью, обрезкой. */
  total: number
  narrow: NarrowField[]
  /** Пропущенные и почему — не молча: см. санитар строки. */
  invisible: number
  inert: number
  clipped: number
}

/** Как мерить ширину текста в кегле поля. Впрыскивается ради jsdom, где холста нет. */
export type MeasureText = (text: string, cs: CSSStyleDeclaration) => number

/**
 * ЗАМЕР ТЕКСТА ХОЛСТОМ, а не подложенным узлом: проба строки матрицы обязана
 * вернуть кадр таким, каким взяла, а `<canvas>` в памяти документа не трогает
 * вовсе. Цена названа: `measureText` считает по метрикам шрифта и не знает про
 * `letter-spacing` и включённые начертанием лигатуры — расхождение с раскладкой
 * в доли пикселя. Пол от этого не плывёт: он с запасом в целый знак.
 */
const canvasMeasure = (doc: Document): MeasureText => {
  const ctx = doc.createElement('canvas').getContext('2d')
  return (text, cs) => {
    if (!ctx) return 0
    ctx.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`
    return ctx.measureText(text).width
  }
}

/**
 * ОБХОД ПОЛЕЙ ВВОДА НА ТЕКУЩЕЙ ШКАЛЕ: каждое показывает значение, а не одну
 * букву (DS-344).
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ ЦЕЛИ КЛИКА. Пол цели (24×24) сжатое поле проходит: на кадре
 * 360 при шкале 1.5 `Form` отдавал полю 26 × 48 — по указателю попадаемо, по
 * чтению мертво. Цель спрашивает «можно ли ткнуть», это — «видно ли, что в нём
 * написано»; один вопрос другим не отвечается.
 *
 * ПОЛ — НЕ ЧИСЛО В ПИКСЕЛЯХ, А ЗНАЧЕНИЕ В КЕГЛЕ ПОЛЯ, и потому он сам едет за
 * `--ds-ui-scale` и за темой типографики: нужно `measureText(образец)` плюс
 * знак на каретку. Литерал в px пришлось бы держать в согласии со шкалой
 * руками, а разошёлся бы он молча.
 *
 * ОБРАЗЕЦ СУЖАЕТСЯ РАЗМЕТКОЙ САМОГО ПОЛЯ (`fieldSample`): `maxlength` и
 * диапазон числового поля. Исключение по ФОРМЕ, а не по имени компонента —
 * см. довод там же.
 *
 * Обход ничего не листает и ничего не подкладывает — кадр остаётся, каким был.
 */
export function scanFields(doc: Document = document, measure?: MeasureText): FieldScan {
  const view = doc.defaultView
  if (!view) throw new Error('scanFields: у документа нет окна — мерить нечего')
  const text = measure ?? canvasMeasure(doc)
  const host = doc.querySelector('.wbf-host')
  const narrow: NarrowField[] = []
  let total = 0
  const skipped = { invisible: 0, inert: 0, clipped: 0 }
  for (const el of doc.querySelectorAll(FIELD_SEL)) {
    const cs = view.getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') { skipped.invisible++; continue }
    if (el.closest('[inert]')) { skipped.inert++; continue }
    if (empty(visiblePart(el, doc, true))) { skipped.clipped++; continue }
    total++
    const sample = fieldSample(el)
    const need = text(sample, cs) + text('0', cs)
    const pad = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0')
    const inner = Math.max(0, (el as HTMLElement).clientWidth - pad)
    if (inner + 0.5 >= need) continue
    narrow.push({
      path: readablePath(el, host),
      inner: +inner.toFixed(1),
      need: +need.toFixed(1),
      sample,
    })
  }
  return { total, narrow, ...skipped }
}
