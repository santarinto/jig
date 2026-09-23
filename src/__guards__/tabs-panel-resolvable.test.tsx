/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import type { AnyFixture } from '../internal/fixture.js'

/**
 * У вкладки, объявившей `aria-controls`, управляемый узел РАЗРЕШИМ
 * (DS-180).
 *
 * Агенты берут `Tabs`, «отрывают бошку» и сажают полосу без тела. Глазами это
 * читается как недорисованный рисунок — линия бара размыкается под активной
 * вкладкой в тело, которого нет, — но половина дефекта не косметическая: при
 * заданном `id` каждая вкладка получает `aria-controls="${id}-panel"`, а узел
 * с этим `id` создаёт ТОЛЬКО `TabPanel`. Нет панели — связь объявлена и
 * сломана, и диктор обещает область, в которую нельзя перейти.
 *
 * ПОЧЕМУ ГЕЙТ, А НЕ ЛЕЧЕНИЕ ВИДОМ. Замкнуть линию у полосы без тела значило бы
 * сделать неправильное употребление КРАСИВЫМ: `Tabs` превратился бы во второй
 * `FormTabs` с худшей клавиатурной моделью. Полоса без тела в системе уже есть
 * и называется `FormTabs` — правильный ответ на такую разметку не «дорисуй
 * рамку», а «тебе нужен другой компонент», и он записан в `AGENTS.md`
 * обоих.
 *
 * ПОЧЕМУ СУЩЕСТВОВАНИЕ УЗЛА, А НЕ СОСЕДСТВО. Тело бывает далеко в раскладке —
 * `.ds-tabs-layout` поддерживает четыре положения бара, — поэтому запрет по
 * DOM-соседству был бы неверен: спрашивается `getElementById`, и только.
 *
 * ПРЕДМЕТ РОВНО ОДИН: РАЗРЕШИМОСТЬ ССЫЛКИ. Того, что `Tabs` вообще пишет
 * `aria-controls` и пишет его в форме `${id}-panel`, гейт не утверждает — это
 * предмет `Tabs.test.tsx` («связь вкладки и тела»). Проверено мутацией: снятая
 * выдача `aria-controls` в `Tabs.tsx` валит ТРИ случая там и НИ ОДНОГО здесь.
 * Разделение не педантизм: пока оба меряют один предмет, красное не говорит,
 * что именно сломалось, — а первая редакция этого файла звала `Tabs` в
 * самопроверку и краснела вместе с ним. Поэтому разметка самопроверки написана
 * руками.
 *
 * ЧТО ГЕЙТ НЕ ЛОВИТ. Разметку ПОТРЕБИТЕЛЯ он не видит и видеть не может: он
 * ходит по нашим фикстурам и превью. Ровно они и копируются — пример сильнее
 * документации, — так что цена дефекта тут не в нашем дереве, а в том, что с
 * него списывают. Второе: `aria-controls` вообще, у любого компонента, гейт не
 * трогает. Свёрнутая карточка `Form` (случай `collapsed`) ссылается в пустоту
 * законно и намеренно, это отдельная задача DS-201, и общий запрет
 * покраснел бы на ней, ничего не сказав про вкладки. Список закрытых панелей
 * (`DropdownMenu`, `Combobox`, `GlobalSearch`) — та же история: `aria-controls`
 * там выдаётся только на открытом состоянии, и это верно.
 */

/** Жалоба гейта: узел, на который ссылается вкладка, в документе не нашёлся. */
interface Dangling {
  /** Значение `aria-controls` — то самое `${id}-panel`. */
  controls: string
  /** Подпись вкладки: без неё жалоба не показывает, ГДЕ смотреть. */
  label: string
}

/**
 * Ядро проверки, общее для рендера и для разобранного превью.
 *
 * `root` — где искать вкладки, `doc` — где искать узел. Это РАЗНЫЕ аргументы
 * намеренно: тело живёт вне полосы, и поиск панели внутри `root` был бы тем
 * самым запретом по соседству.
 */
function dangling(root: ParentNode, doc: Document | Element): Dangling[] {
  const out: Dangling[] = []
  for (const tab of Array.from(root.querySelectorAll('[role="tab"][aria-controls]'))) {
    const controls = tab.getAttribute('aria-controls')!
    const found = 'getElementById' in doc
      ? doc.getElementById(controls)
      : doc.querySelector(`[id="${controls}"]`)
    if (!found) out.push({ controls, label: (tab.textContent ?? '').trim() || '(без подписи)' })
  }
  return out
}

