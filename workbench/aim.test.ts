import { describe, it, expect, afterEach } from 'vitest'
import { aimChainOf, aimTargetOf, describeNode, labelShiftOf } from './aim.js'
import { SPOT_ATTR } from './canvas-plan.js'

/**
 * Узел из разметки — как он приходит из щелчка по превью.
 *
 * `<template>`, а не `<div>`: разбор внутри `div` выбрасывает `<td>` (вне
 * таблицы он невалиден), а прицел по ячейке таблицы — основной сценарий,
 * ради которого он вообще заведён.
 */
const node = (html: string): Element => {
  const t = document.createElement('template')
  t.innerHTML = html
  return t.content.firstElementChild!
}

describe('describeNode', () => {
  it('тег и классы — то, что человек ищет в CSS системы', () => {
    expect(describeNode(node('<button class="ds-btn ds-btn--primary"></button>'))).toBe(
      'button.ds-btn.ds-btn--primary',
    )
  })

  it('голый тег остаётся голым тегом, а не превращается в пустоту', () => {
    expect(describeNode(node('<td></td>'))).toBe('td')
  })

  it('id печатается — по нему узел и опознают, если он есть', () => {
    expect(describeNode(node('<div id="root" class="ds-card"></div>'))).toBe('div#root.ds-card')
  })

  it('НИ ОДИН класс не выбрасывается — длинный список печатается целиком', () => {
    // До 30.08.2026 здесь стояла обрезка до трёх классов с `+N`. Она резала
    // ХВОСТ цепочки, а в BEM хвост — это модификатор, то есть ровно то
    // единственное, что различает соседей. Настоящие узлы системы: `Avatar`
    // с `presence` даёт ЧЕТЫРЕ класса
    // (`ds-avatar ds-avatar--md ds-avatar--neutral ds-avatar--presence-busy`),
    // `Button` с `tone` и `iconOnly` — ПЯТЬ. Четыре аватара в одном кадре
    // получали одно имя на всех, и `+1` прятал единственное различие — то
    // есть шаг 6 воспроизводил дефект, ради которого заведён.
    //
    // «Оставить первый и последний» не спасает: у пятиклассовой кнопки
    // различает `ds-btn--tone-error`, а он предпоследний. Любой порог режет
    // не то, потому что различающий класс не стоит на фиксированном месте.
    //
    // Длина при этом никуда не девается — она никогда и не была здесь
    // предметом: строку обрезает тулбар (`.wb__aim-node`), а обрезка тулбара
    // ВОЗВРАТНА — целое имя лежит в `title` и на бейдже над узлом, который не
    // обрезается ничем. `+N` был необратим и портил обе эти отдушины.
    expect(describeNode(node('<i class="a b c d e"></i>'))).toBe('i.a.b.c.d.e')
  })

  it('четыре аватара с разным присутствием РАЗЛИЧИМЫ — то, ради чего порог снят', () => {
    // Классы взяты у настоящего `Avatar` (src/components/Avatar/Avatar.tsx:66):
    // блок, размер, тон, присутствие. С порогом 3 все четыре имени совпадали.
    const av = (presence: string) =>
      describeNode(node(`<span class="ds-avatar ds-avatar--md ds-avatar--neutral ds-avatar--presence-${presence}"></span>`))
    const names = ['busy', 'offline', 'online', 'away'].map(av)
    expect(new Set(names).size).toBe(4)
    expect(names[0]).toContain('ds-avatar--presence-busy')
  })

  it('пятиклассовая кнопка не теряет тон — он не последний и не третий', () => {
    // `Button` с `tone` и `iconOnly` (src/components/Button/Button.tsx:84-88).
    // `ds-btn--tone-error` отличает опасную кнопку от обычной рядом в колонке
    // действий; и порог 3, и «первый плюс последний» его теряют.
    expect(
      describeNode(node('<button class="ds-btn ds-btn--ghost ds-btn--sm ds-btn--tone-error ds-btn--icon"></button>')),
    ).toBe('button.ds-btn.ds-btn--ghost.ds-btn--sm.ds-btn--tone-error.ds-btn--icon')
  })

  it('служебные классы верстака в имя не попадают', () => {
    // Прицеливаются в компонент, а не в инструмент. Попади сюда `wbf-*` —
    // имя менялось бы от того, что мы сами же на узел и повесили.
    expect(describeNode(node('<div class="wbf-states__box ds-table"></div>'))).toBe('div.ds-table')
  })
})

