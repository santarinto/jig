import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'Calendar.css'), 'utf8')
const rule = (sel: string) => {
  const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'))
  return m ? m[1] : null
}

/* Оба дефекта — чисто раскладочные, jsdom их не видит: он не считает геометрию.
   Поэтому фиксируем сами правила, из которых они следовали. */
describe('Calendar — раскладка дня', () => {
  it('отметка вынута из потока, иначе число с точкой встаёт выше соседей', () => {
    const mark = rule('.ds-cal__mark')
    expect(mark, '.ds-cal__mark отсутствует').not.toBeNull()
    expect(mark, 'точка должна быть position: absolute, иначе она поднимает число и растит строку')
      .toMatch(/position:\s*absolute/)
    const day = rule('.ds-cal__day')
    expect(day, 'дню нужен position: relative как якорь для точки').toMatch(/position:\s*relative/)
    expect(day, 'колоночная раскладка снова разведёт числа по высоте')
      .not.toMatch(/flex-direction:\s*column/)
  })

  it('режим просмотра не гасит заливку выбранного дня', () => {
    // .ds-cal--readonly .ds-cal__day:hover (0,3,0) перебивает .ds-cal__day.is-selected
    // (0,2,0) — выбранный день на ховере становился белым по белому.
    const m = css.match(/\.ds-cal--readonly\s+\.ds-cal__day:hover[^{]*\{/)
    expect(m, 'правило ховера в readonly не найдено').not.toBeNull()
    expect(m![0], 'исключи выбранный день, иначе его текст пропадёт на ховере')
      .toMatch(/:not\(\.is-selected\)/)
  })
})

describe('Calendar — размер не зависит от тега ячейки', () => {
  it('день задаёт box-sizing явно', () => {
    // В readOnly день рендерится <div>, иначе <button>. У кнопок браузер по
    // умолчанию ставит border-box, у div — content-box, поэтому при height 30px
    // и border 2px строка в режиме просмотра становилась на 4px выше.
    const day = rule('.ds-cal__day')
    expect(day, 'без box-sizing высота дня зависит от того, div это или button')
      .toMatch(/box-sizing:\s*border-box/)
  })
})
