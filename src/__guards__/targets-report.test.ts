/**
 * Печать строки 1 матрицы (`scripts/case-targets.mjs`, `targetsRow.report`) —
 * фразы, которые обзор 6a–6e (DS-177) и финальная фикс-волна (18.09.2026)
 * нашли неверными или отсутствующими, и ни одна не видна юнитам предиката: они
 * живут в отчёте.
 *
 * 1. Объявленная ячейка без мелкой цели на ОДНОЙ шкале отсылала к секции
 *    «ОБЪЯВЛЕНО, НО НЕТ», которой в выводе нет, — случай на других шкалах в
 *    порядке, цель просто выросла по шкале (Prose/base ×1.5).
 * 2. Цели, выпавшие из замера как инертные и обрезанные в ноль, считаются
 *    предикатом, но отчёт их не называл: сужение площади было молчаливым.
 * 3. Сужения называли только сумму по площади, а не ГДЕ она набралась
 *    (m2): строка теперь несёт топ-3 компонента на каждый счётчик.
 * 4. Заголовок нарушающей ячейки искал худшую цель по `kind === 'НЕ ПОПАСТЬ'`
 *    (m1) — точное сравнение не находило `missWord` с `coveredBy` («НЕ
 *    ПОПАСТЬ: …») и на живом каталоге не срабатывало никогда: худшей всегда
 *    выходила мелкая цель, даже рядом с непопадаемой.
 * 5. Слово при коде через запятую («задачи») и при одном коде («задача»).
 *    Карта известных приходит в `report()` аргументом `known` (по умолчанию —
 *    `KNOWN` модуля): до DS-329 тест бил по реальной строке с двумя
 *    кодами (`Form/collapsed ×0.875`), а 329 сняла последнюю такую, и тест
 *    остался бы без предмета. `TARGETS OK` этим путём по-прежнему не
 *    проверяется: утверждение о нём — про реальную карту, а синтетическая
 *    карта из одной строки проверяла бы копию, а не каталог.
 *
 * Отчёт печатает, а не возвращает, поэтому вывод перехватывается целиком.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Модуль строки исполняется ОТДЕЛЬНЫМ node, мимо vite: проба в нём (код для
// страницы) импортирует `/gate-predicates.ts` по адресу дев-сервера, и
// трансформ vitest пытался бы разрешить этот адрес на диске; нативный
// `import()` внутри воркера vitest не разрешён.
const MOD = pathToFileURL(resolve(__dirname, '../../scripts/case-targets.mjs')).href

type Cell = Record<string, unknown> & { at: string }
const tiny = { path: 'button.ds-x', width: 10, height: 10, hit: true }
const cell = (at: string, small: unknown[], extra: Partial<Cell> = {}): Cell => ({
  at, c: at.split('/')[0], url: 'about:blank', total: 3, small, unhittable: [], unreachable: [],
  inert: 1, clipped: 2, row: { tinyTargets: 'довод' }, ...extra,
})

/** `known` не задан — отчёт берёт реальную карту `KNOWN` модуля. */
const printed = (cells: Cell[], known?: [string, string][]): string => {
  // `report()` больше не печатает свой вердикт сам (контракт JIG-30) — он его
  // ВОЗВРАЩАЕТ, `{ green, verdict }`. Хелпер печатает `r.verdict` следом, тем же
  // `console.log`, каким раньше это делал сам `report`: утверждения теста ниже
  // читают общий текст (`out`), и это сохраняет его состав, не ослабляя их.
  const code = `
    const { targetsRow } = await import(${JSON.stringify(MOD)})
    const cells = JSON.parse(process.env.CELLS)
    const known = process.env.KNOWN_ROWS ? new Map(JSON.parse(process.env.KNOWN_ROWS)) : undefined
    const r = targetsRow.report({ measured: new Map(cells.map((m) => [m.at, m])), unmeasured: [], full: true, known }, 'ПЛОЩАДЬ')
    console.log(r.verdict)`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, CELLS: JSON.stringify(cells), KNOWN_ROWS: known ? JSON.stringify(known) : '' },
    encoding: 'utf8',
  })
  if (r.status === null || /Error/.test(r.stderr) && !/ПЛОЩАДЬ/.test(r.stderr + r.stdout)) {
    throw new Error(`отчёт не исполнился: ${r.stderr}`)
  }
  return `${r.stdout}\n${r.stderr}`
}

describe('печать строки 1', () => {
  it('шкала без мелкой цели при случае, где она есть, — «выросла по шкале», без ссылки на отсутствующую секцию', () => {
    const out = printed([cell('Zz/grow ×0.875', [tiny]), cell('Zz/grow ×1.5', [])])
    expect(out).toMatch(/Zz\/grow ×1\.5 +на этой шкале мелкой цели нет — выросла по шкале/)
    expect(out).not.toContain('ОБЪЯВЛЕНО, НО НЕТ')
  })

  it('соседний случай: мелкой нет НИ НА ОДНОЙ шкале — ссылка на секцию, и секция есть', () => {
    const out = printed([cell('Zz/gone ×0.875', []), cell('Zz/gone ×1.5', [])])
    expect(out).toMatch(/Zz\/gone ×1\.5 +мелкой цели НЕТ — см\. «ОБЪЯВЛЕНО, НО НЕТ»/)
    expect(out).toMatch(/^ОБЪЯВЛЕНО, НО НЕТ 1/m)
  })

  it('строка площади называет сужения: инертные и обрезанные в ноль, суммой по ячейкам', () => {
    const out = printed([cell('Zz/grow ×0.875', [tiny]), cell('Zz/grow ×1.5', [])])
    expect(out).toContain('ПЛОЩАДЬ; сужения: в [inert] 2 (Zz 2), в схлопнутом предке 4 (Zz 4)')
  })

  it('строка площади называет по три худших компонента на каждый счётчик сужений (m2)', () => {
    const out = printed([
      cell('A/base ×1', [], { inert: 10, clipped: 0 }),
      cell('B/base ×1', [], { inert: 5, clipped: 0 }),
      cell('C/base ×1', [], { inert: 3, clipped: 0 }),
      cell('D/base ×1', [], { inert: 1, clipped: 0 }),
    ])
    expect(out).toContain('сужения: в [inert] 19 (A 10, B 5, C 3, …), в схлопнутом предке 0')
  })

  it('нарушающая ячейка с одной непопадаемой и одной мелкой целью — заголовок называет непопадаемую (m1)', () => {
    const bad = cell('Zz/bad ×1', [{ path: 'button.ds-small', width: 10, height: 10, hit: true }], {
      row: { tinyTargets: undefined },
      unhittable: [{ path: 'button.ds-cover', width: 30, height: 30, hit: false, coveredBy: 'TL (1.0,1.0) div.ds-veil' }],
    })
    const out = printed([bad])
    expect(out).toContain('худшее — Zz/bad ×1: button.ds-cover 30×30 (НЕ ПОПАСТЬ: TL (1.0,1.0) накрыт div.ds-veil)')
  })

  it('секция «известно»: код через запятую печатает множественное «задачи», одиночный — «задача»', () => {
    const two = cell('Zz/two ×1', [tiny], { row: { tinyTargets: undefined } })
    const one = cell('Zz/one ×1', [tiny], { row: { tinyTargets: undefined } })
    const out = printed([two, one], [['Zz/two ×1', 'DS-1, DS-2'], ['Zz/one ×1', 'DS-3']])
    expect(out).toContain('задачи DS-1, DS-2')
    expect(out).toContain('задача DS-3')
    expect(out).not.toContain('задача DS-1')
  })
})
