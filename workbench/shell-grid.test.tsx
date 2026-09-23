/**
 * Режим сетки (Задача 34) со стороны оболочки.
 *
 * Главное утверждение фазы про сетку — ПЕРЕИСПОЛЬЗОВАНИЕ: смена темы обязана
 * уходить патчем в живые документы, а не пересоздавать шесть кадров. Проверять
 * это надо по `src`, а не по числу узлов: пересозданный кадр внешне такой же,
 * и «шесть iframe до, шесть после» проходит на любой реализации.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { sendUp, frameSid } from './test-kit.js'
import { GRID_LIMIT } from './grid-plan.js'
import { WIDTH_PRESETS } from './frame-width.js'
import type { FixtureMeta } from './protocol.js'

afterEach(cleanup)
beforeEach(() => {
  window.history.pushState(null, '', '/')
})

const META: FixtureMeta = {
  name: 'DataTable',
  group: 'Data',
  cases: [{ id: 'base', title: 'base', values: {}, slots: {} }],
  controls: {},
  unexpressed: [],
  data: [],
  slots: {},
}

const modeBtn = (name: string) =>
  within(screen.getByRole('group', { name: 'Вид' })).getByRole('button', { name })

const frames = (): HTMLIFrameElement[] =>
  Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe.wb__frame'))

const srcs = (): string[] => frames().map((f) => f.getAttribute('src') ?? '')

const toGrid = (): void => {
  render(<Shell />)
  sendUp(frameSid(), { type: 'ready', meta: META })
  fireEvent.click(modeBtn('сетка'))
}

describe('сетка', () => {
  it('по кадру на пресет ширины, и каждый подписан', () => {
    toGrid()
    expect(frames()).toHaveLength(WIDTH_PRESETS.length)
    for (const w of WIDTH_PRESETS) {
      expect(screen.getByText(new RegExp(`^${w} · свет$`))).toBeTruthy()
    }
  })

  it('у каждой ячейки СВОЯ сессия — иначе сообщения одного кадра приходят от имени другого', () => {
    toGrid()
    const sids = srcs().map((s) => new URLSearchParams(s.split('?')[1]).get('sid'))
    expect(new Set(sids).size).toBe(sids.length)
  })

  it('ширина в адрес ячейки не едет: её задаёт вьюпорт, а не параметр', () => {
    toGrid()
    for (const s of srcs()) expect(new URLSearchParams(s.split('?')[1]).has('w')).toBe(false)
  })

  it('смена темы ПЕРЕИСПОЛЬЗУЕТ кадры: те же адреса, не новые документы', () => {
    // Требование спеки дословно. Пересозданный кадр внешне такой же, поэтому
    // утверждается неизменность `src` (в нём сессия), а не число узлов.
    toGrid()
    const before = srcs()

    fireEvent.click(within(screen.getByRole('group', { name: 'Тема кадра' })).getByRole('button', { name: 'тьма' }))

    expect(srcs()).toEqual(before)
  })

  it('смена компонента, наоборот, пересоздаёт ячейки — это другой документ', () => {
    toGrid()
    const before = srcs()

    const list = screen.getByRole('navigation', { name: 'Компоненты' })
    const other = within(list)
      .getAllByRole('button')
      .find((b) => b.textContent !== 'DataTable')
    if (!other) throw new Error('в списке один компонент — переключаться некуда')
    fireEvent.click(other)

    expect(srcs()).not.toEqual(before)
    expect(frames()).toHaveLength(WIDTH_PRESETS.length)
  })

  it('обе темы: пар вдвое больше, лимит режет, и срезанное названо', () => {
    toGrid()
    fireEvent.click(screen.getByRole('button', { name: 'обе темы' }))

    expect(frames()).toHaveLength(GRID_LIMIT)
    expect(screen.getByText(/Ещё 2 не показано/)).toBeTruthy()
    // Пара по ширине не разорвана: самая широкая срезана целиком.
    expect(screen.queryByText(/^1440 · /)).toBeNull()
    expect(screen.getByText(/^1024 · тьма$/)).toBeTruthy()
  })

  it('включение обеих тем не пересоздаёт уже показанные ячейки', () => {
    // Те же документы, просто рядом появились соседи: иначе каждый щелчок по
    // тумблеру стоил бы шести перезагрузок с полным листом системы.
    toGrid()
    const before = srcs()
    fireEvent.click(screen.getByRole('button', { name: 'обе темы' }))
    const after = srcs()

    for (const src of before.slice(0, 3)) expect(after).toContain(src)
  })

  it('общий патч темы не перекрывает тему ячейки, заданную составом', () => {
    // Патч копится в оболочке одним объектом и доезжает до КАЖДОГО кадра,
    // когда тот отчитался о готовности. Тема, выставленная до входа в сетку,
    // без этой защиты перекрасила бы вторую половину сетки в первую тему —
    // и «обе темы» показывало бы одну.
    render(<Shell />)
    sendUp(frameSid(), { type: 'ready', meta: META })
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Тема кадра' })).getByRole('button', { name: 'тьма' }),
    )
    fireEvent.click(modeBtn('сетка'))
    fireEvent.click(screen.getByRole('button', { name: 'обе темы' }))

    // Вторая половина — светлая: первая тема основная (тьма), добавленная свет.
    const light = frames().find((f) => (f.getAttribute('src') ?? '').includes('theme=light'))
    if (!light) throw new Error('светлой ячейки в сетке нет')
    const sid = Number(new URLSearchParams((light.getAttribute('src') ?? '').split('?')[1]).get('sid'))
    const spy = vi.spyOn(light.contentWindow as Window, 'postMessage')

    sendUp(sid, { type: 'ready', meta: META })

    const bodies = spy.mock.calls.map((c) => (c[0] as { body: { theme?: string } }).body)
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.every((b) => b.theme === undefined)).toBe(true)
    spy.mockRestore()
  })

  it('в сетке нет ручки ресайза, а чипы ширины ЖИВЫЕ: они выбирают состав', () => {
    // До DS-153 чипы здесь были заперты: ширина считалась заданной
    // составом, и выбирать было нечего. Теперь состав ими и выбирается —
    // «все» или одна ширина. Ручка ресайза по-прежнему не нужна: она тянула
    // бы одну ячейку из нескольких.
    toGrid()
    expect(screen.queryByRole('separator', { name: /правый край/ })).toBeNull()

    const widths = screen.getByRole('group', { name: 'Ширина кадра' })
    const preset = within(widths).getByRole('button', { name: '360' })
    expect(preset.hasAttribute('disabled')).toBe(false)
    expect(within(widths).getByRole('button', { name: 'все' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(widths).getByText('все сразу')).toBeTruthy()

    // «Фактический размер» в сетке не печатается: он был бы про одну ячейку
    // из нескольких, а выглядел бы как ответ про кадр вообще.
    expect(within(widths).queryByLabelText('Фактический размер')).toBeNull()
  })

  it('одна ширина плюс обе темы дают ПАРУ: ширина одна, темы разные (DS-153)', () => {
    // То, ради чего задача заведена. Проверяется РАЗЛИЧЕНИЕМ, а не счётом:
    // два кадра одной ширины и одной темы дали бы те же «два кадра», и пара
    // притворялась бы парой. Отличаться обязана ТЕМА, совпадать — ширина.
    toGrid()
    const widths = screen.getByRole('group', { name: 'Ширина кадра' })
    fireEvent.click(within(widths).getByRole('button', { name: '360' }))
    fireEvent.click(screen.getByRole('button', { name: 'обе темы' }))

    expect(frames()).toHaveLength(2)
    const themes = srcs().map((s) => new URLSearchParams(s.split('?')[1]).get('theme'))
    expect(new Set(themes)).toEqual(new Set(['light', 'dark']))
    // Ширина вьюпорта — у обёртки кадра, в адрес она не едет (см. случай выше).
    const wraps = Array.from(document.querySelectorAll<HTMLElement>('.wb__frame-wrap'))
    expect(wraps).toHaveLength(2)
    expect(new Set(wraps.map((el) => el.style.width))).toEqual(new Set(['360px']))
    // Подписи ячеек называют то же самое человеку.
    expect(screen.getByText('360 · свет')).toBeTruthy()
    expect(screen.getByText('360 · тьма')).toBeTruthy()
    // Лимит здесь ни при чём: резать нечего, и приписка о срезанном не лжёт.
    expect(screen.queryByText(/не показано/)).toBeNull()
  })

  it('сужение состава до одной ширины ПЕРЕИСПОЛЬЗУЕТ её кадр, а не строит новый', () => {
    // Тот же довод, что у смены темы: ячейка ключуется шириной и местом, а не
    // составом. Пересозданный кадр внешне такой же, поэтому сверяется адрес.
    toGrid()
    const before = srcs()[WIDTH_PRESETS.indexOf(360)]
    fireEvent.click(within(screen.getByRole('group', { name: 'Ширина кадра' })).getByRole('button', { name: '360' }))
    expect(srcs()).toEqual([before])
  })

  it('«все» возвращает состав обратно, и снова по кадру на пресет', () => {
    toGrid()
    const widths = screen.getByRole('group', { name: 'Ширина кадра' })
    fireEvent.click(within(widths).getByRole('button', { name: '768' }))
    expect(frames()).toHaveLength(1)
    expect(within(widths).getByText('одна ширина')).toBeTruthy()
    fireEvent.click(within(widths).getByRole('button', { name: 'все' }))
    expect(frames()).toHaveLength(WIDTH_PRESETS.length)
  })
})
