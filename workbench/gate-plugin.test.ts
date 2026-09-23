/**
 * Адрес предиката гейта (DS-222).
 *
 * Предмет — ТОЖДЕСТВО, а не «ответ приходит». До этого адреса браузерный агент
 * воспроизводил предикат по описанию из промта и получал то же число, что
 * прогон гейта; совпадение приближения с точным ответом остаётся приближением
 * и расходится молча, как только промт отстанет от кода.
 *
 * Поэтому здесь проверяется не поведение ответа, а то, что расходиться НЕЧЕМУ:
 * адрес ре-экспортирует тот же файл, который гейт исполняет, и имя экспорта —
 * та же функция, что вызывает гейт. Плюс граница: сервис не должен стать
 * вторым `/@fs`.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PREDICATES, PREFIX, moduleFor, gatePlugin } from './gate-plugin.js'
import * as predicates from './gate-predicates.js'
import { scanTargets, targetExempt, targetSignature, TARGET_ACT } from './gate-predicates.js'

/**
 * Корень репозитория — он же то, что плагину передаёт конфиг:
 * `import.meta.dirname` в `vite.workbench.config.ts` это КОРЕНЬ, а не папка
 * `workbench` (корень дев-сервера). Два разных корня с одним именем.
 */
const ROOT = resolve(__dirname, '..')

describe('предикат гейта по адресу', () => {
  it('отдаётся ТОТ ЖЕ файл, который гейт исполняет — сверено с `bundle:` в самом гейте', () => {
    // Главное утверждение. Разойтись эти двое могут только здесь: в гейте имя
    // файла написано строкой для esbuild, в плагине — строкой для ре-экспорта.
    const gate = readFileSync(resolve(ROOT, 'scripts/measure-invariants.mjs'), 'utf8')
    const named = [...gate.matchAll(/bundle: '([^']+gate-predicates\.ts)'/g)].map((m) => m[1])
    expect(named, 'гейт «Цель клика» перестал брать модуль предиката сборкой').toHaveLength(1)
    expect(named[0]).toBe(PREDICATES['target-size']!.file)
  })

  it('конфиг передаёт плагину КОРЕНЬ репозитория, а не корень дев-сервера', () => {
    // Два разных корня с одним именем: `root` сервера — папка `workbench`,
    // а `import.meta.dirname` конфига — корень. Первая редакция промахнулась
    // мимо файла ровно здесь, и юниты этого не видели: они звали `moduleFor`
    // со своим корнем. Живой сервер отвечал 500.
    const cfg = readFileSync(resolve(ROOT, 'vite.workbench.config.ts'), 'utf8')
    expect(cfg).toContain('gatePlugin(import.meta.dirname)')
  })

  it('имя `run` — живой экспорт модуля, а не строка наугад', () => {
    // Переименованный экспорт обязан ронять гейт, а не отдавать `undefined`
    // в странице агента.
    const { run } = PREDICATES['target-size']!
    expect(typeof (predicates as Record<string, unknown>)[run]).toBe('function')
    expect((predicates as Record<string, unknown>)[run]).toBe(scanTargets)
  })

  it('тело ответа ведёт на абсолютный путь того же файла и несёт его исходник', () => {
    const body = moduleFor('target-size', ROOT)
    const abs = resolve(ROOT, PREDICATES['target-size']!.file)
    expect(body).toContain(`export { scanTargets as run } from '/@fs${abs}'`)
    // `source` — чтобы предикат можно было ПРОЧИТАТЬ, а не только вызвать:
    // ради этого адрес и заводился.
    expect(body).toContain(JSON.stringify(readFileSync(abs, 'utf8')).slice(0, 200))
  })

  it('неизвестное имя — ОТКАЗ, и он называет валидные имена', async () => {
    const seen = await ask('/api/gate/predicate/нет-такого')
    expect(seen.status).toBe(404)
    expect(JSON.parse(seen.body).valid).toEqual(Object.keys(PREDICATES))
  })

  it('сервис не стал вторым `/@fs`: путь вместо имени не отдаёт файл', async () => {
    // Имя берётся из ЗАКРЫТОГО списка, поэтому подставить сюда файл негде.
    // Проверяется это ответом, а не чтением кода: «негде» — утверждение,
    // которое обязано быть ложным, если список однажды заменят на склейку пути.
    for (const bad of [
      '../vite.workbench.config.ts',
      '../../package.json',
      '/etc/hostname',
      'workbench/gate-predicates.ts',
      'constructor',
      'toString',
    ]) {
      const seen = await ask(PREFIX + encodeURIComponent(bad))
      expect(seen.status, `«${bad}» ответил ${seen.status}`).toBe(404)
      expect(seen.body).not.toContain('defineConfig')
      expect(seen.body).not.toContain('"name": "@santarinto/jig"')
    }
  })

  it('чужой адрес плагин не трогает вовсе', async () => {
    const seen = await ask('/frame.html')
    expect(seen.status).toBe('next')
  })
})

