import { describe, it, expect } from 'vitest'
import { resolveCase } from './resolve-case.js'
import { parseFrameUrl } from './frame-url.js'
import type { AnyFixture } from '../src/internal/fixture.js'

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
