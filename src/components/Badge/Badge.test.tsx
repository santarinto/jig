import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Badge, type BadgeProps } from './Badge.js'

describe('Badge', () => {
  it('renders with a tone modifier', () => {
    render(<Badge tone="success">Проведён</Badge>)
    const el = screen.getByText('Проведён')
    expect(el).toHaveClass('ds-badge', 'ds-badge--success')
  })
  it('defaults to neutral tone', () => {
    render(<Badge>Черновик</Badge>)
    expect(screen.getByText('Черновик')).toHaveClass('ds-badge--neutral')
  })

  describe('цвет из данных потребителя', () => {
    it('кладёт значение в переменную, а не в свойство', () => {
      render(<Badge brand="#c026d3">Срочно</Badge>)
      const el = screen.getByText('Срочно')
      expect(el.style.getPropertyValue('--ds-badge-brand')).toBe('#c026d3')
      // Именно это и есть предмет решения: цвет НЕ становится указанием, что
      // покрасить. Инлайновый background отдал бы потребителю и выбор цвета
      // метки — то есть читаемость.
      expect(el.style.background).toBe('')
      expect(el.style.color).toBe('')
    })

    it('проп сам включает тон — половинчатой настройки не бывает', () => {
      render(<Badge brand="#c026d3">Срочно</Badge>)
      expect(screen.getByText('Срочно')).toHaveClass('ds-badge--brand')
    })

    /**
     * Инвариант, на котором держится отсутствие запасного правила в листе:
     * класс `ds-badge--brand` не может оказаться на элементе без переменной.
     * Пока он верен, `var(--ds-badge-brand, ...)` в CSS был бы правилом, до
     * которого нельзя дойти; сломается он — CSS начнёт красить сырым `oklch(from
     * <ничего>)`, то есть не покрасит вовсе, и бейдж потеряет подложку.
     *
     * Проверяется на мусоре ИЗ БАЗЫ, а не на выдуманном: пустая строка (колонка
     * есть, значение не заполнено), хекс без решётки (частая форма хранения),
     * имя цвета, `var()` (у неопределённой переменной значение невалидно на
     * ВЫЧИСЛЕНИИ — фолбэк в листе от этого не спасает, потому и не пускаем).
     */
    it.each(['', 'c026d3', 'red', 'var(--tag-color)', 'rgb(192,38,211)', '#12345', 'javascript:1'])(
      'значение %o не хекс — ни класса, ни переменной, вид neutral',
      (value) => {
        render(<Badge brand={value}>Тег</Badge>)
        const el = screen.getByText('Тег')
        expect(el).toHaveClass('ds-badge--neutral')
        expect(el).not.toHaveClass('ds-badge--brand')
        expect(el.style.getPropertyValue('--ds-badge-brand')).toBe('')
      },
    )

    it.each(['#c0f', '#c0f8', '#c026d3', '#c026d380'])('хекс %s принимается во всех четырёх длинах', (value) => {
      render(<Badge brand={value}>Тег</Badge>)
      const el = screen.getByText('Тег')
      expect(el).toHaveClass('ds-badge--brand')
      expect(el.style.getPropertyValue('--ds-badge-brand')).toBe(value)
      // Альфа доезжает до переменной и снимается уже в CSS (`/ 1`): снять её
      // здесь значило бы решать за лист, а замер меряет то, что нарисовано.
    })

    /**
     * Шов с `ToggleGroup variant="swatch"`: `SwatchItem.swatch` ожидает ровно
     * такую строку, и `brand` обязан принимать её как есть, без похода в CSS
     * за значением переменной руками.
     */
    it('токен var(--ds-chart-3) красит наравне с хексом', () => {
      render(<Badge brand="var(--ds-chart-3)">Тег</Badge>)
      const el = screen.getByText('Тег')
      expect(el).toHaveClass('ds-badge--brand')
      expect(el.style.getPropertyValue('--ds-badge-brand')).toBe('var(--ds-chart-3)')
    })

    /**
     * Различением, а не счётчиком: три формы, каждая ломает регулярку токена
     * по своей причине, и все три обязаны дать ровно то же neutral-мусорное
     * поведение, что и нехекс.
     * - `var(--ds-chart-9)` — девятого номера в восьмицветной палитре нет.
     * - `var(--ds-accent)` — произвольный `var()` не пускается: `brand` несёт
     *   ЗНАЧЕНИЕ, а не ссылку на любой токен системы.
     * - `chart-3` — голое имя без обёртки `var(...)`: `brand` несёт значение
     *   цвета, а не имя токена.
     */
    it.each(['var(--ds-chart-9)', 'var(--ds-accent)', 'chart-3'])(
      'отказ токену %s — ни класса, ни переменной, вид neutral',
      (value) => {
        render(<Badge brand={value}>Тег</Badge>)
        const el = screen.getByText('Тег')
        expect(el).toHaveClass('ds-badge--neutral')
        expect(el).not.toHaveClass('ds-badge--brand')
        expect(el.style.getPropertyValue('--ds-badge-brand')).toBe('')
      },
    )

    /**
     * Взаимоисключение держится броском, а не типом: союз типов ломал
     * `interface Свой extends BadgeProps`, то есть обычный способ обернуть
     * компонент. Цена названа — проверка позже компиляции.
     */
    it('tone и brand вместе — бросок, а не молчаливый выбор одного', () => {
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        expect(() => render(<Badge tone="error" brand="#c026d3">Отменён</Badge>))
          .toThrow(/tone.*brand|brand.*tone/)
      } finally { quiet.mockRestore() }
    })

    // Бросок читает `brand !== undefined`, а не форму значения — токен обязан
    // ломать пару тем же путём, что и хекс, иначе взаимоисключение держится
    // только на одной из двух форм значения.
    it('tone и brand-токен вместе — тот же бросок', () => {
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        expect(() => render(<Badge tone="error" brand="var(--ds-chart-3)">Отменён</Badge>))
          .toThrow(/tone.*brand|brand.*tone/)
      } finally { quiet.mockRestore() }
    })

    it('BadgeProps остаётся интерфейсом — потребитель им расширяется', () => {
      // Утверждение о ТИПЕ: если `BadgeProps` снова станет союзом, эта строка
      // не скомпилируется («An interface can only extend an object type…»),
      // то есть гейт краснеет под `npm run typecheck`, а не под vitest.
      interface Свой extends BadgeProps { hint?: string }
      const p: Свой = { tone: 'success', hint: 'подсказка' }
      expect(p.hint).toBe('подсказка')
    })

    it('не затирает style потребителя', () => {
      render(<Badge brand="#c026d3" style={{ marginLeft: '4px' }}>Срочно</Badge>)
      const el = screen.getByText('Срочно')
      expect(el.style.marginLeft).toBe('4px')
      expect(el.style.getPropertyValue('--ds-badge-brand')).toBe('#c026d3')
    })
  })
})
