import { describe, it, expect } from 'vitest'
import { flattenTree, groupByValue, type RowTreeNode } from './rowModel.js'

interface Item { id: string; name: string }
const id = (r: Item) => r.id

const tree: RowTreeNode<Item>[] = [
  {
    row: { id: 'g1', name: 'Папка' },
    children: [
      { row: { id: 'a', name: 'Элемент А' } },
      { row: { id: 'b', name: 'Элемент Б' } },
    ],
  },
  { row: { id: 'c', name: 'Элемент В' } },
]

describe('flattenTree', () => {
  it('свёрнутый узел не отдаёт детей, но помечен как имеющий их', () => {
    const out = flattenTree(tree, id, [])
    expect(out.map((r) => r.id)).toEqual(['g1', 'c'])
    expect(out[0]).toMatchObject({ kind: 'data', depth: 0, hasChildren: true, expanded: false })
    expect(out[1]).toMatchObject({ hasChildren: false, expanded: false })
  })

  it('раскрытый узел отдаёт детей с глубиной на единицу больше', () => {
    const out = flattenTree(tree, id, ['g1'])
    expect(out.map((r) => r.id)).toEqual(['g1', 'a', 'b', 'c'])
    expect(out[1]).toMatchObject({ depth: 1, hasChildren: false, expanded: false })
  })

  it('раскрытие вложенного узла работает только вместе с родителем', () => {
    const deep: RowTreeNode<Item>[] = [{
      row: { id: 'g1', name: 'Папка' },
      children: [{ row: { id: 'g2', name: 'Подпапка' }, children: [{ row: { id: 'x', name: 'Лист' } }] }],
    }]
    expect(flattenTree(deep, id, ['g2']).map((r) => r.id)).toEqual(['g1'])
    expect(flattenTree(deep, id, ['g1', 'g2']).map((r) => r.id)).toEqual(['g1', 'g2', 'x'])
  })

  it('пустой массив детей не делает узел раскрываемым', () => {
    const out = flattenTree([{ row: { id: 'a', name: 'А' }, children: [] }], id, [])
    expect(out[0]).toMatchObject({ hasChildren: false })
  })

  it('раскрытие сопоставляется по id глобально: одинаковый id в разных ветках раскрывается вместе', () => {
    // Это следствие контракта (getRowId обязан быть уникальным по всему дереву),
    // а не проверка бага: фиксируем, что при нарушении контракта случится именно так.
    const dup: RowTreeNode<Item>[] = [
      { row: { id: 'dup', name: 'Ветка 1' }, children: [{ row: { id: 'a', name: 'А' } }] },
      { row: { id: 'dup', name: 'Ветка 2' }, children: [{ row: { id: 'b', name: 'Б' } }] },
    ]
    const out = flattenTree(dup, id, ['dup'])
    expect(out.map((r) => r.id)).toEqual(['dup', 'a', 'dup', 'b'])
  })
})

interface Doc { id: string; store: string; sum: number }
const docId = (r: Doc) => r.id
const docs: Doc[] = [
  { id: '1', store: 'Основной', sum: 100 },
  { id: '2', store: 'Резервный', sum: 200 },
  { id: '3', store: 'Основной', sum: 300 },
]

describe('groupByValue', () => {
  it('свёрнутые группы отдают только заголовки со счётчиком', () => {
    const out = groupByValue(docs, docId, 'store', [])
    expect(out.map((r) => r.id)).toEqual(['group:Основной', 'group:Резервный'])
    expect(out[0]).toMatchObject({ kind: 'group', depth: 0, count: 2, expanded: false, label: 'Основной' })
    expect(out[1]).toMatchObject({ count: 1 })
  })

  it('раскрытая группа отдаёт свои строки с глубиной 1', () => {
    const out = groupByValue(docs, docId, 'store', ['group:Основной'])
    expect(out.map((r) => r.id)).toEqual(['group:Основной', '1', '3', 'group:Резервный'])
    expect(out[1]).toMatchObject({ kind: 'data', depth: 1, hasChildren: false })
  })

  it('порядок групп — по первому появлению, а не по алфавиту', () => {
    const out = groupByValue([docs[1]!, docs[0]!], docId, 'store', [])
    expect(out.map((r) => r.id)).toEqual(['group:Резервный', 'group:Основной'])
  })

  it('formatLabel получает значение и строки группы', () => {
    const out = groupByValue(docs, docId, 'store', [], (value, rows) =>
      `${String(value)} (${rows.reduce((s, r) => s + r.sum, 0)})`)
    expect(out[0]).toMatchObject({ label: 'Основной (400)' })
  })

  it('пустой входной массив даёт пустую выдачу', () => {
    expect(groupByValue([], docId, 'store', [])).toEqual([])
  })

  it('null и undefined в колонке группировки образуют свои группы, строки не теряются', () => {
    interface Nullable { id: string; category: string | null | undefined }
    const rows: Nullable[] = [
      { id: 'a', category: null },
      { id: 'b', category: undefined },
    ]
    const out = groupByValue(rows, (r) => r.id, 'category', ['group:null', 'group:undefined'])
    expect(out.map((r) => r.id)).toEqual(['group:null', 'a', 'group:undefined', 'b'])
    expect(out[0]).toMatchObject({ label: 'null', count: 1 })
    expect(out[2]).toMatchObject({ label: 'undefined', count: 1 })
  })

  it('значения разных типов с одинаковым строковым представлением схлопываются в одну группу', () => {
    // Это следствие контракта (ключ группы — String(value), значения колонки
    // должны быть одного типа), а не проверка бага: фиксируем, что при
    // нарушении контракта число 1 и строка '1' окажутся одной группой.
    interface Mixed { id: string; category: string | number }
    const rows: Mixed[] = [
      { id: 'a', category: 1 },
      { id: 'b', category: '1' },
    ]
    const out = groupByValue(rows, (r) => r.id, 'category', [])
    expect(out.map((r) => r.id)).toEqual(['group:1'])
    expect(out[0]).toMatchObject({ count: 2 })
  })

  it('summarize наполняет cells группы значениями по колонкам', () => {
    const rows = [
      { id: '1', day: 'пн', sum: 10 },
      { id: '2', day: 'пн', sum: 5 },
    ]
    const out = groupByValue(rows, (r) => r.id, 'day', ['group:пн'], undefined, {
      summarize: (rs) => ({ sum: rs.reduce((a, r) => a + r.sum, 0) }),
    })
    const group = out[0]
    expect(group.kind).toBe('group')
    if (group.kind === 'group') expect(group.cells).toEqual({ sum: 15 })
  })

  it('aside получает значение и строки группы', () => {
    const rows = [{ id: '1', day: 'пн', sum: 10 }]
    const out = groupByValue(rows, (r) => r.id, 'day', [], undefined, {
      aside: (value, rs) => `${String(value)}: ${rs.length}`,
    })
    const group = out[0]
    if (group.kind === 'group') expect(group.aside).toBe('пн: 1')
  })

  it('без options группа не несёт ни cells, ни aside — прежнее поведение', () => {
    const rows = [{ id: '1', day: 'пн', sum: 10 }]
    const out = groupByValue(rows, (r) => r.id, 'day', [])
    const group = out[0]
    if (group.kind === 'group') {
      expect(group.cells).toBeUndefined()
      expect(group.aside).toBeUndefined()
    }
  })
})
