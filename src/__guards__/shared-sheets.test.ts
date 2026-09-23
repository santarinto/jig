import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * Общие листы стилей (`src/styles/*.css`) — то, что до 1.42.0 стояло копиями в
 * компонентных файлах: поверхность поля в восьми листах и легенда графика в
 * двух. Копии успели разъехаться: у `Select`, `SearchBar` и `Combobox` не было
 * правил `:disabled` вовсе, а `.ds-select:hover` был написан без
 * `:not(:disabled)` — выключенный селект подсвечивал рамку под курсором.
 *
 * Здесь три утверждения, и главное из них — второе, оно не про дубли.
 *
 * 1. Список покрывает всю семью (счётчик). Выпавший из общего листа элемент
 *    просто останется без поверхности, и заметит это только глаз.
 *
 * 2. Ни один компонентный лист не объявляет свойство, которое общий лист уже
 *    объявил для того же селектора. Это условие, при котором общий лист вообще
 *    безопасен: у потребителя со сборщиком порядок CSS задаётся порядком
 *    импортов в JS, а не порядком `@import` в `styles.css`, поэтому общая
 *    строка и локальная строка одного веса — гонка, а не «побеждает локальная».
 *
 * 3. Компонент, который ставит класс из общего листа, импортирует лист сам.
 *    Иначе стиль приедет только тем, кто грузит `styles.css` целиком, а тот,
 *    кто импортирует один компонент, получит голый элемент. Так и было найдено
 *    (гейтом, а не глазом): `DatePicker` и `GlobalSearch` рисовали `.ds-input`,
 *    не подключая ни одного листа, где он объявлен.
 */
const SRC = resolve(__dirname, '..')
const SHARED_DIR = join(SRC, 'styles')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ')

/** Правила как [список селекторов, набор свойств]. */
function rules(css: string): { selectors: string[]; props: Set<string> }[] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean),
    props: new Set(
      m[2]!.split(';').map((d) => d.split(':')[0]?.trim() ?? '').filter(Boolean),
    ),
  }))
}

function walk(dir: string, ext: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p, ext))
    // Обход — про ПОСТАВЛЯЕМЫЙ исходник. Тесты исключались с самого начала;
    // фикстуры (DS-127) исключены по той же причине и по той же границе,
    // что стережёт `fixtures-not-shipped`: в `dist/` их нет, потребителю они не
    // приезжают, и лист им подключает компонент, который они импортируют.
    // Без этого гейт заявлял «TextField.fixture.tsx ставит ds-input» про файл,
    // где имя класса стоит в комментарии и не ставится нигде.
    else if (
      entry.name.endsWith(ext)
      && !entry.name.includes('.test.')
      && !entry.name.includes('.fixture.')
    ) out.push(p)
  }
  return out
}

const sharedSheets = () => readdirSync(SHARED_DIR).filter((f) => f.endsWith('.css')).map((f) => join(SHARED_DIR, f))

/** Свойства, объявленные общими листами, по каждому селектору. */
function sharedMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const sheet of sharedSheets()) {
    for (const { selectors, props } of rules(readFileSync(sheet, 'utf8'))) {
      for (const sel of selectors) {
        const bucket = map.get(sel) ?? new Set<string>()
        for (const p of props) bucket.add(p)
        map.set(sel, bucket)
      }
    }
  }
  return map
}

/** Семья листа — селекторы его первого правила, как написаны. */
function family(sheet: string): string[] {
  return rules(readFileSync(sheet, 'utf8'))[0]!.selectors
}

/**
 * Имена классов семьи, без состояний. Именно `match`, а не `slice(1)`:
 * `.ds-tabs__tab[aria-disabled='true']` после slice даёт строку, которая в
 * регулярном выражении становится символьным классом и матчит что попало.
 */
function baseClasses(sheet: string): string[] {
  return [...new Set(family(sheet).map((s) => s.match(/^\.([a-z0-9_-]+)/)?.[1]).filter(Boolean) as string[])]
}

/**
 * Все базовые классы листа — по всем правилам, а не только по первому. У
 * `field-frame.css` каждое правило имеет свой селектор (`field-surface.css`,
 * напротив, держит семью списком в первом правиле), поэтому `family()` там не
 * пригоден.
 */
function allBaseClasses(sheet: string): string[] {
  return [...new Set(
    rules(readFileSync(sheet, 'utf8'))
      .flatMap((r) => r.selectors)
      .map((s) => s.match(/^\.([a-z0-9_-]+)/)?.[1])
      .filter(Boolean) as string[],
  )].sort()
}

