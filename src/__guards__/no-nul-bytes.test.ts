import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * Ни один текстовый файл репозитория не должен содержать байт `0x00`.
 *
 * Случай, из-за которого гейт написан (2026-08-06). В `LogViewer.tsx`
 * разделителем в `keys.join(…)` стоял литеральный NUL вместо экранированной
 * записи. Приём верный — идентификатор строки лога NUL содержать не может,
 * поэтому склейка через него не даёт ложных совпадений, — но байт в исходнике
 * ломает индексацию: PostgreSQL не принимает `0x00` в поле `text`, вставка
 * чанка падает, и файл выпадает из поиска целиком.
 *
 * Замер: `LogViewer.tsx` был невидим для CocoSearch неделю, с `881a0f3`. Файл
 * при отказе не записывается как проиндексированный, поэтому числится
 * изменённым вечно и повторяет тот же отказ на каждом коммите — `to_index=4`
 * при двух реально изменённых файлах. `cocosearch` при этом печатает
 * «Indexing completed» и возвращает 0: об успехе сообщено при неуспешном
 * результате, ровно та форма, из-за которой в системе живёт `smoke-upgrade.sh`.
 *
 * Почему это гейт, а не внимательность. Байт невидим в редакторе и **не
 * находится `grep`ом**: `grep -c $'\x00' файл` возвращает 0 совпадений и код 1.
 * Единственный способ его увидеть — прочитать файл байтами, что и делается
 * ниже. Пока правились этот дефект и запись о нём, литеральный NUL был по
 * невнимательности вставлен ещё дважды — в само предупреждение о NUL и в
 * сообщение коммита о NUL. Оба раза его нашла только побайтовая проверка.
 *
 * Хук `post-commit` ищет `Failed to index` в логе индексации и тоже поймал бы
 * такой файл, но уже **после** коммита, когда индекс неполон. Здесь — до.
 */
const ROOT = resolve(__dirname, '../..')

/** Расширения, содержимое которых обязано быть текстом. Шрифты и картинки NUL несут законно. */
const TEXT_EXT = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.md', '.json', '.sh', '.yaml', '.yml', '.html', '.txt',
]

// `.claude` — рабочие деревья харнесса: копия этого же репозитория внутри него.
// Обходить её значит проверять свои же файлы второй раз и считать их в счётчике
// обойдённых, из-за чего счётчик перестаёт говорить о содержимом репозитория.
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', 'coverage', '.claude'])

function textFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) out.push(...textFiles(join(dir, e.name)))
    } else if (TEXT_EXT.some((x) => e.name.endsWith(x))) {
      out.push(join(dir, e.name))
    }
  }
  return out
}

/** Единственная форма проверки: искать байт, а не символ. */
function nulOffset(buf: Buffer): number {
  return buf.indexOf(0)
}

describe('нулевые байты в исходниках', () => {
  const files = textFiles(ROOT)

  it('обход доходит до файлов', () => {
    // Без этого «нарушений нет» осталось бы зелёным и при сломанном обходе:
    // пустой список файлов даёт пустой список нарушений.
    expect(files.length, 'обход не нашёл текстовых файлов').toBeGreaterThan(400)
  })

  it('их нет ни в одном текстовом файле', () => {
    const offenders: string[] = []
    for (const file of files) {
      const buf = readFileSync(file)
      const at = nulOffset(buf)
      if (at < 0) continue
      const line = buf.subarray(0, at).toString('utf8').split('\n').length
      offenders.push(`${relative(ROOT, file)}:${line} (смещение ${at})`)
    }
    expect(
      offenders,
      `нулевой байт ломает индексацию и не ищется grep-ом:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('и проверка умеет их находить', () => {
    // Утверждение выше верно и для проверки, которая не может сработать никогда.
    // Здесь она обязана сработать: тот же предикат на подложенном байте.
    // NUL здесь собирается из escape — литерал в этом файле уронил бы гейт о него самого.
    expect(nulOffset(Buffer.from("keys.join('\u0000')", "utf8"))).toBe(11)
    expect(nulOffset(Buffer.from("keys.join('sep')", "utf8"))).toBe(-1)
  })
})
