import { defineFixture } from '../../internal/fixture.js'
import { Skeleton, type SkeletonAnim } from './Skeleton.js'

const ANIMS: SkeletonAnim[] = ['sweep', 'pulse', 'retro']

interface Props {
  variant: 'text' | 'rect' | 'circle'
  anim: SkeletonAnim
  lines: number
  width: string
  height: string
}

export default defineFixture<Props>({
  name: 'Skeleton',
  group: 'Отображение',
  kind: 'block',

  props: { variant: 'text', anim: 'sweep', lines: 3, width: '', height: '' },

  controls: {
    variant: { kind: 'enum', values: ['text', 'rect', 'circle'], prop: true },
    anim: { kind: 'enum', values: ANIMS, prop: true },
    lines: { kind: 'number', min: 1, max: 12, prop: true },
    width: { kind: 'text', prop: true },
    height: { kind: 'text', prop: true },
  },

  data: {
    // Одна строка: последняя строка рисуется короче, и при lines=1 «последняя»
    // — она же. Заглушка из одной короткой строки выглядит обрезанной, и это
    // тот случай, который надо УВИДЕТЬ, а не вывести из кода.
    'one-line': { lines: 1 },
    many: { lines: 12 },
    avatar: { variant: 'circle', width: '40', height: '40' },
    thumb: { variant: 'rect', width: '160', height: '96' },
  },

  cases: [
    { id: 'base', title: 'Три строки', note: 'Текстовая заглушка; последняя строка короче.' },
    {
      id: 'anims',
      title: 'Три анимации',
      note: 'sweep, pulse, retro рядом. Порознь каждая выглядит уместной — вопрос'
        + ' в том, какая не мешает читать соседний живой текст, а это видно только'
        + ' когда они идут в ряд и глаз выбирает, за какой следить.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {ANIMS.map((a) => (
            <div key={a}>
              <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>{a}</div>
              <Skeleton anim={a} lines={p.lines} />
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'card',
      title: 'Заглушка карточки',
      note: 'Ради этого случая компонент и существует: заглушка изображает БУДУЩЕЕ'
        + ' содержимое. Сравните высоту с настоящей карточкой рядом — прыжок при'
        + ' подмене и есть та беда, которую заглушка обязана предотвратить.',
      render: (p) => (
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          <div style={{
            inlineSize: '18rem', padding: '0.75rem',
            border: '1px solid var(--ds-border)', borderRadius: '6px',
            display: 'flex', gap: '0.75rem',
          }}>
            <Skeleton variant="circle" width={40} height={40} anim={p.anim} />
            <div style={{ flex: 1 }}>
              <Skeleton variant="text" lines={1} width="60%" anim={p.anim} />
              <Skeleton variant="text" lines={2} anim={p.anim} />
            </div>
          </div>
          <div style={{
            inlineSize: '18rem', padding: '0.75rem',
            border: '1px solid var(--ds-border)', borderRadius: '6px',
            display: 'flex', gap: '0.75rem',
          }}>
            <div style={{
              inlineSize: '40px', blockSize: '40px', borderRadius: '50%',
              background: 'var(--ds-surface-subtle)',
            }} />
            <div style={{ flex: 1 }}>
              <strong>Иванов И. И.</strong>
              <p style={{ margin: 0 }}>Смена закрыта в 20:14, принято 47 заказов за день.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'shapes',
      title: 'Три формы',
      note: 'text, rect, circle. Форма выбирается по тому, что будет НА ЭТОМ месте,'
        + ' а не по вкусу: круг на месте будущего прямоугольника обещает аватар и'
        + ' обманывает дважды — при показе и при подмене.',
      render: (p) => (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Skeleton variant="circle" width={40} height={40} anim={p.anim} />
          <Skeleton variant="rect" width={160} height={96} anim={p.anim} />
          <div style={{ inlineSize: '12rem' }}>
            <Skeleton variant="text" lines={3} anim={p.anim} />
          </div>
        </div>
      ),
    },
    {
      id: 'announced',
      title: 'Заглушка говорит «загрузка»',
      note: 'У заглушки `role="status"`, `aria-busy` и имя «Загрузка». Без этого'
        + ' слепой пользователь получает пустое место без объяснения — и не может'
        + ' отличить «грузится» от «ничего нет». Вкладка axe это видит, глаз нет.',
    },
  ],

  render: (p) => (
    <Skeleton
      variant={p.variant}
      anim={p.anim}
      lines={p.lines}
      width={p.width ? (Number(p.width) || p.width) : undefined}
      height={p.height ? (Number(p.height) || p.height) : undefined}
    />
  ),
})
