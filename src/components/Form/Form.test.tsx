import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Card, FormRow } from './Form.js'

describe('Form/Card', () => {
  it('renders card title, body and footer', () => {
    render(<Card title="Реквизиты" footer={<span>подвал</span>}>тело</Card>)
    expect(screen.getByText('Реквизиты')).toBeInTheDocument()
    expect(screen.getByText('тело')).toBeInTheDocument()
    expect(screen.getByText('подвал')).toBeInTheDocument()
  })

  // Имя было «legacy … (backward compatible)» и противоречило политике проекта:
  // периода совместимости здесь нет, старая форма удаляется в том же релизе. На
  // деле кейс описывает, как карточка с простым заголовком выглядит СЕЙЧАС, и
  // он единственный, кто сторожит непротекание виджетных модификаторов
  // (DS-118).
  it('простой заголовок: шапка без виджетной разметки, тело без dense и flush', () => {
    const { container } = render(
      <Card title="Реквизиты" footer={<span>подвал</span>}>тело</Card>,
    )
    const header = container.querySelector('.ds-card__header')
    expect(header).not.toBeNull()
    expect(header).not.toHaveClass('ds-card__header--widget')
    expect(header!.querySelector('.ds-card__titles')).toBeNull()
    expect(header!.textContent).toBe('Реквизиты')
    expect(container.querySelector('.ds-card__body')).not.toHaveClass('ds-card__body--dense')
    expect(container.querySelector('.ds-card__body')).not.toHaveClass('ds-card__body--flush')
  })

  it('omits header and footer when title/footer props are absent', () => {
    const { container } = render(<Card>только тело</Card>)
    expect(screen.getByText('только тело')).toBeInTheDocument()
    expect(container.querySelector('.ds-card__header')).toBeNull()
    expect(container.querySelector('.ds-card__footer')).toBeNull()
    expect(container.querySelector('.ds-card__body')).not.toBeNull()
  })

  it('renders widget header when subtitle or headerAction is set', () => {
    const { container } = render(
      <Card title="Последние заметки" subtitle="за июль 2026" headerAction={<button type="button">⋯</button>}>
        тело
      </Card>,
    )
    const header = container.querySelector('.ds-card__header')
    expect(header).toHaveClass('ds-card__header--widget')
    expect(screen.getByText('Последние заметки')).toHaveClass('ds-card__title')
    expect(screen.getByText('за июль 2026')).toHaveClass('ds-card__subtitle')
    expect(screen.getByRole('button', { name: '⋯' })).toBeInTheDocument()
  })

  it('shows header for headerAction alone', () => {
    const { container } = render(
      <Card headerAction={<button type="button">Меню</button>}>тело</Card>,
    )
    expect(container.querySelector('.ds-card__header--widget')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Меню' })).toBeInTheDocument()
  })

  it('applies dense and noPadding modifiers on the body', () => {
    const { container } = render(<Card title="T" dense noPadding>тело</Card>)
    const body = container.querySelector('.ds-card__body')!
    expect(body).toHaveClass('ds-card__body--dense')
    expect(body).toHaveClass('ds-card__body--flush')
  })

  it('truncates long title and subtitle in widget header', () => {
    const { container } = render(
      <Card title={'Очень длинный заголовок карточки '.repeat(4)} subtitle="подзаголовок" />,
    )
    expect(container.querySelector('.ds-card__title')).toHaveClass('ds-card__title')
    expect(container.querySelector('.ds-card__subtitle')).toHaveClass('ds-card__subtitle')
    expect(container.querySelector('.ds-card__action')).toBeNull()
  })

  it('FormRow links label to control via htmlFor', () => {
    render(<FormRow label="Код" htmlFor="code"><input id="code" /></FormRow>)
    expect(screen.getByText('Код').closest('label')).toHaveAttribute('for', 'code')
  })
})

describe('Card: сворачивание (панель)', () => {
  it('collapsible: заголовок — кнопка с aria-expanded и aria-controls на тело', () => {
    render(<Card title="Панель" collapsible>тело</Card>)
    const toggle = screen.getByRole('button', { name: /Панель/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // useId даёт id с двоеточиями — ищем через getElementById, а не querySelector.
    const bodyId = toggle.getAttribute('aria-controls')!
    expect(document.getElementById(bodyId)).toBeInTheDocument()
  })

  it('клик сворачивает — тело исчезает, aria-expanded=false', async () => {
    render(<Card title="Панель" collapsible>тело-контент</Card>)
    expect(screen.getByText('тело-контент')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Панель/ }))
    expect(screen.queryByText('тело-контент')).toBeNull()
    expect(screen.getByRole('button', { name: /Панель/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('defaultCollapsed стартует свёрнутым', () => {
    render(<Card title="Панель" collapsible defaultCollapsed>тело-контент</Card>)
    expect(screen.queryByText('тело-контент')).toBeNull()
  })

  it('controlled: collapsed фиксирует, клик зовёт onCollapsedChange и сам DOM не меняет', async () => {
    const onCollapsedChange = vi.fn()
    render(
      <Card title="Панель" collapsible collapsed={false} onCollapsedChange={onCollapsedChange}>
        тело-контент
      </Card>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Панель/ }))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)
    expect(screen.getByText('тело-контент')).toBeInTheDocument()
  })

  it('без collapsible заголовок — не кнопка (аддитивно)', () => {
    render(<Card title="Обычная">тело</Card>)
    expect(screen.queryByRole('button', { name: /Обычная/ })).toBeNull()
  })
})

describe('Card: инструменты в шапке (tools)', () => {
  it('рендерятся по aria-label и зовут onSelect', async () => {
    const onRefresh = vi.fn()
    render(
      <Card
        title="П"
        tools={[{ id: 'refresh', icon: <span>⟳</span>, label: 'Обновить', onSelect: onRefresh }]}
      >тело</Card>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('клик по инструменту не сворачивает панель', async () => {
    render(
      <Card
        title="П" collapsible
        tools={[{ id: 'x', icon: <span>x</span>, label: 'Действие', onSelect: () => {} }]}
      >тело-контент</Card>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Действие' }))
    expect(screen.getByText('тело-контент')).toBeInTheDocument()
  })

  it('tools одни (без title) тоже дают виджетную шапку', () => {
    const { container } = render(
      <Card tools={[{ id: 'a', icon: <span>a</span>, label: 'A', onSelect: () => {} }]}>тело</Card>,
    )
    expect(container.querySelector('.ds-card__header--widget')).not.toBeNull()
  })
})

describe('Card: toolbar и framed', () => {
  it('toolbar рендерится над телом и прячется при сворачивании', () => {
    const { rerender } = render(
      <Card title="П" collapsible toolbar={<span>панель-действий</span>}>тело</Card>,
    )
    expect(screen.getByText('панель-действий')).toBeInTheDocument()
    rerender(<Card title="П" collapsible collapsed toolbar={<span>панель-действий</span>}>тело</Card>)
    expect(screen.queryByText('панель-действий')).toBeNull()
  })

  it('toolbar стоит перед телом в разметке', () => {
    const { container } = render(
      <Card title="П" toolbar={<span>тб</span>}>тело</Card>,
    )
    const toolbar = container.querySelector('.ds-card__toolbar')
    const body = container.querySelector('.ds-card__body')
    expect(toolbar).not.toBeNull()
    expect(toolbar!.compareDocumentPosition(body!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('framed даёт модификатор, default — нет', () => {
    const { container, rerender } = render(<Card title="П">тело</Card>)
    expect(container.querySelector('.ds-card')).not.toHaveClass('ds-card--framed')
    rerender(<Card title="П" variant="framed">тело</Card>)
    expect(container.querySelector('.ds-card')).toHaveClass('ds-card--framed')
  })
})

/* Потребитель построил шапку в две строки — заголовок плюс подпись. Режим
   поддерживался, но высота шапки была задана жёстко, и содержимое из неё
   вылезало: замер в браузере дал колонку заголовков 33.38px при контентном
   боксе 32. Плюс длинный заголовок обрезался многоточием без возможности
   перенести его на вторую строку. */
describe('Card header with two lines', () => {
  /*
    Проверка правил `.ds-card__header--widget` ТЕКСТОМ отсюда убрана: она читала
    `Form.css` регэкспом и утверждала наличие строки в файле, а не действие
    правила. Правило перебивается более специфичным селектором из другого листа,
    порядком загрузки или `.ds-scale` — текст остаётся на месте, тест остаётся
    зелёным, шапка обрезана. Проверено прямо: `height: auto` оставлен, но перебит
    правилом `.ds-card > .ds-card__header.ds-card__header--widget { height: 41px }` —
    regex-тест зелёный, `make measure` красный (DS-118).

    То же поведение меряется по-настоящему, в chromium: кейсы
    «Card: шапка из двух строк вмещает содержимое» и «Card: однострочная шапка не
    выросла» в `scripts/measure-invariants.mjs`. Первому пришлось усилить
    фикстуру: с прежней («Время» плюс «часовые пояса») содержимое укладывалось в
    `min-height`, и снятие `height: auto` кейс переживало. Теперь заголовок
    переносится на два ряда в узкой карточке, и внутри кейса стоит санитар —
    содержимое обязано перерасти минимум, иначе кейс проверяет не то.

    Второй регэксп отсюда — на `line-clamp: 2` в `.ds-card__title--wrap` — убран
    по той же причине и с той же заменой: заведён measure-кейс «Card: заголовок
    с переносом ограничен двумя рядами». Он меряет три состояния сразу и требует
    их РАЗЛИЧИМОСТИ: без `--wrap` одна строка, с ним две, а текст на пять строк —
    те же две. Мутации: снять `line-clamp` → «текст на пять строк вырос сверх
    двух» (105.28 против 52.64); снять `white-space: normal` → «перенос не
    сработал», обе высоты 17.55.

    Рендерные проверки ниже остаются: `--wrap` при `titleLines={2}` — поведение
    компонента, и jsdom его видит.
  */

  it('keeps the title on one line by default', () => {
    const { container } = render(<Card title="Очень длинное название карточки" subtitle="подпись" />)
    expect(container.querySelector('.ds-card__title')).not.toHaveClass('ds-card__title--wrap')
  })

  it('lets the title wrap onto a second line when asked', () => {
    const { container } = render(
      <Card title="Спорт · последняя тренировка за отчётный период" titleLines={2} />,
    )
    expect(container.querySelector('.ds-card__title')).toHaveClass('ds-card__title--wrap')
  })

  it('still renders a two-line header from title and subtitle alone', () => {
    render(<Card title="Время" subtitle="часовые пояса" />)
    expect(screen.getByText('Время')).toBeInTheDocument()
    expect(screen.getByText('часовые пояса')).toBeInTheDocument()
  })
})

describe('Card tone', () => {
  it('без пропа модификатора нет — всё аддитивно', () => {
    const { container } = render(<Card title="Задача">тело</Card>)
    expect(container.querySelector('.ds-card')!.className).not.toMatch(/ds-card--tone/)
  })

  it('каждый тон даёт свой модификатор', () => {
    for (const tone of ['neutral', 'accent', 'success', 'warning', 'error', 'info'] as const) {
      const { container, unmount } = render(<Card title="Задача" tone={tone}>тело</Card>)
      expect(container.querySelector('.ds-card')).toHaveClass(`ds-card--tone-${tone}`)
      unmount()
    }
  })

  it('работает на карточке БЕЗ шапки — то, что отвергло тонированную шапку', () => {
    // Card рисует шапку только при title/subtitle/headerAction. Тон, живущий
    // на шапке, здесь молча не сделал бы ничего; полоса на самой карточке
    // от шапки не зависит.
    const { container } = render(<Card tone="error">только тело</Card>)
    expect(container.querySelector('.ds-card__header')).toBeNull()
    expect(container.querySelector('.ds-card')).toHaveClass('ds-card--tone-error')
  })

  it('не трогает остальные классы карточки', () => {
    const plain = render(<Card title="Задача" dense noPadding>тело</Card>)
    const toned = render(<Card title="Задача" dense noPadding tone="success">тело</Card>)
    const body = (c: HTMLElement) => c.querySelector('.ds-card__body')!.className
    expect(body(toned.container)).toBe(body(plain.container))
    expect(toned.container.querySelector('.ds-card__header')!.className)
      .toBe(plain.container.querySelector('.ds-card__header')!.className)
  })

  it('тон уживается с виджетной шапкой и футером', () => {
    const { container } = render(
      <Card title="Майлстон" subtitle="готов" headerAction={<span>⋯</span>}
        tone="success" footer={<span>футер</span>}>тело</Card>,
    )
    expect(container.querySelector('.ds-card')).toHaveClass('ds-card--tone-success')
    expect(container.querySelector('.ds-card__header--widget')).not.toBeNull()
    expect(container.querySelector('.ds-card__footer')).not.toBeNull()
  })
})

describe('Card header icon (DS-22)', () => {
  it('ведущая иконка декоративна и стоит перед заголовком', () => {
    const { container } = render(
      <Card title="Расход" icon={<span data-testid="ic">₽</span>}>тело</Card>,
    )
    const iconWrap = container.querySelector('.ds-card__icon')!
    expect(iconWrap).not.toBeNull()
    expect(iconWrap).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('ic')).toBeInTheDocument()
    // Иконка декоративна: доступное имя карточки несёт текст, не иконка.
    const title = container.querySelector('.ds-card__title')!
    expect(iconWrap.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // Только title+icon (без subtitle/action/collapsible) всё равно даёт
  // widget-шапку — иконке нужен ряд. Мутация: снять `|| icon` из widgetHeader —
  // карточка уйдёт в плоскую шапку, иконка не отрисуется, обе проверки краснеют.
  it('title + icon переводит карточку в widget-шапку', () => {
    const { container } = render(<Card title="Курс" icon={<span>$</span>}>тело</Card>)
    expect(container.querySelector('.ds-card__header--widget')).not.toBeNull()
    expect(container.querySelector('.ds-card__icon')).not.toBeNull()
  })

  // Оба случая в одном утверждении: «иконка одна — шапки нет» проходит и тогда,
  // когда шапка сломана целиком и не появляется НИКОГДА. Различимость и есть
  // проверка (writing-checks, п.6). Мутация: вернуть `|| icon` в showHeader —
  // краснеет первая половина; убрать `title` — краснеет вторая.
  it('одна иконка шапки не заводит, иконка с заголовком — заводит', () => {
    const { container: alone } = render(<Card icon={<span>$</span>}>тело</Card>)
    const { container: titled } = render(<Card title="Курс" icon={<span>$</span>}>тело</Card>)
    expect(alone.querySelector('.ds-card__header')).toBeNull()
    expect(titled.querySelector('.ds-card__header')).not.toBeNull()
  })
})
