import { defineFixture } from '../../internal/fixture.js'
import { ThemeToggle } from './ThemeToggle.js'
import { Button } from '../Button/Button.js'

interface Props {
  label: string
}

export default defineFixture<Props>({
  name: 'ThemeToggle',
  group: 'Управление',
  kind: 'inline',

  props: { label: '' },

  controls: {
    label: { kind: 'text', prop: true },
  },

  data: {
    named: { label: 'Переключить оформление' },
    long: { label: 'Переключить между светлым и тёмным оформлением интерфейса' },
  },

  cases: [
    {
      id: 'base',
      title: 'Обычный',
      note: 'ВАЖНО: этот переключатель меняет тему НАСТОЯЩУЮ, через `useTheme` —'
        + ' а тему кадра задаёт тулбар верстака. Нажмите на него: подпись и значок'
        + ' сменятся вместе с темой кадра, и переключатель тулбара покажет то же'
        + ' самое. Это не конфликт, это один и тот же источник правды с двух сторон.',
    },
    {
      id: 'pressed',
      title: 'Состояние — не картинка',
      note: 'Кнопка несёт `aria-pressed`, и это её главный контракт: значок луны'
        + ' или солнца — украшение (`aria-hidden`), а нажатость живёт в атрибуте.'
        + ' Открой вкладку axe и слой таб-стопов: там видно то, чего не видно глазом.',
    },
    {
      id: 'in-bar',
      title: 'В шапке, рядом с соседями',
      note: 'Так его и ставят — последним в ряду. Проверка высоты и базовой линии:'
        + ' переключатель обязан совпасть по высоте с соседними кнопками, иначе'
        + ' ряд шапки идёт ступенькой.',
      render: (p) => (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--ds-border)',
            borderRadius: '4px',
          }}
        >
          <strong style={{ marginInlineEnd: 'auto' }}>Парк «Северный»</strong>
          <Button variant="secondary">Выгрузить</Button>
          <ThemeToggle label={p.label || undefined} />
        </div>
      ),
    },
    {
      id: 'custom-label',
      title: 'Своя подпись',
      props: { label: 'Переключить оформление' },
      note: 'Своя подпись отменяет автоматическую «Светлая/Тёмная тема» — и вместе'
        + ' с ней ПРОПАДАЕТ подсказка о том, куда переключаешь. Значок остаётся'
        + ' единственным каналом, а он декоративен и скринридеру не достаётся.',
    },
  ],

  render: (p) => <ThemeToggle label={p.label || undefined} />,
})
