import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  rewriteSelector,
  scanSheets,
  installForce,
  resetForceCache,
  FORCE_ATTR,
  FORCE_STYLE_ID,
  forceAttrValue,
  type RuleLike,
  type SelectorRewrite,
} from './force-states.js'

/** Переписанный селектор — или провал теста с внятным словом вместо `undefined`. */
function rewritten(r: SelectorRewrite): string {
  if (r.kind !== 'rewritten') throw new Error(`ожидалось переписывание, получено ${r.kind}`)
  return r.selector
}

/**
 * Грубый счётчик специфичности — ровно на тех формах, что встречаются в этом
 * файле: классы, атрибуты, псевдоклассы и типы. Не общий разборщик CSS и не
 * претендует: он существует ради ОДНОГО утверждения — дубликат весит столько
 * же, сколько оригинал. Если весит иначе, спор решает не порядок вставки,
 * а вес, и весь механизм форса держится на случайности.
 */
function specificity(sel: string): [number, number, number] {
  let ids = 0
  let mid = 0
  let types = 0
  let i = 0
  while (i < sel.length) {
    const ch = sel[i]!
    if (ch === '#') {
      ids++
      i++
      while (i < sel.length && /[\w-]/.test(sel[i]!)) i++
      continue
    }
    if (ch === '.') {
      mid++
      i++
      while (i < sel.length && /[\w-]/.test(sel[i]!)) i++
      continue
    }
    if (ch === '[') {
      mid++
      while (i < sel.length && sel[i] !== ']') i++
      i++
      continue
    }
    if (ch === ':') {
      if (sel[i + 1] === ':') {
        types++
        i += 2
        while (i < sel.length && /[\w-]/.test(sel[i]!)) i++
        continue
      }
      i++
      let name = ''
      while (i < sel.length && /[\w-]/.test(sel[i]!)) name += sel[i++]!
      // `:not(…)`/`:is(…)` сами не весят — весит самый тяжёлый аргумент.
      // Внутри наших форм аргумент всегда один псевдокласс, поэтому считаем
      // его как единицу и пропускаем скобки целиком.
      if (sel[i] === '(') {
        let depth = 0
        do {
          if (sel[i] === '(') depth++
          else if (sel[i] === ')') depth--
          i++
        } while (i < sel.length && depth > 0)
        mid++
        continue
      }
      if (name) mid++
      continue
    }
    if (/[a-zA-Z]/.test(ch)) {
      types++
      while (i < sel.length && /[\w-]/.test(sel[i]!)) i++
      continue
    }
    i++
  }
  return [ids, mid, types]
}

describe('rewriteSelector', () => {
  it('даёт две формы: атрибут на самом элементе и атрибут на предке', () => {
    const out = rewritten(rewriteSelector('.ds-btn:hover'))
    expect(out.split(', ')).toEqual([
      `.ds-btn[${FORCE_ATTR}~="hover"]`,
      `[${FORCE_ATTR}~="hover"] .ds-btn`,
    ])
  })

  it('обе формы весят ровно столько же, сколько оригинал', () => {
    // Взято из системы как есть: так записана добрая половина интерактивных
    // правил (Button.css), плюс формы с двумя целями и с потомком.
    for (const original of [
      '.ds-btn--primary:hover:not(:disabled)',
      '.ds-tabs__tab:focus-visible',
      '.ds-row:hover .ds-row__action',
      '.ds-chip:hover:active',
    ]) {
      const forms = rewritten(rewriteSelector(original)).split(', ')
      for (const form of forms) {
        expect(specificity(form), `${original} → ${form}`).toEqual(specificity(original))
      }
    }
  })

  it('`:not(:disabled)` рядом с целью не мешает: цель на глубине 0', () => {
    const out = rewritten(rewriteSelector('.ds-btn--primary:hover:not(:disabled)'))
    expect(out).toContain(`.ds-btn--primary[${FORCE_ATTR}~="hover"]:not(:disabled)`)
    expect(out).toContain(':not(:disabled)')
    expect(out).not.toContain(':hover')
  })

  it('`:not(:hover)` НЕ переворачивается — правило пропускается', () => {
    // Текстовая замена дала бы `[data-wb-force~="hover"]` внутри `:not(…)`,
    // то есть «когда форс НЕ включён», — дубликат красил бы ровно наоборот.
    const r = rewriteSelector('.ds-card:not(:hover) .ds-card__hint')
    expect(r.kind).toBe('skipped')
  })

  it('`:has(:hover)` пропускается по той же причине', () => {
    expect(rewriteSelector('.ds-list:has(:hover)').kind).toBe('skipped')
  })

  it('часть списка БЕЗ цели выбрасывается, а не едет в дубликат', () => {
    // Несущее, а не косметика: `.ds-chip--active` уехал бы в самый конец листа
    // правилом той же специфичности и перебил бы всё, что красит его ниже по
    // файлу, — вид сломался бы ДО включения форса.
    const out = rewritten(rewriteSelector('.ds-chip:hover, .ds-chip--active'))
    expect(out).not.toContain('.ds-chip--active')
  })

  it('`:focus-visible` берётся целиком, а `:focus-within` не берётся вовсе', () => {
    const out = rewritten(rewriteSelector('.a:focus-visible'))
    expect(out).toContain(`[${FORCE_ATTR}~="focus-visible"]`)
    // Имя читается до конца, а не по первому совпадению: съев `:focus`,
    // разбор оставил бы висеть хвост `-visible` рядом с атрибутом «focus».
    expect(out).not.toContain(`${FORCE_ATTR}~="focus"]`)
    expect(out).not.toContain(':focus')
    expect(rewriteSelector('.b:focus-within').kind).toBe('none')
  })

  it('псевдоэлемент остаётся псевдоэлементом', () => {
    const out = rewritten(rewriteSelector('.a:hover::after'))
    expect(out).toContain(`.a[${FORCE_ATTR}~="hover"]::after`)
  })

  it('строка внутри атрибута не считается псевдоклассом', () => {
    expect(rewriteSelector('[title=":hover"]').kind).toBe('none')
  })

  it('селектор без интерактивных псевдоклассов — «нечего делать», а не «пропущено»', () => {
    // Схлопни эти два исхода — и счётчик пропущенных показывал бы девять сотен
    // правил системы вместо нуля, то есть не значил бы ничего.
    expect(rewriteSelector('.ds-card__title').kind).toBe('none')
  })
})

