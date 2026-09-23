import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Шкалы кегля, отступов и размеров объектов в `.design-sync/conventions.md`
 * совпадают с `tokens/tokens.css` — поимённо и ЧИСЛОМ (DS-298).
 *
 * `conventions.md` уезжает в заголовок агента Claude Design и отдаётся ему как
 * полный перечень. Перечень держался аккуратностью и отстал дважды и
 * по-разному. Ступень `--ds-fs-2xs` (DS-294) в нём не появилась — агент
 * её просто не знает и наберёт подпись оси `--ds-fs-xs` или литералом, то есть
 * ровно тем, что 294 чинила. Хуже второе: «`--ds-space-1`…`--ds-space-8` (4px
 * step)» при шаге 2px до `space-4` и 4px после. Пропущенная ступень заставляет
 * искать обход; неверное число заставляет СЧИТАТЬ, и `--ds-space-3` выходит
 * 12px вместо 6 — вдвое, без тени сомнения.
 *
 * Поэтому утверждения два по предмету, а не одно. ПОЛНОТА: каждый публичный
 * токен семейства назван в документе, и каждый названный объявлен. ЧИСЛО: у
 * каждого названного стоит «(Npx)» на шкале 1, и оно равно объявленному; а
 * любая фраза «Npx step» рядом с семейством сверяется с настоящими разностями
 * соседних ступеней — шаг, которого нет, краснеет по самой фразе.
 *
 * Внутренние токены — литералом `INTERNAL` с доводом. Решение «потребителю не
 * нужен» и забывчивость снаружи выглядят одинаково: оба — молчание документа.
 * Список делает первое видимым, а гейт требует, чтобы внутренний токен в
 * документе НЕ назывался — иначе одно из двух врёт.
 */
const ROOT = resolve(__dirname, '../..')
const DOC = '.design-sync/conventions.md'
const TOKENS = 'tokens/tokens.css'
const FAMILIES = ['fs', 'space', 'size'] as const

const INTERNAL: Record<string, string> = {
  '--ds-size-caret':
    'шеврон раскрытия рисуют только компоненты (`styles/caret.css`); свой знак раскрытия запрещён гейтом `inline-icons`',
  '--ds-size-caret-sm':
    'тот же шеврон в иконочной рейке свёрнутого `SideNav`; потребитель рейку не собирает',
}

const PX_PER_REM = 16
const doc = readFileSync(join(ROOT, DOC), 'utf8')
const css = readFileSync(join(ROOT, TOKENS), 'utf8')

/** Объявленные токены семейств: имя → px на шкале 1. */
const declared = new Map<string, number>()
const duplicates: string[] = []
for (const m of css.matchAll(/^\s*(--ds-(?:fs|space|size)-[a-z0-9-]+):\s*([^;]+);/gm)) {
  const [, name, value] = m as unknown as [string, string, string]
  const v = value.trim()
  const px = v === '0' ? 0 : Number(/^calc\(([\d.]+)rem \* var\(--ds-ui-scale\)\)$/.exec(v)?.[1]) * PX_PER_REM
  if (declared.has(name)) duplicates.push(name)
  declared.set(name, px)
}

const familyOf = (name: string) => /^--ds-([a-z]+)-/.exec(name)![1]!
const isName = (s: string) => /^--ds-(?:fs|space|size)-[a-z0-9-]+$/.test(s)

/** Названные в документе: имя → число из «(Npx)» сразу за именем или null. */
const named = new Map<string, number | null>()
for (const m of doc.matchAll(/`(--ds-(?:fs|space|size)-[a-z0-9-]+)`(?:\((\d+(?:\.\d+)?)(?:px)?\))?/g)) {
  const [, name, n] = m
  const prev = named.get(name!)
  named.set(name!, n === undefined ? (prev ?? null) : Number(n))
}

describe(`${DOC}: шкалы названы поимённо и числом, как в ${TOKENS}`, () => {
  it('разбор не выродился', () => {
    // Сломанный регэксп дал бы пустые карты, и сверка «всё названное совпало»
    // была бы зелёной на пустоте.
    for (const f of FAMILIES) {
      expect([...declared.keys()].filter((n) => familyOf(n) === f).length, `объявлено --ds-${f}-*`).toBeGreaterThan(3)
    }
    expect([...declared.values()].filter((v) => !Number.isFinite(v)), 'значения, не разобранные в px').toEqual([])
    expect(duplicates, 'токен объявлен дважды — какое число сверять, неизвестно').toEqual([])
    expect(named.size, `названо в ${DOC}`).toBeGreaterThan(10)
  })

  it('каждый публичный токен назван', () => {
    expect(
      [...declared.keys()].filter((n) => !(n in INTERNAL) && !named.has(n)),
      `не назван в ${DOC}: агент Claude Design ступени не знает и наберёт соседнюю или литерал`,
    ).toEqual([])
  })

  it('каждый названный объявлен, внутренний не назван', () => {
    expect([...named.keys()].filter((n) => !declared.has(n)), `назван в ${DOC}, но в ${TOKENS} нет`).toEqual([])
    expect([...named.keys()].filter((n) => n in INTERNAL), 'назван, хотя объявлен внутренним: одно из двух врёт').toEqual([])
    expect(Object.keys(INTERNAL).filter((n) => !declared.has(n) || !isName(n)), 'исключение протухло').toEqual([])
  })

  it('число у каждого названного есть и равно объявленному', () => {
    const bad = [...named].flatMap(([name, n]) =>
      !declared.has(name) ? []
        : n === null ? [`${name}: без «(Npx)» — ступень названа, а величину читатель посчитает сам`]
        : n !== declared.get(name) ? [`${name}: в документе ${n}px, объявлено ${declared.get(name)}px`]
        : [])
    expect(bad).toEqual([])
  })

  it('фраза «Npx step» у семейства равна настоящему шагу', () => {
    const bad: string[] = []
    for (const line of doc.split('\n')) {
      for (const f of FAMILIES) {
        if (!line.includes(`--ds-${f}-`)) continue
        const steps = [...declared]
          .filter(([n]) => familyOf(n) === f && /-\d+$/.test(n))
          .sort(([a], [b]) => Number(/(\d+)$/.exec(a)![1]) - Number(/(\d+)$/.exec(b)![1]))
          .map(([, px]) => px)
        const diffs = new Set(steps.slice(1).map((px, i) => px - steps[i]!))
        for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*px step/g)) {
          if (diffs.size !== 1 || !diffs.has(Number(m[1]))) {
            bad.push(`«${m[0]}» у --ds-${f}-*: настоящие шаги ${[...diffs].join(', ')}px`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })
})
