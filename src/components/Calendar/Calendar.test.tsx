import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Calendar } from './Calendar.js'

describe('Calendar', () => {
  it('renders current-month days plus greyed leading days and emits ISO on click', async () => {
    const onSelect = vi.fn()
    // February 2024 (leap) starts on Thursday → 3 leading days from January.
    const { container } = render(<Calendar year={2024} month={1} selectedId="2024-02-10" onSelect={onSelect} />)
    expect(container.querySelectorAll('.ds-cal__day:not(.ds-cal__day--out)')).toHaveLength(29)
    expect(container.querySelectorAll('.ds-cal__day--out')).toHaveLength(3)
    expect(screen.getByRole('button', { name: /10 февраля 2024/ })).toHaveClass('is-selected')
    await userEvent.click(screen.getByRole('button', { name: /15 февраля 2024/ }))
    expect(onSelect).toHaveBeenCalledWith('2024-02-15')
  })

  it('marks weekend header cells and weekend days', () => {
    const { container } = render(<Calendar year={2024} month={1} />)
    expect(container.querySelectorAll('.ds-cal__dow--weekend')).toHaveLength(2)
    expect(container.querySelectorAll('.ds-cal__day--weekend').length).toBeGreaterThan(0)
  })

  it('shows year/month dropdowns and arrows only with onNavigate, and navigates', async () => {
    const onNavigate = vi.fn()
    const { rerender } = render(<Calendar year={2024} month={1} />)
    expect(screen.queryByLabelText('Месяц')).toBeNull()

    rerender(<Calendar year={2024} month={1} onNavigate={onNavigate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    expect(onNavigate).toHaveBeenCalledWith(2024, 2)

    await userEvent.selectOptions(screen.getByLabelText('Год'), '2025')
    expect(onNavigate).toHaveBeenCalledWith(2025, 1)
  })

  it('disables days outside min/max', () => {
    render(<Calendar year={2024} month={1} min="2024-02-05" max="2024-02-20" />)
    expect(screen.getByRole('button', { name: /\b3 февраля 2024/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /10 февраля 2024/ })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /25 февраля 2024/ })).toBeDisabled()
  })

  it('shows the Today button when onToday is given', async () => {
    const onToday = vi.fn()
    render(<Calendar year={2024} month={1} onToday={onToday} />)
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
    expect(onToday).toHaveBeenCalled()
  })

  it('styles the selected day with accent fill, not success border', () => {
    const css = readFileSync(resolve(__dirname, 'Calendar.css'), 'utf8')
    const block = css.match(/\.ds-cal__day\.is-selected\s*\{([^}]+)\}/)
    expect(block, 'missing .ds-cal__day.is-selected rule').not.toBeNull()
    expect(block![1]).toMatch(/var\(--ds-accent\)/)
    expect(block![1]).toMatch(/var\(--ds-text-on-accent\)/)
    expect(block![1]).not.toMatch(/var\(--ds-success\)/)
  })

  it('single-month mode keeps the original grid structure (backward compatible)', () => {
    const { container } = render(<Calendar year={2024} month={1} />)
    expect(container.querySelector('.ds-cal__months')).toBeNull()
    expect(container.querySelector('.ds-cal__grid')).not.toBeNull()
    expect(container.querySelectorAll('.ds-cal__grid')).toHaveLength(1)
  })

  it('readOnly prevents day selection on click', async () => {
    const onSelect = vi.fn()
    const { container } = render(<Calendar year={2024} month={1} readOnly onSelect={onSelect} />)
    const day = container.querySelector('.ds-cal__day:not(.ds-cal__day--out)')!
    await userEvent.click(day)
    expect(onSelect).not.toHaveBeenCalled()
    expect(container.querySelector('button.ds-cal__day')).toBeNull()
  })

  it('shows accent mark dot for markedDates', () => {
    render(
      <Calendar year={2024} month={1} markedDates={['2024-02-10']} />,
    )
    const day = screen.getByRole('button', { name: /10 февраля 2024/ })
    expect(day.querySelector('.ds-cal__mark')).not.toBeNull()
    expect(day).toHaveClass('ds-cal__day--mark-accent')
  })

  it('marks tone overrides markedDates', () => {
    render(
      <Calendar
        year={2024}
        month={1}
        markedDates={['2024-02-10']}
        marks={{ '2024-02-10': 'warning' }}
      />,
    )
    expect(screen.getByRole('button', { name: /10 февраля 2024/ })).toHaveClass('ds-cal__day--mark-warning')
  })

  it('renders three month grids and navigates the whole group', async () => {
    const onNavigate = vi.fn()
    const { container } = render(
      <Calendar year={2024} month={6} months={3} onNavigate={onNavigate} />,
    )
    expect(container.querySelectorAll('.ds-cal__month')).toHaveLength(3)
    expect(screen.getByText('Июнь 2024')).toBeInTheDocument()
    expect(screen.getByText('Июль 2024')).toBeInTheDocument()
    expect(screen.getByText('Август 2024')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    expect(onNavigate).toHaveBeenCalledWith(2024, 7)
  })
})

