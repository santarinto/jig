/**
 * СОЧЕТАЕМОСТЬ ЦВЕТОВ: что с чем ставят (DS-181).
 *
 * До этой задачи система знала законы («цвет кодирует состояние или категорию»),
 * знала палитры и умела мерить контраст — и нигде не было сказано, какой цвет
 * переднего плана законен на какой поверхности. Проверялось то сочетание,
 * которое случайно встретилось в превью; всё остальное собирали наугад, и
 * знание оседало комментарием в одном компоненте. Живой пример — `AgentTranscript.css`:
 * там записано, что `--ds-text-muted` на `--ds-section-bar` даёт 4.47 при поле
 * 4.5, и это верно для ВСЕЙ системы, а знает об этом один файл.
 *
 * ЗДЕСЬ ОБЪЯВЛЕНИЕ, А НЕ ОТЧЁТ. Матрица считается из значений токенов и из
 * списков ниже; числа не хранятся. Прибитое число — это `docs/contrast-report.md`,
 * и оно молча разошлось с `tokens.css` (палитра серий в нём — предыдущая, зебра
 * `#FAFAFA` вместо `#F5F5F5`, тёмная `section-bar` `#202020` вместо `#181818`).
 * Ровно то, чего эта задача не должна повторить.
 *
 * ТРИ СОСТОЯНИЯ ПАРЫ, и второе — самое ценное:
 *   `legal`      — пара объявлена и берёт свой пол;
 *   `unintended` — пара берёт пол, но НЕ объявлена: работает и всё-таки не
 *                  является ответом системы. Здесь и собирают наугад;
 *   `fail`       — пара не берёт пол. Объявленная и провалившаяся — это дефект,
 *                  и на нём краснеет гейт `colourPairs.test.ts`.
 *
 * ЧЕГО МАТРИЦА НЕ ОБЕЩАЕТ — в `NOT_PROMISED`. Список не украшение: пара,
 * прошедшая на большом поле, ничего не говорит о полоске в 2 px, и молчание об
 * этом создаёт впечатление, что цветом решается всё.
 */

import {
  VIEWING,
  contrastRatio,
  mix,
  worstDeltaE,
  type ThemeName,
  type Vision,
} from './colour-science.js'

export type { ThemeName }

export const THEMES: readonly ThemeName[] = ['light', 'dark']

/** Селектор блока темы в `tokens.css`. */
export const THEME_SELECTOR: Record<ThemeName, string> = {
  light: ':root',
  dark: '[data-theme="dark"]',
}

// ------------------------------------------------------------- поверхности

export interface Surface {
  /** Имя токена без префикса `--ds-`. */
  readonly token: string
  /** Что это за поверхность на экране. */
  readonly why: string
}

/**
 * Поверхности, НА КОТОРЫХ ЛЕЖИТ СОДЕРЖИМОЕ. Не всякая заливка сюда входит:
 * `--ds-border` и `--ds-table-grid` в разметке тоже фон, но фон полоски в 1 px,
 * у которой нет переднего плана, — их вопрос («отличима ли линия от подложки»)
 * другой и решается в группе D `docs/contrast-report.md`.
 *
 * Список НЕ на глаз: гейт требует, чтобы каждый цветовой токен `:root`,
 * встречающийся в `src/**\/*.css` как фон, был либо здесь, либо в
 * `NOT_A_SURFACE` с причиной.
 */
