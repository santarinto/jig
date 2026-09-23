import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Tooltip } from './Tooltip.js'

describe('Tooltip', () => {
  it('renders the trigger and an associated tooltip node', () => {
    render(<Tooltip label="Провести документ"><button>Провести</button></Tooltip>)
    expect(screen.getByRole('button', { name: 'Провести' })).toBeInTheDocument()
    const tip = screen.getByRole('tooltip', { hidden: true })
    expect(tip).toHaveTextContent('Провести документ')
  })
})

/**
 * `role="tooltip"` сам по себе ничего не объявляет — он лишь помечает узел как
 * подсказку. Зачитывает её `aria-describedby` на триггере, и без него подсказка
 * для скринридера **не существовала вовсе**: на экране пузырёк был, в
 * доступном дереве связи не было.
 *
 * Проверяем связь, а не наличие атрибута: id пузырька должен совпасть с тем,
 * на что ссылается триггер. Два независимо правильных значения, которые не
 * сошлись, — ровно тот дефект, который атрибут-по-отдельности не ловит.
 */
describe('Tooltip · связь с триггером', () => {
  it('триггер описан подсказкой — id совпадает', () => {
    render(<Tooltip label="Провести документ"><button>Провести</button></Tooltip>)
    const trigger = screen.getByRole('button', { name: 'Провести' })
    const tip = screen.getByRole('tooltip', { hidden: true })
    expect(tip.id).toBeTruthy()
    expect(trigger).toHaveAttribute('aria-describedby', tip.id)
  })

  it('доступное описание доезжает до триггера целиком', () => {
    render(<Tooltip label="Anthropic · input 12k · output 3k"><button>Стоимость</button></Tooltip>)
    expect(screen.getByRole('button', { name: 'Стоимость' }))
      .toHaveAccessibleDescription('Anthropic · input 12k · output 3k')
  })

  it('две подсказки на странице не делят один id', () => {
    render(
      <>
        <Tooltip label="Первая"><button>A</button></Tooltip>
        <Tooltip label="Вторая"><button>B</button></Tooltip>
      </>,
    )
    const [a, b] = screen.getAllByRole('tooltip', { hidden: true })
    expect(a!.id).not.toBe(b!.id)
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-describedby', a!.id)
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-describedby', b!.id)
  })

  it('свой aria-describedby у триггера подсказка перебивает, а не дублирует', () => {
    render(<Tooltip label="Подсказка"><button aria-describedby="чужой">Кнопка</button></Tooltip>)
    const tip = screen.getByRole('tooltip', { hidden: true })
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', tip.id)
  })

  // Триггер потребителя — не всегда кнопка: один из потребителей вешает подсказку на
  // Badge (span). Связь обязана работать и там, где триггер не интерактивен;
  // достижимость с клавиатуры — отдельный разговор и ответственность
  // потребителя, компонент tabIndex сам не ставит.
  it('неинтерактивный триггер тоже получает связь', () => {
    render(<Tooltip label="Детали"><span data-testid="badge">120₽</span></Tooltip>)
    expect(screen.getByTestId('badge'))
      .toHaveAttribute('aria-describedby', screen.getByRole('tooltip', { hidden: true }).id)
  })

  // ПОКАЗ. До DS-240 его держал каскад, и ни один случай его не проверял
  // вовсе: jsdom `:hover` не применяет, так что «подсказка показывается» было
  // утверждением, которого в наборе просто не было.
  it('показывается по наведению и гаснет, когда курсор ушёл', async () => {
    render(<Tooltip label="Провести документ"><button type="button">Провести</button></Tooltip>)
    const bubble = screen.getByRole('tooltip', { hidden: true })
    expect(bubble).not.toHaveClass('is-shown')
    fireEvent.pointerEnter(bubble.parentElement!)
    expect(bubble).toHaveClass('is-shown')
    fireEvent.pointerLeave(bubble.parentElement!)
    expect(bubble).not.toHaveClass('is-shown')
  })

  it('показывается по фокусу на триггере — иначе подсказка недостижима с клавиатуры', () => {
    render(<Tooltip label="Провести документ"><button type="button">Провести</button></Tooltip>)
    const bubble = screen.getByRole('tooltip', { hidden: true })
    fireEvent.focus(screen.getByRole('button'))
    expect(bubble).toHaveClass('is-shown')
    fireEvent.blur(screen.getByRole('button'))
    expect(bubble).not.toHaveClass('is-shown')
  })

  // ЦЕНА СОСТОЯНИЯ, которую платить НЕЛЬЗЯ. Показ управляет видимостью, а не
  // рендером: узел остаётся в DOM и связь `aria-describedby` не рвётся, иначе
  // скринридер потерял бы подсказку, пока на триггер не навели мышь.
  it('узел и связь `aria-describedby` живут и когда подсказка не показана', () => {
    render(<Tooltip label="Провести документ"><button type="button">Провести</button></Tooltip>)
    const bubble = screen.getByRole('tooltip', { hidden: true })
    expect(bubble).not.toHaveClass('is-shown')
    expect(bubble).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', bubble.id)
    // Снятый с раскладки узел (DS-308) описание не теряет: ссылка по id
    // берёт текст и у скрытого.
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Провести документ')
  })

  // ЗАКРЫТЫЙ ПУЗЫРЁК БОКСА НЕ ИМЕЕТ (DS-308). `visibility: hidden` листа
  // бокс оставлял, и невидимый пузырёк у значка справа уводил документ вбок на
  // +59 (кадр 360, ×1.5). Утверждается ПАРОЙ состояний, а не одним: атрибут,
  // стоящий всегда, прошёл бы проверку закрытого и спрятал бы показанный.
  it('закрытый снят с раскладки атрибутом hidden, показанный — нет', () => {
    render(<Tooltip label="Провести документ"><button type="button">Провести</button></Tooltip>)
    const bubble = screen.getByRole('tooltip', { hidden: true })
    expect(bubble).toHaveAttribute('hidden')
    fireEvent.pointerEnter(bubble.parentElement!)
    expect(bubble).toHaveClass('is-shown')
    expect(bubble).not.toHaveAttribute('hidden')
    fireEvent.pointerLeave(bubble.parentElement!)
    expect(bubble).toHaveAttribute('hidden')
  })

  it('показанный пузырёк позиционируется от вьюпорта: position fixed', () => {
    render(<Tooltip label="Провести документ"><button type="button">Провести</button></Tooltip>)
    const bubble = screen.getByRole('tooltip', { hidden: true })
    fireEvent.pointerEnter(bubble.parentElement!)
    expect(bubble.style.position).toBe('fixed')
    // `translateX(-50%)` из листа обязан быть погашен: центрирование считает
    // хук, и оставленный сдвиг сложился бы с посчитанным `left`.
    expect(bubble.style.transform).toBe('none')
  })

  // WCAG 1.4.13, нога Dismissible (DS-168). До неё подсказку нельзя было
  // убрать с экрана ВООБЩЕ НИЧЕМ — единственный такой оверлей системы: у
  // `Modal`, `Drawer`, `Popover` и `DropdownMenu` Escape работал.
  describe('Escape', () => {
    it('гасит показанную подсказку', () => {
      render(<Tooltip label="Провести документ"><button type="button">Провести</button></Tooltip>)
      const bubble = screen.getByRole('tooltip', { hidden: true })
      fireEvent.pointerEnter(bubble.parentElement!)
      expect(bubble).toHaveClass('is-shown')
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(bubble).not.toHaveClass('is-shown')
    })

    it('гасит и когда подсказку показал ФОКУС, а не курсор', () => {
      render(<Tooltip label="Провести документ"><button type="button">Провести</button></Tooltip>)
      const bubble = screen.getByRole('tooltip', { hidden: true })
      fireEvent.focus(screen.getByRole('button'))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(bubble).not.toHaveClass('is-shown')
    })

    // ГАСИТСЯ ПОКАЗ, А НЕ КОМПОНЕНТ. Без этого случая прошла бы правка,
    // выключающая подсказку навсегда после первого Escape, — она закрыла бы
    // оба случая выше и сломала бы компонент.
    it('увели курсор и вернули — подсказка снова показывается', () => {
      render(<Tooltip label="Провести документ"><button type="button">Провести</button></Tooltip>)
      const bubble = screen.getByRole('tooltip', { hidden: true })
      const root = bubble.parentElement!
      fireEvent.pointerEnter(root)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(bubble).not.toHaveClass('is-shown')
      fireEvent.pointerLeave(root)
      fireEvent.pointerEnter(root)
      expect(bubble).toHaveClass('is-shown')
    })

    // Слушатель живёт только пока подсказка показана: документный keydown,
    // переживший показ, — это утечка, которую видно только счётчиком.
    it('слушатель снимается вместе с показом', () => {
      const remove = vi.spyOn(document, 'removeEventListener')
      render(<Tooltip label="Провести документ"><button type="button">Провести</button></Tooltip>)
      const root = screen.getByRole('tooltip', { hidden: true }).parentElement!
      fireEvent.pointerEnter(root)
      fireEvent.pointerLeave(root)
      expect(remove.mock.calls.some(([type]) => type === 'keydown')).toBe(true)
      remove.mockRestore()
    })
  })
})
