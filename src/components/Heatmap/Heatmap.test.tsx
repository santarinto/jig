import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Heatmap } from './Heatmap.js'
import type { HeatmapDay, HeatThresholds } from './Heatmap.js'

const cells = (c: HTMLElement) => c.querySelectorAll('.ds-heat__day')

/**
 * Ступень рампа числом. Уровень — CSS-контракт, и его представление в разметке
 * одно: класс. Здесь единственное место, знающее про ФОРМАТ имени, — там, где
 * кейсу нужно число (монотонность ряда, порядок легенды). Проверки вида
 * `toHaveClass('ds-heat__swatch--4')` намеренно оставлены как есть: они про
 * контракт и читаются, а замена их на число — потеря конкретики ради
 * единообразия (DS-117).
 */
const swatchLevel = (el: Element): number =>
  Number(el.className.match(/ds-heat__swatch--(\d)/)![1])

describe('Heatmap', () => {
  it('рисует по ячейке на каждый день диапазона включительно', () => {
    const { container } = render(<Heatmap data={[]} from="2026-07-01" to="2026-07-31" />)
    expect(cells(container)).toHaveLength(31)
  })

  it('диапазон из одного дня даёт одну ячейку', () => {
    const { container } = render(<Heatmap data={[]} from="2026-07-29" to="2026-07-29" />)
    expect(cells(container)).toHaveLength(1)
  })

  it('переходит через границу месяца и года', () => {
    const { container } = render(<Heatmap data={[]} from="2025-12-30" to="2026-01-02" />)
    expect(cells(container)).toHaveLength(4)
  })

  it('високосный февраль считается правильно', () => {
    const { container } = render(<Heatmap data={[]} from="2028-02-01" to="2028-02-29" />)
    expect(cells(container)).toHaveLength(29)
  })

  it('день без записи считается нулём', () => {
    const data: HeatmapDay[] = [{ date: '2026-07-02', value: 5 }]
    const { container } = render(<Heatmap data={data} from="2026-07-01" to="2026-07-03" />)
    const all = cells(container)
    expect(all[0]).toHaveClass('ds-heat__swatch--0')
    expect(all[1]).toHaveClass('ds-heat__swatch--2')
    expect(all[2]).toHaveClass('ds-heat__swatch--0')
  })

  it('уровень считается порогами, значение равное порогу идёт в верхнюю ступень', () => {
    // дефолт [1, 3, 6, 10]
    const data: HeatmapDay[] = [
      { date: '2026-07-01', value: 0 },
      { date: '2026-07-02', value: 1 },
      { date: '2026-07-03', value: 2 },
      { date: '2026-07-04', value: 3 },
      { date: '2026-07-05', value: 6 },
      { date: '2026-07-06', value: 10 },
      { date: '2026-07-07', value: 99 },
    ]
    const { container } = render(<Heatmap data={data} from="2026-07-01" to="2026-07-07" />)
    const levels = Array.from(cells(container)).map(swatchLevel)
    expect(levels).toEqual([0, 1, 1, 2, 3, 4, 4])
  })

  it('свои пороги побеждают дефолт', () => {
    const data: HeatmapDay[] = [{ date: '2026-07-01', value: 50 }]
    const { container } = render(
      <Heatmap data={data} from="2026-07-01" to="2026-07-01" thresholds={[100, 200, 300, 400]} />,
    )
    expect(cells(container)[0]).toHaveClass('ds-heat__swatch--0')
  })

  /**
   * Лишний порог — ОТКАЗ, а не тихий кламп (DS-208).
   *
   * До этой задачи пятый и дальше просто отбрасывались: ячейка красилась, сетка
   * рисовалась, легенда честно показывала пять — то есть всё выглядело рабочим,
   * и компонент знал про отброшенное то, чего не знал автор вызова.
   *
   * Два утверждения об одном, и это не дубль: `@ts-expect-error` держит ГРАНИЦУ
   * КОМПИЛЯЦИИ (сними бросок — он останется зелёным, сними тип — покраснеет
   * `typecheck`, потому что ожидаемой ошибки нет), а `toThrow` держит путь, где
   * типа нет вовсе: `any` у потребителя, JS, пороги из конфига. Пятый порог
   * приведён через `as` намеренно — так выглядит вызов, обошедший тип.
   */
  it('порогов больше четырёх — бросок, а не молчаливый кламп', () => {
    const data: HeatmapDay[] = [{ date: '2026-07-01', value: 99 }]
    expect(() => render(
      // @ts-expect-error — порогов больше четырёх: старая форма обязана быть ошибкой типа
      <Heatmap data={data} from="2026-07-01" to="2026-07-01" thresholds={[1, 2, 3, 4, 5, 6, 7]} />,
    )).toThrow(/порогов 7/)
    // Четыре — законный максимум, и он рендерится молча.
    const { container } = render(
      <Heatmap data={data} from="2026-07-01" to="2026-07-01" thresholds={[1, 2, 3, 4]} />,
    )
    expect(cells(container)[0]).toHaveClass('ds-heat__swatch--4')
  })

  it('ведущие пустые ячейки добивают первую колонку до дня недели', () => {
    // 2026-07-01 — среда; при неделе с понедельника перед ней два пустых места.
    const { container } = render(<Heatmap data={[]} from="2026-07-01" to="2026-07-03" />)
    expect(container.querySelectorAll('.ds-heat__pad')).toHaveLength(2)
  })

  it('weekStart сдвигает раскладку недели', () => {
    // При неделе с воскресенья перед средой три пустых места, а не два.
    const { container } = render(
      <Heatmap data={[]} from="2026-07-01" to="2026-07-03" weekStart={0} />,
    )
    expect(container.querySelectorAll('.ds-heat__pad')).toHaveLength(3)
  })

  it('разбор даты не зависит от часового пояса машины', () => {
    // Календарная дата — не момент времени. Локальные методы Date сдвинули бы
    // день у пользователя западнее Гринвича, и вся сетка поехала бы на сутки.
    const tz = process.env.TZ
    process.env.TZ = 'Pacific/Honolulu'
    const { container } = render(<Heatmap data={[]} from="2026-07-01" to="2026-07-03" />)
    expect(container.querySelectorAll('.ds-heat__pad')).toHaveLength(2)
    expect(cells(container)).toHaveLength(3)
    process.env.TZ = tz
  })

  it('onDayClick отдаёт дату и значение', () => {
    const onDayClick = vi.fn()
    const data: HeatmapDay[] = [{ date: '2026-07-02', value: 7 }]
    const { container } = render(
      <Heatmap data={data} from="2026-07-01" to="2026-07-03" onDayClick={onDayClick} />,
    )
    ;(cells(container)[1] as HTMLButtonElement).click()
    expect(onDayClick).toHaveBeenCalledWith('2026-07-02', 7)
  })

  it('с onDayClick ячейки — кнопки с доступным именем', () => {
    const { container } = render(
      <Heatmap data={[]} from="2026-07-01" to="2026-07-03" onDayClick={() => {}} />,
    )
    const first = cells(container)[0]!
    expect(first.tagName).toBe('BUTTON')
    expect(first).toHaveAttribute('aria-label')
  })

  it('без onDayClick кнопок нет, а сетка называет себя целиком', () => {
    const { container } = render(<Heatmap data={[]} from="2026-07-01" to="2026-07-03" />)
    expect(container.querySelectorAll('button')).toHaveLength(0)
    // 365 нефокусируемых элементов в дереве доступности — шум, из которого
    // ничего не собрать; лучше одно честное описание целиком.
    const grid = container.querySelector('.ds-heat__grid')!
    expect(grid).toHaveAttribute('role', 'img')
    expect(grid).toHaveAttribute('aria-label')
  })

  it('formatTooltip попадает и в подсказку, и в доступное имя', () => {
    const data: HeatmapDay[] = [{ date: '2026-07-01', value: 3 }]
    const { container } = render(
      <Heatmap
        data={data} from="2026-07-01" to="2026-07-01"
        onDayClick={() => {}}
        formatTooltip={(d, v) => `${d}: ${v} коммита`}
      />,
    )
    const cell = cells(container)[0]!
    expect(cell).toHaveAttribute('title', '2026-07-01: 3 коммита')
    expect(cell).toHaveAttribute('aria-label', '2026-07-01: 3 коммита')
  })

  it('подписи месяцев не повторяются подряд', () => {
    const { container } = render(<Heatmap data={[]} from="2026-01-01" to="2026-12-31" />)
    const months = Array.from(container.querySelectorAll('.ds-heat__month')).map((m) => m.textContent)
    expect(months.length).toBeGreaterThan(1)
    expect(months.some((m, i) => i > 0 && m === months[i - 1])).toBe(false)
  })

  it('легенда рисуется по умолчанию и снимается пропом', () => {
    const { container: a } = render(<Heatmap data={[]} from="2026-07-01" to="2026-07-03" />)
    expect(a.querySelector('.ds-heat__legend')).not.toBeNull()
    expect(a.querySelectorAll('.ds-heat__legend .ds-heat__swatch')).toHaveLength(5)
    const { container: b } = render(
      <Heatmap data={[]} from="2026-07-01" to="2026-07-03" legend={false} />,
    )
    expect(b.querySelector('.ds-heat__legend')).toBeNull()
  })

  it('легенда идёт от нулевой ступени к старшей — иначе она врёт молча', () => {
    // Замер в браузере проверяет ЦВЕТА легенды на своей разметке, то есть
    // CSS. Порядок, в котором плашки рисует сам компонент, там не виден —
    // сторожить его должен этот тест.
    const { container } = render(<Heatmap data={[]} from="2026-07-01" to="2026-07-03" />)
    const levels = Array.from(container.querySelectorAll('.ds-heat__legend .ds-heat__swatch')).map(swatchLevel)
    expect(levels).toEqual([0, 1, 2, 3, 4])
    const texts = Array.from(container.querySelectorAll('.ds-heat__legend-text')).map((t) => t.textContent)
    expect(texts).toEqual(['меньше', 'больше'])
  })

  /**
   * DS-188. Легенда собиралась из константы рампа, а не из порогов, и при
   * коротком ряде рисовала ступени, которых в сетке нет ни разу. Замерено на 27
   * днях дельты с `thresholds: [-5, 0]`: ячеек по ступеням 3/9/15/0/0 при пяти
   * клетках легенды. Легенда — единственный образец шкалы у читателя, и лишняя
   * клетка заставляет его читать «до максимума ещё далеко» там, где максимум
   * этих данных — средняя.
   *
   * Проверяется РАЗЛИЧЕНИЕМ и счётом узлов: три ряда порогов, три ответа. Один
   * вход ничего бы не доказал — «пять клеток» верно и у сломанной константы.
   */
  it('клеток легенды столько, сколько ступеней различают пороги', () => {
    const cellsOf = (thresholds: HeatThresholds) => {
      const { container } = render(
        <Heatmap data={[]} from="2026-07-01" to="2026-07-03" thresholds={thresholds} />,
      )
      return Array.from(container.querySelectorAll('.ds-heat__legend .ds-heat__swatch')).map(swatchLevel)
    }
    // Дельта «стало хуже или лучше»: два порога, три ступени.
    expect(cellsOf([-5, 0])).toEqual([0, 1, 2])
    // Дефолт — те же пять, что и были: существующие календари не двигаются.
    expect(cellsOf([1, 3, 6, 10])).toEqual([0, 1, 2, 3, 4])
    // Порогов нет — различима одна ступень, и легенда не обещает шкалы.
    expect(cellsOf([])).toEqual([0])
    // Четвёртый порог — законный максимум, и на нём легенда показывает весь
    // рамп. Ряда длиннее здесь больше нет: он не компилируется и бросает
    // (DS-208), и его случай переехал в «порогов больше четырёх —
    // бросок». Раньше на этом месте стояла проверка, что легенда «честно
    // показывает потолок», — то есть проверялась та самая молчаливая
    // деградация.
    expect(cellsOf([1, 2, 3, 4])).toEqual([0, 1, 2, 3, 4])
  })

  it('перевёрнутый диапазон не рисует ничего вместо отрицательного цикла', () => {
    const { container } = render(<Heatmap data={[]} from="2026-07-31" to="2026-07-01" />)
    expect(cells(container)).toHaveLength(0)
  })

  it('свой formatWeekday побеждает дефолт и получает день недели по weekStart', () => {
    // Месяцы и подсказка переопределяются пропами — подписи дней недели обязаны
    // тоже, иначе единственная колонка сетки не поддаётся своему виду вовсе.
    // Язык у всех трёх один и берётся из `<DsText locale>` (DS-184);
    // проп — про вид, а не про язык.
    const seen: number[] = []
    const { container } = render(
      <Heatmap
        data={[]} from="2026-07-01" to="2026-07-03"
        formatWeekday={(dow) => { seen.push(dow); return `Д${dow}` }}
      />,
    )
    const labels = Array.from(container.querySelectorAll('.ds-heat__weekday')).map((w) => w.textContent)
    // Подписаны через одну — остальные ячейки пустые, но строк всё равно семь.
    expect(labels).toHaveLength(7)
    expect(labels.filter(Boolean)).toEqual(['Д1', 'Д3', 'Д5', 'Д0'])
    // 0 — воскресенье: при weekStart=1 неделя идёт Пн…Вс.
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('formatWeekday следует за weekStart', () => {
    const seen: number[] = []
    render(
      <Heatmap
        data={[]} from="2026-07-01" to="2026-07-03" weekStart={0}
        formatWeekday={(dow) => { seen.push(dow); return `Д${dow}` }}
      />,
    )
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  describe('тип дня и метка заметки', () => {
    const mark = (c: HTMLElement, i: number) =>
      cells(c)[i]!.querySelector('.ds-heat__mark')

    it('суббота и воскресенье получают weekend, будни — workday, без всяких данных', () => {
      // 2026-07-01 среда … 2026-07-05 воскресенье
      const { container } = render(
        <Heatmap
          data={[]} from="2026-07-01" to="2026-07-05"
          kinds={{ weekend: { shape: 'ring' }, workday: { shape: 'bar', tone: 'info' } }}
        />,
      )
      const shapes = Array.from(cells(container)).map((c) => {
        const m = c.querySelector('.ds-heat__mark')
        return m?.className.match(/ds-heat__mark--(ring|bar)/)?.[1] ?? null
      })
      // ср чт пт | сб вс
      expect(shapes).toEqual(['bar', 'bar', 'bar', 'ring', 'ring'])
    })

    it('kind из данных переопределяет вычисленный — рабочая суббота выходит буднями', () => {
      const { container } = render(
        <Heatmap
          data={[{ date: '2026-07-04', value: 0, kind: 'workday' }]}
          from="2026-07-03" to="2026-07-05"
          kinds={{ weekend: { shape: 'ring' } }}
        />,
      )
      // пт сб(переопределена в workday) вс
      expect(mark(container, 0)).toBeNull()
      expect(mark(container, 1)).toBeNull()
      expect(mark(container, 2)).not.toBeNull()
    })

    it('будний день можно переопределить в выходной', () => {
      const { container } = render(
        <Heatmap
          data={[{ date: '2026-07-01', value: 0, kind: 'weekend' }]}
          from="2026-07-01" to="2026-07-01"
          kinds={{ weekend: { shape: 'ring' } }}
        />,
      )
      expect(mark(container, 0)).toHaveClass('ds-heat__mark--ring')
    })

    it('weekStart не двигает то, какие даты считаются выходными', () => {
      // Суббота остаётся субботой независимо от того, с какого дня рисуется неделя.
      const shapesFor = (weekStart: 0 | 1) => {
        const { container } = render(
          <Heatmap
            data={[]} from="2026-07-03" to="2026-07-05" weekStart={weekStart}
            kinds={{ weekend: { shape: 'ring' } }}
          />,
        )
        return Array.from(cells(container)).map((c) => !!c.querySelector('.ds-heat__mark'))
      }
      expect(shapesFor(1)).toEqual([false, true, true])
      expect(shapesFor(0)).toEqual([false, true, true])
    })

    it('тип, которого нет в карте, не помечается никак', () => {
      const { container } = render(
        <Heatmap
          data={[{ date: '2026-07-01', value: 0, kind: 'vacation' }]}
          from="2026-07-01" to="2026-07-01"
          kinds={{ weekend: { shape: 'ring' } }}
        />,
      )
      expect(mark(container, 0)).toBeNull()
    })

    it('без карты kinds не помечается ничего — всё аддитивно', () => {
      const { container } = render(<Heatmap data={[]} from="2026-07-01" to="2026-07-07" />)
      expect(container.querySelectorAll('.ds-heat__mark')).toHaveLength(0)
    })

    it('тон применяется к полосе и не применяется к кольцу', () => {
      const { container } = render(
        <Heatmap
          data={[
            { date: '2026-07-01', value: 0, kind: 'holiday' },
            { date: '2026-07-02', value: 0, kind: 'off' },
          ]}
          from="2026-07-01" to="2026-07-02"
          kinds={{
            holiday: { shape: 'bar', tone: 'error' },
            // Тон у кольца игнорируется: оно работает формой, а не цветом,
            // и именно поэтому переживает все ступени рампа.
            off: { shape: 'ring', tone: 'error' },
          }}
        />,
      )
      expect(mark(container, 0)).toHaveClass('ds-heat__mark--error')
      expect(mark(container, 1)).not.toHaveClass('ds-heat__mark--error')
    })

    it('полоса без тона получает нейтральный', () => {
      const { container } = render(
        <Heatmap
          data={[{ date: '2026-07-01', value: 0, kind: 'holiday' }]}
          from="2026-07-01" to="2026-07-01"
          kinds={{ holiday: { shape: 'bar' } }}
        />,
      )
      expect(mark(container, 0)).toHaveClass('ds-heat__mark--neutral')
    })

    it('marked даёт метку заметки, её отсутствие — нет', () => {
      const { container } = render(
        <Heatmap
          data={[
            { date: '2026-07-01', value: 3, marked: true },
            { date: '2026-07-02', value: 3 },
          ]}
          from="2026-07-01" to="2026-07-02"
        />,
      )
      expect(cells(container)[0]!.querySelector('.ds-heat__note')).not.toBeNull()
      expect(cells(container)[1]!.querySelector('.ds-heat__note')).toBeNull()
    })

    it('метка типа и метка заметки уживаются на одной ячейке', () => {
      const { container } = render(
        <Heatmap
          data={[{ date: '2026-07-04', value: 0, marked: true }]}
          from="2026-07-04" to="2026-07-04"
          kinds={{ weekend: { shape: 'ring' } }}
        />,
      )
      const cell = cells(container)[0]!
      expect(cell.querySelector('.ds-heat__mark--ring')).not.toBeNull()
      expect(cell.querySelector('.ds-heat__note')).not.toBeNull()
    })

    it('метки не меняют ступень — заливка помеченного дня та же, что у обычного', () => {
      // Машинная форма ограничения «не соврать о количестве». Цвет проверяет
      // замер в браузере; здесь стережём класс ступени.
      const { container } = render(
        <Heatmap
          data={[
            { date: '2026-07-01', value: 7, kind: 'holiday', marked: true },
            { date: '2026-07-02', value: 7 },
          ]}
          from="2026-07-01" to="2026-07-02"
          kinds={{ holiday: { shape: 'bar', tone: 'error' } }}
        />,
      )
      expect(cells(container)[0]).toHaveClass('ds-heat__swatch--3')
      expect(cells(container)[1]).toHaveClass('ds-heat__swatch--3')
    })

    it('метки скрыты от скринридера — тип уже назван подсказкой', () => {
      const { container } = render(
        <Heatmap
          data={[{ date: '2026-07-04', value: 0, marked: true }]}
          from="2026-07-04" to="2026-07-04"
          kinds={{ weekend: { shape: 'ring' } }}
        />,
      )
      expect(cells(container)[0]!.querySelector('.ds-heat__mark')).toHaveAttribute('aria-hidden', 'true')
      expect(cells(container)[0]!.querySelector('.ds-heat__note')).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('размер ячейки', () => {
    it('cellSize кладётся в --ds-heat-cell через --ds-ui-scale, а не голыми px', () => {
      // Размер компонента и шкала интерфейса — разные величины, но не
      // независимые: заданная ячейка обязана расти вместе со шкалой, иначе на
      // 4K календарь останется единственным, что не выросло.
      const { container } = render(
        <Heatmap data={[]} from="2026-07-01" to="2026-07-07" cellSize={22} />,
      )
      const root = container.querySelector('.ds-heat') as HTMLElement
      expect(root.style.getPropertyValue('--ds-heat-cell'))
        .toBe('calc(22px * var(--ds-ui-scale, 1))')
    })

    it('без пропа переменная не объявляется — размер остаётся за листом', () => {
      // Инлайновое объявление «на всякий случай» перебило бы тему и любую
      // будущую правку дефолта: у style специфичность выше листа.
      const { container } = render(
        <Heatmap data={[]} from="2026-07-01" to="2026-07-07" />,
      )
      const root = container.querySelector('.ds-heat') as HTMLElement
      expect(root.getAttribute('style')).toBeNull()
    })
  })

  it('свой formatMonth побеждает дефолт', () => {
    render(
      <Heatmap data={[]} from="2026-07-01" to="2026-07-31" formatMonth={() => 'МЕСЯЦ'} />,
    )
    expect(screen.getAllByText('МЕСЯЦ').length).toBeGreaterThan(0)
  })
})
