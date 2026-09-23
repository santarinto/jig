/**
 * Ось ширины матрицы (`scripts/width-surface.mjs`, DS-347) — её чистые
 * половины: площадь с диска, вердикт «ветка что-то поменяла» и то, что условие
 * узнаётся во всех четырёх записях `@container`. Браузер нужен, чтобы СНЯТЬ
 * правила и отпечатки; решить, что из них нарушение, можно без него, и именно
 * здесь ошибка дала бы правдоподобный зелёный — ось, обошедшая ячейки и не
 * увидевшая в них ничего.
 *
 * Общая механика (сам обход площади, сверка с CSSOM) — у сенсорной оси
 * (`touch-surface.test.ts`), и переписывать её здесь незачем: модуль один
 * (`scripts/axis-surface.mjs`). Здесь — ровно то, что про ШИРИНУ.
 *
 * Дерево — в памяти (`read` из словаря), а не во временном каталоге: разбору
 * нужен текст, а не файловая система.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  WIDTH_COND, WIDTH_SAME, WIDTH_FLOOR, WIDTH_SECOND, WIDTH_AXIS, widthSurface, widthVerdict,
} from '../../scripts/width-surface.mjs'

const ROOT = resolve(__dirname, '../..')

const tree = (files: Record<string, string>) => (abs: string) => {
  const rel = abs.slice('/r/'.length)
  if (!(rel in files)) throw new Error(`нет файла ${rel}`)
  return files[rel]!
}

describe('WIDTH_COND: какие записи @container считаются про ширину', () => {
  it('узнаёт все четыре формы, включая диапазон и inline-size', () => {
    for (const cond of [
      '(max-width: 28.4em)', '(min-width:31em)', '(width > 30em)', '(inline-size > 30em)',
      'card (max-width: 40rem)',
    ]) expect(WIDTH_COND.test(cond), cond).toBe(true)
  })

  it('запрос по ВЫСОТЕ веткой ширины не считает — вторая ширина его не переключает', () => {
    for (const cond of ['(max-height: 20em)', '(min-height:10em)', '(orientation: portrait)']) {
      expect(WIDTH_COND.test(cond), cond).toBe(false)
    }
  })

  it('описание оси для страницы — данные, а не обёртка: её нельзя сериализовать', () => {
    // Обёртка вокруг общей функции уезжает в `page.evaluate` без своего импорта
    // и падает там `ReferenceError` — в живом прогоне, при зелёных юнитах.
    expect(WIDTH_AXIS).toEqual({ src: WIDTH_COND.source, kind: 'CSSContainerRule' })
  })
})

describe('widthSurface: площадь с диска', () => {
  const files = {
    'src/styles.css': [
      '@import "./components/A/A.css";',
      '@import "./components/B/B.css";',
      '@import "./styles/shared.css";',
    ].join('\n'),
    'src/components/A/A.css': '.a { color: red }\n@container (max-width: 20em) { .a { display: block } }',
    'src/components/B/B.css': '@container (max-height: 20em) { .b { display: block } }',
    'src/styles/shared.css': '@container (min-width: 10em) { .s { gap: 0 } }',
  }
  const surface = widthSurface({ root: '/r', entry: 'src/styles.css', read: tree(files) })

  it('компонент с веткой ширины — в площади, компонент с веткой высоты — нет', () => {
    expect([...surface.byComponent.keys()]).toEqual(['A'])
  })

  it('ветка ширины в ОБЩЕМ листе никому не приписана — ходок краснеет на ней до обхода', () => {
    expect(surface.unattributed).toHaveLength(1)
    expect(surface.unattributed[0]).toContain('src/styles/shared.css')
  })

  it('находка несёт файл, строку и саму прелюдию', () => {
    expect(surface.byComponent.get('A')!.hits).toEqual(['src/components/A/A.css:2 @container (max-width: 20em)'])
  })

  it('@container внутри КОММЕНТАРИЯ площадью не считается', () => {
    const only = widthSurface({
      root: '/r',
      entry: 'src/styles.css',
      read: tree({
        'src/styles.css': '@import "./components/C/C.css";',
        'src/components/C/C.css': '/* про @container (max-width: 20em) сказано ниже */\n.c { color: red }',
      }),
    })
    expect([...only.byComponent.keys()]).toEqual([])
  })
})

describe('widthSurface на живом дереве', () => {
  const surface = widthSurface({
    root: ROOT,
    entry: 'src/styles.css',
    read: (f: string) => readFileSync(f, 'utf8'),
  })

  it('площадь непуста и приписана вся — иначе ось судила бы не пойми что', () => {
    expect(surface.unattributed).toEqual([])
    expect(surface.byComponent.size).toBeGreaterThan(0)
  })

  it('каждый файл площади действительно лежит на диске и несёт @container', () => {
    for (const [c, { files }] of surface.byComponent) {
      for (const f of files) {
        expect(readFileSync(f, 'utf8'), `${c}: ${f}`).toContain('@container')
      }
    }
  })

  it('объявленные «кадр тот же» — только компоненты площади', () => {
    for (const c of WIDTH_SAME.keys()) expect([...surface.byComponent.keys()]).toContain(c)
  })

  it('вторая ширина оси шире первой (пола): одинаковые ширины сравнивали бы кадр с собой', () => {
    expect(WIDTH_SECOND).toBeGreaterThan(WIDTH_FLOOR)
  })
})

