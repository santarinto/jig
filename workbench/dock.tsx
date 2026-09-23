/**
 * Панель снизу — раскладка 1b `ShellBottom`.
 *
 * Полоса вкладок 28px и тело 150px по макету. В фазе 3 вкладка одна («Панель»);
 * «Таб-стопы» и «Доступность» — фаза 6, и полоса заведена сразу, чтобы они
 * приехали в готовое место, а не переставляли раскладку задним числом.
 *
 * Блок случаев НЕ ПРЯЧЕТСЯ, когда случаев нет: исчезнувший блок читается как
 * несработавшая панель, и время уходит на выяснение, что всё в порядке. Пустота
 * объясняется словами — тем же приёмом, что «фикстуры нет» в кадре.
 */
import { CopyChip } from './copy-chip.js'
import { displayValue } from './control-value.js'
import { hasPrintableSpot, snippetOf } from './jsx-snippet.js'
import { fitsSlot } from './slot-fill.js'
import { FORCE_STATES, type ForceState } from './force-states.js'
import type { FrameMode } from './frame-url.js'
import type { A11yReportMsg, ControlMeta, FixtureMeta, KindRow, SlotMeta } from './protocol.js'

interface Props {
  meta: FixtureMeta | null
  currentCase: string
  onPickCase: (id: string) => void
  /** Значения, которые уже покрутили в этой сессии — патч, а не источник правды. */
  values: Record<string, string>
  /** Значения текущего случая — с ними сравнивается покрученное. */
  caseValues: Record<string, string>
  onControl: (k: string, v: string) => void
  /** Сброс одной крутилки к значению случая. */
  onReset: (k: string) => void
  /** Сколько крутилок сейчас отличается от случая — для полосы вкладок. */
  changedCount: number
  /** Сброс всех крутилок разом. */
  onResetAll: () => void
  /** Действующий набор стресс-данных, `null` — набора нет. */
  data: string | null
  /** Выбор набора; `null` снимает его. */
  onPickData: (name: string | null) => void
  /** Начинки, которые задал сам ДЕЙСТВУЮЩИЙ случай (слой «кейс» — ниже адреса). */
  currentCaseSlots: Record<string, string>
  /** Начинки, выбранные в этой сессии панели, — параллель `values` у крутилок. */
  selectedSlots: Record<string, string>
  /** Карта видов — `null` до первого запроса или пока ответ не пришёл. */
  kinds: KindRow[] | null
  /** Кадр молчал на `ask-kinds` дольше READY_TIMEOUT_MS. */
  kindsStalled: boolean
  /** Позиция, чей список выбора сейчас открыт; `null` — ни одна. */
  openSlot: string | null
  /** Открывает/закрывает список выбора позиции; поднимает запрос карты видов. */
  onOpenPicker: (slotId: string) => void
  /** Выбор начинки — уходит патчем, кадр не перезагружается. */
  onPickFill: (slotId: string, name: string) => void
  /** Возврат позиции к начинке кейса (только если кейс её задавал). */
  onResetFill: (slotId: string) => void
  /** Снять начинку совсем — путь назад там, где кейс позицию не задавал. */
  onClearFill: (slotId: string) => void
  /** «Повторить» после таймаута карты видов. */
  onRetryKinds: () => void
  /** Включённые форс-состояния — строкой через запятую, как в адресе. */
  force: string | null
  /** Что кадр рассказал про свой обход листов; `null` — ещё не рассказал. */
  forceStats: { ms: number; skipped: number } | null
  /** Щелчок по состоянию — набор, а не один выбор. */
  onToggleForce: (state: ForceState) => void
  /** Вид кадра: в «Состояниях» четыре копии показаны разом, тумблерам нечего делать. */
  mode: FrameMode
  /** Открытая вкладка дока. */
  tab: 'panel' | 'tabstops' | 'axe'
  onPickTab: (tab: 'panel' | 'tabstops' | 'axe') => void
  /** Таб-стопы, как их посчитал кадр, — в порядке обхода. */
  tabstops: { node: string; label: string }[]
  /** Слой включён: пустой список значит «стопов нет», а не «слой выключен». */
  tabstopsOn: boolean
  /** Отчёт axe от кадра; `null` — слоя не было ни разу (не то же, что пустой отчёт). */
  a11y: A11yReportMsg | null
  /** Слой axe включён. */
  axeOn: boolean
  /**
   * JSX ВСЕГО НАБОРА канваса; `null` — не на канвасе, `''` — набор пуст
   * (DS-128, шаг 7).
   *
   * Приходит ГОТОВОЙ СТРОКОЙ, а не считается здесь из мест и их фикстур, в
   * отличие от одиночного сниппета. Док знает ровно один предмет — выделенное
   * место; раскладку и карту `id → meta` держит оболочка, и передавать их сюда
   * значило бы завести в доке второе представление канваса рядом с первым.
   */
  canvasSnippet: string | null
}

/**
 * Приписка к имени вкладки axe: число нарушений, знак «не смогли» или знак
 * «ответа нет». Пусто — отчёта ещё не было.
 *
 * `noRoot` и «ноль применённых правил» дают ОДИН прочерк намеренно: приписка
 * отвечает на «есть ли число», и у обоих его нет. Различаются они внутри
 * вкладки, где есть место сказать, что именно случилось; разводить их ещё и
 * в подписи значило бы кодировать разряд знаком, который надо запоминать.
 */
const axeMark = (a11y: A11yReportMsg | null): string => {
  if (!a11y) return ''
  if (a11y.error) return ' !'
  if (a11y.applied === 0) return ' —'
  return ` ${a11y.violations.length}`
}

