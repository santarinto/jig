/**
 * КАКИЕ КРУТИЛКИ СЛУЧАЙ ПЕРЕКРЫВАЕТ (DS-164) — зондом, а не чтением
 * текста `render` и не объявлением в фикстуре.
 *
 * Дефект: случай со своим `render` пишет `<Live {...p} title="Парки" />`, и
 * крутилка `title` на нём мертва — но панель её показывает живой, а щелчок
 * пишется в адрес. Ссылка потом везёт значение, которое ничего не значит.
 *
 * ПОЧЕМУ ЗОНД. Разбор текста `render` — эвристика: спред после литерала,
 * вычисленное имя, обёртка-хелпер, и он врёт молча. Объявление в фикстуре —
 * второй экземпляр правды рядом с `render`, расходящийся на первой правке;
 * гейт к нему пришлось бы писать ТЕМ ЖЕ зондом. Значит, зонд и есть механизм.
 *
 * ЧТО ЗОНД УТВЕРЖДАЕТ. `render` — чистая функция пропов (гейт
 * `fixtures-render` зовёт её вне React, хуков в ней нет). Зовём её с базовыми
 * пропами случая и с каждым ДРУГИМ значением крутилки и сравниваем ВОЗВРАЩЁННЫЕ
 * ДЕРЕВЬЯ ЭЛЕМЕНТОВ — тип, ключ, пропы вглубь, компоненты НЕ монтируются.
 * Одинаковое дерево при любом значении значит: до того, что рисуется, значение
 * не доходит. Сравнивается то, что случай ПЕРЕДАЁТ, а не то, что компонент
 * рисует: `closeOnEscape` разметку не меняет, но в пропах `Drawer` виден.
 *
 * В КАКУЮ СТОРОНУ ОН ОШИБАЕТСЯ — только в «не знаю», то есть крутилка
 * остаётся живой. Погасить живую хуже, чем не погасить мёртвую: первое отнимает
 * контрол, второе оставляет прежнее поведение.
 * - Функции сравниваются ТОЖДЕСТВОМ. Два вызова с одинаковыми пропами, давшие
 *   разные деревья (стрелка в `onClick`, `new Date()`), — зонд молчит о случае
 *   целиком (`null`): замыкание может нести значение, и заглянуть в него нечем.
 * - Не-простые объекты (`Date`, `Map`, экземпляры) — тоже тождеством: у `Date`
 *   нет своих ключей, и поключевое сравнение сочло бы любые две даты равными.
 * - Бросок на любом значении — крутилка живая.
 * - ЗАВИСИМОСТЬ ОТ СОСЕДА. `afterDays` мёртв, пока не задан порог, и оживает,
 *   когда его подвинут. Поэтому «перекрыта» — только если дерево не зависит от
 *   крутилки и на базе, и при сдвиге КАЖДОЙ другой крутилки на каждое её
 *   значение. Попарно, не полным перебором: тройные зависимости не ловятся, и
 *   это сказано здесь, а не спрятано.
 *
 * Перебор значений: `bool` и `enum` — исчерпывающе; `number` — края `min` и
 * `max`; `text` — пустая строка и базовая с приписанным хвостом. Для чисел и
 * текста это выборка: `p.count > 5 ? a : b` на двух краях по разные стороны
 * порога различится, а на одной — нет. Цена замера на всём каталоге — 0.3 с на
 * 387 случаев, то есть на фикстуру единицы миллисекунд.
 */
import { isValidElement } from 'react'
import type { AnyFixture, Control } from '../src/internal/fixture.js'

type Case = AnyFixture['cases'][number]
type Props = Record<string, unknown>

const plain = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === Array.prototype || proto === null
}

/** Структурное равенство деревьев, которые вернул `render`. См. шапку. */
export function sameTree(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true
  // Глубже — не сравниваем, а говорим «разные»: это сторона «не знаю».
  if (depth > 64) return false
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (isValidElement(a) || isValidElement(b)) {
    if (!isValidElement(a) || !isValidElement(b)) return false
    return a.type === b.type && a.key === b.key && sameTree(a.props, b.props, depth + 1)
  }
  if (!plain(a) || !plain(b)) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(
    (k) => Object.prototype.hasOwnProperty.call(b, k) && sameTree((a as Props)[k], (b as Props)[k], depth + 1),
  )
}

/** Значения крутилки, отличные от `current`. Пусто — сдвинуть не на что. */
export function otherValues(control: Control, current: unknown): unknown[] {
  switch (control.kind) {
    case 'bool':
      return [!current]
    case 'enum':
      return control.values
        .map((v) => (control.numeric ? Number(v) : v))
        .filter((v) => !Object.is(v, current))
    case 'number':
      return [...new Set([control.min, control.max])].filter((v) => !Object.is(v, current))
    case 'text': {
      const s = String(current ?? '')
      return s === '' ? ['зонд'] : ['', `${s}·зонд`]
    }
  }
}

/**
 * Имена крутилок, которые случай перекрывает, в порядке `controls`.
 * `null` — зонд не может ответить (случай рисует недетерминированно или
 * бросает на базе): про такой случай панель молчит, крутилки живые.
 */
export function overriddenControls(fx: AnyFixture, c: Case): string[] | null {
  const draw = c.render ?? fx.render
  if (!draw) return null
  const call = (p: Props): { ok: true; tree: unknown } | { ok: false } => {
    try {
      return { ok: true, tree: draw(p as never, {}) }
    } catch {
      return { ok: false }
    }
  }

  const base: Props = { ...fx.props, ...c.props }
  const first = call(base)
  const again = call(base)
  if (!first.ok || !again.ok || !sameTree(first.tree, again.tree)) return null

  const controls = Object.entries(fx.controls).filter(
    (e): e is [string, Control] => e[1] !== undefined,
  )
  // Опорные точки: база и база со сдвигом одной соседней крутилки.
  const around = (name: string): Props[] => [
    base,
    ...controls
      .filter(([other]) => other !== name)
      .flatMap(([other, oc]) => otherValues(oc, base[other]).map((v) => ({ ...base, [other]: v }))),
  ]

  const out: string[] = []
  for (const [name, control] of controls) {
    const values = otherValues(control, base[name])
    if (values.length === 0) continue
    const dead = around(name).every((at) => {
      const ref = at === base ? first : call(at)
      // Соседняя точка, где случай не рисуется вовсе, свидетельств не даёт ни
      // в какую сторону — пропускаем её. Бросок на сдвиге САМОЙ крутилки
      // (ниже) — другое: значение до рисунка дошло, крутилка живая.
      if (!ref.ok) return true
      return values.every((v) => {
        const moved = call({ ...at, [name]: v })
        return moved.ok && sameTree(ref.tree, moved.tree)
      })
    })
    if (dead) out.push(name)
  }
  return out
}
