import { defineFixture } from '../../internal/fixture.js'
import { Alert, type AlertTone } from './Alert.js'

const TONES: AlertTone[] = ['info', 'success', 'warning', 'error']

interface Props {
  tone: AlertTone
  title: string
  text: string
  closable: boolean
}

export default defineFixture<Props>({
  name: 'Alert',
  group: 'Отображение',
  // Блок: занимает всю ширину родителя и держит собственный отступ.
  kind: 'block',

  props: {
    tone: 'info',
    title: 'Рейс перенесён',
    text: 'Диспетчер сдвинул подачу на 15 минут. Водитель уведомлён.',
    closable: false,
  },

  controls: {
    tone: { kind: 'enum', values: TONES, prop: true },
    title: { kind: 'text', prop: true },
    text: { kind: 'text', prop: 'children' },
    closable: { kind: 'bool', prop: false },
  },

  data: {
    // Заголовка нет — сообщение из одной строки. Отдельный набор, потому что
    // это самый частый вид сообщения у потребителя, а не редкий случай.
    'no-title': { title: '' },
    // Длинный текст без заголовка: проверка, что значок не уезжает к середине
    // абзаца, а держится первой строки.
    long: {
      title: '',
      text: 'Загрузка выписки за июль прервана на 62%: банк ответил 503 и закрыл'
        + ' соединение. Уже загруженные строки сохранены, повтор продолжит с места'
        + ' обрыва. Если ошибка повторится трижды подряд, задача уйдёт в ручной разбор.',
    },
    empty: { title: '', text: '' },
  },

  slots: {
    body: {
      title: 'Тело сообщения',
      accepts: 'any',
      prop: 'children',
      note: 'Сюда кладут не только текст. Ссылка «повторить» или сумма — обычное дело,'
        + ' и они не должны спорить с тоном сообщения за громкость.',
    },
  },

  cases: [
    { id: 'base', title: 'Обычное', note: 'Информационный тон, заголовок и текст.' },
    {
      id: 'tones',
      title: 'Все тона',
      note: 'Четыре тона подряд. Цвет кодирует КАТЕГОРИЮ сообщения, а не его силу:'
        + ' «ошибка» громче «предупреждения» не цветом, а тем, что она про случившееся.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {TONES.map((t) => (
            <Alert key={t} tone={t} title={t}>
              {p.text}
            </Alert>
          ))}
        </div>
      ),
    },
    {
      id: 'closable',
      title: 'С крестиком',
      props: { closable: true, tone: 'warning' },
      note: 'Крестик — единственный таб-стоп сообщения. Он обязан быть достижим'
        + ' раньше содержимого тела, иначе закрыть длинное сообщение можно только'
        + ' протабав его целиком.',
    },
    {
      id: 'no-title',
      title: 'Без заголовка',
      props: { title: '' },
      note: 'Одна строка без заголовка — самый частый вид у потребителя. Значок'
        + ' держится первой строки, а не центрируется по высоте блока.',
    },
    {
      id: 'in-flow',
      title: 'В потоке страницы',
      note: 'Сообщение между абзацами: проверка вертикальных отступов. Стоящее в'
        + ' одиночку выглядит правильным почти всегда — беда видна только рядом с соседями.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0 }}>Смена закрыта в 20:14, принято 47 заказов.</p>
          <Alert tone={p.tone} title={p.title}>
            {p.text}
          </Alert>
          <p style={{ margin: 0 }}>Следующая смена начнётся в 08:00.</p>
        </div>
      ),
    },
  ],

  render: (p, slots) => (
    <Alert
      tone={p.tone}
      title={p.title || undefined}
      onClose={p.closable ? () => {} : undefined}
    >
      {slots.body ?? p.text}
    </Alert>
  ),
})
