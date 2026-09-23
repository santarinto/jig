import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Button } from './Button.js'

describe('Button', () => {
  it('renders children and default primary/md classes', () => {
    render(<Button>ОК</Button>)
    const btn = screen.getByRole('button', { name: 'ОК' })
    expect(btn).toHaveClass('ds-btn', 'ds-btn--primary', 'ds-btn--md')
  })

  it('applies variant and size modifiers', () => {
    render(<Button variant="danger" size="sm">Удалить</Button>)
    expect(screen.getByRole('button')).toHaveClass('ds-btn--danger', 'ds-btn--sm')
  })

  it('applies the lg size modifier', () => {
    render(<Button size="lg">Крупная</Button>)
    expect(screen.getByRole('button')).toHaveClass('ds-btn--lg')
  })

  it('marks icon-only lg buttons with both modifiers', () => {
    render(<Button size="lg" iconOnly aria-label="Домой">⌂</Button>)
    expect(screen.getByRole('button')).toHaveClass('ds-btn--lg', 'ds-btn--icon')
  })

  it('is disabled and non-interactive while loading', async () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Сохранить</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveClass('is-loading')
    await userEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('label span declares its own layout (survives external resets like Tailwind preflight)', () => {
    const css = readFileSync(resolve(__dirname, 'Button.css'), 'utf8')
    const labelRule = css.match(/^\.ds-btn__label\s*\{([^}]*)\}/m)?.[1] ?? ''
    expect(labelRule, '.ds-btn__label needs display: inline-flex — with default inline, svg { display: block } from consumer resets pushes icons onto their own line').toMatch(/display\s*:\s*inline-flex/)
    expect(labelRule).toMatch(/gap\s*:\s*var\(--ds-space-3\)/)
  })
})