describe('сам предикат', () => {
  // jsdom раскладки не считает: ни коробок, ни `elementFromPoint`, ни
  // прокрутки. Без подмены обход отбросил бы нулевые коробки, и случай был бы
  // зелен на пустом множестве. Модель страницы здесь — коробки в координатах
  // ДОКУМЕНТА, вьюпорт 360×640 и смещение прокрутки окна; всё, что предикат
  // трогает, выводится из неё, а не подставляется ответом под каждый тест.
  //
  // `pointer-events: none` моделируется так, как его видит браузер: такой узел
  // `elementFromPoint` пропускает и отдаёт то, что под ним. В коде предиката
  // особого случая для него нет, и тест обязан поймать это без подсказки.
  type Box = [left: number, top: number, width: number, height: number]
  /**
   * Угол из `coveredBy` — без хвоста «; центр …» (DS-331, п. 4). Тесты
   * угла говорят про угол; центр судится своими тестами ниже.
   */
  const corner = (c: string | undefined) => c?.split('; центр')[0]
  const VW = 360
  const VH = 640
  const restore: (() => void)[] = []
  const stub = (obj: object, key: string, desc: PropertyDescriptor) => {
    const prev = Object.getOwnPropertyDescriptor(obj, key)
    Object.defineProperty(obj, key, { configurable: true, ...desc })
    restore.push(() => {
      if (prev) Object.defineProperty(obj, key, prev)
      else delete (obj as Record<string, unknown>)[key]
    })
  }
  afterEach(() => {
    while (restore.length) restore.pop()!()
    document.body.innerHTML = ''
  })

  // КОНТЕЙНЕР ПРОКРУТКИ — узел с `id` и вычисленным `overflow` auto/scroll.
  // Его смещение живёт здесь, а не в jsdom (там `scrollTop` всегда 0), и
  // сдвигает коробки ПОТОМКОВ: `scrollIntoView` в браузере листает не только
  // окно, но и каждого прокручиваемого предка, и модель обязана это уметь,
  // иначе утверждение «предок возвращён» было бы зелено на пустом множестве.
  //
  // ФРАГМЕНТЫ СТРОЧНОГО узла (`frags`, координаты документа): ссылка,
  // перенесённая на две строки, — это две коробки, а не одна. Их отдаёт
  // `getClientRects`, и по ним же попадает `elementFromPoint`: пустой угол
  // общей коробки принадлежит абзацу, а не ссылке.
  //
  // `scrollIntoView` понимает `block`/`inline`: `nearest` и `center`, по
  // умолчанию — как браузер, `start` по вертикали и `nearest` по горизонтали.
  const page = (html: string, boxes: Record<string, Box>, start: [number, number] = [0, 0],
    frags: Record<string, Box[]> = {}) => {
    document.body.innerHTML = html
    const scroll = { x: start[0], y: start[1] }
    const boxOf = (el: Element): Box | undefined => (el.id ? boxes[el.id] : undefined)
    const inner = new WeakMap<Element, { l: number; t: number }>()
    const own = (el: Element) => {
      let s = inner.get(el)
      if (!s) inner.set(el, (s = { l: 0, t: 0 }))
      return s
    }
    // `hidden` — тоже контейнер прокрутки: его листает скрипт и
    // `scrollIntoView`, хотя не человек. Модель обязана это уметь, иначе
    // возврат его смещения в предикате (DS-331) был бы зелен на пустом
    // множестве: модель его просто не сдвинула бы.
    const isScroller = (el: Element) => {
      if (!boxOf(el)) return false
      const cs = getComputedStyle(el)
      return [cs.overflowX, cs.overflowY].some((v) => v === 'auto' || v === 'scroll' || v === 'hidden')
    }
    const scrollers = (el: Element) => {
      const out: Element[] = []
      for (let a = el.parentElement; a; a = a.parentElement) if (isScroller(a)) out.push(a)
      return out
    }
    /** Коробка в координатах документа с учётом прокрутки предков-контейнеров. */
    // `position: sticky` (сам узел или его предок ниже контейнера) с
    // прокруткой контейнера НЕ едет: его коробка в модели — уже место, где он
    // залип. Грубо, но ровно то, что нужно предикату: узел на месте, а
    // смещение контейнера — честное число.
    const stuckBelow = (el: Element, a: Element) => {
      for (let n: Element | null = el; n && n !== a; n = n.parentElement) {
        if (getComputedStyle(n).position === 'sticky') return true
      }
      return false
    }
    const shift = (el: Element, b: Box): Box => {
      const [dx, dy] = scrollers(el).filter((a) => !stuckBelow(el, a))
        .reduce(([x, y], a) => [x + own(a).l, y + own(a).t], [0, 0])
      return [b[0] - dx, b[1] - dy, b[2], b[3]]
    }
    const placed = (el: Element): Box | undefined => {
      const b = boxOf(el)
      return b && shift(el, b)
    }
    /** Коробки, по которым узел принимает точку: фрагменты, если заданы, иначе одна. */
    const pieces = (el: Element): Box[] => {
      const f = el.id ? frags[el.id] : undefined
      if (f) return f.map((b) => shift(el, b))
      const b = placed(el)
      return b ? [b] : []
    }
    stub(Element.prototype, 'scrollLeft', {
      get(this: Element) { return own(this).l },
      set(this: Element, v: number) { own(this).l = Math.max(0, v) },
    })
    stub(Element.prototype, 'scrollTop', {
      get(this: Element) { return own(this).t },
      set(this: Element, v: number) { own(this).t = Math.max(0, v) },
    })
    const docW = Math.max(VW, ...Object.values(boxes).map(([l, , w]) => l + w))
    const docH = Math.max(VH, ...Object.values(boxes).map(([, t, , h]) => t + h))
    const clamp = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max))
    // Размеры прокрутки: у корня — документ и вьюпорт, у узла с коробкой —
    // сама коробка и протяжённость потомков. jsdom отдаёт на всё ноль.
    const extent = (el: Element, axis: 0 | 1): number => {
      const b = boxOf(el)!
      let far = b[axis + 2]!
      for (const d of el.querySelectorAll('[id]')) {
        const c = boxOf(d)
        if (c) far = Math.max(far, c[axis]! + c[axis + 2]! - b[axis]!)
      }
      return far
    }
    const sizes: [string, (el: Element) => number][] = [
      ['clientWidth', (el) => (el === document.documentElement ? VW : boxOf(el)?.[2] ?? 0)],
      ['clientHeight', (el) => (el === document.documentElement ? VH : boxOf(el)?.[3] ?? 0)],
      ['scrollWidth', (el) => (el === document.documentElement ? docW : boxOf(el) ? extent(el, 0) : 0)],
      ['scrollHeight', (el) => (el === document.documentElement ? docH : boxOf(el) ? extent(el, 1) : 0)],
    ]
    for (const [key, get] of sizes) stub(Element.prototype, key, { get(this: Element) { return get(this) } })
    stub(window, 'innerWidth', { value: VW, writable: true })
    stub(window, 'innerHeight', { value: VH, writable: true })
    stub(window, 'scrollX', { get: () => scroll.x })
    stub(window, 'scrollY', { get: () => scroll.y })
    stub(window, 'scrollTo', {
      value: (x: number, y: number) => { scroll.x = clamp(x, docW - VW); scroll.y = clamp(y, docH - VH) },
      writable: true,
    })
    stub(Element.prototype, 'getBoundingClientRect', {
      value(this: Element) {
        const [l, t, w, h] = placed(this) ?? [0, 0, 100, 100]
        const left = l - scroll.x
        const top = t - scroll.y
        return { width: w, height: h, x: left, y: top, left, top, right: left + w, bottom: top + h, toJSON: () => ({}) }
      },
      writable: true,
    })
    stub(Element.prototype, 'getClientRects', {
      value(this: Element) {
        return pieces(this).map(([l, t, w, h]) => {
          const left = l - scroll.x
          const top = t - scroll.y
          return { width: w, height: h, x: left, y: top, left, top, right: left + w, bottom: top + h }
        })
      },
      writable: true,
    })
    stub(Element.prototype, 'scrollIntoView', {
      value(this: Element, opts?: ScrollIntoViewOptions) {
        const mode = (m: ScrollLogicalPosition | undefined, dflt: ScrollLogicalPosition) => m ?? dflt
        const place = (m: ScrollLogicalPosition) => (pos: number, size: number, cur: number, view: number) =>
          m === 'center' ? pos + size / 2 - view / 2
            : m === 'start' ? pos
              : m === 'end' ? pos + size - view
                : pos < cur ? pos : pos + size > cur + view ? pos + size - view : cur
        const wantX = place(mode(opts?.inline, 'nearest'))
        const wantY = place(mode(opts?.block, 'start'))
        // Как браузер: сперва каждый прокручиваемый предок, изнутри наружу, —
        // так, чтобы узел оказался в его видимой части; потом окно.
        const me = boxOf(this) ?? [0, 0, 100, 100]
        for (const a of scrollers(this)) {
          const [al, at, aw, ah] = boxOf(a)!
          const s = own(a)
          s.l = Math.max(0, wantX(me[0] - al, me[2], s.l, aw))
          s.t = Math.max(0, wantY(me[1] - at, me[3], s.t, ah))
        }
        const [l, t, w, h] = placed(this) ?? me
        window.scrollTo(wantX(l, w, scroll.x, VW), wantY(t, h, scroll.y, VH))
      },
      writable: true,
    })
    stub(document, 'elementFromPoint', {
      value: (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= VW || y >= VH) return null
        const px = x + scroll.x
        const py = y + scroll.y
        // Позже в документе — выше в стопке: соседи здесь не несут z-index.
        const under = [...document.querySelectorAll('[id]')].filter((el) => {
          return getComputedStyle(el).pointerEvents !== 'none'
            && pieces(el).some((b) => px >= b[0] && px < b[0] + b[2] && py >= b[1] && py < b[1] + b[3])
        })
        return under[under.length - 1] ?? document.body
      },
      writable: true,
    })
    return Object.assign(scroll, { inner: (el: Element) => ({ ...own(el) }) })
  }
  const withBoxes = (html: string, box: Record<string, [number, number]>) =>
    page(html, Object.fromEntries(Object.entries(box).map(([k, [w, h]]) => [k, [0, 0, w, h] as Box])))

  it('прокручиваемая область, фокусируемая только tabindex, целью не считается', () => {
    withBoxes(
      `<pre id="pre" tabindex="0" style="overflow-x: auto">npm run wb</pre>
       <button id="btn" style="overflow-x: auto; width: 10px; height: 10px">×</button>`,
      { pre: [600, 18], btn: [10, 10] },
    )
    const m = scanTargets(document)
    expect(m.scrollers).toBe(1)
    expect(m.total).toBe(1)
    expect(m.small).toHaveLength(1)
    expect(m.small[0]).toMatchObject({ path: 'button', width: 10, height: 10, hit: true })
  })

  it('исключение — по ФОРМЕ: та же область с ролью действия остаётся целью', () => {
    withBoxes(`<div id="d" tabindex="0" role="button" style="overflow-y: scroll">x</div>`, { d: [10, 10] })
    expect(scanTargets(document).scrollers).toBe(0)
    const el = document.getElementById('d')!
    expect(targetExempt(el, getComputedStyle(el))).toBe(false)
  })

  it('без прокрутки tabindex остаётся целью', () => {
    withBoxes(`<div id="d" tabindex="0">x</div>`, { d: [10, 10] })
    expect(scanTargets(document).scrollers).toBe(0)
    expect(scanTargets(document).total).toBe(1)
  })

  it('мелкая цель называется ПУТЁМ, а не списком классов', () => {
    page('<div class="wbf-host" id="host"><div class="ds-log">'
      + '<button class="ds-log__caret is-open" id="caret">x</button></div></div>',
    { host: [0, 0, 360, 640], caret: [20, 20, 12, 12] })
    const s = scanTargets(document)
    expect(s.small).toHaveLength(1)
    expect(s.small[0]!.path).toBe('div.ds-log > button.ds-log__caret')
    expect(s.small[0]!.width).toBeCloseTo(12, 1)
    expect(s.small[0]!.hit).toBe(true)
  })

  it('цель, перекрытая соседом, попадает в unhittable, даже будучи крупной', () => {
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="btn">x</button>'
      + '<div class="ds-veil" id="veil"></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], veil: [0, 0, 360, 640] })
    const s = scanTargets(document)
    expect(s.small).toEqual([])
    expect(s.unreachable).toEqual([])
    expect(s.unhittable.map((u) => u.path)).toEqual(['button.ds-btn'])
    expect(s.unhittable[0]!.hit).toBe(false)
  })

  it('pointer-events: none — цель не принимает указатель и это unhittable', () => {
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="btn" style="pointer-events:none">x</button></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-btn'])
  })

  // ЧЕМ НАКРЫТ. Живой прогон гейта и chromium владельца расходятся на метриках
  // текста, так что причину промаха обязан назвать САМ замер: угол, точку и
  // путь узла, который отдал `elementFromPoint`.
  it('промах несёт `coveredBy`: первый промахнувшийся угол, его точка и путь накрывшего', () => {
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="btn">x</button>'
      + '<div class="ds-veil" id="veil"></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], veil: [0, 0, 360, 640] })
    expect(corner(scanTargets(document).unhittable[0]!.coveredBy)).toBe('TL (13.0,13.0) div.ds-veil')
  })

  it('pointer-events: none — `coveredBy` называет то, что ПОД целью', () => {
    page('<div class="wbf-host" id="host"><div class="ds-card" id="card">'
      + '<button class="ds-btn" id="btn" style="pointer-events:none">x</button></div></div>',
    { host: [0, 0, 360, 640], card: [0, 0, 200, 200], btn: [10, 10, 40, 40] })
    expect(corner(scanTargets(document).unhittable[0]!.coveredBy)).toBe('TL (13.0,13.0) div.ds-card')
  })

  it('сам хост называется `.wbf-host`, а не пустой строкой пути', () => {
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="btn" style="pointer-events:none">x</button></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40] })
    expect(corner(scanTargets(document).unhittable[0]!.coveredBy)).toBe('TL (13.0,13.0) .wbf-host')
  })

  it('назван ПЕРВЫЙ промахнувшийся угол, а не всегда TL; попадаемая мелкая поля не несёт', () => {
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="btn">x</button><button class="ds-btn" id="tiny">y</button>'
      + '<div class="ds-veil" id="veil"></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], tiny: [100, 10, 20, 20], veil: [44, 44, 10, 10] })
    const s = scanTargets(document)
    expect(corner(s.unhittable[0]!.coveredBy)).toBe('BR (47.0,47.0) div.ds-veil')
    expect(s.small.map((t) => [t.hit, corner(t.coveredBy)])).toEqual([[true, undefined]])
  })

  it('мелкая, по которой не попасть, несёт `coveredBy`; попадаемая — нет', () => {
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="tiny">y</button><div class="ds-veil" id="veil"></div></div>',
    { host: [0, 0, 360, 640], tiny: [100, 10, 20, 20], veil: [100, 10, 20, 20] })
    expect(scanTargets(document).small.map((t) => [t.hit, corner(t.coveredBy)])).toEqual([[false, 'TL (103.0,13.0) div.ds-veil']])
  })

  it('соседний случай: та же цель без вуали и без pointer-events — попадаема', () => {
    // Сосед с заранее известным ответом (ловушка 5): модель страницы, которая
    // отдаёт «не попасть» на всё, дала бы два зелёных теста выше.
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button></div>',
      { host: [0, 0, 360, 640], btn: [10, 10, 40, 40] })
    const s = scanTargets(document)
    expect(s.unhittable).toEqual([])
    expect(s.small).toEqual([])
    expect(s.total).toBe(1)
  })

  it('цель ниже фолда не объявляется неперекрытой ложно — её судят по видимым углам', () => {
    // Без прокрутки `elementFromPoint` на точку за вьюпортом отдаёт null, и
    // каждая цель длинного компонента пришла бы «не попасть». Это ложное
    // нарушение, а не находка.
    page('<div class="wbf-host" id="host"><div id="tall"></div>'
      + '<button class="ds-btn" id="btn">x</button></div>',
    { host: [0, 0, 360, 2100], tall: [0, 0, 360, 2000], btn: [10, 2010, 40, 40] })
    const s = scanTargets(document)
    expect(s.unhittable, 'цель за фолдом не нарушение').toEqual([])
    expect(s.unreachable, 'и не «не измерено»: прокрутка её достаёт').toEqual([])
    expect(s.small).toEqual([])
  })

  it('прокрутку окна предикат возвращает, какой взял — не в ноль', () => {
    // Страница одна на всех судей ячейки: сдвинутое окно поменяло бы соседу
    // координаты. Старт НЕ с нуля, чтобы «вернул в ноль» не сошло за «вернул».
    const scroll = page('<div class="wbf-host" id="host"><div id="tall"></div>'
      + '<button class="ds-btn" id="btn">x</button></div>',
    { host: [0, 0, 360, 2100], tall: [0, 0, 360, 2000], btn: [10, 2010, 40, 40] }, [0, 30])
    scanTargets(document)
    expect(scroll.y).toBe(30)
  })

  it('прокрутку ПРЕДКА-контейнера предикат тоже возвращает, какой взял', () => {
    // `scrollIntoView` листает не только окно: цель внутри контейнера с
    // `overflow: auto` сдвигает и его. Смещение контейнера не меняет ширин, но
    // меняет КООРДИНАТЫ всего, что в нём лежит, — и соседняя строка ячейки,
    // спросившая `elementFromPoint` или `getBoundingClientRect`, получила бы
    // другой документ. Старт контейнера НЕ с нуля — по тому же доводу, что у окна.
    const sc = page('<div class="wbf-host" id="host">'
      + '<div class="ds-log__scroll" id="box" style="overflow-y:auto">'
      + '<button class="ds-btn" id="btn">x</button></div></div>',
    { host: [0, 0, 360, 640], box: [0, 0, 360, 200], btn: [10, 500, 40, 40] })
    const box = document.getElementById('box')!
    box.scrollTop = 30
    const s = scanTargets(document)
    expect(s.unhittable, 'цель в контейнере достаётся его прокруткой').toEqual([])
    expect(s.unreachable).toEqual([])
    expect(sc.inner(box), 'контейнер вернулся туда, где был').toEqual({ l: 0, t: 30 })
    expect(sc.y).toBe(0)
  })

  it('модель страницы и правда листает предка — иначе случай выше зелен ни о чём', () => {
    // Сосед с известным ответом (ловушка 5): тот же документ, но `scrollIntoView`
    // зовётся напрямую, без предиката. Контейнер обязан уехать.
    const sc = page('<div class="wbf-host" id="host">'
      + '<div class="ds-log__scroll" id="box" style="overflow-y:auto">'
      + '<button class="ds-btn" id="btn">x</button></div></div>',
    { host: [0, 0, 360, 640], box: [0, 0, 360, 200], btn: [10, 500, 40, 40] })
    document.getElementById('btn')!.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    expect(sc.inner(document.getElementById('box')!).t).toBe(340)
  })

  it('цель, торчащая за край вьюпорта, судится по ВИДИМЫМ углам', () => {
    // Шире окна: даже после прокрутки левые углы за краем, и
    // `elementFromPoint` на них отдаёт null. Судить по всем четырём значило бы
    // объявить её «не попасть» без единого перекрытия.
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button></div>',
      { host: [0, 0, 400, 640], btn: [0, 10, 400, 40] })
    const s = scanTargets(document)
    expect(s.unhittable, 'половина за краем — не перекрытие').toEqual([])
    expect(s.unreachable, 'и не «не измерено»: два угла видны').toEqual([])
  })

  it('видимые углы при этом СУДЯТСЯ: вуаль на видимом угле — unhittable', () => {
    // Сосед предыдущего: без него «видимых углов не проверяем вовсе» было бы
    // неотличимо от «судим по видимым». Цель шире окна: центр выносит оба её
    // края за вьюпорт, и предикат листает к НАЧАЛУ — видны левые углы, на
    // левом нижнем и лежит вуаль.
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button>'
      + '<div class="ds-veil" id="veil"></div></div>',
    { host: [0, 0, 400, 640], btn: [0, 10, 400, 40], veil: [0, 40, 10, 10] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-btn'])
  })

  it('точка отступает от угла НА РАДИУС: сосед в квадрате угла скругления не перекрывает', () => {
    // При скруглении 8 px пиксель у самого угла лежит за дугой, и в браузере
    // `elementFromPoint` отдаёт там то, что под кнопкой. Сосед 4×4 в угловом
    // квадрате моделирует ровно это; отступ в 1 px счёл бы кнопку перекрытой.
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="btn" style="border-top-left-radius:8px;border-top-right-radius:8px;'
      + 'border-bottom-left-radius:8px;border-bottom-right-radius:8px">x</button>'
      + '<div class="ds-corner" id="corner"></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], corner: [10, 10, 4, 4] })
    expect(scanTargets(document).unhittable).toEqual([])
  })

  it('без скругления тот же сосед в углу — перекрытие', () => {
    // Сосед с известным ответом: иначе зелёный случай выше неотличим от модели,
    // где угловой сосед не перекрывает ничего вовсе.
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button>'
      + '<div class="ds-corner" id="corner"></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], corner: [10, 10, 4, 4] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-btn'])
  })

  it('цель в `[inert]`-поддереве — не цель вовсе: ни в счёте, ни в списках, ни в подписи', () => {
    // Modal/Drawer: кнопки страницы под fixed-подложкой, фон помечен `inert`.
    // Инертное не принимает действие ни у кого — это отсутствие цели, как
    // невидимость, а не «не попасть». Сосед с известным ответом — живая кнопка
    // рядом и случай «перекрытая соседом» выше: вуаль сама по себе судится.
    page('<div class="wbf-host" id="host">'
      + '<div class="ds-page" inert><button class="ds-btn" id="bg">x</button></div>'
      + '<div class="ds-veil" id="veil"></div>'
      + '<button class="ds-modal__close" id="live">y</button></div>',
    { host: [0, 0, 360, 640], bg: [10, 10, 40, 40], veil: [0, 0, 360, 640], live: [100, 100, 40, 40] })
    const s = scanTargets(document)
    expect(s.total, 'инертная кнопка не осмотрена').toBe(1)
    expect(s.unhittable).toEqual([])
    expect(s.small).toEqual([])
    expect(s.unreachable).toEqual([])
    expect(targetSignature(document), 'отстаивание ждёт ровно измеряемое').toBe('100.0,100.0,40.0,40.0')
  })

  it('отключённая цель по попаданию не судится: под вуалью — ни unhittable, ни unreachable', () => {
    // Button/loading (`disabled`) и Button/link (`aria-disabled`, `pointer-events:
    // none`): угол честно отдаёт родителя, потому что так и задумано.
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="dis" disabled>x</button>'
      + '<a class="ds-btn" id="aria" href="#" aria-disabled="true" style="pointer-events:none">y</a>'
      + '<div class="ds-veil" id="veil"></div></div>',
    { host: [0, 0, 360, 640], dis: [10, 10, 40, 40], aria: [10, 60, 40, 40], veil: [0, 0, 360, 640] })
    const s = scanTargets(document)
    expect(s.total, 'отключённая — цель, её размер судится').toBe(2)
    expect(s.unhittable).toEqual([])
    expect(s.unreachable).toEqual([])
  })

  it('соседний случай: `aria-disabled="false"` — включена, и вуаль её перекрывает', () => {
    // Без него «отключённой считается любая с атрибутом» неотличимо от правила.
    page('<div class="wbf-host" id="host">'
      + '<a class="ds-btn" id="aria" href="#" aria-disabled="false">y</a>'
      + '<div class="ds-veil" id="veil"></div></div>',
    { host: [0, 0, 360, 640], aria: [10, 60, 40, 40], veil: [0, 0, 360, 640] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['a.ds-btn'])
  })

  it('отключённая МЕЛКАЯ цель остаётся в small, а попадание у неё не снимается (`hit: null`)', () => {
    // Размер переживает состояние: включённая кнопка будет той же коробки.
    // Цель целиком во вьюпорте и не перекрыта — спроси предикат углы, пришло
    // бы `true`; `null` значит, что их не спрашивали.
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="dis" disabled>x</button></div>',
      { host: [0, 0, 360, 640], dis: [10, 10, 10, 10] })
    const s = scanTargets(document)
    expect(s.small.map((t) => [t.path, t.hit])).toEqual([['button.ds-btn', null]])
  })

  it('точка отступает ещё и НА РАМКУ: сосед, сведённый на ширину рамки, не перекрывает', () => {
    // ToggleGroup: соседи сведены `margin: -1px`, радиус 0 — точка в 1 px от
    // края ложилась на рамку, которую уже накрыл сосед.
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-tg__item" id="a" style="border:1px solid">a</button>'
      + '<button class="ds-tg__item" id="b" style="border:1px solid">b</button></div>',
    { host: [0, 0, 360, 640], a: [10, 10, 40, 40], b: [49, 10, 40, 40] })
    const s = scanTargets(document)
    expect(s.unhittable).toEqual([])
    expect(s.total).toBe(2)
  })

  it('перекрытие толще рамки — по-прежнему нарушение, и цель на цели не исключается', () => {
    // Сосед с известным ответом: иначе «рамка» неотличима от «соседи-цели
    // друг друга не перекрывают вовсе».
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-tg__item" id="a" style="border:1px solid">a</button>'
      + '<button class="ds-tg__item" id="b" style="border:1px solid">b</button></div>',
    { host: [0, 0, 360, 640], a: [10, 10, 40, 40], b: [45, 10, 40, 40] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-tg__item'])
  })

  it('без рамки тот же нахлёст в 1 px — перекрытие', () => {
    // Второй сосед: отступ растёт на ширину РАМКИ, а не на лишний пиксель всегда.
    // `border:0` явно: у jsdom, как у браузера, своя таблица стилей даёт
    // кнопке рамку 2px outset.
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-tg__item" id="a" style="border:0">a</button>'
      + '<button class="ds-tg__item" id="b" style="border:0">b</button></div>',
    { host: [0, 0, 360, 640], a: [10, 10, 40, 40], b: [49, 10, 40, 40] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-tg__item'])
  })

  // `overflow` здесь всегда ДОЛГОЙ формой: jsdom шорткат в `overflowX`/`Y` не
  // раскладывает (браузер раскладывает), и `overflow:hidden` был бы зелен ни о чём.
  //
  // ОБРЕЗКА ПРЕДКОМ. Модель `elementFromPoint` клипа не знает: точка за краем
  // обрезающего предка отдаёт саму цель, если сверху ничего нет. Поэтому
  // «сосед за клипом» здесь — реальный узел справа от него, как в браузере
  // (Tabs/trailing: правые углы вкладки ложились на кнопку прокрутки). Кнопка
  // выше и ниже вкладки — НЕ вложена в её коробку, иначе её простило бы правило
  // накладки, и соседний случай был бы не о клипе.
  const clipped = (listStyle: string) => page('<div class="wbf-host" id="host">'
    + `<div class="ds-tabs__list" id="list" style="${listStyle}">`
    + '<button class="ds-tabs__tab" id="tab">t</button></div>'
    + '<button class="ds-tabs__next" id="next">›</button></div>',
  { host: [0, 0, 360, 640], list: [66, 10, 96, 40], tab: [66, 10, 130, 40], next: [162, 5, 34, 50] })

  it('попадание судится по ВИДИМОЙ части: углы за клипом предка не спрашиваются', () => {
    clipped('overflow-x:hidden;overflow-y:hidden')
    const s = scanTargets(document)
    expect(s.unhittable).toEqual([])
    expect(s.total).toBe(2)
  })

  it('соседний случай: без клипа та же вкладка под кнопкой прокрутки — перекрытие', () => {
    // Сосед с известным ответом: кнопка — цель, но НЕ внутри коробки вкладки,
    // так что и правило накладки её не прощает.
    clipped('')
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['div.ds-tabs__list > button.ds-tabs__tab'])
  })

  it('размер судится по ПОЛНОЙ коробке: обрезанная до 20 px цель 30×30 не мелкая', () => {
    page('<div class="wbf-host" id="host"><div id="clip" style="overflow-x:hidden;overflow-y:hidden">'
      + '<button class="ds-btn" id="btn">x</button></div></div>',
    { host: [0, 0, 360, 640], clip: [10, 10, 20, 30], btn: [10, 10, 30, 30] })
    const s = scanTargets(document)
    expect(s.small).toEqual([])
    expect(s.unhittable).toEqual([])
    expect(s.total).toBe(1)
  })

  it('пустое пересечение с клипом (свёрнутая панель) — цели нет: ни в счёте, ни в подписи', () => {
    page('<div class="wbf-host" id="host"><div class="ds-split__pane" id="pane" style="overflow-x:hidden;overflow-y:hidden">'
      + '<button class="ds-btn" id="btn">x</button></div></div>',
    { host: [0, 0, 360, 640], pane: [0, 0, 0, 640], btn: [0, 10, 40, 40] })
    const s = scanTargets(document)
    expect(s.total).toBe(0)
    expect([...s.small, ...s.unhittable, ...s.unreachable]).toEqual([])
    expect(targetSignature(document)).toBe('')
  })

  it('соседний случай: та же панель развёрнута — кнопка цель', () => {
    page('<div class="wbf-host" id="host"><div class="ds-split__pane" id="pane" style="overflow-x:hidden;overflow-y:hidden">'
      + '<button class="ds-btn" id="btn">x</button></div></div>',
    { host: [0, 0, 360, 640], pane: [0, 0, 200, 640], btn: [0, 10, 40, 40] })
    expect(scanTargets(document).total).toBe(1)
    expect(targetSignature(document)).toBe('0.0,10.0,40.0,40.0')
  })

  it('клип `overflow: clip` с целью целиком снаружи — цель, и человеку её не достать: промах, названный клипом', () => {
    // До DS-331 такая цель выпадала из замера («обрезано предком в
    // ноль»), и под этим счётом лежали 206 целей Tabs. Клип не схлопнут —
    // значит, это не свёрнутая панель, а цель, которую раскладка вынесла за
    // край: замер обязан её назвать, а не вычесть.
    page('<div class="wbf-host" id="host"><div id="clip" style="overflow-x:clip">'
      + '<button class="ds-btn" id="btn">x</button></div></div>',
    { host: [0, 0, 360, 640], clip: [0, 0, 100, 640], btn: [150, 10, 40, 40] })
    const s = scanTargets(document)
    expect(s.total).toBe(1)
    expect(s.clipped).toBe(0)
    expect(s.unhittable.map((u) => [u.hit, u.coveredBy])).toEqual([[false, expect.stringMatching(/^вне досягаемости — срезана overflow clip\/.* у div$/)]])
    expect(targetSignature(document)).not.toBe('')
  })

  it('клип, СХЛОПНУТЫЙ в ноль по своей оси, — цели нет, и это считается', () => {
    page('<div class="wbf-host" id="host"><div id="clip" style="overflow-x:clip">'
      + '<button class="ds-btn" id="btn">x</button></div></div>',
    { host: [0, 0, 360, 640], clip: [0, 0, 0, 640], btn: [150, 10, 40, 40] })
    const s = scanTargets(document)
    expect([s.total, s.clipped]).toEqual([0, 1])
    expect(targetSignature(document)).toBe('')
  })

  it('клип вокруг ЛИСТАЕМОГО списка: цель за клипом в покое — цель, список её выводит (Tabs/closable)', () => {
    // `.ds-tabs` — `overflow-x: clip`, внутри `.ds-tabs__list` — `auto`.
    // Владелец промотал ленту и закрыл крестик последней вкладки с первого
    // нажатия; проба до DS-331 её не видела вовсе.
    page('<div class="wbf-host" id="host"><div class="ds-tabs" id="bar" style="overflow-x:clip">'
      + '<div class="ds-tabs__list" id="list" style="overflow-x:auto">'
      + '<div id="fill"></div><button class="ds-tabs__tab" id="tab">t</button></div></div></div>',
    { host: [0, 0, 360, 640], bar: [0, 0, 200, 40], list: [0, 0, 200, 40], fill: [0, 0, 300, 40], tab: [300, 0, 60, 40] })
    const s = scanTargets(document)
    expect([s.total, s.clipped]).toEqual([1, 0])
    expect([...s.small, ...s.unhittable, ...s.unreachable]).toEqual([])
  })

  it('`hidden` листает только скрипт: цель за его краем — промах «вне досягаемости», а не «попадаема» (Split ×1.5)', () => {
    // `scrollIntoView` сдвинул бы `hidden` и вывел ручку в вид; человек так
    // не может — ни колесом, ни пальцем, ни полосой. Смещение возвращается.
    page('<div class="wbf-host" id="host"><div class="ds-split" id="clip" style="overflow-x:hidden;overflow-y:hidden">'
      + '<div id="fill"></div><div class="ds-split__bar" id="bar" tabindex="0"></div></div></div>',
    { host: [0, 0, 360, 640], clip: [0, 0, 300, 200], fill: [0, 0, 420, 200], bar: [391, 0, 15, 200] })
    const s = scanTargets(document)
    expect(s.small.map((t) => [t.path, t.hit, t.coveredBy])).toEqual([
      ['div.ds-split > div.ds-split__bar', false, 'вне досягаемости — срезана overflow hidden/hidden у div.ds-split'],
    ])
    expect(document.getElementById('clip')!.scrollLeft, 'смещение hidden возвращено').toBe(0)
  })

  it('соседний случай: цель ВНУТРИ видимой части `hidden` — попадаема, хоть скрипт его и листает', () => {
    page('<div class="wbf-host" id="host"><div class="ds-split" id="clip" style="overflow-x:hidden;overflow-y:hidden">'
      + '<div id="fill"></div><button class="ds-btn" id="btn">x</button></div></div>',
    { host: [0, 0, 360, 640], clip: [0, 0, 300, 200], fill: [0, 0, 420, 400], btn: [200, 100, 40, 40] })
    const s = scanTargets(document)
    expect([s.total, s.unhittable, s.unreachable]).toEqual([1, [], []])
  })

  it('цель за текущим видом ПРОКРУЧИВАЕМОГО предка — цель: прокрутка её достаёт', () => {
    // Пустое пересечение «в покое» у листаемого контейнера — не отсутствие
    // цели: строки таблицы ниже её фолда иначе выпали бы из замера молча.
    page('<div class="wbf-host" id="host">'
      + '<div class="ds-log__scroll" id="box" style="overflow-y:auto">'
      + '<button class="ds-btn" id="btn">x</button><div class="ds-veil" id="veil"></div></div></div>',
    { host: [0, 0, 360, 640], box: [0, 0, 360, 200], btn: [10, 500, 40, 40], veil: [0, 500, 360, 20] })
    const s = scanTargets(document)
    expect(s.total, 'не выпала из счёта').toBe(1)
    expect(s.unhittable.map((u) => u.path), 'и судится: вуаль на её верхних углах').toHaveLength(1)
  })

  // РОУМИНГ (DS-330): `tabindex="-1"` у всех членов группы, кроме
  // одного. Без ролей в `TARGET_ACT` обход видел одну строку дерева из пяти.
  it('строки дерева с роумингом — все цели, а не одна с tabindex=0 (Tree/base)', () => {
    page('<div class="wbf-host" id="host"><div role="tree" id="tree">'
      + '<div role="treeitem" class="ds-tree__item" id="a" tabindex="0">a</div>'
      + '<div role="treeitem" class="ds-tree__item" id="b" tabindex="-1">b</div>'
      + '<div role="treeitem" class="ds-tree__item" id="c" tabindex="-1">c</div></div></div>',
    { host: [0, 0, 360, 640], tree: [0, 0, 300, 90], a: [0, 0, 300, 28], b: [0, 30, 300, 28], c: [0, 60, 300, 28] })
    expect(scanTargets(document).total).toBe(3)
  })

  it('табличное дерево: цель — строка с роумингом, не её ячейки и не строка-заголовок', () => {
    // Клик и роуминг висят на строке (`Tree.tsx`, grid-режим); у ячеек нет ни
    // обработчика, ни атрибута `tabindex`, у заголовка тоже.
    page('<div class="wbf-host" id="host"><div role="treegrid" id="grid">'
      + '<div role="row" class="ds-tree__gridhead" id="head"><span role="columnheader" id="ch">h</span></div>'
      + '<div role="row" class="ds-tree__item" id="r1" tabindex="0"><span role="gridcell" id="c1">1</span></div>'
      + '<div role="row" class="ds-tree__item" id="r2" tabindex="-1"><span role="gridcell" id="c2">2</span></div>'
      + '</div></div>',
    { host: [0, 0, 360, 640], grid: [0, 0, 300, 90], head: [0, 0, 300, 28], ch: [0, 0, 100, 28],
      r1: [0, 30, 300, 28], c1: [100, 30, 100, 28], r2: [0, 60, 300, 28], c2: [100, 60, 100, 28] })
    const s = scanTargets(document)
    expect(s.total).toBe(2)
    expect(s.unhittable).toEqual([])
  })

  it('слоты сетки с роумингом — все цели; ячейка без tabindex — не цель (EventCalendar)', () => {
    page('<div class="wbf-host" id="host"><div role="grid" id="grid"><div role="row" id="row">'
      + '<div role="gridcell" class="ds-eventcal__slot" id="s1" tabindex="0"></div>'
      + '<div role="gridcell" class="ds-eventcal__slot" id="s2" tabindex="-1"></div>'
      + '<div role="gridcell" class="ds-table__cell" id="s3"></div></div></div></div>',
    { host: [0, 0, 360, 640], grid: [0, 0, 300, 30], row: [0, 0, 300, 30],
      s1: [0, 0, 100, 30], s2: [100, 0, 100, 30], s3: [200, 0, 100, 30] })
    expect(scanTargets(document).total).toBe(2)
  })

  // Слот под событием (EventCalendar): 105 промахов первого прогона после 330.
  const slotUnder = (cover: string) => {
    page('<div class="wbf-host" id="host"><div role="grid" id="grid">'
      + '<div role="gridcell" class="ds-eventcal__slot" id="slot" tabindex="-1"></div></div>' + cover + '</div>',
    { host: [0, 0, 360, 640], grid: [0, 0, 300, 90], slot: [0, 0, 60, 30], ev: [0, 0, 60, 90] })
    return scanTargets(document)
  }

  it('ячейка сетки под другой ЦЕЛЬЮ — не промах: занятое время нажимается событием', () => {
    const s = slotUnder('<button class="ds-eventcal__event" id="ev">e</button>')
    expect(s.total).toBe(2)
    expect(s.unhittable).toEqual([])
  })

  it('соседний случай: ячейка под НЕ-целью — промах', () => {
    const s = slotUnder('<div class="ds-veil" id="ev"></div>')
    expect(s.unhittable.map((u) => u.path)).toEqual(['div > div.ds-eventcal__slot'])
  })

  it('контроль: событие под другим событием — промах, прощение только у ячейки сетки', () => {
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-eventcal__event" id="a">a</button><button class="ds-eventcal__event" id="b">b</button></div>',
    { host: [0, 0, 360, 640], a: [0, 0, 60, 90], b: [30, 0, 60, 90] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-eventcal__event'])
  })

  it('fixed-цель клипом предка не обрезается — она из-под него выходит', () => {
    page('<div class="wbf-host" id="host"><div id="clip" style="overflow-x:hidden;overflow-y:hidden">'
      + '<button class="ds-btn" id="btn" style="position:fixed">x</button></div></div>',
    { host: [0, 0, 360, 640], clip: [0, 0, 0, 0], btn: [10, 10, 40, 40] })
    expect(scanTargets(document).total).toBe(1)
  })

  // НАКЛАДКА: другая цель, целиком внутри коробки судимой, над её углом.
  it('угол под накладкой-целью внутри коробки (крестик вкладки) промахом не считается', () => {
    // Попадает ПОТОМОК накладки (иконка): владелец ищется вверх от точки.
    page('<div class="wbf-host" id="host"><button class="ds-tabs__tab" id="tab">t</button>'
      + '<button class="ds-tabs__close" id="close"><span id="ico"></span></button></div>',
    { host: [0, 0, 360, 640], tab: [10, 10, 120, 40], close: [106, 10, 24, 24], ico: [106, 10, 24, 24] })
    const s = scanTargets(document)
    expect(s.unhittable).toEqual([])
    expect(s.total).toBe(2)
  })

  it('накладка может торчать на полпикселя — допуск ±0.5', () => {
    page('<div class="wbf-host" id="host"><button class="ds-tabs__tab" id="tab">t</button>'
      + '<button class="ds-tabs__close" id="close"></button></div>',
    { host: [0, 0, 360, 640], tab: [10, 10, 120, 40], close: [106.4, 9.6, 24, 24] })
    expect(scanTargets(document).unhittable).toEqual([])
  })

  it('цель, НЕ вложенная в коробку (соседнее событие), — по-прежнему промах', () => {
    page('<div class="wbf-host" id="host"><button class="ds-ev" id="a">a</button>'
      + '<button class="ds-ev" id="b">b</button></div>',
    { host: [0, 0, 360, 640], a: [10, 10, 100, 40], b: [80, 30, 100, 40] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-ev'])
  })

  it('торчащая больше допуска накладка — промах', () => {
    page('<div class="wbf-host" id="host"><button class="ds-tabs__tab" id="tab">t</button>'
      + '<button class="ds-tabs__close" id="close"></button></div>',
    { host: [0, 0, 360, 640], tab: [10, 10, 120, 40], close: [107, 8, 24, 24] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-tabs__tab'])
  })

  it('НЕ-цель внутри коробки над углом (svg сводной) — промах', () => {
    page('<div class="wbf-host" id="host"><button class="ds-pivot__fold" id="fold">f</button>'
      + '<div class="ds-pivot__svg" id="svg"></div></div>',
    { host: [0, 0, 360, 640], fold: [10, 10, 120, 40], svg: [106, 10, 24, 24] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-pivot__fold'])
  })

  it('прокручиваемая область (исключение по форме) внутри коробки — не накладка, промах', () => {
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button>'
      + '<div class="ds-log__scroll" id="sc" tabindex="0" style="overflow-x:auto;overflow-y:auto"></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 120, 40], sc: [106, 10, 24, 24] })
    expect(scanTargets(document).unhittable.map((u) => u.path)).toEqual(['button.ds-btn'])
  })

  it('вложенность накладки меряется по ПОЛНОЙ коробке судимой, а не по видимой части', () => {
    // Постановление: «коробка целиком внутри коробки судимой». Накладка здесь
    // внутри полной коробки обрезанной вкладки, но торчит за видимую часть.
    page('<div class="wbf-host" id="host">'
      + '<div class="ds-tabs__list" id="list" style="overflow-x:hidden;overflow-y:hidden">'
      + '<button class="ds-tabs__tab" id="tab">t</button></div>'
      + '<button class="ds-tabs__close" id="close"></button></div>',
    { host: [0, 0, 360, 640], list: [66, 10, 96, 40], tab: [66, 10, 130, 40], close: [150, 10, 30, 24] })
    expect(scanTargets(document).unhittable).toEqual([])
  })

  it('все углы под накладками — промах: четыре угла под чужими целями — это одна крышка, а не четыре крестика', () => {
    page('<div class="wbf-host" id="host"><button class="ds-chip" id="chip">c</button>'
      + '<button class="ds-a" id="a1"></button><button class="ds-a" id="a2"></button>'
      + '<button class="ds-a" id="a3"></button><button class="ds-a" id="a4"></button></div>',
    { host: [0, 0, 360, 640], chip: [10, 10, 40, 20],
      a1: [10, 10, 8, 8], a2: [42, 10, 8, 8], a3: [10, 22, 8, 8], a4: [42, 22, 8, 8] })
    const s = scanTargets(document)
    expect(s.small.filter((t) => t.path === 'button.ds-chip').map((t) => [t.hit, corner(t.coveredBy)]))
      .toEqual([[false, 'TL (13.0,13.0) button.ds-a']])
  })

  // СТОПКА ОДНОЙ ШИРИНЫ (DS-333): `EventCalendar/dense` ×0.875 — шесть
  // событий на одном x, сдвиг только по вертикали, низ общий. Каждое нижнее
  // целиком в коробке верхнего, и «накладка» прощала пять, из которых рука
  // открывает одно. Прощение накладки требует свободного ЦЕНТРА.
  it('стопка событий одной ширины — промах у всех, кроме верхнего: центр накрыт соседом', () => {
    const tops = [184, 193, 202, 211, 219, 228]
    const boxes: Record<string, Box> = { host: [0, 0, 360, 640] }
    tops.forEach((t, i) => { boxes[`e${i + 1}`] = [152, t, 35, (i === 5 ? 324.2 : 324) - t] })
    page('<div class="wbf-host" id="host">'
      + tops.map((_, i) => `<button class="ds-eventcal__event" id="e${i + 1}">${i + 1}</button>`).join('') + '</div>',
    boxes)
    const s = scanTargets(document)
    expect(s.total).toBe(6)
    expect(s.unhittable.map((u) => u.path)).toEqual(Array(5).fill('button.ds-eventcal__event'))
    expect(s.unhittable[0]!.coveredBy).toMatch(/накрыт button\.ds-eventcal__event$/)
  })

  it('контроль стопки: крестик у края вкладки прощён и при новом правиле — центр вкладки свободен', () => {
    page('<div class="wbf-host" id="host"><button class="ds-tabs__tab" id="tab">t</button>'
      + '<button class="ds-tabs__close" id="close"></button></div>',
    { host: [0, 0, 360, 640], tab: [10, 10, 120, 40], close: [106, 18, 24, 24] })
    expect(scanTargets(document).unhittable).toEqual([])
  })

  it('`coveredBy` называет накрывшую ЦЕЛЬ, а не лист под точкой (иконку пункта меню)', () => {
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button>'
      + '<button class="ds-dropdown__item" id="item"><span class="ds-icon" id="ico"></span></button></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], item: [0, 0, 20, 20], ico: [0, 0, 20, 20] })
    expect(scanTargets(document).unhittable[0]!.coveredBy)
      .toBe('TL (13.0,13.0) button.ds-dropdown__item; центр (30.0,30.0) — сама цель')
  })

  it('соседний случай: накрывший — не цель, путь до самого узла', () => {
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button>'
      + '<div class="ds-veil" id="veil"><span class="ds-icon" id="ico"></span></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], veil: [0, 0, 20, 20], ico: [0, 0, 20, 20] })
    expect(corner(scanTargets(document).unhittable[0]!.coveredBy)).toBe('TL (13.0,13.0) div.ds-veil > span.ds-icon')
  })

  // ПРОКРУТКА К ЦЕНТРУ. Плавающая кнопка «к последнему» (AgentTranscript) и
  // закреплённая строка итогов (PivotTable) живут у КРАЯ области прокрутки;
  // `nearest` прижимал цель ровно к этому краю. Слой — сосед контейнера, а не
  // его потомок: он не листается вместе с содержимым, как sticky/absolute.
  const floating = () => page('<div class="wbf-host" id="host"><div class="ds-transcript" id="tr">'
    + '<div class="ds-transcript__scroll" id="box" style="overflow-x:auto;overflow-y:auto">'
    + '<button class="ds-codeblock__copy" id="btn">c</button></div>'
    + '<button class="ds-transcript__tail" id="tail">↓</button></div></div>',
  { host: [0, 0, 360, 640], tr: [0, 0, 360, 200], box: [0, 0, 360, 200],
    btn: [10, 500, 40, 40], tail: [0, 170, 360, 30] })

  it('цель в прокрутке листается К ЦЕНТРУ: слой у края области её не накрывает', () => {
    floating()
    const s = scanTargets(document)
    expect(s.unhittable).toEqual([])
    expect(s.total).toBe(2)
  })

  it('модель: `nearest` прижал бы ту же цель к краю под слой — случай выше не пуст', () => {
    // Сосед с известным ответом: без него «к центру» неотличимо от модели,
    // где слой у края не накрывает ничего вовсе.
    floating()
    const btn = document.getElementById('btn')!
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const r = btn.getBoundingClientRect()
    expect(document.elementFromPoint(r.left + 3, r.bottom - 3)?.id).toBe('tail')
  })

  // ПЕРЕНЕСЁННАЯ ССЫЛКА (Prose ×1.5): начинается с середины строки и уходит
  // на следующую. Угол общей коробки лежит на абзаце, а не на ссылке.
  const wrapped = (veil: Box | null) => page('<div class="wbf-host" id="host"><p class="ds-prose__p" id="para">'
    + '<a href="#" id="link">ссылка</a></p>'
    + (veil ? '<div class="ds-veil" id="veil"></div>' : '') + '</div>',
  { host: [0, 0, 360, 640], para: [0, 0, 360, 100], link: [100, 10, 200, 40],
    ...(veil ? { veil } : {}) },
  [0, 0], { link: [[200, 10, 100, 20], [100, 30, 120, 20]] })

  it('строчная цель в несколько фрагментов судится по углам КАЖДОГО фрагмента', () => {
    wrapped(null)
    const s = scanTargets(document)
    expect(s.unhittable).toEqual([])
    expect(s.total).toBe(1)
  })

  it('фрагмент под вуалью — промах, и `coveredBy` называет угол ЭТОГО фрагмента', () => {
    // Сосед: без него «по фрагментам» неотличимо от «строчные не судятся».
    wrapped([100, 45, 10, 10])
    const s = scanTargets(document)
    expect(s.unhittable.map((u) => corner(u.coveredBy))).toEqual(['BL (101.0,49.0) div.ds-veil'])
    expect(s.unhittable[0]!.width, 'размер — по общей коробке').toBe(200)
  })

  // ЗАКРЕПЛЁННОЕ. Содержимое уходит под sticky-хром по определению sticky, и
  // человек его оттуда выкручивает: такой угол — не промах. Но только если
  // ВЫКРУЧИВАЕТ: ближайший контейнер прокрутки слоя содержит цель, листается по
  // оси слоя и прокручен в сторону его отступа (`top` — смещение > 0). Иначе
  // слой лежит на цели и в покое, и это обычное перекрытие. `absolute` и
  // `fixed` — промах по-прежнему (`ds-transcript__tail` — absolute).
  //
  // Цель в контейнере ниже его вида: прокрутка к центру уводит контейнер на
  // 80 px, цель встаёт на 30..70, закреплённый слой 0..40 лежит на её верхних
  // углах.
  // ПЛАВАЮЩИЙ СЛОЙ (DS-331, п. 3): соседка прокрутки, `absolute`.
  // Цель у дна ленты, прокрутка из покоя (0) выводит её к центру, и слой
  // ложится на её нижние углы — ровно так гейт видел `AgentTranscript/tools`.
  const floatingTail = (tab: Box, rest = 0) => {
    page('<div class="wbf-host" id="host"><div class="ds-transcript" id="wrap">'
      + '<div class="ds-transcript__scroll" id="sc" style="overflow-y:auto">'
      + '<div id="fill"></div><button class="ds-btn" id="tab">t</button></div>'
      + '<button class="ds-transcript__tail" id="tail" style="position:absolute">к последнему</button></div></div>',
    { host: [0, 0, 360, 640], wrap: [0, 0, 360, 200], sc: [0, 0, 360, 200], fill: [0, 0, 360, 600], tab,
      tail: [0, 70, 360, 130] })
    document.getElementById('sc')!.scrollTop = rest
    return scanTargets(document)
  }

  it('слой стоит, цель едет, накрытие вызвала прокрутка — угол прощается (AgentTranscript «к последнему»)', () => {
    const s = floatingTail([10, 300, 100, 40])
    expect(s.unhittable.filter((u) => u.path.endsWith('button.ds-btn'))).toEqual([])
  })

  it('тот же слой на цели В ПОКОЕ (контейнер не сдвинут от покоя) — промах', () => {
    // Центр цели выше половины ленты: `scrollIntoView` ленту не листает,
    // смещение равно покою, и прощать нечего — это обычное перекрытие, как у
    // sticky (M1).
    const s = floatingTail([10, 60, 100, 40])
    expect(s.unhittable.filter((u) => u.path.endsWith('button.ds-btn')).map((u) => corner(u.coveredBy)))
      .toEqual(['BL (13.0,97.0) div.ds-transcript > button.ds-transcript__tail'])
  })

  it('контроль: меню над соседом ВНЕ прокрутки — промах, окно везёт меню вместе с соседом (DropdownMenu)', () => {
    // Окно сдвинуто от покоя (сосед ниже фолда), но меню едет с ним — форма
    // «слой стоит» не выполняется. Это и отличает плавающий слой от меню.
    page('<div class="wbf-host" id="host"><div id="fill"></div>'
      + '<button class="ds-btn" id="next">Следующая кнопка</button>'
      + '<div class="ds-dropdown__menu" id="menu" style="position:absolute"></div></div>',
    { host: [0, 0, 360, 640], fill: [0, 0, 360, 2000], menu: [0, 900, 280, 200], next: [10, 1000, 200, 42] })
    const s = scanTargets(document)
    expect(s.unhittable.map((u) => [u.path, corner(u.coveredBy)]))
      .toEqual([['button.ds-btn', expect.stringMatching(/ div\.ds-dropdown__menu$/)]])
  })

  it('промах называет и ЦЕНТР: кто лежит там, куда целится рука', () => {
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="btn">x</button><div class="ds-veil" id="veil"></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], veil: [0, 0, 360, 640] })
    expect(scanTargets(document).unhittable[0]!.coveredBy).toBe('TL (13.0,13.0) div.ds-veil; центр (30.0,30.0) накрыт div.ds-veil')
  })

  it('соседний случай: накрыт только угол — центр назван самой целью', () => {
    page('<div class="wbf-host" id="host">'
      + '<button class="ds-btn" id="btn">x</button><div class="ds-veil" id="veil"></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], veil: [0, 0, 20, 20] })
    expect(scanTargets(document).unhittable[0]!.coveredBy).toBe('TL (13.0,13.0) div.ds-veil; центр (30.0,30.0) — сама цель')
  })

  const stuck = (cover: string, extra = '') => page('<div class="wbf-host" id="host">'
    + '<div class="ds-formtabs" id="sc" style="overflow-x:auto;overflow-y:auto">'
    + '<div id="fill"></div><button class="ds-formtabs__tab" id="tab">t</button>' + cover + '</div>' + extra + '</div>',
  { host: [0, 0, 360, 640], sc: [0, 0, 360, 100], fill: [0, 0, 360, 400], tab: [10, 110, 100, 40],
    home: [0, 0, 360, 40], ico: [0, 0, 360, 40], veil: [100, 140, 20, 20], abs: [0, 80, 360, 40] })

  it('угол под sticky-слоем прокрученного контейнера промахом не считается', () => {
    stuck('<button class="ds-formtabs__home" id="home" style="position:sticky;top:0">⌂</button>')
    const s = scanTargets(document)
    expect(s.unhittable).toEqual([])
    expect(s.total).toBe(2)
  })

  it('sticky — предок накрывшего узла (иконка в закреплённой ячейке) — тоже не промах', () => {
    stuck('<div class="ds-pivot__corner" id="home" style="position:sticky;top:0"><span id="ico"></span></div>')
    expect(scanTargets(document).unhittable).toEqual([])
  })

  it('соседний случай: absolute на том же месте — промах', () => {
    // В ТОМ ЖЕ прокрученном контейнере и с `top`, что и sticky выше: отличает
    // слой только `position`. absolute едет с содержимым, поэтому в модели
    // он стоит там, куда его привезла прокрутка на 80, — на верхних углах цели.
    stuck('<div class="ds-transcript__tail" id="abs" style="position:absolute;top:0"></div>')
    expect(scanTargets(document).unhittable.map((u) => corner(u.coveredBy)))
      .toEqual(['TL (13.0,33.0) div.ds-formtabs > div.ds-transcript__tail'])
  })

  it('прощается УГОЛ, а не цель: остальные углы судятся', () => {
    // Вуаль в координатах документа внутри контейнера: после его прокрутки на
    // 80 она на 100..120 × 60..80 — на правом нижнем углу цели.
    stuck('<div class="ds-pivot__corner" id="home" style="position:sticky;top:0"></div>'
      + '<div class="ds-veil" id="veil"></div>')
    expect(scanTargets(document).unhittable.map((u) => corner(u.coveredBy)))
      .toEqual(['BR (107.0,67.0) div.ds-formtabs > div.ds-veil'])
  })

  it('sticky в контейнере БЕЗ хода прокрутки — промах: из-под слоя не выкрутить', () => {
    // Слой прилип к окну (контейнера нет), а документ не длиннее вьюпорта.
    page('<div class="wbf-host" id="host"><div class="ds-formtabs" id="ft">'
      + '<button class="ds-formtabs__tab" id="tab">t</button>'
      + '<div class="ds-pivot__corner" id="home" style="position:sticky;top:0"></div></div></div>',
    { host: [0, 0, 360, 640], ft: [0, 0, 360, 100], tab: [10, 10, 100, 40], home: [0, 0, 40, 40] })
    expect(scanTargets(document).unhittable.map((u) => corner(u.coveredBy)))
      .toEqual(['TL (13.0,13.0) div.ds-formtabs > div.ds-pivot__corner'])
  })

  it('sticky, лежащий на цели В ПОКОЕ (контейнер не прокручен), — промах', () => {
    // Ход прокрутки есть, но цель у верха: центр упирается в ноль, контейнер
    // не сдвинут, и слой с `top: 10px` лежит на цели там, где его никто не
    // выкручивал, — это перекрытие, а не хром над уехавшим содержимым.
    page('<div class="wbf-host" id="host">'
      + '<div class="ds-formtabs" id="sc" style="overflow-x:auto;overflow-y:auto">'
      + '<div id="fill"></div><button class="ds-formtabs__tab" id="tab">t</button>'
      + '<div class="ds-pivot__corner" id="home" style="position:sticky;top:10px"></div></div></div>',
    { host: [0, 0, 360, 640], sc: [0, 0, 360, 100], fill: [0, 0, 360, 400], tab: [10, 10, 100, 40],
      home: [0, 10, 40, 40] })
    expect(scanTargets(document).unhittable.map((u) => corner(u.coveredBy)))
      .toEqual(['TL (13.0,13.0) div.ds-formtabs > div.ds-pivot__corner'])
  })

  it('sticky из ДРУГОГО контейнера прокрутки (не содержащего цель) — промах', () => {
    // Второй контейнер прокручен на 50, но цель не в нём: его прокрутка её из-под
    // слоя не уводит. Заливка второго не принимает указатель, иначе накрыла бы
    // цель целиком.
    page('<div class="wbf-host" id="host">'
      + '<div class="ds-formtabs" id="sc" style="overflow-x:auto;overflow-y:auto">'
      + '<div id="fill"></div><button class="ds-formtabs__tab" id="tab">t</button></div>'
      + '<div class="ds-other" id="sc2" style="overflow-x:auto;overflow-y:auto">'
      + '<div id="fill2" style="pointer-events:none"></div>'
      + '<div class="ds-pivot__corner" id="home" style="position:sticky;top:0"></div></div></div>',
    { host: [0, 0, 360, 640], sc: [0, 0, 360, 100], fill: [0, 0, 360, 400], tab: [10, 110, 100, 40],
      sc2: [0, 0, 360, 40], fill2: [0, 0, 360, 200], home: [0, 0, 360, 40] })
    document.getElementById('sc2')!.scrollTop = 50
    expect(scanTargets(document).unhittable.map((u) => corner(u.coveredBy)))
      .toEqual(['TL (13.0,33.0) div.ds-other > div.ds-pivot__corner'])
  })

  it('sticky ВЫШЕ общего предка не считается: сосед внутри той же закреплённой полосы — промах', () => {
    // Цель и накрывший живут в ОДНОЙ sticky-полосе и едут вместе: выкрутить
    // одно из-под другого нельзя.
    page('<div class="wbf-host" id="host"><div class="ds-bar" id="bar" style="position:sticky;top:0">'
      + '<button class="ds-formtabs__tab" id="tab">t</button><div class="ds-badge" id="badge"></div></div></div>',
    { host: [0, 0, 360, 640], bar: [0, 0, 360, 100], tab: [10, 10, 100, 40], badge: [0, 0, 40, 40] })
    expect(scanTargets(document).unhittable.map((u) => corner(u.coveredBy))).toEqual(['TL (13.0,13.0) div.ds-bar > div.ds-badge'])
  })

  // СУЖЕНИЯ СЧИТАЮТСЯ, а не выпадают молча — как прокручиваемые области.
  it('инертные и обрезанные в ноль цели не в `total`, но в своих счётчиках; невидимые — нигде', () => {
    page('<div class="wbf-host" id="host">'
      + '<div inert><button class="ds-btn" id="bg">a</button></div>'
      + '<div class="ds-split__pane" id="pane" style="overflow-x:hidden;overflow-y:hidden">'
      + '<button class="ds-btn" id="folded">b</button></div>'
      + '<button class="ds-btn" id="gone" style="visibility:hidden">c</button>'
      + '<button class="ds-btn" id="live">d</button></div>',
    { host: [0, 0, 360, 640], bg: [10, 10, 40, 40], pane: [0, 0, 0, 640], folded: [0, 60, 40, 40],
      gone: [10, 110, 40, 40], live: [100, 100, 40, 40] })
    const s = scanTargets(document)
    expect([s.total, s.inert, s.clipped]).toEqual([1, 1, 1])
  })

  // МНОЖЕСТВО ЦЕЛЕЙ снимается ДО первой прокрутки: иначе прокрутка, сделанная
  // ради одной цели, меняет «в покое»-ответ про обрезку следующей, и замер
  // расходится с подписью, которая не листает ничего.
  it('множество целей замера совпадает с подписью, даже когда прокрутка одной сдвигает клип другой', () => {
    // Внешний клип `overflow-x: clip` (не листается), в нём листаемый
    // контейнер. Первая цель торчит за правый край клипа: прокрутка к центру
    // уводит контейнер вправо на 100, и вторая цель (в покое видимая) уезжает
    // за левый край клипа.
    page('<div class="wbf-host" id="host"><div id="clip" style="overflow-x:clip">'
      + '<div id="sc" style="overflow-x:auto;overflow-y:hidden">'
      + '<button class="ds-btn" id="far">a</button><button class="ds-btn" id="near">b</button></div></div></div>',
    { host: [0, 0, 360, 640], clip: [0, 0, 200, 100], sc: [0, 0, 200, 100], far: [180, 10, 40, 40], near: [10, 10, 40, 40] })
    const sig = targetSignature(document).split(';').filter(Boolean)
    const s = scanTargets(document)
    expect(sig).toHaveLength(2)
    expect(s.total).toBe(sig.length)
  })

  // Предок той же коробки — не накладка: он и есть цель вокруг судимой.
  it('угол, отданный ПРЕДКУ-цели той же коробки, — промах, а не накладка', () => {
    page('<div class="wbf-host" id="host"><div class="ds-row" id="outer" role="button">'
      + '<span class="ds-cell" id="inner" tabindex="0"></span><div class="ds-lid" id="lid"></div></div></div>',
    { host: [0, 0, 360, 640], outer: [10, 10, 40, 40], inner: [10, 10, 40, 40], lid: [10, 10, 10, 10] })
    expect(scanTargets(document).unhittable.map((u) => [u.path, corner(u.coveredBy)]))
      // Накрывший назван ЦЕЛЬЮ, которой принадлежит лист (`coverName`): нажатие
      // на крышку достаётся строке.
      .toEqual([['div.ds-row > span.ds-cell', 'TL (11.0,11.0) div.ds-row']])
  })

  it('ни одного угла во вьюпорте даже после прокрутки — unreachable, а не «не попасть»', () => {
    // Узел уехал за левый край: окно влево дальше нуля не листается. Замер
    // попадания тут не снят — это «не измерено», и обвинять компонент в
    // перекрытии, которого никто не видел, нельзя.
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button></div>',
      { host: [0, 0, 360, 640], btn: [-100, 10, 40, 40] })
    const s = scanTargets(document)
    expect(s.small).toEqual([])
    expect(s.unhittable).toEqual([])
    expect(s.unreachable.map((u) => u.path)).toEqual(['button.ds-btn'])
    expect(s.unreachable[0]!.hit).toBeNull()
  })

  it('прокручиваемая область по-прежнему не цель — исключение по форме цело', () => {
    page('<div class="wbf-host" id="host">'
      + '<div class="ds-log__scroll" id="sc" tabindex="0" style="overflow-x:auto"></div></div>',
    { host: [0, 0, 360, 640], sc: [0, 0, 10, 10] })
    const s = scanTargets(document)
    expect(s.small).toEqual([])
    expect(s.scrollers).toBe(1)
  })

  it('подпись коробок ничего не листает и повторяется, пока кадр стоит', () => {
    // Её зовут КАЖДЫЙ кадр отстаивания: сдвинь она окно или контейнер, кадр
    // уехал бы до замера. Старт окна не с нуля — чтобы «не трогала» не сошло
    // за «вернула в ноль».
    const sc = page('<div class="wbf-host" id="host"><div id="tall"></div>'
      + '<div class="ds-log__scroll" id="box" style="overflow-y:auto"><button class="ds-btn" id="btn">x</button></div></div>',
    { host: [0, 0, 360, 2100], tall: [0, 0, 360, 2000], box: [0, 2000, 360, 100], btn: [10, 2300, 40, 40] }, [0, 30])
    const a = targetSignature(document)
    expect(sc.y).toBe(30)
    expect(sc.inner(document.getElementById('box')!)).toEqual({ l: 0, t: 0 })
    expect(targetSignature(document)).toBe(a)
  })

  it('подпись в координатах ДОКУМЕНТА: прокрутка окна её не меняет, сдвиг цели — меняет', () => {
    const sc = page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button></div>',
      { host: [0, 0, 360, 2000], btn: [10, 10, 40, 40] })
    const a = targetSignature(document)
    window.scrollTo(0, 500)
    expect(sc.y).toBe(500)
    expect(targetSignature(document), 'прокрутка — не раскладка').toBe(a)
    // Цель уехала, не меняя размера (хвост ушёл в «Ещё»): сумма сторон бы
    // этого не заметила, а попадание — заметит.
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button></div>',
      { host: [0, 0, 360, 2000], btn: [60, 10, 40, 40] })
    expect(targetSignature(document)).not.toBe(a)
  })

  it('подпись считает ТЕ ЖЕ цели, что и замер: невидимое вне, прокручиваемое — меткой', () => {
    page('<div class="wbf-host" id="host"><button class="ds-btn" id="btn">x</button>'
      + '<button class="ds-btn" id="gone" style="visibility:hidden">y</button>'
      + '<div class="ds-log__scroll" id="sc" tabindex="0" style="overflow-x:auto"></div></div>',
    { host: [0, 0, 360, 640], btn: [10, 10, 40, 40], gone: [10, 60, 40, 40], sc: [0, 100, 300, 40] })
    const parts = targetSignature(document).split(';')
    const s = scanTargets(document)
    expect(parts.filter((p) => p !== 's')).toHaveLength(s.total)
    expect(parts.filter((p) => p === 's')).toHaveLength(s.scrollers)
    expect(parts).toEqual(['10.0,10.0,40.0,40.0', 's'])
  })

  it('список действий не пуст и не перечисляет имена классов', () => {
    // Санитар формы: поимённое исключение превратило бы гейт в реестр
    // разрешённых нарушений — ровно то, чего случай избегает.
    expect(TARGET_ACT).toContain('button')
    expect(TARGET_ACT).not.toContain('.ds-')
  })

  // ОБЪЯВЛЕННАЯ ЦЕЛЬ (DS-346). Крестик `FormTabs` — `span` без роли
  // внутри кнопки-вкладки: роль ему запрещена `no-nested-interactive`, а
  // обработчик React снаружи не виден вовсе. Разметка здесь — та же
  // вложенность, что у живого компонента.
  const TAB = '<div class="wbf-host" id="host">'
    + '<button class="ds-formtabs__label" id="tab">Накладная'
    + '<span class="ds-formtabs__close" id="close" aria-hidden="true"%ATTR%>×</span>'
    + '</button></div>'
  const tabPage = (attr: string) => page(TAB.replace('%ATTR%', attr),
    { host: [0, 0, 360, 640], tab: [10, 10, 120, 32], close: [106, 16, 20, 20] })

  it('объявленный `data-ds-target` — цель: крестик 20×20 судится по размеру', () => {
    tabPage(' data-ds-target=""')
    const s = scanTargets(document)
    expect(s.total).toBe(2)
    expect(s.small.map((t) => [t.path, t.width, t.height, t.hit]))
      .toEqual([['button.ds-formtabs__label > span.ds-formtabs__close', 20, 20, true]])
  })

  it('сосед с известным ответом: тот же крестик БЕЗ объявления не цель вовсе', () => {
    // Ловушка 5. Без этой половины зелёный выше доказывал бы только то, что
    // модель страницы вообще отдаёт мелкие цели, а не то, что её отдал
    // атрибут: до DS-346 крестик молчал в обоих указателях, и мутация
    // «20×20 в сенсорной ветке» оставалась зелёной.
    tabPage('')
    const s = scanTargets(document)
    expect(s.total).toBe(1)
    expect(s.small).toEqual([])
  })

  // ЦЕНА ОБЪЯВЛЕНИЯ, названная числом. Член `TARGET_ACT` решает не только,
  // КОГО судят, но и КОМУ ПРОЩАЮТ: `ownerTarget` отдаёт ближайшую цель под
  // углом, а накладка прощается, если её коробка лежит ЦЕЛИКОМ внутри
  // судимой. Объявив мелкий узел, мы делаем `owner` глубже и мельче — то
  // есть чаще проходящим `within`. Здесь угол соседа накрыт вкладкой, в
  // которой сидит крестик: без объявления хозяин угла — вкладка (в коробку
  // соседа не влезает, промах), с объявлением — крестик (влезает, прощено).
  // Это не дефект правила, а его следствие, и оно стоит теста: в
  // DS-353 атрибут поедет на узлы 16–24 px, которые проходят `within`
  // тем легче, чем они мельче.
  const overlapped = (attr: string) => page('<div class="wbf-host" id="host">'
    + '<button class="ds-btn" id="b">сосед</button>'
    + `<button class="ds-formtabs__label" id="tab">Форма<span class="ds-formtabs__close" id="close"${attr}>×</span></button>`
    + '</div>',
  { host: [0, 0, 360, 640], b: [100, 100, 60, 60], tab: [95, 95, 34, 34], close: [100, 100, 24, 24] })

  it('объявление УГЛУБЛЯЕТ `ownerTarget` и тем расширяет прощение накладок', () => {
    overlapped('')
    const bare = scanTargets(document)
    expect(bare.unhittable.map((u) => [u.path, corner(u.coveredBy)]))
      .toEqual([['button.ds-btn', 'TL (103.0,103.0) button.ds-formtabs__label']])

    overlapped(' data-ds-target=""')
    const said = scanTargets(document)
    expect(said.total).toBe(bare.total + 1)
    expect(said.unhittable).toEqual([])
  })
})

/** Прогон одного запроса через middleware плагина, без поднятия сервера. */
async function ask(url: string): Promise<{ status: number | 'next'; body: string }> {
  const plugin = gatePlugin(ROOT)
  let handler: ((req: unknown, res: unknown, next: () => void) => void) | null = null
  const server = { middlewares: { use: (h: typeof handler) => { handler = h } } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (plugin.configureServer as any)(server)
  if (!handler) throw new Error('плагин не повесил обработчик')
  return new Promise((done) => {
    let body = ''
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (chunk: string) => { body = chunk; done({ status: res.statusCode, body }) },
    }
    handler!({ url }, res, () => done({ status: 'next', body: '' }))
  })
}
