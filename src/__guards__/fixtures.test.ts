/**
 * Гейт состава фикстур.
 *
 * Два слоя: проверка самого валидатора на выдуманных случаях (иначе он может
 * молча ничего не проверять) и прогон по настоящему списку фикстур репозитория.
 */
/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { validateFixtures } from '../internal/fixture-validate.js'
import { NODE_ROLES } from '../internal/fixture.js'
import type { AnyFixture } from '../internal/fixture.js'

// ЗДЕСЬ eager обязателен — в отличие от кадра (workbench/registry.ts), гейту
// нужен весь список сразу, а стресс-данные никого не рисуют.
const shipped = import.meta.glob<{ default: AnyFixture }>(['../components/*/*.fixture.tsx', '../icons/*.fixture.tsx'], {
  eager: true,
})

const ok: AnyFixture = {
  name: 'Alpha',
  group: 'Test',
  props: {},
  controls: {},
  cases: [{ id: 'base', title: 'База' }],
}

describe('validateFixtures', () => {
  it('на здоровом списке молчит', () => {
    expect(validateFixtures([ok])).toEqual([])
  })

  it('ловит повтор имени фикстуры', () => {
    const errs = validateFixtures([ok, { ...ok, group: 'Other' }])
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('Alpha')
  })

  it('ловит повтор id кейса внутри фикстуры', () => {
    const dup: AnyFixture = {
      ...ok,
      cases: [
        { id: 'a', title: '1' },
        { id: 'a', title: '2' },
      ],
    }
    expect(validateFixtures([dup]).join('\n')).toContain('«a» объявлен дважды')
  })

  it('ловит ссылку на несуществующую фикстуру в слоте', () => {
    const bad: AnyFixture = {
      ...ok,
      slots: { actions: { title: 'Действия', accepts: 'inline' } },
      cases: [{ id: 'base', title: 'База', slots: { actions: { c: 'Nope' } } }],
    }
    expect(validateFixtures([bad]).join('\n')).toContain('Nope')
  })

  it('ловит ссылку на несуществующий кейс чужой фикстуры', () => {
    const host: AnyFixture = {
      ...ok,
      slots: { actions: { title: 'Действия', accepts: 'any' } },
      cases: [{ id: 'base', title: 'База', slots: { actions: { c: 'Beta', case: 'нет' } } }],
    }
    const beta: AnyFixture = { ...ok, name: 'Beta' }
    expect(validateFixtures([host, beta]).join('\n')).toContain('нет кейса «нет»')
  })

  it('ловит несовместимость accepts и kind', () => {
    const block: AnyFixture = { ...ok, name: 'Big', kind: 'block' }
    const host: AnyFixture = {
      ...ok,
      slots: { inline: { title: 'Строчная', accepts: 'inline' } },
      cases: [{ id: 'base', title: 'База', slots: { inline: { c: 'Big' } } }],
    }
    expect(validateFixtures([host, block]).join('\n')).toContain('«Big» объявлен как block')
  })

  it('ловит начинку в несуществующую позицию', () => {
    const bad: AnyFixture = {
      ...ok,
      cases: [{ id: 'base', title: 'База', slots: { ghost: { text: 'x' } } }],
    }
    expect(validateFixtures([bad]).join('\n')).toContain('которой нет')
  })

  // Step 0: текстовая начинка допущена типом (`SlotFill`), но её не рисует ни
  // панель, ни кадр (фаза 4). Молчаливый `continue` выдал бы пустоту в ячейке
  // за нормальное поведение — гейт обязан покраснеть в момент объявления.
  it('ловит текстовую начинку — она пока не поддержана верстаком', () => {
    const bad: AnyFixture = {
      ...ok,
      slots: { cell: { title: 'Ячейка', accepts: 'inline' } },
      cases: [{ id: 'base', title: 'База', slots: { cell: { text: 'x' } } }],
    }
    expect(validateFixtures([bad]).join('\n')).toContain('пока не поддержана')
  })

  // `shows` (DS-134) проверяется здесь только КАК ОБЪЯВЛЕНИЕ. Держится
  // ли утверждение, спрашивает `scripts/case-states.mjs` в браузере — но обе
  // ошибки ниже делают тот гейт зелёным, ничего не проверив, и потому должны
  // краснеть раньше и дешевле.
  it('ловит пустой overflows — довод обязателен (DS-177)', () => {
    const blank: AnyFixture = { ...ok, cases: [{ id: 'base', title: 'База', overflows: '  ' }] }
    expect(validateFixtures([blank]).join('\n')).toContain('overflows объявлен пустым')
    const good: AnyFixture = { ...ok, cases: [{ id: 'base', title: 'База', overflows: 'граница оболочки' }] }
    expect(validateFixtures([good])).toEqual([])
  })

  it('ловит пустой tinyTargets — довод обязателен (DS-177)', () => {
    const blank: AnyFixture = { ...ok, cases: [{ id: 'base', title: 'База', tinyTargets: '  ' }] }
    expect(validateFixtures([blank]).join('\n')).toContain('tinyTargets объявлен пустым')
    const good: AnyFixture = { ...ok, cases: [{ id: 'base', title: 'База', tinyTargets: 'декоративный крестик в поле' }] }
    expect(validateFixtures([good])).toEqual([])
  })

  it('ловит пустой shows — объявление, не утверждающее ничего', () => {
    const bad: AnyFixture = { ...ok, cases: [{ id: 'base', title: 'База', shows: [] }] }
    expect(validateFixtures([bad]).join('\n')).toContain('пустым')
  })

  it('ловит классовый селектор в shows — это не контракт компонента', () => {
    const bad: AnyFixture = {
      ...ok,
      cases: [{ id: 'open', title: 'Открыт', shows: ['.ds-combobox__list'] }],
    }
    expect(validateFixtures([bad]).join('\n')).toContain('класс системы')
  })

  it('на роли и aria-состоянии молчит', () => {
    const good: AnyFixture = {
      ...ok,
      cases: [{ id: 'open', title: 'Открыт', shows: ['[role="listbox"]', '[aria-expanded="true"]'] }],
    }
    expect(validateFixtures([good])).toEqual([])
  })

  // `nodes` (JIG-42) — адрес узлов по роли, не утверждение. Проверяется
  // только объявление: держится ли адрес, спрашивает `scripts/case-states.mjs`
  // через `window.jig.nodes()` в настоящем кадре.
  it('ловит пустой nodes — адрес ни о чём', () => {
    const bad: AnyFixture = { ...ok, cases: [{ id: 'base', title: 'База', nodes: {} }] }
    expect(validateFixtures([bad]).join('\n')).toContain('nodes объявлен пустым')
  })

  it('ловит пустой селектор роли', () => {
    const bad: AnyFixture = { ...ok, cases: [{ id: 'base', title: 'База', nodes: { port: '  ' } }] }
    expect(validateFixtures([bad]).join('\n')).toContain('пустой селектор у роли «port»')
  })

  it('роли нет в словаре — ошибка и в рантайме', () => {
    const bad: AnyFixture = {
      ...ok,
      cases: [{ id: 'base', title: 'База', nodes: { prot: '.x' } as unknown as Record<string, string> }],
    }
    expect(validateFixtures([bad]).join('\n')).toContain('роли «prot» нет в словаре NODE_ROLES')
  })

  it('класс системы в nodes законен, уточнитель законен', () => {
    const good: AnyFixture = {
      ...ok,
      cases: [
        {
          id: 'base',
          title: 'База',
          nodes: { port: '.ds-eventcal__grid', 'toggle-date': '.ds-datepicker__btn' },
        },
      ],
    }
    expect(validateFixtures([good])).toEqual([])
  })

  it('тип: опечатка в базе роли не компилируется', () => {
    const bad: AnyFixture = {
      ...ok,
      cases: [
        {
          id: 'base',
          title: 'База',
          // @ts-expect-error — опечатка в базе роли не компилируется
          nodes: { prot: '.x' },
        },
      ],
    }
    void bad
  })

  it('сходимость словаря и регулярки: база и уточнитель каждой роли законны', () => {
    for (const k of Object.keys(NODE_ROLES)) {
      expect(validateFixtures([{ ...ok, cases: [{ id: 'base', title: 'База', nodes: { [k]: '.x' } }] }])).toEqual([])
      expect(
        validateFixtures([{ ...ok, cases: [{ id: 'base', title: 'База', nodes: { [`${k}-a`]: '.x' } }] }]),
      ).toEqual([])
    }
  })
})

