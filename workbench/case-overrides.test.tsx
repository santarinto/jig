/**
 * Зонд перекрытых крутилок (DS-164). Каждый случай ниже — пара
 * «погасить / не гасить» на одинаковой фикстуре, отличающейся ровно тем, что
 * решает ответ: так схлопнутый зонд («гасит всё» или «не гасит ничего») не
 * проходит ни одной пары (docs/writing-checks.md, пункт 6).
 */
/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { overriddenControls, sameTree } from './case-overrides.js'
import type { AnyFixture } from '../src/internal/fixture.js'

interface P {
  title: string
  open: boolean
  side: 'left' | 'right' | 'bottom'
  count: number
}

function Live(_: Partial<P> & { children?: ReactNode }) {
  return null
}

const fx = (cases: AnyFixture['cases'], render?: AnyFixture['render']): AnyFixture => ({
  name: 'X',
  group: 'Г',
  props: { title: 'Док', open: true, side: 'right', count: 3 } satisfies P,
  controls: {
    title: { kind: 'text', prop: true },
    open: { kind: 'bool', prop: true },
    side: { kind: 'enum', values: ['left', 'right', 'bottom'], prop: true },
    count: { kind: 'number', min: 0, max: 9, prop: true },
  },
  cases,
  render: render ?? ((p: P) => <Live {...p} />),
})

const probe = (f: AnyFixture, i = 0) => overriddenControls(f, f.cases[i]!)

describe('overriddenControls', () => {
  it('литерал после спреда перекрывает крутилку, спред без литерала — нет', () => {
    const f = fx([
      { id: 'pass', title: 'pass' },
      { id: 'own', title: 'own', render: (p: P) => <Live {...p} title="Парки" open={false} /> },
    ])
    expect(probe(f, 0)).toEqual([])
    expect(probe(f, 1)).toEqual(['title', 'open'])
  })

  it('перекрытие внутри вложенного дерева видно так же, как на корне', () => {
    const f = fx([
      {
        id: 'deep',
        title: 'deep',
        render: (p: P) => (
          <div>
            <Live {...p} side="left" />
          </div>
        ),
      },
    ])
    expect(probe(f)).toEqual(['side'])
  })

  it('render без параметров перекрывает все крутилки', () => {
    const f = fx([{ id: 'blind', title: 'blind', render: () => <Live title="Своё" /> }])
    expect(probe(f)).toEqual(['title', 'open', 'side', 'count'])
  })

  it('enum перебирается весь: две стороны из трёх, сведённые в одно, крутилку не гасят', () => {
    // `left` и `right` дают одно дерево, `bottom` — другое. Первое же
    // соседнее значение базы `left` — совпавшее `right`, и сдвиг на ОДНО
    // значение сказал бы «мертва».
    const f = fx([
      { id: 'map', title: 'map', props: { side: 'left' }, render: (p: P) => <Live open={p.side === 'bottom'} /> },
    ])
    expect(probe(f)).not.toContain('side')
  })

  it('крутилка, мёртвая только при базовом соседе, не гаснет: сосед её оживляет', () => {
    // `count` читается, лишь когда `open`. На базе случая `open=false` — дерево
    // от `count` не зависит, но стоит подвинуть `open`, и зависит.
    const f = fx([
      {
        id: 'cond',
        title: 'cond',
        props: { open: false },
        render: (p: P) => <Live title={p.title} count={p.open ? p.count : 0} />,
      },
    ])
    expect(probe(f)).not.toContain('count')
    expect(probe(f)).toEqual(['side'])
  })

  it('недетерминированный render — ответа нет (null), а не «ничего не перекрыто»', () => {
    const f = fx([
      { id: 'closure', title: 'closure', render: (p: P) => <Live {...p} title="Своё" children={(() => p.title) as never} /> },
    ])
    expect(probe(f)).toBeNull()
  })

  it('бросок на сдвинутом значении — крутилка живая', () => {
    const f = fx([
      {
        id: 'throws',
        title: 'throws',
        render: (p: P) => {
          if (p.count === 9) throw new Error('край')
          return <Live title="Своё" />
        },
      },
    ])
    expect(probe(f)).not.toContain('count')
    expect(probe(f)).toContain('title')
  })
})

describe('sameTree', () => {
  it('Date сравнивается тождеством: разные даты — разные деревья', () => {
    expect(sameTree(<Live children={new Date(0) as never} />, <Live children={new Date(1) as never} />)).toBe(
      false,
    )
    expect(sameTree(<Live title="a" />, <Live title="a" />)).toBe(true)
    expect(sameTree(<Live title="a" />, <Live title="b" />)).toBe(false)
  })

  it('разный тип и разный ключ — разные деревья', () => {
    expect(sameTree(<Live key="a" />, <Live key="b" />)).toBe(false)
    expect(sameTree(<div />, <span />)).toBe(false)
  })
})
