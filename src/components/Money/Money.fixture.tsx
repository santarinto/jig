/**
 * Сумма. `kind: 'inline'` — её место внутри чужой ячейки, и там она проверяет
 * то, чего не видно в отдельном кадре: как числовая колонка обходится с
 * содержимым, у которого есть знак, символ валюты и пробелы между разрядами.
 *
 * Главный случай — «три состояния»: значение, ноль и «нет данных». Их различие
 * в системе выражено ТЕКСТОМ, а не оттенком: ноль это факт (остаток нулевой), а
 * прочерк — отсутствие сведений (выписка не снята). Порознь ноль и прочерк
 * выглядят одинаково «пусто», и ровно на этом их и путают.
 */
import { defineFixture } from '../../internal/fixture.js'
import { Money, type Currency } from './Money.js'

const CURRENCIES: Currency[] = ['RUB', 'EUR', 'KZT', 'PLN', 'USD']
const TONES = ['default', 'muted', 'positive', 'negative'] as const
const SIZES = ['sm', 'md', 'lg'] as const

const col = { display: 'flex', flexDirection: 'column', gap: '0.25rem' } as const
const row = { display: 'flex', gap: '1rem', alignItems: 'baseline', flexWrap: 'wrap' } as const

interface Props {
  value: string | null
  currency: Currency
  size: (typeof SIZES)[number]
  tone: (typeof TONES)[number]
  signed: boolean
  estimated: boolean
}

export default defineFixture<Props>({
  name: 'Money',
  group: 'Данные',
  kind: 'inline',

  props: {
    value: '12400.00',
    currency: 'RUB',
    size: 'md',
    tone: 'default',
    signed: false,
    estimated: false,
  },

  controls: {
    value: { kind: 'text', prop: true },
    currency: { kind: 'enum', values: CURRENCIES, prop: true },
    size: { kind: 'enum', values: [...SIZES], prop: true },
    tone: { kind: 'enum', values: [...TONES], prop: true },
    signed: { kind: 'bool', prop: true },
    estimated: { kind: 'bool', prop: true },
  },

  data: {
    // Величина, на которой ломается float64: копейки обязаны дожить до экрана
    // ровно потому, что форматирование строковое и `parseFloat` по дороге нет.
    huge: { value: '6900000000000.01' },
    negative: { value: '-1234.56' },
    zero: { value: '0.00' },
    unknown: { value: null },
  },

  cases: [
    { id: 'base', title: 'Сумма', note: 'Разряды разделены пробелом, символ валюты после числа.' },
    {
      id: 'three-states',
      title: 'Значение, ноль, нет данных',
      note:
        'Три состояния в одном кадре, потому что различаются они ТЕКСТОМ, а не ' +
        'оттенком. Ноль не приглушён: нулевой остаток — факт, а не отсутствие ' +
        'сведений. Прочерк идёт без символа валюты — валюта неизвестной суммы ' +
        'ничего не сообщает. Порознь ноль и прочерк оба читаются как «пусто», и ' +
        'именно поэтому случай парный.',
      render: (p) => (
        <span style={row}>
          <span style={col}>
            <Money value="12400.00" currency={p.currency} size={p.size} />
            <small>значение</small>
          </span>
          <span style={col}>
            <Money value="0.00" currency={p.currency} size={p.size} />
            <small>ноль</small>
          </span>
          <span style={col}>
            <Money value={null} currency={p.currency} size={p.size} />
            <small>нет данных</small>
          </span>
        </span>
      ),
    },
    {
      id: 'sign',
      title: 'Знак и цвет',
      note:
        'Минус у отрицательной стоит всегда, плюс у положительной — только по ' +
        'signed. У НУЛЯ знака нет ни при каком signed: «+0» означало бы прирост, ' +
        'которого не было. Цвет здесь кодирует знак, то есть состояние, а не ' +
        'величину: −1 234,56 и −999 999,99 одного тона.',
      props: { signed: true },
      render: (p) => (
        <span style={row}>
          <Money value="1234.56" currency={p.currency} signed tone="positive" size={p.size} />
          <Money value="-1234.56" currency={p.currency} signed tone="negative" size={p.size} />
          <Money value="-999999.99" currency={p.currency} signed tone="negative" size={p.size} />
          <Money value="0.00" currency={p.currency} signed size={p.size} />
        </span>
      ),
    },
    {
      id: 'estimated',
      title: 'Оценочная величина',
      note:
        'Звёздочка видимая, а не title: посчитано по графику, а не взято из ' +
        'договора. Рядом — та же сумма без пометки, иначе звёздочку не с чем ' +
        'сравнить и она читается как часть числа.',
      render: (p) => (
        <span style={row}>
          <Money value="88300.00" currency={p.currency} estimated size={p.size} />
          <Money value="88300.00" currency={p.currency} size={p.size} />
        </span>
      ),
    },
    {
      id: 'unknown-hint',
      title: 'Причина прочерка',
      note:
        'Причина неизвестности — видимым текстом, потому что title недостижим и ' +
        'с клавиатуры, и со скринридера. Место такому пояснению — карточка, а не ' +
        'узкая колонка: в колонке с обрезкой оно превратится в обрезанное ' +
        'объяснение, а это хуже отсутствующего — выглядит объяснением.',
      render: (p) => (
        <Money
          value={null}
          currency={p.currency}
          size={p.size}
          unknownHint="Остаток из выписки не снят"
        />
      ),
    },
    {
      id: 'secondary',
      title: 'Вторая валюта',
      note:
        'Три исхода второй строки рядом: пересчёт с датой курса, названная ' +
        'недоступность и её отсутствие вовсе. Средний случай — тот, ради ' +
        'которого форма union: «курс недоступен» это сведение, а пустая вторая ' +
        'строка — молчание, и путать их нельзя.',
      render: (p) => (
        <span style={row}>
          <Money
            value="12400.00"
            currency="RUB"
            size={p.size}
            secondary={{ value: '128.40', currency: 'EUR', rateDate: '24.08.2026' }}
          />
          <Money
            value="12400.00"
            currency="RUB"
            size={p.size}
            secondary={{ unavailable: 'Курс на дату недоступен' }}
          />
          <Money value="12400.00" currency="RUB" size={p.size} />
        </span>
      ),
    },
    {
      id: 'sizes',
      title: 'Размеры',
      note: 'sm/md/lg по одной базовой линии: меняется кегль, выравнивание разрядов — нет.',
      render: (p) => (
        <span style={row}>
          {SIZES.map((s) => (
            <Money key={s} value="1234567.89" currency={p.currency} size={s} />
          ))}
        </span>
      ),
    },
  ],

  render: (p) => (
    <Money
      value={p.value}
      currency={p.currency}
      size={p.size}
      tone={p.tone}
      signed={p.signed}
      estimated={p.estimated}
    />
  ),
})
