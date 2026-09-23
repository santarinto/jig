/**
 * Боковая шторка. `kind: 'block'`.
 *
 * Как и `Modal`, открытое состояние — ДРУГОЕ ДЕРЕВО: содержимое уезжает в
 * портал на `document.body`, а закрытая шторка не оставляет в DOM ничего.
 * Сцены кадру для этого не нужно: кадр сам по себе `<iframe>`, и подложка
 * кроет его, а не оболочку верстака (`src/internal/fixture.ts`, снятое поле
 * `frame`).
 *
 * Чем шторка отличается от окна — не размером и не стороной. Окно прерывает:
 * пока оно открыто, работать больше не с чем. Шторка тоже модальна (ловушка
 * фокуса, `aria-modal`, изоляция фона), но её содержимое — ПРОДОЛЖЕНИЕ
 * страницы: фильтры к таблице, карточка выбранной строки, лог операции. Если
 * содержимое требует ответа «да/нет» — это `Modal`; если оно про то, что и так
 * на экране, — шторка.
 */
import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Drawer } from './Drawer.js'
import { Button } from '../Button/Button.js'
import { KeyValueList } from '../KeyValueList/KeyValueList.js'
import { Tree, type TreeNode } from '../Tree/Tree.js'

interface Props {
  title: string
  side: 'left' | 'right' | 'bottom'
  closeOnBackdrop: boolean
  closeOnEscape: boolean
  withFooter: boolean
}

const DETAILS = [
  { id: 'no', label: 'Номер', value: 'ТК-00417' },
  { id: 'date', label: 'Дата', value: '14.08.2026' },
  { id: 'party', label: 'Контрагент', value: 'ООО «Автопарк-Юг»' },
  { id: 'sum', label: 'Сумма', value: '184 200,00 ₽' },
  { id: 'state', label: 'Статус', value: 'Проведён' },
]

/**
 * Дерево парков для ЛЕВОЙ шторки. Карточка документа там стояла бы не на
 * месте: слева в системе живёт навигация, и левая шторка — про уточнение
 * выбора, а не про ответ на вопрос. Пока внутри лежал тот же `KeyValueList`,
 * что и справа, имя случая обещало дерево и фильтры, а кадр показывал карточку
 * — то есть сторона выглядела настройкой вида, хотя она про предмет.
 */
const FLEET: TreeNode[] = [
  {
    id: 'all',
    label: 'Все парки',
    children: [
      {
        id: 'south',
        label: 'Автопарк-Юг',
        children: [
          { id: 'south-1', label: 'Колонна №1' },
          { id: 'south-2', label: 'Колонна №2' },
        ],
      },
      {
        id: 'north',
        label: 'Автопарк-Север',
        children: [{ id: 'north-1', label: 'Колонна №1' }],
      },
    ],
  },
]

const FOOTER = (
  <>
    <Button variant="ghost">Отмена</Button>
    <Button variant="primary">Сохранить</Button>
  </>
)

/**
 * Шторка управляема: `open` + `onClose` — весь её контракт. Кнопка рядом нужна
 * не для полноты картины, а чтобы было видно возврат фокуса: закрыв шторку,
 * фокус обязан оказаться там, откуда её открыли.
 */
function Live({
  title, side, closeOnBackdrop, closeOnEscape, withFooter, startOpen = false, children,
}: Props & { startOpen?: boolean; children?: React.ReactNode }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Открыть шторку</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side={side}
        title={title || undefined}
        closeOnBackdrop={closeOnBackdrop}
        closeOnEscape={closeOnEscape}
        footer={withFooter ? FOOTER : undefined}
      >
        {children ?? <KeyValueList items={DETAILS} />}
      </Drawer>
    </div>
  )
}

