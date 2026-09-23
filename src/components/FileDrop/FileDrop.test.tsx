import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FileDrop } from './FileDrop.js'

const file = (name: string, bytes: number) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' })

describe('FileDrop', () => {
  it('renders the dropzone with a hint', () => {
    render(<FileDrop files={[]} onFiles={() => {}} hint="PNG, JPG" />)
    expect(screen.getByRole('button')).toHaveClass('ds-filedrop__zone')
    expect(screen.getByText('PNG, JPG')).toBeInTheDocument()
  })

  it('lists selected files with formatted size', () => {
    render(<FileDrop files={[file('a.png', 2048)]} onFiles={() => {}} />)
    expect(screen.getByText('a.png')).toBeInTheDocument()
    expect(screen.getByText('2.0 КБ')).toBeInTheDocument()
  })

  it('removes a file', async () => {
    const onFiles = vi.fn()
    const a = file('a.png', 1024), b = file('b.png', 1024)
    render(<FileDrop files={[a, b]} onFiles={onFiles} />)
    await userEvent.click(screen.getByRole('button', { name: 'Удалить a.png' }))
    expect(onFiles).toHaveBeenCalledWith([b])
  })

  it('appends selected files when multiple', async () => {
    const onFiles = vi.fn()
    const existing = file('a.png', 1024)
    const { container } = render(<FileDrop files={[existing]} onFiles={onFiles} multiple />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file('b.png', 1024))
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0][0]).toHaveLength(2)
    expect(onFiles.mock.calls[0][0][1].name).toBe('b.png')
  })

  // Сам drop (имя компонента) и disabled не были покрыты (FileDrop.tsx:27-45).
  it('drop добавляет файлы; disabled не принимает drop', () => {
    const onFiles = vi.fn()
    const f = file('c.png', 512)
    const { rerender } = render(<FileDrop files={[]} onFiles={onFiles} />)
    fireEvent.drop(screen.getByRole('button'), { dataTransfer: { files: [f] } })
    expect(onFiles).toHaveBeenCalledWith([f])
    onFiles.mockClear()
    rerender(<FileDrop files={[]} onFiles={onFiles} disabled />)
    fireEvent.drop(screen.getByRole('button'), { dataTransfer: { files: [f] } })
    expect(onFiles).not.toHaveBeenCalled()
  })
})
