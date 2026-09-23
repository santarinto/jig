import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * `demo/gallery.html` грузил `./gallery.js`, а исходник — `gallery.tsx`: под
 * vite dev-сервером страница не резолвила свой скрипт и молча не открывалась
 * (DS-13). Демо не входит в `make check` по умолчанию, поэтому мёртвая
 * витрина не краснела нигде — её замечал только тот, кто её открывал.
 *
 * Этот гейт делает мёртвую страницу видимой до открытия: каждый `<script src>`
 * в `demo/*.html` обязан указывать на существующий файл и нести `type="module"`
 * — vite отдаёт `.tsx` как ES-модуль, и без `type="module"` браузер грузит его
 * классическим скриптом и падает на первом `import`.
 */
const DEMO = resolve(__dirname, '../../demo')

describe('demo pages resolve their scripts', () => {
  it('каждый <script src> ссылается на существующий модуль и это type="module"', () => {
    const htmls = readdirSync(DEMO).filter((f) => f.endsWith('.html'))
    const offenders: string[] = []
    let scripts = 0
    for (const h of htmls) {
      const src = readFileSync(join(DEMO, h), 'utf8')
      for (const m of src.matchAll(/<script\b([^>]*)\bsrc="\.\/([^"]+)"([^>]*)>/g)) {
        scripts++
        const attrs = m[1]! + m[3]!
        const file = m[2]!
        if (!/type="module"/.test(attrs)) {
          offenders.push(`${h}: <script src="./${file}"> без type="module" — vite отдаёт .tsx как ES-модуль`)
        }
        if (!existsSync(join(DEMO, file))) {
          offenders.push(`${h}: скрипт ./${file} не существует — витрина молча не открывается`)
        }
      }
    }
    // Счётчики (обратная мутация): пустой список страниц или ноль <script src>
    // дали бы такой же зелёный результат.
    expect(htmls.length, 'demo/*.html не найдены').toBeGreaterThan(3)
    expect(scripts, 'ни одного <script src> в demo — обход пуст').toBeGreaterThan(3)
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
