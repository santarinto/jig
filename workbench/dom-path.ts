/**
 * Путь до узла внутри копии и обратно — по индексам детей.
 *
 * Зачем. В режиме «Состояния» четыре копии рисуют ОДНО И ТО ЖЕ дерево с одними
 * пропсами, отличаясь только атрибутом форса. Прицел выбирает узел в ОДНОЙ из
 * них, а сравнивать тон надо во всех четырёх — значит нужен способ сказать
 * «тот же самый узел в соседней копии».
 *
 * ПО ИНДЕКСАМ, А НЕ СЕЛЕКТОРОМ, и это не лень: селектор пришлось бы делать
 * уникальным (`:nth-child` до корня — то же самое, только строкой и с
 * разбором), а на классах он находил бы В ЛУЧШЕМ СЛУЧАЕ первый подходящий
 * узел — то есть в таблице всегда первую строку, какую бы ни выбрали.
 *
 * Путь ЧЕСТНО ЛОМАЕТСЯ, если деревья разошлись: `nodeAt` возвращает `null`, а
 * не «что-нибудь похожее». Разойтись они могут — состояние вправе изменить
 * разметку, а не только цвет (`:hover` с `content` в `::after` не в счёт, а
 * вот компонент, который под форсом рисует лишний узел, — да). Молчаливая
 * подмена соседом дала бы полосу, сравнивающую разные узлы и уверенно
 * печатающую «= покой».
 */

/** Индексы детей от корня к узлу. `null` — узел не внутри корня. */
export function pathOf(root: Element, node: Element): number[] | null {
  const path: number[] = []
  let cur: Element | null = node
  while (cur && cur !== root) {
    const parent: Element | null = cur.parentElement
    if (!parent) return null
    path.push(Array.prototype.indexOf.call(parent.children, cur))
    cur = parent
  }
  return cur === root ? path.reverse() : null
}

/** Узел по пути — или `null`, если дерево короче/другое. */
export function nodeAt(root: Element, path: number[]): Element | null {
  let cur: Element = root
  for (const i of path) {
    const next = cur.children[i]
    if (!next) return null
    cur = next
  }
  return cur
}
