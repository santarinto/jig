import { defineFixture } from '../../internal/fixture.js'
import { Badge, type BadgeTone } from './Badge.js'

const TONES: BadgeTone[] = ['neutral', 'accent', 'success', 'warning', 'error', 'info']

/**
 * Цвета «из базы потребителя» — курируемая палитра тегов трекера плюс два
 * значения, на которых ломается наивный способ (сырой хекс в `background` и в
 * `color`): почти белый теряет подложку, почти чёрный теряет метку на тёмной
 * теме. Оба обязаны читаться, иначе пример ничего не утверждает.
 */
const FROM_DB: { color: string; label: string }[] = [
  { color: '#d97706', label: 'срочно' },
  { color: '#4f46e5', label: 'релиз' },
  { color: '#16a34a', label: 'оплачено' },
  { color: '#c026d3', label: 'дизайн' },
  { color: '#0891b2', label: 'инфра' },
  { color: '#f5f5f4', label: 'почти белый' },
  { color: '#111827', label: 'почти чёрный' },
]

interface Props {
  tone: BadgeTone
  dot: boolean
  text: string
  brand: string
}

export default defineFixture<Props>({
  name: 'Badge',
  group: 'Отображение',
  // Чем Badge годится БЫТЬ начинкой чужого слота: строчный элемент.
  // В фазе 4 он поедет в позицию `cell` у DataTable.
  kind: 'inline',

  props: { tone: 'neutral', dot: false, text: 'Проведено', brand: '' },

  controls: {
    tone: { kind: 'enum', values: TONES, prop: true },
    dot: { kind: 'bool', prop: true },
    text: { kind: 'text', prop: 'children' },
    // Крутилка текстовая, а не перечисление: предмет — ПРОИЗВОЛЬНЫЙ хекс.
    // Список значений проверял бы курируемый набор, то есть не тот случай.
    brand: { kind: 'text', prop: true },
  },

  data: {
    // Длинное слово без пробелов: у строчного элемента перенос — не украшение,
    // а вопрос, вылезет ли он из ячейки таблицы, когда станет её начинкой.
    'long-text': { text: 'Ожидаетподтвержденияотдиспетчерапаркавтечениесуток' },
    empty: { text: '' },
  },

  cases: [
    { id: 'base', title: 'Обычный', note: 'Нейтральный тон, без точки.' },
    {
      id: 'tones',
      title: 'Все тона',
      note: 'Шесть тонов рядом: цвет кодирует категорию, а не величину.',
      render: (p) => (
        <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {TONES.map((t) => (
            <Badge key={t} tone={t} dot={p.dot}>
              {t}
            </Badge>
          ))}
        </span>
      ),
    },
    { id: 'dot', title: 'С точкой', props: { dot: true, tone: 'success' } },
    {
      id: 'brand',
      title: 'Цвет из данных',
      note: 'Свободный хекс из базы потребителя. Метка и подложка выведены из него'
        + ' компонентом — переключите тему: читаются обе, включая почти белый и почти чёрный.',
      render: () => (
        <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {FROM_DB.map((t) => (
            <Badge key={t.color} brand={t.color}>
              {t.label}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      id: 'brand-token',
      title: 'Цвет из токена',
      note: 'Ссылка на категориальный токен системы — восемь бейджей рядом. Переключите'
        + ' тему: цвет каждого едет вместе с ней, в отличие от хекса выше.',
      render: () => (
        <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <Badge key={n} brand={`var(--ds-chart-${n})`}>
              {`chart-${n}`}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      id: 'brand-vs-tone',
      title: 'Тег рядом со статусом',
      note: 'Проверка громкости: тег с цветом из данных не должен звучать сильнее штатного тона. Последний — мусор из базы (хекс без решётки): у него вид штатного neutral, а не сломанного.',
      render: () => (
        <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Badge tone="success">проведён</Badge>
          <Badge tone="error">отменён</Badge>
          <Badge brand="#c026d3">дизайн</Badge>
          <Badge brand="#0891b2">инфра</Badge>
          <Badge brand="c026d3">без решётки</Badge>
        </span>
      ),
    },
  ],

  // Развилка, а не оба пропа разом: они взаимоисключающие по типу, и передать
  // их вместе — ошибка компиляции. Заодно это чинит мёртвую крутилку: раньше
  // `tone` ехал всегда, поэтому набранный в поле хекс не красил ничего, пока
  // не переключишь ещё и перечисление.
  render: (p) => (
    p.brand
      ? <Badge dot={p.dot} brand={p.brand}>{p.text}</Badge>
      : <Badge dot={p.dot} tone={p.tone}>{p.text}</Badge>
  ),
})