describe('общие листы стилей', () => {
  it('поверхность поля покрывает всю семью — восемь элементов', () => {
    expect(family(join(SHARED_DIR, 'field-surface.css')).sort()).toEqual([
      '.ds-code__cell',
      '.ds-combobox__trigger',
      '.ds-input',
      '.ds-numfield__control',
      '.ds-pager__select',
      '.ds-searchbar__input',
      '.ds-select',
      '.ds-textarea',
    ])
  })

  it('каркас поля — обёртка `.ds-field*` и геометрия `.ds-input`', () => {
    expect(allBaseClasses(join(SHARED_DIR, 'field-frame.css'))).toEqual([
      'ds-field',
      'ds-field--block',
      'ds-field--inline',
      'ds-field__error',
      'ds-field__hint',
      'ds-field__label',
      'ds-input',
      'ds-input--sm',
    ])
  })

  it('легенда покрывает оба графика и календарь', () => {
    expect(family(join(SHARED_DIR, 'chart-legend.css')).sort()).toEqual([
      '.ds-bar__legend',
      '.ds-chart__legend',
      '.ds-eventcal__legend',
    ])
  })

  it('вид выключенного элемента полосы покрывает все четыре компонента с roving-навигацией', () => {
    expect(family(join(SHARED_DIR, 'disabled-item.css')).sort()).toEqual([
      ".ds-formtabs__label[aria-disabled='true']",
      ".ds-sections__item[aria-disabled='true']",
      ".ds-tabs__tab[aria-disabled='true']",
      ".ds-togglegroup__item[aria-disabled='true']",
    ])
  })

  it('поверхность кнопки-на-фоне покрывает всю семью — четыре элемента', () => {
    expect(family(join(SHARED_DIR, 'button-surface.css')).sort()).toEqual([
      '.ds-codeblock__copy',
      '.ds-pager__btn',
      '.ds-searchbar__go',
      '.ds-theme-toggle',
    ])
  })

  it('ни один компонентный лист не объявляет то же свойство для того же селектора', () => {
    const shared = sharedMap()
    const files = walk(join(SRC, 'components'), '.css')
    const offenders: string[] = []
    for (const f of files) {
      for (const { selectors, props } of rules(readFileSync(f, 'utf8'))) {
        for (const sel of selectors) {
          const owned = shared.get(sel)
          if (!owned) continue
          const clash = [...props].filter((p) => owned.has(p))
          if (clash.length) {
            offenders.push(`${relative(SRC, f)}: ${sel} — ${clash.join(', ')} уже объявлены в общем листе`)
          }
        }
      }
    }
    // Счётчики рядом с «нарушений нет»: и пустой обход, и пустая карта общих
    // листов дают ровно такой же зелёный результат.
    expect(files.length, 'обход CSS компонентов пуст').toBeGreaterThan(40)
    expect(shared.size, 'карта общих листов пуста — сверять было не с чем').toBeGreaterThan(20)
    expect(offenders, `гонка порядка загрузки:\n${offenders.join('\n')}`).toEqual([])
  })

  it('компонент, ставящий класс из общего листа, импортирует этот лист', () => {
    const owners = sharedSheets().map((sheet) => ({
      sheet,
      // Только базовые классы: состояния (`:hover`, `.is-error`) висят на них же.
      classes: baseClasses(sheet),
    }))
    const offenders: string[] = []
    let painters = 0
    for (const f of walk(join(SRC, 'components'), '.tsx')) {
      const source = readFileSync(f, 'utf8')
      for (const { sheet, classes } of owners) {
        // Граница `(?![-a-z_])` отсекает модификатор: `ds-input--sm` — не `ds-input`.
        const uses = classes.filter((c) => new RegExp(`(?<![-a-z])${c}(?![-a-z_])`).test(source))
        if (!uses.length) continue
        painters++
        if (!source.includes(`styles/${relative(SHARED_DIR, sheet)}`)) {
          offenders.push(`${relative(SRC, f)}: ставит ${uses.join(', ')}, но не импортирует ${relative(SRC, sheet)}`)
        }
      }
    }
    expect(painters, 'ни один компонент не ставит классы общих листов — обход пуст').toBeGreaterThan(7)
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('каждый общий лист подключён и в styles.css — путь потребителя без сборщика', () => {
    const entry = readFileSync(join(SRC, 'styles.css'), 'utf8')
    const missing = sharedSheets()
      .map((s) => `./styles/${relative(SHARED_DIR, s)}`)
      .filter((spec) => !entry.includes(spec))
    expect(sharedSheets().length, 'общих листов нет вовсе — проверять нечего').toBeGreaterThan(1)
    expect(missing, `не подключены в styles.css: ${missing.join(', ')}`).toEqual([])
  })

  it('ни один график не рисует легенду сам', () => {
    // Разметка легенды одна на два графика (`src/internal/ChartLegend.tsx`), и
    // утверждение «обе легенды одинаковы» после этого неопровержимо по
    // построению — случай №3 из CLAUDE.md. Падать может другое: что копия
    // вернулась в компонент.
    const offenders: string[] = []
    for (const name of ['LineChart/LineChart.tsx', 'BarChart/BarChart.tsx']) {
      const source = readFileSync(join(SRC, 'components', name), 'utf8')
      const own = [...source.matchAll(/['"`](ds-(?:chart|bar)__(?:legend|chip|chip-dot))/g)].map((m) => m[1]!)
      if (own.length) offenders.push(`${name}: рисует легенду сам — ${[...new Set(own)].join(', ')}`)
      if (!source.includes('ChartLegend')) offenders.push(`${name}: не использует общую ChartLegend`)
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
