import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { Toast, NotificationCenter } from '../components/Notifications/Notifications.js'
import { Alert } from '../components/Alert/Alert.js'
import type { ToastTone } from '../components/Notifications/Notifications.js'

/**
 * У карточки с тоном есть НЕ-ЦВЕТОВОЙ носитель тона (DS-157).
 *
 * ЧИСЛО, С КОТОРОГО ВСЁ НАЧАЛОСЬ. Четыре тона `Toast` различала одна полоса
 * слева шириной 2.6px. Яркость полос в чёрно-белом, из 255:
 *
 *     тон        свет   тьма
 *     info        90    158
 *     success     84    135
 *     warning    101    182
 *     error       88    164
 *
 * Между успехом и ошибкой в светлой теме — ЧЕТЫРЕ единицы из 255; на втором,
 * независимом замере (на фикстуре с одинаковым текстом во всех четырёх) вышло
 * ДВЕ. То есть на ч-б снимке тона не различались вовсе, и это не риторика про
 * дальтонизм, а число.
 *
 * ПОЧЕМУ ГЕЙТ, А НЕ ЗАМЕР ЦВЕТА. Контраст полос можно поднять, и проверка на
 * контраст была бы зелёной — при том, что цвет всё равно остался бы
 * ЕДИНСТВЕННЫМ носителем. WCAG 1.4.1 запрещает именно это, независимо от того,
 * насколько цвета различимы между собой. Поэтому проверяется наличие ДРУГОГО
 * канала, а не качество цветового.
 *
 * ТРИ УТВЕРЖДЕНИЯ, и второе — то, ради которого гейт вообще имеет смысл.
 * 1. Носитель есть: знак и слово.
 * 2. Носитель РАЗЛИЧАЕТ: у четырёх тонов четыре разных знака и четыре разных
 *    слова. Один и тот же значок на всех тонах прошёл бы первое утверждение и
 *    не нёс бы ничего — ровно как полоса, у которой все четыре цвета почти
 *    совпали.
 * 3. Знак молчит для диктора (`aria-hidden`), слово молчит для глаза
 *    (`ds-visually-hidden`). Порознь каждый закрывает половину: значок работает
 *    для зрячего дальтоника, слово — для того, кто карточку не видит.
 */
const TONES: ToastTone[] = ['info', 'success', 'warning', 'error']

afterEach(cleanup)

/** Геометрия знака: всё, что рисует SVG, отсортированное. Цвет НЕ участвует. */
function shape(card: Element): string {
  const svg = card.querySelector('svg')
  if (!svg) return ''
  return [...svg.querySelectorAll('path, circle, line, rect')]
    .map((n) => n.tagName + ':' + [...n.attributes]
      .filter((a) => a.name !== 'class')
      .map((a) => `${a.name}=${a.value}`).sort().join(','))
    .sort().join('|')
}

/** Текст, который видит ТОЛЬКО диктор. */
function hiddenWord(card: Element): string {
  return [...card.querySelectorAll('.ds-visually-hidden')].map((n) => n.textContent?.trim()).join(' ')
}

describe('tone-carrier', () => {
  for (const [name, renderOne] of [
    ['Toast', (tone: ToastTone) => render(<Toast tone={tone}>Документ проведён</Toast>).container.querySelector('.ds-toast')!],
    ['NotificationCenter', (tone: ToastTone) => render(
      <NotificationCenter items={[{ id: '1', tone, title: 'Документ проведён' }]} />,
    ).container.querySelector('.ds-notifs__item')!],
    ['Alert', (tone: ToastTone) => render(<Alert tone={tone}>Документ проведён</Alert>).container.querySelector('.ds-alert')!],
  ] as const) {
    it(`${name}: у каждого тона есть знак и слово`, () => {
      const missing: string[] = []
      for (const tone of TONES) {
        const card = renderOne(tone)
        if (!shape(card)) missing.push(`${tone}: НЕТ ЗНАКА`)
        cleanup()
      }
      expect(missing, missing.join('\n')).toEqual([])
    })

    it(`${name}: знаки четырёх тонов РАЗЛИЧАЮТСЯ`, () => {
      const byShape = new Map<string, ToastTone[]>()
      for (const tone of TONES) {
        const s = shape(renderOne(tone))
        byShape.set(s, [...(byShape.get(s) ?? []), tone])
        cleanup()
      }
      const collided = [...byShape.values()].filter((g) => g.length > 1)
      expect(
        collided,
        'один знак на несколько тонов — носитель есть, а различения нет:\n'
        + collided.map((g) => g.join(' = ')).join('\n'),
      ).toEqual([])
    })
  }

  it('Toast: слово тона есть у каждого тона и они РАЗНЫЕ', () => {
    const words = new Map<ToastTone, string>()
    for (const tone of TONES) {
      const card = render(<Toast tone={tone}>Документ проведён</Toast>).container.querySelector('.ds-toast')!
      words.set(tone, hiddenWord(card))
      cleanup()
    }
    const missing = TONES.filter((t) => !words.get(t))
    expect(missing, `тон без слова: ${missing.join(', ')}`).toEqual([])
    expect(new Set(words.values()).size, `слова совпали: ${[...words.values()].join(' / ')}`).toBe(TONES.length)
  })

  it('знак молчит для диктора, слово — для глаза', () => {
    const card = render(<Toast tone="error">Документ проведён</Toast>).container.querySelector('.ds-toast')!
    // Значок объявлен `aria-hidden`: диктор, читающий «графический объект»,
    // хуже, чем не читающий ничего. Поэтому и нужно слово рядом.
    expect(card.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    // Слово стоит ПЕРЕД сообщением: «Ошибка: выписка не загружена», а не
    // наоборот — тон, названный после текста, приходит слишком поздно.
    const hidden = card.querySelector('.ds-visually-hidden')!
    const msg = card.querySelector('.ds-toast__msg')!
    expect(hidden.compareDocumentPosition(msg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('срочность выбирается тоном, а не пропом', () => {
    const roleOf = (tone: ToastTone) => {
      const card = render(<Toast tone={tone}>Текст</Toast>).container.querySelector('.ds-toast')!
      const r = card.getAttribute('role')
      cleanup()
      return r
    }
    expect(roleOf('error')).toBe('alert')
    expect(roleOf('warning')).toBe('alert')
    // Обратная сторона нужна обязательно: `alert` у всех четырёх прошёл бы
    // проверку выше и превратил бы каждое «Сохранено» в перебивание.
    expect(roleOf('success')).toBe('status')
    expect(roleOf('info')).toBe('status')
  })
})
