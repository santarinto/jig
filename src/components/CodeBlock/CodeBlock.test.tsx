import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CodeBlock } from './CodeBlock.js'

const CMD = 'php bin/console app:tracker:task:add portal "тест"'

function withClipboard(impl?: () => Promise<void>) {
  const writeText = vi.fn(impl ?? (() => Promise.resolve()))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  vi.useRealTimers()
})

describe('CodeBlock', () => {
  it('показывает код как есть', () => {
    render(<CodeBlock code={CMD} />)
    expect(screen.getByText(CMD)).toBeInTheDocument()
  })

  it('копирует именно code, а не отрисованную разметку', async () => {
    const writeText = withClipboard()
    render(<CodeBlock code={CMD}><span>подсвеченная версия</span></CodeBlock>)
    await userEvent.click(screen.getByRole('button'))
    expect(writeText).toHaveBeenCalledWith(CMD)
  })

  it('после копирования говорит «Скопировано»', async () => {
    withClipboard()
    render(<CodeBlock code={CMD} />)
    await userEvent.click(screen.getByRole('button'))
    // Проверяем доступное имя, а не textContent: распорщик держит внутри
    // кнопки все три подписи сразу, поэтому `toHaveTextContent('Скопировано')`
    // верно при любом состоянии. Первая версия этих тестов так и была написана
    // — и мутация «отказ считать успехом» прошла её насквозь.
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeInTheDocument()
  })

  it('отказ буфера обмена виден, а не проглочен: молча — человек уверен, что скопировал', async () => {
    withClipboard(() => Promise.reject(new Error('denied')))
    render(<CodeBlock code={CMD} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: 'Не удалось' })).toBeInTheDocument()
  })

  it('отсутствие clipboard API — тоже отказ, а не исключение наружу', async () => {
    render(<CodeBlock code={CMD} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: 'Не удалось' })).toBeInTheDocument()
  })

  it('кнопку можно убрать', () => {
    render(<CodeBlock code={CMD} copyable={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('распорщик не попадает в доступное имя кнопки', async () => {
    withClipboard()
    render(<CodeBlock code={CMD} />)
    expect(screen.getByRole('button', { name: 'Копировать' })).toBeInTheDocument()
  })

  it('область кода доступна с клавиатуры — иначе уехавший вбок хвост не увидеть без мыши', () => {
    const { container } = render(<CodeBlock code={CMD} label="Команда" />)
    const pre = container.querySelector('pre')!
    expect(pre).toHaveAttribute('tabindex', '0')
    expect(pre).toHaveAttribute('aria-label', 'Команда')
  })

  it('подписи заменяются целиком — язык у потребителя может быть не наш', async () => {
    withClipboard()
    render(<CodeBlock code={CMD} copyLabels={{ idle: 'Copy', copied: 'Copied', failed: 'Failed' }} />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  // DS-25: длинный JSON не растягивает карточку — лимит высоты + скролл.
  it('maxHeight числом ограничивает высоту, масштабируется и включает верт. скролл', () => {
    const { container } = render(<CodeBlock code={CMD} maxHeight={200} />)
    const style = container.querySelector('.ds-codeblock__pre')!.getAttribute('style') ?? ''
    expect(style).toContain('calc(200px * var(--ds-ui-scale')
    expect(style).toMatch(/overflow-y:\s*auto/)
  })

  it('maxHeight строкой передаётся дословно', () => {
    const { container } = render(<CodeBlock code={CMD} maxHeight="12rem" />)
    expect(container.querySelector('.ds-codeblock__pre')!.getAttribute('style')).toContain('12rem')
  })

  // DS-47: длинная строка без переносов (промт роли) уезжала вправо и не
  // ловилась maxHeight. wrap — opt-in: дефолт (горизонтальный скролл) не меняется.
  it('по умолчанию не переносит — класс-модификатор отсутствует', () => {
    const { container } = render(<CodeBlock code={CMD} />)
    expect(container.querySelector('.ds-codeblock__pre')).not.toHaveClass('ds-codeblock__pre--wrap')
  })

  it('wrap включает мягкий перенос — класс-модификатор на pre', () => {
    const { container } = render(<CodeBlock code={CMD} wrap />)
    expect(container.querySelector('.ds-codeblock__pre')).toHaveClass('ds-codeblock__pre--wrap')
  })
})
