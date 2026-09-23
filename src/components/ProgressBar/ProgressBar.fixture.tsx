/**
 * Полоса выполнения. `kind: 'inline'` — её кладут в ячейку («Доля долга»,
 * «Заполнено»), и именно там у неё вылезает главная пара состояний.
 *
 * Пара эта — «ноль» против «неизвестно». Полоса на нуле и полоса
 * indeterminate в статичном кадре обе выглядят пустыми, а означают
 * противоположное: в первом случае работа не началась, во втором она идёт, но
 * сколько её осталось — неизвестно. Порознь их не различить, поэтому случай
 * ставит обе рядом.
 *
 * Второе, что видно только парой: `label` и `ariaLabel` — не два способа
 * назвать одно и то же. Видимая подпись сильнее: при заданном `label`
 * `ariaLabel` игнорируется, потому что два имени на одном узле означают, что
 * скринридер прочитает какое-то одно, и какое — решает он, а не мы.
 */
import { defineFixture } from '../../internal/fixture.js'
import { ProgressBar, type ProgressTone } from './ProgressBar.js'

const TONES: ProgressTone[] = ['accent', 'success', 'warning', 'error']
const SIZES = ['sm', 'md'] as const

const col = { display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: '18rem' } as const

interface Props {
  value: number
  max: number
  label: string
  showValue: boolean
  tone: ProgressTone
  size: (typeof SIZES)[number]
  indeterminate: boolean
}

export default defineFixture<Props>({
  name: 'ProgressBar',
  group: 'Отображение',
  kind: 'inline',

  props: {
    value: 30,
    max: 60,
    label: 'Обработано документов',
    showValue: true,
    tone: 'accent',
    size: 'md',
    indeterminate: false,
  },

  controls: {
    value: { kind: 'number', min: -20, max: 120, step: 5, prop: true },
    max: { kind: 'number', min: 1, max: 200, step: 1, prop: true },
    label: { kind: 'text', prop: true },
    showValue: { kind: 'bool', prop: true },
    tone: { kind: 'enum', values: TONES, prop: true },
    size: { kind: 'enum', values: [...SIZES], prop: true },
    indeterminate: { kind: 'bool', prop: true },
  },

  data: {
    // Значение вне диапазона: зажимается в 0…max, а не рисуется за краем.
    over: { value: 150, max: 60 },
    under: { value: -20, max: 60 },
    full: { value: 60, max: 60 },
    // Подпись длиннее полосы — в ячейке это обычное дело.
    'long-label': { label: 'Доля погашенной задолженности по договору лизинга за период' },
  },

  cases: [
    { id: 'base', title: 'Половина', note: '30 из 60, значение показано справа от подписи.' },
    {
      id: 'zero-vs-unknown',
      title: 'Ноль против неизвестного',
      note:
        'Обе полосы пусты, и означают они разное: сверху работа не началась ' +
        '(0 из 60 — это ФАКТ), снизу работа идёт, но её объём неизвестен и ' +
        'полоса анимируется вместо заполнения. В статичном кадре различие ' +
        'держится только тем, что они стоят рядом; поодиночке «пусто» ' +
        'читается одинаково. Третья строка — контроль: началось и измеримо.',
      render: (p) => (
        <span style={col}>
          <ProgressBar label="Ноль: не начиналось" value={0} max={p.max} showValue tone={p.tone} />
          <ProgressBar label="Неизвестно: идёт, объём не знаем" indeterminate tone={p.tone} />
          <ProgressBar label="Измеримо: идёт" value={12} max={p.max} showValue tone={p.tone} />
        </span>
      ),
    },
    {
      id: 'clamp',
      title: 'Значение вне диапазона',
      note:
        'Сверху 150 из 60, снизу −20 из 60, между ними — честные 60 из 60. ' +
        'Значение зажимается в диапазон, а не рисуется за краем полосы: ' +
        'заполнение сверх ста процентов выглядело бы как испорченная вёрстка, ' +
        'а не как испорченные данные. Пара с «ровно max» нужна, чтобы отличить ' +
        'зажатое от законно полного — порознь обе полосы просто полные.',
      render: (p) => (
        <span style={col}>
          <ProgressBar label="150 из 60" value={150} max={60} showValue tone={p.tone} />
          <ProgressBar label="60 из 60" value={60} max={60} showValue tone={p.tone} />
          <ProgressBar label="−20 из 60" value={-20} max={60} showValue tone={p.tone} />
        </span>
      ),
    },
    {
      id: 'tones',
      title: 'Тона',
      note:
        'Четыре тона при ОДНОМ значении: цвет здесь кодирует состояние ' +
        '(норма, успех, тревога, ошибка), а величину несёт длина полосы. Если ' +
        'бы цвет менялся вместе с процентом, это был бы цвет-величина — в ' +
        'системе так нельзя.',
      render: (p) => (
        <span style={col}>
          {TONES.map((t) => (
            <ProgressBar key={t} label={t} value={p.value} max={p.max} showValue tone={t} />
          ))}
        </span>
      ),
    },
    {
      id: 'naming',
      title: 'Подпись видимая и невидимая',
      note:
        'Сверху полоса с видимой подписью, снизу — без неё, но с ariaLabel: в ' +
        'ячейке «Доля долга» видимая подпись дублировала бы заголовок колонки, ' +
        'а безымянная полоса оставила бы диктора без имени вовсе. Глазами ' +
        'различие есть, на слух — нет; обратное тоже бывает, поэтому вкладка ' +
        'axe и прицел здесь говорят больше, чем кадр.',
      render: (p) => (
        <span style={col}>
          <ProgressBar label="Доля долга" value={p.value} max={p.max} showValue tone={p.tone} />
          <ProgressBar ariaLabel="Доля долга" value={p.value} max={p.max} tone={p.tone} />
        </span>
      ),
    },
    {
      id: 'sizes',
      title: 'Размеры',
      note: 'sm и md при одном значении: меняется толщина полосы, положение заполнения — нет.',
      render: (p) => (
        <span style={col}>
          {SIZES.map((s) => (
            <ProgressBar key={s} label={s} value={p.value} max={p.max} size={s} tone={p.tone} />
          ))}
        </span>
      ),
    },
  ],

  render: (p) => (
    <ProgressBar
      value={p.value}
      max={p.max}
      label={p.label}
      showValue={p.showValue}
      tone={p.tone}
      size={p.size}
      indeterminate={p.indeterminate}
    />
  ),
})
