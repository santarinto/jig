/**
 * Дев-плагин Vite: честный ответ на пути под `/previews/` (DS-223).
 *
 * ЧТО БЫЛО. Корень дев-сервера — папка `workbench`, а `previews/` лежит ВЫШЕ
 * него. На несовпавший путь vite отдаёт SPA-фолбэк, поэтому
 * `http://localhost:5274/previews/modal.html` отвечал `200 OK` и присылал
 * оболочку верстака: `<div id="root">`, заголовок «jig — верстак», и
 * ни одного `.ds-modal__close` в документе.
 *
 * ПОЧЕМУ ЭТО ДЕФЕКТ, А НЕ НЕУДОБСТВО. Не то плохо, что превью не открывалось,
 * а то, что сервер отвечал УСПЕХОМ и отдавал ЧУЖОЙ документ. Владельцу это
 * стоило десяти замеров подряд, вернувших `null`, и неверного вывода «элемент
 * пропал»; браузерному агенту дороже вдвое — адрес его единственный канал,
 * файлом догадку он не проверит, и молчаливый 200 бьёт ровно по нему.
 *
 * ПОЧЕМУ ОБЕ ПОЛОВИНЫ СРАЗУ. Закрыть всё под `/previews/` глухим 404 — правка
 * на одну строку, и она ломает то, чем работает агент: существующее превью
 * тоже перестало бы открываться, только теперь громко. Открыть всё — исходное
 * состояние. Предмет здесь именно РАЗЛИЧЕНИЕ: файл есть — отдаём его, файла
 * нет — отказ с текстом, по которому видно, что искали и где.
 *
 * ПОЧЕМУ ОТДАЁМ САМИ, А НЕ ПЕРЕПИСЫВАЕМ АДРЕС НА `/@fs/`. Переписанный на
 * стороне сервера адрес не меняет базу документа в браузере: страница всё
 * равно запрошена как `/previews/modal.html`, и её `../src/styles.css`
 * разрешится в `/src/styles.css` — путь, которого под корнем `workbench` нет.
 * Лист поэтому подставляется здесь же, абсолютным `/@fs/`-адресом: он ведёт в
 * ТОТ ЖЕ `src/styles.css`, который собирает `make build`, то есть превью
 * смотрит на живой исходник системы, а не на копию.
 *
 * ГРАНИЦА. Путь склеивается и проверяется на принадлежность `previews/` ПОСЛЕ
 * нормализации: `/previews/../src/foo` иначе выпустил бы наружу. Это не
 * паранойя про злоумышленника на localhost, а то же самое утверждение о
 * честности — за пределами `previews/` этот обработчик отвечать не должен, и
 * молчаливая выдача чужого файла была бы ровно исходным дефектом.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep, extname } from 'node:path'
import type { Plugin } from 'vite'

export const PREFIX = '/previews/'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.js': 'text/javascript; charset=utf-8',
}

/**
 * Решение по одному пути, ОТДЕЛЬНО от раздачи: файл под `previews/` или отказ.
 *
 * Чистой функцией потому, что именно она и есть предмет задачи — «различить»,
 * — а поднимать дев-сервер, чтобы проверить различение, значит проверять его
 * там, где оно тонет среди прочего. Живой HTTP проверяется отдельно, в
 * `scripts/smoke-workbench.mjs`.
 *
 * `null` означает «не мой путь» и пропускает запрос дальше по цепочке — это
 * НЕ то же самое, что `{ ok: false }`: SPA-фолбэк оболочки обязан остаться
 * живым для её собственных маршрутов, иначе переход внутри верстака отдаст
 * 404, и вылезет это не сразу.
 */
export function resolvePreview(
  root: string,
  pathname: string,
): { ok: true; file: string } | { ok: false; why: string } | null {
  if (!pathname.startsWith(PREFIX)) return null
  const base = resolve(root, 'previews')
  let rel: string
  try {
    rel = decodeURIComponent(pathname.slice(PREFIX.length))
  } catch {
    return { ok: false, why: `путь ${pathname} не разбирается как URL` }
  }
  if (rel === '') return { ok: false, why: 'каталог превью не отдаётся списком — назовите файл' }
  const file = resolve(base, rel)
  if (file !== base && !file.startsWith(base + sep)) {
    return { ok: false, why: `${pathname} ведёт за пределы previews/ — отказано` }
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    return { ok: false, why: `превью ${rel} нет в previews/` }
  }
  return { ok: true, file }
}

/**
 * Абсолютный адрес листа системы для страницы, отданной по `/previews/…`.
 * Вынесен затем, чтобы подстановка проверялась текстом, а не только глазами.
 *
 * `?direct` — не украшение. Без него vite отдаёт на `.css` МОДУЛЬ JS
 * (`import { createHotContext } …`), который вставляет стили из скрипта; в
 * `<link rel="stylesheet">` такой ответ приходит с `text/javascript`, и
 * браузер его отвергает — страница открывается голой. Замерено: 354 606 байт
 * JS против 116 KB настоящего CSS по тому же пути.
 *
 * Склейка без второй косой черты: `resolve` уже отдаёт путь, начинающийся с
 * `/`, и `/@fs/` + путь давало `/@fs//home/…`. Vite это переваривал, но адрес
 * в разметке — то, что человек копирует.
 */
export const stylesHref = (root: string) => `/@fs${resolve(root, 'src/styles.css')}?direct`

/** Подстановка листа в разметку превью. Относительный `../src/styles.css` под
 *  корнем `workbench` не разрешается ни во что. */
export function patchPreviewHtml(html: string, root: string): string {
  return html.split('../src/styles.css').join(stylesHref(root))
}

export function previewsPlugin(root: string): Plugin {
  return {
    name: 'ds-wb-previews',
    configureServer(server) {
      // `use` ПРЯМО В ТЕЛЕ хука, а не из возвращённой функции. Возвращённая
      // ставит обработчик ПОСЛЕ внутренних обработчиков vite, то есть после
      // SPA-фолбэка, — и до путей под `/previews/` он не доживает: фолбэк
      // отвечает 200 раньше. Проверено вживую: с возвращённой функцией
      // `/previews/modal.html` по-прежнему присылал оболочку верстака, то
      // есть плагин выглядел установленным и не делал ничего.
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '/').split('?')[0]!.split('#')[0]!
        const verdict = resolvePreview(root, pathname)
        if (verdict === null) return next()
        if (!verdict.ok) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(
            `404: ${verdict.why}\n`
              + 'Верстак отвечает на пути под /previews/ честно: файла нет — нет и документа.\n',
          )
          return
        }
        const ext = extname(verdict.file)
        res.statusCode = 200
        res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
        if (ext === '.html') {
          res.end(patchPreviewHtml(readFileSync(verdict.file, 'utf8'), root))
        } else {
          res.end(readFileSync(verdict.file))
        }
      })
    },
  }
}
