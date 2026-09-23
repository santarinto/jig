/**
 * Сенсорная ось матрицы (`scripts/touch-surface.mjs`, DS-336) — её чистые
 * половины: площадь с диска, сверка площади с CSSOM и вердикт «ветка что-то
 * поменяла». Браузер нужен, чтобы СНЯТЬ правила и отпечатки; решить, что из
 * них нарушение, можно без него, и именно здесь ошибка дала бы правдоподобный
 * зелёный — ось, обошедшая ячейки и не увидевшая в них ничего.
 *
 * Дерево — в памяти (`read` из словаря), а не во временном каталоге: разбору
 * нужен текст, а не файловая система.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  TOUCH_MEDIA, TOUCH_SAME, touchSurface, crossCheckSurface, touchVerdict, pointerWhy,
} from '../../scripts/touch-surface.mjs'

const ROOT = resolve(__dirname, '../..')

const tree = (files: Record<string, string>) => (abs: string) => {
  const rel = abs.slice('/r/'.length)
  if (!(rel in files)) throw new Error(`нет файла ${rel}`)
  return files[rel]!
}

describe('touchSurface: площадь с диска', () => {
  const files = {
    'src/styles.css': [
      '@import "../tokens/tokens.css";',
      '@import "./styles/shared.css";',
      '@import url("./components/A/A.css");',
      "@import './components/B/B.css';",
      '@import "./components/C/C.css";',
    ].join('\n'),
    'tokens/tokens.css': ':root { --x: 1 }',
    'src/styles/shared.css': '.s { }\n@media (pointer: coarse) { .s { padding: 4px } }',
    'src/components/A/A.css': '.a { }\n\n@media (hover: none) {\n  .a { opacity: 1 }\n}',
    'src/components/B/B.css': '.b { }\n@media(any-pointer:coarse){ .b { min-height: 44px } }',
    // Ветка в комментарии — не ветка; и медиа по ширине — не сенсорная.
    'src/components/C/C.css': '/* @media (hover: none) { .c { } } */\n@media (max-width: 40em) { .c { } }',
    // Лист, до которого `@import` не доходит, в площадь не попадает.
    'src/components/D/D.css': '@media (hover: none) { .d { } }',
  }
  const got = touchSurface({ root: '/r', entry: 'src/styles.css', read: tree(files) })

  it('компоненты — по пути листа, обе записи @import, без пробела после двоеточия', () => {
    expect([...got.byComponent.keys()].sort()).toEqual(['A', 'B'])
  })
  it('находка называет файл, строку и прелюдию', () => {
    expect(got.byComponent.get('A')!.hits).toEqual(['src/components/A/A.css:3 @media (hover: none)'])
    expect(got.byComponent.get('A')!.files).toEqual([join('/r', 'src/components/A/A.css')])
  })
  it('ветка общего листа не приписывается никому — отдельным списком', () => {
    expect(got.unattributed).toEqual(['src/styles/shared.css:2 @media (pointer: coarse)'])
  })
  it('комментарий и медиа по ширине — не ветка; недостижимый лист не читается', () => {
    expect(got.byComponent.has('C')).toBe(false)
    expect(got.byComponent.has('D')).toBe(false)
    expect(got.sheets).toBe(6)
  })
})

describe('touchSurface на живом дереве', () => {
  const live = touchSurface({ root: ROOT, entry: 'src/styles.css', read: (f: string) => readFileSync(f, 'utf8') })

  it('разбор видит настоящие ветки: BarChart и FormTabs в площади, общих листов с веткой нет', () => {
    // НЕ равенство: новый компонент с веткой попадает в обход сам, и этот тест
    // не обязан о нём знать. Он держит другое — что разбор вообще читает
    // настоящее дерево: регулярка, сломанная в ноль, дала бы площадь пустой, а
    // ось — зелёной без единой сенсорной ячейки. Потерю компонента ПОСЛЕ этого
    // держит сверка с CSSOM страницы в самом обходе (`crossCheckSurface`).
    const found = [...live.byComponent.keys()]
    expect(found).toEqual(expect.arrayContaining(['BarChart', 'FormTabs']))
    expect(live.unattributed).toEqual([])
    expect(live.sheets).toBeGreaterThan(60)
  })
  it('объявленные в TOUCH_SAME — все в площади (иначе довод ни о чём)', () => {
    for (const c of TOUCH_SAME.keys()) expect(live.byComponent.has(c), c).toBe(true)
  })
})

