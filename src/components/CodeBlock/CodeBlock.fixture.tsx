import { defineFixture } from '../../internal/fixture.js'
import { CodeBlock } from './CodeBlock.js'

const CMD = "curl -sS -X POST https://api.park.example/api/v1/shifts/4412/close"
  + " -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9' -d '{\"odometer\":184203,\"cash\":12480}'"

const JSON_LONG = JSON.stringify(
  {
    shift: 4412,
    driver: { id: 'ivanov-i-i', name: 'Иванов И. И.', licence: '77 УВ 481203' },
    car: { plate: 'А123ВС77', model: 'Hyundai Solaris', odometer: 184203 },
    orders: Array.from({ length: 12 }, (_, i) => ({
      id: 4412_000 + i,
      from: 'Тверская, 12',
      to: 'Шереметьево, D',
      sum: 2480 + i * 37,
      status: i % 5 === 0 ? 'cancelled' : 'done',
    })),
  },
  null,
  2,
)

const PROMPT = 'Ты диспетчер парка. Отвечай коротко, числами, без вводных слов.'
  + ' Если данных не хватает — назови, каких именно, и не додумывай. Суммы всегда'
  + ' в рублях с копейками. Время — местное, в формате ЧЧ:ММ. Никогда не обещай'
  + ' клиенту сроков, которых нет в наряде.'

interface Props {
  source: 'cmd' | 'json' | 'prompt'
  copyable: boolean
  wrap: boolean
  maxHeight: number
  label: string
}

const codeOf = (s: Props['source']) => (s === 'json' ? JSON_LONG : s === 'prompt' ? PROMPT : CMD)

export default defineFixture<Props>({
  name: 'CodeBlock',
  group: 'Отображение',
  kind: 'block',

  props: { source: 'cmd', copyable: true, wrap: false, maxHeight: 0, label: '' },

  controls: {
    source: { kind: 'enum', values: ['cmd', 'json', 'prompt'], prop: false },
    copyable: { kind: 'bool', prop: true },
    wrap: { kind: 'bool', prop: true },
    // 0 — «лимита нет». Отдельного булева не заводим: два пропа на одно решение
    // расходятся, и «включён, но ноль» пришлось бы как-то толковать.
    maxHeight: { kind: 'number', min: 0, max: 600, step: 20, prop: true },
    label: { kind: 'text', prop: true },
  },

  data: {
    json: { source: 'json', maxHeight: 240 },
    prompt: { source: 'prompt', wrap: true },
    'no-copy': { copyable: false },
    empty: { source: 'cmd' },
  },

  cases: [
    {
      id: 'base',
      title: 'Команда',
      note: 'Длинная команда БЕЗ переноса: код читают как есть, и прокрутка'
        + ' сохраняет отступы. Проверьте, что горизонтальная полоса появляется'
        + ' внутри блока, а не у страницы.',
    },
    {
      id: 'copy',
      title: 'Кнопка копирования',
      note: 'Три состояния кнопки: покой, успех, отказ. Нажмите — подпись сменится'
        + ' и вернётся через две секунды. В буфер уходит проп `code`, а НЕ разметка:'
        + ' иначе номер строки или подсветка уехали бы в буфер вместе с кодом.',
    },
    {
      id: 'limited',
      title: 'Длинный JSON с лимитом',
      props: { source: 'json', maxHeight: 240 },
      note: 'Сотня строк не растягивает карточку, а прокручивается внутри.'
        + ' Вертикальная полоса приходит вместе с лимитом — без лимита блок'
        + ' вытягивается на всю длину и уводит кнопку копирования за экран.',
    },
    {
      id: 'wrap',
      title: 'Перенос вместо прокрутки',
      props: { source: 'prompt', wrap: true },
      note: 'Включают там, где содержимое НЕ код, а сплошной текст без собственных'
        + ' переносов — промт роли. Без переноса одна строка уезжает вправо, и'
        + ' `maxHeight` её не ловит: вертикальный лимит не помогает горизонтальной беде.',
    },
    {
      id: 'wrap-vs-scroll',
      title: 'Перенос против прокрутки',
      note: 'Один и тот же промт двумя способами. Выбор не про вкус: слева текст'
        + ' виден целиком, справа — первая строка и обещание, что остальное где-то есть.',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <CodeBlock code={PROMPT} wrap label="Промт, с переносом" />
          <CodeBlock code={PROMPT} label="Промт, без переноса" />
        </div>
      ),
    },
    {
      id: 'named',
      title: 'С доступным именем',
      props: { label: 'Команда закрытия смены' },
      note: 'Имя блока звучит для скринридера. Без него на странице с пятью блоками'
        + ' кода все пять называются одинаково — «блок кода», и кнопка копирования'
        + ' у каждого тоже.',
    },
  ],

  render: (p) => (
    <CodeBlock
      code={codeOf(p.source)}
      copyable={p.copyable}
      wrap={p.wrap}
      maxHeight={p.maxHeight || undefined}
      label={p.label || undefined}
    />
  ),
})