const say = (where: string, d: Dangling[]) =>
  `${where}: вкладка «${d.map((x) => x.label).join('», «')}» объявила aria-controls="${d.map((x) => x.controls).join('", "')}", `
  + 'а узла с таким id в документе нет. Полоса вкладок без тела — это `FormTabs`, '
  + 'а не `Tabs` без `TabPanel` (DS-180).'

describe('Tabs: панель, на которую ссылается вкладка, существует', () => {
  /**
   * САМОПРОВЕРКА, и она первая не для красоты: гейт, обходящий только зелёное
   * дерево, зелен и когда его ядро сломано. Здесь строится ровно тот случай,
   * ради которого гейт заведён.
   */
  it('красит одинокую полосу и НАЗЫВАЕТ id, а пару «полоса + тело» пропускает', () => {
    // Разметка РУКАМИ, а не через `<Tabs>`, и это не лень наоборот. Позови
    // здесь компонент — гейт стал бы заодно проверять, что `Tabs` вообще
    // выдаёт `aria-controls`, то есть мерил бы ДВА предмета сразу. Связь
    // «вкладка ↔ панель» держит `Tabs.test.tsx`; здесь предмет один —
    // разрешимость ссылки, какой бы код её ни написал.
    const bar = (id: string) => `
      <div role="tablist">
        <button role="tab" aria-controls="${id}-panel">Все</button>
        <button role="tab" aria-controls="${id}-panel">В работе</button>
      </div>`
    document.body.innerHTML = bar('lonely')
    const found = dangling(document.body, document)
    expect(found).toHaveLength(2)
    expect(found[0].controls).toBe('lonely-panel')
    // Жалоба обязана называть `id`, иначе она не говорит, ГДЕ смотреть.
    expect(say('самопроверка', found)).toContain('lonely-panel')

    // Тот же бар с телом — молчание. Без этой половины «краснеет всегда»
    // выглядело бы работающим гейтом.
    document.body.innerHTML = `${bar('paired')}<div id="paired-panel" role="tabpanel"></div>`
    expect(dangling(document.body, document)).toEqual([])

    // И третья половина, про АДРЕС: тело с чужим id панелью не считается.
    // Без неё «нашёлся хоть какой-то узел» прошло бы за разрешимую ссылку.
    document.body.innerHTML = `${bar('paired')}<div id="other-panel" role="tabpanel"></div>`
    expect(dangling(document.body, document)).toHaveLength(2)
    document.body.innerHTML = ''
  })

  /**
   * Фикстуры — то, что смотрят в верстаке и с чего списывают разметку. Обход
   * общий, а не по одной фикстуре `Tabs`: полосу вставляют в чужие случаи
   * (`PageShell`, раскладки), и именно там половину пары забывают.
   */
  const fixtures = Object.values(
    import.meta.glob<{ default: AnyFixture }>(['../components/*/*.fixture.tsx', '../icons/*.fixture.tsx'], { eager: true }),
  ).map((m) => m.default)
  const pairs = fixtures.flatMap((fx) => fx.cases.map((c) => [`${fx.name}/${c.id}`, fx, c] as const))

  it('обход непустой', () => {
    expect(pairs.length).toBeGreaterThan(0)
  })

  it.each(pairs)('%s', (label, fx, c) => {
    const draw = c.render ?? fx.render
    try {
      render(<>{draw!({ ...fx.props, ...c.props }, {})}</>)
      const found = dangling(document.body, document)
      expect(found, say(label, found)).toEqual([])
    } finally {
      cleanup()
    }
  })

  /**
   * Превью — вторая копия разметки, рукописная (`previews/*.html`), и живёт она
   * своей жизнью: класс, переименованный в компоненте, там остаётся
   * (DS-224). Значит и пару «полоса + тело» она может потерять отдельно.
   */
  const ROOT = resolve(__dirname, '../..')
  const previews = readdirSync(join(ROOT, 'previews'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => join(ROOT, 'previews', f))
    .filter((f) => readFileSync(f, 'utf8').includes('role="tab"'))

  it('превью со вкладками нашлись — иначе обход ниже пуст и молча зелен', () => {
    expect(previews.length).toBeGreaterThan(0)
  })

  it.each(previews.map((f) => [relative(ROOT, f), f] as const))('%s', (label, file) => {
    const doc = new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'text/html')
    const found = dangling(doc, doc)
    expect(found, say(label, found)).toEqual([])
  })
})
