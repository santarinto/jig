import '../../styles/field-surface.css'
import '../../styles/button-surface.css'
import { useDsText } from '../../dictionary/DsText.js'
import './Pagination.css'

export type PaginationVariant = 'pages' | 'arrows'

export interface PaginationProps {
  page: number
  pageCount: number
  onChange?: (page: number) => void
  /**
   * `pages` — полоса номеров (форма из всех прежних версий, остаётся по
   * умолчанию). `arrows` — только «‹ ›»: подвал таблицы, где номера не нужны, а
   * место нужно.
   */
  variant?: PaginationVariant
  /**
   * Всего записей. Вместе с `pageSize` включает метку диапазона.
   *
   * Без `pageSize` метки не будет: посчитать «1–20» не из чего, а показать
   * половину хуже, чем не показать.
   */
  total?: number
  /** Размер страницы. Нужен и для метки диапазона, и для селектора. */
  pageSize?: number
  /** Варианты размера страницы. Без них селектор не рисуется. */
  pageSizeOptions?: number[]
  onPageSizeChange?: (size: number) => void
  /**
   * Метка диапазона. По умолчанию «1–20 из 347».
   *
   * Один проп на всю строку, а не отдельное слово «из»: языки расходятся не
   * только словами, но и порядком, и собрать чужую фразу по слову нельзя.
   */
  formatRange?: (from: number, to: number, total: number) => React.ReactNode
  /** Подпись перед селектором размера. По умолчанию «На странице». */
  pageSizeLabel?: string
  className?: string
  id?: string
}

/**
 * Номера страниц с многоточиями: первая, последняя, текущая и соседи.
 * Числа — номера, `null` — многоточие.
 *
 * Полоса «кнопка на каждую страницу» была настоящей: на 10 000 записей по 20
 * она рисовала 500 кнопок — это не работает ни как разметка, ни как способ
 * выбрать страницу.
 */
export function pageWindow(page: number, pageCount: number, siblings = 1): (number | null)[] {
  // 5 = первая + последняя + текущая + два многоточия. Меньше — показываем всё:
  // многоточие вместо одного номера ничего не экономит, только рвёт полосу.
  const span = siblings * 2 + 5
  if (pageCount <= span) return Array.from({ length: pageCount }, (_, i) => i + 1)

  const left = Math.max(page - siblings, 1)
  const right = Math.min(page + siblings, pageCount)
  const out: (number | null)[] = [1]
  if (left > 2) out.push(null)
  for (let p = Math.max(left, 2); p <= Math.min(right, pageCount - 1); p++) out.push(p)
  if (right < pageCount - 1) out.push(null)
  out.push(pageCount)
  return out
}

/**
 * Многоточие и страница, к которой оно ведёт, — ОДИН элемент ряда.
 *
 * `…` в пагинации значит «пропуск ДО этой страницы», то есть знак смыслом
 * привязан к соседу справа. Пару завели, когда ряд номеров ПЕРЕНОСИЛСЯ
 * (DS-142): она рвалась переносом первой — на 360 в псевдолокали верхний
 * ряд заканчивался на «…», а «18» начинала нижний. Оторванное многоточие
 * читается как «и так далее», то есть как КОНЕЦ списка, — противоположность
 * тому, что оно значит.
 *
 * Склеено разметкой, а не свойством переноса: `break-after: avoid` во флексовом
 * переносе не работает, а единственный способ не разорвать двух соседей — не
 * делать их двумя элементами ряда.
 *
 * С DS-282 ряд не переносится ни на одной ширине, и разорвать пару
 * переносом больше нечем. Разметка остаётся прежней по второй причине, которая
 * была у неё с самого начала: компактный вид снимает номера селектором
 * `> .ds-pager__jump`, то есть по ПРЯМОМУ ребёнку ряда, — номер внутри пары
 * прямым ребёнком не является и структурным селектором не берётся.
 *
 * `pageWindow` не отдаёт `null` последним и не ставит два подряд — за `null`
 * всегда идёт номер. Проверка ниже держит это утверждение: одинокое многоточие
 * рисуется отдельно, а не роняет полосу и не съедает соседа.
 */
function renderWindow(
  win: (number | null)[],
  page: number,
  onChange?: (page: number) => void,
): React.ReactNode[] {
  // Многоточие — не кнопка: нажимать не на что, а с клавиатуры оно добавляло бы
  // остановку, которая никуда не ведёт.
  const gap = (key: string) => <span key={key} className="ds-pager__gap" aria-hidden="true">…</span>
  const btn = (p: number) => (
    <button
      type="button"
      key={p}
      // `--page` отделяет НОМЕР от стрелки: обе кнопки — `ds-pager__btn`, а
      // компактный вид убирает ровно номера (DS-149). Структурным
      // селектором это не берётся: номера идут сплошь между первой и последней
      // кнопкой, но часть из них спрятана внутри `.ds-pager__jump`, то есть
      // прямыми детьми ряда не является.
      className={['ds-pager__btn', 'ds-pager__btn--page', p === page && 'is-active'].filter(Boolean).join(' ')}
      aria-current={p === page ? 'page' : undefined}
      onClick={() => onChange?.(p)}
    >{p}</button>
  )

  const out: React.ReactNode[] = []
  for (let i = 0; i < win.length; i++) {
    const it = win[i]
    if (it !== null) { out.push(btn(it)); continue }
    const next = win[i + 1]
    if (next == null) { out.push(gap(`gap-${i}`)); continue }
    out.push(
      <span key={`jump-${i}`} className="ds-pager__jump">{gap(`gap-${i}`)}{btn(next)}</span>,
    )
    i++
  }
  return out
}