/**
 * Место впереди имени (DS-128, шаг 6).
 *
 * Собирается настоящее дерево с обёрткой места, а не подставляется атрибут на
 * сам узел: `describeNode` ходит `closest`, и проверка на самом узле прошла бы
 * и при сломанном подъёме по предкам — то есть ровно в том случае, ради
 * которого всё это написано (прицеливаются В ГЛУБИНУ компонента, а место —
 * его обёртка).
 */
const inSpot = (id: string, inner: string, pick: string): Element => {
  const t = document.createElement('template')
  t.innerHTML = `<div ${SPOT_ATTR}="${id}"><table><tbody><tr>${inner}</tr></tbody></table></div>`
  const el = t.content.querySelector(pick)
  if (!el) throw new Error(`в разметке места нет узла ${pick}`)
  return el
}

describe('describeNode на канвасе', () => {
  it('имя места стоит ПОСЛЕ узла — обрезается хвост, и в хвосте обязана быть не суть', () => {
    // Строка обрезается по 18rem в тулбаре (`.wb__aim-node`, ellipsis), то
    // есть теряется ХВОСТ. Значит вопрос не «что важнее», а «что положить под
    // нож». Модификатор в конце цепочки классов (`.is-active`) — единственное,
    // что отличает выбранный узел от девяти соседей с теми же классами, и он
    // и был первым на выброс, пока место стояло впереди. Имя места в хвосте
    // теряется без потери: оно же нарисовано целиком на бейдже над самим узлом
    // (`.wbf-aim__label` не обрезается ничем) — замер владельца, 30.08.2026.
    expect(describeNode(inSpot('table', '<td class="ds-table__lead"></td>', 'td'))).toBe(
      'td.ds-table__lead в «table»',
    )
  })

  it('модификатор стоит раньше имени места — то, что первым уходит под обрезку', () => {
    // Тот самый случай владельца: `button.ds-pager__btn.is-active` — 40 знаков
    // из 40 доступных. Проверка утверждает не длину (её держит санитар), а
    // ПОРЯДОК: модификатор обязан стоять левее имени места, иначе обрезка
    // съест сначала его.
    const el = inSpot('pages', '<td><button class="ds-pager__btn is-active"></button></td>', 'button')
    const name = describeNode(el)
    expect(name).toBe('button.ds-pager__btn.is-active в «pages»')
    expect(name.indexOf('.is-active')).toBeLessThan(name.indexOf('«pages»'))
  })

  it('ДВА МЕСТА С ОДНИМ КОМПОНЕНТОМ РАЗЛИЧИМЫ — то, ради чего шаг заведён', () => {
    // Спека: «`td.ds-table__lead` не отличить в двух таблицах подряд». Здесь
    // узлы одинаковы во всём, кроме места, и имена ОБЯЗАНЫ разойтись. Проверка
    // на одном месте этого не утверждает: она проходит и на префиксе-константе.
    const a = describeNode(inSpot('table', '<td class="ds-table__lead"></td>', 'td'))
    const b = describeNode(inSpot('table-2', '<td class="ds-table__lead"></td>', 'td'))
    expect(a).not.toBe(b)
    expect(a).toBe('td.ds-table__lead в «table»')
    expect(b).toBe('td.ds-table__lead в «table-2»')
  })

  it('вне канваса имя прежнее — одиночный кадр про места ничего не знает', () => {
    // Половина утверждения, без которой предыдущие проходят и на префиксе,
    // приклеенном всегда: в виде «Кадр» мест нет, и «место» там было бы ложью.
    expect(describeNode(node('<td class="ds-table__lead"></td>'))).toBe('td.ds-table__lead')
  })

  it('коробка самого места называется местом и тегом, а не одним местом', () => {
    // `closest` находит и сам узел. Это правда: ткнули в коробку места, а не в
    // компонент внутри, — и молчать об этом (««table»» без тега) значило бы
    // потерять разницу между «место» и «то, что в нём».
    const t = document.createElement('template')
    t.innerHTML = `<div ${SPOT_ATTR}="pages" class="wbf-canvas__spot"></div>`
    expect(describeNode(t.content.firstElementChild!)).toBe('div в «pages»')
  })
})