export const SURFACES: readonly Surface[] = [
  { token: 'surface', why: 'карточка, панель, лист — основная подложка содержимого' },
  { token: 'surface-subtle', why: 'вложенная плашка, тихая кнопка, плитка' },
  { token: 'bg-app', why: 'фон приложения под карточками' },
  { token: 'section-bar', why: 'полоса разделов, шапка виджета, панель команд' },
  { token: 'table-header', why: 'шапка таблицы' },
  { token: 'table-zebra', why: 'чётная строка таблицы' },
  { token: 'table-hover', why: 'строка или пункт под курсором' },
  { token: 'table-selected', why: 'выбранная строка, выбранный узел дерева' },
  { token: 'accent-subtle', why: 'акцентная подложка: выбранный узел, шапка виджета' },
  { token: 'accent', why: 'сплошная акцентная заливка: главная кнопка, плашка' },
  { token: 'accent-hover', why: 'та же заливка под курсором' },
  { token: 'accent-active', why: 'та же заливка нажатой' },
  { token: 'success', why: 'сплошная заливка тона: кнопка подтверждения' },
  { token: 'warning', why: 'сплошная заливка тона' },
  { token: 'error', why: 'сплошная заливка тона: опасная кнопка' },
  { token: 'info', why: 'сплошная заливка тона' },
  { token: 'highlight', why: 'подсветка найденного в логе и в переписке' },
  {
    token: 'border',
    why: 'граница — И полоска в 1 px, И единственная в системе НАЖАТАЯ заливка (шаговая кнопка `NumberField`). Как полоска её вопрос решён группой D `docs/contrast-report.md`; как заливка под знаком она поверхность, и её пары считаются здесь',
  },
  { token: 'text-primary', why: 'инверсная плашка: подсказка теплокарты' },
]

/**
 * Заливки, которые НЕ являются поверхностью для содержимого, и почему. Список
 * существует затем, чтобы «этого токена нет в матрице» нельзя было получить
 * молчанием: гейт сверяет объединение `SURFACES` и этого списка с тем, что
 * реально стоит фоном в листах компонентов.
 */
export const NOT_A_SURFACE: readonly Surface[] = [
  { token: 'border-strong', why: 'то же: дорожка переключателя, разделитель панели команд' },
  {
    token: 'control-border',
    why: 'граница контрола (DS-267). Фоном стоит дважды — дорожка переключателя и полоса разделителя `Split`, — и в обоих случаях это ТЕЛО контрола, а не подложка для содержимого: на дорожке лежит бегунок (`text-on-solid`, сам исключён отсюда как заливка знака), на полосе не лежит ничего. Как контур его вопрос не «читается ли текст», а «опознаётся ли компонент», и пол там 3, а не 4.5 — это считает `controlBorder.test.ts`, и потому же токен не может быть просто дописан в `FOREGROUNDS` с полом 3: матрица пар считает ВСЕ передние планы против ВСЕХ поверхностей, а контур контрола лежит не на всех',
  },
  { token: 'table-grid', why: 'сетка таблицы и дорожка полосы — та же полоска в 1 px, без переднего плана' },
  { token: 'skel-base', why: 'блок-заглушка загрузки: на нём по определению нет содержимого' },
  { token: 'overlay', why: 'затемнение под модалкой — полупрозрачное, значение зависит от того, что под ним' },
  { token: 'text-on-accent', why: 'заливка знака внутри контрола (галка, точка), а не подложка' },
  { token: 'text-on-solid', why: 'заливка бегунка переключателя; его состояние несёт цвет ДОРОЖКИ (группа D)' },
  {
    token: 'heat-0',
    why: 'ступень теплокарты: содержимого на ней нет, а кольцо фокуса — не пара двух ТОКЕНОВ (DS-193). Обещание «ramp войдёт в матрицу вместе с 193», записанное здесь при её заведении, снято: кольцо там двухслойное, и утверждение о нём звучит как «хоть один слой берёт 3 : 1 на этой ступени» — его считает случай `measure` «Heatmap: кольцо фокуса видно на КАЖДОЙ ступени рампа», а матрица пар посчитать не может',
  },
  { token: 'heat-1', why: 'ступень теплокарты — см. heat-0: содержимого нет, кольцо держит отдельный случай measure' },
  { token: 'heat-2', why: 'ступень теплокарты — см. heat-0: содержимого нет, кольцо держит отдельный случай measure' },
  { token: 'heat-3', why: 'ступень теплокарты — см. heat-0: содержимого нет, кольцо держит отдельный случай measure' },
  { token: 'heat-4', why: 'ступень теплокарты — см. heat-0: содержимого нет, кольцо держит отдельный случай measure' },
]

