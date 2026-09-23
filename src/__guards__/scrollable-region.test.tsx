import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LogViewer } from '../components/LogViewer/LogViewer.js'
import { AgentTranscript } from '../components/AgentTranscript/AgentTranscript.js'
import { Heatmap } from '../components/Heatmap/Heatmap.js'

/**
 * Прокручиваемая область достижима с клавиатуры и НАЗЫВАЕТСЯ (DS-192).
 *
 * `div.ds-heat__scroll`, `div.ds-log__scroll` и `div.ds-transcript__scroll`
 * прокручивались, но `tabIndex` не имели, и в состояниях без кнопок внутри у них
 * не было ни одного фокусируемого потомка. Фокус в контейнер не заходил вовсе —
 * ни Tab, ни стрелками, — то есть клавиатурой до содержимого было НЕ ДОЙТИ.
 * SC 2.1.1, правило axe `scrollable-region-focusable`, стабильно на четырёх
 * адресах верстака из двух прогонов каждый.
 *
 * Не украшение: на ширине 360 у `Heatmap/base` сверх видимого пряталось 473 px
 * сетки. Хуже всего было у транскрипта — на скроллере `role="log"` с
 * `aria-live="polite"`, то есть объявления о новых репликах приходили, а
 * вернуться к прочитанному было нельзя. Живая область, в которую нельзя войти,
 * — не «неудобно», а односторонний канал.
 *
 * ЗАЧЕМ ТЕСТ, А НЕ СЛОЙ AXE ВЕРСТАКА. Слой недетерминирован (DS-195), а
 * утверждение здесь простое и полное: атрибут и имя. Гейт же собран ОДНИМ
 * файлом на три компонента намеренно — это общее свойство, кандидат в строку
 * матрицы DS-177, а не три отдельные проверки, которые разойдутся.
 */

/**
 * Каждый компонент — в состоянии БЕЗ кнопок внутри области: именно оно и было
 * недостижимо. Состояния с кнопками проверяет `no-nested-interactive`, там же,
 * где живёт исключение для нейтральной фокусируемой обёртки.
 */
const REGIONS: [name: string, selector: string, render: () => void][] = [
  ['LogViewer', '.ds-log__scroll', () => {
    render(<LogViewer lines={[{ seq: 1, ts: '2026-09-04T10:00:00Z', kind: 'out', text: 'строка' }]} getLineId={(l) => String(l.seq)} height={200} />)
  }],
  ['AgentTranscript', '.ds-transcript__scroll', () => {
    render(<AgentTranscript turns={[{ id: 't1', kind: 'message', role: 'assistant', ts: '2026-09-04T10:00:00Z', text: 'ответ' }]} getTurnId={(t) => t.id} height={200} />)
  }],
  ['Heatmap', '.ds-heat__scroll', () => {
    render(<Heatmap data={[{ date: '2026-07-02', value: 3 }]} from="2026-07-01" to="2026-07-10" />)
  }],
]

const FOCUSABLE = 'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])'

describe('прокручиваемая область достижима с клавиатуры', () => {
  it('у всех трёх есть tabindex и доступное имя, и виновник назван поимённо', () => {
    const bad: string[] = []
    for (const [name, selector, mount] of REGIONS) {
      mount()
      const el = document.querySelector(selector)
      if (!el) { bad.push(`${name}: области ${selector} нет в разметке — проверка смотрит не туда`); continue }
      if (el.getAttribute('tabindex') !== '0') bad.push(`${name}: у ${selector} нет tabindex="0" — клавиатурой не дойти`)
      // Имя обязательно: без него скринридер объявит «группа» и ничего больше.
      const label = el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby')
      if (!label?.trim()) bad.push(`${name}: у ${selector} нет доступного имени`)
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('состояние без кнопок внутри — то самое, ради которого правило есть', () => {
    // Санитар против способа 3: если бы фикстура сама несла кнопки внутри
    // области, утверждение выше держалось бы и без правки — фокус заходил бы на
    // потомка, и правило нечего было бы проверять.
    //
    // LogViewer здесь ТЕПЕРЬ ЕСТЬ, и это следствие DS-194. Раньше он был
    // исключён: кнопка разворота рисовалась у каждой строки по панельному
    // флагу, и состояния без кнопок внутри в jsdom не собиралось вовсе. Теперь
    // кнопка стоит только у ПЕРЕПОЛНЕННОЙ строки, а переполнение — замер, и в
    // jsdom (где раскладки нет) его ни у кого нет. То есть исключение снялось
    // не поблажкой, а вместе со своей причиной.
    for (const [name, selector, mount] of REGIONS) {
      mount()
      const el = document.querySelector(selector)!
      const inner = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n !== el)
      expect(inner, `${name}: в области есть фокусируемые потомки — случай не тот`).toHaveLength(0)
    }
  })

  it('область добавляет РОВНО ОДИН таб-стоп на панель, и он первый', () => {
    // Цена решения «tabIndex безусловный» названа числом, а не обещанием.
    // Условный вариант — ставить атрибут, только когда фокусируемых потомков нет
    // — отвергнут: список виртуализирован, число кнопок в окне меняется от
    // ПРОКРУТКИ, и таб-стоп мигал бы по мере скролла. Остановка, появляющаяся и
    // исчезающая от положения прокрутки, хуже лишней остановки.
    const lines = [1, 2, 3, 4].map((n) => ({ seq: n, ts: '2026-09-04T10:00:00Z', kind: 'out', text: `строка ${n}` }))
    // ПЕРЕПОЛНЕНИЕ ПОДМЕНЯЕТСЯ, иначе кнопок не будет ни одной и считать
    // нечего: с DS-194 кнопку получает только строка, которая не влезла
    // в потолок, а jsdom раскладки не считает — `scrollHeight` там ноль у
    // всего. Подменяется ровно узел текста строки; остальным свойство отдаёт
    // прежний геттер, чтобы не сломать окно виртуализатора.
    const proto = HTMLElement.prototype
    const prevScroll = Object.getOwnPropertyDescriptor(proto, 'scrollHeight')
    const prevClient = Object.getOwnPropertyDescriptor(proto, 'clientHeight')
    const isText = (el: HTMLElement) => el.classList.contains('ds-log__text')
    Object.defineProperty(proto, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) { return isText(this) ? 100 : prevScroll?.get?.call(this) ?? 0 },
    })
    Object.defineProperty(proto, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) { return isText(this) ? 20 : prevClient?.get?.call(this) ?? 0 },
    })
    let container: HTMLElement
    try {
      ;({ container } = render(
        <LogViewer lines={lines} getLineId={(l) => String(l.seq)} height={200} />,
      ))
    } finally {
      if (prevScroll) Object.defineProperty(proto, 'scrollHeight', prevScroll)
      if (prevClient) Object.defineProperty(proto, 'clientHeight', prevClient)
    }
    const stops = [...container.querySelectorAll(FOCUSABLE)]
    // Первый — сама область: в неё входят до содержимого, а не после него.
    expect(stops[0]!.className).toContain('ds-log__scroll')
    // Остальные — кнопки строк, по одной на строку. Область прибавила один.
    expect(stops).toHaveLength(lines.length + 1)
    expect(stops.slice(1).every((el) => el.className.includes('ds-log__toggle'))).toBe(true)
  })
})
