/**
 * Кадр — самостоятельный документ, в котором рисуется ровно одна фикстура.
 *
 * Зачем отдельный документ, а не div заданной ширины (измерено 2026-08-15,
 * chromium): `@media` действительно мерит ОКНО, а не блок — но ни одного
 * правила `@media` по ширине в `src` сегодня нет (10 правил — все про
 * `prefers-reduced-motion`/`hover: none`, то есть настройки устройства, а
 * в кадре и в общем документе дают ОДИН И ТОТ ЖЕ результат). Честная опора
 * кадра сегодня — `vw` и `position: fixed`: `.ds-drawer--left`
 * (`min(calc(22.5rem * var(--ds-ui-scale)), 90vw)`) в div 320px внутри окна
 * 900px берёт 90vw от ОКНА и выходит 360px (rem-ветка), а в кадре 320px —
 * 90vw от кадра, 288px; `.ds-drawer__overlay` (`position: fixed`) в общем
 * документе накрывает 320×260 в кадре, а не всё окно. `@media` по ширине
 * кадр защищает у потребителя (там такие правила есть) и на будущее — у нас
 * появятся. `@container` кадру не требуется: контейнерные запросы меряют
 * контейнер и в `div` работают правильно. Shadow DOM не заменяет: он
 * изолирует стили, но вьюпорта не создаёт.
 *
 * Кадр грузит полный лист системы; оболочка его не грузит и не будет.
 *
 * Отделён от точки входа `frame.tsx` не ради красоты (тот же приём, что у
 * `shell.tsx`/`shell-app.tsx`): пока `Frame` жил в файле с `createRoot` на
 * уровне модуля, импорт из теста либо падал на отсутствии `#root`, либо
 * монтировал кадр побочным эффектом. Здесь — сам компонент, без единого
 * импорта CSS, и его можно отрисовать в `frame-slots.test.tsx`.
 */
/// <reference types="vite/client" />
// Ссылка точечная, тем же доводом, что в registry.ts: `import.meta.hot` нужен
// кадру (сброс кэша форса на горячей замене стилей), но не коду пакета.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { parseFrameUrl, buildFrameUrl, type FrameState } from './frame-url.js'
import { applyFrameEnv } from './frame-scale.js'
import { applyPatch } from './frame-patch.js'
import { makeMirror } from './mirror-url.js'
import { fixtureKinds, loadFixture } from './registry.js'
import { resolveCase } from './resolve-case.js'
import { FrameBoundary } from './frame-boundary.js'
import {
  pack,
  unpack,
  type CanvasSpot,
  type Down,
  type TextMode,
  type Theme,
  type Up,
} from './protocol.js'
import { DsText, DS_TEXT_PSEUDO } from '../src/dictionary/index.js'
import type { DsTextOverrides } from '../src/dictionary/index.js'
import { metaOf } from './fixture-meta.js'
import { reportSize } from './frame-size.js'
import { fillsOf, fitsSlot, parseFill } from './slot-fill.js'
import { sameAsBefore, toneLabel, isTransparent, effectiveTone } from './state-tones.js'
import { aimChainOf, aimTargetOf, describeNode, labelShiftOf } from './aim.js'
import { runAxe } from './axe-layer.js'
import { previewRoots } from './preview-roots.js'
import { nodeAt, pathOf } from './dom-path.js'
import { stopLabel, tabStops } from './tabstops.js'
import {
  installForce,
  resetForceCache,
  forceAttrValue,
  FORCE_ATTR,
  type ForceState,
} from './force-states.js'
import { CANVAS_SPOTS, SPOT_ATTR, parseSpots } from './canvas-plan.js'
import type { AnyFixture } from '../src/internal/fixture.js'

/**
 * Затишье, после которого слой axe считает (DS-78). Перерисовка кадра
 * сбрасывает ожидание — см. эффект слоя.
 */
export const AXE_QUIET_MS = 200

/**
 * Знак «идёт прогон axe» на корне документа кадра (DS-195). По нему
 * `frame.css` прячет СОБСТВЕННЫЕ метки кадра — контуры нарушений, номера
 * стопов, рамку прицела: правилу `color-contrast` нужны настоящие пиксели, и
 * узел поверх текста делает фон неопределимым.
 *
 * Атрибутом, а не классом: класс на `<html>` пришлось бы согласовывать с тем,
 * что туда пишет тема кадра, и снятие одного стёрло бы другой.
 */
export const AXE_RUN_ATTR = 'data-wbf-axe'

/**
 * Метка прицела переворачивается ВНИЗ, когда над узлом её не поместить.
 *
 * Число — про край ЭКРАНА, и сравнивать с ним надо ВЬЮПОРТНУЮ координату
 * (DS-147). До этой правки сравнивали с документной: на непрокрученном
 * кадре это одно и то же число, а на прокрученном — разные, и метка у самого
 * верха кадра уезжала за его край, вместо того чтобы перевернуться. Замерено
 * на Prose при scrollY 219: узел на вьюпортных 10, метка нарисована на −7.8.
 *
 * 24 — высота метки с отступом, с запасом на округление шрифта.
 */
export const AIM_LABEL_FLIP = 24

/**
 * Наборы текста для кадра (DS-139). МОДУЛЬНЫЕ константы, а не литералы
 * по месту: `DsText` мержит `{ ...outer, ...value }` в `useMemo` по ссылке
 * `value`, и новый объект на каждый рендер перерисовывал бы всех потребителей
 * контекста разом.
 *
 * `ru` — пустые переопределения, то есть чистое русское умолчание словаря.
 */
const TEXT_BY_MODE: Record<TextMode, DsTextOverrides> = {
  ru: {},
  pseudo: DS_TEXT_PSEUDO,
}

/**
 * Вызов `render` фикстуры вынесен в отдельный компонент НЕ ради красоты.
 *
 * `render` — обычная функция, и позови её инлайном в теле `Frame`, бросок
 * случится в рендере РОДИТЕЛЯ, то есть выше границы: React напишет «error
 * occurred in the <Frame> component», а кадр останется белым. Проверено
 * мутацией — именно так и было в первой редакции.
 *
 * Компонент-обёртка ставит вызов НИЖЕ границы, и она его ловит.
 */
function FixtureView({
  render,
  props,
  slots,
}: {
  render: ((p: never, s: Record<string, ReactNode>) => ReactNode) | undefined
  props: Record<string, unknown>
  slots: Record<string, ReactNode>
}) {
  if (!render) return null
  return <>{render(props as never, slots)}</>
}

/**
 * Фикстура одного места канваса. `null` — фикстуры нет, `broken` различает два
 * диагноза за этим `null`: файла нет вовсе (не ошибка, просто не написан) и
 * файл есть, но падает при импорте (ошибка, и молчать про неё нельзя). То же
 * различение и по той же причине, что `fxBroken` у одиночной фикстуры.
 */
interface SpotFixture {
  fx: AnyFixture | null
  broken: boolean
}

/**
 * Одно место канваса (DS-128).
 *
 * Отдельным компонентом по ТОМУ ЖЕ доводу, что `FixtureView` выше: `render`
 * фикстуры обязан зваться НИЖЕ границы ошибок. Позови его в теле `Frame` — и
 * бросок случится в рендере родителя, мимо границы, которая ему ребёнок, а не
 * предок. На канвасе это стоит дороже, чем в одиночном кадре: белым останется
 * не один компонент, а весь набор.
 */
function CanvasSpotView({
  spot,
  loaded,
  theme,
  scale,
  sid,
  text,
}: {
  spot: CanvasSpot
  loaded: SpotFixture | undefined
  theme: Theme
  scale: number
  sid: number
  text: TextMode
}) {
  // Ещё грузится. Пусто, а не скелет: место уже занимает свой прямоугольник в
  // раскладке, и скелет добавил бы сюда мигание, а не сведения.
  if (!loaded) return null

  if (!loaded.fx) {
    return (
      <div className="wbf-canvas__gap">
        {loaded.broken ? (
          <>
            Фикстура <code>{spot.component}.fixture.tsx</code> падает при импорте — смотри консоль
            браузера. Это ошибка МОДУЛЯ фикстуры, а не канваса.
          </>
        ) : (
          <>
            У компонента <code>{spot.component}</code> ещё не написан{' '}
            <code>{spot.component}.fixture.tsx</code>. Это не ошибка — просто до него не дошла очередь.
          </>
        )}
      </div>
    )
  }

  const fx = loaded.fx
  const kase = fx.cases.find((x) => x.id === spot.caseId)
  // НАЗВАННЫЙ И НЕ НАЙДЕННЫЙ СЛУЧАЙ — ОТКАЗ, а не откат к первому: то же
  // правило и тот же довод, что у начинок позиций (Ruling 7 в `loadFills`).
  // Подставленный первый случай дал бы работающий на вид канвас не про то, а
  // пустота заставляет разбираться — ложь нет.
  if (spot.caseId && !kase) {
    return (
      <div className="wbf-canvas__gap">
        у «{spot.component}» нет случая «{spot.caseId}»
      </div>
    )
  }

  // Адрес, по которому это место смотрелось бы одиночным кадром. Начинки
  // позиций пусты: рекурсия запрещена тем же правилом, что у `loadFills`.
  //
  // `w: null` — ширина здесь НЕ НАША: у одиночного кадра её задаст тот, кто
  // его откроет (DS-345). Подставить сюда ширину канваса значило бы
  // обещать вьюпорт, которого по этой ссылке не будет.
  const spotState: FrameState = {
    c: spot.component,
    caseId: spot.caseId,
    sid: 0,
    w: null,
    theme,
    scale,
    data: spot.data,
    force: null,
    mode: 'frame',
    // Набор текста — КАДРА, а не места: провайдер стоит над всем канвасом, и
    // одно место не может говорить иначе, чем соседнее. В адрес он всё же
    // едет, чтобы ссылка «это место одиночным кадром» открыла ровно то, на
    // что человек смотрит.
    text,
    aim: false,
    layers: [],
    // Крутилки МЕСТА, а не кадра: `state.props` кадра адресованы `state.c`, и
    // раздать их всем местам разом значило бы уронить крутилку `DataTable` в
    // `Pagination`.
    props: spot.props,
    slots: {},
  }
  const shown = kase ?? fx.cases[0]

  return (
    <FrameBoundary sid={sid}>
      <FixtureView
        render={shown?.render ?? fx.render}
        props={resolveCase(fx, spotState)}
        slots={{}}
      />
    </FrameBoundary>
  )
}

/** Начинки текущего кадра — то, что доехало до карты, и то, что не доехало. */
interface Fills {
  /** Узел на каждую ОБЪЯВЛЕННУЮ позицию — успех или отказ внутри неё. */
  fills: Record<string, ReactNode>
  /** Жалобы, которые НЕКУДА положить — см. Ruling 9 у их формирования ниже. */
  unplaced: string[]
}

