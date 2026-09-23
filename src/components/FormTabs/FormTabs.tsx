import { useEffect, useRef } from 'react'
import { rovingTarget } from '../../internal/roving.js'
import '../../styles/disabled-item.css'
import { useDsText } from '../../dictionary/DsText.js'
import { Icon } from '../../icons/index.js'
import './FormTabs.css'

export interface FormTab {
  id: string
  label: string
  /**
   * Форма открыта, но переключиться на неё нельзя (идёт запись, нет прав).
   * Как у `Tabs`: `aria-disabled` и пропуск стрелками, из полосы не исчезает.
   */
  disabled?: boolean
  /**
   * Значок перед подписью — тип документа, а не его состояние.
   *
   * **Декоративен и в доступное имя не попадает** (`aria-hidden`), как у
   * `Tabs`. Смысл несёт ТЕКСТ подписи, а не значок: подпись читается и без
   * него, значок только ускоряет узнавание строки среди дюжины открытых форм.
   *
   * **Сюда не кладут состояние документа** — у него своё поле, `modified`.
   * Смешать оба в одном `icon` значило бы решать за каждого потребителя, каким
   * знаком рисовать «не записано», и первый же положил бы сюда звёздочку сам,
   * своим цветом — ровно то, что `modified` ниже делает системно.
   */
  icon?: React.ReactNode
  /**
   * Форма открыта и НЕ ЗАПИСАНА.
   *
   * Отдельное поле, а не содержимое `icon`: состояние документа общее для
   * ВСЕХ потребителей полосы, а не решение одного экрана, и некодированное
   * поле каждый закодирует по-своему — обычно цветным кружком, то есть цветом
   * в одиночку, что запрещено законом системы о цвете (`CLAUDE.md`, «Colour
   * and magnitude»). Здесь у состояния есть и знак (`*`), и слово (`title`);
   * цвет в этом не участвует вовсе.
   */
  modified?: boolean
}
export interface FormTabsProps {
  tabs: FormTab[]
  selectedId: string
  onSelect?: (id: string) => void
  onClose?: (id: string) => void
  onHome?: () => void
}