// ---------------------------------------------------------- передний план

export interface Foreground {
  /** Имя токена без префикса `--ds-`. */
  readonly token: string
  /** Пол контраста для этого переднего плана. */
  readonly floor: number
  /** Откуда взялся пол — WCAG или решение системы, с номером задачи. */
  readonly floorWhy: string
  /** Поверхности, на которых пара ОБЪЯВЛЕНА законной в обеих темах. */
  readonly on: readonly string[]
  /** Поверхности, законные только в светлой теме (в тёмной у системы другой ответ). */
  readonly onLightOnly?: readonly string[]
  /** Поверхности, законные только в тёмной теме. */
  readonly onDarkOnly?: readonly string[]
  /** Подложка, которой в токенах нет вовсе (`color-mix`), и гейт, который её держит. */
  readonly onMix?: string
  /** Куда идти вместо — для поверхностей, которых нет в объявленном наборе. */
  readonly why: string
}

/**
 * Передние планы. Пол 4.5 — текст (WCAG 1.4.3, мелкий кегль системы не даёт
 * права на послабление для крупного). Исключение одно и названо явно.
 */
export const FOREGROUNDS: readonly Foreground[] = [
  {
    token: 'text-primary',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'bg-app', 'section-bar', 'table-header', 'table-zebra', 'table-hover', 'table-selected', 'accent-subtle', 'highlight', 'border'],
    why: 'основной текст. На сплошных заливках его место занимает `text-on-accent`',
  },
  {
    token: 'text-secondary',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'bg-app', 'section-bar', 'table-header', 'table-zebra', 'table-hover', 'table-selected', 'accent-subtle'],
    why: 'второстепенный текст и значок. Единственный из приглушённых, кто держит полосу разделов',
  },
  {
    token: 'text-muted',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'bg-app', 'table-header', 'table-zebra', 'table-hover'],
    why: 'на `section-bar` даёт 4.47 в светлой — там берут `text-secondary`; на `table-selected` и `accent-subtle` — `row-muted-fg`, ради которого тот и заведён',
  },
  {
    token: 'text-faint',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface'],
    why: 'самый слабый текст, который ВСЁ ЕЩЁ берёт пол, и берёт его ровно на одной поверхности: 4.61 на белой, 4.30 уже на `surface-subtle`. Отсюда же стена в DS-234',
  },
  {
    token: 'text-disabled',
    floor: 2,
    floorWhy: 'WCAG 1.4.3 выводит выключенное из-под порога; 2.0 — решение системы (DS-233): число дня обязано остаться читаемым',
    on: ['surface'],
    why: 'выключенный день сетки. Единственное место, где выключенное написано токеном, а не `opacity`',
  },
  {
    token: 'text-on-accent',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['accent', 'accent-hover', 'accent-active', 'success', 'warning', 'error', 'info'],
    why: 'подпись на сплошной заливке — в ОБЕИХ темах, потому и не «белый»: в тёмной заливки светлые',
  },
  {
    token: 'text-on-solid',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: [],
    onLightOnly: ['success', 'error'],
    why: 'белый, инвариантный к теме. Как ТЕКСТ законен только в светлой (`Button--danger`, `--success`); в тёмной те же кнопки берут `text-on-accent` (`Button.css`)',
  },
  {
    token: 'surface',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['text-primary'],
    why: 'поверхность КАК ТЕКСТ — единственный случай инверсии: подпись на тёмной плашке подсказки теплокарты',
  },
  {
    token: 'accent',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'table-zebra', 'table-hover', 'accent-subtle'],
    why: 'акцент как текст и значок. На `section-bar` даёт 4.20, на `bg-app` 4.40, на `table-header` 4.47 — там берут `accent-active`',
  },
  {
    token: 'accent-active',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'bg-app', 'section-bar', 'table-header', 'table-zebra', 'table-hover'],
    why: 'тот же акцент, где обычного не хватает. В тёмной он ТЕМНЕЕ акцента, поэтому на `surface-subtle` (4.35) и на выборе (3.86) его нет',
  },
  {
    token: 'accent-fg',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'bg-app', 'section-bar', 'table-header', 'table-zebra', 'table-hover', 'table-selected', 'accent-subtle', 'border'],
    why: 'акцент как ТЕКСТ на акцентном тинте — единственный, кто держит все девять нейтральных поверхностей в обеих темах, и потому же он берёт полосу разделов и нажатую заливку шаговой кнопки, где обычный акцент даёт 4.20 и 3.45',
  },
  {
    token: 'success',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'bg-app', 'table-header', 'table-zebra', 'table-hover'],
    why: 'тон как текст и значок на нейтральной поверхности. На выборе и акцентном тинте — 4.34 в тёмной, там тон не ставят',
  },
  {
    token: 'warning',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'bg-app', 'table-header', 'table-zebra', 'table-hover'],
    why: 'тот же набор, что у остальных тонов: на `section-bar` warning даёт 4.42 в светлой',
  },
  {
    token: 'error',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'bg-app', 'table-header', 'table-zebra', 'table-hover'],
    why: 'набор один на все четыре тона намеренно: словарь тонов — один словарь, и разные наборы у его членов означали бы, что тон выбирают по поверхности',
  },
  {
    token: 'info',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'bg-app', 'table-header', 'table-zebra', 'table-hover'],
    why: 'см. `error`',
  },
  {
    token: 'success-fg',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: [],
    onMix: 'тинт 12% своего тона (`Badge`, `Alert`) — держит `src/__guards__/color-mix-contrast.test.ts`',
    why: 'подпись тона на СВОЁМ тинте. На нейтральной поверхности она проходит с запасом, но там ответ системы — сам тон, а не его подпись',
  },
  { token: 'warning-fg', floor: 4.5, floorWhy: 'WCAG 1.4.3 AA, мелкий текст', on: [], onMix: 'тинт 12% своего тона — `color-mix-contrast`', why: 'см. `success-fg`' },
  { token: 'error-fg', floor: 4.5, floorWhy: 'WCAG 1.4.3 AA, мелкий текст', on: [], onMix: 'тинт 12% своего тона — `color-mix-contrast`', why: 'см. `success-fg`' },
  { token: 'info-fg', floor: 4.5, floorWhy: 'WCAG 1.4.3 AA, мелкий текст', on: [], onMix: 'тинт 12% своего тона — `color-mix-contrast`', why: 'см. `success-fg`' },
  {
    token: 'weekend',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'table-hover'],
    why: 'суббота и воскресенье в сетке дней. Пара с наведением — САМАЯ ТЕСНАЯ во всей матрице (4.50 при поле 4.5), запаса там нет',
  },
  {
    token: 'row-muted-fg',
    floor: 4.5,
    floorWhy: 'WCAG 1.4.3 AA, мелкий текст',
    on: ['surface', 'surface-subtle', 'table-zebra', 'table-hover', 'table-selected'],
    why: 'приглушённая СТРОКА таблицы. Отдельный токен ровно затем, чтобы держать пол на всех четырёх подложках строки, включая выбор, где `text-muted` даёт 4.48',
  },
]

