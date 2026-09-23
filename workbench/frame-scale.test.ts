/**
 * Масштаб применяется к КОРНЮ документа кадра, а не к обёртке превью.
 *
 * Токены объявлены как calc(rem * var(--ds-ui-scale)) в :root — переменная,
 * поставленная ниже по дереву, до объявлений не достанет, и компонент вырастет
 * частично: коробки поедут, шрифт нет. Ровно это записано в measure-инварианте
 * «Масштаб: все метрические токены растут вместе».
 */
import { describe, it, expect } from 'vitest'
import { applyScale, applyFrameEnv } from './frame-scale.js'
import { parseFrameUrl } from './frame-url.js'

describe('applyScale', () => {
  it('ставит переменную на корень документа', () => {
    applyScale(document, 1.15)
    expect(document.documentElement.style.getPropertyValue('--ds-ui-scale')).toBe('1.15')
  })

  it('единица снимает переменную, а не пишет «1»', () => {
    applyScale(document, 1.15)
    applyScale(document, 1)
    expect(document.documentElement.style.getPropertyValue('--ds-ui-scale')).toBe('')
  })
})

describe('applyFrameEnv', () => {
  // Оба следствия в одном случае намеренно: applyFrameEnv — единственная
  // точка, которую реально зовёт эффект `Frame` (frame-app.tsx), и тема с
  // масштабом применяются ОДНИМ вызовом — раздельные случаи пропустили бы
  // «применилось одно из двух». Что этот тест НЕ проверяет — сам вызов из
  // эффекта `Frame` — см. комментарий у функции в frame-scale.ts.
  it('применяет тему и масштаб из адреса кадра', () => {
    const state = parseFrameUrl('?c=X&theme=dark&scale=1.15')
    applyFrameEnv(document, state)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--ds-ui-scale')).toBe('1.15')
  })
})
