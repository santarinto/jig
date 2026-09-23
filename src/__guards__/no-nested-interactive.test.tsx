/// <reference types="vite/client" />
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Tabs } from '../components/Tabs/Tabs.js'
import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs.js'
import { RouteBar } from '../components/RouteBar/RouteBar.js'
import { SideNav } from '../components/SideNav/SideNav.js'
import { FunctionPanel } from '../components/FunctionPanel/FunctionPanel.js'
import { Combobox } from '../components/Combobox/Combobox.js'
import { FormTabs } from '../components/FormTabs/FormTabs.js'
import { GlobalSearch } from '../components/GlobalSearch/GlobalSearch.js'
import { DataTable } from '../components/DataTable/DataTable.js'
import { LogViewer } from '../components/LogViewer/LogViewer.js'
import { AgentTranscript } from '../components/AgentTranscript/AgentTranscript.js'
import { Heatmap } from '../components/Heatmap/Heatmap.js'
import type { Column } from '../internal/columns.js'
import type { AnyFixture } from '../internal/fixture.js'

/**
 * Интерактивный элемент не может лежать внутри другого интерактивного.
 *
 * Прежний шов `SideNav.renderItem` отдавал готовую `<button>` и документировал
 * обёртку `<Link>{inner}</Link>` — то есть `<a><button>`. Потребитель писал так
 * в боевой навигации, и **это работало сломанным столько, сколько существует
 * его навигация**: мышью кликается, страница открывается, визуально всё цело.
 * Замер показывал два таб-стопа на пункт вместо одного — на десяти пунктах
 * двадцать нажатий Tab, и на каждом втором скринридер объявлял элемент, который
 * никуда не ведёт.
 *
 * Ни один тест этого не ловил: каждый компонент по отдельности отрисовывал
 * верную разметку. Ломалось на **композиции** — там, где потребитель кладёт
 * наш узел внутрь своего. Поэтому проверка общая, а не покомпонентная, и она
 * рендерит именно швы: без `renderItem` вложенности быть не может по
 * построению, и проверять было бы нечего.
 *
 * Предложено потребителем, который на этом дефекте жил. Его формулировка: «один
 * таб-стоп на пункт — то, что можно посчитать в тесте, и то, чего никакой
 * скриншот не покажет».
 */
const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Снаружи интерактивным делает не только тег, но и роль.
 *
 * Первая версия смотрела только на теги, и мутация это вскрыла: `<button>`
 * внутри `<li role="option">` она пропускала насквозь — у кнопки не было
 * интерактивного предка *по тегу*, `<li>` для неё обычный контейнер. А для
 * скринридера это ровно тот же дефект, что `<a><button>`: виджет внутри
 * виджета, две модели навигации на одном узле.
 *
 * Роли ниже — те, что объявляют собственную модель управления с клавиатуры
 * (стрелки двигают активный элемент, Tab выходит наружу). Фокусируемый
 * потомок у любой из них означает вторую, конкурирующую модель.
 */
const INTERACTIVE_ROLE = '[role="option"], [role="menuitem"], [role="menuitemcheckbox"], ' +
  '[role="menuitemradio"], [role="tab"], [role="treeitem"], [role="button"], [role="link"], ' +
  '[role="checkbox"], [role="radio"], [role="switch"]'
const OUTER = `${INTERACTIVE}, ${INTERACTIVE_ROLE}`

