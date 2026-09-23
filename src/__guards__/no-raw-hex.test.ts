import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

function collect(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collect(p, exts))
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(p)
  }
  return out
}

/**
 * Комментарии вырезаются: предмет гейта — ЗНАЧЕНИЕ, а не текст. Хекс в
 * `/* ... *\/` не применяется ни в одной теме, и запрет на него запрещал бы
 * ровно то, ради чего комментарий пишут, — назвать замеренный цвет числом.
 * Строковые литералы не трогаем: в `.tsx` они как раз и есть значения.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Единственное место, где литеральный цвет — ПРЕДМЕТ, а не решение о стиле:
 * значение, приезжающее из базы потребителя в `--ds-badge-brand` (DS-81).
 *
 * Токеном оно быть не может по определению — система этого цвета не знает, — а
 * заменить его в примере на `var(--ds-chart-3)` значило бы проверять курируемый
 * цвет вместо произвольного, то есть спрятать ровно ту поломку, ради которой
 * пример существует: почти белый тег без подложки и почти чёрный без читаемой
 * метки на тёмной теме.
 *
 * Разрешение выдано ФАЙЛАМ, а не позициям в них: примерять его к каждому
 * синтаксическому месту (`brand=`, `brand:`, ожидание в тесте, элемент массива
 * образцов) пришлось бы дописывать при каждой новой форме записи, и первая же
 * недописанная читалась бы как запрет. Список из двух имён правится руками и
 * виден в диффе; два утверждения ниже держат его живым и коротким.
 *
 * Только `.tsx`: в `.css` этих же папок хекс потребителя не появляется — цвет
 * туда приезжает переменной.
 */
const CONSUMER_FILES = ['Badge/Badge.fixture.tsx', 'Badge/Badge.test.tsx']

// tokens/tokens.css is the single place a literal colour may appear; everything
// else — stylesheets and inline styles in components alike — goes through --ds-*,
// otherwise the dark theme silently misses it.
function offendersIn(exts: string[]): string[] {
  const dirs = [resolve(__dirname, '../components'), resolve(__dirname, '../examples')]
  const files = dirs.flatMap((d) => { try { return collect(d, exts) } catch { return [] } })
  const offenders: string[] = []
  for (const f of files) {
    if (exts.includes('.tsx') && CONSUMER_FILES.some((c) => f.endsWith(c))) continue
    const matches = stripComments(readFileSync(f, 'utf8')).match(/#[0-9a-fA-F]{3,8}\b/g)
    if (matches) offenders.push(`${f}: ${matches.join(', ')}`)
  }
  return offenders
}

describe('token discipline', () => {
  it('has no raw hex colors in component/example CSS (use --ds-* tokens)', () => {
    expect(offendersIn(['.css'])).toEqual([])
  })

  it('has no raw hex colors in component/example TSX (use var(--ds-*) inline too)', () => {
    expect(offendersIn(['.tsx'])).toEqual([])
  })

  /**
   * Исключение обязано оставаться живым и коротким. Мёртвое — файл переехал,
   * пример переписан — выглядит как действующее разрешение и тихо накрывает то,
   * ради чего его не выдавали. Длинное перестаёт быть исключением.
   */
  it('keeps the consumer-colour exception alive and short', () => {
    expect(CONSUMER_FILES).toEqual(['Badge/Badge.fixture.tsx', 'Badge/Badge.test.tsx'])
    for (const rel of CONSUMER_FILES) {
      const f = resolve(__dirname, '../components', rel)
      expect(existsSync(f), `${rel} из списка исключений не существует`).toBe(true)
      const src = readFileSync(f, 'utf8')
      expect(src, `${rel} в списке исключений, но цвета потребителя в нём нет`)
        .toMatch(/brand[=:]\s*['"]?#[0-9a-fA-F]{3,8}/)
    }
  })
})
