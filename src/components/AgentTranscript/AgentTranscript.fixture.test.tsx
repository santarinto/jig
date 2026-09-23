/**
 * Стенд `click` показывает РЕЗУЛЬТАТ `onTurnClick`, и счётно (DS-341).
 * До этого обработчик был пустышкой: кадр от клика не менялся, и «клик
 * срабатывает один раз» глазом не проверялся. Счётчик отличает «дважды» от
 * «раз» — без него это одно и то же изображение.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fixture from './AgentTranscript.fixture.js'

afterEach(cleanup)

const draw = (id: string) => {
  const c = fixture.cases.find((x) => x.id === id)!
  return (c.render ?? fixture.render)!({ ...fixture.props, ...c.props }, {})
}

describe('AgentTranscript.fixture — стенд клика по реплике', () => {
  it('клик по заголовку печатает id хода и число вызовов', async () => {
    render(<>{draw('click')}</>)
    expect(screen.getByText('ничего не открыто · вызовов: 0')).toBeTruthy()
    // Кнопки-заголовки есть только у НИЖНЕГО транскрипта — у верхнего
    // `onTurnClick` нет. Первая кнопка с именем оператора — ход `t1`.
    const logs = screen.getAllByRole('log')
    const head = within(logs[1]!).getAllByRole('button', { name: /Оператор/ })[0]!
    await userEvent.click(head)
    expect(screen.getByText('открыт: t1 · вызовов: 1')).toBeTruthy()
    await userEvent.click(head)
    expect(screen.getByText('открыт: t1 · вызовов: 2')).toBeTruthy()
  })
})
