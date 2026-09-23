/**
 * Кнопка — самая частая начинка чужих позиций, поэтому `kind: 'inline'`.
 *
 * Случаи выбраны по тому, что в кнопке НЕЛЬЗЯ увидеть поодиночке. Два таких
 * места, оба записаны в AGENTS.md как решения, а не как мелочи:
 *
 *  1. `tone: 'error'` значим только у прозрачных вариантов (`ghost`,
 *     `secondary`); на сплошных цвет несёт заливка, и тон не действует вовсе.
 *     Кнопка с тоном сама по себе выглядит правильной в обоих случаях — врёт
 *     она только рядом с той, где тон не сработал.
 *  2. Размер меняет высоту И кегль вместе: `--ds-h-compact`/`--ds-h-default`/
 *     `--ds-h-comfortable` — 28/32/36 (шаг 4), `--ds-fs-sm`/`--ds-fs-base`/
 *     `--ds-fs-lg` — 12/14/16 (шаг 2). Шаг кегля следует шагу высоты — это
 *     решение (CHANGELOG, ~1.26.0), а не то, что вышло само: ровный шаг кегля
 *     важнее того, какое имя ступени шкалы ему досталось. Одна кнопка `lg`
 *     этого не показывает — она просто «большая», ступень видна только рядом
 *     с соседними размерами.
 */
import { defineFixture } from '../../internal/fixture.js'
import { Button, type ButtonSize, type ButtonVariant } from './Button.js'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'success']
const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

/** Иконка для `iconOnly`. Своя, а не из системы: фикстура не проверяет иконки. */
const PLUS = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const row = { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' } as const

interface Props {
  variant: ButtonVariant
  size: ButtonSize
  label: string
  disabled: boolean
  loading: boolean
  iconOnly: boolean
}

export default defineFixture<Props>({
  name: 'Button',
  group: 'Управление',
  kind: 'inline',

  props: {
    variant: 'primary',
    size: 'md',
    label: 'Провести',
    disabled: false,
    loading: false,
    iconOnly: false,
  },

  controls: {
    variant: { kind: 'enum', values: VARIANTS, prop: true },
    size: { kind: 'enum', values: SIZES, prop: true },
    label: { kind: 'text', prop: 'children' },
    disabled: { kind: 'bool', prop: true },
    loading: { kind: 'bool', prop: true },
    iconOnly: { kind: 'bool', prop: true },
  },

  data: {
    // Длинная подпись: у кнопки нет ширины, она растёт по содержимому — и в
    // чужой позиции это её главный способ сломать раскладку хозяина.
    long: { label: 'Провести и закрыть месяц по всем паркам' },
    // Пустая подпись при `iconOnly` — законное состояние; при обычной кнопке
    // это дыра, в которую нечего нажимать.
    empty: { label: '' },
  },

  cases: [
    { id: 'base', title: 'Обычная', note: 'Основное действие формы.' },
    {
      id: 'variants',
      title: 'Все варианты',
      note:
        'Пять вариантов рядом: вариант кодирует РОЛЬ действия, не важность. ' +
        '`success` запускает действие («Старт»), а не сообщает об успехе — ' +
        'сообщение об успехе это Alert.',
      render: (p) => (
        <span style={row}>
          {VARIANTS.map((v) => (
            <Button key={v} variant={v} size={p.size} disabled={p.disabled}>
              {v}
            </Button>
          ))}
        </span>
      ),
    },
    {
      id: 'tone',
      title: 'Тон error — и где он молчит',
      note:
        'Слева ghost с tone="error": разрушающее действие в ряду прочих, текст ' +
        'красный, заливки нет. Справа primary с ТЕМ ЖЕ тоном — он не действует, ' +
        'потому что на сплошных вариантах цвет несёт заливка. Порознь обе ' +
        'кнопки выглядят правильными; врёт только пара. Сплошная красная — это ' +
        'variant="danger", третья в ряду, и она не то же самое, что тон.',
      render: (p) => (
        <span style={row}>
          <Button variant="ghost" tone="error" size={p.size}>
            Удалить
          </Button>
          <Button variant="primary" tone="error" size={p.size}>
            Удалить
          </Button>
          <Button variant="danger" size={p.size}>
            Удалить
          </Button>
        </span>
      ),
    },
    {
      id: 'sizes',
      title: 'Размеры — растут высота и кегль, шаг в шаг',
      note:
        'sm/md/lg в одном ряду. Высота идёт по --ds-h-compact/default/comfortable ' +
        '(28/32/36, шаг 4), кегль — по --ds-fs-sm/base/lg (12/14/16, шаг 2). ' +
        'Шаг кегля следует шагу высоты — решение, а не совпадение. Одна кнопка lg ' +
        'этого не покажет — она просто «большая», ступень видна только рядом с ' +
        'соседними размерами.',
      render: (p) => (
        <span style={row}>
          {SIZES.map((s) => (
            <Button key={s} variant={p.variant} size={s}>
              {s.toUpperCase()}
            </Button>
          ))}
        </span>
      ),
    },
    {
      id: 'iconOnly',
      title: 'Только иконка',
      note:
        'iconOnly делает ширину равной высоте. Рядом — обычная кнопка того же ' +
        'размера: без неё квадрат не с чем сравнить, а именно равенство сторон ' +
        'здесь и утверждается.',
      render: (p) => (
        <span style={row}>
          <Button variant={p.variant} size={p.size} iconOnly aria-label="Добавить">
            {PLUS}
          </Button>
          <Button variant={p.variant} size={p.size}>
            Добавить
          </Button>
        </span>
      ),
    },
    {
      id: 'iconSlots',
      title: 'icon / iconEnd',
      note:
        'Именованные слоты по краям подписи (DS-360), не безымянный ' +
        'child: слева icon, справа iconEnd. Оба декоративны — смысл несёт ' +
        'подпись, как у остальных значков системы.',
      render: (p) => (
        <span style={row}>
          <Button variant={p.variant} size={p.size} icon={PLUS}>
            Добавить
          </Button>
          <Button variant={p.variant} size={p.size} iconEnd={PLUS}>
            Ещё
          </Button>
        </span>
      ),
    },
    {
      id: 'loading',
      title: 'Загрузка',
      props: { loading: true },
      note: 'loading тянет за собой disabled и aria-busy: нажать нельзя, и диктор это скажет.',
    },
    {
      id: 'link',
      title: 'Кнопка-ссылка',
      note:
        'as="a" рендерит <a class="ds-btn"> — навигация без гидрации. Выглядит ' +
        'кнопкой, а является ссылкой, и различие это не косметическое: у <a> нет ' +
        'нативного disabled, поэтому справа выключенная ссылка получает ' +
        'aria-disabled, tabIndex=-1 и pointer-events: none. Прицел и вкладка ' +
        'таб-стопов покажут разницу, которой не видно глазом.',
      render: (p) => (
        <span style={row}>
          <Button as="a" href="#/" variant={p.variant} size={p.size}>
            Обновить
          </Button>
          <Button as="a" href="#/" variant={p.variant} size={p.size} disabled>
            Обновить
          </Button>
        </span>
      ),
    },
  ],

  render: (p) =>
    p.iconOnly ? (
      <Button
        variant={p.variant}
        size={p.size}
        iconOnly
        disabled={p.disabled}
        loading={p.loading}
        aria-label={p.label || 'Действие'}
      >
        {PLUS}
      </Button>
    ) : (
      <Button variant={p.variant} size={p.size} disabled={p.disabled} loading={p.loading}>
        {p.label}
      </Button>
    ),
})
