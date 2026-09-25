import { describe, it, expect } from 'vitest'
import { auditAddress, buildFrameUrl, buildShellUrl, FRAME_KEYS, parseFrameUrl, type FrameState } from './frame-url.js'
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH } from './frame-width.js'

const base: FrameState = {
  c: 'DataTable',
  caseId: 'fixed',
  sid: 3,
  w: null,
  sx: null,
  sy: null,
  theme: 'dark',
  scale: 1.25,
  data: 'rows-500',
  force: 'hover',
  mode: 'states',
  text: 'pseudo',
  aim: true,
  layers: ['tabs'],
  props: { density: 'compact' },
  slots: { actions: 'Button:danger' },
}

describe('адрес кадра', () => {
  it('туда и обратно без потерь', () => {
    expect(parseFrameUrl(buildFrameUrl(base))).toEqual(base)
  })

  it('набор текста: умолчание `ru`, и в адрес оно не пишется', () => {
    // Тем же правилом, что `mode`/`scale`: ссылка на обычный кадр не должна
    // нести поле, которое ничего не меняет. И умолчание здесь ещё и то, что
    // видит потребитель, — то есть безопасное.
    expect(parseFrameUrl('?c=DataTable').text).toBe('ru')
    expect(buildFrameUrl({ ...base, text: 'ru' })).not.toContain('text=')
    expect(buildFrameUrl({ ...base, text: 'pseudo' })).toContain('text=pseudo')
  })

  it('неизвестный набор текста читается как `ru`, а не роняет кадр', () => {
    // Адрес приходит из чужих рук — старая ссылка, опечатка. Белый экран на
    // `text=абв` был бы худшим из возможных ответов.
    expect(parseFrameUrl('?c=DataTable&text=абв').text).toBe('ru')
    expect(parseFrameUrl('?c=DataTable&text=').text).toBe('ru')
  })

  it('ширины в адресе нет — она есть ширина вьюпорта', () => {
    expect(buildFrameUrl(base)).not.toContain('w=')
  })

  it('пустой адрес даёт светлую тему и масштаб 1', () => {
    const s = parseFrameUrl('')
    expect(s.theme).toBe('light')
    expect(s.scale).toBe(1)
    expect(s.layers).toEqual([])
  })

  it('битый масштаб не превращается в NaN', () => {
    expect(parseFrameUrl('?scale=абв').scale).toBe(1)
  })

  // `sx`/`sy` — прокрутка порта, поля адреса ОБОЛОЧКИ (JIG-42, decisions 1.6/1.7).
  it('sx/sy разбираются, нечисло — null, отрицательное — 0 (зажим, как у ширины)', () => {
    expect(parseFrameUrl('?sx=151&sy=480')).toMatchObject({ sx: 151, sy: 480 })
    expect(parseFrameUrl('?sx=abc').sx).toBeNull()
    expect(parseFrameUrl('?sx=-5').sx).toBe(0)
    expect(parseFrameUrl('?sx=151.5').sx).toBe(151.5)
    expect(parseFrameUrl('').sx).toBeNull()
    expect(parseFrameUrl('').sy).toBeNull()
  })

  it('sx/sy не едут в адрес КАДРА', () => {
    const url = buildFrameUrl({ ...base, sx: 151, sy: 480 })
    expect(url).not.toContain('sx=')
    expect(url).not.toContain('sy=')
  })

  it('адрес ОБОЛОЧКИ несёт sx/sy и разбирается обратно, без w при умолчании', () => {
    const url = buildShellUrl({ ...base, w: null, sx: 151, sy: 480 })
    expect(url).toContain('sx=151')
    expect(url).toContain('sy=480')
    expect(url).not.toContain('w=')
    expect(parseFrameUrl(url)).toMatchObject({ sx: 151, sy: 480 })
  })

  it('канвас едет туда и обратно', () => {
    // Вид `canvas` живёт В ДОКУМЕНТЕ кадра (в отличие от `grid`), и адрес —
    // единственное, чем его открывают отдельной вкладкой.
    const s = parseFrameUrl(buildFrameUrl({ ...base, mode: 'canvas' }))
    expect(s.mode).toBe('canvas')
  })

  it('неизвестный вид — обычный кадр, а не пустота', () => {
    // Адрес приходит из чужих рук: старая ссылка, опечатка. Белый экран на
    // `mode=абв` — худший из возможных ответов.
    expect(parseFrameUrl('?c=X&mode=абв').mode).toBe('frame')
    expect(parseFrameUrl('?c=X&mode=').mode).toBe('frame')
  })

  it('все виды разбираются, а не только те, у которых была своя ветка', () => {
    // Санитар на разбор ТАБЛИЦЕЙ: пока он был цепочкой `?:`, каждый новый вид
    // требовал ветки, и забытая ветка отдавала `frame` — правдоподобный ответ
    // не про то, что просили.
    for (const m of ['frame', 'states', 'grid', 'canvas'] as const) {
      expect(parseFrameUrl(`?c=X&mode=${m}`).mode).toBe(m)
    }
  })

  it('несколько позиций и крутилок не путаются между собой', () => {
    const s = parseFrameUrl('?c=X&p.a=1&s.a=Button&p.b=2&s.b=Badge')
    expect(s.props).toEqual({ a: '1', b: '2' })
    expect(s.slots).toEqual({ a: 'Button', b: 'Badge' })
  })

  /**
   * Ширина кадра в адресе ОБОЛОЧКИ (DS-345), и только в нём.
   *
   * Предмет — две половины одного решения, и порознь ни одна не проверяема.
   * Половина первая: узкое состояние обязано открываться ссылкой, иначе
   * «смотрел на 360» значит два разных сценария (переход 768 → 360 и прямая
   * загрузка 360), которые у компонентов с JS-раскладкой дают разные числа —
   * на приёмке 328/334 человек и браузерный агент получили EventCalendar/week
   * на понедельнике и на среде, оба верно. Половина вторая: в адресе КАДРА
   * ширины по-прежнему нет, потому что там она была бы обещанием вьюпорта,
   * которого кадр не держит.
   *
   * Поэтому у каждого случая ниже есть пара: что пишет `buildShellUrl` и чего
   * не пишет `buildFrameUrl` — на ОДНОМ и том же состоянии. Сборщик, забывший
   * про разницу, покраснеет ровно на одной из них.
   */
  describe('ширина кадра — в адресе оболочки, не кадра (DS-345)', () => {
    it('оболочка пишет ширину, кадр — нет, из одного состояния', () => {
      const s = { ...base, w: 440 }
      expect(buildShellUrl(s)).toContain('w=440')
      expect(buildFrameUrl(s)).not.toContain('w=')
    })

    it('умолчание и `null` в адрес не пишутся — ссылка не несёт того, что ничего не меняет', () => {
      expect(buildShellUrl({ ...base, w: DEFAULT_WIDTH })).not.toContain('w=')
      expect(buildShellUrl({ ...base, w: null })).not.toContain('w=')
    })

    it('ширина едет туда и обратно через адрес оболочки', () => {
      expect(parseFrameUrl(buildShellUrl({ ...base, w: 520 })).w).toBe(520)
    })

    it('ширины нет в адресе — `null`, а не умолчание числом', () => {
      // Различие несущее: `null` значит «не сказано», и только оболочка решает,
      // что подставить. Число здесь завело бы второй ответ на «какое умолчание».
      expect(parseFrameUrl('?c=X').w).toBeNull()
      expect(parseFrameUrl('?c=X&w=').w).toBeNull()
    })

    it('нечисло — умолчание, а не 440: `clampWidth(NaN)` отдал бы MIN_WIDTH', () => {
      // Тот же довод, что у `mode=абв`: адрес приходит из чужих рук. Кадр в
      // 440 px — правдоподобная картинка не про то, что просили, и это хуже
      // белого экрана: её не с чем сравнить.
      expect(parseFrameUrl('?c=X&w=абв').w).toBeNull()
      expect(parseFrameUrl('?c=X&w=NaN').w).toBeNull()
    })

    it('число вне пределов ПРИЖИМАЕТСЯ, а не отбрасывается', () => {
      // Оборотная сторона предыдущего: `w=99999` — внятное «как можно шире», а
      // не опечатка, и отвечать на него умолчанием значило бы терять просьбу.
      expect(parseFrameUrl('?c=X&w=99999').w).toBe(MAX_WIDTH)
      expect(parseFrameUrl('?c=X&w=1').w).toBe(MIN_WIDTH)
    })
  })
})

