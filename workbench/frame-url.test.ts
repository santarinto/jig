import { describe, it, expect } from 'vitest'
import { parseFrameUrl, buildFrameUrl, buildShellUrl, type FrameState } from './frame-url.js'
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH } from './frame-width.js'

const base: FrameState = {
  c: 'DataTable',
  caseId: 'fixed',
  sid: 3,
  w: null,
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
      const s = { ...base, w: 360 }
      expect(buildShellUrl(s)).toContain('w=360')
      expect(buildFrameUrl(s)).not.toContain('w=')
    })

    it('умолчание и `null` в адрес не пишутся — ссылка не несёт того, что ничего не меняет', () => {
      expect(buildShellUrl({ ...base, w: DEFAULT_WIDTH })).not.toContain('w=')
      expect(buildShellUrl({ ...base, w: null })).not.toContain('w=')
    })

    it('ширина едет туда и обратно через адрес оболочки', () => {
      expect(parseFrameUrl(buildShellUrl({ ...base, w: 412 })).w).toBe(412)
    })

    it('ширины нет в адресе — `null`, а не умолчание числом', () => {
      // Различие несущее: `null` значит «не сказано», и только оболочка решает,
      // что подставить. Число здесь завело бы второй ответ на «какое умолчание».
      expect(parseFrameUrl('?c=X').w).toBeNull()
      expect(parseFrameUrl('?c=X&w=').w).toBeNull()
    })

    it('нечисло — умолчание, а не 240: `clampWidth(NaN)` отдал бы MIN_WIDTH', () => {
      // Тот же довод, что у `mode=абв`: адрес приходит из чужих рук. Кадр в
      // 240 px — правдоподобная картинка не про то, что просили, и это хуже
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