describe('WIDTH_FLOOR: базовый вьюпорт матрицы и CLAUDE.md согласны об одном числе', () => {
  const CASE_MATRIX = resolve(ROOT, 'scripts/case-matrix.mjs')
  const CLAUDE_MD = resolve(ROOT, 'CLAUDE.md')

  // Дыра, которую закрывает эта форма: старая проверка искала ПЕРВУЮ строку
  // с `const VIEWPORT =` для запрета литерала, а форму — по ВСЕМУ файлу.
  // Закомментированный образец правильной формы выше настоящего литерала
  // делал их зелёными одновременно: образец удовлетворял `toMatch` по всему
  // файлу, а `find` находил именно его и мимо реального `const VIEWPORT =
  // { width: 360, … }` ниже. Здесь строка одна — и форма, и запрет литерала
  // проверяются на НЕЙ ЖЕ.
  it('базовый вьюпорт матрицы приходит из WIDTH_FLOOR, а не своим литералом', () => {
    const src = readFileSync(CASE_MATRIX, 'utf8')
    const lines = src.split('\n').filter((l) => l.includes('const VIEWPORT ='))
    expect(lines, `базовый вьюпорт матрицы обязан приходить из WIDTH_FLOOR — найдено строк «const VIEWPORT =»: ${lines.length}`).toHaveLength(1)
    const [line] = lines
    expect(line, 'базовый вьюпорт матрицы обязан приходить из WIDTH_FLOOR').toMatch(
      /const VIEWPORT = \{ width: WIDTH_FLOOR,/,
    )
    expect(line, 'базовый вьюпорт матрицы обязан приходить из WIDTH_FLOOR').not.toMatch(
      /const VIEWPORT = \{ width: \d/,
    )
  })

  it('CLAUDE.md объявляет тот же пол, что и WIDTH_FLOOR', () => {
    const md = readFileSync(CLAUDE_MD, 'utf8')
    const m = md.match(/пол поддерживаемой ширины — (\d+) CSS-px/)
    expect(m, 'в CLAUDE.md нет объявления пола').not.toBeNull()
    const declared = Number(m![1])
    expect(declared, `CLAUDE.md называет пол ${declared}, WIDTH_FLOOR — ${WIDTH_FLOOR}`).toBe(WIDTH_FLOOR)
  })
})

describe('widthVerdict: ветка обязана была что-то поменять между полом (440) и 768', () => {
  const pair = (c: string, wFloor?: string, wSecond?: string) => ({ c, wFloor, wSecond })
  const prints = (...ps: ReturnType<typeof pair>[]) =>
    new Map(ps.map((p, i) => [`${p.c}/case ×${i}`, p]))
  const go = (o: { surface: string[]; prints: Map<string, unknown>; same: Map<string, string> }) => widthVerdict(o)

  it(`разошлась хоть одна пара — зелёный со счётом от кадра ${WIDTH_FLOOR}`, () => {
    const v = go({ surface: ['F'], prints: prints(pair('F', 'a', 'b'), pair('F', 'a', 'a')), same: new Map() })
    expect(v.bad).toEqual([])
    expect(v.lines).toEqual([`F: 1 из 2 пар (случай × шкала) отличаются от кадра ${WIDTH_FLOOR}`])
  })

  it('ни одна не разошлась — красный: ось зелёная на пустом множестве', () => {
    const v = go({ surface: ['F'], prints: prints(pair('F', 'a', 'a')), same: new Map() })
    expect(v.bad).toHaveLength(1)
    expect(v.bad[0]).toContain('ветка ширины в кадре ничего не поменяла')
  })

  it('объявление «кадр тот же» снимает красное — и протухает, когда пара разошлась', () => {
    const same = new Map([['F', 'порог 60em лежит выше обеих ширин оси']])
    expect(go({ surface: ['F'], prints: prints(pair('F', 'a', 'a')), same }).bad).toEqual([])
    const stale = go({ surface: ['F'], prints: prints(pair('F', 'a', 'b')), same })
    expect(stale.bad[0]).toContain('протух')
  })

  it('не сравнена ни одна пара — красное, а не «разницы нет»', () => {
    const v = go({ surface: ['F'], prints: prints(pair('F', 'a', undefined)), same: new Map() })
    expect(v.bad).toHaveLength(1)
  })

  it('объявление на компоненте вне площади — красное: довод ни о чём', () => {
    const v = go({ surface: [], prints: new Map(), same: new Map([['X', 'довод']]) })
    expect(v.bad[0]).toContain('ветки у него на диске нет')
  })
})
