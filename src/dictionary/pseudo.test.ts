import { describe, expect, it } from 'vitest'
import { DS_TEXT_RU } from './text.js'
import { DS_TEXT_PSEUDO, PSEUDO_CLOSE, PSEUDO_OPEN } from './pseudo.js'

/**
 * Псевдолокаль проверяется НЕ на «она собралась», а на единственном свойстве,
 * ради которого существует: включив её, человек видит разницу между «переехало
 * в словарь» и «сказано мимо словаря». Свойство ломается двумя способами —
 * ключ потерялся (остался русским, читается как дефект компонента) и значение
 * совпало с русским (то же самое, но незаметнее). Оба проверяются ниже.
 */
describe('DS_TEXT_PSEUDO', () => {
  const ruKeys = Object.keys(DS_TEXT_RU).sort()

  /**
   * Значения обходятся ОБОБЩЁННО, поэтому здесь свой вызывающий тип: арности у
   * ключей разные (`(rowId)`, `(nodes, edges)`, `(from, to, total)`), и вызвать
   * их объединение TS не даёт — пересечение параметров пусто. Тип узкий и
   * локальный: он описывает ровно то, что делает обход, и наружу не уезжает.
   */
  type AnyValue = string | ((...args: never[]) => string)
  const say = (v: AnyValue): string => (typeof v === 'function' ? v(...([1, 2, 3] as never[])) : v)

  it('накрывает КАЖДЫЙ ключ русского словаря — иначе пропущенный выглядит как дефект компонента', () => {
    expect(Object.keys(DS_TEXT_PSEUDO).sort()).toEqual(ruKeys)
  })

  it('не несёт ключей СВЕРХ русского словаря', () => {
    // Отдельным утверждением, а не половиной предыдущего: лишний ключ
    // означает, что словарь собран не из `DS_TEXT_RU`, и тогда обещание «новый
    // ключ получает маркер сам» неверно, хотя первая проверка была бы зелена.
    for (const key of Object.keys(DS_TEXT_PSEUDO)) expect(ruKeys).toContain(key)
  })

  it('ни одно значение не совпадает с русским — иначе ключ невидим именно там, где его ищут', () => {
    for (const key of ruKeys) {
      const ru = DS_TEXT_RU[key as keyof typeof DS_TEXT_RU]
      const ps = DS_TEXT_PSEUDO[key as keyof typeof DS_TEXT_PSEUDO]
      expect(say(ps as AnyValue), `ключ ${key}`).not.toBe(say(ru as AnyValue))
    }
  })

  it('строковый ключ печатает СВОЁ имя в скобках', () => {
    expect(DS_TEXT_PSEUDO['modal.close']).toBe(`${PSEUDO_OPEN}modal.close${PSEUDO_CLOSE}`)
    expect(DS_TEXT_PSEUDO['heatmap.less']).toBe(`${PSEUDO_OPEN}heatmap.less${PSEUDO_CLOSE}`)
  })

  it('каждое строковое значение несёт ИМЕННО свой ключ, а не чужой', () => {
    // Мутация, которую ловит только эта проверка: `mark(key)` заменён на
    // `mark('ds.text')` — все значения различны, все в скобках, все не равны
    // русским, и предыдущие три проверки остаются зелёными.
    for (const key of ruKeys) {
      const v = DS_TEXT_PSEUDO[key as keyof typeof DS_TEXT_PSEUDO]
      if (typeof v === 'string') expect(v).toBe(`${PSEUDO_OPEN}${key}${PSEUDO_CLOSE}`)
    }
  })

  it('функция остаётся функцией и ПЕЧАТАЕТ свои аргументы', () => {
    // Аргументы в значении — не украшение: функция, потерявшая аргумент, в
    // псевдолокали выглядит иначе, чем работающая, а в русском умолчании —
    // так же («Выбрать строку» без номера тоже читается как фраза).
    const selectRow = DS_TEXT_PSEUDO['dataTable.selectRow']
    expect(typeof selectRow).toBe('function')
    expect(selectRow('42')).toBe(`${PSEUDO_OPEN}dataTable.selectRow:42${PSEUDO_CLOSE}`)

    const range = DS_TEXT_PSEUDO['pagination.range']
    expect(range(11, 20, 50)).toBe(`${PSEUDO_OPEN}pagination.range:11,20,50${PSEUDO_CLOSE}`)
  })

  it('функциональные ключи русского словаря остались функциями и в псевдо', () => {
    // Иначе компонент, зовущий значение, упал бы на `dict[k](x)` — и упал бы
    // ТОЛЬКО при включённой псевдолокали, то есть у того, кто её включил ради
    // приёмки. Инструмент приёмки не имеет права ломать предмет приёмки.
    for (const key of ruKeys) {
      const ru = DS_TEXT_RU[key as keyof typeof DS_TEXT_RU]
      if (typeof ru !== 'function') continue
      expect(typeof DS_TEXT_PSEUDO[key as keyof typeof DS_TEXT_PSEUDO], `ключ ${key}`).toBe(
        'function',
      )
    }
  })

  it('маркер не содержит кириллицы — его видно среди русского текста', () => {
    // Смысл псевдолокали в том, что непереехавшее ОТЛИЧАЕТСЯ. Кириллица в
    // маркере (например перевод слова «ключ») стёрла бы эту границу.
    for (const key of ruKeys) {
      const v = DS_TEXT_PSEUDO[key as keyof typeof DS_TEXT_PSEUDO]
      expect(say(v as AnyValue), `ключ ${key}`).not.toMatch(/[А-Яа-яЁё]/)
    }
  })
})
