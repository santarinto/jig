/**
 * Вкладки. `kind: 'block'` — занимают ширину области, начинкой чужой ячейки не
 * бывают.
 *
 * Позиция `trailing` (конец бара, обычно кнопка «+») объявлена слотом: это
 * настоящая свободная позиция компонента, а не выдуманная под верстак.
 *
 * Что здесь нельзя увидеть поодиночке:
 *  - `count` озвучивается, а `icon` — нет. Оба стоят у подписи, оба выглядят
 *    как «украшение вкладки», и различие между ними живёт в дереве
 *    доступности, а не в кадре. Решение противоположное намеренно: число
 *    записей иначе не узнать, а смысл статуса обязан нести текст.
 *  - крестик закрытия — ОТДЕЛЬНАЯ кнопка рядом с вкладкой, а не внутри неё.
 *    Глазами это одно и то же место; разница в том, что вложенная
 *    интерактивность дала бы невалидный HTML и лишний таб-стоп на каждую
 *    вкладку. Считает их вкладка «Таб-стопы», а не глаз.
 */
import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Tabs, type Tab, type TabOverflow, type TabPosition } from './Tabs.js'
import { TabPanel } from './TabPanel.js'

const POSITIONS: TabPosition[] = ['top', 'bottom', 'left', 'right']
const OVERFLOW: TabOverflow[] = ['scroll', 'menu']

/** Значок статуса. Декоративен: смысл несёт подпись, не он. */
const DOT = (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <circle cx="5" cy="5" r="4" fill="currentColor" />
  </svg>
)

const BASE: Tab[] = [
  { id: 'all', label: 'Все', count: 128 },
  { id: 'work', label: 'В работе', count: 12, icon: DOT },
  { id: 'done', label: 'Готово', count: 0 },
  { id: 'archive', label: 'Архив', disabled: true },
]

