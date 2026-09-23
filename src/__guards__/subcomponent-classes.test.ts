import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * Класс, у которого ЕСТЬ подкомпонент, нельзя писать голым `className`.
 *
 * DS-173: `.ds-cmdbar__spacer { flex: 1 1 auto }` был объявлен в
 * `CommandBar.css` и не экспортирован ничем. Единственное место, где им
 * пользовались, — НАШ СОБСТВЕННЫЙ пример
 * (`src/examples/DocumentFormExample`), написанный как
 * `<span className="ds-cmdbar__spacer" />`. Потребителю API не было предложено
 * вовсе — предложено угадать внутреннее имя по исходнику, — а пример сильнее
 * документации: его копируют, и скопировали бы класс.
 *
 * ЧЕМ ЭТО НЕ ЛОВИЛОСЬ. Гейт `class-import` спрашивает другое: «импортирован ли
 * лист, где класс объявлен». В примере лист приезжает транзитивно вместе с
 * `CommandBar`, так что голый класс проходил его молча — и прошёл бы любой
 * следующий. Проверено: до правки `class-import` был зелёным. Дыра общего
 * вида, и она дороже самой распорки, поэтому гейт заведён отдельно.
 *
 * КАТАЛОГ, А НЕ ВЫВОД ИЗ КОДА. «Есть ли у класса API» из текста не читается:
 * подкомпонент — это присваивание статикой в конце файла, проп — поле
 * интерфейса, а имя класса живёт в JSX. Вывести связь можно только разбором,
 * который сам станет предметом отладки. Каталог зато проверяется в обе
 * стороны: названный API обязан существовать в исходнике владельца, а класс —
 * в его листе. Мёртвая строка каталога краснеет так же, как нарушение.
 *
 * ДВА ВИДА API, и второй появился на DS-239. `CommandBar.Spacer` и
 * `CommandBar.Separator` удалены вместе с `children`: распорку заменила
 * раскладка, а разделитель панель ставит сама по смене `group`. Класс
 * `ds-cmdbar__sep` при этом НИКУДА НЕ ДЕЛСЯ — и писать его руками по-прежнему
 * нельзя, только ответ теперь «для этого есть проп», а не «есть подкомпонент».
 * Выкинуть строку вместе с подкомпонентом значило бы опустошить каталог и
 * оставить гейт зелёным оттого, что проверять стало нечего.
 */
const SRC = resolve(__dirname, '..')

/**
 * Класс → чем его писать. Ключ — класс, значение — владелец, API и его вид:
 * `subcomponent` ищется в исходнике как `Owner.Name = Name`, `prop` — как поле
 * интерфейса `name?:`/`name:`.
 *
 * `declaredIn` — файл, где API ОБЪЯВЛЕН, если это не `Owner/Owner.tsx`. Нужен с
 * DS-358: `CommandAction` переехал в общий `src/internal/action.ts` (одно
 * из четырёх сужений `ActionBase`), а класс по-прежнему ставит `CommandBar`.
 * Владелец класса и место объявления пропа — два разных вопроса, и до переезда
 * они просто совпадали. Взять вместо этого поиск по всему `src/` нельзя: тогда
 * строка каталога с выдуманным именем нашлась бы в чужом файле, и обратная
 * мутация («каталог не врёт») перестала бы краснеть.
 */
const HAS_API: Record<string, {
  owner: string
  api: string
  kind: 'subcomponent' | 'prop'
  declaredIn?: string
}> = {
  'ds-cmdbar__sep': {
    owner: 'CommandBar',
    api: 'CommandAction.group',
    kind: 'prop',
    declaredIn: 'internal/action.ts',
  },
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === '__guards__' ? [] : walk(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}

const FILES = walk(SRC)

describe('классы с подкомпонентом не пишутся голым className', () => {
  it('каталог не врёт: подкомпонент и класс существуют у названного владельца', () => {
    // Обратная мутация. Строка каталога, указывающая на несуществующий API,
    // делает гейт зелёным по недоразумению: нарушать нечего.
    expect(Object.keys(HAS_API).length, 'каталог пуст — гейту нечего проверять').toBeGreaterThan(0)
    for (const [cls, { owner, api, kind, declaredIn }] of Object.entries(HAS_API)) {
      const tsx = readFileSync(resolve(SRC, 'components', owner, `${owner}.tsx`), 'utf8')
      const css = readFileSync(resolve(SRC, 'components', owner, `${owner}.css`), 'utf8')
      const decl = declaredIn ? readFileSync(resolve(SRC, declaredIn), 'utf8') : tsx
      const short = api.slice(api.indexOf('.') + 1)
      if (kind === 'subcomponent') {
        expect(decl, `${owner} не объявляет ${api}`).toContain(`${owner}.${short} = ${short}`)
      } else {
        expect(decl, `${declaredIn ?? owner} не объявляет проп ${api}`).toMatch(new RegExp(`\\b${short}\\??:`))
      }
      expect(tsx, `${api} не ставит класс ${cls}`).toContain(cls)
      expect(css, `${cls} не объявлен в ${owner}.css`).toContain(`.${cls}`)
    }
  })

  it('обход дошёл до примеров — иначе проверять было бы негде', () => {
    // Счётчик: пустой список файлов даёт такой же зелёный результат, а
    // предмет дефекта жил именно в `src/examples/`.
    expect(FILES.length, 'обход исходников пуст').toBeGreaterThan(100)
    expect(
      FILES.some((f) => relative(SRC, f).startsWith('examples')),
      'в обход не попал ни один пример',
    ).toBe(true)
  })

  it('ни один файл вне владельца не пишет такой класс руками', () => {
    const offenders: string[] = []
    for (const file of FILES) {
      const rel = relative(SRC, file)
      const src = readFileSync(file, 'utf8')
      for (const [cls, { owner, api }] of Object.entries(HAS_API)) {
        // Свой каталог — законное место: там класс и ставится.
        if (rel.startsWith(join('components', owner))) continue
        if (!new RegExp(`["'\`][^"'\`]*\\b${cls}\\b`).test(src)) continue
        offenders.push(`${rel}: голый «${cls}» — для этого есть ${api}`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
