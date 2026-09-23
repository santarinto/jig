import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AsOf } from './AsOf.js'

describe('AsOf', () => {
  it('ISO внутрь, ДД.ММ.ГГГГ наружу; машиночитаемая дата в <time datetime>', () => {
    const { container } = render(<AsOf label="остаток на" date="2026-08-07" />)
    expect(screen.getByText(/остаток на/)).toBeInTheDocument()
    const time = container.querySelector('time')!
    expect(time).toHaveTextContent('07.08.2026')
    expect(time).toHaveAttribute('datetime', '2026-08-07')
  })

  it('ведущее слово по умолчанию — «на»', () => {
    render(<AsOf date="2026-08-07" />)
    expect(screen.getByText(/^на/)).toBeInTheDocument()
  })

  it('пустая дата — компонент молчит (у несуществующего числа нет возраста)', () => {
    const { container } = render(<AsOf date="" label="остаток на" />)
    expect(container.firstChild).toBeNull()
  })

  /**
   * Молчание — умолчание, а не единственное поведение: самостоятельной подписью
   * оно делает «дату не знаем» неотличимым от «подпись забыли поставить».
   * Утверждается РАЗЛИЧИМОСТЬ двух исходов пустой даты, а не каждый по
   * отдельности: проверка «с `unknownLabel` текст виден» в одиночку зелена и у
   * компонента, который рисует подпись всегда, — то есть не заметила бы, что
   * встраивание в `Money` сломалось.
   *
   * Мутация: рисуй подпись независимо от `unknownLabel` — падает верхняя
   * половина; игнорируй `unknownLabel` — нижняя.
   */
  it('пустая дата: без unknownLabel молчит, с ним говорит', () => {
    const { container: silent } = render(<AsOf date="" label="остаток на" />)
    expect(silent.firstChild).toBeNull()

    const { container: spoken } = render(<AsOf date="" unknownLabel="дата неизвестна" />)
    expect(spoken.firstChild).not.toBeNull()
    expect(screen.getByText('дата неизвестна')).toBeInTheDocument()
  })

  it('в пределах порога — свежее: ни слова-признака, ни модификатора', () => {
    const { container } = render(
      <AsOf label="остаток на" date="2026-08-05" stale={{ afterDays: 14, today: '2026-08-07' }} />,
    )
    expect(container.querySelector('.ds-asof--stale')).toBeNull()
    expect(screen.queryByText(/устарел/)).toBeNull()
  })

  /**
   * Компонент сам считает возраст и «N дн.» — потребителю не нужно держать
   * дату-математику у себя (иначе она разъедется по четырём вызовам). 21 день
   * при пороге 14 → устарело.
   */
  it('старше порога — устарело, и число дней считает компонент', () => {
    render(<AsOf label="остаток на" date="2026-07-17" stale={{ afterDays: 14, today: '2026-08-07' }} />)
    expect(screen.getByText(/устарело, 21 дн\./)).toBeInTheDocument()
  })

  /**
   * Главное утверждение и случай №6 из CLAUDE.md: тон устаревания различим НЕ
   * ТОЛЬКО цветом — иначе в монохроме и при дальтонизме предупреждение исчезает.
   * Проверяем видимое СЛОВО. Мутация: рисовать устаревание одним модификатором
   * `ds-asof--stale` (только цвет), без текста «устарело», — проверка краснеет.
   */
  it('устаревание помечено видимым словом, а не только цветом', () => {
    render(<AsOf label="остаток на" date="2026-07-17" stale={{ afterDays: 14, today: '2026-08-07' }} />)
    expect(screen.getByText(/устарело/)).toBeInTheDocument()
  })

  it('свежее и устаревшее различимы по тексту, а не только по классу', () => {
    // Одна и та же дата: разницу несёт ТОЛЬКО пометка устаревания, не дата.
    // Иначе тексты разошлись бы из-за разных дат и проверка была бы верна не о
    // том (случай №4). Мутация «пометка только цветом» роняет её.
    const fresh = render(<AsOf date="2026-07-17" />).container.textContent
    const stale = render(<AsOf date="2026-07-17" stale={{ afterDays: 14, today: '2026-08-07' }} />).container.textContent
    expect(stale).not.toEqual(fresh)
  })

  /**
   * Устаревает ТОЛЬКО прошлое. У даты в будущем возраст отрицательный, и
   * «устарело, −24 дн.» было бы ложью о платеже, который ещё не наступил.
   * Случай потребителя: страница стратегии, где будущие даты — норма.
   *
   * Проверка не про неопровержимое: односторонность сравнения можно сломать
   * правдоподобной правкой. Мутация — `Math.abs(ageDays) > stale.afterDays`
   * (соблазнительная как «показывать возраст в обе стороны») — роняет её.
   */
  it('дата в будущем не устаревает', () => {
    const { container } = render(
      <AsOf label="платёж" date="2026-09-01" stale={{ afterDays: 7, today: '2026-08-08' }} />,
    )
    expect(container.querySelector('.ds-asof--stale')).toBeNull()
    expect(screen.queryByText(/устарел/)).toBeNull()
    expect(container.textContent).not.toContain('−24')
  })

  /**
   * Нечитаемую дату компонент показывает как есть, а не подменяет пустотой:
   * пустоту принимают за «даты и не было», и разобраться с испорченным
   * значением станет невозможно по экрану. Мутация: верни `null` на
   * неразобравшейся строке — падает.
   */
  it('нечитаемая дата остаётся видна, а не превращается в пустоту', () => {
    const { container } = render(
      <AsOf date="не-дата" stale={{ afterDays: 7, today: '2026-08-08' }} />,
    )
    expect(container.textContent).toContain('не-дата')
  })

  it('слово-признак задаётся снаружи', () => {
    render(<AsOf date="2026-07-17" stale={{ afterDays: 14, today: '2026-08-07' }} staleLabel="просрочено" />)
    expect(screen.getByText(/просрочено, 21 дн\./)).toBeInTheDocument()
  })

  it('порог и «сегодня» — один объект, задать наполовину нельзя (компайл-мутация)', () => {
    // Если бы afterDays и today были отдельными необязательными пропами, «задал
    // порог, забыл дату» компилировалось бы и молча значило «никогда не
    // устаревает» — случай №6. Ошибки типа ниже это держат: снимешь объект, и
    // подавления станут лишними — typecheck упадёт.
    // @ts-expect-error afterDays без today — неполный объект stale
    const bad1 = <AsOf date="2026-07-17" stale={{ afterDays: 14 }} />
    // @ts-expect-error today без afterDays — неполный объект stale
    const bad2 = <AsOf date="2026-07-17" stale={{ today: '2026-08-07' }} />
    expect(bad1).toBeTruthy()
    expect(bad2).toBeTruthy()
  })
})