// -------------------------------------------------------------------- пары

export type PairState = 'legal' | 'unintended' | 'fail'

export interface Pair {
  readonly theme: ThemeName
  readonly fg: string
  readonly bg: string
  readonly fgHex: string
  readonly bgHex: string
  readonly ratio: number
  readonly floor: number
  readonly intended: boolean
  readonly state: PairState
}

/** Объявлена ли пара законной в этой теме. */
export function isIntended(fg: Foreground, bg: string, theme: ThemeName): boolean {
  if (fg.on.includes(bg)) return true
  if (theme === 'light') return (fg.onLightOnly ?? []).includes(bg)
  return (fg.onDarkOnly ?? []).includes(bg)
}

/**
 * ВСЯ матрица одной темы: каждый передний план × каждая поверхность. Полнота —
 * не побочный эффект, а предмет: длина результата обязана равняться
 * произведению размеров словарей, и гейт это проверяет. Первая же выборка «по
 * тем парам, что встретились в превью» вернула бы матрицу, зелёную на том, чего
 * никто не собирает.
 */
export function pairsFor(theme: ThemeName, values: ReadonlyMap<string, string>): Pair[] {
  const out: Pair[] = []
  for (const fg of FOREGROUNDS) {
    const fgHex = values.get(fg.token)
    if (fgHex == null) throw new Error(`colourPairs: токена --ds-${fg.token} нет в теме ${theme}`)
    for (const bg of SURFACES) {
      const bgHex = values.get(bg.token)
      if (bgHex == null) throw new Error(`colourPairs: токена --ds-${bg.token} нет в теме ${theme}`)
      const ratio = contrastRatio(fgHex, bgHex)
      const intended = isIntended(fg, bg.token, theme)
      const passes = ratio >= fg.floor
      out.push({
        theme,
        fg: fg.token,
        bg: bg.token,
        fgHex,
        bgHex,
        ratio,
        floor: fg.floor,
        intended,
        state: intended ? (passes ? 'legal' : 'fail') : passes ? 'unintended' : 'fail',
      })
    }
  }
  return out
}

