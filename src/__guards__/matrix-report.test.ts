/**
 * КОРОТКИЙ ВЫВОД ПО УМОЛЧАНИЮ, ПОЛНЫЙ — ПОД `--all` (JIG-30). `npm run matrix`
 * без флага печатал ~20 500 строк: построчно каждую ОБЪЯВЛЕННУЮ/ИЗВЕСТНУЮ
 * ячейку — секции, которые НЕ решают вердикт (у известной уже есть задача, у
 * объявленной — довод в фикстуре), — с тысячами одинаковых строк одного узла
 * (`EventCalendar/week`). Вердикт при этом печатался ПОСЕРЕДИНЕ простыни:
 * FIELDS FAIL на 52-й строке, TARGETS — на 20 474-й, и владелец, читавший
 * хвост, сделал неверный вывод.
 *
 * Этот гейт судит ПЕЧАТЬ всех трёх строк матрицы (`overflowRow`, `fieldsRow`,
 * `targetsRow`) на синтетических ячейках с маленькой картой `known` — по
 * образцу `targets-report.test.ts`: каждый ряд модуля исполняется ОТДЕЛЬНЫМ
 * node, потому что пробы строк импортируют `/gate-predicates.ts` и
 * `/frame-facts.ts` по адресу дев-сервера, и нативный `import()` внутри
 * воркера vitest не разрешён (тот же довод, что у `targets-report.test.ts`).
 * `known` передаётся ЯВНО в каждом вызове (по умолчанию — пустая карта, а не
 * `KNOWN` модуля): гейт не должен зависеть от того, что сегодня лежит в живом
 * каталоге, иначе он менялся бы вместе с ним по причине, не имеющей отношения
 * к печати.
 *
 * Пять утверждений, для КАЖДОЙ строки:
 *  1. один и тот же вход в `full: false` и `full: true` даёт ОДИНАКОВЫЕ
 *     `green` и `verdict` — печать не влияет на вердикт;
 *  2. короткий режим НЕ печатает `at` известной и объявленной ячейки, но
 *     печатает строку счёта («ИЗВЕСТНО 1», «ОБЪЯВЛЕНО … 1»); полный — печатает
 *     `at`;
 *  3. мутация «снять объявление одной ячейки» (её `row.overflows` /
 *     `narrowFields` / `tinyTargets` → `undefined`) переводит её из
 *     «объявлено» в обычное нарушение: `green === false`, `verdict` начинается
 *     с `<ИМЯ> FAIL`, и её `at` есть уже в КОРОТКОМ выводе (нарушения решают
 *     вердикт и печатаются целиком в обоих режимах). То же — для «снять
 *     строку из `known`»: известная ячейка становится нарушением тем же
 *     путём (known просто не передаётся для её адреса);
 *  4. устаревшее исключение (запись `known` без нарушения) и «НЕ ИЗМЕРЕНО»
 *     видны в КОРОТКОМ выводе — они тоже решают вердикт;
 *  5. для fields и targets: три одинаковых узла в одной нарушающей ячейке —
 *     одна строка с `×3` (`collapseRepeats`, JIG-30 шаг 1) в КОРОТКОМ выводе.
 *     Overflow сюда не входит: на ячейку там максимум один виновник, свёртывать
 *     внутри ячейки нечего (см. `scripts/case-overflow.mjs`).
 *
 * Форма ячеек каждой строки — из её `verdict`-функции и из
 * `workbench/case-report.ts` (`classify`, `targetSections`): overflow несёт
 * `over`/`sw`/`cw`/`culprit`/`escape`/`escapee`, fields — `narrow` (список
 * `{ inner, need, path, sample }`), targets — `small`/`unhittable`/`row.tinyTargets`.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type Json = Record<string, unknown>

/**
 * Гоняет `report()` заданной строки в отдельном node и отдаёт РАЗДЕЛЬНО тело
 * печати (`body` — конкатенация stdout/stderr) и сам возврат `{ green,
 * verdict }` (JIG-30). Маркер `##RESULT##` печатается ПОСЛЕДНЕЙ строкой
 * stdout — `JSON.stringify` результата, отделимый от шумного тела регуляркой;
 * `report()` сам вердикт больше не печатает, поэтому тело и возврат — не одно
 * и то же, и тест обязан судить оба.
 */