/**
 * Начинки текущего кадра — по одному узлу на каждую заполненную ОБЪЯВЛЕННУЮ
 * позицию (`fillsOf`, Задача 3), плюс отдельный список необъявленных. Отказы —
 * ВОЗВРАЩАЕМЫЕ узлы/строки класса `.wbf-slot-error`, а не исключения:
 * `loadFills` зовётся из асинхронного эффекта, и брошенное там граница ошибок
 * кадра НЕ ловит (она ловит только ошибки РЕНДЕРА) — было бы необработанное
 * отклонение промиса, кадр не прислал бы `ready`, и оболочка через 5 с решила
 * бы, что кадр не ответил. Пустое место здесь тоже запрещено: пустая ячейка
 * читается как поломка компонента, а это поломка ссылки — разница должна быть
 * видна словами.
 *
 * `loadFixture` ОТКЛОНЯЕТСЯ, если модуль фикстуры есть, но падает при
 * импорте (`null` возвращается только когда имени нет в реестре); бросок
 * ловится здесь же (`.catch`), иначе одна битая начинка уносит весь набор.
 *
 * ОСТАТОК, который эта функция не ловит и не лечит: если сама фикстура (или
 * кейс со своим `render`) объявила позицию в `slots`, но не читает её в
 * разметке (`slots.cell` нигде не подставлен), готовый узел в `fills[slotId]`
 * будет построен и так же проглочен — молча, ровно как и необъявленная
 * позиция ниже. Это дефект ФИКСТУРЫ (расхождение `slots`-декларации и
 * `render`), а не начинки, и гейт состава (`fixture-validate.ts`) его тоже не
 * видит — он проверяет ссылки между фикстурами, а не то, что `render`
 * действительно подставляет то, что объявил.
 */
async function loadFills(fx: AnyFixture, s: FrameState): Promise<Fills> {
  const fills: Record<string, ReactNode> = {}
  const unplaced: string[] = []

  for (const [slotId, raw] of Object.entries(fillsOf(fx, s))) {
    const slot = fx.slots?.[slotId]
    if (!slot) {
      // Ruling 9: позицию, которую фикстура НЕ ОБЪЯВЛЯЛА, узлом в `fills` не
      // починить — компонент читает только объявленные им же `slots.<id>`, и
      // ключ, которого никто не читает, для экрана не существует, сколько бы
      // слов в него ни положили. Единственное место, где такой отказ вообще
      // может стать видимым, — отдельная полоса кадра (см. `Frame` ниже), а не
      // карта: это и разбирает `unplaced` отдельно от `fills`.
      unplaced.push(`позиция «${slotId}»: фикстура «${fx.name}» её не объявляла`)
      continue
    }

    const fill = parseFill(raw)
    if (!fill) {
      fills[slotId] = (
        <span className="wbf-slot-error">
          позиция «{slotId}»: ссылка «{raw}» не читается
        </span>
      )
      continue
    }

    const target = await loadFixture(fill.c).catch(() => null)
    if (!target) {
      fills[slotId] = (
        <span className="wbf-slot-error">
          позиция «{slotId}»: фикстуры «{fill.c}» нет или она не грузится
        </span>
      )
      continue
    }

    if (!fitsSlot(slot.accepts, target.kind)) {
      // Позиция `accepts: 'inline'` отвергла ЭТУ фикстуру именно потому, что
      // та `block` — и ответ отказом не имеет права быть тем же нарушением:
      // `<span>`, не `<div>` (у класса уже `display: inline-block`). В `<td>`
      // блочный узел был бы безобиден, но позиция внутри `<p>`/`<button>`
      // получила бы `validateDOMNesting` от самого React.
      fills[slotId] = (
        <span className="wbf-slot-error">
          позиция «{slotId}» несовместима: принимает {slot.accepts}, а «{fill.c}» объявлен как{' '}
          {target.kind}
        </span>
      )
      continue
    }

    // Ruling 7: кейс НАЗВАН ЯВНО (`Badge:нетакого`) — «названо, но не найдено»
    // это ошибка, а не умолчание. Здесь мы НАМЕРЕННО расходимся с тем, как
    // `resolveCase` обходится с неизвестным `caseId` у ХОЗЯЙСКОЙ фикстуры (там
    // откат на первый кейс — законное поведение: пустой `caseId` там и значит
    // «первый»). У начинки пустого `caseId` не бывает — `fill.case` либо не
    // указан вовсе (тогда первый кейс — то, что просили), либо указан и должен
    // существовать. Молчаливый откат к первому кейсу здесь был бы ХУЖЕ пустоты:
    // человек пишет `Badge:нетакого`, видит отрисованный `Badge:base` и верит,
    // что смотрит на «нетакого» — пустота заставляет разбираться, ложь нет.
    // Судим тем же приговором, что и валидатор для начинок из данных
    // (`fixture-validate.ts`: «у „X“ нет кейса „Y“») — расхождение здесь
    // вернуло бы ту же болезнь, ради которой в задаче 2 `fitsSlot` свели в
    // одну функцию. НЕ ЧИНИТЬ ОТКАТОМ: если это разойдётся однажды, кадр
    // обязан продолжать отказывать явно, а не подставлять первый кейс.
    if (fill.case && !target.cases.some((x) => x.id === fill.case)) {
      fills[slotId] = (
        <span className="wbf-slot-error">
          у «{fill.c}» нет кейса «{fill.case}»
        </span>
      )
      continue
    }

    // РЕКУРСИЯ ЗАПРЕЩЕНА: начинка рисуется со `slots={{}}` всегда — иначе
    // `DataTable` может оказаться начинкой самого себя, и это бесконечный
    // цикл (см. шапку slot-fill.ts).
    const caseId = fill.case ?? ''
    const targetState: FrameState = {
      c: fill.c,
      caseId,
      sid: 0,
      // Начинка живёт внутри чужого кадра — своего вьюпорта у неё нет вовсе.
      w: null,
      theme: s.theme,
      scale: s.scale,
      data: null,
      force: null,
      // Начинка рисуется ОДНОЙ копией всегда: режим «Состояния» — про
      // хозяйский компонент, а не про то, что вложено в его позицию.
      mode: 'frame',
      // Начинка говорит тем же набором, что и хозяин, по тому же доводу, что у
      // места канваса: провайдер один на документ.
      text: s.text,
      aim: false,
      layers: [],
      props: {},
      slots: {},
    }
    // ШЕСТОЙ ОТКАЗ (финальное ревью фазы 4, Important 1): построение узла
    // начинки — `resolveCase` цели и вызов её `render` — обычный код чужой
    // фикстуры, а не наш; он имеет право бросить (кейс расходится с пропами,
    // `render` читает то, чего нет). Без `try/catch` бросок ушёл бы из
    // `loadFills` необработанным отклонением, тем же путём, ради ухода от
    // которого заведены `.then(ok, err)` у загрузки самой фикстуры (см. ниже)
    // и `.catch` на каждую начинку здесь: `setFills` не позвался бы
    // вовсе, и на экране осталась бы ПРЕЖНЯЯ начинка — то есть кадр соврал бы,
    // что ничего не изменилось, вместо честного отказа. Санитар:
    // frame-slots.test.tsx («начинка ПАДАЕТ при построении»).
    try {
      const targetProps = resolveCase(target, targetState)
      const kase = target.cases.find((x) => x.id === caseId) ?? target.cases[0]
      const render = kase?.render ?? target.render
      fills[slotId] = render ? render(targetProps as never, {}) : null
    } catch (err) {
      fills[slotId] = (
        <span className="wbf-slot-error">
          позиция «{slotId}»: начинка «{fill.c}» упала при построении —{' '}
          {err instanceof Error ? err.message : String(err)}
        </span>
      )
    }
  }

  return { fills, unplaced }
}

/**
 * Копии режима «Состояния» — по порядку слева направо.
 *
 * `null` — покой: у него НЕТ атрибута вовсе, а не пустой. Пустой атрибут
 * `data-wb-force=""` уже отвечал бы на `[data-wb-force]`, и прицел (Задача 32)
 * считал бы покойную копию форсированной.
 *
 * Порядок не алфавитный и не случайный: покой первым — это точка отсчёта, с
 * которой сравнивают остальные три; `:active` последним, потому что он
 * кратковременный и в споре «фокус против наведения» участвует реже всех.
 */
const STATE_COPIES: { state: ForceState | null; label: string }[] = [
  { state: null, label: 'покой' },
  { state: 'hover', label: ':hover' },
  { state: 'focus-visible', label: ':focus-visible' },
  { state: 'active', label: ':active' },
]

