import { describe, it, expect } from 'vitest'
import { applyPatch } from './frame-patch.js'
import { parseFrameUrl } from './frame-url.js'

const base = parseFrameUrl('?c=DataTable&case=dense&sid=3&theme=light&p.dense=true')

describe('applyPatch', () => {
  it('пропсы дополняются, а не заменяются целиком', () => {
    const next = applyPatch(base, { type: 'patch', props: { loading: 'true' } })
    expect(next.props).toEqual({ dense: 'true', loading: 'true' })
  })

  it('слоты дополняются, а не заменяются целиком — как пропсы', () => {
    const withSlot = applyPatch(base, { type: 'patch', slots: { header: 'Badge:base' } })
    const next = applyPatch(withSlot, { type: 'patch', slots: { footer: 'Badge:dot' } })
    expect(next.slots).toEqual({ header: 'Badge:base', footer: 'Badge:dot' })
  })

  it('тема, масштаб, набор данных и слои заменяются целиком', () => {
    const next = applyPatch(base, {
      type: 'patch',
      theme: 'dark',
      scale: 1.15,
      data: 'rows-500',
      layers: ['grid'],
    })
    expect([next.theme, next.scale, next.data, next.layers]).toEqual(['dark', 1.15, 'rows-500', ['grid']])
  })

  it('набор текста заменяется целиком, а отсутствие поля — не трогает', () => {
    // Отдельно от темы и шкалы выше, потому что отличается умолчанием: `text`
    // приходит из адреса всегда (`ru`), тогда как `data`/`force` умеют быть
    // пустыми. Проверяется ОБА направления: набор, умеющий только включаться,
    // читался бы как сломанный кадр — вернуть русский можно было бы только
    // перезагрузкой, то есть ценой живого состояния.
    const ps = applyPatch(base, { type: 'patch', text: 'pseudo' })
    expect(ps.text).toBe('pseudo')
    expect(applyPatch(ps, { type: 'patch', text: 'ru' }).text).toBe('ru')
    expect(applyPatch(ps, { type: 'patch', theme: 'dark' }).text).toBe('pseudo')
  })

  it('null в наборе данных снимает набор, а отсутствие поля — не трогает', () => {
    const withData = applyPatch(base, { type: 'patch', data: 'rows-500' })
    expect(applyPatch(withData, { type: 'patch', data: null }).data).toBeNull()
    expect(applyPatch(withData, { type: 'patch', theme: 'dark' }).data).toBe('rows-500')
  })

  it('null в force снимает его, а отсутствие поля — не трогает (как data)', () => {
    const withForce = applyPatch(base, { type: 'patch', force: 'offline' })
    expect(applyPatch(withForce, { type: 'patch', force: null }).force).toBeNull()
    expect(applyPatch(withForce, { type: 'patch', theme: 'dark' }).force).toBe('offline')
  })

  it('null у ключа начинки СНИМАЕТ её, а не ставит начинку по имени null', () => {
    // Различимость трёх состояний, а не одно утверждение: поставили — стоит;
    // сняли — ключа НЕТ (не пустая строка: `parseFill('')` даёт `null`, и кадр
    // нарисовал бы ошибку ссылки там, где просили пустоту); соседний ключ при
    // этом на месте — снятие адресное, а не «очистить всё».
    const filled = applyPatch(base, { type: 'patch', slots: { cell: 'Badge:dot', head: 'Badge:base' } })
    const cleared = applyPatch(filled, { type: 'patch', slots: { cell: null } })
    expect('cell' in cleared.slots).toBe(false)
    expect(cleared.slots).toEqual({ head: 'Badge:base' })
  })

  it('компонент и случай патчем не меняются — это перезагрузка, а не патч', () => {
    // @ts-expect-error — форма патча не имеет полей c/caseId, и это проверяется типом
    const next = applyPatch(base, { type: 'patch', c: 'Badge', caseId: 'tones' })
    expect([next.c, next.caseId]).toEqual(['DataTable', 'dense'])
  })

  it('сессия патчем не меняется', () => {
    expect(applyPatch(base, { type: 'patch', theme: 'dark' }).sid).toBe(3)
  })
})
