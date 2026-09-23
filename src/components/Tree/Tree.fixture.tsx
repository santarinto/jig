/**
 * Дерево. `kind: 'block'`.
 *
 * Главный случай — «ширина колонки числом»: он про дефект, который дважды
 * чинили в системе и оба раза находили не в коде, а в примере (DS-82 в
 * `DataTable`, DS-83 здесь). Высота строки дерева задана как
 * `calc(1.75rem * var(--ds-ui-scale))` — она едет с масштабом ВСЕГДА, а голая
 * строка `'90px'` не едет. Под `.ds-scale` строки вырастали, колонки стояли: в
 * ту же ширину влезало меньше текста при большей высоте строки.
 *
 * Увидеть это можно только сравнением ДВУХ колонок при масштабе ≠ 1 — одна
 * колонка любой ширины выглядит нормальной. Поэтому случай ставит рядом
 * колонку числом и колонку строкой и просит крутить масштаб кадра.
 *
 * Второе, что живёт только парой: `width: 0` против отсутствия ширины. Признак
 * — ЗАДАННОСТЬ, а не истинность: нулевая колонка-нитка под маркер законна, и
 * схлопывание её с `auto` было бы молчаливой потерей раскладки.
 */
import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Tree, type TreeColumn, type TreeNode } from './Tree.js'

const NODES: TreeNode[] = [
  {
    id: 'park',
    label: 'Парк «Северный»',
    cells: { cars: '48', sum: '1 240 000,00' },
    children: [
      {
        id: 'shift-day',
        label: 'Дневная смена',
        cells: { cars: '26', sum: '680 000,00' },
        children: [
          { id: 'd1', label: 'Иванов И. И.', cells: { cars: '1', sum: '12 400,00' } },
          { id: 'd2', label: 'Петров П. П.', cells: { cars: '1', sum: '8 150,50' } },
        ],
      },
      {
        id: 'shift-night',
        label: 'Ночная смена',
        cells: { cars: '22', sum: '560 000,00' },
        children: [
          { id: 'n1', label: 'Сидоров С. С.', cells: { cars: '1', sum: '21 990,00' } },
          { id: 'n2', label: 'Кузнецов К. К.', cells: { cars: '1', sum: '0,00' }, disabled: true },
        ],
      },
    ],
  },
  {
    id: 'park-2',
    label: 'Парк «Южный»',
    cells: { cars: '12', sum: '310 000,00' },
    children: [{ id: 's1', label: 'Смешанная смена', cells: { cars: '12', sum: '310 000,00' } }],
  },
]

const DEEP: TreeNode[] = [
  {
    id: 'l1',
    label: 'Уровень 1',
    children: [
      {
        id: 'l2',
        label: 'Уровень 2',
        children: [
          {
            id: 'l3',
            label: 'Уровень 3',
            children: [
              {
                id: 'l4',
                label: 'Уровень 4 — очень длинная подпись, которая не влезает в отведённую ширину',
                children: [{ id: 'l5', label: 'Уровень 5' }],
              },
            ],
          },
        ],
      },
    ],
  },
]

/** Колонки числовой ширины — форма, которую копируют. */
const COLS: TreeColumn[] = [
  { id: 'cars', header: 'Машин', width: 72, align: 'end' },
  { id: 'sum', header: 'Сумма', width: 144, align: 'end' },
]

/** Пара «число против строки» — предмет случая про масштаб. */
const COLS_MIXED: TreeColumn[] = [
  { id: 'cars', header: 'Числом 72', width: 72, align: 'end' },
  { id: 'sum', header: 'Строкой 144px', width: '144px', align: 'end' },
]

/** Нитка под маркер: `width: 0` — заданная ширина, а не её отсутствие. */
const COLS_ZERO: TreeColumn[] = [
  { id: 'mark', header: '', width: 0 },
  { id: 'cars', header: 'Машин', width: 72, align: 'end' },
  { id: 'sum', header: 'Сумма', align: 'end' },
]

/** Дерево управляемо по раскрытию: иначе не показать ни фильтр, ни выбор. */
function Live({
  nodes,
  columns,
  checkable,
  filter,
}: {
  nodes: TreeNode[]
  columns?: TreeColumn[]
  checkable?: boolean
  filter?: string
}) {
  const [sel, setSel] = useState<string | undefined>(undefined)
  const [checked, setChecked] = useState<string[]>([])
  return (
    <Tree
      aria-label="Структура парка"
      nodes={nodes}
      defaultExpandedIds={['park', 'shift-day', 'l1', 'l2', 'l3', 'l4']}
      selectedId={sel}
      onSelect={setSel}
      checkable={checkable}
      selectedIds={checkable ? checked : undefined}
      onSelectionChange={checkable ? setChecked : undefined}
      filter={filter}
      columns={columns}
      treeColumnHeader={columns ? 'Подразделение' : undefined}
    />
  )
}