describe('crossCheckSurface: диск против CSSOM', () => {
  const sheets = new Map([
    ['FormTabs', '.ds-formtabs__close { }\n@media (hover: none) { .ds-formtabs__close { opacity: 1 } }'],
    ['BarChart', '@media (hover: none) { .ds-bar__plot:hover .ds-bar__rect { opacity: 1 } }'],
  ])
  it('каждое правило при хозяине, каждый хозяин при правиле — чисто', () => {
    expect(crossCheckSurface([
      { media: '(hover: none)', selector: '.ds-formtabs__close' },
      { media: '(hover: none)', selector: '.ds-bar__plot:hover .ds-bar__rect' },
    ], sheets)).toEqual([])
  })
  it('правило, чьего компонента в площади нет, — названо (компонент выпал из площади)', () => {
    const out = crossCheckSurface([
      { media: '(hover: none)', selector: '.ds-formtabs__close' },
      { media: '(hover: none)', selector: '.ds-bar__plot:hover .ds-bar__rect' },
      { media: '(pointer: coarse)', selector: '.ds-slider__thumb' },
    ], sheets)
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('.ds-slider__thumb')
  })
  it('компонент площади без единого правила в странице — назван', () => {
    const out = crossCheckSurface([{ media: '(hover: none)', selector: '.ds-formtabs__close' }], sheets)
    expect(out).toEqual([expect.stringMatching(/^BarChart: на диске ветка есть/)])
  })
  it('класс — целым словом: .ds-bar не владеет .ds-bar__rect', () => {
    const out = crossCheckSurface([{ media: '(hover: none)', selector: '.ds-bar' }], new Map([['X', '.ds-bar__rect { }']]))
    expect(out.some((l) => l.includes('.ds-bar }'))).toBe(true)
  })
})

describe('touchVerdict: ветка обязана была что-то поменять', () => {
  const pair = (c: string, mouse?: string, touch?: string) => ({ c, mouse, touch })
  const prints = (...p: ReturnType<typeof pair>[]) => new Map(p.map((x, i) => [`${x.c}/k${i} ×1`, x]))

  it('разошлась хоть одна пара — зелёный со счётом', () => {
    const v = touchVerdict({ surface: ['F'], prints: prints(pair('F', 'a', 'a'), pair('F', 'a', 'b')), same: new Map() })
    expect(v.bad).toEqual([])
    expect(v.lines).toEqual(['F: 1 из 2 пар (случай × шкала) отличаются от мыши'])
  })
  it('ни одна не разошлась — красный: ось зелёная на пустом множестве', () => {
    const v = touchVerdict({ surface: ['F'], prints: prints(pair('F', 'a', 'a')), same: new Map() })
    expect(v.bad).toEqual([expect.stringContaining('ось зелёная на пустом множестве')])
  })
  it('ни одной сравненной пары — тоже красный, отсутствие данных не равно «разницы нет»', () => {
    const v = touchVerdict({ surface: ['F'], prints: prints(pair('F', 'a', undefined)), same: new Map() })
    expect(v.bad).toEqual([expect.stringContaining('0 из 0 пар')])
    expect(v.bad[0]).toContain('не сравнено 1')
  })
  it('объявленный «кадр тот же» без разницы — зелёный с доводом', () => {
    const v = touchVerdict({ surface: ['B'], prints: prints(pair('B', 'a', 'a')), same: new Map([['B', 'довод']]) })
    expect(v.bad).toEqual([])
    expect(v.lines).toEqual([expect.stringContaining('объявлено: довод')])
  })
  it('объявленный, а разница есть — довод протух, красный', () => {
    const v = touchVerdict({ surface: ['B'], prints: prints(pair('B', 'a', 'b')), same: new Map([['B', 'довод']]) })
    expect(v.bad).toEqual([expect.stringContaining('протух')])
  })
  it('объявленный без сравненных пар — не проверено, красный', () => {
    const v = touchVerdict({ surface: ['B'], prints: new Map(), same: new Map([['B', 'довод']]) })
    expect(v.bad).toEqual([expect.stringContaining('объявление не проверено')])
  })
  it('объявление на компоненте вне площади — красное', () => {
    const v = touchVerdict({ surface: [], prints: new Map(), same: new Map([['Z', 'довод']]) })
    expect(v.bad).toEqual([expect.stringContaining('Z: объявлен')])
  })
})

describe('pointerWhy и TOUCH_MEDIA', () => {
  it('касание обязано видеть оба признака, мышь — ни одного', () => {
    expect(pointerWhy({ hoverNone: true, coarse: true }, 'touch')).toBeNull()
    expect(pointerWhy({ hoverNone: false, coarse: false }, 'mouse')).toBeNull()
    expect(pointerWhy({ hoverNone: false, coarse: false }, 'touch')).toContain('не доехала')
    expect(pointerWhy({ hoverNone: true, coarse: false }, 'touch')).toContain('не доехала')
    expect(pointerWhy({ hoverNone: true, coarse: true }, 'mouse')).toContain('не доехала')
  })
  it('регулярка берёт запись браузера и запись без пробела, но не ширину', () => {
    for (const m of ['(hover: none)', '(hover:none)', '(pointer: coarse)', '(any-pointer: fine)', '(any-hover: hover)']) {
      expect(TOUCH_MEDIA.test(m), m).toBe(true)
    }
    expect(TOUCH_MEDIA.test('(max-width: 40em)')).toBe(false)
    expect(TOUCH_MEDIA.test('(prefers-reduced-motion: reduce)')).toBe(false)
  })
})