/**
 * Куда садится прицел (DS-128, находка [6] ручного QA).
 *
 * Щелчок по чёрной точке в колонке действий давал `circle в «table»` — и по
 * красной точке соседней кнопки ТО ЖЕ САМОЕ. В разметке это две разные кнопки
 * с `aria-label="Изменить"` и `aria-label="Удалить"`, но прицел садился на
 * `<circle aria-hidden="true">` внутри иконки: одно имя на две кнопки, и
 * навесить `:hover` на кнопку действия было нельзя вовсе — а это главный
 * сценарий для иконочной кнопки.
 */
describe('aimTargetOf', () => {
  const inTree = (html: string, sel: string): Element => {
    const t = document.createElement('template')
    t.innerHTML = html
    return t.content.querySelector(sel)!
  }

  it('узел внутри aria-hidden отдаёт ближайшего НЕ скрытого предка', () => {
    // Ровно разметка иконочной кнопки: <button><svg aria-hidden><circle/></svg></button>
    const circle = inTree(
      '<button class="ds-btn ds-btn--icon" aria-label="Удалить"><svg aria-hidden="true"><circle/></svg></button>',
      'circle',
    )
    expect(describeNode(aimTargetOf(circle)!)).toBe('button.ds-btn.ds-btn--icon')
  })

  it('две разные кнопки перестают давать одно имя', () => {
    const html =
      '<div>' +
      '<button class="ds-btn ds-btn--ghost" aria-label="Изменить"><svg aria-hidden="true"><circle id="a"/></svg></button>' +
      '<button class="ds-btn ds-btn--tone-error" aria-label="Удалить"><svg aria-hidden="true"><circle id="b"/></svg></button>' +
      '</div>'
    const a = describeNode(aimTargetOf(inTree(html, '#a'))!)
    const b = describeNode(aimTargetOf(inTree(html, '#b'))!)
    expect(a).not.toBe(b)
    expect(b).toContain('ds-btn--tone-error')
  })

  it('сам aria-hidden узел тоже не выбирается, а не только его потомок', () => {
    const caret = inTree('<td><svg class="ds-caret ds-caret--branch" aria-hidden="true"></svg></td>', 'svg')
    expect(describeNode(aimTargetOf(caret)!)).toBe('td')
  })

  it('обычный узел отдаётся как есть — правило не трогает то, что видно диктору', () => {
    const td = inTree('<table><tbody><tr><td class="ds-table__lead">Иванов</td></tr></tbody></table>', 'td')
    expect(aimTargetOf(td)).toBe(td)
  })

  it('aria-hidden="false" скрытым не считается — значение читается, а не наличие атрибута', () => {
    const span = inTree('<td><span aria-hidden="false" class="x"></span></td>', 'span')
    expect(describeNode(aimTargetOf(span)!)).toBe('span.x')
  })

  it('вложенные скрытые слои проходятся насквозь, а не на один уровень', () => {
    const c = inTree(
      '<button class="b"><span aria-hidden="true"><svg aria-hidden="true"><circle id="c"/></svg></span></button>',
      '#c',
    )
    expect(describeNode(aimTargetOf(c)!)).toBe('button.b')
  })

  it('всё дерево скрыто — прицел не садится никуда, а не садится куда попало', () => {
    const c = inTree('<div aria-hidden="true"><span id="c"></span></div>', '#c')
    expect(aimTargetOf(c)).toBeNull()
  })
})

describe('labelShiftOf', () => {
  it('влезает — не двигаем вовсе', () => {
    expect(labelShiftOf(10, 200, 768)).toBe(0)
  })

  it('впритык к правому краю — тоже не двигаем', () => {
    expect(labelShiftOf(568, 200, 768)).toBe(0)
  })

  it('вылезает — сдвиг ровно на вылезшее, ни пикселем больше', () => {
    // 700 + 200 = 900 при 768: лишние 132.
    expect(labelShiftOf(700, 200, 768)).toBe(-132)
  })

  it('сдвиг не уводит за ЛЕВЫЙ край — иначе тот же дефект зеркально', () => {
    // Бейдж шире кадра: прижать целиком некуда, упираемся в левый край.
    expect(labelShiftOf(50, 900, 768)).toBe(-50)
  })

  it('бейдж у самого левого края и шире кадра — сдвига нет, двигать некуда', () => {
    expect(labelShiftOf(0, 900, 768)).toBe(0)
  })

  it('отрицательный левый край (бейдж на -2px от рамки) не даёт положительного сдвига', () => {
    // `.wbf-aim__label` стоит на `inset-inline-start: -2px`, и у узла в самом
    // начале строки левый край уходит в минус. Сдвиг вправо здесь был бы
    // лечением несуществующего: он оторвал бы бейдж от своего узла.
    expect(labelShiftOf(-2, 100, 768)).toBe(0)
  })
})

