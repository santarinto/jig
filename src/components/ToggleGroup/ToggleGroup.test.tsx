import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ToggleGroup, type ToggleItem, type SwatchItem } from './ToggleGroup.js'

const items: ToggleItem[] = [
  { id: 'all', label: 'Все' },
  { id: 'msg', label: 'message' },
  { id: 'res', label: 'result' },
]

describe('ToggleGroup single', () => {
  it('radiogroup: помечает выбранный, выбирает по клику', async () => {
    const onChange = vi.fn()
    render(<ToggleGroup mode="single" value="all" onChange={onChange} items={items} aria-label="Тип" />)
    expect(screen.getByRole('radiogroup', { name: 'Тип' })).toBeInTheDocument()
    const all = screen.getByRole('radio', { name: 'Все' })
    expect(all).toHaveAttribute('aria-checked', 'true')
    expect(all).toHaveAttribute('tabindex', '0')
    const msg = screen.getByRole('radio', { name: 'message' })
    expect(msg).toHaveAttribute('aria-checked', 'false')
    expect(msg).toHaveAttribute('tabindex', '-1')
    await userEvent.click(msg)
    expect(onChange).toHaveBeenCalledWith('msg')
  })

  it('стрелка выбирает и двигает фокус (нативный radiogroup)', async () => {
    const onChange = vi.fn()
    render(<ToggleGroup mode="single" value="all" onChange={onChange} items={items} aria-label="Тип" />)
    screen.getByRole('radio', { name: 'Все' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('msg')
    expect(screen.getByRole('radio', { name: 'message' })).toHaveFocus()
  })

  it('Home/End прыгают на первый/последний', async () => {
    const onChange = vi.fn()
    render(<ToggleGroup mode="single" value="msg" onChange={onChange} items={items} aria-label="Тип" />)
    screen.getByRole('radio', { name: 'message' }).focus()
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenCalledWith('res')
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenCalledWith('all')
  })

  it('disabled пропускается стрелкой', async () => {
    const onChange = vi.fn()
    const withDisabled: ToggleItem[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', disabled: true },
      { id: 'c', label: 'C' },
    ]
    render(<ToggleGroup mode="single" value="a" onChange={onChange} items={withDisabled} aria-label="Т" />)
    screen.getByRole('radio', { name: 'A' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('c') // B пропущен
  })

  it('count показывается, включая ноль', () => {
    render(<ToggleGroup mode="single" value="a" onChange={() => {}}
      items={[{ id: 'a', label: 'Готово', count: 0 }]} aria-label="Т" />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('иконка декоративна: её aria-label не попадает в имя', () => {
    render(<ToggleGroup mode="single" value="a" onChange={() => {}}
      items={[{ id: 'a', label: 'Все', icon: <svg aria-label="звезда" /> }]} aria-label="Т" />)
    expect(screen.getByRole('radio', { name: 'Все' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /звезда/ })).toBeNull()
  })

  it('дискриминированный юнион не ослаблен: value не по форме mode не компилируется', () => {
    // Мягкий `string | string[]` отвергнут — он компилировал бы перепутанную форму
    // молча. Снимешь строгость юниона — подавление станет лишним, и typecheck упадёт.
    // @ts-expect-error mode="single" требует value: string, не string[]
    const a = <ToggleGroup mode="single" value={['all']} onChange={() => {}} items={items} aria-label="Т" />
    // @ts-expect-error mode="multiple" требует value: string[], не строку
    const b = <ToggleGroup mode="multiple" value="x" onChange={() => {}} items={items} aria-label="Т" />
    expect([a, b].length).toBe(2)
  })
})

describe('ToggleGroup крайние случаи', () => {
  it('пустой items — не рендерит ничего', () => {
    const { container } = render(<ToggleGroup mode="single" value="x" onChange={() => {}} items={[]} aria-label="Т" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('value без совпадения: ничего не выбрано, tabIndex на первом, без onChange', () => {
    const onChange = vi.fn()
    render(<ToggleGroup mode="single" value="nope" onChange={onChange} items={items} aria-label="Т" />)
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(screen.getByRole('radio', { name: 'Все' })).toHaveAttribute('tabindex', '0')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('все disabled: ни одного tabIndex=0', () => {
    const allDis: ToggleItem[] = [
      { id: 'a', label: 'A', disabled: true },
      { id: 'b', label: 'B', disabled: true },
    ]
    render(<ToggleGroup mode="single" value="a" onChange={() => {}} items={allDis} aria-label="Т" />)
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('tabindex') === '-1')).toBe(true)
  })
})

describe('ToggleGroup multiple', () => {
  const items: ToggleItem[] = [
    { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' },
  ]

  it('group: aria-pressed, переключение по клику (порядок items)', async () => {
    const onChange = vi.fn()
    render(<ToggleGroup mode="multiple" value={['a']} onChange={onChange} items={items} aria-label="Ф" />)
    expect(screen.getByRole('group', { name: 'Ф' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'B' }))
    expect(onChange).toHaveBeenCalledWith(['a', 'b'])
  })

  it('клик по нажатому — снимает', async () => {
    const onChange = vi.fn()
    render(<ToggleGroup mode="multiple" value={['a', 'b']} onChange={onChange} items={items} aria-label="Ф" />)
    await userEvent.click(screen.getByRole('button', { name: 'a'.toUpperCase() }))
    expect(onChange).toHaveBeenCalledWith(['b'])
  })

  it('стрелка двигает ТОЛЬКО фокус, не выбирает', async () => {
    const onChange = vi.fn()
    render(<ToggleGroup mode="multiple" value={[]} onChange={onChange} items={items} aria-label="Ф" />)
    screen.getByRole('button', { name: 'A' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'B' })).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Space переключает сфокусированный', async () => {
    const onChange = vi.fn()
    render(<ToggleGroup mode="multiple" value={[]} onChange={onChange} items={items} aria-label="Ф" />)
    screen.getByRole('button', { name: 'B' }).focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith(['b'])
  })

  it('пустой массив — валиден, ничего не нажато', () => {
    render(<ToggleGroup mode="multiple" value={[]} onChange={() => {}} items={items} aria-label="Ф" />)
    expect(screen.getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('клик по disabled — не вызывает onChange', async () => {
    const onChange = vi.fn()
    const withDisabled: ToggleItem[] = [...items, { id: 'd', label: 'D', disabled: true }]
    render(<ToggleGroup mode="multiple" value={[]} onChange={onChange} items={withDisabled} aria-label="Ф" />)
    await userEvent.click(screen.getByRole('button', { name: 'D' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

/**
 * Свотч — выбор ЦВЕТА (DS-245). Проверяется не картинка, а два
 * утверждения, которые картинкой и не проверить: что у плашки есть доступное
 * ИМЯ (хекс именем не годится — это значение) и что цвет уезжает в переменную,
 * а не в `background` напрямую, потому что от неё зависит и медальон, и кольцо.
 */
describe('ToggleGroup variant=swatch', () => {
  const colours: SwatchItem[] = [
    { id: 'teal', label: 'Бирюзовый', swatch: 'var(--ds-chart-1)' },
    { id: 'yellow', label: 'Жёлтый', swatch: 'var(--ds-chart-2)' },
    { id: 'pink', label: 'Малиновый', swatch: 'var(--ds-chart-3)' },
  ]

  it('плашка имеет доступное имя, и это НЕ цвет', () => {
    render(<ToggleGroup mode="single" variant="swatch" value="teal" onChange={() => {}} items={colours} aria-label="Цвет метки" />)
    // Имя берётся из visually-hidden label: кнопка называется словом.
    expect(screen.getByRole('radio', { name: 'Жёлтый' })).toBeInTheDocument()
    // И ни одна кнопка не названа значением цвета.
    for (const b of screen.getAllByRole('radio')) {
      expect(b.textContent).not.toMatch(/#|var\(/)
    }
  })

  it('выбранная плашка помечена ролью, а не только видом', () => {
    render(<ToggleGroup mode="single" variant="swatch" value="pink" onChange={() => {}} items={colours} aria-label="Цвет метки" />)
    expect(screen.getByRole('radio', { name: 'Малиновый' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Бирюзовый' })).toHaveAttribute('aria-checked', 'false')
  })

  it('цвет уезжает в --ds-swatch-color, а не в background', () => {
    const { container } = render(
      <ToggleGroup mode="single" variant="swatch" value="teal" onChange={() => {}} items={colours} aria-label="Цвет метки" />,
    )
    const swatches = container.querySelectorAll<HTMLElement>('.ds-togglegroup__swatch')
    expect(swatches).toHaveLength(3)
    expect(swatches[1]!.style.getPropertyValue('--ds-swatch-color')).toBe('var(--ds-chart-2)')
    // Против «покрасили напрямую»: от переменной зависят и медальон, и кольцо,
    // а прямой background их не питает и разошёлся бы молча.
    expect(swatches[1]!.style.background).toBe('')
  })

  it('плашка декоративна: имя даёт label, а не она', () => {
    const { container } = render(
      <ToggleGroup mode="single" variant="swatch" value="teal" onChange={() => {}} items={colours} aria-label="Цвет метки" />,
    )
    for (const s of container.querySelectorAll('.ds-togglegroup__swatch')) {
      expect(s).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('клик по плашке выбирает её', async () => {
    const onChange = vi.fn()
    render(<ToggleGroup mode="single" variant="swatch" value="teal" onChange={onChange} items={colours} aria-label="Цвет метки" />)
    await userEvent.click(screen.getByRole('radio', { name: 'Малиновый' }))
    expect(onChange).toHaveBeenCalledWith('pink')
  })

  it('`size` со свотчем — ОШИБКА КОМПИЛЯЦИИ, а не молчаливое ничего', () => {
    // Размер плашки задаёт `--ds-size-swatch`; правила `--sm`/`--md` правят
    // высоту и падинг сегмента, до которых свотчу дела нет. Принять проп и
    // ничего им не сделать значило бы нарисовать `size="sm"` неотличимо от
    // `md` — деградация вместо отказа, запрещённая законом CLAUDE.md.
    // Директива стоит над САМИМ атрибутом, в отличие от случая ниже. TypeScript
    // якорит ошибку по-разному: несовпадение ТИПА пропса относится к элементу
    // целиком, а ЛИШНИЙ пропс — к своей строке. Перепутать местами значит
    // получить TS2578 «директива не нужна», то есть красный тест, ничего не
    // проверивший, — оба варианта проверены прогоном.
    render(
      <ToggleGroup
        mode="single"
        variant="swatch"
        // @ts-expect-error variant="swatch" не имеет size
        size="sm"
        value="teal"
        onChange={() => {}}
        items={colours}
        aria-label="Цвет метки"
      />,
    )
    expect(screen.getByRole('radiogroup')).not.toHaveClass('ds-togglegroup--sm')
  })

  it('свотч без цвета — ОШИБКА КОМПИЛЯЦИИ, а не пустая плашка', () => {
    // Директива стоит на ОТКРЫВАЮЩЕМ теге, а не над `items`: TypeScript относит
    // несовпадение пропсов к элементу целиком, и над атрибутом она оказывается
    // лишней — tsc сообщает TS2578, то есть тест краснеет, ничего не проверив.
    render(
      // @ts-expect-error variant="swatch" требует SwatchItem[]: плашка без
      // цвета читалась бы как «цвет не выбран», а это другое состояние.
      <ToggleGroup
        mode="single"
        variant="swatch"
        value="a"
        onChange={() => {}}
        items={[{ id: 'a', label: 'A' }]}
        aria-label="Цвет метки"
      />,
    )
    expect(screen.getByRole('radio', { name: 'A' })).toBeInTheDocument()
  })
})
