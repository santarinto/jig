/**
 * Санитар гонок: сообщение чужой сессии не действует на текущий кадр.
 *
 * Утверждается РАЗЛИЧИМОСТЬ двух состояний, а не каждое по отдельности.
 * Проверка «стухшее сообщение ничего не сделало» в одиночку проходит и на
 * оболочке, которая не слушает вообще ничего; проверка «своё сообщение
 * сработало» в одиночку проходит на оболочке, которая слушает всё подряд.
 * Дефект живёт ровно между ними.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Shell } from './shell-app.js'
import { frameSid, sendUp } from './test-kit.js'
import type { FixtureMeta } from './protocol.js'

const BADGE_META: FixtureMeta = {
  name: 'Badge',
  group: 'Отображение',
  cases: [{ id: 'tones', title: 'Все тона', values: {}, slots: {} }],
  controls: {},
  unexpressed: [],
  data: [],
  slots: {},
}

afterEach(cleanup)

const list = () => screen.getByRole('navigation', { name: 'Компоненты' })
// Случаи с фазы 3 живут в доке, а не в рельсе — тест написан до переезда
// разметки в dock.tsx (DS-62), проверка следует за ней.
const dock = () => screen.getByRole('region', { name: 'Панель' })
const skeleton = () => document.querySelector('.wb__skeleton')

describe('гонка сессий', () => {
  it('ready прошлой сессии не снимает скелет текущего кадра и не приносит чужие случаи', () => {
    render(<Shell />)

    // Три переключения подряд, как щёлкает человек.
    const stale: number[] = [frameSid()]
    fireEvent.click(within(list()).getByRole('button', { name: 'Badge' }))
    stale.push(frameSid())
    fireEvent.click(within(list()).getByRole('button', { name: 'DataTable' }))
    stale.push(frameSid())
    fireEvent.click(within(list()).getByRole('button', { name: 'Badge' }))

    const current = frameSid()
    expect(stale.every((s) => s !== current)).toBe(true)

    // Опоздавшие ответы всех трёх мёртвых сессий.
    for (const s of stale) sendUp(s, { type: 'ready', meta: BADGE_META })

    expect(skeleton()).not.toBeNull()
    expect(within(dock()).queryByRole('button', { name: 'Все тона' })).toBeNull()

    // Своё — действует. Без этой половины санитар проходит на глухой оболочке.
    sendUp(current, { type: 'ready', meta: BADGE_META })

    expect(skeleton()).toBeNull()
    expect(within(dock()).getByRole('button', { name: 'Все тона' })).toBeTruthy()
  })
})
