/**
 * Раскладка канваса ссылается на НАСТОЯЩИЙ каталог (DS-128).
 *
 * Гейт, а не украшение. `CANVAS_SPOTS` — два имени компонентов и два id
 * случаев строками; переименуй случай в фикстуре, и канвас молча начнёт
 * показывать «у „DataTable“ нет случая „row-open“» вместо таблицы. Отказ там
 * честный и видимый глазами — но увидит его тот, кто открыл канвас, а не тот,
 * кто переименовал случай, и между этими двумя событиями может пройти месяц.
 *
 * ПРОВЕРЯЕТСЯ ПО НАСТОЯЩИМ ФИКСТУРАМ, не по списку имён: список имён — это
 * второе описание каталога, и разойдётся оно ровно так же молча.
 */
/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { CANVAS_SPOTS, parseSpots } from './canvas-plan.js'
import { CANVAS_COLS } from './protocol.js'
import type { AnyFixture } from '../src/internal/fixture.js'

// eager по тому же доводу, что в гейте фикстур: нужен весь список сразу, а
// стресс-данные здесь никого не рисуют.
const shipped = import.meta.glob<{ default: AnyFixture }>(['../src/components/*/*.fixture.tsx', '../src/icons/*.fixture.tsx'], {
  eager: true,
})

const byName = new Map<string, AnyFixture>(
  Object.values(shipped).map((m) => [m.default.name, m.default]),
)

