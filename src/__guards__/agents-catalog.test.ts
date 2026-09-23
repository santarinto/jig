import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * `AGENTS.md` opens by asking to be kept in sync "when adding, changing, or
 * removing public functionality", and then quietly drifted: `Avatar`,
 * `ProgressBar`, `KeyValueList` and `SideNav` shipped and stayed undocumented
 * through four releases. A rule nothing checks is a wish.
 *
 * The catalogue is keyed by directory, not by exported name — `Form/` holds
 * `Card` and `FormRow`, `Toggle/` holds the three switches — so a section may
 * legitimately cover several exports. Hence the mapping below rather than a
 * plain name match.
 */
const ROOT = resolve(__dirname, '../..')
const SRC = resolve(__dirname, '..')

/** Directories documented under a section name that differs from the folder. */
const COVERED_BY: Record<string, string> = {
  Form: 'Card',
  Toggle: 'Card', // Checkbox/Radio/Switch live in the Card/FormRow form story
  ThemeToggle: 'theme',
}

/**
 * Components the catalogue deliberately leaves out: they behave the way their
 * name and `.d.ts` suggest and carry no decision worth recording.
 *
 * `Tabs` и `Breadcrumbs` из этого списка ушли в 1.17.0: шов под роутер — как
 * раз то решение, которое каталог существует записывать, и без секции он
 * остался бы описан только в прежнем — сломанном — виде у `SideNav`. Adding a new
 * component therefore fails this guard until someone decides which side it is
 * on — which is the whole point, since four of them once drifted in silently.
 *
 * `Combobox` ушёл из списка в 1.32.0 по той же причине: возврат фокуса зависит
 * от причины закрытия (Esc и выбор — да, клик мимо — нет), и это решение в
 * пропсах не видно вовсе.
 *
 * `Select` ушёл после 1.42.0: `disabled` проходит насквозь через
 * `SelectHTMLAttributes` — то есть по пропсам компонент выключение «умеет», — а
 * вида у выключенного поля не было вовсе. Ровно тот случай, когда `.d.ts`
 * описывает больше, чем компонент делает, и предъявлен он аудитом потребителя.
 *
 * `DropdownMenu` ушёл в DS-113: активный пункт выбирается один раз, при
 * открытии, и смена `items` под открытым меню его не сбрасывает. По `.d.ts`
 * этого не видно — там `items: DropdownItem[]` и больше ничего, — а в коде
 * решение выражено ОТСУТСТВИЕМ зависимости у эффекта, то есть тем, чего в
 * файле нет. Ровно тот случай, ради которого каталог и заведён.
 *
 * `Badge` ушёл вместе с DS-81: цвет из данных потребителя (`brand`) — это
 * решение о том, кто отвечает за контраст, и в пропах его не видно вовсе. По
 * `.d.ts` `brand?: string` неотличим от «покрась вот этим», а компонент как раз
 * этого и НЕ делает — он выводит из значения два своих цвета.
 *
 * Поля формы (`TextField`, `Textarea`, `NumberField`, `DatePicker`, `Slider`,
 * `CodeInput`, `SearchBar`, `GlobalSearch`, `FileDrop`) остались в списке после
 * DS-108/109 НАМЕРЕННО: решения у них общие — одна модель обёртки, одно
 * правило про `ref`, — и записаны один раз, в разделе `## поля формы` каталога.
 * Одиннадцать копий одного и того же означали бы одиннадцать мест, где они
 * разъедутся; секция на компонент здесь ничего бы не добавила.
 */
/*
 * `FormTabs` выехал отсюда на DS-175. Основание то же, что у `Grid`:
 * из имени и `.d.ts` его поведение больше не читается. `onClose` есть, а
 * кнопки закрытия в дереве доступности нет — крестик стал мишенью для мыши,
 * и закрытие с клавиатуры висит на `Delete`. Клавиатурный контракт в типах не
 * виден вовсе, а стоит ровно за тем, что таблист владеет только вкладками.
 */