interface Props {
  nodes: TreeNode[]
  withColumns: boolean
  checkable: boolean
  filter: string
}

export default defineFixture<Props>({
  name: 'Tree',
  group: 'Данные',
  kind: 'block',

  props: { nodes: NODES, withColumns: false, checkable: false, filter: '' },

  controls: {
    withColumns: { kind: 'bool', prop: false },
    checkable: { kind: 'bool', prop: true },
    filter: { kind: 'text', prop: true },
  },

  data: {
    deep: { nodes: DEEP },
    empty: { nodes: [] },
    // Один узел без детей: шеврона нет, отступ обязан остаться тем же, иначе
    // подписи листьев и веток разъедутся по левому краю.
    leaf: { nodes: [{ id: 'only', label: 'Единственный узел' }] },
  },

  cases: [
    { id: 'base', title: 'Дерево', note: 'Две ветки, раскрыта первая.' },
    {
      id: 'scale',
      title: 'Ширина числом против строки',
      note:
        'Слева колонка задана числом (72), справа — строкой («144px»). При ' +
        'масштабе 1 они ведут себя одинаково, и это ровно та причина, по ' +
        'которой дефект дважды доживал до потребителя. Поставьте масштаб кадра ' +
        '1.25: высота строки поедет ВСЕГДА (calc с --ds-ui-scale), числовая ' +
        'колонка поедет вместе с ней, а строковая останется прежней — в ту же ' +
        'ширину влезет меньше текста при большей высоте строки. Одна колонка ' +
        'этого не показывает: она просто «такая».',
      props: { withColumns: true },
      render: (p) => <Live nodes={p.nodes} columns={COLS_MIXED} />,
    },
    {
      id: 'zero-width',
      title: 'Ноль — это ширина, а не её отсутствие',
      note:
        'Первая колонка объявлена с width: 0 — нитка под маркер. Она обязана ' +
        'получить НУЛЕВОЙ трек, а не auto: признак раскладки — заданность ' +
        'ширины, а не её истинность. Схлопни их (c.width || auto) — и колонка ' +
        'молча растянется по содержимому, унося ширины соседей. Рядом стоит ' +
        'колонка вообще без width: у неё трек auto, и это законно.',
      props: { withColumns: true },
      render: (p) => <Live nodes={p.nodes} columns={COLS_ZERO} />,
    },
    {
      id: 'align',
      title: 'Выравнивание логическое',
      note:
        'Числовые колонки прижаты align: "end" — к концу СТРОКИ, а не к правому ' +
        'краю монитора. Физического словаря (left/right) в системе больше нет ' +
        'с 3.0.0: text-align понимает логические значения нативно, и в RTL ' +
        'физическое слово означало бы не то.',
      props: { withColumns: true },
      render: (p) => <Live nodes={p.nodes} columns={COLS} />,
    },
    {
      id: 'checkable',
      title: 'Чекбоксы и третье состояние',
      note:
        'Отмечаются ЛИСТЬЯ, состояние ветки вычисляется: отметьте одного ' +
        'водителя в дневной смене — смена уйдёт в неопределённое состояние, а ' +
        'не в отмеченное. Неопределённость здесь не украшение: она отличает ' +
        '«часть выбрана» от «не выбрано», и порознь эти два состояния выглядят ' +
        'одинаково пустыми.',
      props: { checkable: true },
      render: (p) => <Live nodes={p.nodes} checkable />,
    },
    {
      id: 'filter',
      title: 'Фильтр',
      note:
        'Показываются подходящие узлы И все их предки, подходящие ветки ' +
        'авто-раскрыты. Предки обязательны: без них найденный лист повис бы в ' +
        'воздухе, и было бы не видно, к какому парку он относится.',
      props: { filter: 'Петров' },
      render: (p) => <Live nodes={p.nodes} filter="Петров" />,
    },
    {
      id: 'deep',
      title: 'Глубина и длинная подпись',
      note:
        'Пять уровней: отступ растёт, а подпись, не влезающая в ширину, ' +
        'сокращается — не переносится. Это то место, где дерево ломает ' +
        'раскладку хозяина, если ему не задать ширину.',
      props: { nodes: DEEP },
    },
  ],

  render: (p) => (
    <Live
      nodes={p.nodes}
      columns={p.withColumns ? COLS : undefined}
      checkable={p.checkable}
      filter={p.filter || undefined}
    />
  ),
})