/**
 * ЦЕПОЧКА ПРЕДКОВ (DS-128, находка [12] ручного QA).
 *
 * Щелчок отдаёт САМЫЙ ГЛУБОКИЙ узел под указателем, и потому целые классы
 * узлов недостижимы прицелом вовсе: `tr.is-clickable` целиком закрыт своими
 * `td`, корень компонента — своим содержимым, `div.ds-tabs-layout` — вкладками.
 * А это ровно те узлы, на которых состояние и живёт: наведение на СТРОКУ, а не
 * на ячейку.
 *
 * Дерево здесь настоящее, с коробкой места и хостом кадра: граница цепочки
 * проходит по узлам ИНСТРУМЕНТА, и проверка на голом фрагменте прошла бы и при
 * сломанной границе.
 */
const tree = (pick: string): Element => {
  const t = document.createElement('template')
  t.innerHTML =
    `<div class="wbf-canvas"><div ${SPOT_ATTR}="table" class="wbf-canvas__spot">` +
    '<div class="ds-table"><table class="ds-table__grid"><tbody>' +
    '<tr class="is-clickable"><td class="ds-table__lead">x</td></tr>' +
    '</tbody></table></div></div></div>'
  // В ДОКУМЕНТ, а не во фрагменте. У корня фрагмента `parentElement` равен
  // `null`, и проверка «подъём не уходит в body» на нём зелена ВСЕГДА — она
  // упиралась бы в отсутствие родителя, а не в границу инструмента. Поймано
  // мутацией: снятие самой границы кейс переживало.
  document.body.appendChild(t.content)
  const el = document.body.querySelector(pick)
  if (!el) throw new Error(`в разметке нет узла ${pick}`)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('цепочка предков прицела', () => {
  it('ведёт от узла к корню компонента, снизу вверх', () => {
    expect(aimChainOf(tree('td')).map(describeNode)).toEqual([
      'td.ds-table__lead в «table»',
      'tr.is-clickable в «table»',
      'tbody в «table»',
      'table.ds-table__grid в «table»',
      'div.ds-table в «table»',
    ])
  })

  it('НЕ поднимается в инструмент: коробки места и хоста в цепочке нет', () => {
    // Прицел заявлен как выбор узла компонента. Коробка места и хост кадра
    // принадлежат верстаку, и подъём в них увёл бы форс с предмета на
    // инструмент — тот же довод, по которому щелчок по служебному узлу
    // прицел не двигает.
    const chain = aimChainOf(tree('td'))
    expect(chain.some((el) => el.className.includes('wbf-'))).toBe(false)
  })

  it('на корне компонента цепочка из одного узла — выше некуда', () => {
    expect(aimChainOf(tree('div.ds-table'))).toHaveLength(1)
  })

  it('сам узел инструмента цепочки не даёт — иначе она уходит в body', () => {
    // Ткнуть в поле хоста мимо всех мест можно, и прицел туда садится
    // (`aimTargetOf` его не отвергает). Без отдельной проверки на САМ узел
    // подъём из хоста ушёл бы в `body` и `html`: они не наши по классу, а
    // предмет прицела на них кончился ещё ниже.
    expect(aimChainOf(tree('.wbf-canvas'))).toHaveLength(1)
  })

  it('коробка места сама себе цепочка, а не дверь в хост', () => {
    // Ткнуть в коробку места можно (`describeNode` её называет), но подъём из
    // неё вёл бы в `.wbf-canvas` — то есть в инструмент.
    expect(aimChainOf(tree(`[${SPOT_ATTR}]`))).toHaveLength(1)
  })
})