// Границы гейта (Step 3, DS-63) — чего он НЕ ловит, чтобы следующий не
// решил, что он закрывает все связки:
//
// 1. Начинки из адреса кадра (`?s.cell=…`) — появляются в рантайме, гейт
//    видит только то, что записано в фикстурах. Их отказы объясняет сам кадр
//    словами (workbench/frame-app.tsx, Task 3), а не этот гейт.
// 2. Текстовые начинки `{ text: '…' }` — с Step 0 выше это уже не «не ловит»,
//    а «ловит и запрещает». Запрет временный: он снимается вместе с
//    поддержкой в панели и кадре, а не когда кто-то решит, что мешает.
// 3. Рендер. Гейт проверяет, что ссылка РАЗРЕШИМА (фикстура и кейс
//    существуют, вид подходит позиции) — не что начинка нарисовалась.
//    Связку, разрешимую и невидимую (нулевая высота, `display:none` у
//    родителя), он пропустит молча. На это глаза и `make measure`, не гейт.

describe('фикстуры репозитория', () => {
  const all = Object.values(shipped).map((m) => m.default)

  // Без этого утверждения тест зелен и на пустом списке — способ №3 из
  // CLAUDE.md, «неопровержимое утверждение».
  it('в репозитории есть хотя бы одна фикстура', () => {
    expect(all.length).toBeGreaterThan(0)
  })

  it('все проходят проверку состава', () => {
    expect(validateFixtures(all)).toEqual([])
  })

  /**
   * `name` фикстуры СОВПАДАЕТ С ИМЕНЕМ ФАЙЛА, и это не косметика.
   *
   * Адрес кадра — имя ФАЙЛА: `workbench/registry.ts` резолвит `loadFixture`
   * через `nameOf(path)`, а `kinds-plugin` строит карту видов обходом каталога.
   * Поле `name` при этом читают другие: `workbench/shows-plan.ts` кладёт его в
   * `c` — то есть прямо в адрес `/frame.html?c=<Имя>`, по которому `make
   * states` идёт проверять `shows`.
   *
   * Значит расхождение даёт адрес, которого нет: `shows-plan` печатает
   * `c: 'Card'`, `loadFixture('Card')` возвращает `null`, и утверждения `shows`
   * такой фикстуры не проверяются вовсе. Обе стороны при этом выглядят
   * работающими — карта видов полна, фикстура импортируется, тайпчек чист.
   *
   * Поймано на волне 7 (DS-127): `Form/Form.fixture.tsx` был написан с
   * `name: 'Card'`, потому что экспортирует он `Card` и `FormRow`, а секция
   * каталога зовётся `## Card`. На 68 фикстурах это было единственное
   * расхождение — то есть инвариант держался у 67 авторов подряд и не был
   * записан нигде.
   *
   * МУТАЦИЯ ПРОГНАНА 04.09.2026: возврат `name: 'Card'` в `Form.fixture.tsx`
   * — ровно то состояние, на котором гейт и понадобился, — даёт красный с
   * названными обеими сторонами («Form.fixture.tsx объявляет name: 'Card'»).
   * Проверялась именно та мутация, ради которой гейт написан, а не выдуманная
   * рядом.
   */
  it('name фикстуры совпадает с именем файла — иначе адрес кадра ведёт в никуда', () => {
    const wrong = Object.entries(shipped)
      .map(([path, m]) => ({
        file: path.split('/').pop()!.replace('.fixture.tsx', ''),
        name: m.default.name,
      }))
      .filter(({ file, name }) => file !== name)
      .map(({ file, name }) => `${file}.fixture.tsx объявляет name: '${name}'`)
    expect(
      wrong,
      'адрес кадра берётся из имени файла, а shows-plan — из name:'
        + ' расхождение делает утверждения shows непроверяемыми',
    ).toEqual([])
  })

  // `group` — открытая строка в типе, и это намеренно: синтетические фикстуры
  // гейта и верстака называют группу как попало («G», «Test»), их таксономия
  // никого не касается. Закрыт СОСТАВ репозитория, а не тип: до этого гейта
  // рядом жили 'Data' ×3 и 'Данные' ×3 — одна группа, записанная двумя
  // словами. Поле сейчас никто не рисует (панель его только возит через
  // протокол), поэтому расхождение ничего не ломало и заметить его было
  // нечем — ровно тот случай, когда дефект дожидается, пока на него посмотрят.
  //
  // «Раскладка» добавлена шестой (DS-127) и не является ослаблением
  // гейта: Box, Stack и Grid не отображают ничего своего, ничем не управляют и
  // никуда не ведут — они меняют поведение ЧУЖИХ детей. Уложить их в
  // «Отображение» значило бы назвать группой то, что группой не является, и
  // закрытый набор перестал бы что-либо утверждать с первого же примитива.
  // Набор растёт РЕШЕНИЕМ, записанным здесь, а не тем, что кто-то напечатал в
  // фикстуре, — в этом и весь смысл того, что он закрыт.
  const GROUPS = ['Данные', 'Отображение', 'Управление', 'Навигация', 'Оверлеи', 'Раскладка']

  it('группа фикстуры — из закрытого набора, а не как записалось', () => {
    const strays = all.filter((f) => !GROUPS.includes(f.group))
    expect(
      strays.map((f) => `${f.name}: «${f.group}» — не из ${GROUPS.join(' / ')}`),
    ).toEqual([])
  })

  /**
   * `frame` снят из контракта (DS-91) — и снят так, что старая запись
   * ЛОМАЕТ КОМПИЛЯЦИЮ, а не деградирует. До этого поле было объявлено и не
   * читалось никем: автор фикстуры задавал размер кадра, получал зелёный
   * тайпчек и ничего больше.
   *
   * Проверка держится на `@ts-expect-error` и работает В ОБЕ СТОРОНЫ, поэтому
   * она здесь, а не в прозе: пока `frame` запрещён — директива обязательна и
   * молчит; как только поле вернут в тип — директива станет ЛИШНЕЙ, и `tsc`
   * покраснеет на ней самой («Unused '@ts-expect-error' directive»). То есть
   * гейт стоит и против возврата поля, и против того, чтобы эта проверка
   * тихо перестала что-либо утверждать.
   *
   * Красит `npm run typecheck`, не `vitest`: предмет — тип, а не поведение.
   */
  it('снятое поле frame — ошибка компиляции, а не молчание', () => {
    const withFrame: AnyFixture = {
      ...ok,
      // @ts-expect-error DS-91: размер кадра — инструмент человека,
      // сцена оверлея уже сделана тем, что кадр это <iframe>.
      frame: { width: 900, scene: 'fixed-overlay' },
    }
    // Значение всё же используется: иначе `noUnusedLocals` погасил бы
    // объявление раньше, чем до него дошла проверка типа.
    expect(withFrame.name).toBe('Alpha')
  })
})