/* Обратная связь портала: календарь внутри Card — это рамка в рамке, а в
   мультимесячном режиме без onNavigate текущий месяц подписан дважды. */
describe('Calendar inside someone else’s container', () => {
  it('captions the anchor month once, not twice, in multi-month mode', () => {
    render(<Calendar year={2026} month={6} months={3} />)
    // Общий заголовок «Июль 2026» дублировал подпись над самой панелью.
    expect(screen.getAllByText(/Июль/)).toHaveLength(1)
  })

  it('keeps the single shared caption when there is only one month', () => {
    render(<Calendar year={2026} month={6} />)
    expect(screen.getAllByText(/Июль 2026/)).toHaveLength(1)
  })

  it('drops the panel chrome when embedded', () => {
    const { container } = render(<Calendar year={2026} month={6} embedded />)
    expect(container.querySelector('.ds-cal')).toHaveClass('ds-cal--embedded')
  })

  it('is a standalone panel by default', () => {
    const { container } = render(<Calendar year={2026} month={6} />)
    expect(container.querySelector('.ds-cal')).not.toHaveClass('ds-cal--embedded')
  })

  it('gives the embedded modifier its own rule that unsets border, shadow and padding', () => {
    const css = readFileSync(resolve(__dirname, 'Calendar.css'), 'utf8')
    const block = css.match(/\.ds-cal--embedded\s*\{([^}]+)\}/)
    expect(block, 'нет правила .ds-cal--embedded').not.toBeNull()
    for (const prop of ['border', 'box-shadow', 'padding', 'display']) {
      expect(block![1], `.ds-cal--embedded не снимает ${prop}`).toMatch(new RegExp(`${prop}\\s*:`))
    }
    // Специфичность у .ds-cal и .ds-cal--embedded одинаковая (0,1,0), поэтому
    // решает порядок. Объявленный выше модификатор проигрывает молча: класс на
    // месте, свойства в файле, а рамка с тенью остаются (замер это и показал).
    expect(css.indexOf('.ds-cal--embedded'),
      '.ds-cal--embedded объявлен до .ds-cal и потому не действует')
      .toBeGreaterThan(css.indexOf('.ds-cal {'))
  })
})

describe('Calendar header in multi-month mode', () => {
  it('does not leave an empty header taking up space', () => {
    const { container } = render(<Calendar year={2026} month={6} months={3} />)
    // Заголовок в мультимесячном режиме не рисуется, но пустой .ds-cal__header
    // держал margin-bottom и давал лишние ~16px над подписями месяцев.
    expect(container.querySelector('.ds-cal__header')).toBeNull()
  })

  it('keeps the header when there is something to put in it', () => {
    const { container } = render(<Calendar year={2026} month={6} />)
    expect(container.querySelector('.ds-cal__header')).toBeInTheDocument()
  })
})

/**
 * Доступное имя ячейки — полная дата, а не число.
 *
 * Кнопка дня содержала только цифру, поэтому скринридер объявлял «15, кнопка».
 * Ни месяца, ни года, ни дня недели: в режиме `months={3}` на экране три
 * пятнадцатых числа подряд, и различить их на слух нельзя вовсе. Цифра при этом
 * остаётся видимой — меняется имя, а не текст.
 *
 * Формат берём из `Intl` с локалью, а не из руками написанной таблицы: «15
 * марта» требует родительного падежа, а `MONTHS` в файле именительные. Проп
 * `formatDay` — для тех, у кого локаль не `ru-RU`, симметрично `formatDay` у
 * Timeline и `formatTooltip` у Heatmap.
 */