/** Объявленные и провалившиеся — то, что гейт называет дефектом. */
export const brokenPromises = (pairs: readonly Pair[]): Pair[] =>
  pairs.filter((p) => p.intended && p.state === 'fail')

// ------------------------------------------------------------ словарь тонов

/**
 * Шесть тонов — `neutral`, `accent`, `success`, `warning`, `error`, `info`.
 * Один словарь на `Badge`, `Alert`, `Button`, `Timeline`, `LogViewer`,
 * `BarChart`, `Heatmap`, `AgentTranscript`.
 *
 * У тона ТРИ цветовых носителя, и это разные вопросы, а не три вида одного:
 *   `tone`  — сам токен: значок, рамка, сплошная заливка;
 *   `label` — подпись на своём тинте (`--ds-*-fg`);
 *   `tint`  — заливка 12% (у акцента 14%) под подписью.
 */
export const TONES = ['neutral', 'accent', 'success', 'warning', 'error', 'info'] as const
export type Tone = (typeof TONES)[number]

export type ToneCarrier = 'tone' | 'label' | 'tint'

/** Цвет носителя для одного тона в одной теме. */
export function toneColour(
  carrier: ToneCarrier,
  tone: Tone,
  values: ReadonlyMap<string, string>,
): string {
  const get = (t: string): string => {
    const v = values.get(t)
    if (v == null) throw new Error(`colourPairs: токена --ds-${t} нет в теме`)
    return v
  }
  const surface = get('surface')
  if (carrier === 'tone') return tone === 'neutral' ? get('text-secondary') : get(tone)
  if (carrier === 'label') {
    if (tone === 'neutral') return get('text-secondary')
    return get(`${tone}-fg`)
  }
  // tint
  if (tone === 'neutral') return get('surface-subtle')
  // `Badge.css`: акцент 14%, смысловые тона 12% — числа оттуда, не отсюда.
  return mix(get(tone), surface, tone === 'accent' ? 0.14 : 0.12)
}

export interface TonePair {
  readonly a: Tone
  readonly b: Tone
  readonly de: number
  readonly vision: Vision
}

/** Все 15 пар шести тонов на одном носителе, худшее из четырёх зрений. */
export function tonePairs(
  carrier: ToneCarrier,
  theme: ThemeName,
  values: ReadonlyMap<string, string>,
): TonePair[] {
  const vc = VIEWING[theme]
  const out: TonePair[] = []
  for (let i = 0; i < TONES.length; i++) {
    for (let j = i + 1; j < TONES.length; j++) {
      const w = worstDeltaE(
        toneColour(carrier, TONES[i], values),
        toneColour(carrier, TONES[j], values),
        vc,
      )
      out.push({ a: TONES[i], b: TONES[j], de: w.de, vision: w.vision })
    }
  }
  return out
}