/**
 * СНАРУЖИ БЫВАЕТ И ПРОСТО ФОКУСИРУЕМЫМ, и это не вложенность (DS-192).
 *
 * Предмет гейта назван в шапке словами: виджет внутри виджета, две
 * конкурирующие модели управления на одном узле. Голый `<div tabindex="0">`
 * никакой модели не объявляет — Tab проходит его насквозь и идёт дальше внутрь,
 * стрелки прокручивают. Ровно так устроена ПРОКРУЧИВАЕМАЯ ОБЛАСТЬ, которой
 * SC 2.1.1 требует быть достижимой с клавиатуры: у `LogViewer` с `clampLines`
 * внутри такой области живут кнопки переполненных строк, и это законно.
 *
 * Проверяется ФОРМА, а не список имён. Имя пришлось бы дописывать при каждой
 * новой области, и первая недописанная читалась бы как запрет — тогда как
 * `<button tabindex="0">` или `<div role="tab" tabindex="0">` остаются внешними
 * по тегу и по роли, то есть ослабления нет: снимается ровно тот случай, когда
 * ЕДИНСТВЕННОЕ основание считать узел виджетом — атрибут `tabindex` на нейтральном
 * элементе.
 *
 * До этой правки гейт молчал не потому, что был прав, а потому, что на три
 * компонента с прокручиваемыми областями не смотрел вовсе. Смотрит с этой же
 * правки — иначе исключение было бы выдано под случай, которого гейт не видит.
 */