/** Правило-стиль для утиного дерева обхода. */
function style(selectorText: string, css = 'color: red'): RuleLike {
  return { selectorText, cssText: `${selectorText} { ${css} }`, style: { cssText: css } }
}

/** Групповое правило (@media/@container/@supports). */
function group(prelude: string, children: RuleLike[]): RuleLike {
  return { cssText: `${prelude} { … }`, cssRules: children }
}

describe('scanSheets', () => {
  it('спускается внутрь @media, @container и @supports', () => {
    // Плоский проход пропустил бы ровно интересное: восемь компонентов с
    // `@media` и DataTable с `@container`.
    const scan = scanSheets([
      {
        cssRules: [
          group('@media (hover: none)', [style('.a:hover')]),
          group('@container (max-width: 40em)', [style('.b:focus-visible')]),
          group('@supports (display: grid)', [style('.c:active')]),
        ],
      },
    ])
    expect(scan.matched).toBe(3)
    expect(scan.css).toContain('@media (hover: none) {')
    expect(scan.css).toContain('@container (max-width: 40em) {')
    expect(scan.css).toContain(`.a[${FORCE_ATTR}~="hover"]`)
    expect(scan.css).toContain(`.b[${FORCE_ATTR}~="focus-visible"]`)
  })

  it('спускается внутрь @import: за ним лежит весь CSS системы', () => {
    // `src/styles.css` — список импортов. Не спустись обход внутрь, он обошёл
    // бы полтора десятка `@import` и НИ ОДНОГО правила: счётчик обойдённых
    // показал бы ноль, а форс молча не красил бы ничего.
    const scan = scanSheets([
      {
        cssRules: [
          { cssText: "@import url('./Button.css');", styleSheet: { cssRules: [style('.a:hover')] } },
        ],
      },
    ])
    expect([scan.scanned, scan.matched]).toEqual([1, 1])
    expect(scan.css).toContain(`.a[${FORCE_ATTR}~="hover"]`)
  })

  it('условие у @import переезжает вместе с правилами', () => {
    const scan = scanSheets([
      {
        cssRules: [
          {
            cssText: "@import url('./p.css') print;",
            media: { mediaText: 'print' },
            styleSheet: { cssRules: [style('.a:hover')] },
          },
        ],
      },
    ])
    expect(scan.css.startsWith('@media print {')).toBe(true)
  })

  it('групповое правило без единого попадания внутрь не переезжает', () => {
    const scan = scanSheets([{ cssRules: [group('@media print', [style('.a')])] }])
    expect(scan.css).toBe('')
    expect(scan.scanned).toBe(1)
  })

  it('@keyframes не обходится: у шагов нет селектора, форсировать нечего', () => {
    const scan = scanSheets([
      {
        cssRules: [
          { cssText: '@keyframes spin { … }', cssRules: [{ cssText: '0% { opacity: 0 }' }] },
          style('.a:hover'),
        ],
      },
    ])
    expect([scan.scanned, scan.matched, scan.skipped]).toEqual([1, 1, 0])
  })

  it('счётчик обойдённых считает и вложенные правила', () => {
    // Без этого числа «пропущено: 0» ничего не утверждает: ноль пропущенных
    // из нуля обойдённых — это «мы туда не смотрели», а не «всё чисто».
    const scan = scanSheets([
      { cssRules: [style('.a'), group('@media screen', [style('.b'), style('.c:hover')])] },
    ])
    expect(scan.scanned).toBe(3)
  })

  it('непереписанное правило считается пропущенным, а не исчезает', () => {
    const scan = scanSheets([
      { cssRules: [style('.a:not(:hover)'), style('.b:hover'), style('.c')] },
    ])
    expect([scan.scanned, scan.matched, scan.skipped]).toEqual([3, 1, 1])
  })

  it('вложенный CSS (`&`) считается пропущенным, а не разбирается наполовину', () => {
    const nestedRule: RuleLike = {
      selectorText: '.a',
      cssText: '.a { color: red; &:hover { color: blue } }',
      style: { cssText: 'color: red' },
      cssRules: [style('&:hover')],
    }
    const scan = scanSheets([{ cssRules: [nestedRule] }])
    expect([scan.scanned, scan.skipped, scan.matched]).toEqual([1, 1, 0])
  })

  it('лист, не отдающий правила, считается отдельно от пропущенных правил', () => {
    const scan = scanSheets([
      {
        get cssRules(): never {
          throw new Error('SecurityError')
        },
      },
      { cssRules: [style('.a:hover')] },
    ])
    expect([scan.opaque, scan.skipped, scan.matched]).toEqual([1, 0, 1])
  })
})

