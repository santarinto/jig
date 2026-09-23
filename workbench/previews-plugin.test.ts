import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolvePreview, patchPreviewHtml, stylesHref, PREFIX } from './previews-plugin.js'

/**
 * Верстак отвечал `200 OK` и отдавал ОБОЛОЧКУ на любой путь под `/previews/`
 * (DS-223): корень дев-сервера — `workbench`, превью лежат выше, и на
 * несовпавший путь vite подставляет SPA-фолбэк. Документ приходил чужой, а код
 * ответа говорил «всё в порядке».
 *
 * Утверждается РАЗЛИЧЕНИЕ, обе половины сразу. Глухой 404 на всё под
 * `/previews/` — правка на строку, и она зелена по половине «несуществующее
 * отказано», ломая при этом ровно тот канал, ради которого задача заведена.
 * Поэтому здесь всегда пара: существующее превью отдаётся, несуществующее
 * отказано, и чужой путь не трогается вовсе.
 */
const ROOT = resolve(__dirname, '..')
const PREVIEWS = resolve(ROOT, 'previews')

const names = readdirSync(PREVIEWS).filter((f) => f.endsWith('.html'))

describe('честный ответ на пути под /previews/', () => {
  it('обход нашёл превью — иначе всё ниже зелено на пустоте', () => {
    expect(names.length, 'previews/*.html не найдены').toBeGreaterThan(20)
  })

  it('КАЖДОЕ существующее превью разрешается в свой файл', () => {
    for (const n of names) {
      const v = resolvePreview(ROOT, `${PREFIX}${n}`)
      expect(v, `${n}: путь не разобран`).not.toBeNull()
      expect(v, `${n}: существующее превью отказано`).toMatchObject({ ok: true })
      expect((v as { file: string }).file).toBe(resolve(PREVIEWS, n))
    }
  })

  it('несуществующее — отказ с текстом, а не документ', () => {
    for (const p of ['/previews/nope.html', '/previews/modal.htm', '/previews/deep/x.html']) {
      const v = resolvePreview(ROOT, p)
      expect(v, `${p}: путь не разобран`).not.toBeNull()
      expect(v!.ok, `${p} отдано как существующее`).toBe(false)
      expect((v as { why: string }).why, `${p}: отказ без текста`).toMatch(/\S/)
    }
  })

  it('за пределы previews/ не выпускает, и это проверяется ПОСЛЕ нормализации', () => {
    // `/previews/../package.json` существует на диске — то есть проверка «есть
    // ли файл» одна пропустила бы его наружу.
    for (const p of ['/previews/../package.json', '/previews/../../etc/passwd', '/previews/..%2Fpackage.json']) {
      const v = resolvePreview(ROOT, p)
      expect(v?.ok, `${p} выпущен наружу`).toBe(false)
    }
  })

  it('чужой путь НЕ трогается — SPA-фолбэк оболочки обязан остаться живым', () => {
    // Половина, про которую задача предупреждает отдельно: заглушив фолбэк
    // слишком широко, получим 404 на переход внутри верстака, и вылезет это не
    // сразу. `null` здесь означает «пропустить дальше», а не «отказать».
    for (const p of ['/', '/frame.html', '/index.html', '/dock-height.ts', '/previewsomething']) {
      expect(resolvePreview(ROOT, p), `${p} перехвачен обработчиком превью`).toBeNull()
    }
  })

  it('лист системы подставляется абсолютным адресом — иначе превью грузит его из ниоткуда', () => {
    // Все 51 превью ссылаются на `../src/styles.css`; под корнем `workbench`
    // этот путь не разрешается ни во что, и страница открылась бы без стилей —
    // то есть «открылась», но не о том.
    const href = stylesHref(ROOT)
    expect(href).toBe(`/@fs${resolve(ROOT, 'src/styles.css')}?direct`)
    // `?direct` отдельным утверждением: без него vite отдаёт на `.css` модуль
    // JS, `<link rel="stylesheet">` получает `text/javascript` и страница
    // открывается голой — «открылась», но не о том.
    expect(href, 'потерян ?direct — лист приедет модулем JS').toMatch(/\?direct$/)
    expect(href, 'двойная косая черта в адресе').not.toContain('/@fs//')
    let patched = 0
    for (const n of names) {
      const raw = readFileSync(resolve(PREVIEWS, n), 'utf8')
      if (!raw.includes('../src/styles.css')) continue
      patched++
      const out = patchPreviewHtml(raw, ROOT)
      expect(out, `${n}: относительный лист остался`).not.toContain('../src/styles.css')
      expect(out, `${n}: абсолютный лист не подставлен`).toContain(href)
    }
    expect(patched, 'ни одно превью не ссылается на лист — подстановке нечего делать')
      .toBe(names.length)
  })

  it('разметка превью — это разметка КОМПОНЕНТА, а не оболочки', () => {
    // Утверждение по узлу, а не по коду ответа: ровно тем, чем дефект и
    // отличался от исправности — 200 приходил в обоих случаях.
    const v = resolvePreview(ROOT, `${PREFIX}modal.html`)
    expect(v).toMatchObject({ ok: true })
    const html = patchPreviewHtml(readFileSync((v as { file: string }).file, 'utf8'), ROOT)
    expect(html, 'в превью нет узла компонента').toContain('ds-modal__close')
    expect(html, 'вместо превью приехала оболочка верстака').not.toContain('<div id="root">')
  })
})
