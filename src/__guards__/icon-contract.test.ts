import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * Иконка, пришедшая ПРОПОМ, рисуется только через `<Icon>` (DS-145).
 *
 * ЗАЧЕМ. Контракт, который можно обойти, — это не контракт, а соглашение;
 * соглашение держится ровно до первого нового компонента, написанного по
 * образцу соседнего. А образец тут именно такой: двенадцать мест сегодня пишут
 * `{icon}` внутри своей обёртки, и тринадцатое напишет так же — молча, потому
 * что на экране разница видна только рядом с нашим шевроном и только тому, кто
 * знает, куда смотреть.
 *
 * ЧТО ИМЕННО ПРОВЕРЯЕТСЯ. Не «в файле есть слово Icon» — это прошло бы у
 * компонента, который импортировал обёртку и не применил. Проверка ищет
 * ВЫВОД значения, чьё имя выглядит как иконка (`icon`, `.icon`, `leadingIcon`),
 * и требует, чтобы ближайшим предком в той же строке был `<Icon`.
 *
 * ГРАНИЦА ПРОВЕРКИ, названная честно: она построчная. Значок, разложенный на
 * три строки JSX, ей не виден. Это не дыра, которую забыли закрыть, а цена
 * отказа от разбора JSX: сегодня все двенадцать мест однострочные, и правило
 * «значок пишется в одну строку» дешевле парсера. Если однажды это перестанет
 * быть правдой — здесь и надо будет менять способ, а не добавлять исключение.
 */
const COMPONENTS = resolve(__dirname, '..', 'components')

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsxFiles(p))
    else if (entry.name.endsWith('.tsx') && !/\.test\.|\.fixture\./.test(entry.name)) out.push(p)
  }
  return out
}

/**
 * Вывод значения-иконки: `{icon}`, `{t.icon}`, `{icon ?? Fallback}`.
 * Имя обязано КОНЧАТЬСЯ на `icon`/`Icon` — `iconOnly` (проп кнопки) не значок,
 * а режим, и попадать сюда не должен.
 */
const OUTPUT = /\{\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*(?:\?\?[^{}]*)?\}/g
/**
 * Голое `Icon` — это САМА обёртка, приехавшая импортом (`import { Icon } from`),
 * а не значок. Без этой оговорки гейт краснел бы ровно на тех файлах, которые
 * контракт соблюдают, — то есть был бы тем громче, чем правильнее код.
 */
const looksLikeIcon = (name: string) => name !== 'Icon' && /(^|\.)icon$|Icon$/.test(name)

describe('icon-contract', () => {
  it('иконка из пропа выводится только внутри <Icon>', () => {
    const offenders: string[] = []
    for (const file of tsxFiles(COMPONENTS)) {
      const src = readFileSync(file, 'utf8')
      src.split('\n').forEach((line, i) => {
        // Импорт и реэкспорт — не разметка: там фигурные скобки означают набор
        // имён, а не вывод значения.
        if (/^\s*(import|export)\b/.test(line)) return
        for (const m of line.matchAll(OUTPUT)) {
          if (!looksLikeIcon(m[1]!)) continue
          const before = line.slice(0, m.index)
          // `<Icon …>` в той же строке слева — и не закрытый до этого места.
          const opened = before.lastIndexOf('<Icon')
          const closed = before.lastIndexOf('</Icon>')
          if (opened === -1 || closed > opened) {
            offenders.push(`${relative(COMPONENTS, file)}:${i + 1}: {${m[1]}} мимо <Icon>`)
          }
        }
      })
    }
    expect(
      offenders,
      'иконка потребителя обязана проходить через <Icon> — иначе её толщина '
      + 'штриха, размер и цвет остаются чужими:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  /**
   * Вторая половина, без которой первая ничего не стоит: запрет соблюсти легко,
   * перестав выводить иконку вовсе. Здесь проверяется, что мест, где значок
   * РИСУЕТСЯ, по-прежнему много — то есть что гейт смотрит на живой код.
   *
   * Порог, а не точное число: список мест двигает каждая вторая задача, а
   * прибитое число устаревает молча и читается как факт. Двенадцать сегодня;
   * упадёт ниже восьми — значит выпилили половину, и это разговор, а не
   * поправка к числу.
   */
  it('гейту есть что проверять: <Icon> стоит в живых местах', () => {
    let sites = 0
    for (const file of tsxFiles(COMPONENTS)) {
      sites += [...readFileSync(file, 'utf8').matchAll(/<Icon[\s>]/g)].length
    }
    expect(sites, 'мест с <Icon> стало подозрительно мало').toBeGreaterThanOrEqual(8)
  })

  /**
   * Размер значка задаётся СТИЛЕМ, и проп `size` в публичный контракт не
   * просочился.
   *
   * `Glyph` отдаёт размер атрибутом `width`, то есть голыми пикселями мимо
   * `--ds-ui-scale`: при шкале 1.5 текст растёт, а знак нет. Ловушка описана в
   * `styles/caret.css` и стоила отдельного разбора в DS-144; публичный
   * `<Icon>`, повторивший `size`, унёс бы её в API потребителя — то есть
   * раздал бы дефект наружу, где его уже не отозвать.
   */
  it('у <Icon> нет пропа size: размер — стиль, а не атрибут', () => {
    const src = readFileSync(resolve(__dirname, '..', 'icons', 'Icon.tsx'), 'utf8')
    expect(src).not.toMatch(/\bsize\??\s*:/)
    const css = readFileSync(resolve(__dirname, '..', 'styles', 'icon.css'), 'utf8')
    // Свойство ЦЕЛИКОМ, а не имя токена подстрокой. Первая редакция писала
    // `toContain('--ds-size-icon')` и была зелена на `width: 16px`, потому что
    // `--ds-size-icon-lg` в том же файле содержит искомое как ПРЕФИКС. Проверка
    // проходила не проверяя, и мутация «размер числом» её не роняла.
    expect(css, 'размер значка обязан ехать по шкале интерфейса')
      .toMatch(/width:\s*var\(--ds-size-icon\)/)
    expect(css, 'высота обязана ехать вместе с шириной')
      .toMatch(/height:\s*var\(--ds-size-icon\)/)
  })
})