describe('Calendar · доступное имя дня', () => {
  it('день объявляется полной датой, а видимым остаётся число', () => {
    render(<Calendar year={2026} month={2} onSelect={() => {}} />)
    const day = screen.getByRole('button', { name: /15 марта 2026/ })
    expect(day).toHaveTextContent('15')
    expect(day.textContent!.trim()).toBe('15')
  })

  it('в трёхмесячном режиме три пятнадцатых различимы по имени', () => {
    render(<Calendar year={2026} month={2} months={3} onSelect={() => {}} onNavigate={() => {}} />)
    expect(screen.getByRole('button', { name: /15 февраля 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /15 марта 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /15 апреля 2026/ })).toBeInTheDocument()
  })

  it('formatDay перебивает встроенный формат', () => {
    render(<Calendar year={2026} month={2} onSelect={() => {}} formatDay={(id) => `день ${id}`} />)
    expect(screen.getByRole('button', { name: 'день 2026-03-15' })).toBeInTheDocument()
  })

  it('readOnly-ячейка тоже названа датой — она не кнопка, но и не безымянная', () => {
    const { container } = render(<Calendar year={2026} month={2} readOnly />)
    const day = [...container.querySelectorAll('.ds-cal__day')]
      .find((el) => el.textContent!.trim() === '15')!
    expect(day).toHaveAttribute('aria-label', expect.stringMatching(/15 марта 2026/))
  })
})

/**
 * Сетка дней — 42 кнопки, то есть 42 таб-стопа на месяц и 126 при `months={3}`.
 * Пройти календарь табом до следующего поля формы было отдельным упражнением.
 *
 * Клавиатурная модель сетки обратная: внутрь ведёт один Tab, дальше работают
 * стрелки. В порядке табуляции ровно одна ячейка — выбранная, а если выбора нет,
 * первая доступная.
 */
describe('Calendar · клавиатурная навигация по дням', () => {
  const stops = (c: HTMLElement) => [...c.querySelectorAll('.ds-cal__day')]
    .filter((el) => el.getAttribute('tabindex') !== '-1')

  it('в порядке табуляции ровно одна ячейка — выбранная', () => {
    const { container } = render(
      <Calendar year={2026} month={2} selectedId="2026-03-15" onSelect={() => {}} />,
    )
    expect(stops(container)).toHaveLength(1)
    expect(stops(container)[0]).toBe(screen.getByRole('button', { name: /15 марта 2026/ }))
  })

  it('без выбора таб-стоп один — первый доступный день', () => {
    const { container } = render(<Calendar year={2026} month={2} onSelect={() => {}} />)
    expect(stops(container)).toHaveLength(1)
  })

  it('стрелки двигают фокус: вправо на день, вниз на неделю', async () => {
    render(<Calendar year={2026} month={2} selectedId="2026-03-15" onSelect={() => {}} />)
    const start = screen.getByRole('button', { name: /15 марта 2026/ })
    start.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: /16 марта 2026/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: /23 марта 2026/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: /22 марта 2026/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('button', { name: /15 марта 2026/ })).toHaveFocus()
  })

  it('Home и End — начало и конец недели, а не месяца', async () => {
    render(<Calendar year={2026} month={2} selectedId="2026-03-18" onSelect={() => {}} />)
    screen.getByRole('button', { name: /18 марта 2026/ }).focus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('button', { name: /16 марта 2026/ })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('button', { name: /22 марта 2026/ })).toHaveFocus()
  })

  // Имя проверки — то, что она утверждает, а не то, чего от неё хотелось.
  // Первая версия называлась «перешагивает недоступный день», а утверждала
  // «фокус остаётся»: это разные заявления, и второе — верное. Перешагивать
  // нечего: min/max гасят непрерывный префикс и суффикс, дыры посреди сетки
  // этим API не собрать.
  it('упирается в границу min: идти некуда — фокус остаётся на месте', async () => {
    render(<Calendar year={2026} month={2} selectedId="2026-03-15" min="2026-03-15" onSelect={() => {}} />)
    const start = screen.getByRole('button', { name: /15 марта 2026/ })
    start.focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(start).toHaveFocus()
  })

  it('стрелка не листает страницу — событие погашено', async () => {
    render(<Calendar year={2026} month={2} selectedId="2026-03-15" onSelect={() => {}} />)
    const grid = screen.getByRole('button', { name: /15 марта 2026/ })
    grid.focus()
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    grid.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('Enter и пробел выбирают день — это обычная кнопка, ничего не перехвачено', async () => {
    const onSelect = vi.fn()
    render(<Calendar year={2026} month={2} selectedId="2026-03-15" onSelect={onSelect} />)
    screen.getByRole('button', { name: /15 марта 2026/ }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('2026-03-15')
  })
})
