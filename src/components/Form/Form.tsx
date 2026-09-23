import { useId, useState } from 'react'
import { ChevronDown } from '../../icons/glyphs.js'
import type { BadgeTone } from '../Badge/index.js'
import './Form.css'
import { Icon } from '../../icons/index.js'
import { assertAction, type CardTool } from '../../internal/action.js'

/** Тот же словарь тонов, что у Badge, Timeline, LogViewer и Heatmap. */
export type CardTone = BadgeTone

export interface CardProps extends React.ComponentPropsWithRef<'div'> {
  title?: string
  /** Вторая строка в шапке, мельче и приглушённая. */
  subtitle?: string
  /** Узел справа в шапке: «⋯», ссылка «Все заметки →», кнопка. */
  headerAction?: React.ReactNode
  /**
   * Ведущая иконка перед заголовком — **декоративная** (`aria-hidden`), смысл
   * несёт текст, как у `icon` в `Tab`. С ней шапка всегда «богатая» (иконка и
   * заголовок в ряд), поэтому карточка даже только с `title`+`icon` получает
   * widget-шапку, а не плоскую.
   */
  icon?: React.ReactNode
  /**
   * Сколько строк отдать заголовку. По умолчанию одна: длинное название
   * обрезается многоточием и не растягивает шапку в узкой карточке.
   */
  titleLines?: 1 | 2
  /** Уплотнённые отступы тела. */
  dense?: boolean
  /** Тело без отступов — для таблицы впритык к краям. */
  noPadding?: boolean
  footer?: React.ReactNode
  /**
   * Тон карточки — полоса 3px сверху. **Заливку не трогает:** карточка это
   * контейнер содержимого, а не плашка статуса, и тонированное тело мешало бы
   * его читать.
   *
   * Не путать с `Alert`: тот сообщает о событии и сам читается как сообщение,
   * а `tone` помечает состояние контейнера, содержимое которого остаётся
   * обычным. «Заблокирована» карточкой в списке — это `tone`; «заблокирована»
   * уведомлением вверху экрана — это `Alert`.
   */
  tone?: CardTone
  /**
   * Панель сворачивается кликом по заголовку. Заголовок становится кнопкой с
   * `aria-expanded`/`aria-controls`; сворачивается тело + `toolbar` + `footer`.
   */
  collapsible?: boolean
  /** Стартовое свёрнутое состояние (неконтролируемый режим). */
  defaultCollapsed?: boolean
  /** Свёрнутость под контролем потребителя (controlled). */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /**
   * Ряд икон-инструментов в шапке справа (перед `headerAction`). Каждый —
   * отдельная кнопка со своим `label` (он уходит в `aria-label`: кнопка
   * рисуется одной иконкой); клик не сворачивает панель. Тона у инструмента
   * нет намеренно — довод в `src/internal/action.ts`.
   */
  tools?: CardTool[]
  /** Док-панель инструментов под шапкой, над телом (tbar). Нижний бар — это `footer`. */
  toolbar?: React.ReactNode
  /** `'framed'` — обрамлённый вид с акцентной шапкой; `'plain'` (по умолчанию) — без неё. */
  variant?: 'plain' | 'framed'
}

/**
 * Инструмент в шапке карточки-панели — сужение общего `ActionBase`
 * (DS-358). До 4.3.x это был собственный тип с `ariaLabel` и `onClick`;
 * оба поля отменены, см. `src/internal/action.ts`.
 */
export type { CardTool }