const MANY: Tab[] = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i}`,
  label: `Документ № ${i + 1}`,
  closable: i > 0,
}))

/**
 * Набор под перестановку. БЕЗ крестиков намеренно: случай про порядок, и
 * закрываемость рядом с ним читалась бы как часть перестановки. Четыре штуки —
 * ровно чтобы шаг вправо и шаг влево были видны и не упирались в край.
 */
const ORDER: Tab[] = [
  { id: 'o1', label: 'Первая' },
  { id: 'o2', label: 'Вторая' },
  { id: 'o3', label: 'Третья' },
  { id: 'o4', label: 'Четвёртая' },
]

/**
 * Вкладки — управляемый компонент: без состояния переключения не увидеть, а
 * фикстура обязана показывать то, чем компонент является, а не его снимок.
 */
function Live({
  tabs,
  position,
  overflow,
  trailing,
  closable,
  reorder,
}: {
  tabs: Tab[]
  position: TabPosition
  overflow: TabOverflow
  trailing?: React.ReactNode
  closable?: boolean
  reorder?: boolean
}) {
  const [list, setList] = useState(tabs)
  const [sel, setSel] = useState(tabs[0]!.id)
  const shown = closable ? list.map((t, i) => ({ ...t, closable: i > 0 })) : list
  return (
    <div className={`ds-tabs-layout ds-tabs-layout--${position}`}>
      <Tabs
        id="wb-tabs"
        tabs={shown}
        selectedId={sel}
        onSelect={setSel}
        position={position}
        overflow={overflow}
        trailing={trailing}
        onReorder={
          // Проп функциональный, крутилкой не выражается — её дело включить
          // его, а собрать обязана фикстура. `undefined`, а не пустой
          // обработчик: перестановку компонент включает по НАЛИЧИЮ пропа, и
          // заглушка дала бы драг и Ctrl+стрелку, которые ничего не двигают.
          reorder
            ? (ids) => setList((cur) => ids.map((id) => cur.find((t) => t.id === id)!))
            : undefined
        }
        onClose={(id) => {
          const rest = list.filter((t) => t.id !== id)
          setList(rest)
          if (id === sel && rest[0]) setSel(rest[0].id)
        }}
      />
      <TabPanel tabsId="wb-tabs" selectedId={sel}>
        Содержимое вкладки «{shown.find((t) => t.id === sel)?.label ?? '—'}».
      </TabPanel>
    </div>
  )
}

interface Props {
  tabs: Tab[]
  position: TabPosition
  overflow: TabOverflow
  closable: boolean
  reorder: boolean
}

export default defineFixture<Props>({
  name: 'Tabs',
  group: 'Навигация',
  kind: 'block',

  props: { tabs: BASE, position: 'top', overflow: 'scroll', closable: false, reorder: false },

  controls: {
    position: { kind: 'enum', values: POSITIONS, prop: true },
    overflow: { kind: 'enum', values: OVERFLOW, prop: true },
    closable: { kind: 'bool', prop: true },
    // `prop: false` — не оговорка, а правда: `onReorder` принимает функцию, и
    // крутилка ей не является. Она включает перестановку, а обработчик строит
    // `Live`; сниппет такую крутилку не печатает и говорит, что не напечатал.
    reorder: { kind: 'bool', prop: false },
  },

  data: {
    many: { tabs: MANY, closable: true },
    one: { tabs: BASE.slice(0, 1) },
    /**
     * Одна вкладка, И ОНА ЗАКРЫВАЕМАЯ. Единственный адрес, с которого
     * достижим край «закрыта последняя оставшаяся»: соседней вкладки нет,
     * полосы после закрытия не остаётся, и видно, куда девается фокус.
     *
     * `closable: false` здесь обязателен, а не для симметрии. Набор данных
     * ложится ПОВЕРХ пропсов кейса (`workbench/resolve-case.ts`), и на
     * `case=closable` включённая крутилка переписала бы `closable` по правилу
     * `i > 0` — то есть набор, заведённый ради закрываемой одиночки, отдал бы
     * незакрываемую, и адрес выглядел бы рабочим.
     */
    'one-closable': { tabs: [{ ...BASE[0]!, closable: true }], closable: false },
    // Все вкладки недоступны: роуминг-фокусу некуда встать — состояние
    // законное и обычно забытое.
    'all-disabled': { tabs: BASE.map((t) => ({ ...t, disabled: true })) },
  },

  slots: {
    trailing: {
      title: 'Конец бара',
      accepts: 'inline',
      prop: 'trailing',
      note:
        'Сюда потребитель кладёт кнопку «+». Позиция живёт В БАРУ, рядом с ' +
        'вкладками: слишком высокая начинка растянет бар и разъедет ряд, а ' +
        'интерактивная — встанет в порядок фокуса ПОСЛЕ вкладок, но ДО панели.',
    },
  },

  cases: [
    {
      id: 'base',
      title: 'Обычные',
      note:
        'Счётчик «Готово: 0» показан, а не спрятан: ноль — содержательный ' +
        'ответ, спрятанный счётчик читается как «не считали». Архив недоступен ' +
        'и пропускается стрелками.',
    },
    {
      id: 'count-vs-icon',
      title: 'Счётчик озвучен, значок — нет',
      note:
        'Обе вкладки выглядят одинаково «украшенными»: у левой число, у правой ' +
        'точка. Число уходит в доступное имя, точка помечена aria-hidden — ' +
        'узнать количество иначе нельзя, а смысл статуса обязан нести текст ' +
        'подписи. Различие целиком в дереве доступности: кадр их не отличает, ' +
        'вкладка axe и прицел отличают.',
      render: (p) => (
        <Live
          tabs={[
            { id: 'a', label: 'В работе', count: 12 },
            { id: 'b', label: 'В работе', icon: DOT },
          ]}
          position={p.position}
          overflow={p.overflow}
        />
      ),
    },
    {
      id: 'closable',
      title: 'Крестик — сосед, а не начинка',
      note:
        'Закрываемые вкладки: крестик стоит РЯДОМ с вкладкой отдельной кнопкой. ' +
        'Внутри неё он дал бы вложенную интерактивность — невалидный HTML и ' +
        'лишний таб-стоп на каждую вкладку, то есть десять открытых форм = ' +
        'двадцать нажатий Tab. Глазами оба устройства выглядят одинаково; ' +
        'считает их вкладка «Таб-стопы».',
      props: { tabs: MANY, closable: true },
    },
    {
      id: 'overflow',
      title: 'Не влезают: прокрутка или меню',
      note:
        'Четырнадцать вкладок в узком баре. scroll даёт стрелки по краям, menu — ' +
        'кнопку «⋯» со списком. Выбор не косметический: со стрелками вкладка ' +
        'остаётся в баре и её видно, из меню она пропадает с глаз, зато ' +
        'находится по имени. Смотреть надо на УЗКОМ кадре — на широком оба ' +
        'режима выглядят одинаково, потому что переполнения нет.',
      props: { tabs: MANY, overflow: 'menu' },
    },
    {
      id: 'reorder',
      title: 'Перестановка: Ctrl+стрелка и перетаскивание',
      note:
        'Единственное место компонента, где фокус переносится ИМПЕРАТИВНО: ' +
        'после Ctrl+→ вкладка уезжает на шаг, и фокус обязан уехать за ней, а ' +
        'не остаться на позиции. Проверяется нажатием, а не глазом — кадр до и ' +
        'после отличается только порядком подписей. Мышью то же самое: ' +
        'потянуть вкладку и бросить между соседями. Без пропа onReorder ' +
        'Ctrl+стрелка не делает НИЧЕГО (и не выбирает соседнюю вкладку), ' +
        'поэтому случай нужен отдельный: на всех прочих ветка не исполняется.',
      props: { tabs: ORDER, reorder: true },
    },
    {
      id: 'position',
      title: 'Бар сбоку',
      note:
        'position управляет только баром; раскладку бар↔панель даёт обёртка ' +
        '.ds-tabs-layout. При left/right бар вертикальный, роуминг переезжает ' +
        'со стрелок ←/→ на ↑/↓ — это заявлено через aria-orientation, и ' +
        'клавиатура обязана следовать за видом, иначе вид врёт.',
      props: { position: 'left' },
    },
    {
      id: 'trailing',
      title: 'Кнопка в конце бара',
      note:
        'Свободная позиция заполнена начинкой из данных случая. Обратите ' +
        'внимание на порядок фокуса: кнопка встаёт после вкладок, но до панели. ' +
        'Смотреть надо и на УЗКОМ кадре: начинка тут нарочно толстая (квадратная ' +
        'кнопка плюс обычная), и на 360 при шкале 1.5 она вместе с лентой в бар ' +
        'не помещается — видно, кто кому уступает. Уступает КОРОБКА слота: у ' +
        'ленты пол 6rem, и первая вкладка обязана быть видна целиком, а не ' +
        'обрезанным «Все 12» (DS-236).',
      slots: { trailing: { c: 'Button', case: 'iconOnly' } },
    },
  ],

  render: (p, slots) => (
    <Live
      tabs={p.tabs}
      position={p.position}
      overflow={p.overflow}
      closable={p.closable}
      reorder={p.reorder}
      trailing={slots.trailing ?? null}
    />
  ),
})
