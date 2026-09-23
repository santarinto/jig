/**
 * Стенд «Открытие строки» показывает РЕЗУЛЬТАТ `onRowClick`, и счётно
 * (DS-341). До этого обработчик был пустышкой, и пункт приёмки «клик
 * открывает строку один раз» глазом не проверялся вовсе: кадр от клика не
 * менялся. Счётчик обязателен — «зовётся дважды» (всплытие с кнопки строки на
 * саму строку) без него неотличимо от «зовётся раз».
 *
 * Сброс сменой случая проверяется ПЕРЕРИСОВКОЙ с пропсами другого случая, а не
 * новым `render`: кадр верстака при смене случая `FixtureView` не
 * перемонтирует, он получает новые пропсы — ровно это здесь и воспроизведено.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fixture from './DataTable.fixture.js'

afterEach(cleanup)

const draw = (id: string) => {
  const c = fixture.cases.find((x) => x.id === id)!
  return (c.render ?? fixture.render)!({ ...fixture.props, ...c.props }, {})
}

describe('DataTable.fixture — стенд открытия строки', () => {
  it('клик по имени строки печатает её id и число вызовов', async () => {
    render(<>{draw('row-open')}</>)
    expect(screen.getByText('ничего не открыто · вызовов: 0')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Петров П. П.' }))
    expect(screen.getByText('открыт: 2 · вызовов: 1')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Петров П. П.' }))
    expect(screen.getByText('открыт: 2 · вызовов: 2')).toBeTruthy()
  })

  it('смена случая сбрасывает счёт', async () => {
    const { rerender } = render(<>{draw('row-open')}</>)
    await userEvent.click(screen.getByRole('button', { name: 'Иванов И. И.' }))
    expect(screen.getByText('открыт: 1 · вызовов: 1')).toBeTruthy()
    rerender(<>{draw('current')}</>)
    expect(screen.getByText('ничего не открыто · вызовов: 0')).toBeTruthy()
  })
})