describe('раскладка канваса', () => {
  it('мест на канвасе больше одного', () => {
    // Смысл шага 1 — НЕСКОЛЬКО компонентов в одном хосте. Раскладка из одного
    // места отвечала бы на вопрос вида «Кадр», и все проверки ниже прошли бы,
    // ничего не проверив: сквозной таб-порядок на одном компоненте неотличим
    // от порядка внутри него.
    expect(CANVAS_SPOTS.length).toBeGreaterThan(1)
  })

  it('каждое место называет существующую фикстуру', () => {
    for (const spot of CANVAS_SPOTS) {
      expect(byName.has(spot.component), `нет фикстуры «${spot.component}»`).toBe(true)
    }
  })

  it('каждое место называет существующий случай', () => {
    for (const spot of CANVAS_SPOTS) {
      const fx = byName.get(spot.component)
      if (!fx) continue
      // Пустой `caseId` — законное «первый случай фикстуры», проверять нечего.
      if (!spot.caseId) continue
      expect(
        fx.cases.some((c) => c.id === spot.caseId),
        `у «${spot.component}» нет случая «${spot.caseId}»`,
      ).toBe(true)
    }
  })

  it('id мест не повторяются', () => {
    // Повтор — не косметика: `id` служит ключом React и адресом крутилок на
    // шаге 4, и два места с одним id получили бы одни крутилки на двоих.
    const ids = CANVAS_SPOTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('разбор чужой раскладки', () => {
  const ok = { id: 'a', component: 'Button', caseId: 'base', col: 1, span: 6 }

  it('здоровый список проходит целиком', () => {
    const r = parseSpots([ok, { ...ok, id: 'b', col: 7 }])
    expect(r.dropped).toEqual([])
    expect(r.spots.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('умолчания: без col и span место занимает всю ширину с первой колонки', () => {
    // Отсутствие поля — законное «поставь куда сам знаешь», и это НЕ то же
    // самое, что испорченное значение ниже.
    const r = parseSpots([{ id: 'a', component: 'Button' }])
    expect(r.dropped).toEqual([])
    expect(r.spots[0]).toEqual({
      id: 'a',
      component: 'Button',
      caseId: '',
      col: 1,
      span: CANVAS_COLS,
      props: {},
      data: null,
    })
  })

  it.each([
    ['abc', 'abc'],
    ['число', 7],
    ['null', null],
    ['объект вместо списка', { spots: [] }],
  ])('не список — пустой канвас с объяснением (%s)', (_name, raw) => {
    const r = parseSpots(raw)
    expect(r.spots).toEqual([])
    expect(r.dropped).toEqual(['раскладка не список'])
  })

  it.each([
    ['не объект', 'abc'],
    ['нет id', { component: 'Button' }],
    ['id не строка', { id: 7, component: 'Button' }],
    ['нет компонента', { id: 'a' }],
    ['случай не строка', { id: 'a', component: 'Button', caseId: 7 }],
    ['колонка -1', { id: 'a', component: 'Button', col: -1 }],
    ['колонка 0', { id: 'a', component: 'Button', col: 0 }],
    ['колонка дробная', { id: 'a', component: 'Button', col: 1.5 }],
    ['колонка строкой', { id: 'a', component: 'Button', col: '1' }],
    ['ширина 0', { id: 'a', component: 'Button', span: 0 }],
    ['ширина больше сетки', { id: 'a', component: 'Button', span: CANVAS_COLS + 1 }],
    ['вылезает за правый край', { id: 'a', component: 'Button', col: 10, span: 6 }],
  ])('испорченное место выбрасывается и НАЗЫВАЕТСЯ (%s)', (_name, bad) => {
    // Молчаливое выправление показало бы раскладку, которой никто не задавал;
    // молчаливая потеря выглядит как «не сохранилось». Отсюда два утверждения
    // на каждый случай, а не одно.
    const r = parseSpots([bad])
    expect(r.spots).toEqual([])
    expect(r.dropped).toHaveLength(1)
    expect(r.dropped[0]).toBeTruthy()
  })

  it('одно испорченное место не уносит девять годных', () => {
    // Раскладка — это работа человека. Отказ целиком наказывал бы его за то,
    // чего он не делал.
    const many = Array.from({ length: 9 }, (_, i) => ({ ...ok, id: `s${i}`, col: 1, span: 1 }))
    const r = parseSpots([...many, { id: 'bad', component: 'Button', col: 99 }])
    expect(r.spots).toHaveLength(9)
    expect(r.dropped).toHaveLength(1)
    expect(r.dropped[0]).toContain('bad')
  })

  it('повтор имени выбрасывает ВТОРОЕ место, а не оба', () => {
    // `id` — адрес крутилок выделенного места (шаг 4). Два места с одним
    // именем получили бы одни крутилки на двоих; первое при этом ни в чём не
    // виновато.
    const r = parseSpots([ok, { ...ok, component: 'Badge' }])
    expect(r.spots).toHaveLength(1)
    expect(r.spots[0]?.component).toBe('Button')
    expect(r.dropped[0]).toContain('уже занято')
  })

  it('ссылка на снесённый компонент — НЕ повод выбросить место', () => {
    // Спека ждёт этого прямо: канвас переживёт удаление компонента, и
    // «раскладка ссылается на снесённое» — нормальный ход событий. Отвечает на
    // это кадр словами в самом месте, а не разбор — молчаливым выбрасыванием.
    const r = parseSpots([{ id: 'a', component: 'НетТакого' }])
    expect(r.dropped).toEqual([])
    expect(r.spots).toHaveLength(1)
  })

  it('умолчание раскладки проходит собственный разбор', () => {
    // Иначе кадр показывал бы то, что сам же считает испорченным.
    const r = parseSpots(CANVAS_SPOTS.map((s) => ({ ...s })))
    expect(r.dropped).toEqual([])
    expect(r.spots).toHaveLength(CANVAS_SPOTS.length)
  })

  it('крутилки места переживают разбор', () => {
    // Они обязаны пережить и сохранение набора на шаге 5: набор, потерявший
    // покрученные значения, воспроизводит ПОЛОВИНУ собранного экрана.
    const r = parseSpots([{ id: 'a', component: 'DataTable', props: { dense: 'true', rows: '5' } }])
    expect(r.dropped).toEqual([])
    expect(r.spots[0]?.props).toEqual({ dense: 'true', rows: '5' })
  })

  it('крутилка с нестроковым значением чистится ПОШТУЧНО, место остаётся', () => {
    // Значение крутилки — строка, которую типизует фикстура; чужое значение и
    // так не применяется (`resolveCase` пропускает крутилку, которой в
    // фикстуре нет). Выбросить из-за него всё место значило бы потерять
    // раскладку из-за пропа, который ни на что не влияет.
    const r = parseSpots([{ id: 'a', component: 'DataTable', props: { dense: 'true', rows: 5 } }])
    expect(r.spots).toHaveLength(1)
    expect(r.spots[0]?.props).toEqual({ dense: 'true' })
    expect(r.dropped[0]).toContain('rows')
  })

  it('крутилки не объектом — место отвергается целиком', () => {
    // Здесь чинить нечего: поштучно разбирать нечего, а пустой набор крутилок
    // молча подменил бы покрученное место умолчаниями.
    const r = parseSpots([{ id: 'a', component: 'DataTable', props: 'dense' }])
    expect(r.spots).toEqual([])
    expect(r.dropped[0]).toContain('не объектом')
  })

  it('набор данных места переживает разбор, а чужой тип отвергает МЕСТО', () => {
    // Не поштучно, в отличие от крутилок: набор задаёт данные целиком, и место
    // с потерянным набором показало бы совсем не тот экран — молча.
    expect(parseSpots([{ id: 'a', component: 'DataTable', data: 'rows-500' }]).spots[0]?.data).toBe(
      'rows-500',
    )
    const bad = parseSpots([{ id: 'a', component: 'DataTable', data: 7 }])
    expect(bad.spots).toEqual([])
    expect(bad.dropped[0]).toContain('набор данных')
  })
})

describe('крутилка с именем из прототипа', () => {
  it('`__proto__` не теряется молча — либо доезжает, либо назван', () => {
    // `props[k] = v` для этого ключа — вызов сеттера, строка ему не годится, и
    // поле исчезает БЕЗ строки в `dropped`. Единственное исключение из правила
    // «каждое выброшенное названо», ради которого весь этот разбор и написан.
    // Дыры в безопасности нет: `JSON.parse` кладёт обычное собственное поле.
    const r = parseSpots(JSON.parse('[{"id":"a","component":"X","props":{"__proto__":"v","ok":"1"}}]'))
    expect(r.spots[0]?.props.ok).toBe('1')
    expect(r.spots[0]?.props.__proto__).toBe('v')
    expect(Object.keys(r.spots[0]!.props).sort()).toEqual(['__proto__', 'ok'])
  })
})