/*
 * `CommandBar` выехал отсюда на DS-173. Основание то же, что у `Grid` и
 * `FormTabs`: из имени и `.d.ts` поведение больше не читается. `Separator` и
 * `Spacer` — оба пустой `<span>` с одинаковой сигнатурой `() => JSX.Element`,
 * а различаются ровно тем, что один озвучивается, а второй нет. Ни в типах, ни
 * глазами этой разницы нет, и спутать их — сделать панель из трёх групп
 * панелью из пяти.
 */
/*
 * `Dashboard` выехал отсюда на DS-272. Основание то же, что у `Grid`:
 * из `.d.ts` видно, что у `Tile` две формы, но не видно, что у них разные
 * рамки и что наведение есть только у одной, — а это и есть решение.
 */
/*
 * `FunctionPanel` выехал отсюда на DS-273. Из `.d.ts` видно, что
 * `onOpen` и `renderItem` не сходятся, но не видно, почему шов подменяет
 * элемент, а не оборачивает кнопку, и почему в его пропсах нет `onClick`.
 */
/*
 * `LineChart` выехал отсюда на DS-275. Из `.d.ts` не видно, что поле оси
 * Y считается по подписи и не имеет потолка, в отличие от поля категорий
 * `BarChart`, и почему число нельзя обрезать многоточием.
 */
/*
 * `AppBar` выехал отсюда на DS-306. Из `.d.ts` видно, что `actions` —
 * `CommandAction[]`, но не видно порядка уступки места (центр → свёртка →
 * перенос бренда) и того, что бренд входит в бюджет шириной в одну строку.
 */
const NOT_CATALOGUED = new Set([
  'Accordion', 'Alert', 'CodeInput',
  'DatePicker', 'Drawer',
  'EmptyState', 'FileDrop',
  'GlobalSearch', 'Modal', 'NumberField',
  'Popover', 'SearchBar', 'SectionPanel', 'Skeleton',
  'Slider', 'Textarea', 'TextField', 'Tooltip',
  // Layout-примитивы: тонкие обёртки над flex/grid, ведут себя ровно как имя и
  // `.d.ts`. Решение с записью несут `Split`, `Grid` и `Stack` — у них свои
  // секции. `Grid` выехал отсюда на DS-136: `auto-fit` против
  // `auto-fill` из имени и типа не читается, а разница между ними — целый класс
  // дефектов. `Stack` выехал на DS-179 по тому же основанию: `gap?`
  // выглядит как «нет зазора, если не передать», а означает базовый шаг из
  // листа — из типа это не читается вовсе, и ровно этим отличается «хочу
  // вплотную» от «не подумал».
  'Box',
])

describe('AGENTS.md catalogue', () => {
  it('documents every component it has taken responsibility for', () => {
    const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')
    const sections = new Set(
      [...agents.matchAll(/^## ([A-Za-z]+)/gm)].map((m) => m[1]!),
    )
    const dirs = readdirSync(join(SRC, 'components'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)

    const missing = dirs.filter((d) => {
      if (NOT_CATALOGUED.has(d)) return false
      return !sections.has(COVERED_BY[d] ?? d)
    })
    expect(missing, `не описаны в AGENTS.md: ${missing.join(', ')}`).toEqual([])
  })

  it('does not keep sections for components that no longer exist', () => {
    const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')
    const dirs = new Set(readdirSync(join(SRC, 'components')))
    // Секции про не-компоненты (theme, tokens, chart palette) начинаются со
    // строчной буквы либо описаны как модули — их проверять не по каталогам.
    const componentSections = [...agents.matchAll(/^## ([A-Z][A-Za-z]+) \(`src\/components\/([A-Za-z]+)\//gm)]
    const stale = componentSections.filter(([, , dir]) => !dirs.has(dir!)).map(([, name]) => name!)
    expect(stale, `описаны, но каталога нет: ${stale.join(', ')}`).toEqual([])
  })
})
