import { describe, it, expect } from 'vitest'
import { flatten, filteredFlatten, leafIds, locate, isAncestor, checkStateOf } from './model.js'
import type { TreeNode } from './Tree.js'

/**
 * Табличные кейсы модели дерева, по образцу `internal/rowModel.test.ts`.
 *
 * Ради них вынос и делался: `checkStateOf` и `isAncestor` до него проверялись
 * только через рендер, клики и DnD, и глубину три так никто не покрывал
 * (DS-111).
 */

/** Четыре уровня: узел `a` держит ветку `b`, та — `c`, та — два листа. */
const deep: TreeNode[] = [
  {
    id: 'a',
    label: 'Автопарк',
    children: [
      {
        id: 'b',
        label: 'Смена',
        children: [
          {
            id: 'c',
            label: 'Машины',
            children: [
              { id: 'd1', label: 'Курьер 101' },
              { id: 'd2', label: 'Курьер 102' },
            ],
          },
          { id: 'c2', label: 'Водители' },
        ],
      },
    ],
  },
  { id: 'z', label: 'Чужая ветка', children: [{ id: 'z1', label: 'Лист' }] },
]

describe('model: flatten', () => {
  it('свёрнутое дерево — только корни, уровень 1', () => {
    const flat = flatten(deep, new Set())
    expect(flat.map((f) => f.node.id)).toEqual(['a', 'z'])
    expect(flat.map((f) => f.level)).toEqual([1, 1])
    expect(flat[0]!.hasChildren).toBe(true)
    expect(flat[0]!.expanded).toBe(false)
  })

  it('уровень растёт с глубиной, а parentId называет родителя', () => {
    const flat = flatten(deep, new Set(['a', 'b', 'c']))
    expect(flat.map((f) => [f.node.id, f.level, f.parentId])).toEqual([
      ['a', 1, null],
      ['b', 2, 'a'],
      ['c', 3, 'b'],
      ['d1', 4, 'c'],
      ['d2', 4, 'c'],
      ['c2', 3, 'b'],
      ['z', 1, null],
    ])
  })

  it('схлопывание ветки убирает ВСЁ поддерево, а не один уровень', () => {
    // Раскрыто `a` и `c`, но не `b`: `c` внутри свёрнутого `b` не показывается,
    // хотя сам числится раскрытым.
    const flat = flatten(deep, new Set(['a', 'c']))
    expect(flat.map((f) => f.node.id)).toEqual(['a', 'b', 'z'])
  })

  it('раскрытым считается только узел С ДЕТЬМИ', () => {
    // Лист в `expanded` — законная ситуация: пользователь раскрыл ветку, потом
    // данные приехали без детей. Признак `expanded` обязан быть false, иначе
    // строка получит шеврон вниз и `aria-expanded` при пустом поддереве.
    const flat = flatten([{ id: 'leaf', label: 'Лист' }], new Set(['leaf']))
    expect(flat[0]!.expanded).toBe(false)
    expect(flat[0]!.hasChildren).toBe(false)
  })
})

describe('model: filteredFlatten', () => {
  it('родитель показан ради совпавшего потомка, и ветка авто-раскрыта', () => {
    const flat = filteredFlatten(deep, 'курьер 101')
    expect(flat.map((f) => f.node.id)).toEqual(['a', 'b', 'c', 'd1'])
    // Все предки совпавшего раскрыты, сам лист — нет.
    expect(flat.map((f) => f.expanded)).toEqual([true, true, true, false])
  })

  it('не совпавшая ветка выпадает целиком', () => {
    const flat = filteredFlatten(deep, 'чужая')
    expect(flat.map((f) => f.node.id)).toEqual(['z'])
  })

  it('совпавший узел приводит с собой всё поддерево, а не только путь вниз', () => {
    // Совпадение на `Машины`: сам узел показан, но его листья — нет, они не
    // совпали. Это и есть разница с «показать поддерево совпавшего».
    const flat = filteredFlatten(deep, 'машины')
    expect(flat.map((f) => f.node.id)).toEqual(['a', 'b', 'c'])
  })

  it('фильтр смотрит в filterText, когда label — не строка', () => {
    const nodes = [{ id: 'n', label: { type: 'span' } as unknown as TreeNode['label'], filterText: 'Иванов' }]
    expect(filteredFlatten(nodes, 'иван').map((f) => f.node.id)).toEqual(['n'])
    expect(filteredFlatten(nodes, 'петров')).toEqual([])
  })

  it('нестроковый label без filterText не совпадает ни с чем', () => {
    // Сосед с известным значением: без него кейс выше зеленел бы и при
    // фильтре, который совпадает со всем подряд.
    const nodes = [{ id: 'n', label: { type: 'span' } as unknown as TreeNode['label'] }]
    expect(filteredFlatten(nodes, 'иван')).toEqual([])
  })
})

