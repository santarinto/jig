import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProgressBar } from './ProgressBar.js'

describe('ProgressBar', () => {
  it('exposes the value to assistive tech, not just to the eye', () => {
    render(<ProgressBar value={30} max={60} label="Загрузка" />)
    const bar = screen.getByRole('progressbar', { name: 'Загрузка' })
    expect(bar).toHaveAttribute('aria-valuenow', '30')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '60')
  })

  it('shows the percentage of max, not of 100', () => {
    const { container } = render(<ProgressBar value={30} max={60} />)
    expect(container.querySelector('.ds-progress__fill')).toHaveStyle({ width: '50%' })
  })

  it('clamps a value outside the range instead of overflowing the track', () => {
    const { container, rerender } = render(<ProgressBar value={150} />)
    expect(container.querySelector('.ds-progress__fill')).toHaveStyle({ width: '100%' })
    rerender(<ProgressBar value={-20} />)
    expect(container.querySelector('.ds-progress__fill')).toHaveStyle({ width: '0%' })
  })

  it('drops the value attributes when indeterminate — the position is unknown', () => {
    render(<ProgressBar indeterminate label="Обработка" />)
    const bar = screen.getByRole('progressbar', { name: 'Обработка' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
  })
})

/**
 * Назвать полосу можно было только показав подпись: имя бралось из `label`, а
 * `label` рисуется на экране, и `...rest` на корень не пробрасывался.
 *
 * У потребителя это ячейка таблицы «Доля долга»: имя нужно (иначе
 * `role="progressbar"` безымянный), а видимая подпись рядом с заголовком
 * колонки — дубль. Выбор был из двух плохих, третьего пропса не было.
 */
describe('ProgressBar · имя без видимой подписи', () => {
  it('ariaLabel называет полосу, ничего не рисуя', () => {
    const { container } = render(<ProgressBar value={75} ariaLabel="Доля долга" />)
    expect(screen.getByRole('progressbar', { name: 'Доля долга' })).toBeInTheDocument()
    expect(container.querySelector('.ds-progress__head')).toBeNull()
    expect(container.textContent).toBe('')
  })

  it('видимая подпись сильнее скрытой — двух имён на узле не бывает', () => {
    render(<ProgressBar value={50} label="Готово" ariaLabel="Не должно победить" />)
    expect(screen.getByRole('progressbar', { name: 'Готово' })).toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: 'Не должно победить' })).toBeNull()
  })

  it('без обоих полоса остаётся безымянной, а не берёт имя из воздуха', () => {
    render(<ProgressBar value={10} />)
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-label')
  })

  it('остальные DOM-пропсы уходят на корень, className дописывается', () => {
    const { container } = render(
      <ProgressBar value={30} ariaLabel="Доля" id="p1" className="tk-cell" data-testid="bar" title="подсказка" />,
    )
    const root = container.querySelector('.ds-progress') as HTMLElement
    expect(root).toHaveAttribute('id', 'p1')
    expect(root).toHaveAttribute('data-testid', 'bar')
    expect(root).toHaveAttribute('title', 'подсказка')
    // Свой класс ДОПИСЫВАЕТСЯ к системным, а не затирает их.
    expect(root).toHaveClass('ds-progress', 'ds-progress--md', 'tk-cell')
  })
})