/**
 * Строк в колонке. ОСТАЁТСЯ КОНСТАНТОЙ, и это решение, а не недосмотр
 * (DS-132, пункт 3).
 *
 * Прежнее обоснование — «столько, сколько влезает в тело дока (150px по 26px)»
 * — протухло на DS-126: фиксированной высоты 150px больше нет, высоту
 * задаёт человек рукояткой. Число при этом верное, но держится другим.
 *
 * Считать его от ВЫСОТЫ дока значило бы перекладывать список крутилок под
 * рукой у того, кто эту высоту тянет: колонок то три, то пять, и кнопка уезжает
 * из-под курсора. Считать от ШИРИНЫ — то же самое при смене размера окна.
 * Постоянное число даёт постоянное число колонок: список стоит на месте, а
 * ширину экрана забирает не он, а колонка сниппета (`.wb__dock-col--right`),
 * которой ширина нужна по делу. Высота дока решает, сколько строк колонки
 * видно, а не сколько их всего — колонка прокручивается (`overflow: auto`).
 *
 * Пять — предел беглого просмотра колонки одним взглядом. Длиннее колонку
 * приходится читать, а не оглядывать, и тогда четыре коротких колонки честнее
 * одной длинной.
 */
const ROWS_PER_COLUMN = 5

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function ControlRow({
  name,
  control,
  value,
  caseValue,
  disabled,
  unknown = false,
  onChange,
  onReset,
}: {
  name: string
  control: ControlMeta
  value: string
  caseValue: string
  /**
   * Крутилка мертва: пропы до текущего случая не доезжают ([3] ручного QA).
   *
   * ГАСИМ, А НЕ ПРЯЧЕМ. Спрятанная крутилка уносит с собой и знание о том, что
   * она у компонента есть, — человек решил бы, что фикстура её не объявляет, и
   * пошёл бы искать в исходниках. Погашенная говорит «есть, но не сейчас», а
   * почему — сказано один раз на группу.
   */
  disabled?: boolean
  /**
   * Крутилку перекрывает случай (DS-164): значение, которое рисуется,
   * задано литералом в `render` и оболочке НЕИЗВЕСТНО. Показать базу фикстуры
   * или `p.<имя>` из адреса значило бы назвать число, которого на экране нет —
   * приёмка видела «Документ ТК-00417» в поле и «Парки и филиалы» в кадре.
   * Поэтому ни значения, ни справки «≠ кейс», ни ⟲: поле пустое, ни один чип
   * не нажат, флажок `indeterminate` — «не знаю», а не «выключено».
   */
  unknown?: boolean
  onChange: (v: string) => void
  onReset: () => void
}) {
  /*
   * ДВА БЛОКА: ПРЕДМЕТ И СПРАВКА О НЁМ (DS-288). Имя с контролом —
   * предмет строки, «≠ кейс · в кейсе: …» — справка о нём, и справка не
   * отнимает место у предмета. Пока они стояли одним рядом, покрученное поле
   * отдавало справке всё: `Drawer/open`, `title` — 26.7px на окне 1548 и
   * справка за краем крутилки на 1024, то есть ломалось ровно тогда, когда
   * полем пользуются. Теперь строка переносится БЛОКАМИ: не влезла справка —
   * она уходит на свою строку под предметом, а предмет остаётся целым.
   * Обёртка нужна именно для этого: без неё перенос шёл бы по элементам, и
   * переключатель, не влезший рядом с именем, съезжал бы под имя сам. Правила
   * и доводы про пол — в `shell.css` у `.wb__ctl-main`.
   */
  return (
    <div className="wb__ctl">
      <span className={`wb__ctl-main${control.kind === 'text' ? ' wb__ctl-main--field' : ''}`}>
        <span className="wb__ctl-name" title={name}>{name}</span>
        {control.kind === 'enum' && (
          <span className="wb__ctl-enum" role="group" aria-label={name}>
            {control.values.map((v) => (
              <button
                key={v}
                type="button"
                className={`wb__chip${!unknown && v === value ? ' is-current' : ''}`}
                aria-pressed={!unknown && v === value}
                data-label={v}
                disabled={disabled}
                onClick={() => onChange(v)}
              >
                {v}
              </button>
            ))}
          </span>
        )}
        {control.kind === 'bool' && (
          <input
            type="checkbox"
            aria-label={name}
            // `indeterminate` — свойство узла, а не атрибут: React его не
            // выставляет, только ref.
            ref={(el) => {
              if (el) el.indeterminate = unknown
            }}
            checked={!unknown && value === 'true'}
            disabled={disabled}
            onChange={(e) => onChange(String(e.target.checked))}
          />
        )}
        {control.kind === 'number' && (
          <input
            type="number"
            aria-label={name}
            className="wb__ctl-input"
            min={control.min}
            max={control.max}
            step={control.step ?? 1}
            value={unknown ? '' : value}
            placeholder={unknown ? 'случай' : undefined}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {control.kind === 'text' && (
          <input
            type="text"
            aria-label={name}
            className="wb__ctl-input"
            value={unknown ? '' : value}
            placeholder={unknown ? 'задаёт случай' : undefined}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <span className="wb__ctl-gap" />
      </span>
      {!unknown && value !== caseValue && (
        <span className="wb__ctl-diff">
          {/* Точка + слова + значение кейса. Показывать исходное значение
              обязательно: «отличается» без «от чего» гонит читать фикстуру,
              а он в этот момент занят совсем другим вопросом. Поэтому при
              нехватке места справка не прячется, а переносится, и режется
              многоточием только её хвост — значение; целиком оно в `title`. */}
          <span className="wb__ctl-dot" aria-hidden="true" />
          <span className="wb__ctl-was" title={caseValue || '—'}>≠ кейс · в кейсе: {caseValue || '—'}</span>
          <button
            type="button"
            className="wb__chip"
            title="Сбросить к значению кейса"
            aria-label={`Сбросить ${name} к значению кейса`}
            disabled={disabled}
            onClick={onReset}
          >
            ⟲
          </button>
        </span>
      )}
    </div>
  )
}

/**
 * Строка одной позиции: имя, `prop` моноширинным, счётчик совместимых
 * справа; ниже — заполненная позиция чипом или список выбора (Задача 6).
 *
 * Список — не поповер: поповер над доком высотой 150px накрыл бы кадр, а
 * смысл действия — смотреть на кадр, пока меняешь начинку (бриф Задачи 6).
 */
function SlotRow({
  slotId,
  slot,
  fill,
  caseFill,
  isOpen,
  kinds,
  kindsStalled,
  onOpen,
  onPick,
  onReset,
  onClear,
  onRetry,
}: {
  /** Id позиции — нужен для устойчивого id списка (`aria-controls`). */
  slotId: string
  slot: SlotMeta
  fill: string | undefined
  /** Начинка кейса — то, к чему возвращает «⟲» (та же роль, что caseValue у крутилки). */
  caseFill: string | undefined
  isOpen: boolean
  kinds: KindRow[] | null
  kindsStalled: boolean
  onOpen: () => void
  onPick: (name: string) => void
  onReset: () => void
  onClear: () => void
  onRetry: () => void
}) {
  // Счётчик совместимых — из карты видов: сколько ПРОХОДЯТ fitsSlot. Пока
  // карта не приехала — «—», а не «0»: ноль это утверждение, а мы ещё не
  // знаем (решение №6, бриф Задачи 6, Step 3). Фикстуры с непрочитанным видом
  // считаются: у них `kind` не указан, `fitsSlot(accepts, undefined)` истинно
  // — они остаются ВЫБИРАЕМЫМИ, просто помечены отдельно ниже.
  const compatible = kinds === null ? null : kinds.filter((k) => fitsSlot(slot.accepts, k.kind))
  // Id списка выбора — из id позиции, а не из счётчика: он обязан быть
  // одинаковым у кнопки и у списка, а счётчик разошёлся бы при перерисовке.
  const pickerId = `wb-slot-picker-${slotId}`

  return (
    <li className="wb__slot">
      <div className="wb__slot-head">
        {/* `note` позиции (чем она опасна) — на ИМЕНИ, тем же приёмом, что у
            случая (`title={k.note}` на кнопке случая, выше в этом файле): там
            это интерактивный элемент, здесь имя не кликабельно, но остаётся
            той же ролью — единственное место строки, которое называет
            ИМЕННО эту позицию, а не общий контейнер строки. Раньше `note`
            доезжал протоколом (`fixture-meta.ts`), но никуда не подставлялся
            — доходил до объекта и умирал в панели, ни один узел его не читал
            (финальное ревью фазы 4, Important 3). Санитар на ДОСТАВКУ, а не
            на наличие поля, — shell-panel.test.tsx. */}
        <span className="wb__slot-name" title={slot.note}>
          {slot.title}
        </span>
        {slot.prop && <span className="wb__slot-prop wb__mono">{slot.prop}</span>}
        <span className="wb__slot-gap" />
        {/* `role="status"` не только для семантики «статус загрузки» — без
            ЯВНОЙ роли `aria-label` на голом `<span>` (роль `generic`) вообще
            не экспонируется в accessible name (ревью Task 5+6): диктор
            прочитал бы «1» или «—» без единого слова контекста, а
            `getByLabelText` в тестах прошёл бы всё равно — он проверяет
            атрибут в DOM, а не то, что услышит человек. */}
        <span className="wb__slot-count" role="status" aria-label="совместимых начинок">
          {compatible === null ? '—' : compatible.length}
        </span>
      </div>
      <div className="wb__slot-fill">
        {/* Заполненная позиция — чип с рамкой ЦВЕТОМ ТЕКСТА, пустая — чип
            пунктиром со словом «пусто» (закон хрома: ни заливки --ds-accent,
            ни тени; выделение — вес шрифта и подложка). */}
        {/* `aria-controls` — В ПАРЕ с `aria-expanded`, и только когда список
            РАЗВЁРНУТ: «раскрыто» без указания на раскрытое оставляет диктора
            без цели («раскрыто» — что?), а ссылка на несуществующий id — уже
            не подсказка, а ошибка разметки. */}
        <button
          type="button"
          className={`wb__slot-chip${fill ? ' wb__slot-chip--filled' : ' wb__slot-chip--empty'}`}
          aria-expanded={isOpen}
          aria-controls={isOpen ? pickerId : undefined}
          onClick={onOpen}
        >
          {fill ?? 'пусто'}
        </button>
        {/* «⟲» — только когда выбор ЕСТЬ что вернуть (кейс задавал начинку,
            и панель её перекрыла); та же ГРАНИЦА, что у резета крутилки:
            патч умеет только заменить значение, не убрать ключ, поэтому
            «снять» шлёт СТРОКУ кейса, а не пустоту (см. onReset в shell-app.tsx). */}
        {caseFill !== undefined && fill !== caseFill && (
          <button
            type="button"
            className="wb__chip"
            title="Вернуть начинку кейса"
            aria-label={`Вернуть ${slot.title} к начинке кейса`}
            onClick={onReset}
          >
            ⟲
          </button>
        )}
        {/* «✕» — путь назад там, где «⟲» его дать не может: кейс позицию не
            задавал, возвращать не к чему, и без этой кнопки заполненную
            позицию нельзя было опустошить вовсе. Две кнопки не спорят: они
            появляются во взаимоисключающих случаях (`caseFill` задан или нет). */}
        {caseFill === undefined && fill !== undefined && (
          <button
            type="button"
            className="wb__chip"
            title="Снять начинку — позиция снова пуста"
            aria-label={`Снять начинку позиции ${slot.title}`}
            onClick={onClear}
          >
            ✕
          </button>
        )}
      </div>
      {isOpen && (
        <div
          className="wb__slot-picker"
          role="group"
          id={pickerId}
          aria-label={`Начинка для ${slot.title}`}
        >
          {kinds === null ? (
            kindsStalled ? (
              <div className="wb__slot-stall">
                <span className="wb__dock-note">карта видов не приехала</span>
                <button type="button" className="wb__chip" onClick={onRetry}>
                  повторить
                </button>
              </div>
            ) : (
              <span className="wb__dock-note">грузим карту видов…</span>
            )
          ) : (
            compatible!.map((k) => (
              <button
                key={k.name}
                type="button"
                className={`wb__chip${k.name === fill ? ' is-current' : ''}`}
                aria-pressed={k.name === fill}
                data-label={`${k.name}${k.unread ? ' · вид не прочитан' : ''}`}
                onClick={() => onPick(k.name)}
              >
                {k.name}
                {/* Пометка — про КАРТУ, а не про фикстуру: «вид не прочитан»
                    значит, что `kind` в исходнике не свёлся к литералу
                    (DS-67), и такая начинка предлагается ВЕЗДЕ, потому
                    что `fitsSlot` пускает неизвестный вид куда угодно. Без
                    слов это выглядело бы как «годится сюда», а не как
                    «неизвестно, годится ли». */}
                {k.unread ? ' · вид не прочитан' : ''}
              </button>
            ))
          )}
        </div>
      )}
    </li>
  )
}

export function Dock({
  meta,
  currentCase,
  onPickCase,
  values,
  caseValues,
  onControl,
  onReset,
  changedCount,
  onResetAll,
  data,
  onPickData,
  currentCaseSlots,
  selectedSlots,
  kinds,
  kindsStalled,
  openSlot,
  onOpenPicker,
  onPickFill,
  onResetFill,
  onRetryKinds,
  onClearFill,
  force,
  forceStats,
  onToggleForce,
  mode,
  tab,
  onPickTab,
  tabstops,
  tabstopsOn,
  a11y,
  axeOn,
  canvasSnippet,
}: Props) {
  // В режиме «Состояния» копии заданы жёстко (покой/hover/focus-visible/active),
  // и тумблер ничего изменить не может. Гасим, а не прячем: исчезнувший блок
  // читается как несработавшая панель — то же правило, что у блока позиций.
  const forceIdle = mode === 'states'
  // Предмет блока JSX: на канвасе — набор целиком, иначе одиночный компонент.
  const onCanvas = mode === 'canvas'
  // НА КАНВАСЕ НАЧИНКИ ПОЗИЦИЙ НЕ РАБОТАЮТ, и блок обязан это сказать вслух.
  // `Patch.slots` адресован одиночной фикстуре кадра (`state.c`), а места
  // рисуются со `slots={{}}`; оставь блок живым — и щелчок по начинке молча не
  // сделает ничего. Молчащая кнопка хуже отсутствующей: её нажимают ещё раз,
  // потом ищут дефект в компоненте. Гасим, а не прячем, — тем же правилом, что
  // блок форса в режиме «Состояния»: исчезнувший блок читается как
  // несработавшая панель.
  const slotsIdle = onCanvas
  const forceOn = new Set((force ?? '').split(',').filter(Boolean))
  // Действующее состояние — то, что видно на экране, не то, что покручено
  // руками. `values` сам по себе не содержит пропы, которые задал кейс
  // (например `dense` у случая «Плотная»): передать в сниппет одни `values`
  // значило бы напечатать `<DataTable />` там, где на экране плотная таблица.
  const snippet = meta ? snippetOf(meta.name, { ...caseValues, ...values }, meta.controls, data, meta.unexpressed) : ''
  // У случая свой render (Badge «Все тона» и подобные) — сниппет из пропсов
  // не воспроизводит того, что нарисовано: он показал бы `<Badge tone="…" />`
  // там, где на экране шесть бейджей. Печатать его нельзя — это была бы
  // ложь ровно того рода, ради ухода от которой сниппет вообще завели.
  const ownRender = meta?.cases.find((k) => k.id === currentCase)?.ownRender === true
  /**
   * ПРОПЫ ДО ЭТОГО СЛУЧАЯ НЕ ДОЕЗЖАЮТ ([3] ручного QA): его действующий
   * `render` объявлен без параметров, читать их нечем. Значит мертвы ВСЕ
   * крутилки разом.
   *
   * НЕ `ownRender`, хотя отчёт назвал причиной именно его. Своя разметка не
   * означает мёртвых крутилок: у `Badge` случай «Все тона» рисует себя сам и
   * берёт `p.dot`. Погасив по своей разметке, панель отняла бы живой контрол.
   *
   * КАНВАСНОГО ИСКЛЮЧЕНИЯ ЗДЕСЬ НЕТ, в отличие от кнопки копирования ниже.
   * Там предмет — НАБОР, и одно место со своей разметкой не повод гасить копию
   * всего экрана. Здесь предмет — ВЫДЕЛЕННОЕ МЕСТО, и его крутилки мертвы
   * ровно так же, как в одиночном кадре: они едут в его компонент и никуда
   * больше.
   */
  const propsBlind = meta?.cases.find((k) => k.id === currentCase)?.ignoresProps === true
  /**
   * КРУТИЛКИ, КОТОРЫЕ СЛУЧАЙ ПЕРЕКРЫВАЕТ (DS-164) — адресно: `render`
   * случая задаёт их сам (`<Live {...p} title="Парки" />`), и значение до
   * рисунка не доходит. Гасим именно их, соседние живые. Выводит зонд
   * `case-overrides.ts`, не текст `render` и не объявление.
   *
   * На `propsBlind` не заменяет: там мертвы все и причина другая, «пропов не
   * берёт», и она уже сказана. Поэтому имя перечисляется только без неё.
   */
  const overridden = new Set(meta?.cases.find((k) => k.id === currentCase)?.overrides ?? [])

  return (
    <section className="wb__dock" role="region" aria-label="Панель">
      <div className="wb__dock-tabs" role="tablist" aria-label="Вкладки панели">
        {/* Вкладка «Таб-стопы» стоит на месте ВСЕГДА, а не появляется вместе
            со слоем: вкладка, приходящая и уходящая, заставляет искать её
            глазами каждый раз. Выключенный слой она объясняет словами. */}
        {(
          [
            ['panel', 'Панель'],
            ['tabstops', `Таб-стопы${tabstopsOn ? ` ${tabstops.length}` : ''}`],
            // Вкладка называется ИМЕНЕМ ИНСТРУМЕНТА, а не предметом:
            // «Доступность» обещает предмет целиком, axe отвечает за свою
            // треть. Разница не косметическая — зелёная вкладка «Доступность»
            // закрывает вопрос, зелёная вкладка «axe» его не закрывает.
            //
            // ЧИСЛО СТОИТ ТОЛЬКО ТАМ, ГДЕ ОНО ЧТО-ТО ЗНАЧИТ. «axe 0» на упавшем
            // прогоне и на нуле применённых правил — та же зелёная ложь, что и
            // «Нарушений нет» в теле, только на более заметной половине: тело
            // прочитают, если откроют, а счётчик читают всегда. Знаки, а не
            // цвет: «!» — не смогли, «—» — смотреть было нечего.
            ['axe', `axe${axeOn ? axeMark(a11y) : ''}`],
          ] as const
        ).map(([id, title]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`wb__dock-tab${tab === id ? ' is-current' : ''}`}
            onClick={() => onPickTab(id)}
          >
            {title}
          </button>
        ))}
        <span className="wb__dock-gap" />
        <span className="wb__dock-note">изменённые {changedCount}</span>
        <button type="button" className="wb__chip" onClick={onResetAll} disabled={changedCount === 0}>
          сброс
        </button>
      </div>

      {tab === 'axe' ? (
        <div className="wb__dock-body wb__dock-body--axe" role="group" aria-label="axe">
          {!axeOn ? (
            <p className="wb__dock-empty">
              Слой выключен. Включи «axe» в хроме — кадр обведёт нарушивший узел, а здесь появится,
              что именно нарушено.
            </p>
          ) : !a11y ? (
            <p className="wb__dock-empty">Кадр считает…</p>
          ) : a11y.error ? (
            /* Прогон не состоялся. Отдельная ветка, а не пустой список:
               «посмотреть не удалось» поданное как «нарушений нет» — зелёное
               враньё, и случается оно чаще всего на сломанном компоненте,
               то есть ровно там, где верстак и нужен. */
            <p className="wb__dock-empty">
              axe не смог посчитать: {a11y.error}. Это не «нарушений нет» — это «не смотрели».
            </p>
          ) : (
            <>
              {a11y.noRoot ? (
                /* КОРНЯ НЕТ — беда КАДРА, а не разметки, и до DS-163
                   она печаталась тем же текстом, что ноль применённых правил.
                   Один текст на два факта уводит: «пустое превью» человек
                   пойдёт искать в фикстуре, а искать надо в кадре. */
                <p className="wb__dock-empty">
                  Корня превью нет: кадр не отрисовал фикстуру. axe не запускался — это не
                  «нарушений нет».
                </p>
              ) : a11y.applied === 0 ? (
                /* НОЛЬ ПРИМЕНЁННЫХ ПРАВИЛ — не чистота, но и не отсутствие
                   кадра: разметка есть, axe по ней прошёлся и не нашёл ничего
                   своего. Напечатать это как «нарушений нет» значит выдать
                   отсутствие предмета за его исправность. */
                <p className="wb__dock-empty">
                  Смотреть было нечего: не применилось ни одного правила. Превью пусто — в нём
                  нет разметки, к которой axe знает вопросы.
                </p>
              ) : a11y.violations.length === 0 ? (
                /* Ноль — ЗАКОННЫЙ ответ, и печатается он ВМЕСТЕ с числом
                   применённых правил. «0 нарушений» в одиночку читается как
                   «доступность проверена», а axe ловит меньше трети WCAG:
                   ни клавиатурного порядка, ни осмысленности имён он не
                   смотрит вовсе. Ни «✓», ни «в порядке» здесь не будет. */
                <p className="wb__dock-empty">
                  Нарушений нет. Применилось правил: {a11y.applied}.
                </p>
              ) : (
                /* Список идёт В ТОМ ПОРЯДКЕ, в каком прислал кадр
                   (critical → minor), и оболочка его не пересортировывает:
                   серьёзность кодируется позицией, другого места у неё нет —
                   цветом величину не кодируем никогда. */
                <ol className="wb__flaws">
                  {a11y.violations.map((v) => (
                    <li className="wb__flaw" key={v.id}>
                      <span className="wb__flaw-id wb__mono">{v.id}</span>
                      <span className="wb__flaw-help">{v.help}</span>
                      <span className="wb__flaw-nodes wb__mono">
                        {v.nodes.map((n) => n.node).join(', ')}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {/* Нерешённое — ОТДЕЛЬНОЙ строкой, а не молчанием: правило,
                  которое axe не смог решить (контраст поверх картинки), слитое
                  с нулём нарушений превращает «не смог посмотреть» в
                  «посмотрел, всё хорошо». */}
              {a11y.incomplete.length > 0 && (
                <p className="wb__dock-note wb__dock-note--axe">
                  не решено: {a11y.incomplete.join(', ')} — axe не смог ответить, смотреть глазами
                </p>
              )}
              <p className="wb__dock-note wb__dock-note--axe">
                axe ловит меньше трети: порядок клавиатуры — вкладка «Таб-стопы», осмысленность
                имён и текста — ничья, кроме твоей.
              </p>
            </>
          )}
        </div>
      ) : tab === 'tabstops' ? (
        <div className="wb__dock-body wb__dock-body--stops" role="group" aria-label="Таб-стопы">
          {!tabstopsOn ? (
            <p className="wb__dock-empty">
              Слой выключен. Включи «таб-стопы» в хроме — кадр пронумерует то, до чего доходит
              клавиатура, а здесь появится их порядок.
            </p>
          ) : tabstops.length === 0 ? (
            /* Ноль — ЗАКОННЫЙ ответ, и он важнее большинства: превью, в
               которое клавиатура не заходит вовсе, выглядит нормально ровно
               до первой попытки им воспользоваться. */
            <p className="wb__dock-empty">
              Ни одного таб-стопа: до этого превью клавиатура не доходит.
            </p>
          ) : (
            <>
              <ol className="wb__stops">
                {tabstops.map((s, i) => (
                  <li className="wb__stop" key={`${s.node}-${i}`}>
                    <span className="wb__stop-n wb__mono">{i + 1}</span>
                    <span className="wb__stop-node wb__mono">{s.node}</span>
                    <span className="wb__stop-label">{s.label}</span>
                  </li>
                ))}
              </ol>
              {/* ЧЕМ ПОДПИСАН СТОП — сказано прямо, а не подразумевается
                  (DS-211). Подпись это ДОСТУПНОЕ ИМЯ, а не текст
                  разметки: до этой правки слой печатал «Реализация ТК-00417×»
                  там, где диктор говорит «Реализация ТК-00417», — то есть
                  показывал ровно то, что мы намеренно из имени убрали. Расчёт
                  свой и приближённый (`workbench/accname.ts`), потому что
                  точный — это 568 КБ axe-core в каждом кадре с включённым
                  слоем. Про цену сказано здесь, чтобы приближение не
                  принимали за точное значение. */}
              <p className="wb__dock-empty">
                Подпись — доступное имя узла, не текст разметки: `aria-hidden`-потомки в неё не
                входят, а `aria-label` её заменяет. Считается своим расчётом, приближённо —
                сверено с axe на всём каталоге, кроме узлов, спрятанных стилями.
              </p>
            </>
          )}
        </div>
      ) : (
      <div className="wb__dock-body">
        <div className="wb__dock-col wb__dock-col--cases" role="group" aria-label="Случаи">
          <div className="wb__dock-head">случаи{meta ? ` ${meta.cases.length}` : ''}</div>
          {meta ? (
            <ul className="wb__dock-list">
              {meta.cases.map((k) => (
                <li key={k.id}>
                  <button
                    type="button"
                    className={`wb__item wb__item--case${k.id === currentCase ? ' is-current' : ''}`}
                    aria-pressed={k.id === currentCase}
                    onClick={() => onPickCase(k.id)}
                    title={k.note}
                  >
                    {k.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wb__dock-empty">
              Случаи появятся, когда кадр загрузит фикстуру и расскажет о ней.
            </p>
          )}
        </div>

        {chunk(Object.entries(meta?.controls ?? {}), ROWS_PER_COLUMN).map((column, i, all) => (
          <div
            className={`wb__dock-col${i < all.length - 1 ? ' wb__dock-col--joined' : ''}`}
            key={i}
          >
            {/* ПРОДОЛЖЕНИЕ ГРУППЫ НАЗЫВАЕТ СЕБЯ ПРОДОЛЖЕНИЕМ (DS-150).
                Раньше здесь стоял пробел, доводом «крутилки 7 над каждой из
                четырёх читалось бы как четыре разных блока». Довод верный,
                решение неверное: пустая шапка рядом со стеной-разделителем
                читается не как «та же группа дальше», а как «ещё одна группа,
                безымянная». У Pagination счётчик говорил «6», а глаз видел
                пять и отдельный столбец с `withOptions`.

                ДВА СИГНАЛА, И ПООДИНОЧКЕ НИ ОДНОГО НЕ ХВАТИТ. Слово без снятой
                стены — это подпись на стене; снятая стена без слова оставляет
                шапку пустой, то есть по-прежнему безымянной. Вместе они
                отвечают на единственный вопрос читателя: та же это группа или
                новая. */}
            <div className={`wb__dock-head${i > 0 ? ' wb__dock-head--cont' : ''}`}>
              {i === 0 ? `крутилки ${Object.keys(meta?.controls ?? {}).length}` : 'продолжение'}
            </div>
            {/* ПРИЧИНА ОДИН РАЗ НА ГРУППУ, над первой колонкой, — тем же
                доводом, что и шапка «крутилки N»: повторённая над каждой из
                четырёх, она читалась бы как четыре разных блока.

                Погашенная крутилка без причины — та же тишина в другой позе:
                человек видит серый ряд и не знает, сломался ли верстак, не
                загрузилась ли фикстура или так задумано. Отчёт просил «просто
                погасить»; погасить и промолчать — это половина работы. */}
            {i === 0 && propsBlind && (
              <p className="wb__dock-empty">
                Случай рисует себя сам и пропов не берёт — крутилки до него не доедут.
              </p>
            )}
            {i === 0 && !propsBlind && overridden.size > 0 && (
              <p className="wb__dock-empty">
                Случай задаёт сам: {[...overridden].join(', ')} — эти крутилки на нём ничего не
                меняют и в адрес не пишутся.
              </p>
            )}
            {column.map(([name, control]) => (
              <ControlRow
                key={name}
                name={name}
                control={control}
                // ЧЕРЕЗ `displayValue`, а не напрямую из адреса
                // (DS-265): непонятое значение кадр не применяет, и док
                // обязан откатиться к значению случая ВМЕСТЕ с ним. Иначе
                // `?p.dense=xyzzy` рисовал бы в доке одно, а в кадре другое —
                // то есть верстак врал бы про самого себя, причём в ту
                // сторону, где ошибку принимают за поведение компонента.
                value={
                  (values[name] === undefined ? null : displayValue(control, values[name]))
                  ?? caseValues[name] ?? ''
                }
                caseValue={caseValues[name] ?? ''}
                disabled={propsBlind || overridden.has(name)}
                // Значение неизвестно по любой из двух причин: поле, которое
                // показывает то, чего на экране нет, врёт независимо от того,
                // почему пропы не доехали.
                unknown={propsBlind || overridden.has(name)}
                onChange={(v) => onControl(name, v)}
                onReset={() => onReset(name)}
              />
            ))}
          </div>
        ))}

        {/* Четвёртая колонка дока (спека, «Панель»: слоты становятся
            четвёртой колонкой), между крутилками и правой колонкой. Блок НЕ
            прячется при нуле позиций — исчезнувший блок читается как
            несработавшая панель (та же логика, что у блока случаев выше). */}
        {/* Живая колонка позиций делит размер с колонками крутилок — та же
            арифметика брифа (160 + 280 + 280 + 250 ≈ 1050).

            ПУСТАЯ — НЕ ДЕЛИТ (DS-150). «позиции 0» с текстом «заполнять
            нечего» занимала те же ~479px, что и живая колонка: на узком доке
            треть полезной ширины под сообщение о том, что тут ничего нет.
            Колонка остаётся на месте — исчезнувший блок читается как
            несработавшая панель, — но перестаёт РАСТИ: `--idle` снимает
            `flex-grow`. Место уходит тем, кому есть что показать. */}
        <div
          className={`wb__dock-col${slotsIdle || !meta || Object.keys(meta.slots).length === 0 ? ' wb__dock-col--idle' : ''}`}
          role="group"
          aria-label="Позиции"
        >
          <div className="wb__dock-head">
            позиции{meta && !slotsIdle ? ` ${Object.keys(meta.slots).length}` : ''}
          </div>
          {slotsIdle ? (
            <p className="wb__dock-empty">
              На канвасе начинки позиций пока не заполняются: они адресованы
              компоненту кадра, а не месту.
            </p>
          ) : !meta ? (
            <p className="wb__dock-empty">
              Позиции появятся, когда кадр загрузит фикстуру и расскажет о них.
            </p>
          ) : Object.keys(meta.slots).length === 0 ? (
            <p className="wb__dock-empty">У фикстуры позиций нет — заполнять нечего.</p>
          ) : (
            <ul className="wb__dock-list">
              {Object.entries(meta.slots).map(([slotId, slot]) => {
                const caseFill = currentCaseSlots[slotId]
                const fill = selectedSlots[slotId] ?? caseFill
                return (
                  <SlotRow
                    key={slotId}
                    slotId={slotId}
                    slot={slot}
                    fill={fill}
                    caseFill={caseFill}
                    isOpen={openSlot === slotId}
                    kinds={kinds}
                    kindsStalled={kindsStalled}
                    onOpen={() => onOpenPicker(slotId)}
                    onPick={(name) => onPickFill(slotId, name)}
                    onReset={() => onResetFill(slotId)}
                    onClear={() => onClearFill(slotId)}
                    onRetry={onRetryKinds}
                  />
                )
              })}
            </ul>
          )}
        </div>

        <div className="wb__dock-col wb__dock-col--right">
          <div className="wb__dock-head">данные · состояния · jsx</div>
          <div className="wb__dock-chips" role="group" aria-label="Набор данных">
            {/* «нет» — первый чип, а не крестик у выбранного: снять набор нужно
                так же часто, как поставить, и искать для этого крестик глазами
                дороже, чем нажать всегда стоящий на месте чип. */}
            <button
              type="button"
              className={`wb__chip${data === null ? ' is-current' : ''}`}
              aria-pressed={data === null}
              data-label="нет"
              onClick={() => onPickData(null)}
            >
              нет
            </button>
            {(meta?.data ?? []).map((name) => (
              <button
                key={name}
                type="button"
                className={`wb__chip${name === data ? ' is-current' : ''}`}
                aria-pressed={name === data}
                data-label={name}
                onClick={() => onPickData(name)}
              >
                {name}
              </button>
            ))}
            {meta && meta.data.length === 0 && (
              <span className="wb__dock-note">у фикстуры нет наборов данных</span>
            )}
          </div>
          {/* ФОРС-СОСТОЯНИЯ. Имена — как в CSS (`:hover`, а не «наведение»):
              под ними стоит число про ЭТИ правила, и русская глосса добавила
              бы шаг перевода между панелью и файлом, который сейчас правят.
              Набор, а не выбор: `hover` вместе с `focus-visible` — вопрос, на
              котором в CLAUDE.md записан живой дефект (подсветки неотличимы).

              Режим сравнения — четыре копии в ряд — Задача 30; здесь тумблеры
              для случая «зафиксировать одно состояние и разглядывать». */}
          <div className="wb__dock-chips" role="group" aria-label="Форс-состояния">
            {FORCE_STATES.map((st) => (
              <button
                key={st}
                type="button"
                className={`wb__chip wb__chip--mono${forceOn.has(st) ? ' is-current' : ''}`}
                aria-pressed={forceIdle ? undefined : forceOn.has(st)}
                data-label={`:${st}`}
                disabled={forceIdle}
                onClick={() => onToggleForce(st)}
              >
                :{st}
              </button>
            ))}
            {/* ДВА ЧИСЛА, а не одно. Время обхода без числа пропущенных
                ничего не утверждает: обход, не разобравший ни одного правила,
                укладывается в бюджет блестяще. Ноль пропущенных — сегодняшняя
                норма (`:not(:hover)`/`:has()` в системе нет), и любое другое
                число значит, что в CSS появилась конструкция, которую разбор
                не берёт, а не что форс сломался. */}
            {forceIdle && (
              <span className="wb__dock-note">все четыре показаны рядом в кадре</span>
            )}
            {forceStats ? (
              <span
                className={`wb__dock-note${forceStats.skipped > 0 ? ' wb__dock-note--warn' : ''}`}
                title={
                  forceStats.skipped > 0
                    ? 'Правила с :not(:hover)/:has() и вложенный CSS разбор не переписывает — форс их не покажет'
                    : 'Обход листов кадра: один раз на загрузку, дальше форс — запись атрибута'
                }
              >
                обход {forceStats.ms.toFixed(1)} мс · пропущено {forceStats.skipped}
              </span>
            ) : (
              <span className="wb__dock-note">кадр ещё не рассказал про обход</span>
            )}
          </div>
          <div className="wb__dock-jsx-head">
            {/* ПОДПИСЬ НАЗЫВАЕТ ПРЕДМЕТ, а не остаётся «JSX» на оба случая.
                Один и тот же заголовок над сниппетом одного компонента и над
                сниппетом всего экрана заставляет догадываться, что именно
                ляжет в буфер, — а узнают это уже после вставки. */}
            <span className="wb__dock-note">{onCanvas ? 'JSX набора' : 'JSX'}</span>
            {/* У случая со своим render кнопки нет вовсе — копировать нечего,
                снизу вместо неё слова. Пустая панель (meta === null) кнопку
                держит на месте, но неактивной: без disabled клик копирует
                пустую строку и показывает галочку — успех, которого не было.

                НА КАНВАСЕ ПРАВИЛО `ownRender` НЕ ДЕЙСТВУЕТ, и это не
                недосмотр: предмет копирования там — НАБОР, а место со своей
                разметкой объясняется комментарием в своей клетке
                (`canvasSnippetOf`). Погасить кнопку из-за одного места значило
                бы отнять копию всего собранного экрана, и выглядело бы это как
                «кнопка пропадает, когда ткнёшь не туда». Неактивна она здесь
                по другому поводу — пустому набору. */}
            {(onCanvas || !ownRender) && (
              <CopyChip
                label="скопировать"
                value={onCanvas ? (canvasSnippet ?? '') : snippet}
                title={
                  onCanvas
                    ? 'Скопировать JSX всего набора — сетку и места в ней'
                    : 'Скопировать JSX с текущими пропами'
                }
                // НЕ `!canvasSnippet`: набор, где ни одна фикстура не
                // загрузилась, даёт непустую строку из контейнера и одних
                // объяснений — кнопка оставалась живой и копировала сетку без
                // единого компонента, показывая галочку. Довод дословно тот
                // же, что абзацем выше про пустую панель.
                disabled={onCanvas ? !hasPrintableSpot(canvasSnippet ?? '') : !meta}
              />
            )}
          </div>
          {onCanvas ? (
            canvasSnippet ? (
              <pre className="wb__dock-jsx">{canvasSnippet}</pre>
            ) : (
              <p className="wb__dock-empty">
                На канвасе нет ни одного места — копировать нечего.
              </p>
            )
          ) : ownRender ? (
            <p className="wb__dock-empty">
              У случая своя разметка — сниппет показал бы пропсы, а не то, что нарисовано на экране.
            </p>
          ) : meta ? (
            <pre className="wb__dock-jsx">{snippet}</pre>
          ) : (
            <p className="wb__dock-empty">
              Сниппет появится, когда кадр загрузит фикстуру и расскажет о пропах.
            </p>
          )}
        </div>
      </div>
      )}
    </section>
  )
}