describe('forceAttrValue', () => {
  it('запятые адреса становятся пробелами атрибута: `~=` ищет слово в списке', () => {
    expect(forceAttrValue('hover,focus-visible')).toBe('hover focus-visible')
  })

  it('неизвестное имя отбрасывается, а не едет в атрибут', () => {
    // В атрибуте оно молча не значило бы ничего, и `?force=hoverr` читался бы
    // как «форс включён, но не красит» — то есть как поломка механизма.
    expect(forceAttrValue('hoverr')).toBeNull()
    expect(forceAttrValue('hoverr,active')).toBe('active')
  })

  it('пусто и null дают null, а не пустой атрибут', () => {
    expect(forceAttrValue(null)).toBeNull()
    expect(forceAttrValue('')).toBeNull()
    expect(forceAttrValue(' , ')).toBeNull()
  })
})

describe('installForce — кэш собранной строки', () => {
  /** Лист с одним интерактивным правилом — и его уборка. */
  const withSheet = (css: string): (() => void) => {
    const el = document.createElement('style')
    el.textContent = css
    document.head.appendChild(el)
    return () => el.remove()
  }

  beforeEach(() => {
    resetForceCache()
    document.getElementById(FORCE_STYLE_ID)?.remove()
  })

  it('второй вызов берёт готовое, а сброс заставляет обойти заново', () => {
    // Проверяется РАЗЛИЧИМОСТЬ трёх состояний, а не каждое по отдельности:
    // лист УБИРАЕТСЯ между вызовами, и если второй вызов даёт прежний
    // результат — он и правда не ходил; если третий (после сброса) даёт
    // пустой — сброс и правда сбрасывает. Утверждай мы только «cached: true»,
    // проверка прошла бы и на коде, который просто ставит флаг.
    const drop = withSheet('.a:hover { color: red }')
    const first = installForce(document)
    expect([first.matched, first.cached]).toEqual([1, false])

    drop()
    const second = installForce(document)
    expect([second.matched, second.cached]).toEqual([1, true])

    resetForceCache()
    const third = installForce(document)
    expect([third.matched, third.cached]).toEqual([0, false])
  })

  it('у кэшированного вызова время — прежнего обхода, а не ноль', () => {
    // Ноль читался бы в панели как «уложились в бюджет блестяще» — про обход,
    // которого в этом вызове не было. Бюджет 16 мс — утверждение про обход.
    //
    // ЧАСЫ ПОДМЕНЕНЫ НАРОЧНО, и это не украшение: первая редакция сравнивала
    // `second.ms` с `first.ms` на настоящих часах, а обход одного правила в
    // jsdom занимает ровно 0 мс — мутация «кэшированный вызов рапортует ноль»
    // прошла проверку насквозь. Часы, идущие на единицу за вызов, делают
    // разницу между «прежним числом» и «нулём» наблюдаемой.
    const clock = vi.spyOn(performance, 'now')
    let t = 0
    clock.mockImplementation(() => (t += 1))
    try {
      const drop = withSheet('.a:hover { color: red }')
      const first = installForce(document)
      const second = installForce(document)
      expect(first.ms).toBeGreaterThan(0)
      expect(second.ms).toBe(first.ms)
      drop()
    } finally {
      clock.mockRestore()
    }
  })

  it('свой же лист в обход не попадает', () => {
    // Иначе второй обход переписывал бы уже переписанное. Сегодня это
    // безвредно (в дубликате псевдоклассов нет), но лист форса растёт вдвое
    // на каждом вызове, и заметно это станет не сразу.
    const drop = withSheet('.a:hover { color: red }')
    installForce(document)
    resetForceCache()
    const again = installForce(document)
    expect(again.matched).toBe(1)
    drop()
  })
})
