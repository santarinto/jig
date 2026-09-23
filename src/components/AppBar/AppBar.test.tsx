import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { AppBar } from './AppBar.js'
import type { CommandAction } from '../CommandBar/CommandBar.js'

const A = (label: string, extra: Partial<CommandAction> = {}): CommandAction => ({ id: label, label, ...extra })

describe('AppBar', () => {
  it('рисует бренд, центр, действия и хвост в banner', () => {
    render(
      <AppBar brand="Курьер 7" actions={[A('Смена')]} trailing={<span>ИП</span>}>
        <input aria-label="Поиск" />
      </AppBar>,
    )
    const bar = screen.getByRole('banner')
    expect(bar).toHaveClass('ds-appbar')
    expect(screen.getByText('Курьер 7')).toBeInTheDocument()
    expect(screen.getByLabelText('Поиск')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Смена' })).toBeInTheDocument()
    expect(bar.querySelector('[data-ds-trailing]')).toHaveTextContent('ИП')
  })

  it('нажатие зовёт `onSelect` своего действия', async () => {
    const shift = vi.fn()
    render(<AppBar brand="Курьер 7" actions={[A('Смена', { onSelect: shift }), A('Отчёты')]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Смена' }))
    expect(shift).toHaveBeenCalledTimes(1)
  })
})

/**
 * СТАРЫЙ ВЫЗОВ — ОШИБКА ТИПА И БРОСОК (DS-306). До 4.3.0 `actions` был
 * `ReactNode`. `@ts-expect-error` здесь — сама проверка типа: перестань старая
 * форма быть ошибкой, `tsc` покраснеет на неиспользованной директиве. Бросок —
 * для потребителя с `any` на пути, где типа уже нет.
 */
describe('AppBar · старая форма `actions`', () => {
  const silence = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  it('узел вместо массива — ошибка типа и бросок с новой формой в тексте', () => {
    const spy = silence()
    // @ts-expect-error — `actions` больше не ReactNode
    expect(() => render(<AppBar brand="Курьер 7" actions={<button>Выйти</button>} />)).toThrow(/CommandAction\[\].*trailing/s)
    spy.mockRestore()
  })

  it('массив узлов — тот же старый вызов, тоже бросок', () => {
    const spy = silence()
    // @ts-expect-error — элементы массива обязаны быть CommandAction
    expect(() => render(<AppBar brand="Курьер 7" actions={[<button key="a">Выйти</button>]} />)).toThrow(/CommandAction\[\]/)
    spy.mockRestore()
  })

  it('без `actions` и с пустым массивом не бросает', () => {
    expect(() => render(<AppBar brand="Курьер 7" />)).not.toThrow()
    expect(() => render(<AppBar brand="Курьер 7" actions={[]} />)).not.toThrow()
  })

  /**
   * Клауза про подпись проверяется РАЗЛИЧЕНИЕМ (DS-358), а не одним
   * случаем: с DS-358 `label` у `CommandAction` — `ReactNode`, и проверка
   * сменилась с `typeof label === 'string'` на присутствие поля. Один случай
   * («без `label` бросает») прошёл бы и на выкинутой клаузе, если бы бросок
   * давало что-то другое, и прошёл бы на вернувшемся `typeof === 'string'`,
   * который ломает законный узел в подписи. Пара отвечает сразу на оба вопроса.
   */
  it('подпись: объект без `label` бросает, узел в `label` — нет', () => {
    const spy = silence()
    // @ts-expect-error — у действия обязателен `label`
    expect(() => render(<AppBar brand="Курьер 7" actions={[{ id: 'x' }]} />)).toThrow(/CommandAction\[\]/)
    spy.mockRestore()
    expect(() => render(<AppBar brand="Курьер 7" actions={[{ id: 'x', label: <b>Смена</b> }]} />)).not.toThrow()
    expect(screen.getByRole('button', { name: 'Смена' })).toBeInTheDocument()
  })
})

/**
 * ПОРЯДОК УСТУПКИ МЕСТА (DS-306): центр → свёртка действий → перенос
 * бренда. Проверяется ПРОВОДКА на подменённых метриках — jsdom раскладки не
 * считает. Сама арифметика — `overflow.test.ts`, настоящий браузер — гейт
 * `overflow` на кадре 360.
 *
 * Метрики: шапка `barW`, бренд 100 в одну строку, действие 100, «Ещё» 60,
 * хвост 50; `gap` и паддинги в jsdom нули (лист не подключён).
 */
describe('AppBar · свёртка хвоста и перенос бренда', () => {
  function withLayout(barW: number, run: () => void) {
    const proto = HTMLElement.prototype
    const client = Object.getOwnPropertyDescriptor(proto, 'clientWidth')
    const width = (el: HTMLElement) => {
      if (el.classList.contains('ds-appbar')) return barW
      if (el.classList.contains('ds-appbar__brand')) return el.style.flex !== '' ? 100 : 40
      // Пол центра читается как min-content на время чтения; в остальное время
      // ширина центра счёту не нужна.
      if (el.classList.contains('ds-appbar__center')) return el.style.width === 'min-content' ? 150 : 0
      if (el.classList.contains('ds-appbar__more')) return 60
      if (el.classList.contains('ds-appbar__trailing')) return 50
      if (el.hasAttribute('data-ds-action')) return 100
      return 0
    }
    Object.defineProperty(proto, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement) { return { width: width(this), height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } },
    })
    Object.defineProperty(proto, 'clientWidth', { configurable: true, get(this: HTMLElement) { return width(this) } })
    try { run() } finally {
      delete (proto as never as Record<string, unknown>).getBoundingClientRect
      if (client) Object.defineProperty(proto, 'clientWidth', client); else delete (proto as never as Record<string, unknown>).clientWidth
    }
  }

  const FOUR = ['Смена', 'Отчёты', 'Настройки', 'Профиль'].map((l) => A(l))
  const shown = (c: HTMLElement) =>
    [...c.querySelectorAll('[data-ds-action]')].filter((el) => !el.hasAttribute('data-ds-folded')).length

  it('всё влезло — свёрнутых нет, бренд не сжимается', () => {
    withLayout(1000, () => {
      const { container } = render(<AppBar brand="Курьер 7" actions={FOUR} />)
      expect(shown(container)).toBe(4)
      expect(container.querySelector('.ds-appbar__more')).toHaveClass('is-idle')
      expect(container.querySelector('.ds-appbar')).not.toHaveClass('is-collapsed')
    })
  })

  it('бренд в бюджете — ШИРИНОЙ В ОДНУ СТРОКУ, а не текущей', () => {
    // 400 − бренд 100 = 300: влезают два действия и «Ещё» (100+100+60).
    // Возьми счёт текущую ширину бренда (40, перенесённый), бюджет вышел бы
    // 360 — три действия и «Ещё», и бренд, вставший в строку, выдавил бы их
    // за край. Мутацией проверено: без снятия сжатия здесь 3.
    withLayout(400, () => {
      const { container } = render(<AppBar brand="Курьер 7" actions={FOUR} />)
      expect(shown(container)).toBe(2)
      expect(container.querySelector('.ds-appbar__actions')).toHaveClass('is-folded')
      expect(container.querySelector('.ds-appbar'), 'бренд переносится раньше, чем свёрнуто всё').not.toHaveClass('is-collapsed')
    })
  })

  it('хвост резервирует ширину раньше действий и в меню не уходит', () => {
    // 360 − бренд 100 − хвост 50 = 210: влезает одно действие и «Ещё».
    withLayout(360, () => {
      const { container } = render(<AppBar brand="Курьер 7" actions={FOUR} trailing={<span>ИП</span>} />)
      expect(shown(container)).toBe(1)
      expect(container.querySelector('[data-ds-trailing]')).not.toHaveAttribute('data-ds-folded')
    })
  })

  it('перенос бренда — ТОЛЬКО когда свёрнуто всё', () => {
    withLayout(200, () => {
      const { container } = render(<AppBar brand="Курьер 7" actions={FOUR} />)
      expect(shown(container)).toBe(0)
      expect(container.querySelector('.ds-appbar')).toHaveClass('is-collapsed')
    })
  })

  it('без действий шапка не «свёрнута», сколько бы ни было места', () => {
    withLayout(50, () => {
      const { container } = render(<AppBar brand="Курьер 7" />)
      expect(container.querySelector('.ds-appbar')).not.toHaveClass('is-collapsed')
    })
  })

  it('центр ВТОРЫМ РЯДОМ — только когда не влезает и при всём свёрнутом', () => {
    // Бренд 100 + пол центра 150 + «Ещё» 60 = 310 > 300: второй ряд, и
    // действия при этом свёрнуты все — уступки накапливаются.
    withLayout(300, () => {
      const { container } = render(<AppBar brand="Курьер 7" actions={FOUR}><input aria-label="Поиск" /></AppBar>)
      expect(container.querySelector('.ds-appbar')).toHaveClass('is-stacked')
      expect(shown(container), 'второй ряд развернул действия в первом').toBe(0)
    })
  })

  it('центр на полу, действия свёрнуты частично — второго ряда нет', () => {
    // 420 − бренд 100 − пол 150 = 170: одно действие и «Ещё».
    withLayout(420, () => {
      const { container } = render(<AppBar brand="Курьер 7" actions={FOUR}><input aria-label="Поиск" /></AppBar>)
      expect(container.querySelector('.ds-appbar')).not.toHaveClass('is-stacked')
      expect(shown(container)).toBe(1)
    })
  })

  it('пол центра входит в бюджет: без него влезло бы больше', () => {
    // Тот же кадр 420 без центра: 320 — два действия и «Ещё». Пара к тесту
    // выше: без неё «одно действие» проходило бы и у счёта, не знающего пола.
    withLayout(420, () => {
      const { container } = render(<AppBar brand="Курьер 7" actions={FOUR} />)
      expect(shown(container)).toBe(2)
    })
  })

  it('пустой центр вторым рядом не встаёт никогда', () => {
    withLayout(120, () => {
      const { container } = render(<AppBar brand="Курьер 7" actions={FOUR} />)
      expect(container.querySelector('.ds-appbar')).not.toHaveClass('is-stacked')
    })
  })

  it('свёрнутое лежит в «Ещё» и нажимается оттуда', async () => {
    const exp = vi.fn()
    withLayout(360, () => {
      render(<AppBar brand="Курьер 7" actions={[...FOUR.slice(0, 3), A('Выгрузка', { onSelect: exp })]} />)
    })
    await userEvent.click(screen.getByRole('button', { name: 'Ещё' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Выгрузка' }))
    expect(exp).toHaveBeenCalledTimes(1)
  })
})
