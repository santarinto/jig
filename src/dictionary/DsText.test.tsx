import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { DsText, useDsText } from './DsText.js'
import { DS_TEXT_RU } from './text.js'

function Says({ k }: { k: 'modal.close' | 'searchBar.submit' }) {
  return <span data-testid="says">{useDsText()[k]}</span>
}

function SaysRow({ id }: { id: string }) {
  return <span data-testid="row">{useDsText()['dataTable.selectRow'](id)}</span>
}

const wrap = (value: Parameters<typeof DsText>[0]['value'], children: ReactNode) => (
  <DsText value={value}>{children}</DsText>
)

describe('DsText', () => {
  it('без провайдера компонент говорит по-русски', () => {
    render(<Says k="modal.close" />)
    expect(screen.getByTestId('says')).toHaveTextContent('Закрыть')
  })

  it('провайдер меняет заданный ключ, соседний остаётся русским', () => {
    render(wrap({ 'modal.close': 'Close' }, <><Says k="modal.close" /><Says k="searchBar.submit" /></>))
    const [close, submit] = screen.getAllByTestId('says')
    expect(close).toHaveTextContent('Close')
    expect(submit).toHaveTextContent('Найти')
  })

  it('вложенный провайдер МЕРЖИТСЯ поверх внешнего, а не заменяет его', () => {
    render(wrap({ 'modal.close': 'Close' },
      wrap({ 'searchBar.submit': 'Search' },
        <><Says k="modal.close" /><Says k="searchBar.submit" /></>)))
    const [close, submit] = screen.getAllByTestId('says')
    expect(close).toHaveTextContent('Close')
    expect(submit).toHaveTextContent('Search')
  })

  it('ключ-функция получает аргументы и в умолчании, и в переопределении', () => {
    const { rerender } = render(<SaysRow id="42" />)
    expect(screen.getByTestId('row')).toHaveTextContent('Выбрать строку 42')

    rerender(wrap({ 'dataTable.selectRow': (id) => `Select row ${id}` }, <SaysRow id="42" />))
    expect(screen.getByTestId('row')).toHaveTextContent('Select row 42')
  })

  it('рендерится в строку без DOM: словарь на контексте, не на эффекте', () => {
    const html = renderToStaticMarkup(wrap({ 'modal.close': 'Close' }, <Says k="modal.close" />))
    expect(html).toContain('Close')
  })
})

describe('DS_TEXT_RU', () => {
  it('ни одного пустого значения: пустая строка отнимает у элемента имя', () => {
    for (const [key, value] of Object.entries(DS_TEXT_RU)) {
      const out = typeof value === 'function' ? (value as (...a: never[]) => string)(...(['X', 'Y'] as never[])) : value
      expect(out.trim(), `ключ ${key}`).not.toBe('')
    }
  })

  it('ключ называет компонент: <имяКомпонента с маленькой буквы>.<что это>', () => {
    for (const key of Object.keys(DS_TEXT_RU)) {
      expect(key, `ключ ${key}`).toMatch(/^[a-z][A-Za-z]+\.[a-z][A-Za-z]+$/)
    }
  })
})
