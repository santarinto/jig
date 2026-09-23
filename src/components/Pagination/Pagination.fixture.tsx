import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Pagination, type PaginationVariant } from './Pagination.js'

interface Props {
  page: number
  pageCount: number
  variant: PaginationVariant
  total: number
  pageSize: number
  withOptions: boolean
}

/**
 * Живая обёртка: пагинация без состояния — мёртвая картинка. Щёлкнуть по «3»
 * и остаться на первой странице читается как поломка компонента, хотя сломан
 * пример. Состояние держится ЗДЕСЬ, а не в компоненте: `page` управляемый, и
 * это его контракт.
 */
function Live({ page, ...rest }: { page: number } & Omit<Props, 'page' | 'withOptions'> & {
  pageSizeOptions?: number[]
}) {
  const [p, setP] = useState(page)
  const [size, setSize] = useState(rest.pageSize)
  return (
    <Pagination
      page={Math.min(p, rest.pageCount)}
      pageCount={rest.pageCount}
      onChange={setP}
      variant={rest.variant}
      total={rest.total || undefined}
      pageSize={size || undefined}
      pageSizeOptions={rest.pageSizeOptions}
      onPageSizeChange={rest.pageSizeOptions ? setSize : undefined}
    />
  )
}

export default defineFixture<Props>({
  name: 'Pagination',
  group: 'Навигация',
  kind: 'block',

  props: {
    page: 3,
    pageCount: 18,
    variant: 'pages',
    total: 347,
    pageSize: 20,
    withOptions: false,
  },

  controls: {
    page: { kind: 'number', min: 1, max: 200, prop: true },
    pageCount: { kind: 'number', min: 1, max: 200, prop: true },
    variant: { kind: 'enum', values: ['pages', 'arrows'], prop: true },
    total: { kind: 'number', min: 0, max: 100000, step: 1, prop: true },
    pageSize: { kind: 'number', min: 0, max: 500, prop: true },
    withOptions: { kind: 'bool', prop: false },
  },

  data: {
    // Одна страница: полоса номеров вырождается. Показать её всё равно надо —
    // исчезнувшая пагинация читается как «страниц много, но управление пропало».
    single: { pageCount: 1, page: 1, total: 12 },
    // Двести страниц: предмет — сворачивание середины в многоточие. Полоса
    // обязана остаться постоянной ширины, иначе она прыгает при каждом шаге.
    many: { pageCount: 200, page: 97, total: 4000 },
    // Края: на первой странице «назад» недоступно, на последней — «вперёд».
    first: { page: 1, pageCount: 18 },
    last: { page: 18, pageCount: 18 },
    // Метки диапазона нет: `total` без `pageSize` посчитать «1–20» не из чего.
    'no-range': { total: 0, pageSize: 0 },
  },

  cases: [
    { id: 'base', title: 'Обычная', note: 'Номера, стрелки и метка диапазона.' },
    {
      id: 'arrows',
      title: 'Только стрелки',
      props: { variant: 'arrows' },
      note: 'Подвал таблицы, где номера не нужны, а место нужно. Метка диапазона'
        + ' остаётся: без неё непонятно, где ты, — а это единственное, что стрелки'
        + ' и не показывают.',
    },
    {
      id: 'edges',
      title: 'Первая и последняя',
      note: 'Два края рядом. Недоступная стрелка обязана ОСТАВАТЬСЯ НА МЕСТЕ, а не'
        + ' исчезать: полоса, меняющая ширину на краях, дёргает подвал таблицы.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Pagination page={1} pageCount={p.pageCount} total={p.total} pageSize={p.pageSize} />
          <Pagination
            page={p.pageCount}
            pageCount={p.pageCount}
            total={p.total}
            pageSize={p.pageSize}
          />
        </div>
      ),
    },
    {
      id: 'many',
      title: 'Двести страниц',
      props: { pageCount: 200, page: 97, total: 4000 },
      note: 'Середина свёрнута. Проверять надо не многоточие, а ШИРИНУ: пройдите'
        + ' стрелкой несколько шагов — полоса не должна прыгать.',
    },
    {
      id: 'page-size',
      title: 'С выбором размера',
      props: { withOptions: true },
      note: 'Селектор размера страницы. Смена размера обязана пересчитать диапазон'
        + ' в метке, а не только число страниц — иначе метка врёт про то же, что'
        + ' описывает.',
    },
    {
      id: 'narrow',
      title: 'Узкая полоса',
      props: { withOptions: true, pageCount: 200, page: 97, total: 4000 },
      note: 'ВТОРОЙ порог, ниже порога складывания (31em содержимого, DS-149).'
        + ' Полоса решает САМА, по своей ширине: номера сняты, слово в стрелке'
        + ' уступило знаку, между знаками встал указатель «Стр. 97 из 200». Слово'
        + ' в нём с DS-283: без него указатель и метка диапазона — две строки'
        + ' одного вида «N из M» одна под другой, и величины разного рода (страницы'
        + ' и записи) читаются одним счётчиком. Проп этим не'
        + ' управляет и не должен — ширину контейнера потребитель в момент отрисовки'
        + ' не знает, а телефон это тот же экран, сжатый рукой. Тяните ширину рамки:'
        + ' выше 60em полоса в один ряд с номерами, между 60em и 31em — сложена и'
        + ' с номерами, ниже 31em — компактна. Три состояния, а не два. Порог'
        + ' складывания — 60em, а не 34em, с DS-282: он считает КОЛОНКУ ряда,'
        + ' а не ширину полосы, и зоны переноса между видами больше нет.',
      // Три ширины — три состояния, по одной на каждое. 320 — компакт (< 31em).
      // 420 — сложена с номерами: содержимое 404px = 31.08em, на пиксель ВЫШЕ
      // второго порога, намеренно у самой границы. 880 — обычный ряд: содержимое
      // 848px > 60em. До DS-282 третьей стояла 560 — при пороге 34em это был
      // обычный вид, при 60em (544px = 41.8em) стала сложенной, то есть дублем
      // второй: две из трёх рамок показывали одно состояние (приёмка 14.09.2026).
      // Ширина с ПОТОЛКОМ `maxWidth: '100%'` (DS-177): на кадре уже
      // рамки она сжимается вместе с кадром, а не уводит документ вбок. Подпись
      // `{w}px` называет замысел; три состояния видны на кадре шире 880.
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {[320, 420, 880].map((w) => (
            <div key={w}>
              <div style={{ color: 'var(--ds-text-muted)', fontSize: 'var(--ds-fs-sm)' }}>{w}px</div>
              <div style={{ width: w, maxWidth: '100%', border: '1px dashed var(--ds-border)' }}>
                <Pagination
                  page={p.page}
                  pageCount={p.pageCount}
                  total={p.total}
                  pageSize={p.pageSize}
                  pageSizeOptions={[10, 20, 50, 100]}
                />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'single',
      title: 'Одна страница',
      props: { pageCount: 1, page: 1, total: 12 },
      note: 'Вырожденный случай. Компонент не прячется: исчезнувшее управление'
        + ' читается как поломка, а не как «страница одна».',
    },
  ],

  render: (p) => (
    <Live
      page={p.page}
      pageCount={p.pageCount}
      variant={p.variant}
      total={p.total}
      pageSize={p.pageSize}
      pageSizeOptions={p.withOptions ? [10, 20, 50, 100] : undefined}
    />
  ),
})