const NEUTRAL = new Set(['DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'NAV', 'UL', 'OL', 'LI', 'SPAN'])

function declaresOwnModel(el: HTMLElement): boolean {
  if (el.matches(INTERACTIVE_ROLE)) return true
  if (!NEUTRAL.has(el.tagName)) return true
  // Нейтральный тег без интерактивной роли: внешним его делал только tabindex.
  return false
}

function describeEl(el: HTMLElement): string {
  const role = el.getAttribute('role')
  return role ? `<${el.tagName.toLowerCase()} role="${role}">` : `<${el.tagName.toLowerCase()}>`
}

function nested(root: HTMLElement): string[] {
  const out: string[] = []
  for (const el of root.querySelectorAll<HTMLElement>(INTERACTIVE)) {
    let outer = el.parentElement?.closest<HTMLElement>(OUTER) ?? null
    // Нейтральные фокусируемые обёртки прозрачны: ищем настоящего внешнего за
    // ними, а не останавливаемся на первой попавшейся.
    while (outer && !declaresOwnModel(outer)) outer = outer.parentElement?.closest<HTMLElement>(OUTER) ?? null
    if (outer) out.push(`${describeEl(outer)} содержит ${describeEl(el)} («${el.textContent?.trim().slice(0, 20)}»)`)
  }
  return out
}

const tabs = [{ id: 'a', label: 'Задачи', count: 3 }, { id: 'b', label: 'Готово' }]
const crumbs = [{ id: 'root', label: 'Проекты' }, { id: 'p', label: 'Портал' }, { id: 'cur', label: 'Задача' }]
const groups = [{ id: 'g', items: [{ id: 'x', label: 'Дашборд' }, { id: 'y', label: 'Отчёты' }] }]
const currencies = [{ value: 'rub', label: 'Рубль' }, { value: 'usd', label: 'Доллар США' }]
const formTabs = [{ id: 'f1', label: 'Реализация №1' }, { id: 'f2', label: 'Контрагент' }]
const hits = [{ id: 'r1', label: 'Реализация №1', group: 'Данные' }, { id: 'r2', label: 'Реализация товаров', group: 'Меню' }]
const fnGroups = [{ title: 'Документы', links: [{ id: 'inv', label: 'Реализация' }, { id: 'ord', label: 'Заказ' }] }]
const sections = [{ id: 'home', label: 'Сводка', href: '/' }, { id: 'feed', label: 'Лента', href: '/feed' }]

describe('вложенная интерактивность', () => {
  it('Tabs со швом: ссылка потребителя становится вкладкой, а не оборачивает её', () => {
    const { container } = render(
      <Tabs tabs={tabs} selectedId="a" onSelect={() => {}}
        renderItem={(t, props) => <a href={`/${t.id}`} {...props} />} />,
    )
    expect(nested(container)).toEqual([])
  })

  it('Breadcrumbs со швом', () => {
    const { container } = render(
      <Breadcrumbs items={crumbs}
        renderItem={(c, props) => <a href={`/${c.id}`} {...props} />} />,
    )
    expect(nested(container)).toEqual([])
  })

  it('SideNav со швом — место, где дефект и жил', () => {
    const { container } = render(
      <SideNav groups={groups} selectedId="x"
        renderItem={(item, props) => <a href={`/${item.id}`} {...props} />} />,
    )
    expect(nested(container)).toEqual([])
  })

  it('FunctionPanel со швом: ссылка потребителя становится пунктом, а не оборачивает кнопку', () => {
    const { container } = render(
      <FunctionPanel groups={fnGroups}
        renderItem={(l, props) => <a href={`/${l.id}`} {...props} />} />,
    )
    // Счёт рядом с утверждением: панель без ссылок проходит «нет вложенности»
    // просто потому, что проверять нечего.
    expect(container.querySelectorAll('a[href]')).toHaveLength(fnGroups[0]!.links.length)
    expect(nested(container)).toEqual([])
  })

  /**
   * `RouteBar` — единственный из швов, где элемент по умолчанию **уже** ссылка.
   * Значит и ошибка потребителя здесь другая: не `<a><button>`, а `<a><a>`,
   * который браузер к тому же молча распарсит не так, как написано. Проверять
   * надо ровно шов: без него вложенности взяться неоткуда.
   */
  it('RouteBar со швом: ссылка потребителя становится разделом, а не оборачивает наш', () => {
    const { container } = render(
      <RouteBar routes={sections} selectedId="home"
        renderItem={(r, props) => <a key={r.id} {...props} />} />,
    )
    expect(container.querySelectorAll('a')).toHaveLength(sections.length)
    expect(nested(container)).toEqual([])
  })

  /**
   * `DataTable` попал сюда с DS-92 — с того момента, как строка получила
   * клавиатурный путь. Проверять надо КОМПОЗИЦИЮ, а не кнопку: в одной строке
   * теперь два интерактивных соседа — кнопка имени в `<th scope="row">` и
   * кнопки колонки действий, — и они лежат в `<tr>` с обработчиком клика.
   *
   * Именно поэтому строка НЕ стала интерактивным элементом. Сделай её
   * фокусируемой (`tabIndex`, `role="button"`, `onKeyDown`) — и каждая кнопка
   * действия окажется виджетом внутри виджета, мышью это будет работать, а
   * обход с клавиатуры даст лишний таб-стоп на строку. Гейт краснеет раньше,
   * чем такая правка доедет до потребителя.
   *
   * Колонка с `rowHeader` не имеет `render` по типу, поэтому вложить ссылку
   * ВНУТРЬ кнопки имени нельзя по построению — этот путь закрыт не проверкой,
   * а формой (см. `RowHeaderColumn`). Здесь остаётся проверить соседство.
   */
  it('DataTable: кнопка имени строки и кнопки действий — соседи, а не вложенные', () => {
    interface R { id: string; name: string }
    const rows: R[] = [{ id: '1', name: 'Иванов И. И.' }, { id: '2', name: 'Петров П. П.' }]
    const cols: Column<R>[] = [
      { key: 'name', header: 'Водитель', rowHeader: true },
      { id: 'act', actions: (r) => [{ id: 'del', icon: <span>×</span>, label: `Удалить ${r.name}`, onSelect: () => {} }] },
    ]
    const { container } = render(
      <DataTable columns={cols} rows={rows} getRowId={(r) => r.id}
        onRowClick={() => {}} selectedIds={['1']} />,
    )
    expect(nested(container)).toEqual([])
    // Заведомо известный сосед: кнопок ровно две на строку — имя и действие.
    // Без счёта проверка выше проходила бы и на разметке, где кнопки имени нет
    // вовсе, то есть ровно на том дефекте, ради которого шов написан.
    expect(container.querySelectorAll('tbody button')).toHaveLength(rows.length * 2)
  })

  it('и без шва тоже — на случай, если вложенность заведётся внутри компонента', () => {
    const { container } = render(
      <>
        <Tabs tabs={tabs} selectedId="a" onSelect={() => {}} />
        <Breadcrumbs items={crumbs} />
        <SideNav groups={groups} selectedId="x" />
        <RouteBar routes={sections} selectedId="home" />
      </>,
    )
    expect(nested(container)).toEqual([])
  })

  /**
   * Combobox — второй адрес того же класса, и он не про шов.
   *
   * Список открыт: `<li role="option">` держал внутри `<button>`, пока
   * `aria-activedescendant` на инпуте утверждал, что фокус остаётся в поле
   * поиска. Две модели навигации разом: стрелки двигают «активную» строку, а
   * Tab независимо от них проходит по кнопкам — по одной на опцию.
   *
   * Компонент раскрывается только в открытом состоянии, поэтому гейт обязан
   * его открыть: закрытый Combobox — это один триггер, и проверять там нечего.
   */
  it('Combobox с открытым списком — опции не содержат своих кнопок', async () => {
    const { container } = render(
      <Combobox options={currencies} onCreate={() => {}} />,
    )
    await userEvent.click(screen.getByRole('button'))
    // Счётчик рядом с утверждением: пустой список проходит проверку «нет
    // вложенности» просто потому, что проверять нечего. Первая версия этой
    // проверки набирала запрос, под который не подходила ни одна опция, — и
    // мутацию «вернуть <button> в опцию» пережила зелёной.
    expect(screen.getAllByRole('option')).toHaveLength(currencies.length)
    expect(nested(container)).toEqual([])
  })

  /**
   * FormTabs — третий адрес того же класса, и найден он был этим же гейтом
   * после того, как гейт научился видеть роль. Крестик лежал **внутри**
   * `<div role="tab">`: интерактивный элемент внутри виджета, объявляющего
   * собственную клавиатурную модель.
   */
  it('FormTabs: крестик — сосед вкладки, а не её потомок', () => {
    const { container } = render(
      <FormTabs tabs={formTabs} selectedId="f1" onClose={() => {}} onHome={() => {}} />,
    )
    expect(screen.getAllByRole('tab')).toHaveLength(formTabs.length)
    expect(nested(container)).toEqual([])
  })

  /**
   * GlobalSearch — четвёртый адрес, и найден он тем же расширением гейта на
   * роли. Строка результата держала внутри `<button>` при `role="option"`;
   * клавиатурной модели у списка не было вовсе, так что вторая модель
   * навигации была единственной — и та работала только табом.
   */
  it('GlobalSearch с выдачей — строки результата не содержат своих кнопок', () => {
    const { container } = render(
      <GlobalSearch value="реал" onChange={() => {}} results={hits} />,
    )
    expect(screen.getAllByRole('option')).toHaveLength(hits.length)
    expect(nested(container)).toEqual([])
  })

  it('Combobox, строка «Создать» — тот же случай на другой ветке разметки', async () => {
    const { container } = render(
      <Combobox options={currencies} onCreate={() => {}} />,
    )
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByRole('combobox'), 'Тенге')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /Создать/ })).toBeInTheDocument()
    expect(nested(container)).toEqual([])
  })

  it('проверка умеет находить вложенность — иначе она ничего не значит', () => {
    const { container } = render(<a href="/x"><button type="button">внутри</button></a>)
    expect(nested(container)).toHaveLength(1)
  })

  /**
   * Главный случай, и он не про правильное использование, а про прежнее.
   *
   * Потребитель со старым швом **оборачивал** то, что ему дали:
   * `(item, inner) => <Link>{inner}</Link>`. Пока шов отдавал готовый узел, это
   * молча давало `<a><button>`. Сейчас шов отдаёт объект пропсов, и такой вызов
   * обязан **упасть**, а не отрисовать вложенность.
   *
   * Первая версия этой проверки мутацию пережила: её колбэк раскладывал пропсы,
   * а раскладывание чужого React-узла вложенности не создаёт — оно рассыпает
   * его поля. Проверка была верной и не о том.
   */
  /**
   * ТЕ ЖЕ ГЛАЗА, НАВЕДЁННЫЕ НА ПРЕВЬЮ. Всё выше рендерит React, то есть
   * проверяет компоненты. А `previews/*.html` — разметка РУКОПИСНАЯ, её никто
   * не рендерит, и она расходится с компонентами молча.
   *
   * Повод не гипотетический: `previews/example-workspace.html` вешал
   * `role="tab"` на `<div class="ds-formtabs__tab">`, обёртку вокруг
   * `<button class="ds-formtabs__label">`. Сам `FormTabs` в комментарии
   * объясняет, почему делает РОВНО НАОБОРОТ — «роль на кнопке, а не на
   * обёртке: `role="tab"` на нефокусируемом div оставлял скринридеру „кнопка“
   * вместо „вкладка, 2 из 5“». Соседний `previews/formtabs.html` при этом был
   * верен, то есть разошлись два превью одного компонента.
   *
   * Почему это перестало быть косметикой: с DS-96 превью НЕСУТ гейт —
   * кейс `make measure` «Цель клика» обходит все 31 и меряет то, что в них
   * написано. Разметка, разошедшаяся с компонентом, теперь не просто вводит в
   * заблуждение читателя, а ослабляет проверку: она меряет не то, что
   * отрисует система.
   *
   * Детектор ТОТ ЖЕ, что у компонентов, — `nested()`. Заводить превью второе
   * правило было бы способом развести два правила об одном.
   */
  /**
   * ТРИ КОМПОНЕНТА С ПРОКРУЧИВАЕМЫМИ ОБЛАСТЯМИ (DS-192).
   *
   * Приведены сюда вместе с исключением для нейтральной фокусируемой обёртки —
   * а не после него. Исключение, выданное под случай, на который гейт не
   * смотрит, проверить нечем: оно выглядит как решение и держится обещанием.
   *
   * Каждый — в том состоянии, где внутри области ЕСТЬ кнопки: у лога кнопку
   * получает переполненная строка (с DS-194 — только она, поэтому
   * переполнение здесь подменяется руками), транскрипт разворачивает блоки,
   * теплокарта с `onDayClick` превращает дни в кнопки. Именно эти состояния и были бы
   * ложным срабатыванием, если бы `tabindex` на скроллере считался внешним
   * виджетом.
   */
  it('прокручиваемая область с кнопками внутри — не вложенный интерактив', () => {
    const lines = [1, 2, 3].map((n) => ({ seq: n, ts: '2026-09-04T10:00:00Z', kind: 'out', text: `строка ${n}` }))
    // `clampLines={1}` кнопок больше НЕ ГАРАНТИРУЕТ: с DS-194 их получает
    // только строка, которая не влезла в потолок, а переполнение — замер,
    // которого в jsdom нет (`scrollHeight` там ноль у всего). Подменяем ровно
    // узел текста строки: случай ровно про состояние С КНОПКАМИ внутри, и без
    // подмены он проверял бы пустую область — санитар ниже это и ловит.
    const proto = HTMLElement.prototype
    const prevScroll = Object.getOwnPropertyDescriptor(proto, 'scrollHeight')
    const prevClient = Object.getOwnPropertyDescriptor(proto, 'clientHeight')
    const isText = (el: HTMLElement) => el.classList.contains('ds-log__text')
    Object.defineProperty(proto, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) { return isText(this) ? 100 : prevScroll?.get?.call(this) ?? 0 },
    })
    Object.defineProperty(proto, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) { return isText(this) ? 20 : prevClient?.get?.call(this) ?? 0 },
    })
    let log: HTMLElement
    try {
      ;({ container: log } = render(
        <LogViewer lines={lines} getLineId={(l) => String(l.seq)} clampLines={1} height={200} />,
      ))
    } finally {
      if (prevScroll) Object.defineProperty(proto, 'scrollHeight', prevScroll)
      if (prevClient) Object.defineProperty(proto, 'clientHeight', prevClient)
    }
    expect(log.querySelector('.ds-log__scroll')?.getAttribute('tabindex'), 'область лога не фокусируема').toBe('0')
    expect(log.querySelectorAll('.ds-log__scroll button').length, 'кнопок внутри нет — случай не тот').toBeGreaterThan(0)
    expect(nested(log)).toEqual([])

    const turns = [{ id: 't1', kind: 'message' as const, role: 'assistant' as const, ts: '2026-09-04T10:00:00Z', text: 'ответ', thinking: 'мысли' }]
    const { container: tr } = render(
      <AgentTranscript turns={turns} getTurnId={(t) => t.id} height={200} />,
    )
    expect(tr.querySelector('.ds-transcript__scroll')?.getAttribute('tabindex')).toBe('0')
    expect(tr.querySelectorAll('.ds-transcript__scroll button').length).toBeGreaterThan(0)
    expect(nested(tr)).toEqual([])

    const { container: heat } = render(
      <Heatmap data={[{ date: '2026-07-02', value: 3 }]} from="2026-07-01" to="2026-07-10" onDayClick={() => {}} />,
    )
    expect(heat.querySelector('.ds-heat__scroll')?.getAttribute('tabindex')).toBe('0')
    expect(heat.querySelectorAll('.ds-heat__scroll button').length).toBeGreaterThan(0)
    expect(nested(heat)).toEqual([])
  })

  /**
   * И обратная сторона исключения: снимается ровно `tabindex` на НЕЙТРАЛЬНОМ
   * теге без интерактивной роли. Настоящая вложенность через фокусируемую
   * обёртку по-прежнему видна — иначе исключение накрыло бы то, ради чего гейт
   * написан.
   */
  it('исключение узкое: роль и тег внешнего по-прежнему ловятся сквозь фокусируемую обёртку', () => {
    const { container } = render(
      <div>
        <div tabIndex={0}><button type="button">внутри области</button></div>
        <div role="tab" tabIndex={0}><button type="button">внутри вкладки</button></div>
        <div tabIndex={0}><a href="/x"><button type="button">внутри ссылки</button></a></div>
      </div>,
    )
    expect(nested(container)).toEqual([
      '<div role="tab"> содержит <button> («внутри вкладки»)',
      '<a> содержит <button> («внутри ссылки»)',
    ])
  })

  /**
   * КАЖДЫЙ СЛУЧАЙ КАЖДОЙ ФИКСТУРЫ (DS-273).
   *
   * До этой задачи гейт видел ровно те швы, которые в него вписали руками, —
   * он старше фикстур и перечислял компоненты сам. Новый шов (`FunctionPanel.
   * renderItem`) поэтому не попадал сюда НИКАК: случай `links` в фикстуре был
   * бы зелёным по построению, пока кто-нибудь не вспомнит дописать строку.
   * Ровно так гейт и пропустил три области прокрутки до DS-192.
   *
   * Фикстура — место, где швы уже отрисованы в той форме, в какой их
   * показывают потребителю, поэтому обход идёт по ним, тем же `nested()`.
   * Замерено при заведении: нарушений ноль на всех случаях, около секунды.
   * Поштучные случаи выше остаются: они держат СОСТОЯНИЯ (открытый список,
   * переполненная строка), которых фикстура в jsdom не воспроизводит.
   */
  it('ни один случай фикстуры не содержит вложенной интерактивности', () => {
    const shipped = import.meta.glob<{ default: AnyFixture }>(['../components/*/*.fixture.tsx', '../icons/*.fixture.tsx'], { eager: true })
    const byName = new Map(Object.values(shipped).map(({ default: fx }) => [fx.name, fx]))
    const offenders: string[] = []
    const walked: string[] = []
    const filled: string[] = []

    // НАЧИНКА ПОЗИЦИЙ — так же, как её кладёт кадр (`workbench/frame-app.tsx`,
    // `loadFills`): ссылка `{ c, case }` рисует случай ЧУЖОЙ фикстуры, `{ text }`
    // — текст. Первая редакция обхода звала `render(props, {})`, и всё, что
    // случай кладёт в позицию, до DOM не доезжало: кнопка в ячейке `DataTable`
    // рядом с нажимаемой строкой прошла бы зелёной (находка ревью 273). Глубина
    // один уровень — позиции начинки не заполняются: у кадра их тоже нет, он
    // заполняет позиции ТОЛЬКО показываемого случая.
    const fillsOf = (c: AnyFixture['cases'][number], owner: string) => {
      const out: Record<string, React.ReactNode> = {}
      for (const [slot, fill] of Object.entries(c.slots ?? {})) {
        if ('text' in fill) { out[slot] = fill.text; continue }
        const target = byName.get(fill.c)
        const kase = target?.cases.find((x) => x.id === (fill.case ?? target.cases[0]?.id))
        const draw = kase?.render ?? target?.render
        if (!target || !kase || !draw) throw new Error(`${owner}: позиция «${slot}» ссылается на ${fill.c}:${fill.case ?? ''}, а такого случая нет`)
        out[slot] = draw({ ...target.props, ...kase.props }, {})
        filled.push(`${owner}.${slot}`)
      }
      return out
    }

    for (const { default: fx } of Object.values(shipped)) {
      for (const c of fx.cases) {
        const draw = c.render ?? fx.render
        // Жалобы React в консоль — предмет `fixtures-render`, не этого гейта.
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
          const { container } = render(<>{draw!({ ...fx.props, ...c.props }, fillsOf(c, `${fx.name}/${c.id}`))}</>)
          for (const line of nested(container)) offenders.push(`${fx.name}/${c.id}: ${line}`)
          walked.push(`${fx.name}/${c.id}`)
          // Санитар начинки на известном месте: `DataTable/actions` кладёт в
          // ячейку `Badge:dot`. Нет значка — позиции снова рисуются пустыми.
          if (fx.name === 'DataTable' && c.id === 'actions') {
            expect(container.querySelector('.ds-badge'), 'начинка позиции DataTable/actions не доехала до DOM').not.toBeNull()
          }
        } finally { quiet.mockRestore(); cleanup() }
      }
    }
    // Санитар: пустой обход дал бы «ноль нарушений» из ничего, а случай, ради
    // которого обход заведён, обязан в нём быть.
    expect(walked.length, 'фикстуры не найдены').toBeGreaterThan(100)
    expect(walked).toContain('FunctionPanel/links')
    // Второй поимённый санитар (DS-359). Случай со своим триггером —
    // единственное место, где обход доказывает, что компонент НЕ оборачивает
    // чужой узел в свою кнопку: мутация «обёртка вернулась» краснеет именно
    // на нём (плюс на «Ещё» полосы и шапки). Переименуй случай — и
    // доказательство исчезло бы молча, а гейт остался бы зелёным.
    expect(walked).toContain('DropdownMenu/own-trigger')
    expect(filled, 'ни одна позиция не заполнена').toContain('DataTable/actions.cell')
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('превью не содержат вложенной интерактивности — разметка рукописная, её не рендерит никто', () => {
    const dir = resolve(__dirname, '../../previews')
    const files = readdirSync(dir).filter((n) => n.endsWith('.html'))
    // Санитар: пустой список файлов дал бы «ноль нарушений» из ничего.
    expect(files.length, 'превью не найдены — проверка была бы о пустоте').toBeGreaterThan(20)
    const offenders: string[] = []
    for (const f of files) {
      const doc = new DOMParser().parseFromString(readFileSync(join(dir, f), 'utf8'), 'text/html')
      for (const line of nested(doc.body)) offenders.push(`previews/${f}: ${line}`)
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('обёртка вместо раскладки падает, а не рисует вложенность', () => {
    const wrapping = (_item: unknown, inner: unknown) => <a href="/x">{inner as never}</a>
    // React печатает ожидаемое падение в console.error. Глушим: в выводе гейта
    // оно выглядит как поломка, и следующий человек пойдёт её чинить.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    let threw = false
    let container: HTMLElement | null = null
    try {
      container = render(
        <SideNav groups={groups} selectedId="x" renderItem={wrapping as never} />,
      ).container
    } catch { threw = true } finally { quiet.mockRestore() }
    // Либо громкое падение (верно), либо — если вдруг отрисовалось — без
    // вложенной интерактивности. Молча вложить нельзя ни при каком исходе.
    expect(threw || nested(container!).length === 0).toBe(true)
    expect(threw, 'обёртка обязана падать: шов отдаёт пропсы, а не узел').toBe(true)
  })
})