/** Знаки шага. Один источник на оба места, где они пишутся. */
const GLYPH = { prev: '‹', next: '›' } as const

/**
 * Содержимое кнопки шага: слово, знак — или ОБА, но видно всегда одно.
 *
 * `variant: 'arrows'` как был: знак и только знак, доступное имя приходит
 * `aria-label`'ом. У `variant: 'pages'` кнопка несёт и слово, и знак, а
 * выбирает между ними ШИРИНА — компактный вид прячет слово и показывает знак
 * (DS-149).
 *
 * Обе надписи в разметке, а не одна: выбор делает `@container`, то есть CSS, а
 * CSS текста кнопки не меняет. Пара кнопок при этом ОДНА — удваивается надпись
 * внутри кнопки, а не управление: второй пары стрелок, которую надо было бы
 * прятать целиком, в ряду не появляется.
 *
 * Знак помечен `aria-hidden`, чтобы доступное имя кнопки в широкой полосе
 * осталось словом, а не «Назад ‹». В компактном виде слово снято
 * `display: none` и имени у кнопки не остаётся вовсе — это известно и
 * сознательно не чинится: клавиатура и скринридер отложены владельцем на время
 * MVP.
 */
function stepLabel(variant: PaginationVariant, dir: 'prev' | 'next', word: string): React.ReactNode {
  if (variant === 'arrows') return GLYPH[dir]
  return (
    <>
      <span className="ds-pager__word">{word}</span>
      <span className="ds-pager__arrow" aria-hidden="true">{GLYPH[dir]}</span>
    </>
  )
}

export function Pagination({
  page, pageCount, onChange,
  variant = 'pages',
  total, pageSize, pageSizeOptions, onPageSizeChange,
  formatRange, pageSizeLabel,
  className, id,
}: PaginationProps) {
  const t = useDsText()
  const showSize = pageSizeOptions != null && pageSizeOptions.length > 0
  const fmt = formatRange ?? t['pagination.range']
  const labelId = `${id ?? 'ds-pager'}-sizelabel`

  // Полосой пагинация становится, только когда появилась вторая зона. Иначе
  // это прежний inline-блок, и вёрстка потребителей не едет.
  const bar = showSize || (total != null && pageSize != null)

  // Отдельной ветки под пустую выдачу нет и не нужно: при `total === 0` оба
  // `Math.min` дают ноль сами, и формат получает (0, 0, 0). Ветка была, и
  // мутация её пережила — потому что ничего не меняла.
  const range = total == null || pageSize == null
    ? null
    : fmt(Math.min((page - 1) * pageSize + 1, total), Math.min(page * pageSize, total), total)

  return (
    <nav
      className={[
        'ds-pager',
        bar && 'ds-pager--bar',
        // Компактный вид — это то, во что приходит `pages`, и только он:
        // `variant="arrows"` просили явно, и узкий контейнер эту просьбу не
        // переписывает (DS-149). Без модификатора правила порога красили
        // бы и ряд из двух стрелок, разгоняя их по краям пустого ряда.
        variant === 'pages' && 'ds-pager--pages',
        className,
      ].filter(Boolean).join(' ')}
      id={id}
      aria-label={t['pagination.nav']}
    >
      {bar && (
        // Ячейка рисуется и пустой: сетка «слева / центр / справа» держится на
        // трёх колонках, и без пустой левой метка диапазона перестала бы быть
        // по центру, как только потребитель уберёт селектор.
        <div className="ds-pager__size">
          {showSize && <>
          <span className="ds-pager__sizelabel" id={labelId}>{pageSizeLabel ?? t['pagination.pageSizeLabel']}</span>
          <select
            className="ds-pager__select"
            aria-labelledby={labelId}
            value={pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          </>}
        </div>
      )}

      {bar && <span className="ds-pager__range">{range}</span>}

      <div className="ds-pager__nav">
        <button
          type="button"
          className="ds-pager__btn"
          disabled={page <= 1}
          aria-label={variant === 'arrows' ? t['pagination.prev'] : undefined}
          onClick={() => onChange?.(page - 1)}
        >{stepLabel(variant, 'prev', t['pagination.prev'])}</button>

        {variant === 'pages' && renderWindow(pageWindow(page, pageCount), page, onChange)}

        {/*
          Указатель позиции. Рисуется всегда, показывается только в компактном
          виде: ширину контейнера знает `@container`, а не React, и ветка
          «рисовать или нет» в JS отвечала бы на вопрос, ответа на который у неё
          нет. Спрятанный `<span>` в широкой полосе ничего не занимает —
          `display: none`.
        */}
        {variant === 'pages'
          && <span className="ds-pager__pos">{t['pagination.position'](page, pageCount)}</span>}

        <button
          type="button"
          className="ds-pager__btn"
          disabled={page >= pageCount}
          aria-label={variant === 'arrows' ? t['pagination.next'] : undefined}
          onClick={() => onChange?.(page + 1)}
        >{stepLabel(variant, 'next', t['pagination.next'])}</button>
      </div>
    </nav>
  )
}