/**
 * Аудит адреса ЗАГРУЗКИ (JIG-40, решение спецификации п.2а/п.3): что из
 * `location.search`, захваченного до `createRoot`, `parseFrameUrl` не
 * прочитал, заменил или проигнорировал — это и есть опечатка агента, до того
 * как её можно прочесть глазами (адрес переписывается зеркалом за 250 мс).
 */
describe('аудит адреса', () => {
  it('чистый адрес оболочки — ни одной находки', () => {
    const search = '?c=Tabs&case=many&theme=dark&scale=1.5&mode=states&text=pseudo&aim=1'
      + '&layers=tabstops&data=long&p.size=sm&s.left=Badge:base&w=1024'
    expect(auditAddress(search, 'shell')).toEqual({
      of: 'shell',
      asked: expect.any(Object),
      unknown: [],
      replaced: [],
      ignored: [],
    })
  })

  it('умолчания, записанные ЯВНО, — не опечатка', () => {
    const search = '?c=Tabs&scale=1&mode=frame&text=ru&aim=0&w=768'
    const a = auditAddress(search, 'shell')
    expect(a.unknown).toEqual([])
    expect(a.replaced).toEqual([])
    expect(a.ignored).toEqual([])
  })

  it('неизвестный ключ — в unknown', () => {
    expect(auditAddress('?c=Tabs&wdth=768', 'shell').unknown).toEqual(['wdth'])
  })

  it('известный ключ с непонятым значением — в replaced, используемое значение — умолчание или канон', () => {
    expect(auditAddress('?c=X&mode=gird', 'shell').replaced).toEqual([{ key: 'mode', asked: 'gird', used: 'frame' }])
    expect(auditAddress('?c=X&theme=drak', 'shell').replaced).toEqual([{ key: 'theme', asked: 'drak', used: 'light' }])
    expect(auditAddress('?c=X&text=psuedo', 'shell').replaced).toEqual([{ key: 'text', asked: 'psuedo', used: 'ru' }])
    expect(auditAddress('?c=X&scale=abc', 'shell').replaced).toEqual([{ key: 'scale', asked: 'abc', used: '1' }])
  })

  it('scale=1.50 не заменено — сравнение числом, а не строкой', () => {
    expect(auditAddress('?c=X&scale=1.50', 'shell').replaced).toEqual([])
  })

  it('w в адресе ОБОЛОЧКИ: непонятое — умолчание, вне пределов — прижатое', () => {
    expect(auditAddress('?c=X&w=abc', 'shell').replaced).toEqual([{ key: 'w', asked: 'abc', used: '768' }])
    expect(auditAddress('?c=X&w=99999', 'shell').replaced).toEqual([{ key: 'w', asked: '99999', used: '2560' }])
  })

  it("'frame': w и mode=grid не действуют — ignored, а не replaced", () => {
    const w = auditAddress('?c=X&w=768', 'frame')
    expect(w.ignored[0]?.key).toBe('w')
    expect(w.replaced).toEqual([])

    const grid = auditAddress('?c=X&mode=grid', 'frame')
    expect(grid.ignored.map((i) => i.key)).toEqual(['mode'])
  })

  it("'shell': sid не действует — оболочка всегда начинает новую сессию", () => {
    const a = auditAddress('?c=X&sid=5', 'shell')
    expect(a.ignored.map((i) => i.key)).toEqual(['sid'])
  })

  it("'shell': sx/sy разбираются, непонятое — replaced на умолчание, отрицательное — прижатое", () => {
    const clean = auditAddress('?c=X&sx=151&sy=480', 'shell')
    expect(clean.unknown).toEqual([])
    expect(clean.replaced).toEqual([])
    expect(clean.ignored).toEqual([])

    expect(auditAddress('?c=X&sx=abc', 'shell').replaced).toEqual([{ key: 'sx', asked: 'abc', used: '' }])
    expect(auditAddress('?c=X&sx=-5', 'shell').replaced).toEqual([{ key: 'sx', asked: '-5', used: '0' }])
    expect(auditAddress('?c=X&sx=151.50', 'shell').replaced).toEqual([])
  })

  it("'frame': sx/sy не действуют — ignored, довод без «=», держатель назван", () => {
    const a = auditAddress('?c=X&sx=151', 'frame')
    expect(a.ignored[0]?.key).toBe('sx')
    expect(a.ignored[0]?.why).toContain('держатель')
    expect(a.ignored[0]?.why).not.toContain('=')
    expect(a.replaced).toEqual([])
  })

  it('повтор ключа — игнорируется, действует первое вхождение', () => {
    const a = auditAddress('?mode=states&mode=canvas', 'shell')
    expect(a.ignored).toEqual([{ key: 'mode', why: 'повтор — действует первое' }])
    expect(a.replaced).toEqual([])
  })

  it('ни одной строки адреса в ответе — BLOCKED режет строку целиком', () => {
    const search = '?c=Tabs&wdth=768&mode=gird&w=99999&p.size=sm&s.left=Badge:base'
    const json = JSON.stringify(auditAddress(search, 'shell'))
    expect(json).not.toMatch(/[?&][\w.]+=/)
  })

  it('FRAME_KEYS — полный список того, что пишет buildShellUrl, в обе стороны', () => {
    const s: FrameState = {
      c: 'X', caseId: 'y', sid: 1, theme: 'dark', scale: 1.5, data: 'd', force: 'f',
      mode: 'states', text: 'pseudo', aim: true, layers: ['a'], props: {}, slots: {}, w: 1024,
      sx: 151, sy: 480,
    }
    const keys = new Set(new URLSearchParams(buildShellUrl(s).slice(1)).keys())
    expect(keys).toEqual(new Set(FRAME_KEYS))
  })
})
