import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Money } from './Money.js'

const norm = (s: string | null) => (s ?? '').replace(/\u00A0/g, ' ')

describe('Money', () => {
  it('форматирует строку из БД: разряды пробелом, копейки запятой, символ после', () => {
    const { container } = render(<Money value="6900000.00" currency="RUB" />)
    expect(norm(container.textContent)).toContain('6 900 000,00')
    expect(container.textContent).toContain('₽')
  })

  /**
   * Главная причина, по которой value — строка, а не number: float молча портит
   * копейки на больших суммах. Форматирование строковое (без parseFloat), потому
   * 12-значная сумма сохраняет все знаки.
   */
  it('не теряет точность на большой сумме (строковое форматирование, без float)', () => {
    const { container } = render(<Money value="123456789012.34" currency="RUB" />)
    expect(norm(container.textContent)).toContain('123 456 789 012,34')
  })

  it('отрицательное — со знаком минус', () => {
    const { container } = render(<Money value="-1234.56" currency="RUB" />)
    expect(container.textContent).toContain('−')
    expect(norm(container.textContent)).toContain('1 234,56')
  })

  it('signed — у положительного явный плюс', () => {
    const { container } = render(<Money value="1234.56" currency="RUB" signed />)
    expect(container.textContent).toContain('+')
  })

  /**
   * У нуля знака нет: «+0,00 ₽» сообщает о приходе, «−0,00 ₽» о расходе, а в
   * нуле направления не содержится. Найдено потребителем на ленте, где `signed`
   * стоит на каждой строке, а нулевые операции штатны (отменённая комиссия).
   *
   * Утверждается РАЗЛИЧИМОСТЬ: положительное со `signed` плюс получает, ноль —
   * нет. Проверка «у нуля нет плюса» в одиночку зелена и у компонента, который
   * не ставит плюс вовсе, — то есть не поймала бы обратную поломку.
   *
   * Мутация: верни `signed ? '+' : ''` без `&& !zero` — падает.
   */
  it('signed НЕ ставит знак на нуле, но ставит на положительном', () => {
    const { container: zero } = render(<Money value="0.00" currency="RUB" signed />)
    expect(zero.textContent).not.toContain('+')

    const { container: plus } = render(<Money value="0.01" currency="RUB" signed />)
    expect(plus.textContent).toContain('+')
  })

  /**
   * «Минус ноль» приходит из БД настоящим («-0.00» после округления расхода) и
   * нулём быть не перестаёт. Мутация: сними `!zero` из вычисления `neg` — минус
   * вернётся.
   */
  it('«минус ноль» — это ноль, а не расход', () => {
    const { container } = render(<Money value="-0.00" currency="RUB" />)
    expect(container.textContent).not.toContain('−')
    expect(norm(container.textContent)).toContain('0,00')
  })

  it('ноль остаётся нулём при любой записи из БД', () => {
    for (const raw of ['0', '0.00', '000.0', '+0.00']) {
      const { container } = render(<Money value={raw} currency="RUB" signed />)
      expect(container.textContent, `запись ${raw}`).not.toContain('+')
    }
  })

  /**
   * Случай №6 из CLAUDE.md: «нет данных» и «ноль» — РАЗНЫЕ состояния, и
   * утверждать надо их различимость. Схлопывание их в «0,00» — ложь в отчёте о
   * деньгах. Прочерк — БЕЗ знака валюты: «— ₽» читается как сумма, а величины
   * нет.
   */
  it('нет данных — прочерк без знака валюты, и это НЕ ноль', () => {
    const { container: empty } = render(<Money value={null} currency="RUB" />)
    expect(empty.textContent).toContain('—')
    expect(empty.textContent).not.toContain('₽')
    expect(empty.textContent).not.toContain('0')

    const { container: zero } = render(<Money value="0.00" currency="RUB" />)
    expect(zero.textContent).toContain('0,00')
    expect(zero.textContent).not.toContain('—')

    // Ровно то, что должно различаться:
    expect(empty.textContent).not.toEqual(zero.textContent)
  })

  it('пустая строка — тоже прочерк', () => {
    const { container } = render(<Money value="" currency="RUB" />)
    expect(container.textContent).toContain('—')
  })

  /**
   * unknownHint — причина прочерка ВИДИМЫМ текстом, а не в `title`: с клавиатуры
   * и со скринридера `title` недостижим, а причина неизвестности — сведение.
   * Мутация: положишь hint в title вместо текста — getByText не найдёт.
   */
  it('причина прочерка — видимый текст, а не title', () => {
    const { container } = render(<Money value={null} currency="RUB" unknownHint="остаток из выписки не снят" />)
    expect(screen.getByText('остаток из выписки не снят')).toBeInTheDocument()
    expect(container.querySelector('[title="остаток из выписки не снят"]')).toBeNull()
  })

  /**
   * Звёздочка видима, а её смысл лежит текстом в дереве доступности, а НЕ в
   * `title`. Прежняя форма (`title="оценочная величина"`) была вторым решением
   * той же беды в том же компоненте: рядом `unknownHint` сделан видимым текстом
   * именно потому, что `title` недостижим. Предъявлено потребителем.
   *
   * Мутация: верни пояснение в `title` — `getByText` не найдёт, а запрет на
   * `[title]` покраснеет.
   */
  it('estimated — звёздочка видима, пояснение доступно текстом, а не в title', () => {
    const { container } = render(<Money value="1234.56" currency="RUB" estimated />)
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByText('оценочная величина')).toBeInTheDocument()
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('estimatedHint уточняет, чем помечено', () => {
    render(<Money value="1234.56" currency="RUB" estimated estimatedHint="сумма по графику" />)
    expect(screen.getByText('сумма по графику')).toBeInTheDocument()
    expect(screen.queryByText('оценочная величина')).toBeNull()
  })

  it('тон уходит в модификатор (цвет по знаку — состояние)', () => {
    const { container } = render(<Money value="-1234.56" currency="RUB" tone="negative" />)
    expect(container.querySelector('.ds-money--negative')).not.toBeNull()
  })

  it('secondary: эквивалент с датой курса через AsOf', () => {
    const { container } = render(
      <Money value="3.00" currency="KZT"
        secondary={{ value: "0.44", currency: "RUB", rateDate: "2026-08-05" }} />,
    )
    expect(container.textContent).toContain('≈')
    expect(container.querySelector('.ds-money__secondary time')).toHaveTextContent('05.08.2026')
  })

  it('secondary: эквивалента нет по причине — причина текстом', () => {
    render(
      <Money value="3.00" currency="KZT" secondary={{ unavailable: 'курса KZT→RUB нет' }} />,
    )
    expect(screen.getByText('курса KZT→RUB нет')).toBeInTheDocument()
  })
})
