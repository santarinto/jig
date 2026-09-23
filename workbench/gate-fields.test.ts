/**
 * Чистая половина строки «ширина поля» (DS-344): КОГО обход осматривает,
 * по какому образцу судит и кого пропускает.
 *
 * Числа в jsdom не живут — ни раскладки, ни каскада, — поэтому коробки здесь
 * подставляются руками, а замер текста впрыскивается (`8 px на знак`). Браузер
 * нужен, чтобы СНЯТЬ ширины; решить, узкое поле или нет, можно и без него, и
 * ошибка именно здесь дала бы правдоподобный зелёный отчёт по всему каталогу.
 *
 * Живой кадр держит санитар строки (`scripts/case-fields.mjs`): подложенный
 * `input` 30 px обязан быть назван.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { scanFields, FIELD_SAMPLE, type MeasureText } from './gate-predicates.js'

/** Замер текста — ровно 8 px на знак: образец `31.12.2026` стоит 80, плюс каретка 8. */
const measure: MeasureText = (text) => text.length * 8

/** Коробка узла: в jsdom её нет вовсе, и без подстановки поле невидимо. */
function box(el: Element, width: number, height = 32): void {
  el.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height,
    toJSON: () => ({}),
  }) as DOMRect
  Object.defineProperty(el, 'clientWidth', { value: Math.round(width), configurable: true })
}

/** Поле в хосте кадра, с коробкой и падингами. */
function field(html: string, width: number): Element {
  document.body.innerHTML = `<div class="wbf-host">${html}</div>`
  const el = document.querySelector('input, textarea')!
  box(el, width)
  return el
}

afterEach(() => { document.body.innerHTML = '' })

describe('ширина поля: кого судят и по какому образцу', () => {
  it('поле уже образца названо, с нехваткой и путём', () => {
    field('<input type="text" style="padding:0">', 40)
    const scan = scanFields(document, measure)
    expect(scan.total).toBe(1)
    expect(scan.narrow).toHaveLength(1)
    expect(scan.narrow[0]).toMatchObject({ inner: 40, need: 88, sample: FIELD_SAMPLE })
    expect(scan.narrow[0].path).toContain('input')
  })

  it('поле шире образца не названо', () => {
    field('<input type="text" style="padding:0">', 120)
    expect(scanFields(document, measure).narrow).toEqual([])
  })

  it('падинги вычитаются: судится СОДЕРЖИМОЕ, а не коробка', () => {
    // 100 − 2×8 = 84 при нужных 88: коробка шире порога, содержимое — нет.
    field('<input type="text" style="padding:0 8px">', 100)
    const scan = scanFields(document, measure)
    expect(scan.narrow).toHaveLength(1)
    expect(scan.narrow[0].inner).toBe(84)
  })

  it('`maxlength` сужает образец: ячейка на один знак судится по одному', () => {
    field('<input type="text" maxlength="1" style="padding:0">', 20)
    const scan = scanFields(document, measure)
    expect(scan.total).toBe(1)
    expect(scan.narrow).toEqual([])
  })

  it('`maxlength` не индульгенция: уже собственного знака — всё равно узко', () => {
    field('<input type="text" maxlength="1" style="padding:0">', 10)
    expect(scanFields(document, measure).narrow[0]).toMatchObject({ need: 16, sample: '3' })
  })

  it('числовое поле судится по своему диапазону, а не по дате', () => {
    // `NumberField` системы: `role=spinbutton`, границы в `aria-value*`, `type` нет.
    field('<input role="spinbutton" inputmode="decimal" aria-valuemin="0" aria-valuemax="60" style="padding:0">', 40)
    const scan = scanFields(document, measure)
    expect(scan.narrow).toEqual([])
  })

  it('дробная часть и знак берутся из записи границы', () => {
    field('<input role="spinbutton" aria-valuemin="-1000" aria-valuemax="3.5" style="padding:0">', 20)
    // Длиннее из двух — «-1000» (5 знаков), не «3,5».
    expect(scanFields(document, measure).narrow[0]).toMatchObject({ sample: '-1000', need: 48 })
  })

  it('числовое поле БЕЗ объявленного диапазона судится по образцу', () => {
    field('<input type="number" style="padding:0">', 40)
    expect(scanFields(document, measure).narrow[0].sample).toBe(FIELD_SAMPLE)
  })

  it('флажок, переключатель, ползунок, файл и кнопка не осматриваются вовсе', () => {
    document.body.innerHTML = '<div class="wbf-host">'
      + ['checkbox', 'radio', 'range', 'file', 'color', 'submit', 'button', 'reset', 'hidden']
        .map((t) => `<input type="${t}">`).join('')
      + '<select><option>a</option></select></div>'
    for (const el of document.querySelectorAll('input, select')) box(el, 10)
    const scan = scanFields(document, measure)
    expect(scan.total).toBe(0)
    expect(scan.narrow).toEqual([])
  })

  it('текстовая область судится наравне с однострочным', () => {
    field('<textarea style="padding:0"></textarea>', 40)
    expect(scanFields(document, measure).narrow).toHaveLength(1)
  })

  it('невидимое и инертное пропускаются — и СЧИТАЮТСЯ, а не молчат', () => {
    document.body.innerHTML = '<div class="wbf-host">'
      + '<input class="a" style="padding:0">'
      + '<div inert><input class="b" style="padding:0"></div></div>'
    box(document.querySelector('.a')!, 0)
    box(document.querySelector('.b')!, 40)
    const scan = scanFields(document, measure)
    expect(scan).toMatchObject({ total: 0, invisible: 1, inert: 1 })
    expect(scan.narrow).toEqual([])
  })
})
