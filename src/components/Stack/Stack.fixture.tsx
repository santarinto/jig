import { defineFixture } from '../../internal/fixture.js'
import { Stack, type StackAlign, type StackGap, type StackJustify } from './Stack.js'

const ALIGNS: StackAlign[] = ['start', 'center', 'end', 'stretch', 'baseline']
const JUSTIFIES: StackJustify[] = ['start', 'center', 'end', 'between', 'around', 'evenly']

const box = (h: string, label: string, k = label) => (
  <div
    key={k}
    style={{
      blockSize: h,
      paddingInline: '0.5rem',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--ds-surface-subtle)',
      border: '1px solid var(--ds-border)',
      borderRadius: '4px',
      fontSize: 'var(--ds-fs-sm)',
    }}
  >
    {label}
  </div>
)

/** Пунктирный контейнер: без него не видно, ГДЕ дети стоят относительно места. */
const FRAME: React.CSSProperties = {
  outline: '1px dashed var(--ds-border)',
  minBlockSize: '4.5rem',
}

interface Props {
  direction: 'row' | 'column'
  gap: number
  align: StackAlign | ''
  justify: StackJustify | ''
  wrap: boolean
  inline: boolean
}

export default defineFixture<Props>({
  name: 'Stack',
  group: 'Раскладка',
  kind: 'block',

  props: { direction: 'row', gap: 3, align: '', justify: '', wrap: false, inline: false },

  controls: {
    direction: { kind: 'enum', values: ['row', 'column'], prop: true },
    // Шаг шкалы `--ds-space-N`, восемь ступеней плюс ноль. Числом, а не
    // перечислением: у шкалы есть ПОРЯДОК, и стрелками по нему ходят.
    gap: { kind: 'number', min: 0, max: 8, prop: true },
    align: { kind: 'enum', values: ['', ...ALIGNS], prop: true },
    justify: { kind: 'enum', values: ['', ...JUSTIFIES], prop: true },
    wrap: { kind: 'bool', prop: true },
    inline: { kind: 'bool', prop: true },
  },

  data: {
    // Перенос: восемь детей в узком месте. Без переноса они сжимаются и текст
    // в них ломается — это и есть выбор, который делает проп.
    wrap: { wrap: true, gap: 2 },
    column: { direction: 'column', gap: 2 },
    tight: { gap: 0 },
  },

  cases: [
    {
      id: 'base',
      title: 'Ряд',
      note: 'Три ребёнка в строку с промежутком третьей ступени шкалы.',
    },
    {
      id: 'gaps',
      title: 'Вся шкала промежутков',
      note: 'Девять ступеней подряд. Ступени задуманы РАЗЛИЧИМЫМИ: если соседние'
        + ' не отличаются глазом, шкала врёт про то, что она шкала — и выбор между'
        + ' 4 и 5 становится подбрасыванием монеты.',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {([0, 1, 2, 3, 4, 5, 6, 7, 8] as StackGap[]).map((g) => (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <code style={{ inlineSize: '1.5rem', textAlign: 'right' }}>{g}</code>
              <Stack direction="row" gap={g}>
                {/* Подписи пустые намеренно: предмет случая — промежуток, а не
                    содержимое. Ключи поэтому задаются явно — три пустые подписи
                    дали бы три одинаковых ключа. */}
                {['a', 'b', 'c'].map((k) => box('1.5rem', '', k))}
              </Stack>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'align',
      title: 'Выравнивание по поперечной оси',
      note: 'Дети РАЗНОЙ высоты — иначе выравнивание не проверить вовсе: на детях'
        + ' одной высоты все пять значений выглядят одинаково, и проверка была бы'
        + ' зелёной при любом из них.',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {ALIGNS.map((a) => (
            <div key={a}>
              <code style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>{a}</code>
              <div style={FRAME}>
                <Stack direction="row" gap={2} align={a}>
                  {box('1.25rem', 'низкий')}
                  {box('2.5rem', 'средний')}
                  {box('3.5rem', 'высокий')}
                </Stack>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'justify',
      title: 'Распределение вдоль оси',
      note: 'Шесть значений в контейнере ФИКСИРОВАННОЙ ширины. По содержимому'
        + ' контейнер сжался бы под детей, и between/around/evenly дали бы одну'
        + ' и ту же картинку — три разных значения выглядели бы работающими.',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {JUSTIFIES.map((j) => (
            <div key={j}>
              <code style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>{j}</code>
              <div style={{ ...FRAME, inlineSize: 'min(22rem, 100%)', minBlockSize: 0 }}>
                <Stack direction="row" gap={2} justify={j}>
                  {box('1.5rem', 'раз')}
                  {box('1.5rem', 'два')}
                  {box('1.5rem', 'три')}
                </Stack>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'wrap',
      title: 'Перенос',
      props: { wrap: true, gap: 2 },
      note: 'Восемь детей в узкой колонке. Без переноса они сжимаются, и подписи'
        + ' в них ломаются по буквам — это видно только тогда, когда места мало.'
        + ' Утяните ширину кадра до 360.',
      render: (p) => (
        <Stack direction="row" gap={2} wrap={p.wrap}>
          {['подача', 'в пути', 'ожидание', 'завершён', 'отменён', 'оплачен', 'спор', 'архив']
            .map((t) => box('1.5rem', t))}
        </Stack>
      ),
    },
    {
      id: 'inline',
      title: 'В строке текста',
      props: { inline: true },
      note: '`inline-flex` вместо `flex`: стопка встаёт В СТРОКУ, а не отдельным'
        + ' блоком. Проверять надо базовую линию — сдвинутая стопка внутри текста'
        + ' выглядит как опечатка вёрстки.'
        + ' ГРАНИЦА, найденная этой фикстурой: `inline` НЕ делает стопку строчной'
        + ' по разметке — она остаётся `<div>`, а `<div>` внутри `<p>` невалиден'
        + ' и роняет гидратацию. Поэтому текст здесь лежит в `<div>`, а не в'
        + ' абзаце. Пропу это не противоречит: он про `display`, а не про тег, —'
        + ' но обещание «встаёт в строку текста» держится только там, где абзац'
        + ' набран не тегом `<p>`.',
      render: () => (
        <div style={{ margin: 0, maxInlineSize: '34rem' }}>
          Заказ 4412-08 сейчас{' '}
          <Stack direction="row" gap={1} inline align="baseline">
            {box('1.25rem', 'в пути')}
            {box('1.25rem', '12 мин')}
          </Stack>{' '}
          и будет закрыт диспетчером после подтверждения оплаты.
        </div>
      ),
    },
  ],

  render: (p) => (
    <div style={FRAME}>
      <Stack
        direction={p.direction}
        gap={p.gap as StackGap}
        align={p.align || undefined}
        justify={p.justify || undefined}
        wrap={p.wrap}
        inline={p.inline}
      >
        {box('1.25rem', 'низкий')}
        {box('2.5rem', 'средний')}
        {box('3.5rem', 'высокий')}
      </Stack>
    </div>
  ),
})