function runRow(modRelPath: string, exportName: string, cells: Json[], opts: {
  known?: [string, string][]
  full?: boolean
  unmeasured?: { at: string; url: string; why: string }[]
} = {}): { green: boolean; verdict: string; body: string } {
  const MOD = pathToFileURL(resolve(__dirname, modRelPath)).href
  const code = `
    const { ${exportName} } = await import(${JSON.stringify(MOD)})
    const measured = new Map(JSON.parse(process.env.CELLS).map((m) => [m.at, m]))
    const unmeasured = JSON.parse(process.env.UNMEASURED)
    const known = new Map(JSON.parse(process.env.KNOWN_ROWS))
    const full = process.env.FULL === '1'
    const result = ${exportName}.report({ measured, unmeasured, full, known }, 'ПЛОЩАДЬ')
    process.stdout.write('\\n##RESULT## ' + JSON.stringify(result) + '\\n')`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: {
      ...process.env,
      CELLS: JSON.stringify(cells),
      UNMEASURED: JSON.stringify(opts.unmeasured ?? []),
      KNOWN_ROWS: JSON.stringify(opts.known ?? []),
      FULL: opts.full ? '1' : '0',
    },
    encoding: 'utf8',
  })
  const out = `${r.stdout}\n${r.stderr}`
  const m = out.match(/##RESULT## (.+)/)
  if (r.status === null || !m) {
    throw new Error(`отчёт не исполнился: status=${r.status}\n${out}`)
  }
  const result = JSON.parse(m[1]!) as { green: boolean; verdict: string }
  return { ...result, body: out.replace(/##RESULT## .+/, '') }
}

// ── overflow ────────────────────────────────────────────────────────────────
const oCell = (at: string, over: boolean, extra: Json = {}): Json => ({
  at, url: `/frame.html?${at}`, c: at.split('/')[0], scale: 1,
  row: {}, over,
  sw: over ? 500 : 440, cw: 440,
  culprit: over ? { path: 'div.ds-culprit', right: 500 } : null,
  escape: 0, escapee: null,
  ...extra,
})

// ── fields ──────────────────────────────────────────────────────────────────
const fNode = (path = 'input.ds-field'): Json => ({ inner: 10, need: 20, path, sample: '31.12.2026' })
const fCell = (at: string, narrow: Json[], extra: Json = {}): Json => ({
  at, url: `/frame.html?${at}`, c: at.split('/')[0], scale: 1,
  total: 3, narrow, skipped: { total: 3, invisible: 0, inert: 0, clipped: 0 },
  row: {}, ...extra,
})

// ── targets ─────────────────────────────────────────────────────────────────
const tNode = (path = 'button.ds-target'): Json => ({ path, width: 10, height: 10, hit: true })
const tCell = (at: string, small: Json[], extra: Json = {}): Json => ({
  at, url: `/frame.html?${at}`, c: at.split('/')[0], scale: 1, total: 3,
  small, unhittable: [], unreachable: [], inert: 0, clipped: 0,
  row: {}, ...extra,
})

interface RowSpec {
  name: string
  mod: string
  exportName: string
  verdictName: string
  /** Ячейка, матчащая `known`, плюс её код — вместе описывают «известное». */
  known: [Json, string]
  /** Ячейка, объявленная (довод в фикстуре) и НЕ нарушающая. */
  declared: Json
  declaredHead: string
  /** Копия `declared`, но с полем объявления снятым (→ становится нарушением). */
  undeclare: (cell: Json) => Json
  /** Ячейка с тремя одинаковыми узлами внутри одной нарушающей ячейки (для #5). */
  triple?: Json
  /** Маркер печати одного узла — для счёта строк в утверждении #5. */
  tripleMarker?: string
}

const specs: RowSpec[] = [
  {
    name: 'overflow',
    mod: '../../scripts/case-overflow.mjs',
    exportName: 'overflowRow',
    verdictName: 'OVERFLOW',
    known: [oCell('Ov/known ×1', true), 'JIG-1 документ'],
    declared: oCell('Ov/declared ×1', true, { row: { overflows: 'нарочно' } }),
    declaredHead: 'ОБЪЯВЛЕНО overflows',
    undeclare: (cell) => ({ ...cell, at: 'Ov/undeclared ×1', row: {} }),
  },
  {
    name: 'fields',
    mod: '../../scripts/case-fields.mjs',
    exportName: 'fieldsRow',
    verdictName: 'FIELDS',
    known: [fCell('Fi/known ×1', [fNode()]), 'JIG-2'],
    declared: fCell('Fi/declared ×1', [fNode()], { row: { narrowFields: 'довод' } }),
    declaredHead: 'ОБЪЯВЛЕНО narrowFields',
    undeclare: (cell) => ({ ...cell, at: 'Fi/undeclared ×1', row: {} }),
    triple: fCell('Fi/triple ×1', [fNode(), fNode(), fNode()]),
    tripleMarker: '10/20',
  },
  {
    name: 'targets',
    mod: '../../scripts/case-targets.mjs',
    exportName: 'targetsRow',
    verdictName: 'TARGETS',
    known: [tCell('Ta/known ×1', [tNode()]), 'JIG-3'],
    declared: tCell('Ta/declared ×1', [tNode()], { row: { tinyTargets: 'довод' } }),
    declaredHead: 'ОБЪЯВЛЕНО tinyTargets',
    undeclare: (cell) => ({ ...cell, at: 'Ta/undeclared ×1', row: {} }),
    triple: tCell('Ta/triple ×1', [tNode(), tNode(), tNode()]),
    tripleMarker: '10×10',
  },
]

describe.each(specs)('короткий вывод по умолчанию — строка $name (JIG-30)', (spec) => {
  const run = (cells: Json[], opts: Parameters<typeof runRow>[3] = {}) =>
    runRow(spec.mod, spec.exportName, cells, opts)
  const knownAt = spec.known[0].at as string
  const declaredAt = spec.declared.at as string

  it('1. один вход, full:false и full:true — одинаковые green и verdict', () => {
    const cells = [spec.known[0], spec.declared]
    const known: [string, string][] = [[knownAt, spec.known[1]]]
    const short = run(cells, { known, full: false })
    const full = run(cells, { known, full: true })
    expect(short.green).toBe(full.green)
    expect(short.verdict).toBe(full.verdict)
    // Печать не влияет на вердикт, но обязана и правда отличаться — иначе
    // утверждение 2 ниже проверяло бы копию одного и того же вывода.
    expect(short.body).not.toBe(full.body)
  })

  it('2. короткий: at известной/объявленной ячейки нет, есть строка счёта; полный: at есть', () => {
    const cells = [spec.known[0], spec.declared]
    const known: [string, string][] = [[knownAt, spec.known[1]]]
    const short = run(cells, { known, full: false })
    const full = run(cells, { known, full: true })

    expect(short.body).not.toContain(knownAt)
    expect(short.body).not.toContain(declaredAt)
    expect(short.body).toMatch(/ИЗВЕСТНО 1 в 1 компонентах.*— построчно: флаг --all/)
    expect(short.body).toContain(`${spec.declaredHead} 1 `)
    expect(short.body).toMatch(new RegExp(`${spec.declaredHead} 1 .*— построчно: флаг --all`))

    expect(full.body).toContain(knownAt)
    expect(full.body).toContain(declaredAt)
  })

  it('3а. мутация «снять объявление» — нарушение, green:false, at виден в КОРОТКОМ', () => {
    const undeclared = spec.undeclare(spec.declared)
    const short = run([undeclared], { full: false })
    expect(short.green).toBe(false)
    expect(short.verdict.startsWith(`${spec.verdictName} FAIL`)).toBe(true)
    expect(short.body).toContain(undeclared.at)
  })

  it('3б. мутация «снять строку из known» — нарушение, green:false, at виден в КОРОТКОМ', () => {
    // `known` не передан для адреса известной ячейки — ровно то же, что
    // «строку убрали из карты известных»: она вернулась к общему пути.
    const short = run([spec.known[0]], { full: false })
    expect(short.green).toBe(false)
    expect(short.verdict.startsWith(`${spec.verdictName} FAIL`)).toBe(true)
    expect(short.body).toContain(knownAt)
  })

  it('4. устаревшее исключение и «не измерено» видны в КОРОТКОМ выводе', () => {
    const known: [string, string][] = [['Zz/gone ×1', 'JIG-9']]
    const short = run([], {
      known, full: false,
      unmeasured: [{ at: 'Zz/dark ×1', url: '/frame.html?Zz/dark×1', why: 'кадр не смонтировался' }],
    })
    expect(short.green).toBe(false)
    expect(short.body).toContain('УСТАРЕВШЕЕ ИСКЛЮЧЕНИЕ')
    expect(short.body).toContain('Zz/gone ×1')
    expect(short.body).toContain('НЕ ИЗМЕРЕНО')
    expect(short.body).toContain('Zz/dark ×1')
  })

  if (spec.triple) {
    it('5. три одинаковых узла в одной ячейке — одна строка с ×3 в КОРОТКОМ выводе', () => {
      const short = run([spec.triple!], { full: false })
      const marker = spec.tripleMarker!
      const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Свёрнутая строка узла несёт маркер И суффикс «×3» НА ОДНОЙ строке;
      // несвёрнутый вывод дал бы маркер без «×3» на трёх отдельных строках.
      expect(short.body).toMatch(new RegExp(`${escaped}[^\\n]*  ×3`))
      // Строк узла с этим маркером — ровно одна (заголовок «худшее —» у
      // targets печатает тот же маркер отдельно, но БЕЗ отступа узла — счёт
      // берёт только строки листинга, начинающиеся с отступа `lines()`).
      const nodeLines = short.body.split('\n').filter((l) => l.startsWith('  ') && l.includes(marker))
      expect(nodeLines).toHaveLength(1)
    })
  }
})
