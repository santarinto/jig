import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Масштаб хрома — ОДНО число, а документа два (DS-141).
 *
 * Владелец попросил интерфейс верстака на 15% крупнее. В оболочке это одна
 * строка на корне документа (`html { font-size: 115% }`): там корень
 * принадлежит хрому целиком, потому что закон `shell.css` запрещает в оболочке
 * `ds-*` компоненты, и ни один `rem` там не описывает предмет. В КАДРЕ корень
 * принадлежит ПРЕДМЕТУ — `--ds-fs-*` и `--ds-space-*` считаются от него, —
 * поэтому там у хрома свой множитель `--wbf-z`.
 *
 * Это одно решение, записанное дважды, и дважды записанное решение расходится.
 * Гейт держит три утверждения, и каждое закрывает свой способ разойтись.
 *
 * 1. ЧИСЛА РАВНЫ. Правка одного файла без другого даёт верстак, у которого
 *    подпись в кадре мельче подписи в тулбаре на 15%, — и это не читается как
 *    поломка, это читается как «так задумано».
 *
 * 2. В ОБОЛОЧКЕ ЭТО ПРОЦЕНТ, А НЕ ПИКСЕЛИ. `font-size: 18.4px` на корне
 *    отменяет настройку размера шрифта в браузере (WCAG 1.4.4) — ровно то, что
 *    запрещает `rem-units` в `tokens.css`. Отказ тихий: картинка у автора,
 *    сидящего на умолчании 16px, не меняется вовсе.
 *
 * 3. В КАДРЕ НИ ОДНА ДЛИНА ХРОМА НЕ ЕДЕТ МИМО МНОЖИТЕЛЯ. Это та половина, ради
 *    которой гейт вообще написан: множитель в calc легко не поставить, и новая
 *    панель с `padding: 0.5rem` просто окажется на 15% мельче соседних, не
 *    сломав ничего заметного. Сюда же запрет на `--ds-fs-*` в `frame.css`:
 *    до этой задачи служебные подписи кадра брали кегль системы, то есть ехали
 *    за переключателем `--ds-ui-scale` ВМЕСТЕ С ПРЕДМЕТОМ — на 1.5× подпись
 *    «фактический тон» росла заодно с копией, которую комментирует. Прибор,
 *    едущий за предметом, — тот же класс, что DS-124.
 *
 * ЧЕГО ГЕЙТ НЕ ДЕЛАЕТ. Он не утверждает, что 15% — правильная величина: это
 * вопрос к глазу владельца. Он не смотрит на пиксельные литералы в `frame.css`
 * (30px поля вокруг предмета, 1px и 2px хэйрлайнов) — они намеренно вне
 * масштаба, доводы записаны у самих правил. И он ничего не знает про `em`:
 * их в обоих файлах нет, а появятся — это разговор, а не молчаливый третий
 * механизм.
 */
const ROOT = resolve(__dirname, '../..')
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ')
const read = (rel: string): string => stripComments(readFileSync(resolve(ROOT, rel), 'utf8'))

/** `html { font-size: N% }` из оболочки. Единица возвращается вместе с числом. */
function shellScale(css: string): { value: number; unit: string } {
  const m = css.match(/html\s*\{[^}]*?font-size:\s*([\d.]+)(%|px|rem|em)/)
  if (!m) throw new Error('в shell.css нет правила html { font-size } — масштаба хрома нет')
  return { value: Number(m[1]), unit: m[2]! }
}

/** `--wbf-z: N` из кадра. */
function frameScale(css: string): number {
  const m = css.match(/--wbf-z:\s*([\d.]+)\s*;/)
  if (!m) throw new Error('в frame.css нет --wbf-z — множителя хрома кадра нет')
  return Number(m[1])
}

/**
 * Длины хрома кадра, уехавшие мимо множителя: всякий `rem`, не обёрнутый в
 * `calc(<N>rem * var(--wbf-z))`. Обёртки вырезаются, остаток и есть нарушения.
 */
function unscaledRem(css: string): string[] {
  const scrubbed = css.replace(/calc\(\s*-?[\d.]+rem\s*\*\s*var\(--wbf-z\)\s*\)/g, ' ')
  return [...scrubbed.matchAll(/[^\s(){};:,*/+-]*-?[\d.]+rem/g)].map((m) => m[0])
}

describe('масштаб хрома — одно число на два документа', () => {
  const SHELL = read('workbench/shell.css')
  const FRAME = read('workbench/frame.css')

  it('оболочка и кадр увеличены на одну и ту же долю', () => {
    const shell = shellScale(SHELL)
    const frame = frameScale(FRAME)
    expect(
      shell.value / 100,
      `хром оболочки ${shell.value}% против множителя кадра ${frame} — прибор разъехался сам с собой`,
    ).toBeCloseTo(frame, 6)
  })

  it('в оболочке масштаб задан процентом — иначе он отменяет настройку браузера', () => {
    const { unit } = shellScale(SHELL)
    expect(
      unit,
      'html { font-size } в пикселях блокирует масштабирование текста браузером (WCAG 1.4.4)',
    ).toBe('%')
  })

  it('в кадре ни одна длина хрома не едет мимо множителя', () => {
    // Обратная мутация: пустой или укоротившийся файл дал бы такой же зелёный
    // результат — «починкой» стало бы вычистить стили.
    expect(FRAME.length, 'frame.css подозрительно короток — гейту нечего смотреть').toBeGreaterThan(
      4000,
    )
    expect(
      (FRAME.match(/var\(--wbf-z\)/g) ?? []).length,
      'в frame.css нет обращений к --wbf-z — множитель объявлен и не применён',
    ).toBeGreaterThan(15)

    const offenders = unscaledRem(FRAME)
    expect(
      offenders,
      `длина хрома кадра мимо --wbf-z (канон: calc(<rem> * var(--wbf-z))):\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('хром кадра не берёт кегль у системы — иначе он едет за --ds-ui-scale', () => {
    const offenders = [...new Set(FRAME.match(/--ds-fs-[a-z0-9-]+/g) ?? [])]
    expect(
      offenders,
      `служебная подпись кадра взяла кегль предмета: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  // Мутации к детектору длин. Он обязан ВИДЕТЬ голый rem в любой позиции и НЕ
  // срабатывать на канонической обёртке — включая отрицательную величину
  // (`.wbf-stop` вытягивает себя за угол узла) и лишние пробелы. Детектор,
  // который не может покраснеть, — это комментарий, а не гейт.
  it('детектор длин отличает обёрнутую величину от голой', () => {
    expect(unscaledRem('padding: calc(0.75rem * var(--wbf-z));')).toEqual([])
    expect(unscaledRem('margin: calc( -0.5rem * var(--wbf-z) );')).toEqual([])
    expect(unscaledRem('padding: 0.75rem;')).toEqual(['0.75rem'])
    expect(unscaledRem('margin: 0 0 0.75rem;')).toEqual(['0.75rem'])
    expect(unscaledRem('max-inline-size: 32rem;')).toEqual(['32rem'])
    // Смешанное правило: обёрнутая половина не прикрывает голую.
    expect(unscaledRem('padding: calc(1rem * var(--wbf-z)) 2rem;')).toEqual(['2rem'])
    // Чужой множитель — не наш: калька с системы не считается обёрткой.
    expect(unscaledRem('font-size: calc(0.75rem * var(--ds-ui-scale));')).toEqual(['0.75rem'])
  })
})