export default defineFixture<Props>({
  name: 'Drawer',
  group: 'Оверлеи',
  kind: 'block',

  props: {
    title: 'Документ ТК-00417',
    side: 'right',
    closeOnBackdrop: true,
    closeOnEscape: true,
    withFooter: true,
  },

  controls: {
    title: { kind: 'text', prop: true },
    side: { kind: 'enum', values: ['left', 'right', 'bottom'], prop: true },
    closeOnBackdrop: { kind: 'bool', prop: true },
    closeOnEscape: { kind: 'bool', prop: true },
    withFooter: { kind: 'bool', prop: false },
  },

  data: {
    'no-title': { title: '' },
    bottom: { side: 'bottom' },
    plain: { withFooter: false },
  },

  cases: [
    {
      id: 'base',
      title: 'Закрыта',
      note:
        'Ни узла, ни перехваченного фокуса, ни изоляции фона: закрытая шторка'
        + ' не оставляет после себя ничего. Состояние важно само по себе —'
        + ' оверлей, забывший убрать за собой `inert` на фоне, выглядит'
        + ' закрытым и делает страницу мёртвой.',
    },
    {
      id: 'open',
      title: 'Открыта справа',
      note:
        'Основное положение: справа приезжает то, что относится к выбранной'
        + ' строке. Заголовок даёт диалогу имя (`aria-labelledby`), крестик —'
        + ' единственная кнопка, которую компонент рисует сам. Проверьте'
        + ' клавиатурой: Tab не выпускает из панели, Escape закрывает, фокус'
        + ' возвращается на «Открыть шторку».',
      shows: ['[role="dialog"][aria-modal="true"]'],
      render: (p) => <Live {...p} startOpen />,
    },
    {
      id: 'side-left',
      title: 'Открыта слева: дерево и фильтры',
      note:
        'Сторона — это про то, откуда пришло содержимое. Слева в системе живёт'
        + ' навигация, поэтому левая шторка уместна для дерева, фильтров и'
        + ' всего, что уточняет выбор, а не отвечает на вопрос.'
        + ' Случай стоит отдельным именно потому, что раньше его не было ни'
        + ' одного: случай «Слева и снизу» рисовал только нижнюю, а крутилка'
        + ' `side` на него не действовала — писалась в адрес и не меняла ничего.'
        + ' Здесь `side` берётся из пропа, то есть крутилка работает.'
        + ' Внутри дерево парков, а не карточка документа: сторона это про'
        + ' ПРЕДМЕТ, а не про вид, и левая шторка с той же карточкой, что и'
        + ' правая, показывала бы сторону настройкой. Заголовок случай задаёт'
        + ' сам — «Документ ТК-00417» над деревом парков читался бы как ошибка;'
        + ' крутилка `title` на этом случае поэтому погашена и в адрес не'
        + ' пишется (DS-164).',
      props: { side: 'left' },
      shows: ['[role="dialog"][aria-modal="true"]'],
      render: (p) => (
        <Live {...p} title="Парки и филиалы" startOpen>
          <Tree nodes={FLEET} defaultExpandedIds={['all', 'south']} />
        </Live>
      ),
    },
    {
      id: 'side-bottom',
      title: 'Открыта снизу: то, что растёт вширь',
      note:
        'Нижняя — для того, что растёт вширь: лог, консоль, длинная таблица.'
        + ' Своей высоты у неё НЕТ, только `max-height: 80vh`: она ровно по'
        + ' содержимому (замерено: 261 px на шапку 41, тело 172 и подвал 48).'
        + ' Половину кадра верстака она занимает потому, что кадр 512 px; на'
        + ' окне 900 это те же 261, то есть меньше трети. Смотреть тут надо на'
        + ' то, не проседает ли содержимое в широкой полосе, а не на долю.',
      props: { side: 'bottom' },
      shows: ['[role="dialog"][aria-modal="true"]'],
      render: (p) => <Live {...p} startOpen />,
    },
    {
      id: 'scroll',
      title: 'Длинное содержимое: подвал остаётся',
      note:
        'Прокручивается ТЕЛО, а шапка с подвалом стоят. Иначе кнопки уезжают'
        + ' вверх ровно тогда, когда до них добрались — форма длиннее экрана и'
        + ' есть тот случай, ради которого подвал вынесен отдельно.'
        + ' За шторкой намеренно положена длинная страница: изоляция фона'
        + ' (`body { overflow: hidden }`) проверяется колесом НАД подложкой, а'
        + ' проверить её можно только там, где фону есть куда прокручиваться.'
        + ' Пока за шторкой стояла одна кнопка, `scrollHeight` кадра равнялся'
        + ' его высоте — механика работала, а случай её не показывал.',
      shows: ['[role="dialog"][aria-modal="true"]'],
      render: (p) => (
        <div>
          <Live {...p} startOpen>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {Array.from({ length: 12 }, (_, i) => (
                <KeyValueList key={i} items={DETAILS} />
              ))}
            </div>
          </Live>
          <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
            {Array.from({ length: 16 }, (_, i) => (
              <p key={i} style={{ margin: 0, color: 'var(--ds-text-muted)' }}>
                Строка страницы под шторкой №{i + 1}. Прокрутите колесом над
                подложкой: страница обязана стоять.
              </p>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'sticky',
      title: 'Промах мимо не стирает форму',
      note:
        'Здесь `closeOnBackdrop` и `closeOnEscape` выключены. Разница с'
        + ' «Открыта справа» не видна глазом вовсе — она в том, ЧЕГО не'
        + ' происходит: щёлкните по подложке и нажмите Escape, шторка обязана'
        + ' остаться. Так её ставят там, где внутри наполовину заполненная'
        + ' форма; закрывать тогда можно только крестиком и кнопкой подвала.',
      // ВЫКЛЮЧЕНИЕ — В `props`, А НЕ ЛИТЕРАЛОМ В `render` (DS-164).
      // Литерал перекрывал крутилки: панель показывала их отмеченными, как на
      // «Открыта справа», а щелчок ничего не менял. Из `props` значения едут
      // и в панель, и в кадр, и крутилки на этом случае работают.
      props: { closeOnBackdrop: false, closeOnEscape: false },
      shows: ['[role="dialog"][aria-modal="true"]'],
      render: (p) => <Live {...p} startOpen />,
    },
  ],

  render: (p) => <Live {...p} />,
})
