import { AsOf } from '../AsOf/AsOf.js'
import { EstimateMark } from '../EstimateMark/EstimateMark.js'
import { useDsText } from '../../dictionary/DsText.js'
import './Money.css'

export type Currency = 'RUB' | 'EUR' | 'KZT' | 'PLN' | 'USD'

const SYMBOL: Record<Currency, string> = {
  RUB: '₽', EUR: '€', KZT: '₸', PLN: 'zł', USD: '$',
}

/**
 * Рублёвый (или иной) эквивалент — три исхода, а не один:
 * - `{ value, currency, rateDate? }` — эквивалент есть;
 * - `{ unavailable }` — эквивалента нет по названной причине.
 * «Ничего» выражается отсутствием пропа `secondary` вовсе.
 */
export type MoneySecondary =
  | { value: string; currency: Currency; rateDate?: string }
  | { unavailable: string }

export interface MoneyProps {
  /**
   * Сумма **строкой** из БД (NUMERIC), напр. `"6900000.00"`, `"-1234.56"`.
   * `null` или `''` → прочерк «данных нет». Тип строковый намеренно: `number`
   * молча портит копейки на больших суммах, и это не поймается тестом с
   * мелкими числами. Форматирование тоже строковое, без `parseFloat`.
   */
  value: string | null
  currency: Currency
  size?: 'sm' | 'md' | 'lg'
  /** Явный знак: `+` у положительных (у отрицательных `−` всегда). */
  signed?: boolean
  /** Цвет по знаку — состояние, а не величина (закон системы). */
  tone?: 'default' | 'muted' | 'positive' | 'negative'
  /** Оценочная величина (посчитана по графику, не из договора): видимая звёздочка. */
  estimated?: boolean
  /**
   * Чем помечена звёздочка — уходит в дерево доступности текстом (`EstimateMark`).
   * Default «оценочная величина».
   */
  estimatedHint?: string
  /**
   * Причина прочерка — показывается **видимым текстом**, а не в `title`: с
   * клавиатуры и со скринридера `title` недостижим, а причина неизвестности
   * («остаток из выписки не снят») — это сведение, а не украшение.
   *
   * **Место ему — карточка и подробный вид, а не узкая числовая колонка.** Он
   * длинный по назначению: короткая формулировка не объяснила бы, чем «нет
   * данных» отличается от нуля, ради чего проп и заведён. В колонке с
   * фиксированной шириной и обрезкой многоточием он не поместится, и обрезанное
   * объяснение хуже отсутствующего — оно выглядит объяснением. В таблице
   * прочерк стоит один, а причина уходит в подпись под таблицей или в раскрытие
   * строки.
   */
  unknownHint?: string
  secondary?: MoneySecondary
  className?: string
  id?: string
}

/**
 * Ноль строкой, без `parseFloat`: «0», «0.00», «-0.00», «000.0» — всё это ноль.
 * Проверка строковая по той же причине, по какой строковый сам `value`: числа
 * тут заводить незачем, а `Number('0.00') === 0` тянуло бы float на ровном месте.
 */
function isZeroString(value: string): boolean {
  const digits = value.trim().replace(/^[+-]/, '').replace(/\./g, '')
  return digits.length > 0 && /^0+$/.test(digits)
}

/** Форматирование строковое, без float: разряды неразрывным пробелом, копейки запятой. */
function formatMoney(value: string, currency: Currency, signed?: boolean): string {
  const t = value.trim()
  // У нуля знака нет — ни «+», ни «−». «+0,00 ₽» читается как приход нулевого
  // размера, «−0,00 ₽» как расход: оба сообщают направление, которого в нуле не
  // содержится. Отменённая комиссия в ленте — обычная строка, а не угол.
  const zero = isZeroString(t)
  const neg = !zero && t.startsWith('-')
  const digits = t.replace(/^[+-]/, '')
  const [intRaw, decRaw = ''] = digits.split('.')
  const dec = (decRaw + '00').slice(0, 2)
  const grouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const sign = neg ? '−' : signed && !zero ? '+' : ''
  return `${sign}${grouped},${dec} ${SYMBOL[currency]}`
}

function Secondary({ data }: { data: MoneySecondary }) {
  const t = useDsText()
  if ('unavailable' in data) {
    return <span className="ds-money__sec-none">{data.unavailable}</span>
  }
  return (
    <>
      ≈ {formatMoney(data.value, data.currency)}
      {data.rateDate && <> · <AsOf date={data.rateDate} label={t['money.rateAt']} /></>}
    </>
  )
}

/**
 * Сумма как компонент: одно правило вместо инлайновых свойств (моношрифт,
 * `tabular-nums`, `nowrap`, цвет по знаку), разъезжавшихся между страницами.
 *
 * Три состояния, и они различимы **текстом**: значение, ноль и «данных нет».
 * Прочерк не притворяется нулём и рисуется **без знака валюты** — «— ₽» читалось
 * бы как сумма, а величины нет.
 *
 * Оформлением состояний ДВА, и это решение, а не недосмотр: приглушён прочерк,
 * а ноль набран как всякое другое число. Ноль — величина, а не её отсутствие;
 * приглушить его значило бы сказать «этому числу верь меньше», тогда как
 * нулевой остаток — такой же факт, как любой другой. Где ноль всё-таки шум
 * (отменённая комиссия в длинной ленте), это знает вызов, а не компонент, —
 * там и ставится `tone="muted"`.
 */
export function Money({
  value, currency, size = 'md', signed, tone = 'default',
  estimated, estimatedHint, unknownHint, secondary, className, id,
}: MoneyProps) {
  const empty = value == null || value.trim() === ''
  return (
    <span
      id={id}
      className={['ds-money', `ds-money--${size}`,
        empty ? 'ds-money--empty' : tone !== 'default' && `ds-money--${tone}`, className]
        .filter(Boolean).join(' ')}
    >
      {empty ? (
        <>
          <span className="ds-money__dash">—</span>
          {unknownHint && <span className="ds-money__hint">{unknownHint}</span>}
        </>
      ) : (
        <>
          <span className="ds-money__amount">{formatMoney(value!, currency, signed)}</span>
          {estimated && <EstimateMark hint={estimatedHint} />}
        </>
      )}
      {secondary && <span className="ds-money__secondary"><Secondary data={secondary} /></span>}
    </span>
  )
}
