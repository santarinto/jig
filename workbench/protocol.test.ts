import { describe, it, expect } from 'vitest'
import { pack, unpack, NS, type Down, type Up } from './protocol.js'

const ready: Up = { type: 'ready', meta: null }

/**
 * Окно-отправитель, которого ждут. В jsdom `window.parent === window`, так
 * что «своё окно» здесь — это `window`, а «чужое» приходится заводить
 * настоящим `<iframe>`: подделать `source` объектом нельзя, `unpack` сверяет
 * его тождеством.
 */
const mine = window
const stranger = (): Window => {
  const el = document.createElement('iframe')
  document.body.appendChild(el)
  const win = el.contentWindow
  if (!win) throw new Error('у зонда нет contentWindow')
  return win
}

const ev = (data: unknown, origin = window.location.origin, source: Window | null = mine) =>
  ({ data, origin, source }) as MessageEvent

describe('unpack — четыре проверки на входящем сообщении', () => {
  it('пропускает своё', () => {
    expect(unpack<Up>(ev(pack<Up>(7, ready)), 7, mine)).toEqual(ready)
  })

  it('режет чужой origin', () => {
    expect(unpack<Up>(ev(pack<Up>(7, ready), 'https://evil.example'), 7, mine)).toBeNull()
  })

  it('режет чужой конверт — так выглядит сообщение расширения браузера', () => {
    expect(unpack<Up>(ev({ source: 'react-devtools-bridge', payload: {} }), 7, mine)).toBeNull()
  })

  it('режет чужую сессию — сообщение от предыдущего кадра', () => {
    expect(unpack<Up>(ev(pack<Up>(6, ready)), 7, mine)).toBeNull()
  })

  /**
   * DS-148. Конверт безупречен по всем трём прежним проверкам: тот же
   * origin, тот же `ns`, ТОТ ЖЕ `sid` — потому что скрытый зонд из CLAUDE.md
   * заводится с `sid=1`, а первый настоящий кадр оболочки получает тот же
   * номер. Различает их только окно.
   */
  it('режет чужое ОКНО при том же sid — скрытый зонд', () => {
    const probe = stranger()
    expect(unpack<Up>(ev(pack<Up>(7, ready), window.location.origin, probe), 7, mine)).toBeNull()
    // И симметрично: то же сообщение от ожидаемого окна проходит. Без этой
    // половины тест доказывал бы только «что-то режется».
    expect(unpack<Up>(ev(pack<Up>(7, ready), window.location.origin, mine), 7, mine)).toEqual(ready)
  })

  it('режет всё, пока окна нет — кадр ещё не смонтирован', () => {
    expect(unpack<Up>(ev(pack<Up>(7, ready), window.location.origin, null), 7, null)).toBeNull()
  })

  it('режет чужую версию протокола', () => {
    expect(unpack<Up>(ev({ ns: NS, v: 99, sid: 7, body: ready }), 7, mine)).toBeNull()
  })

  it('режет мусор', () => {
    expect(unpack<Up>(ev(null), 7, mine)).toBeNull()
    expect(unpack<Up>(ev('строка'), 7, mine)).toBeNull()
    expect(unpack<Up>(ev({ ns: NS }), 7, mine)).toBeNull()
  })
})

describe('Down — два вида различимы', () => {
  it('unpack отдаёт patch и ask-kinds различимо', () => {
    const patchMsg: Down = { type: 'patch', theme: 'dark' }
    const askMsg: Down = { type: 'ask-kinds' }

    expect(unpack<Down>(ev(pack<Down>(7, patchMsg)), 7, mine)).toEqual(patchMsg)
    expect(unpack<Down>(ev(pack<Down>(7, askMsg)), 7, mine)).toEqual(askMsg)
  })

  /**
   * Тест ТИПОВ, не рантайма: если в `Down` добавят третий член и забудут
   * разобрать его здесь, `_exhaustive` перестанет быть `never`, и упадёт
   * `npm run typecheck` — не эта строка `expect`. Присутствие функции в файле
   * не проверяемо самим vitest (он транспилирует без проверки типов), поэтому
   * исчерпанность подтверждается мутацией, а не запуском.
   */
  it('switch по type у Down исчерпывающий', () => {
    const describeDown = (m: Down): string => {
      switch (m.type) {
        case 'patch':
          return 'patch'
        case 'ask-kinds':
          return 'ask-kinds'
        case 'scroll-to':
          return 'scroll-to'
        default: {
          const exhaustive: never = m
          return exhaustive
        }
      }
    }

    expect(describeDown({ type: 'patch' })).toBe('patch')
    expect(describeDown({ type: 'ask-kinds' })).toBe('ask-kinds')
    expect(describeDown({ type: 'scroll-to', x: null, y: null })).toBe('scroll-to')
  })
})
