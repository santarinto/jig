import { describe, it, expect } from 'vitest'
import { canvasSnippetOf, hasPrintableSpot, snippetOf } from './jsx-snippet.js'
import type { CanvasSpot, FixtureMeta } from './protocol.js'

const controls = {
  dense: { kind: 'bool' as const, prop: true },
  emptyText: { kind: 'text' as const, prop: true },
  count: { kind: 'number' as const, min: 0, max: 9, prop: true },
}

describe('snippetOf', () => {
  it('строки в кавычках, числа и булевы в фигурных скобках', () => {
    expect(snippetOf('DataTable', { emptyText: 'Нет данных', count: '3', dense: 'true' }, controls, null, []))
      .toBe('<DataTable dense emptyText="Нет данных" count={3} />')
  })

  it('булев false не печатается вовсе — это значение по умолчанию у JSX', () => {
    expect(snippetOf('DataTable', { dense: 'false' }, controls, null, [])).toBe('<DataTable />')
  })

  it('набор данных уходит комментарием, а не пропом: в API компонента его нет', () => {
    expect(snippetOf('DataTable', {}, controls, 'rows-500', []))
      .toBe('{/* набор данных: rows-500 */}\n<DataTable />')
  })

  it('двойная кавычка в строке не ломает сниппет — уходит в одинарные', () => {
    expect(snippetOf('DataTable', { emptyText: 'нет "данных"' }, controls, null, []))
      .toBe('<DataTable emptyText=\'нет "данных"\' />')
  })

  it('и та, и другая кавычка сразу — JS-строка в фигурных скобках, честно экранированная', () => {
    expect(snippetOf('DataTable', { emptyText: `нет "данных" и 'ещё чего-то'` }, controls, null, []))
      .toBe(`<DataTable emptyText={${JSON.stringify(`нет "данных" и 'ещё чего-то'`)}} />`)
  })

  it('нечисловое значение в крутилке number не печатается как NaN — пропускается', () => {
    expect(snippetOf('DataTable', { count: 'abc' }, controls, null, [])).toBe('<DataTable />')
  })
})

/**
 * Честность сниппета (DS-128).
 *
 * До этой правки печатались ВСЕ крутилки подряд, потому что различить крутилку
 * стенда и проп компонента было нечем. Проверяется не «печатает меньше» —
 * меньше печатал бы и сломанный генератор, — а что сниппет РАЗЛИЧАЕТ три вида
 * крутилок и НАЗЫВАЕТ то, чего не напечатал.
 */