export function FormTabs({ tabs, selectedId, onSelect, onClose, onHome }: FormTabsProps) {
  const text = useDsText()
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tabRefs = useRef<(HTMLDivElement | null)[]>([])
  const stripRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const homeRef = useRef<HTMLButtonElement | null>(null)
  const activeIndex = tabs.findIndex((t) => t.id === selectedId)

  // The strip scrolls once the open forms outgrow it, so the active tab has to
  // be pulled back into view — otherwise switching forms can leave the current
  // one off-screen with nothing to indicate where it went.
  //
  // Выровнять ОДИН РАЗ мало, и это замерено (DS-175). При монтировании
  // полоса вставала мимо максимума прокрутки на `96 × --ds-ui-scale`, и корень
  // оказался не в метрике вкладки, а во ВРЕМЕНИ: эффект успевает выровнять
  // раскладку, набранную ЗАПАСНЫМ шрифтом, а `Inter` доезжает после и делает
  // содержимое шире.
  //
  //   кадр 900, шкала 1:  содержимое запасным 2143, Inter 2239, прирост 96
  //                       scrollLeft при монтировании 1303
  //                       максимум ЗАПАСНОЙ раскладки 2143 − 840 = 1303
  //
  // Совпадение точное, не «примерно»: 96 / 120 / 96 при шкалах 1 / 1.25 / 1 —
  // промах РАВЕН приросту от шрифта в каждом замере. Отсюда и то, почему он не
  // зависел от ширины порта (растёт и содержимое, и максимум — на одно и то же)
  // и почему ехал по шкале (кегль едет, значит едет и прирост).
  //
  // Правило, которое из этого следует, шире шрифта: выравнивание УСТАРЕВАЕТ,
  // как только меняется размер порта или содержимого. Поэтому наблюдатель, а не
  // один `fonts.ready`, — у потребителя полоса живёт в раскладке, которая
  // меняется сама (свернули боковую панель, открыли шторку), и там промах тот
  // же, уже без всякого шрифта.
  //
  // И всё же `fonts.ready` СВЕРХ наблюдателя, а не вместо. `ResizeObserver` не
  // доставляется в фоновой вкладке — проверено здесь же, свой наблюдатель дал
  // ноль срабатываний и на подписке, и после заведомой смены размера. Полоса
  // форм отвечает на вопрос «где я» в первый момент восстановленного сеанса, и
  // ставить этот ответ на механизм, который в невыведенной вкладке молчит, —
  // плохой размен. Промис доезжает всегда.
  useEffect(() => {
    const el = tabRefs.current[activeIndex]
    if (!el) return
    const align = () => el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    align()

    let alive = true
    void document.fonts?.ready?.then?.(() => { if (alive) align() })

    let ro: ResizeObserver | undefined
    const strip = stripRef.current, list = listRef.current
    if (typeof ResizeObserver !== 'undefined' && strip && list) {
      ro = new ResizeObserver(align)
      // Оба узла: порт — это внешняя полоса, содержимое — таблист внутри неё.
      // Шрифт меняет второй, раскладка потребителя — первый.
      ro.observe(strip); ro.observe(list)
    }
    return () => { alive = false; ro?.disconnect() }
  }, [selectedId, activeIndex])

  // Куда уходит фокус после закрытия С КЛАВИАТУРЫ (DS-175, третья
  // приёмка). Закрытая вкладка исчезает из DOM вместе с фокусом, и он падает на
  // `body`: пользователь вылетает из полосы, а следующий `Delete` уходит в
  // никуда. Замерено — 12 вкладок, фокус на третьей, после нажатия
  // `activeElement` это `BODY`, и второй `Delete` подряд не закрывает ничего.
  //
  // Переносим на вкладку, ВСТАВШУЮ НА ЕЁ МЕСТО, а для последней — на новую
  // последнюю. Это правило полосы вкладок: рука остаётся там же, где была.
  //
  // Только для клавиатуры. Закрытие мышью фокус НЕ забирает: курсор уже там,
  // куда смотрит пользователь, и втягивать фокус в полосу означало бы уводить
  // его с того места, где он был до клика.
  //
  // Полоса управляемая, поэтому «закрылась» — это не наше событие, а следующий
  // рендер потребителя. Отсюда флаг плюс сверка ДЛИНЫ: потребитель волен
  // `onClose` проигнорировать (спросить про несохранённое, отказать), и тогда
  // фокусировать нечего — вкладка на месте и фокус на ней.
  const pendingCloseRef = useRef<number | null>(null)
  const prevLenRef = useRef(tabs.length)
  useEffect(() => {
    const i = pendingCloseRef.current
    const shrank = tabs.length < prevLenRef.current
    prevLenRef.current = tabs.length
    if (i === null) return
    pendingCloseRef.current = null
    if (!shrank) return
    // Закрыли ПОСЛЕДНЮЮ форму — переносить некуда, и фокус ушёл бы на `body`.
    // Кнопка «домой» рядом и остаётся единственным стопом полосы; когда её нет
    // (`onHome` не задан), полоса пуста целиком, и держать фокус действительно
    // не на чем.
    if (tabs.length === 0) { homeRef.current?.focus(); return }
    labelRefs.current[Math.min(i, tabs.length - 1)]?.focus()
  }, [tabs])

  function onKeyDown(e: React.KeyboardEvent) {
    // Закрытие с клавиатуры — на ВКЛАДКЕ, потому что крестик перестал быть
    // отдельным таб-стопом (DS-175, вторая приёмка). Индекс берётся от
    // сфокусированного узла, а не от `activeIndex`: без `onSelect` стрелки
    // двигают фокус, не меняя выбранного, и закрыть тогда надо ту вкладку, на
    // которой стоишь, а не ту, что подсвечена.
    if (onClose && (e.key === 'Delete' || e.key === 'Backspace')) {
      const fi = labelRefs.current.findIndex((el) => el === e.target)
      const focused = fi === -1 ? undefined : tabs[fi]
      if (focused) { e.preventDefault(); pendingCloseRef.current = fi; onClose(focused.id) }
      return
    }
    const ni = rovingTarget(tabs, activeIndex, e.key)
    if (ni === null) return
    e.preventDefault()
    const next = tabs[ni]
    if (!next) return
    onSelect?.(next.id)
    labelRefs.current[ni]?.focus()
  }

  return (
    // Прокручивается ПОЛОСА, а таблист — её ребёнок, и это разделение
    // вынужденное (DS-175). Кнопка «домой» лежала внутри `role="tablist"`,
    // и axe давал `aria-required-children` на пяти случаях из шести: у таблиста
    // могут быть только вкладки.
    //
    // ЧУЖИХ ДЕТЕЙ БЫЛО ДВОЕ, а не один, и первая правка вынесла только кнопку:
    // счёт нарушений не изменился, сменился узел. Второй — крестик, лежавший
    // кнопкой внутри обёртки вкладки; обёртка роли не несёт, для дерева
    // доступности прозрачна, и её содержимое владеется таблистом наравне с ней.
    // Диагноз тогда снимался различением со случаем `no-home`, а у того сняты
    // ДВЕ переменные разом (`home: false` и `closable: false`) — приём верен,
    // контрольный случай был негоден.
    //
    // Прежнее обоснование в заметке случая `roving` («она вне таблиста ПО
    // СМЫСЛУ») было дефектом, отмытым в объяснение: по смыслу — да, по разметке
    // она лежала внутри. Теперь совпало и то и другое.
    //
    // Скроллером остаётся ВНЕШНИЙ узел, и это не деталь: кнопка на нём
    // `position: sticky`, а липкость считается от ближайшего прокручиваемого
    // предка. Отдай скролл таблисту — и кнопка перестанет липнуть, а вместе с
    // ней уедет `scroll-padding-left`, которым лечится перекрытие.
    <div ref={stripRef} className={['ds-formtabs', onHome && 'ds-formtabs--with-home'].filter(Boolean).join(' ')}>
      {onHome && (
        <button ref={homeRef} type="button" className="ds-formtabs__home" aria-label={text['formTabs.home']} onClick={onHome}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </button>
      )}
      {/* Имя полосы — из словаря: `role="tablist"` его не требует, axe не
          показывает, и без него полоса ОТКРЫТЫХ ФОРМ на слух неотличима от
          вкладок внутри формы. Обработчик клавиш переехал сюда вместе с ролью:
          на внешнем узле стрелка, нажатая на кнопке «домой», переключала
          открытый документ — то есть кнопка, намеренно выведенная из полосы,
          всё равно ей управляла. */}
      <div ref={listRef} className="ds-formtabs__list" role="tablist" aria-label={text['formTabs.strip']} onKeyDown={onKeyDown}>
        {tabs.map((t, i) => {
          const active = t.id === selectedId
          return (
            // Роль — на кнопке, а не на обёртке: `role="tab"` на нефокусируемом
            // <div> оставлял скринридеру «кнопка» вместо «вкладка, 2 из 5», то
            // есть терялись и позиция, и размер полосы. Обёртка чисто
            // раскладочная: она держит фон активной вкладки и рамку, и она же —
            // цель прокрутки (крестик должен въезжать в видимую зону вместе с
            // подписью). Роли у обёртки нет, и axe её терпит — это ПРОВЕРЕНО
            // мутацией, а не выведено: спрятать крестики на `base` и нарушение
            // уходит, обёртки при этом на месте.
            <div key={t.id}
              ref={(el) => { tabRefs.current[i] = el }}
              className={['ds-formtabs__tab', active && 'is-active'].filter(Boolean).join(' ')}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                {...(t.disabled ? { 'aria-disabled': true as const } : {})}
                {...(onClose ? { 'aria-keyshortcuts': 'Delete' } : {})}
                {...(t.modified ? { title: text['formTabs.modified'] } : {})}
                className="ds-formtabs__label"
                tabIndex={active && !t.disabled ? 0 : -1}
                ref={(el) => { labelRefs.current[i] = el }}
                onClick={t.disabled ? undefined : () => onSelect?.(t.id)}
              >
                {t.icon != null && <Icon className="ds-formtabs__icon" aria-hidden="true">{t.icon}</Icon>}
                {t.label}
                {t.modified && <span className="ds-formtabs__modified" aria-hidden="true">*</span>}
                {/* Крестик — НЕ кнопка и не сосед вкладки, а её потомок без
                    роли (DS-175, вторая приёмка). Кнопкой-соседом он был
                    прямым ребёнком таблиста, а тому разрешены только вкладки:
                    axe давал `aria-required-children` и после того, как оттуда
                    убрали «домой», — виноваты были ОБА узла, а померен один.

                    Соседом внутри вкладки он быть не может тем более:
                    интерактивный элемент внутри `role="tab"` — две модели
                    навигации на одном узле, и это запрещено гейтом
                    `no-nested-interactive`. `role="presentation"` на кнопке не
                    спасает: фокусируемый узел презентационным не становится,
                    правило разрешения конфликтов ARIA снимает такую роль.

                    Остаётся модель полосы вкладок браузера: крестик — мишень
                    для мыши, `Delete` — путь с клавиатуры, объявленный
                    `aria-keyshortcuts` на самой вкладке. Заодно уходит третий
                    таб-стоп, из-за которого заметка случая `roving` обещала два,
                    а полоса давала три. */}
                {onClose && (
                  <span
                    className="ds-formtabs__close"
                    aria-hidden="true"
                    // Роли нет и не будет (выше), поэтому назначение объявлено
                    // атрибутом: `scanTargets` иначе не считает крестик целью
                    // НИ В ОДНОМ указателе и молчит о его размере — мутация
                    // «20×20 в сенсорной ветке» оставалась зелёной
                    // (DS-346). Судится только размер и попадание;
                    // доступного имени атрибут не даёт и не обещает.
                    data-ds-target=""
                    title={text['formTabs.close'](t.label)}
                    // Гасим ПЕРЕВОД ФОКУСА, а не клик: `mousedown` по потомку
                    // фокусирует ближайшего фокусируемого предка, то есть
                    // закрываемую вкладку, — и она тут же исчезает вместе с
                    // фокусом. Замерено приёмкой: фокус стоял на вкладке А,
                    // мышью закрыли Б, `activeElement` стал `body`. Теперь
                    // фокус не трогается вовсе: был снаружи — остался снаружи,
                    // был на соседней вкладке — там и остался.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => { e.stopPropagation(); onClose(t.id) }}
                  >×</span>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