export function Card({
  title,
  subtitle,
  headerAction,
  icon,
  titleLines = 1,
  dense = false,
  noPadding = false,
  footer,
  tone,
  collapsible = false,
  defaultCollapsed = false,
  collapsed,
  onCollapsedChange,
  tools,
  toolbar,
  variant = 'plain',
  className,
  children,
  id,
  ...rest
}: CardProps) {
  const autoId = useId()
  const bodyId = `${id ?? autoId}-body`
  const [selfCollapsed, setSelfCollapsed] = useState(defaultCollapsed)
  const isCollapsed = collapsed ?? selfCollapsed

  function toggle() {
    const next = !isCollapsed
    onCollapsedChange?.(next)
    // Контролируемым состоянием владеет проп — своё не ведём.
    if (collapsed == null) setSelfCollapsed(next)
  }

  // Старая форма инструмента (`ariaLabel`/`onClick`, DS-358) обязана
  // БРОСАТЬ, а не деградировать: под `any` у потребителя она нарисовала бы ряд
  // безымянных кнопок, которые ничего не делают, и ни одной ошибки.
  tools?.forEach((t) => assertAction(t, 'Card: `tools`'))

  const hasTools = Boolean(tools && tools.length > 0)
  // Просьба про две строки — тоже про шапку виджета: в старой разметке заголовок
  // лежит текстом прямо в блоке, переносить там нечего. Сворачивание и tools
  // тоже требуют богатой шапки.
  const widgetHeader = Boolean(subtitle || headerAction || titleLines === 2 || collapsible || hasTools || icon)
  // `icon` в этом списке НЕТ, в отличие от `widgetHeader`. Иконка помечена
  // `aria-hidden` и по построению декоративна: одна, без заголовка и без единого
  // органа управления, она даёт полосу в 47px, в которой нечего прочитать.
  // Замерено на странице настроек потребителя: две карточки из восьми рисовали
  // такую полосу, а заголовок лежал ниже в теле отдельным `h2` — читателю
  // доставалась пустая плашка, под ней заголовок, похожий на начало другого
  // блока (DS-136). Иконка украшает шапку, но не является поводом её
  // завести.
  const showHeader = Boolean(title || subtitle || headerAction || collapsible || hasTools)

  const titles = (
    <div className="ds-card__titles">
      {title && (
        <div className={['ds-card__title', titleLines === 2 && 'ds-card__title--wrap']
          .filter(Boolean).join(' ')}>{title}</div>
      )}
      {subtitle && <div className="ds-card__subtitle">{subtitle}</div>}
    </div>
  )

  // Инструменты и действие — ОДНОЙ группой (DS-339): на узкой шапке они
  // уходят вторым рядом вместе и прижаты вправо. Порознь перенесённое действие
  // вставало бы влево, а auto-поля у двух соседей делили бы ряд между ними.
  const headerExtras = (hasTools || headerAction) && (
    <div className="ds-card__extras">
      {hasTools && (
        <div className="ds-card__tools">
          {tools!.map((t) => (
            <button key={t.id} type="button" className="ds-card__tool" aria-label={t.label}
              disabled={t.disabled} onClick={t.onSelect}>
              <Icon>{t.icon}</Icon>
            </button>
          ))}
        </div>
      )}
      {headerAction && <div className="ds-card__action">{headerAction}</div>}
    </div>
  )

  // Сворачиваемая область: toolbar + тело + footer. Обёртка появляется только
  // при collapsible — обычные карточки остаются структурно прежними.
  const region = (
    <>
      {toolbar && <div className="ds-card__toolbar">{toolbar}</div>}
      <div className={[
        'ds-card__body',
        dense && 'ds-card__body--dense',
        noPadding && 'ds-card__body--flush',
      ].filter(Boolean).join(' ')}>{children}</div>
      {footer && <div className="ds-card__footer">{footer}</div>}
    </>
  )

  return (
    <div
      className={['ds-card', variant === 'framed' && 'ds-card--framed', tone && `ds-card--tone-${tone}`, className]
        .filter(Boolean).join(' ')}
      id={id}
      {...rest}
    >
      {showHeader && (
        widgetHeader ? (
          <div className="ds-card__header ds-card__header--widget">
            {icon && <Icon className="ds-card__icon" aria-hidden="true">{icon}</Icon>}
            {collapsible ? (
              <button
                type="button"
                className="ds-card__toggle"
                aria-expanded={!isCollapsed}
                aria-controls={bodyId}
                onClick={toggle}
              >
                <ChevronDown
                  size={16} aria-hidden
                  className={['ds-card__chevron', isCollapsed && 'is-collapsed'].filter(Boolean).join(' ')}
                />
                {titles}
              </button>
            ) : titles}
            {headerExtras}
          </div>
        ) : (
          <div className="ds-card__header">{title}</div>
        )
      )}
      {collapsible
        ? (!isCollapsed && <div id={bodyId} className="ds-card__collapsible">{region}</div>)
        : region}
    </div>
  )
}

export interface FormRowProps {
  label: string
  htmlFor?: string
  children: React.ReactNode
}

export function FormRow({ label, htmlFor, children }: FormRowProps) {
  return (
    <div className="ds-formrow">
      <label className="ds-formrow__label" htmlFor={htmlFor}>{label}</label>
      <div className="ds-formrow__control">{children}</div>
    </div>
  )
}
