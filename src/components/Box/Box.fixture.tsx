import { defineFixture } from '../../internal/fixture.js'
import { Fit, Center } from './Box.js'

/**
 * Раскладочный примитив НЕ ВИДЕН сам по себе, и это не отговорка, а условие
 * задачи: `Fit` и `Center` не рисуют ни пикселя, они меняют поведение ребёнка
 * внутри родителя. Поэтому каждый случай здесь несёт ВИДИМЫЙ КОНТЕЙНЕР
 * (пунктир) и сравнение «с примитивом против без него». Кадр с одним `Fit`
 * внутри был бы пустым прямоугольником, из которого ничего не следует.
 */
const BOX: React.CSSProperties = {
  outline: '1px dashed var(--ds-border)',
  blockSize: '9rem',
  inlineSize: '16rem',
}

const CHILD: React.CSSProperties = {
  background: 'var(--ds-surface-subtle)',
  border: '1px solid var(--ds-border)',
  borderRadius: '4px',
  display: 'grid',
  placeItems: 'center',
  padding: '0.5rem',
}

interface Props {
  which: 'fit' | 'center'
}

export default defineFixture<Props>({
  name: 'Box',
  group: 'Раскладка',
  kind: 'block',

  props: { which: 'center' },

  controls: {
    which: { kind: 'enum', values: ['fit', 'center'], prop: false },
  },

  data: {
    fit: { which: 'fit' },
    center: { which: 'center' },
  },

  cases: [
    {
      id: 'base',
      title: 'Центрирование',
      note: 'Пунктир — контейнер, серый прямоугольник — ребёнок. `Center` ставит'
        + ' его по обеим осям; без него он прижат к левому верхнему углу.',
    },
    {
      id: 'with-without',
      title: 'С примитивом и без',
      note: 'Единственный способ показать раскладочный примитив: рядом с тем же'
        + ' содержимым БЕЗ него. Слева — голый контейнер, справа — он же с обёрткой.'
        + ' Разница и есть весь компонент.',
      render: (p) => (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <figure style={{ margin: 0 }}>
            <figcaption style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>
              без обёртки
            </figcaption>
            <div style={BOX}>
              <div style={CHILD}>ребёнок</div>
            </div>
          </figure>
          <figure style={{ margin: 0 }}>
            <figcaption style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>
              {p.which === 'fit' ? 'Fit' : 'Center'}
            </figcaption>
            <div style={BOX}>
              {p.which === 'fit' ? (
                <Fit><div style={CHILD}>ребёнок</div></Fit>
              ) : (
                <Center><div style={CHILD}>ребёнок</div></Center>
              )}
            </div>
          </figure>
        </div>
      ),
    },
    {
      id: 'fit-vs-center',
      title: 'Fit против Center',
      note: 'Два примитива отвечают на РАЗНЫЕ вопросы. `Fit` — «займи всё место»'
        + ' (кадр, карта, холст). `Center` — «стой посередине» (заглушка, значок,'
        + ' сообщение о пустоте). Перепутать их легко, пока не видишь рядом.',
      render: () => (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <figure style={{ margin: 0 }}>
            <figcaption style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>Fit</figcaption>
            <div style={BOX}>
              <Fit><div style={CHILD}>растянут</div></Fit>
            </div>
          </figure>
          <figure style={{ margin: 0 }}>
            <figcaption style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>Center</figcaption>
            <div style={BOX}>
              <Center><div style={CHILD}>по центру</div></Center>
            </div>
          </figure>
        </div>
      ),
    },
    {
      id: 'empty-state',
      title: 'Где это применяют',
      note: 'Настоящий случай, а не демонстрация: «данных нет» посреди пустой'
        + ' карточки. Без `Center` сообщение висит в левом верхнем углу и читается'
        + ' как заголовок, которому не хватило содержимого.',
      render: () => (
        <div style={{ ...BOX, inlineSize: 'min(24rem, 100%)', blockSize: '12rem' }}>
          <Center>
            <div style={{ textAlign: 'center', color: 'var(--ds-text-muted)' }}>
              За выбранный период заказов нет
            </div>
          </Center>
        </div>
      ),
    },
  ],

  render: (p) => (
    <div style={BOX}>
      {p.which === 'fit' ? (
        <Fit><div style={CHILD}>ребёнок</div></Fit>
      ) : (
        <Center><div style={CHILD}>ребёнок</div></Center>
      )}
    </div>
  ),
})
