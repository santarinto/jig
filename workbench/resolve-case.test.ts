import { describe, it, expect } from 'vitest'
import { auditCase, resolveCase } from './resolve-case.js'
import { parseFrameUrl } from './frame-url.js'
import type { AnyFixture } from '../src/internal/fixture.js'
import type { FrameState } from './frame-url.js'

const fx: AnyFixture = {
  name: 'X',
  group: 'G',
  props: { a: 1, b: 'шапка', flag: false },
  controls: {
    a: { kind: 'number', min: 0, max: 9, prop: true },
    b: { kind: 'text', prop: true },
    flag: { kind: 'bool', prop: true },
  },
  data: { alt: { b: 'из набора' } },
  cases: [
    { id: 'base', title: 'B', props: { a: 2 } },
    { id: 'other', title: 'O', props: { b: 'из кейса' } },
  ],
}

describe('resolveCase — порядок слоёв', () => {
  it('кейс перекрывает шапку', () => {
    expect(resolveCase(fx, parseFrameUrl('?c=X&case=base')).a).toBe(2)
  })

  it('набор данных перекрывает кейс', () => {
    expect(resolveCase(fx, parseFrameUrl('?c=X&case=other&data=alt')).b).toBe('из набора')
  })

  it('адрес перекрывает всё', () => {
    const p = resolveCase(fx, parseFrameUrl('?c=X&case=base&data=alt&p.b=из+адреса'))
    expect(p.b).toBe('из адреса')
  })

  it('приводит тип по описанию крутилки, а не по виду строки', () => {
    const p = resolveCase(fx, parseFrameUrl('?c=X&p.a=7&p.flag=true'))
    expect(p.a).toBe(7)
    expect(p.flag).toBe(true)
  })

  it('крутилку, которой нет в фикстуре, из адреса не применяет', () => {
    expect(resolveCase(fx, parseFrameUrl('?c=X&p.zzz=1')).zzz).toBeUndefined()
  })

  it('неизвестный кейс сводится к первому, а не роняет кадр', () => {
    expect(resolveCase(fx, parseFrameUrl('?c=X&case=нетакого')).a).toBe(2)
  })
})

describe('крутилки с именами из Object.prototype', () => {
  it('`toString` и `constructor` не проходят барьер «крутилки нет в фикстуре»', () => {
    // `fx.controls[k]` для этих ключей возвращает МЕТОД `Object.prototype` —
    // истинный, — и `if (!ctl) continue` их пропускает. Барьер написан ровно
    // затем, чтобы старая ссылка после переименования пропа не подсунула мусор
    // в компонент; для трёх имён он не работал.
    //
    // Плюс расхождение с сниппетом: `snippetOf` печатает по
    // `Object.entries(controls)` и такой проп не покажет — кадр его применил,
    // сниппет о нём молчит.
    const fx = {
      Component: () => null,
      props: { a: 1 },
      controls: { dense: { kind: 'bool' as const } },
      cases: [{ id: 'base', title: 'base' }],
    }
    const out = resolveCase(fx as never, {
      c: 'X', caseId: 'base', theme: 'light', scale: 1, width: 768,
      sid: 1, mode: 'frame', slots: {}, data: null,
      props: { toString: 'мусор', constructor: 'тоже', nope: 'нет', dense: 'true' },
    } as never)
    expect(Object.keys(out).sort()).toEqual(['a', 'dense'])
    expect(out.dense).toBe(true)
  })
})

/**
 * Аудит фикстуры (JIG-40, решение спецификации п.2б): случай, набор и
 * крутилки из АДРЕСА против того, что резолвер реально применил. Тем же
 * барьером, что у `resolveCase` (`propOf`) — иначе «применено» и «названо в
 * аудите» разъехались бы при первой же правке одного из них.
 */
describe('auditCase — аудит фикстуры', () => {
  const fx = {
    name: 'Y',
    group: 'G',
    props: {},
    controls: {
      size: { kind: 'enum' as const, values: ['sm', 'md'] },
      dense: { kind: 'bool' as const },
    },
    data: { long: {} },
    cases: [{ id: 'base', title: 'B' }, { id: 'many', title: 'M' }],
  } as unknown as AnyFixture

  const state = (over: Partial<FrameState>): FrameState => ({
    c: 'Y', caseId: '', sid: 0, theme: 'light', scale: 1, data: null, force: null,
    mode: 'frame', text: 'ru', aim: false, layers: [], props: {}, slots: {}, w: null,
    sx: null, sy: null,
    ...over,
  })

  it('неизвестный случай сводится к первому, и это видно в used', () => {
    expect(auditCase(fx, state({ caseId: 'nope' })).case).toEqual({ asked: 'nope', used: 'base' })
  })

  it('пустой caseId — тоже первый случай, но не флагуется отдельно', () => {
    expect(auditCase(fx, state({ caseId: '' })).case).toEqual({ asked: '', used: 'base' })
  })

  it('неизвестный набор данных — known: false, известный — true', () => {
    expect(auditCase(fx, state({ data: 'lng' })).data).toEqual({ asked: 'lng', known: false })
    expect(auditCase(fx, state({ data: 'long' })).data).toEqual({ asked: 'long', known: true })
  })

  it('набор не задан адресом вовсе — data: null, а не known: false', () => {
    expect(auditCase(fx, state({ data: null })).data).toBeNull()
  })

  it('крутилки: неизвестная и непонятое значение — в списке; понятая — нет (TRUE_WORDS)', () => {
    const a = auditCase(fx, state({ props: { sise: 'sm', size: 'xl', dense: 'yes' } }))
    expect(a.props).toEqual([
      { key: 'sise', asked: 'sm', why: 'нет такой крутилки' },
      { key: 'size', asked: 'xl', why: 'значение не понято' },
    ])
  })

  it('имя из Object.prototype — тот же барьер, что у resolveCase', () => {
    const a = auditCase(fx, state({ props: { toString: 'x' } }))
    expect(a.props).toEqual([{ key: 'toString', asked: 'x', why: 'нет такой крутилки' }])
  })
})
