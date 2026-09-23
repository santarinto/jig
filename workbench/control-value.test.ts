import { describe, it, expect } from 'vitest'
import { coerceControl, displayValue } from './control-value.js'
import { resolveCase } from './resolve-case.js'
import type { ControlMeta } from './protocol.js'
import type { AnyFixture } from '../src/internal/fixture.js'
import type { FrameState } from './frame-url.js'

/**
 * DS-265. Проверяется НЕ «булева крутилка работает», а различение ТРЁХ
 * состояний: параметра нет / параметр понят / параметр не понят. Тест, знающий
 * только про два, зелен и при старом поведении — старое как раз и сводило
 * третье состояние ко второму.
 *
 * Поэтому у каждого вида крутилки есть случай «мусор» И случай «законная
 * ложь», и они обязаны давать РАЗНОЕ. Слей их обратно в один результат —
 * покраснеет `не понято ≠ ложь` в каждом из четырёх видов.
 */
const bool: ControlMeta = { kind: 'bool', prop: true }
const num: ControlMeta = { kind: 'number', min: 0, max: 10, prop: true }
const enumStr: ControlMeta = { kind: 'enum', values: ['top', 'bottom'], prop: true }
const enumNum: ControlMeta = { kind: 'enum', values: ['1', '2', '3'], numeric: true, prop: true }
const text: ControlMeta = { kind: 'text', prop: true }

describe('coerceControl: понято / не понято', () => {
  it.each(['true', '1', 'on', 'yes', ''])('булево «%s» — истина', (raw) => {
    expect(coerceControl(bool, raw)).toEqual({ ok: true, value: true })
  })

  it.each(['false', '0', 'off', 'no'])('булево «%s» — ложь', (raw) => {
    expect(coerceControl(bool, raw)).toEqual({ ok: true, value: false })
  })

  /**
   * ЯДРО ЗАДАЧИ. До правки здесь возвращалась ЛОЖЬ, неотличимая от честного
   * `p.x=false`, и опечатка в адресе давала другой законно выглядящий кадр.
   */
  it.each(['xyzzy', 'TRUE ', '2', 'да'])('булево «%s» — НЕ понято', (raw) => {
    expect(coerceControl(bool, raw)).toEqual({ ok: false })
  })

  it('не понято ≠ ложь: результаты различимы', () => {
    expect(coerceControl(bool, 'xyzzy')).not.toEqual(coerceControl(bool, 'false'))
  })

  it('число: пустая строка НЕ ноль', () => {
    // `Number('')` — это 0, и без отдельной проверки пустая крутилка молча
    // ставила бы ноль вместо умолчания случая.
    expect(coerceControl(num, '')).toEqual({ ok: false })
    expect(coerceControl(num, '0')).toEqual({ ok: true, value: 0 })
  })

  it('число: нечисловое не понято, а не NaN', () => {
    expect(coerceControl(num, 'абв')).toEqual({ ok: false })
    expect(coerceControl(num, '3.5')).toEqual({ ok: true, value: 3.5 })
  })

  it('enum: значение вне списка не понято', () => {
    expect(coerceControl(enumStr, 'left')).toEqual({ ok: false })
    expect(coerceControl(enumStr, 'top')).toEqual({ ok: true, value: 'top' })
  })

  it('ЧИСЛОВОЙ enum доезжает ЧИСЛОМ, а не строкой', () => {
    // Сниппет печатает такой проп числом (`jsx-snippet.ts` читает `numeric`).
    // До правки компонент получал строку — то есть док утверждал `months={3}`,
    // а в кадре стояло `months="3"`.
    expect(coerceControl(enumNum, '3')).toEqual({ ok: true, value: 3 })
    expect(coerceControl(enumNum, '5')).toEqual({ ok: false })
  })

  it('текст: любая строка законна, включая пустую', () => {
    expect(coerceControl(text, '')).toEqual({ ok: true, value: '' })
    expect(coerceControl(text, 'что угодно')).toEqual({ ok: true, value: 'что угодно' })
  })
})

describe('displayValue: док и кадр видят одно', () => {
  it('понятое булево печатается канонически', () => {
    expect(displayValue(bool, '1')).toBe('true')
    expect(displayValue(bool, 'off')).toBe('false')
  })

  it('непонятое — null, чтобы вызывающий откатился к значению случая', () => {
    expect(displayValue(bool, 'xyzzy')).toBeNull()
    expect(displayValue(num, 'абв')).toBeNull()
    expect(displayValue(enumStr, 'left')).toBeNull()
  })
})

/**
 * Вторая половина, без которой первая ничего не стоит: `coerceControl` может
 * быть верна, а `resolveCase` — по-прежнему перекрывать умолчание случая.
 * Проверяется именно СЛОЙ: непонятое не должно доходить до пропов вовсе.
 */
describe('resolveCase: непонятое не перекрывает умолчание случая', () => {
  const fx = {
    name: 'Fake',
    props: { groupByDay: false },
    controls: { groupByDay: bool, months: enumNum },
    cases: [{ id: 'base', title: 'Базовый', props: { groupByDay: true } }],
  } as unknown as AnyFixture

  const at = (props: Record<string, string>): FrameState =>
    ({ c: 'Fake', caseId: 'base', props, data: null } as unknown as FrameState)

  it('параметра нет — умолчание случая', () => {
    expect(resolveCase(fx, at({})).groupByDay).toBe(true)
  })

  it('понятая ложь перекрывает умолчание', () => {
    expect(resolveCase(fx, at({ groupByDay: 'false' })).groupByDay).toBe(false)
    expect(resolveCase(fx, at({ groupByDay: '0' })).groupByDay).toBe(false)
  })

  it('понятая истина в другой записи тоже работает', () => {
    expect(resolveCase(fx, at({ groupByDay: '1' })).groupByDay).toBe(true)
  })

  /**
   * Тот самый случай из отчёта браузерного агента:
   * `?c=Timeline&case=base&p.groupByDay=xyzzy` рисовал кадр БЕЗ разделителей,
   * хотя у случая умолчание — с ними.
   */
  it('МУСОР оставляет умолчание случая, а не ставит ложь', () => {
    expect(resolveCase(fx, at({ groupByDay: 'xyzzy' })).groupByDay).toBe(true)
  })

  it('числовой enum доходит числом', () => {
    expect(resolveCase(fx, at({ months: '3' })).months).toBe(3)
  })
})
