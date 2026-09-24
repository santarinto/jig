import { describe, it, expect } from 'vitest'
import { gridPlan, GRID_LIMIT } from './grid-plan.js'

describe('gridPlan', () => {
  it('одна тема — по кадру на ширину, ничего не срезано', () => {
    const plan = gridPlan([440, 768, 1024, 1440], ['light'])
    expect(plan.cells.map((c) => c.w)).toEqual([440, 768, 1024, 1440])
    expect(plan.dropped).toBe(0)
  })

  it('две темы идут ПАРАМИ по ширине, а не блоками по теме', () => {
    // Порядок «сначала все светлые, потом все тёмные» разводит пару темы на
    // противоположные концы, и лимит отрезал бы у неё вторую половину,
    // оставив первую притворяться целой.
    const plan = gridPlan([440, 768], ['light', 'dark'])
    expect(plan.cells).toEqual([
      { w: 440, theme: 'light', slot: 0 },
      { w: 440, theme: 'dark', slot: 1 },
      { w: 768, theme: 'light', slot: 0 },
      { w: 768, theme: 'dark', slot: 1 },
    ])
  })

  it('лимит режет и НАЗЫВАЕТ число срезанного', () => {
    // Молчаливая обрезка читается как «показано всё».
    const plan = gridPlan([440, 768, 1024, 1440], ['light', 'dark'])
    expect(plan.cells).toHaveLength(GRID_LIMIT)
    expect(plan.dropped).toBe(2)
    // Срезана самая ШИРОКАЯ пара целиком, а не половинки разных пар.
    expect(plan.cells.filter((c) => c.w === 1440)).toEqual([])
    expect(plan.cells.filter((c) => c.w === 1024)).toHaveLength(2)
  })

  it('лимит по умолчанию — шесть, и это не совпадение', () => {
    expect(GRID_LIMIT).toBe(6)
  })

  it('пустой список ширин даёт пустую сетку, а не одну случайную', () => {
    expect(gridPlan([], ['light'])).toEqual({ cells: [], dropped: 0 })
  })
})

describe('место ячейки внутри ширины', () => {
  it('основная тема всегда на месте 0, какой бы она ни была', () => {
    // По месту, а не по теме, оболочка держит тождество документа: сменили
    // основную тему — место то же, документ тот же, тема доехала патчем.
    const light = gridPlan([440], ['light', 'dark'])
    const dark = gridPlan([440], ['dark', 'light'])
    expect(light.cells[0]).toEqual({ w: 440, theme: 'light', slot: 0 })
    expect(dark.cells[0]).toEqual({ w: 440, theme: 'dark', slot: 0 })
  })
})