describe('model: isAncestor — запрет бросить узел внутрь своего потомка', () => {
  const cases: Array<[string, string, string, boolean]> = [
    ['сам себе предок (так объявлено: «или им самим»)', 'b', 'b', true],
    ['прямой ребёнок', 'b', 'c', true],
    ['внук', 'b', 'd1', true],
    ['правнук через два уровня', 'a', 'd2', true],
    ['ребёнок — не предок родителя', 'c', 'b', false],
    ['чужая ветка', 'z', 'c', false],
    ['несуществующий предок', 'нет-такого', 'c', false],
    ['несуществующий узел', 'a', 'нет-такого', false],
  ]
  for (const [name, ancestor, node, want] of cases) {
    it(name, () => {
      expect(isAncestor(deep, ancestor, node)).toBe(want)
    })
  }
})

describe('model: checkStateOf', () => {
  const branch = deep[0]!

  it('ни одного отмеченного листа — false', () => {
    expect(checkStateOf(branch, new Set())).toBe(false)
  })

  it('часть листьев — mixed, и это ТРЕТЬЕ значение, а не true', () => {
    // Через рендер этот случай проверялся только на глубине один: тут ветка
    // `a` считает листья на глубине четыре, минуя два промежуточных уровня.
    expect(checkStateOf(branch, new Set(['d1']))).toBe('mixed')
    expect(checkStateOf(branch, new Set(['d1', 'd2']))).toBe('mixed')
    expect(checkStateOf(branch, new Set(['c2']))).toBe('mixed')
  })

  it('все листья поддерева — true', () => {
    expect(checkStateOf(branch, new Set(['d1', 'd2', 'c2']))).toBe(true)
  })

  it('отметки чужой ветки на состояние не влияют', () => {
    expect(checkStateOf(branch, new Set(['z1']))).toBe(false)
  })

  it('лист сам себе лист', () => {
    expect(checkStateOf({ id: 'l', label: 'Лист' }, new Set(['l']))).toBe(true)
    expect(checkStateOf({ id: 'l', label: 'Лист' }, new Set())).toBe(false)
  })

  it('ветка с пустым массивом children считается листом', () => {
    // `children: []` приходит от бэкенда, который «ветку знает, детей не
    // прислал». Признак ветки — НЕПУСТОЙ массив, иначе состояние считалось бы
    // по нулю листьев и всегда давало false.
    expect(leafIds({ id: 'e', label: 'Пусто', children: [] })).toEqual(['e'])
    expect(checkStateOf({ id: 'e', label: 'Пусто', children: [] }, new Set(['e']))).toBe(true)
  })
})

describe('model: locate', () => {
  it('находит соседей, индекс и родителя на глубине', () => {
    const loc = locate(deep, 'c2')
    expect(loc?.parent?.id).toBe('b')
    expect(loc?.index).toBe(1)
    expect(loc?.siblings.map((n) => n.id)).toEqual(['c', 'c2'])
  })

  it('у корневого узла родителя нет, а соседи — корни', () => {
    const loc = locate(deep, 'z')
    expect(loc?.parent).toBeNull()
    expect(loc?.index).toBe(1)
  })

  it('несуществующий узел — null, а не пустая раскладка', () => {
    expect(locate(deep, 'нет-такого')).toBeNull()
  })
})
