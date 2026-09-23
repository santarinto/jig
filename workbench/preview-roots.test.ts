/**
 * Корни слоёв кадра (DS-163).
 *
 * Утверждается ГРАНИЦА, а не «список непустой»: слой, взявший весь документ,
 * прошёл бы любую проверку про порталы и при этом принёс бы претензии к
 * оболочке кадра — то есть починил бы одну слепоту, заведя вторую ложь.
 * Поэтому в каждом случае есть узел, которого в ответе быть НЕ ДОЛЖНО.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { previewRoots } from './preview-roots.js'

afterEach(() => {
  document.body.innerHTML = ''
})

/** Кадр как он есть: `#root` с превью внутри, оверлей — прямой ребёнок body. */
const frame = (overlays = ''): { host: Element } => {
  document.body.innerHTML = `
    <div id="root">
      <div class="wbf-host"><button id="inside"></button></div>
      <div class="wbf-strip">служебная полоса кадра</div>
    </div>${overlays}`
  return { host: document.querySelector('.wbf-host')! }
}

describe('previewRoots', () => {
  it('без порталов корень ровно один — хост', () => {
    // Обычный случай, и он же гарантия отсутствия регресса: пока оверлея нет,
    // слои видят ровно то, что видели до задачи.
    const { host } = frame()
    expect(previewRoots(host)).toEqual([host])
  })

  it('оверлей-портал приезжает ВТОРЫМ корнем, а хост остаётся первым', () => {
    // Ровно тот дефект: `.ds-modal__overlay` — прямой ребёнок body кадра, и
    // слой, ходивший от одного хоста, не видел его вовсе.
    const { host } = frame('<div class="ds-modal__overlay" id="ov"></div>')
    expect(previewRoots(host)).toEqual([host, document.getElementById('ov')])
  })

  it('порталов несколько — едут все и в порядке документа', () => {
    // Тостер живёт поверх Modal (шкала слоёв), то есть два портала разом —
    // не редкость, а штатный случай.
    const { host } = frame(
      '<div class="ds-modal__overlay" id="modal"></div><div class="ds-toaster" id="toaster"></div>',
    )
    expect(previewRoots(host).map((e) => e.id)).toEqual(['', 'modal', 'toaster'])
  })

  it('служебная разметка КАДРА в корни не попадает, хотя лежит рядом с хостом', () => {
    // Полоса неразмещённых начинок, номера стопов и контуры нарушений — дети
    // `#root`, а не `body`. Взять документ целиком значило бы спрашивать axe
    // про них: человек чинить их не может, и претензия была бы шумом.
    const { host } = frame('<div class="ds-modal__overlay"></div>')
    const roots = previewRoots(host)
    expect(roots.some((r) => r.querySelector('.wbf-strip'))).toBe(false)
    expect(roots).not.toContain(document.getElementById('root'))
  })

  it('скрипты и стили — не порталы: обходить в них нечего', () => {
    const { host } = frame('<script id="s"></script><style id="c"></style>')
    expect(previewRoots(host)).toEqual([host])
  })

  it('оверлей ошибки сборки vite — не портал: это не превью', () => {
    // Появляется он ровно тогда, когда человек и так смотрит на сломанное, и
    // его собственные претензии axe были бы ложным следом в этот момент.
    const { host } = frame('<vite-error-overlay></vite-error-overlay>')
    expect(previewRoots(host)).toEqual([host])
  })

  it('хост прямым ребёнком body не считает соседа своим предком', () => {
    // Так кадр не выглядит, но так выглядят его тесты, и падение здесь
    // читалось бы как дефект слоя, а не как дефект стенда.
    document.body.innerHTML = '<div id="host"></div><div id="ov"></div>'
    const host = document.getElementById('host')!
    expect(previewRoots(host)).toEqual([host, document.getElementById('ov')])
  })
})