/**
 * ПОЛ РАЗЛИЧИМОСТИ ТОНОВ — 1.0, порог различения (JND) в CAM16-UCS.
 *
 * Не 5.5, как у палитры серий, и это не послабление, а другой вопрос. У серий
 * цвет — ЕДИНСТВЕННЫЙ носитель: линия на графике не подписана, и «какая это
 * серия» отвечается только цветом, поэтому там нужен запас над JND, снятый с
 * рабочих палитр (Tol, Okabe-Ito). У тона носитель другой — ЗНАК И СЛОВО
 * (DS-157, гейт `tone-carrier`), а цвет подтверждает. Требовать от
 * подтверждения того же запаса, что от единственного носителя, значит
 * переписать чужое число вместо своего рассуждения.
 *
 * Но НОЛЬ цвет давать не имеет права: два тона, слившиеся в один пиксель, — это
 * категория без категории, то есть цвет, который врёт. Отсюда пол ровно на
 * пороге различения: цвет обязан не ПРОТИВОРЕЧИТЬ знаку, а нести его он не
 * обязан.
 */
export const TONE_JND = 1.0

/**
 * ЗАМЕРЕННЫЙ ДЕФЕКТ, а не порог. Заливка 12% в СВЕТЛОЙ теме не различает
 * `warning` и `error` при дейтеранопии ВОВСЕ: ΔE' 0.00, два тинта совпадают
 * побайтово. Гейт держит это число характеристикой — не чтобы объявить
 * нормой, а чтобы правка тинтов не проехала молча.
 *
 * Потолок здесь не природный: пара 12%-тинтов в принципе разводится до ΔE' 5.74
 * (замер по сетке 6³ базовых цветов, худшее из четырёх зрений). То есть тинты
 * МОЖНО развести, и это отдельная задача с ценой в виде смены смысловых цветов
 * системы — цвет, который видит потребитель. Здесь фиксируется факт и правило:
 * НА ЗАЛИВКУ ТОНА ОПИРАТЬСЯ НЕЛЬЗЯ.
 */
export const TINT_IS_NOT_A_CARRIER = {
  theme: 'light' as ThemeName,
  pair: 'warning/error',
  vision: 'deutan' as Vision,
  de: 0,
  ceiling: 5.74,
}

// ------------------------------------------------------- чего НЕ обещается

/**
 * Границы сочетаемости. Матрица, молчащая о них, создаёт впечатление, что
 * цветом решается всё, — и тогда её главный вывод («поставь второй носитель»)
 * теряется ровно там, где он нужнее всего.
 */
export const NOT_PROMISED: readonly string[] = [
  'Полоска в 2–3 px цветом не различается ни при какой палитре: там предел — острота зрения, а не контраст. Ответ — второй носитель (знак, слово, форма), а не подбор цвета. Так закрыт DS-157: тон уведомления несут значок и слово.',
  'Заливка тона (тинт 12%) НЕ носитель: в светлой теме `warning` и `error` при дейтеранопии совпадают точно, ΔE\' 0.00.',
  'Пара, взявшая пол, обещает читаемость на СВОЁМ размере. Пол 4.5 снят для мелкого текста системы; знак в 1 rem и подпись в 12 px им не отличаются, а глазом отличаются.',
  'Матрица считает объявленные значения токенов. Что видно НА ЭКРАНЕ, знает только браузер: `opacity` предка и альфа в `color` каскадом не складываются — их меряет `scripts/seen-colour.mjs` (DS-209).',
  'Пара `weekend × table-hover` в светлой теме — 4.50 при поле 4.5. Она законна и запаса не имеет: любое движение любого из двух токенов роняет её.',
  'Тон `neutral` в матрице представлен `--ds-text-secondary` и `--ds-surface-subtle` — у него нет своего токена, и «нейтральный тон» это отсутствие тона, а не шестой цвет.',
]
