import { describe, it, expect, afterEach } from 'vitest'
import { frameFacts, frameWhy, type FrameFacts } from './frame-facts.js'

const VIEW = { width: 360 }
const good: FrameFacts = { theme: 'light', scale: '1.5', clientWidth: 360, empty: null }

afterEach(() => {
  document.body.innerHTML = ''
  delete document.documentElement.dataset.theme
  document.documentElement.style.removeProperty('--ds-ui-scale')
})

describe('тот ли кадр мерился — в странице', () => {
  it('хост с содержимым — не пуст; тема и шкала читаются с корня', () => {
    document.body.innerHTML = '<div class="wbf-host"><button>x</button></div>'
    document.documentElement.dataset.theme = 'light'
    document.documentElement.style.setProperty('--ds-ui-scale', '1.15')
    const f = frameFacts(document)
    expect(f.empty).toBeNull()
    expect(f.theme).toBe('light')
    expect(f.scale).toBe('1.15')
  })

  it('четыре вида пустого кадра называются каждый своим именем', () => {
    // Главное — что ни один не проходит как «есть что мерить»; текст — адрес.
    // В живом кадре `.wbf-empty` рисуется ВМЕСТО хоста (`frame-app.tsx`), и
    // такой кадр называется «нет .wbf-host» — красный с менее точным именем.
    document.body.innerHTML = ''
    expect(frameFacts(document).empty).toBe('нет .wbf-host')
    document.body.innerHTML = '<div class="wbf-empty">нет</div>'
    expect(frameFacts(document).empty).toBe('нет .wbf-host')
    document.body.innerHTML = '<div class="wbf-host"><div class="wbf-empty">нет</div></div>'
    expect(frameFacts(document).empty).toBe('кадр «Фикстуры нет»')
    document.body.innerHTML = '<div class="wbf-host"><div class="wbf-error"><p class="wbf-error__text">boom</p></div></div>'
    expect(frameFacts(document).empty).toBe('фикстура упала: boom')
    document.body.innerHTML = '<div class="wbf-host"></div>'
    expect(frameFacts(document).empty).toBe('хост пуст')
  })
})

describe('тот ли кадр мерился — в вердикте', () => {
  it('тот кадр — null', () => {
    expect(frameWhy(good, 1.5, VIEW)).toBeNull()
  })

  it('каждый не тот кадр — своя причина', () => {
    expect(frameWhy({ ...good, empty: 'хост пуст' }, 1.5, VIEW)).toBe('хост пуст')
    expect(frameWhy({ ...good, theme: 'dark' }, 1.5, VIEW)).toBe('тема кадра dark')
    expect(frameWhy({ ...good, scale: '' }, 1.5, VIEW)).toBe('шкала на документе (пусто) вместо 1.5')
    expect(frameWhy({ ...good, scale: '1' }, 1.5, VIEW)).toBe('шкала на документе 1 вместо 1.5')
    expect(frameWhy({ ...good, clientWidth: 345 }, 1.5, VIEW))
      .toBe('clientWidth 345 вместо 360 — мерился не тот вьюпорт')
  })

  it('вьюпорт сверяется с ПЕРЕДАННЫМ, а не с зашитым 360', () => {
    expect(frameWhy({ ...good, clientWidth: 768 }, 1.5, { width: 768 })).toBeNull()
  })
})