export function Frame() {
  const [state, setState] = useState(() => parseFrameUrl(window.location.search))
  const [fx, setFx] = useState<AnyFixture | null | undefined>(undefined)
  // Различает ДВА диагноза за одним `fx === null`: имени нет в реестре вовсе
  // (`.fixture.tsx` ещё не написан — это НЕ ошибка) и модуль ЕСТЬ, но падает
  // при импорте (это ошибка, и молчать про неё нельзя). Сбрасывается в НАЧАЛЕ
  // каждой загрузки — иначе диагноз прошлого имени остался бы висеть под новым.
  const [fxBroken, setFxBroken] = useState(false)
  const [fills, setFills] = useState<Record<string, ReactNode>>({})
  // Фактические тона копий — то, ради чего режим «Состояния» вообще нужен
  // числом, а не глазом (Задача 31). Пусто вне этого режима.
  const [tones, setTones] = useState<string[]>([])
  // Имя узла, с которого тон снят НЕ у самого выбранного (прозрачный `td` →
  // фон `tr`). Пусто — тон свой. Печатается в полосе: молчаливая подмена
  // превратила бы «фон этого узла» в «фон чего-то выше».
  const [toneFrom, setToneFrom] = useState<(string | null)[]>([])
  // Счётчик перезамера. Настоящее наведение мышью меняет тон копии, НЕ вызывая
  // перерисовки React, — и полоса застывала на числах, снятых под курсором:
  // увёл мышь, а «покой» так и стоит с тоном наведения. Найдено живым
  // прогоном, не тестом (jsdom указателя не имеет вовсе).
  const [toneTick, setToneTick] = useState(0)
  // Слой таб-стопов: прямоугольники в координатах документа кадра. Считается
  // из разметки на каждой перерисовке — тем же приёмом и по той же причине,
  // что тона: список стопов меняет почти всё, что меняет превью.
  const [stops, setStops] = useState<{ x: number; y: number; node: string; label: string }[]>([])
  const stopsSent = useRef('')
  // Слой axe (DS-78): прямоугольники НАРУШИВШИХ узлов. В отличие от
  // стопов считается асинхронно — отсюда `axeBusy`/`axeAgain` ниже.
  const [flaws, setFlaws] = useState<{ x: number; y: number; w: number; h: number }[]>([])
  const [axeTick, setAxeTick] = useState(0)
  const axeSent = useRef('')
  // Включён ли слой НА МОМЕНТ ЗАВЕРШЕНИЯ прогона. Прогон живёт дольше
  // перерисовки, а `state` в его замыкании — с момента запуска.
  const axeOn = useRef(false)
  const axeBusy = useRef(false)
  const axeAgain = useRef(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  // Прицел (Задача 32). Узел держится ССЫЛКОЙ, а не селектором: селектор
  // пришлось бы сначала написать, а прицеливаются как раз тогда, когда не
  // знают, как называется то, во что тыкают. `aimBox` — прямоугольник узла в
  // координатах документа кадра, пересчитывается на каждой перерисовке.
  const [aimNode, setAimNode] = useState<Element | null>(null)
  /**
   * `x`/`y` — координаты ДОКУМЕНТА: слой лежит абсолютом и едет вместе с
   * содержимым. `top` — тот же верх, но во ВЬЮПОРТЕ, и он здесь не дубликат:
   * по нему решается, переворачивать ли метку (DS-147). Вопрос «влезет
   * ли метка над узлом» — про край ЭКРАНА, а не про начало документа, и на
   * прокрученном кадре это разные числа.
   */
  const [aimBox, setAimBox] = useState<
    { x: number; y: number; w: number; h: number; top: number } | null
  >(null)
  // Сдвиг бейджа влево, когда он не помещается до правого края кадра. Замер, а
  // не CSS: ширину бейджа знает только раскладка, а прижать надо ровно на
  // вылезшее — см. `labelShiftOf`, там же обе находки, которые этим лечатся.
  const aimLabelRef = useRef<HTMLSpanElement | null>(null)
  /**
   * Путь до выбранного узла от корня превью — пишется, пока узел ЖИВ, и
   * читается, когда он уже снят (DS-147). В ref, а не в состоянии:
   * значение никого не перерисовывает, оно нужно ровно в момент замера.
   */
  const aimPathRef = useRef<number[] | null>(null)
  /** Счётчик прокруток: растёт, чтобы замер рамки прицела переснялся. */
  const [scrollTick, setScrollTick] = useState(0)
  const [aimLabelShift, setAimLabelShift] = useState(0)
  const [unplaced, setUnplaced] = useState<string[]>([])
  // Фикстуры мест канваса (DS-128) — по одной на место. ОТДЕЛЬНО от
  // `fx`, а не вместо него: содержимое канваса задаётся списком мест, а не
  // именем `c` из адреса, и одно не имеет права подменять другое. Ключа нет —
  // место ещё грузится; это третье состояние, и `null` его не выражает.
  const [spotFx, setSpotFx] = useState<Record<string, SpotFixture>>({})
  // РАСКЛАДКА КАНВАСА — состояние кадра, а не поле адреса: десять мест в адрес
  // по-хорошему не помещаются (решение спеки), и держать её в `FrameState`
  // значило бы заставить зеркало адреса врать о том, что восстанавливает
  // ссылка. Приезжает патчем целиком; до первого патча стоит умолчание.
  const [spots, setSpots] = useState<readonly CanvasSpot[]>(CANVAS_SPOTS)
  // Что из присланной раскладки не прочиталось. Списком строк, а не числом:
  // молчаливая потеря половины мест выглядит как «не сохранилось», и искать
  // будут в хранилище, а не в данных.
  const [spotsDropped, setSpotsDropped] = useState<string[]>([])
  // Выделенное место. Хранит его ОБОЛОЧКА и присылает патчем; здесь лежит
  // копия для отрисовки. Держи кадр источником правды — и док с канвасом
  // разъедутся при первом пересоздании `<iframe>`: кадр забудет, оболочка нет.
  const [selected, setSelected] = useState<string | null>(null)
  // Прямоугольник обводки выделенного места в координатах документа кадра.
  // Тем же приёмом и по тем же причинам, что `aimBox`: слой поверх, а не рамка
  // на самом месте (полный довод — у `.wbf-pick` в frame.css).
  const [pickBox, setPickBox] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  )
  const hostRef = useRef<HTMLDivElement | null>(null)

  // Адрес кадра — зеркало состояния: «открыть отдельной вкладкой» обязано
  // давать ровно то, что на экране. Запись дебаунсится (крутилка шлёт патч на
  // каждое нажатие клавиши, а `history.replaceState` браузеры троттлят);
  // создаётся один раз на подключение — `useRef`, а не состояние.
  const mirror = useRef<ReturnType<typeof makeMirror> | null>(null)
  if (!mirror.current) {
    mirror.current = makeMirror((url) => window.history.replaceState(null, '', url))
  }

  useEffect(() => {
    mirror.current?.push(buildFrameUrl(state))
  }, [state])

  // ЧЕГО ЭТО НЕ ПРОВЕРЯЕТ: снятие этой уборки не роняет ни один тест. У `Frame`
  // теперь есть unit-тест (`frame-slots.test.tsx`), но он про гонку начинок
  // позиций, а не про это зеркало — снятие уборки его не роняет. Сегодня это
  // допустимо: в продакшене документ кадра гибнет вместе со своим таймером, а в
  // `StrictMode` cleanup срабатывает тем же тиком — задолго до истечения
  // 250 мс. Перестанет быть допустимым, если `<iframe>` начнут пересобирать
  // так, что `window` переживёт React-дерево: тогда отложенная запись из
  // старого зеркала перепишет адрес поверх уже нового состояния.
  useEffect(() => () => mirror.current?.stop(), [])

  // ВЫБОР МЕСТА НА КАНВАСЕ (DS-128). Оболочке уходит имя места, она же
  // держит выделение и присылает его обратно патчем.
  //
  // ТЫЧОК НЕ ПЕРЕХВАТЫВАЕТСЯ, и это решение, а не недосмотр. Слушаем на
  // всплытии и ничего не гасим: на канвасе человеку нужно И выбирать место, И
  // работать с компонентом — открыть строку, нажать кнопку страницы. Отними
  // клик у компонента ради выбора — и канвас перестанет быть тем, ради чего
  // заведён; заведи для выбора отдельную ручку — её придётся искать глазами
  // при каждом переключении. Выбор пассивен: тычешь куда угодно внутри места,
  // и это место становится предметом дока, а клик идёт своей дорогой дальше.
  //
  // FOCUSIN РЯДОМ С POINTERDOWN, а не вместо него: канвас обязан слушаться
  // клавиатуры так же, как мышки. Пришёл табом в листалку — док про листалку,
  // и искать мышь для этого не надо.
  useEffect(() => {
    if (state.mode !== 'canvas') return
    const host = hostRef.current
    if (!host) return
    const pick = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest('[data-wb-spot]') : null
      const id = el?.getAttribute('data-wb-spot')
      if (!id) return
      const msg: Up = { type: 'canvas-pick', id }
      window.parent.postMessage(pack(state.sid, msg), window.location.origin)
    }
    host.addEventListener('pointerdown', pick)
    host.addEventListener('focusin', pick)
    return () => {
      host.removeEventListener('pointerdown', pick)
      host.removeEventListener('focusin', pick)
    }
    // `spots` в зависимостях: места пересоздаются, и слушатель обязан висеть
    // на живом хосте, а не на снятом со страницы.
  }, [state.mode, state.sid, spots])

  // Патч приходит вниз, пока кадр жив, и меняет состояние на лету — без
  // перезагрузки документа. Слушатель ставится один раз на сессию: `sid`
  // в зависимостях, а не в замыкании через `state`, иначе после первого же
  // патча эффект пересоздался бы вместе с обработчиком.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Третьим — окно оболочки: вниз сообщения приходят только от неё.
      // Кадр, открытый отдельной вкладкой, имеет `window.parent === window`
      // и слушает сам себя — то есть не слушает никого (DS-148).
      const body = unpack<Down>(e, state.sid, window.parent)
      if (!body) return
      if (body.type === 'patch') {
        setState((s) => applyPatch(s, body))
        // РАСКЛАДКА КАНВАСА — рядом с `applyPatch`, а не внутри него: та
        // работает над `FrameState`, то есть над разобранным АДРЕСОМ, а
        // раскладки в адресе нет и не будет (см. шапку `CanvasSpot`). Класть
        // её туда ради одного места применения значило бы завести поле,
        // которое `buildFrameUrl` обязан молча пропускать, — а зеркало адреса
        // держится ровно на том, что пропускать нечего.
        //
        // Приходит ЦЕЛИКОМ и заменяет, а не дополняет: место можно удалить, и
        // дельта, умеющая удалять, — это второй язык поверх списка.
        if (body.canvas !== undefined) {
          const parsed = parseSpots(body.canvas)
          setSpots(parsed.spots)
          setSpotsDropped(parsed.dropped)
        }
        if (body.canvasSelected !== undefined) setSelected(body.canvasSelected)
        return
      }
      if (body.type === 'ask-kinds') {
        // СИНХРОННО, и это вся суть DS-67: карта приезжает в кадр
        // виртуальным модулем (`fixtureKinds`, registry.ts), собранным
        // разбором исходников. Раньше здесь стоял `loadKinds`, грузивший ВСЕ
        // фикстуры разом — по динамическому импорту на каждую, с исполнением
        // модуля компонента и его стресс-данных, ровно в тот момент, когда
        // человек ждёт список. Ни одного модуля фикстуры больше не грузится:
        // санитар — shell-kinds.test.tsx («карта не зовёт loadFixture»).
        const msg: Up = { type: 'kinds', list: fixtureKinds() }
        window.parent.postMessage(pack(state.sid, msg), window.location.origin)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [state.sid])

  // Лист форс-состояний собирается ОДИН РАЗ на загрузку кадра, а не на каждое
  // переключение: обход CSSOM стоит миллисекунды (замерено: 4.5–14.6 на первом,
  // холодном проходе — правила за цепочкой `@import` материализуются на первое
  // чтение), а включение форса после него — запись атрибута, которая CSSOM не
  // трогает вовсе. Отсюда пустой список зависимостей: сценария «частое
  // переключение убьёт кадры» не существует, потому что частое переключение не
  // делает работы.
  //
  // ГОРЯЧАЯ ЗАМЕНА СТИЛЕЙ — единственный повод пересобрать лист. Правка CSS
  // компонента доезжает до кадра сама (Vite подменяет лист), а ДУБЛИКАТ без
  // сброса кэша остаётся прежним: на экране новый тон под курсором и старый
  // под форсом — то есть инструмент врёт ровно про то, ради чего заведён.
  // Ловится `vite:afterUpdate` с `css-update` среди обновлений; в сборке
  // `import.meta.hot` отсутствует, и ветка не существует вовсе.
  //
  // Число обхода уходит наверх ЗДЕСЬ, а не в `ready`: `ready` про фикстуру,
  // а это про листы кадра, и приходят они в разное время.
  useEffect(() => {
    const report = (): void => {
      const r = installForce(document)
      const msg: Up = { type: 'force-stats', ms: r.ms, skipped: r.skipped }
      window.parent.postMessage(pack(state.sid, msg), window.location.origin)
    }
    report()

    // ОБА метода, а не только `on`: в vitest `import.meta.hot` существует, но
    // это урезанный объект vite-node — `off` там нет вовсе, и подписка без
    // проверки роняла бы уборку эффекта на каждом тесте кадра (найдено ровно
    // так). Без пути отписаться подписываться нельзя: слушатель пережил бы
    // размонтирование и держал бы мёртвый кадр.
    const hot = import.meta.hot
    if (typeof hot?.on !== 'function' || typeof hot.off !== 'function') return
    const onUpdate = (payload: { updates?: { type?: string }[] }): void => {
      if (!payload.updates?.some((u) => u.type === 'css-update')) return
      resetForceCache()
      report()
    }
    hot.on('vite:afterUpdate', onUpdate)
    return () => hot.off('vite:afterUpdate', onUpdate)
  }, [state.sid])

  // ПРИЦЕЛ: щелчок выбирает узел. Слушатель на ФАЗЕ ПЕРЕХВАТА и с полной
  // остановкой события — иначе щелчок доедет до самого компонента: попадёшь в
  // кнопку «Удалить» и получишь диалог вместо выбора узла. По той же причине
  // гасится и `mousedown`: `preventDefault` на нём не даёт начаться выделению
  // текста и переводу фокуса, а без этого прицел по подписи ячейки выделял бы
  // текст на каждом щелчке.
  useEffect(() => {
    if (!state.aim) {
      setAimNode(null)
      return
    }
    const stop = (e: Event): void => {
      e.preventDefault()
      e.stopPropagation()
    }
    const onClick = (e: MouseEvent): void => {
      stop(e)
      const target = e.target
      if (!(target instanceof Element)) return
      // Щелчок по служебному узлу верстака (подпись копии, полоса тонов)
      // прицел не двигает: целятся в компонент, а не в инструмент.
      if (target.closest('.wbf-states__tone, .wbf-states__label')) return
      // Верхний узел под указателем — не обязательно тот, на который есть
      // смысл вешать форс: у иконочной кнопки это `<circle>` внутри
      // `<svg aria-hidden>`. Подъём до не скрытого предка — см. `aimTargetOf`.
      const picked = aimTargetOf(target)
      // Целились в декорацию, под которой нет ничего видимого диктору:
      // прицел не двигается вовсе — прежний выбор честнее случайного нового.
      if (picked === null) return
      // ALT — ПОДЪЁМ НА СТУПЕНЬ (находка [12] ручного QA). Щелчок отдаёт самый
      // глубокий узел, и `tr.is-clickable` закрыт своими `td` целиком: попасть
      // в строку, чтобы посмотреть её наведённой, было нечем.
      //
      // СЧИТАЕТСЯ ОТ ТЕКУЩЕГО ВЫБОРА, если щелчок пришёлся внутрь него, — иначе
      // подъём стоял бы на месте: второй Alt+клик по той же ячейке дал бы ту же
      // ячейку и того же родителя. Отсюда инвариант, на котором и держится
      // предсказуемость: выбранный узел ВСЕГДА содержит точку, по которой
      // щёлкнули, — жест уточняет, а не уводит.
      //
      // Заворота к самому глубокому узлу на вершине НЕТ: человек нажал «выше»
      // и оказался ниже всего, где был, — это читается как промах. Про то, что
      // выше некуда, тулбар говорит заранее счётчиком, а не молчанием после.
      if (e.altKey) {
        setAimNode((prev) => {
          const base = prev !== null && prev.contains(picked) ? prev : picked
          return aimChainOf(base)[1] ?? base
        })
        return
      }
      setAimNode((prev) => (prev === picked ? null : picked))
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('mousedown', stop, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('mousedown', stop, true)
    }
  }, [state.aim])

  // Выбранный узел уходит наверх ИМЕНЕМ: оболочка держит кадр за границей
  // документа и своих узлов там не имеет.
  useEffect(() => {
    const msg: Up = {
      type: 'aim',
      selector: aimNode ? describeNode(aimNode) : null,
      // Цепочка считается ЗДЕСЬ, а не в оболочке: узлы живут в документе кадра,
      // и оболочка их не видит. Имена те же, что у выбранного узла, — одной
      // функцией, иначе предок в счётчике и он же после подъёма назывались бы
      // по-разному.
      up: aimNode ? aimChainOf(aimNode).slice(1).map(describeNode) : [],
    }
    window.parent.postMessage(pack(state.sid, msg), window.location.origin)
  }, [aimNode, state.sid])

  // Атрибут форса на ВЫБРАННОМ узле и рамка вокруг него. Без списка
  // зависимостей — тем же доводом, что у замера тонов: React перерисовывает
  // превью от чего угодно, а атрибут, поставленный руками, при этом переживает
  // перерисовку только пока узел жив. Уборка снимает атрибут с ПРЕЖНЕГО узла:
  // без неё прицел, переведённый на соседа, оставлял бы форс на обоих.
  useEffect(() => {
    if (!aimNode) {
      setAimBox((prev) => (prev === null ? prev : null))
      return
    }
    // В режиме «Состояния» прицел НЕ ТРОГАЕТ форс: состояния копий заданы
    // жёстко атрибутом на их коробках, и снять его с одной ради выбранного
    // узла значило бы сломать сам ряд, ради которого сюда пришли. Здесь у
    // прицела другая роль — он выбирает, ЧТО сравнивать полосой тонов
    // (см. замер ниже). Роль одна и та же по сути: «на что мы смотрим».
    const moves = state.mode !== 'states'
    if (moves) {
      const value = forceAttrValue(state.force)
      if (value) aimNode.setAttribute(FORCE_ATTR, value)
      else aimNode.removeAttribute(FORCE_ATTR)
    }
    /**
     * УЗЕЛ МОГ УЙТИ ИЗ ДОКУМЕНТА (DS-147). Компонент, перерисовавший
     * поддерево, оставляет здесь ссылку на снятый узел, и
     * `getBoundingClientRect()` у отцепленного честно отвечает нулями. Нарисовав
     * по ним, слой давал огрызок 2+2 px в начале координат — форму, которая
     * читается как «прицел сломался», хотя выбор был верен и назван в тулбаре.
     *
     * Пересобираем по ПУТИ, а не по селектору: путь честно ломается на
     * разошедшемся дереве (`dom-path.ts`), а селектор нашёл бы «что-нибудь
     * похожее» — в таблице всегда первую строку. Не нашёлся — снимаем прицел:
     * узла, на который целились, больше нет, и молчаливая рамка не по нему
     * хуже снятой.
     */
    if (!aimNode.isConnected) {
      const root = state.mode === 'states' ? rowRef.current : hostRef.current
      const path = aimPathRef.current
      setAimNode(root && path ? nodeAt(root, path) : null)
      return
    }
    // Читается ЗДЕСЬ намеренно — тем же приёмом, что `toneTick` ниже: эффект без
    // списка зависимостей перезапускается на каждой перерисовке, а перерисовку
    // от прокрутки заводит этот счётчик.
    void scrollTick
    const aimRoot = state.mode === 'states' ? rowRef.current : hostRef.current
    if (aimRoot) aimPathRef.current = pathOf(aimRoot, aimNode) ?? aimPathRef.current
    const r = aimNode.getBoundingClientRect()
    const next = {
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      w: r.width,
      h: r.height,
      top: r.top,
    }
    setAimBox((prev) =>
      prev &&
      prev.x === next.x &&
      prev.y === next.y &&
      prev.w === next.w &&
      prev.h === next.h &&
      prev.top === next.top
        ? prev
        : next,
    )
    // Прижать бейдж к правому краю кадра, если он туда не помещается. Меряется
    // ПОСЛЕ отрисовки бейджа, поэтому в том же эффекте без списка зависимостей:
    // первый проход рисует бейдж со сдвигом 0, второй ставит настоящий. Скачка
    // не видно — оба прохода в одном кадре отрисовки.
    const label = aimLabelRef.current
    if (label !== null) {
      // ЛЕВЫЙ КРАЙ МЕРИТСЯ, А НЕ ВЫВОДИТСЯ ИЗ CSS. Первая редакция считала его
      // как `next.x - 2` по правилу `inset-inline-start: -2px` — и ошиблась
      // ровно на 2px: у `.wbf-aim` рамка 2px при `box-sizing: border-box`,
      // то есть содержащий блок бейджа начинается на 2px правее, и отступ
      // `-2px` её ровно компенсирует. Ширина прокрутки после прижатия
      // получалась 770 при кадре 768 — санитар и поймал.
      //
      // Считать «минус рамка плюс отступ» было бы вторым описанием того же
      // правила, и оно разошлось бы с ним при первой правке `frame.css`.
      // Замер не может разойтись ни с чем.
      const rect = label.getBoundingClientRect()
      // Положение БЕЗ уже применённого сдвига: иначе прижатие складывалось бы
      // само с собой на каждой перерисовке и уползало влево.
      const left = rect.left + window.scrollX - aimLabelShift
      const shift = labelShiftOf(left, rect.width, document.documentElement.clientWidth)
      setAimLabelShift((prev) => (prev === shift ? prev : shift))
    }
    return () => {
      if (moves) aimNode.removeAttribute(FORCE_ATTR)
    }
  })

  /**
   * ПЕРЕСНЯТЬ РАМКУ НА ПРОКРУТКЕ (DS-147).
   *
   * Замер выше пересчитывается на каждой перерисовке — а прокрутка перерисовки
   * не вызывает. Документные `x`/`y` от неё и не зависят, слой едет вместе с
   * содержимым; зависит `top`, по которому решается переворот метки. Без этого
   * слушателя решение, принятое в момент выбора, застывало бы: узел, уехавший
   * под верхний край кадра, оставался бы с меткой НАД собой, за краем.
   *
   * Слушателя нет, пока прицел ни во что не наведён, — а это подавляющее
   * большинство времени. `passive` обязателен: обработчик ничего не отменяет,
   * и без флага браузер обязан ждать его перед прокруткой.
   *
   * Прокручиваемый кадр в каталоге сегодня один (Prose), и ровно поэтому здесь
   * недорого: на остальных сорока событие не приходит вовсе.
   */
  useEffect(() => {
    if (!aimNode) return
    const onScroll = (): void => setScrollTick((n) => n + 1)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [aimNode])

  /**
   * ПОКАЗАТЬ ВЫДЕЛЕННОЕ МЕСТО ([9] ручного QA, DS-128).
   *
   * Место добавляют кнопкой в тулбаре, а встаёт оно в КОНЕЦ раскладки — то
   * есть у высокого канваса за нижним краем кадра. Человек жмёт «+ DataTable»,
   * на экране не меняется ничего, и он жмёт ещё раз: получает два места вместо
   * одного и идёт удалять лишнее.
   *
   * `block: 'nearest'` НЕСУЩИЙ, а не украшение аргумента: он значит «прокрути,
   * только если не видно». Без него щелчок по месту, которое и так на экране,
   * дёргал бы кадр под курсором — тот же шов, что горел на прицеле.
   *
   * ГЕОМЕТРИЮ СЧИТАЕМ НЕ МЫ. Соблазн сравнить прямоугольник места с окном и
   * решить самим понятен, но это второе описание того, что браузер уже умеет, —
   * и расходиться оно начнёт на первом же `position: sticky` в компоненте.
   *
   * Отдельным эффектом, а не внутри замера обводки ниже: у того НЕТ списка
   * зависимостей (он пересчитывается на каждый рендер), и прокрутка оттуда
   * дёргала бы кадр на каждую покрученную крутилку.
   */
  useEffect(() => {
    if (state.mode !== 'canvas' || selected === null) return
    const el = hostRef.current?.querySelector(`[data-wb-spot="${CSS.escape(selected)}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [state.mode, selected, spots])

  // Замер обводки выделенного места. Без списка зависимостей — как `aimBox`
  // выше: прямоугольник места меняет всё, что меняет раскладку (крутилки,
  // случай, тема, масштаб, состав мест), и любой перечень здесь был бы вторым
  // описанием того, «из чего складывается вид», расходящимся с первым молча.
  useEffect(() => {
    const host = hostRef.current
    const el =
      state.mode === 'canvas' && selected && host
        ? host.querySelector(`[data-wb-spot="${CSS.escape(selected)}"]`)
        : null
    if (!el) {
      setPickBox((prev) => (prev === null ? prev : null))
      return
    }
    const r = el.getBoundingClientRect()
    const next = {
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      w: r.width,
      h: r.height,
    }
    setPickBox((prev) =>
      prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
        ? prev
        : next,
    )
  })

  // ПЕРЕЗАМЕР ПО УКАЗАТЕЛЮ. Числа полосы обязаны говорить про то, что НА
  // ЭКРАНЕ СЕЙЧАС: пока курсор над копией, она и правда наведена, и её тон —
  // тон наведения; ушёл курсор — тон обязан вернуться. Склейка через
  // `requestAnimationFrame`: `pointerover` летит на каждый пересечённый узел,
  // а замер стоит четырёх `getComputedStyle`.
  useEffect(() => {
    if (state.mode !== 'states') return
    let queued = 0
    const bump = (): void => {
      if (queued) return
      queued = requestAnimationFrame(() => {
        queued = 0
        setToneTick((t) => t + 1)
      })
    }
    document.addEventListener('pointerover', bump, true)
    document.addEventListener('pointerout', bump, true)
    return () => {
      if (queued) cancelAnimationFrame(queued)
      document.removeEventListener('pointerover', bump, true)
      document.removeEventListener('pointerout', bump, true)
    }
  }, [state.mode])

  // СЛОЙ ТАБ-СТОПОВ (Задача 33). Без списка зависимостей — как замер тонов:
  // стопы меняются от крутилок, набора данных, начинок и самой фикстуры.
  // Наверх уходит СПИСОК, и только когда он изменился: `postMessage` на каждой
  // перерисовке залил бы оболочку сообщениями (и её же перерисовками).
  useEffect(() => {
    const on = state.layers.includes('tabstops')
    const root = state.mode === 'states' ? rowRef.current : hostRef.current
    if (!on || !root) {
      setStops((prev) => (prev.length ? [] : prev))
      if (stopsSent.current !== '') {
        stopsSent.current = ''
        const msg: Up = { type: 'tabstops', stops: [] }
        window.parent.postMessage(pack(state.sid, msg), window.location.origin)
      }
      return
    }
    // КОРНЕЙ НЕСКОЛЬКО (DS-163): оверлеи Modal, Drawer и тостера —
    // прямые дети `body` кадра. От одного хоста слой печатал на открытом окне
    // НОЛЬ стопов, и это худший вид ошибки: пустой список читается как
    // «проверено, клавиатура сюда не доходит», хотя внутри окна их три.
    const next = tabStops(previewRoots(root)).map((el) => {
      const r = el.getBoundingClientRect()
      return {
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        node: describeNode(el),
        label: stopLabel(el),
      }
    })
    const key = JSON.stringify(next)
    setStops((prev) => (JSON.stringify(prev) === key ? prev : next))
    const upKey = JSON.stringify(next.map((s2) => [s2.node, s2.label]))
    if (stopsSent.current !== upKey) {
      stopsSent.current = upKey
      const msg: Up = {
        type: 'tabstops',
        stops: next.map((s2) => ({ node: s2.node, label: s2.label })),
      }
      window.parent.postMessage(pack(state.sid, msg), window.location.origin)
    }
  })

  // СЛОЙ AXE (DS-78). Без списка зависимостей — по тому же доводу, что
  // стопы и тона: нарушения меняет всё, что меняет разметку.
  //
  // ПОЧЕМУ ЭТО НЕ ЗАЦИКЛИВАЕТСЯ, хотя прогон асинхронный и кладёт результат в
  // состояние. Прогон запускается только когда предыдущий кончился
  // (`axeBusy`), а результат кладётся в состояние ТОЛЬКО когда он отличается
  // от прежнего. Значит устойчивая разметка стоит максимум двух прогонов:
  // первый меняет состояние, второй видит то же самое и останавливается.
  //
  // ПОЧЕМУ ОТМЕНА НЕ ПО `alive` ЭФФЕКТА, как у остальных асинхронных мест.
  // Эффект без зависимостей переустанавливается на КАЖДОЙ перерисовке, а
  // перерисовок за время прогона (150 мс) случается несколько: флаг «этот
  // эффект уже не актуален» гасил бы каждый начатый прогон, и слой не
  // отвечал бы никогда. Отменяет не эффект, а СМЕНА КОРНЯ — единственное,
  // из-за чего результат правда становится не про то, что на экране.
  useEffect(() => {
    // `axeTick` читается ЗДЕСЬ по тому же уговору, что `toneTick` ниже: эффект
    // без списка зависимостей перезапускается на каждой перерисовке, а
    // перерисовку после отложенного прогона и заводит счётчик.
    void axeTick
    const on = state.layers.includes('axe')
    axeOn.current = on
    const root = state.mode === 'states' ? rowRef.current : hostRef.current
    if (!on) {
      setFlaws((prev) => (prev.length ? [] : prev))
      if (axeSent.current !== '') {
        axeSent.current = ''
        // Пустой отчёт, а не молчание: молчание оболочка не отличит от «ещё
        // считаем», и вкладка осталась бы со списком от выключенного слоя.
        const msg: Up = { type: 'a11y', violations: [], incomplete: [], applied: 0 }
        window.parent.postMessage(pack(state.sid, msg), window.location.origin)
      }
      return
    }
    // КОРНЯ НЕТ, А СЛОЙ ВКЛЮЧЁН — свой разряд, а не пустой отчёт
    // (DS-163). Пустой отчёт док печатал как «смотреть было нечего:
    // пустое превью или фикстура не отрисовалась», то есть один текст на два
    // разных факта, из которых чинятся они в разных местах.
    //
    // НО НЕ ПОКА ФИКСТУРА ГРУЗИТСЯ. `fx === undefined` — это «ещё едет», и
    // корня в этот миг нет у КАЖДОЙ загрузки: сказать про него «кадр не
    // отрисовал фикстуру» значило бы моргать красным на здоровом пути и
    // приучить проходить мимо. Честный ответ на этот миг у дока уже есть —
    // «Кадр считает…», и он печатается ровно от молчания.
    //
    // `axeSent` здесь обычный, а не сброс в `''`: сброс — знак «слоя нет», и
    // им нельзя помечать состояние, из которого кадр ещё вернётся с отчётом.
    if (!root && state.mode !== 'canvas' && fx === undefined) return
    if (!root) {
      setFlaws((prev) => (prev.length ? [] : prev))
      const msg: Up = {
        type: 'a11y',
        violations: [],
        incomplete: [],
        applied: 0,
        noRoot: true,
      }
      const upKey = JSON.stringify(msg)
      if (axeSent.current !== upKey) {
        axeSent.current = upKey
        window.parent.postMessage(pack(state.sid, msg), window.location.origin)
      }
      return
    }
    if (axeBusy.current) {
      axeAgain.current = true
      return
    }
    // СКЛЕЙКА ПЕРЕРИСОВОК. Эффект без списка зависимостей переустанавливается
    // на каждой перерисовке, и его уборщик гасит отложенный запуск — то есть
    // прогон стартует только после затишья.
    //
    // Замерено ДО этой строки, живой хром, режим «Состояния»: 25 прогонов за
    // 2 с движения указателя, по одному на 80 мс. Перезамер тонов бампает
    // счётчик на каждый rAF, `axeBusy` склеивает только те перерисовки, что
    // попали ВНУТРЬ идущего прогона, а следующая за его концом запускает
    // новый — и так, пока едет мышь. Стоит это полного обхода axe по четырём
    // копиям, ровно когда смотрят на тона.
    //
    // 200 мс: заметно меньше, чем пауза между осмысленными действиями, и
    // заметно больше кадра.
    const started = setTimeout(() => {
      axeBusy.current = true
      startRun(root)
    }, AXE_QUIET_MS)
    return () => clearTimeout(started)
  })

  /** Прогон слоя axe — вынесен из эффекта, чтобы уборщик гасил только ожидание. */
  function startRun(root: Element): void {
    // ПРИБОР УХОДИТ ИЗ КАДРА НА ВРЕМЯ ПРОГОНА (DS-195). Правило
    // `color-contrast` берёт фон из стопки элементов под текстом, и любая
    // метка ПОВЕРХ него делает фон неопределимым: axe отвечает `incomplete`
    // с `bgOverlap`. А `.wbf-flaw` рисуется ИЗ РЕЗУЛЬТАТА прогона — то есть
    // слой правил вход следующего прогона своим же выходом и не сходился
    // никогда: нашёл → обвёл → «не решено» → снял обводки → нашёл снова, раз
    // в секунду, вечно. Правило прячет `frame.css`, здесь только знак.
    //
    // Снимается в `finally`, а не после `then`: упавший прогон обязан вернуть
    // метки так же, как удачный, иначе кадр остался бы без них до следующей
    // перерисовки.
    document.documentElement.setAttribute(AXE_RUN_ATTR, 'run')
    // Синхронный дёрг раскладки: axe читает стопку элементов сразу, и без
    // него первый замер успел бы пройти по ещё не применённому стилю.
    void document.body.offsetHeight
    void runAxe(previewRoots(root))
      .then((report) => {
        // СЛОЙ СНЯЛИ, ПОКА СЧИТАЛИ. Результат не отправляем И НЕ ЗАПИСЫВАЕМ в
        // `axeSent`: оболочка отчёты выключенного слоя выбрасывает, а запись
        // «уже отправлено» пережила бы выключение — следующее включение дало
        // бы тот же результат, кадр счёл бы его отправленным и промолчал, а
        // вкладка осталась бы на «Кадр считает…» до смены фикстуры.
        //
        // Ловится только на ЗДОРОВОЙ фикстуре: там, где нарушения есть,
        // `setFlaws` меняет состояние, перерисовка запускает ветку `!on`, и
        // она случайно чинит запись. Здоровый компонент такой компенсации не
        // даёт — а он же и типичный.
        if (!axeOn.current) return
        const now = state.mode === 'states' ? rowRef.current : hostRef.current
        // Корень сменился, пока считали (щёлкнули «Кадр ↔ Состояния»):
        // результат про прошлый экран, применять его нельзя.
        if (now !== root) {
          axeAgain.current = true
          return
        }
        const boxes = report.violations.flatMap((v) =>
          v.nodes.map((n) => {
            const r = n.el.getBoundingClientRect()
            return {
              x: r.left + window.scrollX,
              y: r.top + window.scrollY,
              w: r.width,
              h: r.height,
            }
          }),
        )
        const boxKey = JSON.stringify(boxes)
        setFlaws((prev) => (JSON.stringify(prev) === boxKey ? prev : boxes))

        const body: Up = {
          type: 'a11y',
          violations: report.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.map((n) => ({ node: n.node })),
          })),
          incomplete: report.incomplete,
          applied: report.applied,
        }
        const upKey = JSON.stringify(body)
        if (axeSent.current !== upKey) {
          axeSent.current = upKey
          window.parent.postMessage(pack(state.sid, body), window.location.origin)
        }
      })
      .catch((e: unknown) => {
        if (!axeOn.current) return
        // Контуры прошлого — удачного — прогона гасим: иначе кадр рисует
        // обводки, пока док говорит «посчитать не удалось».
        setFlaws((prev) => (prev.length ? [] : prev))
        // Упавший слой не имеет права ронять кадр — но и молчать не имеет
        // права. Проглоченный отказ оставлял вкладку на «Кадр считает…»
        // навсегда: ни ошибки, ни повтора, ни таймаута. А спотыкается axe
        // чаще всего на сломанном компоненте, то есть ровно там, ради чего
        // верстак существует.
        const body: Up = {
          type: 'a11y',
          violations: [],
          incomplete: [],
          applied: 0,
          // Пустое сообщение недопустимо: `error` читается на истинность, и
          // `new Error('')` провалился бы в ветку «смотреть было нечего» —
          // то есть упавший прогон снова притворился бы безобидным.
          error: (e instanceof Error ? e.message : String(e)) || 'без объяснения',
        }
        const upKey = JSON.stringify(body)
        if (axeSent.current !== upKey) {
          axeSent.current = upKey
          window.parent.postMessage(pack(state.sid, body), window.location.origin)
        }
      })
      .finally(() => {
        document.documentElement.removeAttribute(AXE_RUN_ATTR)
        axeBusy.current = false
        // Перерисовка, случившаяся ВО ВРЕМЯ прогона, не теряется: тик
        // вызывает перерисовку, а та — этот же эффект уже со свежим корнем.
        if (axeAgain.current) {
          axeAgain.current = false
          setAxeTick((t) => t + 1)
        }
      })
  }

  // ЗАМЕР ТОНОВ. Без списка зависимостей НАМЕРЕННО: тон копии меняет почти
  // всё — тема, масштаб, крутилки, набор данных, начинки, приехавший лист
  // форса, — и любой перечень здесь был бы вторым, вручную поддерживаемым
  // описанием того, «из чего складывается вид», расходящимся с первым молча.
  // Цикла не будет: результат кладётся в состояние ТОЛЬКО когда он отличается
  // от прежнего, а два одинаковых прохода подряд заканчивают перерисовку.
  useEffect(() => {
    const row = rowRef.current
    if (state.mode !== 'states' || !row) {
      setTones((prev) => (prev.length ? [] : prev))
      setToneFrom((prev) => (prev.length ? [] : prev))
      return
    }
    const boxes = Array.from(row.querySelectorAll<HTMLElement>('.wbf-states__box'))
    // ЧТО ИМЕННО СРАВНИВАЕТСЯ. По умолчанию — корневой элемент копии (не сама
    // коробка: она служебный div без фона, её тон одинаков всегда и не значит
    // ничего). Но у составного компонента состояние живёт НЕ на корне: у
    // DataTable наведение красит строку, и полоса по корню честно печатала бы
    // четыре «прозрачно» и «= покой» под наведённой копией, которая на экране
    // явно другая, — числа, верные не о том.
    //
    // Поэтому прицел выбирает узел, а путь до него ПЕРЕНОСИТСЯ в остальные
    // копии по индексам (dom-path.ts): деревья копий одинаковы, и это тот же
    // самый узел, а не похожий.
    const aimPath = (() => {
      if (!aimNode) return null
      const own = boxes.find((b) => b.contains(aimNode))
      return own ? pathOf(own, aimNode) : null
    })()
    // `toneTick` читается ЗДЕСЬ намеренно: эффект без списка зависимостей
    // перезапускается на каждой перерисовке, а перерисовку и заводит счётчик.
    void toneTick
    const read = (e: Element): string => window.getComputedStyle(e).backgroundColor
    const measured = boxes.map((box) => {
      const picked = aimPath ? nodeAt(box, aimPath) : null
      const el = picked ?? box.firstElementChild ?? box
      return effectiveTone(el, box, read)
    })
    const next = measured.map((t) => t.value)
    const from = measured.map((t) => (t.own || !t.from ? null : describeNode(t.from)))
    setTones((prev) =>
      prev.length === next.length && prev.every((t, i) => t === next[i]) ? prev : next,
    )
    setToneFrom((prev) =>
      prev.length === from.length && prev.every((t, i) => t === from[i]) ? prev : from,
    )
  })

  // Тема и масштаб — то, что патч двигает чаще всего. Зависимости — сами
  // значения, а не весь `state`: иначе патч пропсов или набора данных тоже
  // перекрашивал бы документ без нужды.
  useEffect(() => {
    applyFrameEnv(document, { theme: state.theme, scale: state.scale })
  }, [state.theme, state.scale])

  // Загрузка модуля фикстуры зависит ТОЛЬКО от компонента и сессии: патч
  // пропсов/темы/масштаба не должен перезагружать фикстуру и слать лишний
  // `ready` — состояние компонента внутри кадра (открытый Combobox, скролл
  // таблицы) держится ровно потому, что модуль не перезагружается зря.
  useEffect(() => {
    let alive = true
    setFxBroken(false)
    // `.then(onFulfilled, onRejected)` ДВУМЯ АРГУМЕНТАМИ, а не
    // `.then(...).catch(...)` (ревью Task 5+6): у цепочки `.catch` после
    // `.then` ловит броски из ОБЕИХ веток — и из отклонения `loadFixture`,
    // и из своего же УСПЕШНОГО колбэка (`metaOf`, `postMessage`). Брось
    // что-нибудь `metaOf` — и код молча объявит рабочую фикстуру «не
    // грузится» и пошлёт второй, лживый `ready`. Двухаргументная форма
    // разбирает `onRejected` ТОЛЬКО если отклонился сам промис `loadFixture`.
    void loadFixture(state.c).then(
      (f) => {
        if (!alive) return
        setFx(f)
        // `ready` шлём и когда фикстуры нет: «пусто» — законный результат, и
        // оболочка не должна держать скелет над осмысленным сообщением.
        // Вместе с ним едет состав случаев: оболочка не грузит фикстуры сама.
        const msg: Up = { type: 'ready', meta: f ? metaOf(f) : null }
        window.parent.postMessage(pack(state.sid, msg), window.location.origin)
      },
      () => {
        // НАХОДКА (Задача 3 → Задача 5): модуль ЕСТЬ, но падает при импорте —
        // `loadFixture` в этом случае ОТКЛОНЯЕТСЯ, а не отдаёт `null`. Без
        // обработки отклонение осталось бы необработанным: `ready` никогда
        // не ушёл бы, и оболочка через READY_TIMEOUT_MS написала бы «кадр не
        // ответил» — то же самое молчание, ради ухода от которого карта видов
        // отвечает В ЛЮБОМ случае (см. `ask-kinds` выше). Лечится тем
        // же приёмом: отвечаем `ready` всегда, а различие «файла нет» и
        // «файл есть, но падает» несём в `fxBroken` — это разные диагнозы,
        // и молчаливо путать их для человека, чинящего кадр, нельзя.
        if (!alive) return
        setFx(null)
        setFxBroken(true)
        const msg: Up = { type: 'ready', meta: null }
        window.parent.postMessage(pack(state.sid, msg), window.location.origin)
      },
    )
    return () => {
      alive = false
    }
  }, [state.c, state.sid])

  // ФИКСТУРЫ МЕСТ КАНВАСА (DS-128). Реестр ленивый (`registry.ts`), и
  // `import()` на каждое место — та же дорога, что сегодня на одну фикстуру.
  //
  // Форма `.then(onFulfilled, onRejected)` ДВУМЯ АРГУМЕНТАМИ — та же и по тому
  // же доводу, что у загрузки одиночной фикстуры выше: цепочечный `.catch`
  // ловил бы и брос из УСПЕШНОЙ ветки, то есть объявлял бы рабочую фикстуру
  // «падает при импорте».
  //
  // Отсутствие фикстуры и падение при импорте различены (`broken`) — иначе
  // канвас повторил бы ровно тот дефект, ради ухода от которого у одиночной
  // фикстуры заведён `fxBroken`.
  useEffect(() => {
    if (state.mode !== 'canvas') return
    let alive = true
    for (const spot of spots) {
      void loadFixture(spot.component).then(
        (f) => {
          if (!alive) return
          setSpotFx((prev) => ({ ...prev, [spot.id]: { fx: f, broken: false } }))
          // Состав случаев и крутилок — наверх СРАЗУ, не дожидаясь выделения:
          // док обязан быть готов к тому, что в место ткнут.
          const msg: Up = { type: 'canvas-meta', id: spot.id, meta: f ? metaOf(f) : null }
          window.parent.postMessage(pack(state.sid, msg), window.location.origin)
        },
        () => {
          if (!alive) return
          setSpotFx((prev) => ({ ...prev, [spot.id]: { fx: null, broken: true } }))
          // И на отказе тоже: молчание оболочка не отличит от «ещё грузится»,
          // и док остался бы пустым навсегда. Тот же довод, что у `ready`.
          const msg: Up = { type: 'canvas-meta', id: spot.id, meta: null }
          window.parent.postMessage(pack(state.sid, msg), window.location.origin)
        },
      )
    }
    return () => {
      alive = false
    }
  }, [state.mode, spots])

  // Начинки позиций — второй асинхронный источник контента кадра, независимый
  // от загрузки самой фикстуры: у каждой начинки свой `loadFixture`, и сеть не
  // гарантирует, что ответы придут в порядке отправки. Сторожим РОВНО то, что
  // медленно разрешившийся ПЕРВЫЙ набор начинок (для прежнего состава позиций)
  // не перепишет собой уже нарисованный ВТОРОЙ — экран не должен откатиться к
  // устаревшей начинке после того, как адрес уже сменился.
  //
  // Зависимости ýже, чем то, что читает замыкание: `loadFills` внутри строит
  // `targetState` с `s.theme`/`s.scale`, но ни то ни другое `resolveCase` не
  // использует (см. `resolve-case.ts`) — они там только ради типа `FrameState`.
  // Патч темы/масштаба не должен перезагружать начинки заново, тем же
  // обоснованием, что и у соседнего эффекта темы/масштаба выше.
  useEffect(() => {
    if (!fx) {
      setFills({})
      setUnplaced([])
      return
    }
    let alive = true
    // `.then(onFulfilled, onRejected)` ДВУМЯ АРГУМЕНТАМИ — та же форма и тот
    // же довод, что у загрузки самой фикстуры выше (Задача 3→5): цепочечный
    // `.catch` после `.then` ловил бы и брос ИЗ УСПЕШНОЙ ветки (`setFills`/
    // `setUnplaced` здесь их не бросают, но расхождение форм по всему файлу —
    // само по себе источник ошибки при следующей правке). Отклонение самого
    // `loadFills` сегодня по построению узла уже закрыто `try/catch` внутри
    // (см. её тело выше) — вторая ветка здесь на случай, если что-то ДРУГОЕ в
    // `loadFills` бросит мимо той защиты (найдено ревью финала фазы 4,
    // Important 1: третий асинхронный путь кадра оставался без ветки отказа
    // вовсе). Без неё — ТА ЖЕ болезнь, что чинит `try/catch` выше: `setFills`
    // не позвался бы, и на экране осталась бы ПРЕЖНЯЯ начинка при уже
    // сменившемся адресе — кадр молчал бы, вместо того чтобы честно отказать.
    // Санитар: frame-slots.test.tsx («loadFills целиком отклонился»).
    void loadFills(fx, state).then(
      (f) => {
        if (!alive) return
        setFills(f.fills)
        setUnplaced(f.unplaced)
      },
      (err) => {
        if (!alive) return
        setFills({})
        setUnplaced([
          `начинки этого случая не удалось построить: ${err instanceof Error ? err.message : String(err)}`,
        ])
      },
    )
    return () => {
      alive = false
    }
  }, [fx, state.caseId, state.slots])

  useEffect(() => {
    const host = hostRef.current
    // `fx` не требуется КАНВАСУ: его размер — размер набора мест, а одиночная
    // фикстура там не рисуется вовсе. Без этой поправки оболочка не получала бы
    // «фактическое» с канваса всякий раз, когда у `c` из адреса фикстуры нет, —
    // а на канвасе `c` не значит ничего.
    if (!host || (!fx && state.mode !== 'canvas')) return
    // Наблюдаем корень превью: это то, что нарисовала фикстура.
    return reportSize(host, (w, h, { cw, bar }) => {
      const msg: Up = { type: 'size', w, h, cw, bar }
      window.parent.postMessage(pack(state.sid, msg), window.location.origin)
    })
    // `state.mode` в зависимостях — несущее: при смене вида `hostRef`
    // переезжает на другой узел (в «Состояниях» мерится копия ПОКОЯ), и без
    // пересоздания наблюдатель остался бы висеть на снятом со страницы узле,
    // а «фактическое» в тулбаре — на числе от прошлого вида.
  }, [fx, state.sid, state.mode])

  // ОДИНОЧНЫЕ ВИДЫ смотрят на `state.c`; канвас — нет. Его содержимое задано
  // списком мест (`canvas-plan.ts`), и ранние возвраты по одиночной фикстуре
  // отвечали бы там не на тот вопрос: «у `c` нет фикстуры» погасило бы весь
  // канвас целиком, хотя ни одно место на нём про `c` не спрашивало.
  const solo = state.mode !== 'canvas'
  if (solo && fx === undefined) return null

  // Отсутствие фикстуры отличается от ошибки СЛОВАМИ, а не пустотой: пустой
  // прямоугольник читается как поломка, и на выяснение уходит время. Тем же
  // приёмом различены ДВА разных «фикстуры нет»: имени нет в реестре (не
  // ошибка, просто не написан файл) и файл есть, но падает при импорте
  // (ошибка, и молчать про неё нельзя — см. `.catch` выше, `fxBroken`).
  if (solo && fx === null) {
    return (
      <div className="wbf-empty">
        <div className="wbf-empty__title">{fxBroken ? 'Фикстура не грузится' : 'Фикстуры нет'}</div>
        <p className="wbf-empty__text">
          {fxBroken ? (
            <>
              Файл <code>{state.c || 'Component'}.fixture.tsx</code> есть, но падает при импорте —
              смотри консоль браузера. Это ошибка МОДУЛЯ фикстуры, а не кадра.
            </>
          ) : (
            <>
              У компонента <code>{state.c || '—'}</code> ещё не написан файл{' '}
              <code>{state.c || 'Component'}.fixture.tsx</code>. Это не ошибка — просто до него
              не дошла очередь.
            </>
          )}
        </p>
      </div>
    )
  }

  const forceAttr = forceAttrValue(state.force)
  // `fx` здесь ненулевой во ВСЕХ видах, кроме канваса: возвраты выше отсеяли
  // оба «фикстуры нет», но только для одиночных. На канвасе одиночная фикстура
  // не рисуется вовсе — там рисуются места, и `view` остаётся неиспользованным.
  const kase = fx ? (fx.cases.find((x) => x.id === state.caseId) ?? fx.cases[0]!) : null
  const view =
    fx && kase ? (
      <FixtureView render={kase.render ?? fx.render} props={resolveCase(fx, state)} slots={fills} />
    ) : null
  const sameTone = sameAsBefore(
    tones,
    STATE_COPIES.map((x) => x.label),
  )
  /**
   * ПСЕВДОЛОКАЛЬ (DS-139, приёмка) — провайдер поверх ВСЕГО дерева кадра,
   * то есть над всеми тремя видами разом: одиночным, «состояниями» и канвасом.
   * Иначе набор текста зависел бы от вида, и «в состояниях ключи видно, а на
   * канвасе нет» читалось бы как дефект компонента.
   *
   * ПРОВАЙДЕР СТОИТ ВСЕГДА, и при `ru` получает пустые переопределения. Первая
   * редакция оборачивала УСЛОВНО — доводом «умолчание обязано работать без
   * провайдера, и верстак должен показывать ту же сборку, что поедет
   * потребителю». Довод верный, а решение неверное: появление и исчезновение
   * узла МЕНЯЕТ ФОРМУ ДЕРЕВА, и React перемонтирует всё под ним. Живое
   * состояние компонента при этом гибнет — а разглядывают ключи ровно в
   * развёрнутом меню и в открытой строке, то есть именно в том состоянии,
   * которое переключатель и ронял. Поймано `frame-text.test.tsx`, санитаром
   * про «туда и обратно» (MOUNT 2 после патча).
   *
   * Что при этом потеряно и почему не жаль: путь «вообще без провайдера»
   * верстак больше не проходит. Он проверяется там, где проверяется лучше — в
   * `wiring.test.tsx` и вообще в каждом юнит-тесте пакета, где провайдера нет
   * ни одного. А `{}` поверх умолчания даёт `{ ...DS_TEXT_RU }` — тот же текст
   * до знака, отличается только ссылка, которую компоненты не читают.
   *
   * Обе ссылки МОДУЛЬНЫЕ и стабильные — того требует шапка `DsText`: объект,
   * созданный заново на каждый рендер, перерисовал бы всех потребителей
   * контекста, включая `React.memo`-поддеревья. Литерал `{}` прямо в JSX был
   * бы ровно этой ошибкой.
   */
  return (
    <DsText value={TEXT_BY_MODE[state.text]}>
    <>
      {/* `hostRef` мерит РОВНО то, что нарисовала фикстура (см. `reportSize`
          ниже и комментарий у `.wbf-host` в frame.css) — полоса неразмещённых
          отказов ей не ребёнок, а сосед: попади она внутрь, оболочка получила
          бы размер служебного текста вместо размера компонента. */}
      {/* Атрибут форса — на КОРНЕ превью. Дубликат правил собран в двух формах
          (см. force-states.ts): «сам» ловит корень, «предок» — всё, что внутри.
          Отсюда и умолчание, и его честная граница: одиночная кнопка форсируется
          верно, а у таблицы подсветится всё разом. Сузить до одного узла —
          прицел, Задача 32. */}
      {state.mode === 'canvas' ? (
        /* КАНВАС (DS-128, шаг 1) — несколько РАЗНЫХ компонентов в ОДНОМ
           хосте, ради отношений между ними: сквозной таб-порядок, всплывающее
           поверх соседа, общая ширина. Раскладка жёстко задана и ничего не
           настраивает (`canvas-plan.ts`): шаг существует ради одного вопроса —
           живут ли слои поверх нескольких компонентов.

           `hostRef` — НА КОРНЕ КАНВАСА, и это всё, что понадобилось слоям:
           `tabStops(root)` и `runAxe(root)` принимают КОРЕНЬ ПОДДЕРЕВА, а не
           документ, и ветка `state.mode === 'states' ? rowRef : hostRef` в них
           уже отдаёт канвасу правильный узел. Ни строки правок в самих слоях.
           Проверять это надо ЗАМЕРОМ (шаг 2), а не тем, что здесь написано.

           ГРАНИЦА ОШИБОК — НА КАЖДОЕ МЕСТО, в отличие от «Состояний», где она
           одна на четыре копии. Там копии рисуют ОДНУ фикстуру с одними
           пропсами, и падение у них общее. Здесь компоненты разные: упавшая
           листалка не имеет права уносить с собой таблицу — канвас ответил бы
           «сломано всё», когда сломано одно, и искать пришлось бы вслепую.

           АТРИБУТ ФОРСА — на корне канваса, как и у одиночного кадра, и это
           значит, что форс красит ВСЕ места разом. Не дефект, а известная
           граница формы «предок» (см. force-states.ts), просто шире обычной:
           у одиночного кадра так подсвечивается вся таблица, здесь — весь
           набор. Сузить до одного места — прицел уже сегодня, а выделенная
           позиция — шаг 4. */
        <div
          className="wbf-canvas"
          ref={hostRef}
          {...{ [FORCE_ATTR]: aimNode ? undefined : (forceAttr ?? undefined) }}
        >
          {/* ПУСТОЙ КАНВАС ГОВОРИТ, ЧТО ОН ПУСТ ([11] ручного QA,
              DS-128). Убрав последнее место, человек получал пустое
              белое поле — неотличимое от «фикстура не загрузилась»,
              «раскладка не доехала» и «верстак сломался». Три разных беды с
              одним видом, и разобраться в них он может только полезши в
              консоль.

              ГОВОРИТ КАДР, А НЕ ПОЛОСА ОБОЛОЧКИ, хотя полоса про счёт мест уже
              есть ([9]). Пустое место на экране — это вопрос про КАДР, и
              отвечать на него надо там, куда человек смотрит. Полоса под
              тулбаром отвечает про последнее ДЕЙСТВИЕ, а канвас бывает пуст и
              без действия — например сразу после загрузки набора, из которого
              разбор выбросил всё.

              То же слово, что и в доке при пустом наборе: два разных
              объяснения одной пустоты читались бы как две разных пустоты. */}
          {spots.length === 0 && (
            <div className="wbf-canvas__gap wbf-canvas__empty">
              На канвасе нет ни одного места. Добавь компонент кнопкой «+» в тулбаре или
              загрузи сохранённый набор.
            </div>
          )}
          {spots.map((spot) => (
            /* `data-wb-spot` — имя места В РАЗМЕТКЕ. Нужно не сегодня: на нём
               держатся прицел, называющий компонент вместе с узлом (шаг 6), и
               замер шага 2, которому надо утверждать, что стопы пришли из
               ОБОИХ мест, а не вдвое больше из одного. */
            /* ПРИЗНАК ВЫДЕЛЕНИЯ — `aria-current`, а НЕ `aria-selected`, и это
               расхождение с формулировкой решения владельца, сделанное по его
               же смыслу. `aria-selected` допустим только на `option`, `row`,
               `tab`, `gridcell`, `treeitem` и заголовках; на голом `div` это
               невалидный ARIA, и поймал бы его ровно тот слой axe, ради
               которого верстак существует. Дать месту `role="option"` тоже
               нельзя: внутри живут кнопки и строки, то есть интерактивное
               внутри интерактивного (гейт `no-nested-interactive`).
               `aria-current` валиден на любом элементе, означает «текущий в
               наборе» и уже так работает в системе — текущая строка
               `DataTable` (DS-92). Замысел — видно и озвучено —
               выполняется целиком.

               Обводка при этом рисуется НЕ бордюром на месте, а тенью в
               `frame.css`: бордюр сдвинул бы раскладку, то есть исказил ровно
               то, ради чего канвас собирают. Тот же довод, что у рамки
               прицела. */
            <div
              className="wbf-canvas__spot"
              key={spot.id}
              {...{ [SPOT_ATTR]: spot.id }}
              aria-current={spot.id === selected ? true : undefined}
              style={{ gridColumn: `${spot.col} / span ${spot.span}` }}
            >
              <CanvasSpotView
                spot={spot}
                loaded={spotFx[spot.id]}
                theme={state.theme}
                scale={state.scale}
                sid={state.sid}
                text={state.text}
              />
            </div>
          ))}
        </div>
      ) : state.mode === 'states' ? (
        /* РЕЖИМ «СОСТОЯНИЯ» (Задача 30) — четыре копии в ряд, а не тумблер.
           Тумблером такое не ловится: переключая состояние туда-сюда, глаз не
           помнит тон, который видел секунду назад, и «похоже, но чуть-чуть
           другое» остаётся предметом спора с самим собой. Рядом — видно.

           Одна ГРАНИЦА ОШИБОК на все четыре, а не по одной на копию: рисуют
           они одну и ту же фикстуру с одними пропсами, и падение у них общее —
           четыре одинаковых сообщения об ошибке вместо одного ничего не
           добавляют. */
        <FrameBoundary sid={state.sid}>
          <div className="wbf-states" ref={rowRef}>
            {STATE_COPIES.map(({ state: st, label }, i) => (
              <div className="wbf-states__cell" key={label}>
                <div className="wbf-states__label wbf-mono">{label}</div>
                {/* Атрибут — на КОРОБКЕ копии, не на ячейке: подпись под
                    форсом окрасилась бы вместе с превью, и полоса подписей
                    начала бы врать про тона (Задача 31 читает ровно их). */}
                <div
                  className="wbf-states__box"
                  ref={st === null ? hostRef : undefined}
                  {...(st ? { [FORCE_ATTR]: st } : {})}
                >
                  {view}
                </div>
                {/* ПОЛОСА ТОНОВ (Задача 31) — под копией, не поверх: она
                    служебная и не должна участвовать в сравнении, ради
                    которого стоит. Образец рядом с числом, потому что число
                    отвечает на «одинаковы ли», а образец — на «а какой это
                    вообще тон»; поодиночке каждый отвечает только на своё. */}
                <div className="wbf-states__tone">
                  <span
                    className={`wbf-states__swatch${
                      isTransparent(tones[i] ?? '') ? ' wbf-states__swatch--none' : ''
                    }`}
                    style={{ background: tones[i] ?? 'transparent' }}
                  />
                  <span className="wbf-mono wbf-states__value">
                    {tones[i] === undefined ? '—' : toneLabel(tones[i])}
                  </span>
                  {toneFrom[i] && (
                    <span className="wbf-states__from" title="Выбранный узел прозрачен — тон взят с предка">
                      ↑ {toneFrom[i]}
                    </span>
                  )}
                  {sameTone[i] && (
                    <span className="wbf-states__same">= {sameTone[i]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </FrameBoundary>
      ) : (
        // Атрибут на корне — только пока прицел НИ ВО ЧТО не наведён: иначе
        // форма «предок» красила бы всё поддерево разом, и сужение до узла не
        // значило бы ничего.
        <div
          className="wbf-host"
          ref={hostRef}
          {...{ [FORCE_ATTR]: aimNode ? undefined : (forceAttr ?? undefined) }}
        >
          <FrameBoundary sid={state.sid}>{view}</FrameBoundary>
        </div>
      )}
      {/* СЛОЙ ТАБ-СТОПОВ (Задача 33) — номера В ПОРЯДКЕ ОБХОДА поверх кадра.
          Номер, а не подсветка: вопрос слоя — «сколько их и в каком порядке»,
          а на него отвечает только счёт. Слой не ловит указатель, иначе он
          закрыл бы собой то, что нумерует. */}
      {stops.map((s2, i) => (
        <span
          key={`${s2.node}-${i}`}
          className="wbf-stop"
          style={{ transform: `translate(${s2.x}px, ${s2.y}px)` }}
        >
          {i + 1}
        </span>
      ))}
      {/* СЛОЙ AXE (DS-78) — контур вокруг КАЖДОГО нарушившего узла.
          Контур один на все нарушения, без градаций: серьёзность —
          упорядоченная величина, а величину цвет не кодирует никогда (закон
          системы). Порядок серьёзности живёт в списке вкладки, где он читается
          позицией. Форма отличается от номера таб-стопа намеренно: два слоя
          включаются вместе, и различать их приходится глазами. */}
      {flaws.map((f, i) => (
        <div
          key={i}
          className="wbf-flaw"
          style={{
            transform: `translate(${f.x}px, ${f.y}px)`,
            inlineSize: `${f.w}px`,
            blockSize: `${f.h}px`,
          }}
        />
      ))}
      {/* ОБВОДКА ВЫДЕЛЕННОГО МЕСТА (DS-128). Довод, почему слоем, а не
          рамкой на самом месте, — у `.wbf-pick` в frame.css: три независимых
          причины, и любой из них хватило бы. */}
      {pickBox && (
        <div
          className="wbf-pick"
          style={{
            transform: `translate(${pickBox.x}px, ${pickBox.y}px)`,
            inlineSize: `${pickBox.w}px`,
            blockSize: `${pickBox.h}px`,
          }}
        />
      )}
      {/* РАМКА ПРИЦЕЛА (Задача 32). Отдельным слоем поверх, а не рамкой на
          самом узле: рамка на узле сдвинула бы раскладку — ровно то, что
          прицел пришёл разглядывать. Метка висит НАД рамкой, а не поверх
          узла: поверх она закрывает то, ради чего целились. Если места сверху
          нет (узел у самого верха кадра) — уезжает ВНИЗ, потому что метка,
          уехавшая за край, не видна вовсе. */}
      {aimBox && (
        <div
          className="wbf-aim"
          style={{
            transform: `translate(${aimBox.x}px, ${aimBox.y}px)`,
            inlineSize: `${aimBox.w}px`,
            blockSize: `${aimBox.h}px`,
          }}
        >
          <span
            ref={aimLabelRef}
            className={`wbf-aim__label wbf-mono${aimBox.top < AIM_LABEL_FLIP ? ' wbf-aim__label--below' : ''}`}
            style={aimLabelShift === 0 ? undefined : { marginInlineStart: `${aimLabelShift}px` }}
            // Тот же `title`, что у строки в тулбаре. Прижатие снимает обрезку
            // для всех имён, какие в системе есть сегодня, но правило не
            // должно держаться на этом: имя длиннее всего кадра прижать
            // некуда, и тогда `title` — единственное, что остаётся.
            title={aimNode ? describeNode(aimNode) : undefined}
          >
            {aimNode ? describeNode(aimNode) : ''}
          </span>
        </div>
      )}
      {/* Ruling 9: отказ для позиции, которую фикстура не объявляла, —
          класть его в карту `slots` бессмысленно (компонент читает только
          объявленные им ключи), поэтому кадр показывает его САМ, отдельной
          полосой под превью. Адрес кадра открывается отдельной вкладкой без
          панели — сказать об опечатке в имени позиции больше некому. */}
      {/* НЕПРОЧИТАННЫЕ МЕСТА РАСКЛАДКИ (DS-128). Соседом канваса, а не
          внутри него: попади полоса внутрь `.wbf-canvas`, оболочка получила бы
          её высоту в размере набора — тот же довод, по которому полоса
          неразмещённых начинок ниже стоит рядом с `.wbf-host`, а не в нём.

          Спека требует объяснения, а не пустоты: «разбор чужого и испорченного
          значения отвечает ПУСТЫМ канвасом с объяснением, а не белым экраном».
          Молчаливая потеря половины мест выглядит как «раскладка не
          сохранилась», и искать пойдут в хранилище, а не в данных. */}
      {state.mode === 'canvas' && spotsDropped.length > 0 && (
        <div className="wbf-slot-unplaced">
          {spotsDropped.map((msg, i) => (
            <div key={i} className="wbf-slot-error">
              раскладка: {msg}
            </div>
          ))}
        </div>
      )}
      {unplaced.length > 0 && (
        <div className="wbf-slot-unplaced">
          {unplaced.map((msg, i) => (
            <div key={i} className="wbf-slot-error">
              {msg}
            </div>
          ))}
        </div>
      )}
      </>
    </DsText>
  )
}
