/**
 * Санитары чтения вида из исходника (DS-67).
 *
 * Здесь проверяется РАЗЛИЧЕНИЕ, а не «функция что-то вернула»: три ответа
 * («вид такой-то», «вида нет», «вид не прочитан») должны расходиться на тех
 * входах, где наивная реализация их путает. Мутации, которые обязаны красить:
 *  - «первое kind: в файле» вместо разбора — падает случай с крутилкой выше;
 *  - `{ unread }` подменён на `{}` («вида нет») — падают все случаи отказа,
 *    потому что `fitsSlot(accepts, undefined)` истинно и подмена ТИХАЯ.
 */
import { describe, it, expect } from 'vitest'
import { readFixtureKind } from './kinds-source.js'

const wrap = (body: string): string =>
  `import { defineFixture } from '../../internal/fixture.js'\nexport default defineFixture<Props>({\n${body}\n})\n`

describe('readFixtureKind', () => {
  it('читает вид верхнего уровня', () => {
    expect(readFixtureKind(wrap(`  name: 'Badge',\n  kind: 'inline',`))).toEqual({ kind: 'inline' })
  })

  it('kind крутилки ВЫШЕ по файлу не подменяет вид фикстуры', () => {
    const src = wrap(
      `  name: 'DataTable',\n  controls: {\n    tone: { kind: 'enum', values: [], prop: true },\n    dense: { kind: 'bool', prop: true },\n  },\n  kind: 'block',`,
    )
    expect(readFixtureKind(src)).toEqual({ kind: 'block' })
  })

  it('kind есть ТОЛЬКО у крутилок — у фикстуры вида нет, и это не «не прочитан»', () => {
    const src = wrap(`  name: 'Tree',\n  controls: { filter: { kind: 'text', prop: true } },`)
    expect(readFixtureKind(src)).toEqual({})
  })

  it('вычисленный вид — «не прочитан», а не «вида нет»', () => {
    expect(readFixtureKind(wrap(`  name: 'X',\n  kind: KIND,`))).toEqual({ unread: true })
  })

  it('чужая строка в kind — «не прочитан»: inline|block|any и ничего больше', () => {
    expect(readFixtureKind(wrap(`  name: 'X',\n  kind: 'enum',`))).toEqual({ unread: true })
    // Имя из прототипа Object — проверка вида обязана смотреть на СВОИ ключи.
    // С `in` вместо `hasOwnProperty` это проезжало бы как настоящий вид.
    expect(readFixtureKind(wrap(`  name: 'X',\n  kind: 'toString',`))).toEqual({ unread: true })
  })

  it('вычисленное имя свойства — «не прочитан», а не «вида нет»', () => {
    // Найдено ревью. Пропуск такого свойства как «чужого» давал `{}` —
    // утверждение «вид не объявлен», по которому фикстура годится куда угодно.
    expect(readFixtureKind(wrap(`  ['kind']: 'block',`))).toEqual({ unread: true })
    expect(readFixtureKind(wrap(`  name: 'X',\n  [K]: 'block',`))).toEqual({ unread: true })
  })

  it('спред чужой шапки — «не прочитан»: kind мог приехать оттуда', () => {
    expect(readFixtureKind(wrap(`  ...base,\n  name: 'X',`))).toEqual({ unread: true })
  })

  it('нет export default — «не прочитан»', () => {
    expect(readFixtureKind(`export const f = { kind: 'inline' }\n`)).toEqual({ unread: true })
  })

  it('export default не сводится к объекту — «не прочитан»', () => {
    expect(readFixtureKind(`export default makeFixture\n`)).toEqual({ unread: true })
  })

  it('голый объект и цепочка через const читаются так же, как defineFixture', () => {
    expect(readFixtureKind(`export default { name: 'X', kind: 'any' }\n`)).toEqual({ kind: 'any' })
    expect(
      readFixtureKind(`const f = defineFixture({ name: 'X', kind: 'block' })\nexport default f\n`),
    ).toEqual({ kind: 'block' })
  })

  it('as/satisfies поверх шапки не мешают', () => {
    expect(readFixtureKind(`export default ({ kind: 'inline' }) satisfies Fixture\n`)).toEqual({
      kind: 'inline',
    })
  })

  it('взаимная ссылка const-ов не роняет разбор', () => {
    expect(readFixtureKind(`const a = b\nconst b = a\nexport default a\n`)).toEqual({ unread: true })
  })

  it('битый синтаксис не бросает', () => {
    expect(() => readFixtureKind(`export default defineFixture({ kind: 'inline'`)).not.toThrow()
  })
})