describe('snippetOf: чему крутилка соответствует у компонента', () => {
  const mixed = {
    dense: { kind: 'bool' as const, prop: true },
    emptyText: { kind: 'text' as const, prop: 'emptyContent' },
    widths: { kind: 'bool' as const, prop: false as const },
    wrapCity: { kind: 'bool' as const, prop: false as const },
  }

  it('крутилка стенда не печатается пропом — у компонента такого пропа нет', () => {
    const out = snippetOf('DataTable', { widths: 'true', wrapCity: 'true' }, mixed, null, [])
    // ИМЕННО ТЕГ, а не весь вывод: в комментарии о потере эти имена стоят
    // законно и обязаны там быть (проверяется следующим случаем). Первая
    // редакция этого теста искала строку по всему выводу и противоречила
    // соседнему — то есть требовала, чтобы потеря осталась молчаливой.
    const tag = out.split('\n').find((l) => l.startsWith('<'))
    expect(tag).toBe('<DataTable />')
  })

  it('и она НАЗВАНА — молчаливая потеря и есть предмет правки', () => {
    const out = snippetOf('DataTable', { widths: 'true', wrapCity: 'true' }, mixed, null, [])
    expect(out).toContain('widths')
    expect(out).toContain('wrapCity')
    expect(out).toContain('крутилки стенда')
  })

  it('переименованный проп печатается ПОД СВОИМ именем, а не под именем крутилки', () => {
    const out = snippetOf('DataTable', { emptyText: 'Данных нет' }, mixed, null, [])
    expect(out).toContain('emptyContent="Данных нет"')
    expect(out).not.toContain('emptyText=')
  })

  it('children печатается между тегами, а не атрибутом', () => {
    const kids = { text: { kind: 'text' as const, prop: 'children' } }
    expect(snippetOf('Alert', { text: 'Рейс перенесён' }, kids, null, []))
      .toBe('<Alert>Рейс перенесён</Alert>')
  })

  it('значение фикстуры без крутилки названо отдельно — это не крутилка, а данные', () => {
    const out = snippetOf('DataTable', { dense: 'true' }, mixed, null, ['rows'])
    expect(out).toContain('rows')
    expect(out).toContain('значения фикстуры')
  })

  it('числовой enum печатается числом, а не строкой', () => {
    // `KeyValueList.columns` объявлен `1 | 2`. Крутилка держит значения
    // строками (так устроено хранилище верстака), и сниппет печатал
    // `columns="1"` — у потребителя это ошибка типа: строка не присваивается
    // `1 | 2`. Сегментный переключатель для выбора из двух остаётся, числом
    // объявлены ЗНАЧЕНИЯ.
    const num = { columns: { kind: 'enum' as const, values: ['1', '2'], numeric: true as const, prop: true } }
    expect(snippetOf('KeyValueList', { columns: '2' }, num, null, []))
      .toBe('<KeyValueList columns={2} />')
  })

  it('обычный enum остаётся строкой — числовым его делает объявление, а не вид значения', () => {
    // `variant="pages"` строка, и `size="2"` у крутилки без пометки — тоже:
    // догадываться по виду значения значило бы печатать `size={2}` там, где
    // компонент ждёт строку, и ошибка выехала бы к потребителю.
    const plain = { size: { kind: 'enum' as const, values: ['1', '2'], prop: true } }
    expect(snippetOf('X', { size: '2' }, plain, null, [])).toBe('<X size="2" />')
  })

  it('терять нечего — комментария нет вовсе, иначе он обесценится', () => {
    const clean = { dense: { kind: 'bool' as const, prop: true } }
    expect(snippetOf('DataTable', { dense: 'true' }, clean, null, [])).toBe('<DataTable dense />')
  })

  it('`*/` в имени потерянной крутилки не закрывает комментарий раньше времени', () => {
    const evil = { 'a*/b': { kind: 'bool' as const, prop: false as const } }
    const out = snippetOf('X', { 'a*/b': 'true' }, evil, null, [])
    expect(out).not.toContain('*/b')
    expect(out.match(/\*\//g)).toHaveLength(1)
  })
})

const tableMeta: FixtureMeta = {
  name: 'DataTable',
  group: 'Данные',
  cases: [
    { id: 'row-open', title: 'Открытие строки', values: { dense: 'false' }, slots: {} },
    { id: 'dense', title: 'Плотная', values: { dense: 'true' }, slots: {} },
  ],
  controls,
  unexpressed: [],
  data: ['rows-500'],
  slots: {},
}

const pagesMeta: FixtureMeta = {
  name: 'Pagination',
  group: 'Навигация',
  cases: [{ id: 'base', title: 'Обычная', values: {}, slots: {} }],
  controls: { count: { kind: 'number', min: 0, max: 9, prop: true } },
  unexpressed: [],
  data: [],
  slots: {},
}

const spot = (over: Partial<CanvasSpot>): CanvasSpot => ({
  id: 'table',
  component: 'DataTable',
  caseId: 'row-open',
  col: 1,
  span: 12,
  props: {},
  data: null,
  ...over,
})

describe('canvasSnippetOf', () => {
  it('весь набор внутри контейнера сетки, места в порядке раскладки', () => {
    const spots = [
      spot({ id: 'table', col: 1, span: 8 }),
      spot({ id: 'pages', component: 'Pagination', caseId: 'base', col: 9, span: 4 }),
    ]
    expect(canvasSnippetOf(spots, { table: tableMeta, pages: pagesMeta })).toBe(
      [
        `import { DataTable, Pagination } from '@santarinto/jig'`,
        ``,
        `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', alignItems: 'start', gap: 'var(--ds-space-4)' }}>`,
        `  <div style={{ gridColumn: '1 / span 8', minWidth: 0 }}>`,
        `    <DataTable />`,
        `  </div>`,
        `  <div style={{ gridColumn: '9 / span 4', minWidth: 0 }}>`,
        `    <Pagination />`,
        `  </div>`,
        `</div>`,
      ].join('\n'),
    )
  })

  it('крутилки места перекрывают значения случая, набор данных уходит комментарием', () => {
    const spots = [spot({ caseId: 'dense', props: { emptyText: 'Пусто' }, data: 'rows-500' })]
    expect(canvasSnippetOf(spots, { table: tableMeta })).toBe(
      [
        `import { DataTable } from '@santarinto/jig'`,
        ``,
        `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', alignItems: 'start', gap: 'var(--ds-space-4)' }}>`,
        `  <div style={{ gridColumn: '1 / span 12', minWidth: 0 }}>`,
        `    {/* набор данных: rows-500 */}`,
        `    <DataTable dense emptyText="Пусто" />`,
        `  </div>`,
        `</div>`,
      ].join('\n'),
    )
  })

  it('пустой канвас — пустая строка, копировать нечего', () => {
    expect(canvasSnippetOf([], {})).toBe('')
  })

  /**
   * Невалидная раскладка (DS-128, находка [2] ручного QA).
   *
   * Кадр печатал «раскладка: место №5 («prose»): колонка вне 1..12», а кнопка
   * «скопировать» рядом отдавала `gridColumn: '99 / span 99'` без единого
   * слова. Стенд копировал раскладку, которую сам же назвал невалидной.
   */
  it('место с колонкой вне сетки не печатается клеткой — она и есть дефект', () => {
    const spots = [spot({ col: 99, span: 99 })]
    const out = canvasSnippetOf(spots, { table: tableMeta })
    expect(out).not.toContain('gridColumn')
    expect(out).not.toContain('<DataTable')
  })

  it('и объясняется ТЕМИ ЖЕ словами, что кадр, — иначе это два разных дефекта', () => {
    const out = canvasSnippetOf([spot({ col: 99, span: 99 })], { table: tableMeta })
    expect(out).toContain('колонка вне 1..12')
  })

  it('вылезающее за правый край названо своей причиной, а не общей', () => {
    // 10+6 сетка перенесла бы на строку ниже молча: у копии была бы ДРУГАЯ
    // раскладка, а не сломанная, — и объяснять это надо отдельно от «вне 1..12».
    const out = canvasSnippetOf([spot({ col: 10, span: 6 })], { table: tableMeta })
    expect(out).toContain('10+6 не помещается в 12 колонок')
  })

  it('соседние годные места печатаются как обычно — ломается место, а не набор', () => {
    const spots = [
      spot({ id: 'table', col: 99, span: 99 }),
      spot({ id: 'pages', component: 'Pagination', caseId: 'base', col: 1, span: 4 }),
    ]
    const out = canvasSnippetOf(spots, { table: tableMeta, pages: pagesMeta })
    expect(out).toContain('<Pagination')
    expect(out).toContain('колонка вне 1..12')
  })

  /**
   * `import` (DS-128, замечание ручного QA: «в снипете нет ни одного
   * import — отдать его другому человеку как есть нельзя даже при полных
   * пропсах»).
   */
  it('набор начинается с import — иначе вставить его некуда', () => {
    const spots = [
      spot({ id: 'table', col: 1, span: 8 }),
      spot({ id: 'pages', component: 'Pagination', caseId: 'base', col: 9, span: 4 }),
    ]
    const out = canvasSnippetOf(spots, { table: tableMeta, pages: pagesMeta })
    expect(out.split('\n')[0]).toBe(`import { DataTable, Pagination } from '@santarinto/jig'`)
  })

  it('имя компонента в списке одно, сколько бы мест его ни стояло', () => {
    // Два DataTable на канвасе — обычное дело (сравнить плотную с обычной), а
    // `import { DataTable, DataTable }` не компилируется.
    const spots = [spot({ id: 'table', col: 1, span: 6 }), spot({ id: 'table2', col: 7, span: 6 })]
    const out = canvasSnippetOf(spots, { table: tableMeta, table2: tableMeta })
    expect(out.split('\n')[0]).toBe(`import { DataTable } from '@santarinto/jig'`)
  })

  it('в списке только НАПЕЧАТАННЫЕ компоненты, а не все места', () => {
    // Место с отказом (своя разметка, нет фикстуры, битая раскладка) тега не
    // даёт — и попав в import, оно дало бы неиспользуемый символ и вопрос
    // «а где же он» у того, кто вставил.
    const ownMeta: FixtureMeta = {
      ...tableMeta,
      name: 'Badge',
      cases: [{ id: 'tones', title: 'Все тона', values: {}, ownRender: true, slots: {} }],
    }
    const spots = [
      spot({ id: 'tones', component: 'Badge', caseId: 'tones' }),
      spot({ id: 'pages', component: 'Pagination', caseId: 'base' }),
    ]
    const out = canvasSnippetOf(spots, { tones: ownMeta, pages: pagesMeta })
    expect(out.split('\n')[0]).toBe(`import { Pagination } from '@santarinto/jig'`)
  })

  it('печатать нечего — нет и import: пустой ввоз хуже отсутствия', () => {
    const out = canvasSnippetOf([spot({ col: 99, span: 99 })], { table: tableMeta })
    expect(out).not.toContain('import')
  })

  it('набор из одних невалидных мест копировать нечем', () => {
    // Иначе кнопка показала бы галочку об успехе, скопировав сетку без единого
    // компонента, — тот же запрет, что для набора из одних отказов.
    expect(hasPrintableSpot(canvasSnippetOf([spot({ col: 99, span: 99 })], { table: tableMeta })))
      .toBe(false)
  })

  it('место со своим render объясняется комментарием, а не уносит с собой набор', () => {
    const ownMeta: FixtureMeta = {
      ...tableMeta,
      name: 'Badge',
      cases: [{ id: 'tones', title: 'Все тона', values: {}, ownRender: true, slots: {} }],
    }
    const spots = [
      spot({ id: 'tones', component: 'Badge', caseId: 'tones' }),
      spot({ id: 'pages', component: 'Pagination', caseId: 'base' }),
    ]
    const out = canvasSnippetOf(spots, { tones: ownMeta, pages: pagesMeta })
    expect(out).toContain(`    {/* Badge, случай «Все тона»: своя разметка, пропсами не выражается */}`)
    expect(out).toContain(`    <Pagination />`)
  })

  it('место без фикстуры не печатается тегом — про него неизвестно, что печатать', () => {
    const out = canvasSnippetOf([spot({ id: 'gone', component: 'Nowhere' })], { gone: null })
    expect(out).toContain(`    {/* Nowhere: фикстура не загрузилась, печатать нечего */}`)
    expect(out).not.toContain('<Nowhere')
  })

  it('названный и не найденный случай — комментарий, а не тег с чужими значениями', () => {
    const out = canvasSnippetOf([spot({ caseId: 'no-such' })], { table: tableMeta })
    expect(out).toContain(`    {/* DataTable: случая «no-such» нет, печатать нечего */}`)
    expect(out).not.toContain('<DataTable')
  })

  it('пустой caseId — первый случай фикстуры, как и в адресе кадра', () => {
    const out = canvasSnippetOf([spot({ caseId: '' })], { table: tableMeta })
    expect(out).toContain(`    <DataTable />`)
  })
})

describe('чужая строка в комментарии сниппета', () => {
  it('`*/` в имени компонента не закрывает комментарий раньше времени', () => {
    // `parseSpots` пропускает ЛЮБУЮ строку в `component` и `caseId`, а файл
    // раскладки правят руками в репозитории — это заявленная форма ввода.
    // Закрывшийся раньше комментарий оставляет хвост голым внутри фигурных
    // скобок, и вставленное не компилируется. У соседнего пути вывода
    // (`jsxStringLiteral`) на кавычки три юнита и докблок — здесь не было
    // ничего.
    const out = canvasSnippetOf(
      [spot({ id: 'a', component: 'X */ y' })],
      { a: null },
    )
    expect(out).not.toContain('*/ y')
    expect(out.match(/\*\//g)).toHaveLength(1)
  })

  it('`*/` в имени случая тоже обезврежен', () => {
    const out = canvasSnippetOf([spot({ caseId: '*/ alert(1) /*' })], { table: tableMeta })
    expect(out.match(/\*\//g)).toHaveLength(1)
  })

  it('`*/` в названии набора данных тоже — тот же путь вывода', () => {
    const out = snippetOf('DataTable', {}, controls, 'rows */ 500', [])
    expect(out.match(/\*\//g)).toHaveLength(1)
  })

  it('обычное имя не портится ради экранирования', () => {
    // Половина, без которой предыдущие проходят и на функции, вырезающей
    // каждую звёздочку из всех имён подряд.
    expect(canvasSnippetOf([spot({ caseId: 'dense' })], { table: tableMeta }))
      .toContain('<DataTable dense />')
  })
})

describe('есть ли что копировать', () => {
  it('набор из одних отказов копировать нечем', () => {
    // Тот же довод, по которому кнопка гаснет на пустом канвасе: клик
    // скопировал бы контейнер без единого компонента и показал галочку —
    // успех, которого не было.
    expect(hasPrintableSpot(canvasSnippetOf([spot({ id: 'a' })], { a: null }))).toBe(false)
  })

  it('хотя бы один настоящий тег — копировать есть что', () => {
    expect(hasPrintableSpot(canvasSnippetOf([spot({})], { table: tableMeta }))).toBe(true)
  })

  it('пустая строка — нечего', () => {
    expect(hasPrintableSpot('')).toBe(false)
  })
})
