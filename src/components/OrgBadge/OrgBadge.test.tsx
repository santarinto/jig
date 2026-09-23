import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { OrgBadge } from './OrgBadge.js'

describe('OrgBadge', () => {
  it('буква ЗАДаётся явно, а не выводится из названия', () => {
    // «ОЗОН Банк» человеку дал бы «ОБ» (Avatar.initialsOf берёт два слова),
    // организации нужна «О». Для организации буква — другой объект, не инициалы.
    render(<OrgBadge name="ОЗОН Банк" letter="О" />)
    expect(screen.getByText('О')).toBeInTheDocument()
    expect(screen.queryByText('ОБ')).toBeNull()
  })

  it('называет организацию для скринридера; буква — декорация', () => {
    const { container } = render(<OrgBadge name="ОЗОН Банк" letter="О" />)
    expect(screen.getByRole('img', { name: 'ОЗОН Банк' })).toBeInTheDocument()
    expect(container.querySelector('.ds-orgbadge__letter')).toHaveAttribute('aria-hidden', 'true')
  })

  it('показывает логотип, когда он есть, и держит его вне дерева доступности', () => {
    const { container } = render(<OrgBadge name="ВТБ" letter="В" src="/assets/banks/vtb.svg" />)
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', '/assets/banks/vtb.svg')
    expect(img).toHaveAttribute('alt', '')
    expect(container.querySelector('.ds-orgbadge__letter')).toBeNull()
  })

  /**
   * Главное требование задачи — про инвентаризацию, а не про красоту: заглушка
   * (буква без логотипа) обязана быть отличима от настоящего логотипа, иначе по
   * экрану не видно, чего ещё не хватает. На уровне DOM это разные ветки —
   * логотип без модификатора `--placeholder`, заглушка с ним; экранную часть
   * (пунктир) держит measure-инвариант «OrgBadge: заглушка отличима от логотипа».
   *
   * Мутация: если заглушка рисовалась бы тем же узлом, что логотип (без
   * `--placeholder`), проверка краснеет.
   */
  it('заглушка помечена как заглушка, логотип — нет', () => {
    const { container: ph } = render(<OrgBadge name="ОЗОН Банк" letter="О" />)
    const { container: logo } = render(<OrgBadge name="ВТБ" letter="В" src="/vtb.svg" />)
    expect(ph.querySelector('.ds-orgbadge--placeholder')).not.toBeNull()
    expect(logo.querySelector('.ds-orgbadge--placeholder')).toBeNull()
  })

  it('«банк неизвестен» — отдельное состояние, отличимое и от заглушки, и от логотипа', () => {
    const { container } = render(<OrgBadge name="Неизвестный банк" />)
    expect(container.querySelector('.ds-orgbadge--unknown')).not.toBeNull()
    expect(container.querySelector('.ds-orgbadge--placeholder')).toBeNull()
    expect(container.querySelector('.ds-orgbadge__letter')).toBeNull()
  })

  /**
   * Фирменный цвет — вопрос стилей, и в разметку он не попадает вовсе. Прежний
   * проп `brandColor` клал значение в инлайновый `style` и был единственным
   * местом в системе, где произвольный цвет от потребителя оказывался в
   * разметке; у самого потребителя это запрещено правилом и тестом, то есть
   * проп, заведённый для него, был ему недоступен. Шов остался — переменная
   * `--ds-orgbadge-brand`, которую потребитель ставит своим листом через
   * `className`.
   *
   * Утверждается ОТСУТСТВИЕ атрибута, а не отсутствие пропа: проп убран, и его
   * возврат ловит компилятор (проверка ниже), а вот вернуть инлайновый стиль
   * можно и без пропа — например «удобным» `style`-проходом. Мутация: припиши
   * компоненту `style={{'--ds-orgbadge-brand': …}}` — падает.
   */
  it('в разметке значка нет инлайновых стилей вовсе', () => {
    const { container } = render(<OrgBadge name="ОЗОН Банк" letter="О" className="bank-ozon" />)
    const el = container.querySelector('.ds-orgbadge')!
    expect(el.getAttribute('style')).toBeNull()
    expect(el).toHaveClass('bank-ozon')
  })

  it('прежний проп brandColor больше не компилируется (компайл-мутация)', () => {
    // Периода совместимости в системе нет: заменённая форма API обязана давать
    // ошибку типов, а не деградацию. Снимешь удаление пропа — подавление станет
    // лишним, и typecheck упадёт на нём.
    // @ts-expect-error brandColor убран: цвет задаётся листом потребителя
    const old = <OrgBadge name="ОЗОН Банк" letter="О" brandColor="var(--brand-ozon)" />
    expect(old).toBeTruthy()
  })

  /**
   * Самая частая связка у потребителя — значок и название банка текстом рядом.
   * По умолчанию имя звучит дважды: один раз от плитки, второй от текста.
   * `decorative` убирает плитку из дерева доступности целиком.
   *
   * Утверждается РАЗЛИЧИМОСТЬ двух режимов, а не каждый по отдельности:
   * проверка «декоративный значок не находится по роли» в одиночку зелена и у
   * компонента, который потерял `role="img"` вовсе. Мутация в любую сторону —
   * игнорировать `decorative` или всегда прятать — роняет одну из половин.
   */
  it('decorative убирает значок из дерева доступности, умолчание — нет', () => {
    const { container: named } = render(<OrgBadge name="ОЗОН Банк" letter="О" />)
    expect(named.querySelector('[role="img"]')).not.toBeNull()
    expect(named.querySelector('[aria-hidden="true"].ds-orgbadge')).toBeNull()

    const { container: mute } = render(<OrgBadge name="ОЗОН Банк" letter="О" decorative />)
    expect(mute.querySelector('[role="img"]')).toBeNull()
    expect(mute.querySelector('.ds-orgbadge')).toHaveAttribute('aria-hidden', 'true')
  })

  it('decorative снимает и title — иначе имя всплывает третьим повтором', () => {
    const { container } = render(<OrgBadge name="ОЗОН Банк" letter="О" decorative />)
    expect(container.querySelector('[title]')).toBeNull()
  })

  /**
   * Без гидрации отката нет по построению. Avatar на битом `src` показывает
   * инициалы через `useState`+`onError`; на статической странице обработчик не
   * подключится, и битая картинка останется битой навсегда. OrgBadge поэтому
   * НЕ откатывается: если `src` есть — рисуем `<img>` и точка, а выбор «логотип
   * или буква» делает сервер (эмитит `src` только для существующих файлов).
   *
   * Мутация: добавь Avatar-подобный откат по onError — эта проверка покраснеет
   * (после error появится буква вместо картинки).
   */
  it('битый логотип НЕ откатывается на букву', () => {
    const { container } = render(<OrgBadge name="ВТБ" letter="В" src="/broken.svg" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.querySelector('.ds-orgbadge__letter')).toBeNull()
  })
})
