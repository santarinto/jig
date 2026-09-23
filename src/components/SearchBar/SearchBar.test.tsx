import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SearchBar } from './SearchBar.js'

describe('SearchBar', () => {
  it('fires onChange while typing and shows/uses the clear button', async () => {
    const onChange = vi.fn()
    render(<SearchBar value="молоко" onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox'), 'a')
    expect(onChange).toHaveBeenCalled()
    onChange.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Очистить' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('роль searchbox неявная: явный атрибут снят, а роль осталась', () => {
    // `role="searchbox"` на `<input type="search">` дублировал неявную роль и
    // был последним местом, где жила роль, отвергнутая в `GlobalSearch`: там
    // поле управляет списком, и роль обязана быть `combobox` (DS-110).
    const { container } = render(<SearchBar value="" onChange={() => {}} />)
    expect(container.querySelector('[role="searchbox"]'), 'явная роль вернулась').toBeNull()
    expect(screen.getByRole('searchbox'), 'неявная роль потерялась').toBeInTheDocument()
  })

  it('hides the clear button when empty and fires onSearch', async () => {
    const onSearch = vi.fn()
    render(<SearchBar value="" onChange={() => {}} onSearch={onSearch} />)
    expect(screen.queryByRole('button', { name: 'Очистить' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Найти' }))
    expect(onSearch).toHaveBeenCalled()
  })
})
