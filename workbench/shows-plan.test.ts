/**
 * План гейта состояний сходится с фикстурами.
 *
 * Гейт `case-states` видит ТОЛЬКО этот план. Потерянная строка не краснеет
 * нигде: кейс просто не проверяется, а гейт печатает меньшее число и остаётся
 * зелёным — то есть блиндаж у него ровно здесь. Поэтому план сверяется со
 * вторым, независимым обходом тех же фикстур.
 *
 * Утверждение про НЕПУСТОТУ — не украшение. Обход, не выполнившийся ни разу,
 * даёт зелёный гейт состояний при любом дефекте; сегодня объявлений пять, и
 * ноль здесь значит, что план перестал их видеть, а не что их нет.
 */
/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { casesPlan, showsPlan } from './shows-plan.js'
import type { AnyFixture } from '../src/internal/fixture.js'

// Второй обход — eager, а не тот же ленивый список: два одинаковых способа
// собрать одно и то же согласились бы друг с другом при любой ошибке.
const shipped = import.meta.glob<{ default: AnyFixture }>(['../src/components/*/*.fixture.tsx', '../src/icons/*.fixture.tsx'], {
  eager: true,
})

const direct = Object.values(shipped)
  .map((m) => m.default)
  .flatMap((fx) => fx.cases.filter((c) => c.shows).map((c) => `${fx.name}/${c.id}`))
  .sort()

describe('shows-plan', () => {
  it('видит все кейсы, объявившие shows, и ни одного лишнего', async () => {
    const plan = await showsPlan()
    expect(plan.map((r) => `${r.c}/${r.caseId}`)).toEqual(direct)
  })

  it('план непустой — иначе гейт состояний зелен, ничего не обойдя', async () => {
    expect((await showsPlan()).length).toBeGreaterThan(0)
  })

  it('в каждой строке — непустой список селекторов', async () => {
    for (const row of await showsPlan()) {
      expect(row.shows.length, `${row.c}/${row.caseId}`).toBeGreaterThan(0)
    }
  })

  it('план переполнения видит ВСЕ случаи всех фикстур, с их shows, overflows и tinyTargets', async () => {
    const all = Object.values(shipped)
      .map((m) => m.default)
      .flatMap((fx) => fx.cases.map((c) => `${fx.name}/${c.id}${c.shows ? ` [${c.shows.join(',')}]` : ''}${c.overflows !== undefined ? ` overflows=${c.overflows}` : ''}${c.tinyTargets !== undefined ? ` tiny=${c.tinyTargets}` : ''}`))
      .sort()
    const plan = await casesPlan()
    expect(plan.map((r) => `${r.c}/${r.caseId}${r.shows ? ` [${r.shows.join(',')}]` : ''}${r.overflows !== undefined ? ` overflows=${r.overflows}` : ''}${r.tinyTargets !== undefined ? ` tiny=${r.tinyTargets}` : ''}`).sort()).toEqual(all)
  })
})
