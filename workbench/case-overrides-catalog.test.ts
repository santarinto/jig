/**
 * Зонд перекрытых крутилок на НАСТОЯЩИХ фикстурах (DS-164).
 *
 * `case-overrides.test.tsx` доказывает механизм на выдуманных фикстурах; здесь
 * — что панель на живом каталоге говорит правду о двух парах, которые и
 * завели задачу.
 *
 * `Drawer/open` и `Drawer/sticky` (и та же пара у `Modal`): крутилки
 * `closeOnBackdrop`/`closeOnEscape` показывались ОДИНАКОВО отмеченными, хотя
 * `sticky` их выключает. Причина — выключал `render` литералом, а значения
 * панели берутся из `props` случая. Пара утверждает РАЗЛИЧИЕ значений и то,
 * что крутилки на обоих случаях живые: выключение перенесено в `props`, и
 * поставить галку обратно на `sticky` действительно закрывает шторку.
 *
 * `Drawer/side-left` — обратный вид: заголовок случай задаёт сам, и `title`
 * обязан быть перекрыт, а `side` (берётся из пропа) — нет.
 */
/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { metaOf } from './fixture-meta.js'
import type { AnyFixture } from '../src/internal/fixture.js'
import type { CaseMeta } from './protocol.js'

const shipped = import.meta.glob<{ default: AnyFixture }>(['../src/components/*/*.fixture.tsx', '../src/icons/*.fixture.tsx'], {
  eager: true,
})
const all = Object.values(shipped).map((m) => m.default)

const caseOf = (name: string, id: string): CaseMeta => {
  const fx = all.find((f) => f.name === name)
  expect(fx, `фикстура ${name}`).toBeTruthy()
  const k = metaOf(fx!).cases.find((c) => c.id === id)
  expect(k, `${name}/${id}`).toBeTruthy()
  return k!
}

describe('перекрытые крутилки на каталоге', () => {
  it.each(['Drawer', 'Modal'])(
    '%s: open и sticky показывают РАЗНЫЕ closeOnBackdrop/closeOnEscape, и на обоих они живые',
    (name) => {
      const open = caseOf(name, 'open')
      const sticky = caseOf(name, 'sticky')
      for (const key of ['closeOnBackdrop', 'closeOnEscape']) {
        expect([open.values[key], sticky.values[key]], key).toEqual(['true', 'false'])
        expect(open.overrides ?? [], `${name}/open`).not.toContain(key)
        expect(sticky.overrides ?? [], `${name}/sticky`).not.toContain(key)
      }
    },
  )

  it('Drawer/side-left перекрывает title и не перекрывает side', () => {
    const k = caseOf('Drawer', 'side-left')
    expect(k.overrides).toContain('title')
    expect(k.overrides).not.toContain('side')
  })

  it('зонд проходит весь каталог без броска и хоть где-то отвечает', () => {
    // Обход непустой — иначе «ни одного перекрытия» было бы зелёным на
    // зонде, который не запускался.
    const metas = all.map((fx) => metaOf(fx))
    expect(metas.length).toBeGreaterThan(0)
    expect(metas.some((m) => m.cases.some((c) => (c.overrides ?? []).length > 0))).toBe(true)
  })
})