describe('Button: success', () => {
  it('даёт свой модификатор и не подменяет остальные', () => {
    render(<Button variant="success" size="sm">Старт</Button>)
    const b = screen.getByRole('button', { name: 'Старт' })
    expect(b).toHaveClass('ds-btn--success')
    expect(b).toHaveClass('ds-btn--sm')
  })

  it('подчиняется loading так же, как остальные варианты', () => {
    render(<Button variant="success" loading>Старт</Button>)
    const b = screen.getByRole('button')
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Button: tone', () => {
  it('без tone модификатора тона нет', () => {
    render(<Button variant="ghost">Обычная</Button>)
    expect(screen.getByRole('button').className).not.toMatch(/ds-btn--tone-/)
  })

  it('tone="error" на ghost даёт модификатор поверх варианта, не подменяя его', () => {
    render(<Button variant="ghost" size="sm" iconOnly tone="error" aria-label="Удалить">×</Button>)
    const b = screen.getByRole('button', { name: 'Удалить' })
    expect(b).toHaveClass('ds-btn--ghost', 'ds-btn--sm', 'ds-btn--icon', 'ds-btn--tone-error')
  })

  it('красит текст в error и держит цвет на :hover — чтобы потребитель не дублировал правило поверх ghost', () => {
    const css = readFileSync(resolve(__dirname, 'Button.css'), 'utf8')
    // Базовое правило тона на ghost задаёт error-цвет.
    expect(css).toMatch(/\.ds-btn--tone-error\.ds-btn--ghost[^{]*\{[^}]*color:\s*var\(--ds-error-fg\)/)
    // И :hover повторяет его: системный ghost-ховер красит только фон, но правило
    // существует, чтобы вопрос «перекрасит ли ховер обратно» был закрыт в системе.
    expect(css).toMatch(/\.ds-btn--tone-error\.ds-btn--ghost:hover[^{]*\{[^}]*color:\s*var\(--ds-error-fg\)/)
  })
})

// DS-35: as="a" — кнопка-ссылка для навигации без гидрации. Союз
// дискриминирован по as: при as="a" доступны только якорные атрибуты; type/disabled
// кнопки не должны молча уезжать на <a>.
describe('Button: as="a" (кнопка-ссылка)', () => {
  it('рендерит <a> с href и теми же классами варианта/размера', () => {
    render(<Button as="a" href="/debts" variant="ghost" size="sm">Долги</Button>)
    const link = screen.getByRole('link', { name: 'Долги' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/debts')
    expect(link).toHaveClass('ds-btn', 'ds-btn--ghost', 'ds-btn--sm')
    // Подчёркивание снято — иначе ссылка выглядит не как кнопка.
    const css = readFileSync(resolve(__dirname, 'Button.css'), 'utf8')
    expect(css).toMatch(/\.ds-btn\s*\{[^}]*text-decoration:\s*none/)
  })

  it('кнопочное поле form при as="a" — ошибка типов (старая форма ломает компиляцию)', () => {
    type P = React.ComponentProps<typeof Button>
    // `form` есть у <button>, но не у <a> (в AnchorHTMLAttributes его нет) —
    // задание на as="a" падает по типам, а не молча теряется.
    // @ts-expect-error — кнопочное поле не должно уезжать на ссылку
    const _b: P = { as: 'a', href: '/', form: 'myform', children: 'x' }
    expect(_b).toBeDefined()
  })

  it('кнопочный onClick (MouseEventHandler<HTMLButtonElement>) при as="a" — ошибка типов', () => {
    type P = React.ComponentProps<typeof Button>
    const onClickBtn: React.MouseEventHandler<HTMLButtonElement> = () => {}
    // Тип обработчика кнопки несовместим с типом обработчика ссылки —
    // нельзя случайно получить event.target как HTMLButtonElement на <a>.
    // @ts-expect-error — кнопочный обработчик не подходит ссылке
    const _b: P = { as: 'a', href: '/', onClick: onClickBtn, children: 'x' }
    expect(_b).toBeDefined()
  })

  it('disabled превращается в aria-disabled + tabindex=-1 (у <a> нет нативного disabled)', () => {
    render(<Button as="a" href="/" disabled>Заблокировано</Button>)
    const link = screen.getByRole('link', { name: 'Заблокировано' })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')
    expect(link).not.toHaveAttribute('disabled')
  })

  it('loading на ссылке — aria-disabled, спиннер и тот же tabindex', () => {
    const { container } = render(<Button as="a" href="/" loading>Грузится</Button>)
    const link = screen.getByRole('link', { name: /Грузится/ })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')
    expect(link).toHaveClass('is-loading')
    expect(container.querySelector('.ds-btn__spinner')).not.toBeNull()
  })

  it('дефолтный as — <button>, не ссылка (обратная проверка: контракт не свалился в <a>)', () => {
    render(<Button>ОК</Button>)
    const btn = screen.getByRole('button', { name: 'ОК' })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).not.toHaveAttribute('aria-disabled')
  })

  it('якорные атрибуты доходят до <a>: target/rel', () => {
    render(<Button as="a" href="/ext" target="_blank" rel="noopener noreferrer">Снаружи</Button>)
    const link = screen.getByRole('link', { name: 'Снаружи' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

// DS-360: icon/iconEnd — именованные слоты вместо безымянного child по
// краям `.ds-btn__label`. Порядок в DOM, скрытие от диктора, отсутствие
// обёртки без пропа, и запрещённые комбинации с iconOnly (эпик 248 — молчаливая
// деградация API не проходит: обе комбинации обязаны throw'ить, а не рисовать
// что-то правдоподобное).
describe('Button: icon / iconEnd', () => {
  const Icon = ({ 'data-testid': testId }: { 'data-testid': string }) => <svg data-testid={testId} />

  it('порядок в DOM внутри .ds-btn__label — icon, текст, iconEnd', () => {
    render(
      <Button icon={<Icon data-testid="i-start" />} iconEnd={<Icon data-testid="i-end" />}>
        Провести
      </Button>,
    )
    const label = document.querySelector('.ds-btn__label')
    expect(label).not.toBeNull()
    const order = [...label!.childNodes].map((n) => {
      const el = n as HTMLElement
      if (el.querySelector?.('[data-testid="i-start"]')) return 'icon'
      if (el.querySelector?.('[data-testid="i-end"]')) return 'iconEnd'
      return el.textContent
    })
    expect(order).toEqual(['icon', 'Провести', 'iconEnd'])
  })

  it('обёртка иконки — span.ds-btn__icon с aria-hidden', () => {
    render(<Button icon={<Icon data-testid="i-start" />}>Провести</Button>)
    const wrap = screen.getByTestId('i-start').closest('.ds-btn__icon')
    expect(wrap).not.toBeNull()
    expect(wrap).toHaveAttribute('aria-hidden', 'true')
  })

  it('без пропа icon/iconEnd — ни одной обёртки .ds-btn__icon (пустой span съел бы gap)', () => {
    render(<Button>Провести</Button>)
    expect(document.querySelector('.ds-btn__icon')).toBeNull()
  })

  // Обе запрещённые комбинации — ошибка ТИПОВ на нормальном вызове (проверено
  // здесь на присваивании, как остальные `@ts-expect-error` файла) И throw в
  // рантайме — на случай `any` на пути потребителя, где типы не удержали.
  it('iconOnly + iconEnd — ошибка типов (у кнопки из одной иконки нет «конца»)', () => {
    type P = React.ComponentProps<typeof Button>
    // @ts-expect-error — iconOnly не берёт iconEnd: второго края подписи нет
    const _b: P = { iconOnly: true, iconEnd: <Icon data-testid="x" />, 'aria-label': 'Ещё' }
    expect(_b).toBeDefined()
  })

  it('iconOnly + iconEnd — throw в рантайме (any-путь потребителя, тип не удержал)', () => {
    const bad = { iconOnly: true, iconEnd: <Icon data-testid="x" />, 'aria-label': 'Ещё' } as unknown as React.ComponentProps<typeof Button>
    expect(() => render(<Button {...bad} />)).toThrow(/iconOnly.*iconEnd/s)
  })

  it('iconOnly + icon + children — ошибка типов (icon сам есть содержимое, второй претендент лишний)', () => {
    type P = React.ComponentProps<typeof Button>
    // @ts-expect-error — iconOnly с icon не берёт ещё и children
    const _b: P = { iconOnly: true, icon: <Icon data-testid="x" />, 'aria-label': 'Ещё', children: 'лишний текст' }
    expect(_b).toBeDefined()
  })

  it('iconOnly + icon + children — throw в рантайме (any-путь потребителя, тип не удержал)', () => {
    const bad = { iconOnly: true, icon: <Icon data-testid="x" />, 'aria-label': 'Ещё', children: 'лишний текст' } as unknown as React.ComponentProps<typeof Button>
    expect(() => render(<Button {...bad} />)).toThrow(/iconOnly.*icon.*children/s)
  })

  it('iconOnly + icon без children — законно: icon и есть содержимое', () => {
    render(<Button iconOnly icon={<Icon data-testid="i-only" />} aria-label="Домой" />)
    const btn = screen.getByRole('button', { name: 'Домой' })
    expect(btn).toHaveClass('ds-btn--icon')
    expect(btn.querySelector('.ds-btn__icon')).not.toBeNull()
  })

  it('iconOnly + children без icon — не меняется (RowAction/CardTool и т.п.)', () => {
    render(<Button iconOnly aria-label="Домой">⌂</Button>)
    const btn = screen.getByRole('button', { name: 'Домой' })
    expect(btn).toHaveClass('ds-btn--icon')
    expect(btn.querySelector('.ds-btn__icon')).toBeNull()
    expect(btn).toHaveTextContent('⌂')
  })

  it('iconEnd без iconOnly — законно, вторая иконка справа от подписи', () => {
    render(<Button iconEnd={<Icon data-testid="i-end" />}>Ещё</Button>)
    expect(screen.getByTestId('i-end').closest('.ds-btn__icon')).not.toBeNull()
  })
})

// Ревью DS-360: `icon != null` пропускало `false` внутрь — рядовой идиом
// `icon={cond && <IconPlus/>}` при ложном `cond` рисовал ПУСТУЮ `.ds-btn__icon`,
// а пустой узел во флекс-потоке `.ds-btn__label` всё равно занимает `gap`, и
// подпись молча уезжала (эпик 248, молчаливая деградация API). Эталон — кнопка
// БЕЗ пропа вовсе: незанятый слот обязан давать байт-в-байт тот же DOM.
describe('Button: незанятый слот (icon={false}/{null}/{\'\'})', () => {
  it('icon={false} — DOM совпадает с кнопкой без пропа', () => {
    const { container: withFalse } = render(<Button icon={false}>Провести</Button>)
    const { container: bare } = render(<Button>Провести</Button>)
    expect(withFalse.innerHTML).toEqual(bare.innerHTML)
  })

  it('icon={null} — то же самое', () => {
    const { container: withNull } = render(<Button icon={null}>Провести</Button>)
    const { container: bare } = render(<Button>Провести</Button>)
    expect(withNull.innerHTML).toEqual(bare.innerHTML)
  })

  it('icon={\'\'} — то же самое (пустая строка не значит содержимое)', () => {
    const { container: withEmpty } = render(<Button icon="">Провести</Button>)
    const { container: bare } = render(<Button>Провести</Button>)
    expect(withEmpty.innerHTML).toEqual(bare.innerHTML)
  })

  it('iconEnd={false} — то же самое, с конца подписи', () => {
    const { container: withFalse } = render(<Button iconEnd={false}>Провести</Button>)
    const { container: bare } = render(<Button>Провести</Button>)
    expect(withFalse.innerHTML).toEqual(bare.innerHTML)
  })

  // `iconOnly` + `iconEnd` вообще не имеет легального типизированного вызова
  // (нет причины давать iconEnd кнопке из одной иконки, даже пустой) — тип
  // остаётся строгим (`iconEnd?: undefined`), а этот тест проверяет РАНТАЙМ на
  // случай, когда значение всё же пришло не литералом, а вычислением, и
  // оказалось пустым: `hasSlot` обязан не спутать «пусто» с «занято» и здесь.
  it('iconOnly + iconEnd={false} — не бросает: пустой слот не в счёт', () => {
    const bad = { iconOnly: true, iconEnd: false, 'aria-label': 'Домой', children: '⌂' } as unknown as React.ComponentProps<typeof Button>
    expect(() => render(<Button {...bad} />)).not.toThrow()
  })

  // `iconOnly` + `icon={false}` + `children` — обычная iconOnly-кнопка с
  // children: `icon` пуст, значит незанят, а `children` — законное содержимое
  // такой кнопки (случай «iconOnly + children без icon» из соседнего describe).
  // Тип у этого вызова строгий (variant2 требует `icon: ReactNode` при
  // `children?: undefined`, variant3 — `icon?: undefined`), и литеральный
  // `false` ни туда, ни туда не подходит — та же причина, что и у
  // `iconEnd={false}` выше: типизированного легального вызова с пустым `icon`
  // и одновременно детьми нет, потому что нет причины писать `icon={false}`
  // литералом. Кастуем, как и там, чтобы проверить РАНТАЙМ на вычисленное
  // значение.
  it('iconOnly + icon={false} + children — не бросает: это iconOnly-кнопка с children', () => {
    const props = { iconOnly: true, icon: false, 'aria-label': 'Домой', children: '⌂' } as unknown as React.ComponentProps<typeof Button>
    render(<Button {...props} />)
    const btn = screen.getByRole('button', { name: 'Домой' })
    expect(btn).toHaveClass('ds-btn--icon')
    expect(btn.querySelector('.ds-btn__icon')).toBeNull()
    expect(btn).toHaveTextContent('⌂')
  })
})

// DS-365. В репозитории нет ни одного `<form>`, поэтому дефолт браузера
// (`submit`) не видела ни одна фикстура; форма здесь — единственное место, где
// он вообще проявляется.
describe('Button: type по умолчанию', () => {
  function inForm(button: React.ReactNode) {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(<form onSubmit={onSubmit}>{button}</form>)
    return onSubmit
  }

  it('без type клик НЕ отправляет форму потребителя', async () => {
    const onClick = vi.fn()
    const onSubmit = inForm(<Button onClick={onClick}>Отмена</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveAttribute('type', 'button')
  })

  it('явный type="submit" перекрывает дефолт и отправляет', async () => {
    const onSubmit = inForm(<Button type="submit">Сохранить</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('у as="a" атрибута type нет: это ссылка, и дефолт кнопки к ней не относится', () => {
    render(<Button as="a" href="/x">Долги</Button>)
    expect(screen.getByRole('link', { name: 'Долги' })).not.toHaveAttribute('type')
  })
})
