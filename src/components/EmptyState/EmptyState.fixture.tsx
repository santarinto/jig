/**
 * Пустое состояние. `kind: 'block'` — но у него ДВА варианта, и различие между
 * ними не в размере, а в том, где такому объяснению место.
 *
 * `block` — пустая страница или секция: крупный центрированный блок с
 * маршрутом «откуда возьмётся». `inline` — ячейка таблицы и угол карточки, где
 * блок целиком не помещается; там иконка-заглушка по умолчанию не рисуется,
 * потому что в строку она не лезет и притворяется содержимым.
 *
 * Граница, которую фикстура обязана показать, а не пересказать: **ведущего
 * прочерка в `inline` нет и не будет**. Прочерк, держащий числовую колонку, —
 * это `Money value={null}`: он набран с `tabular-nums`, встаёт по краю с
 * остальными числами и означает «здесь число, которого нет». `inline` живёт в
 * другой раскладке — текстом от начала строки, — и прочерк перед ним не
 * удержал бы колонку, а ПРИТВОРИЛСЯ бы, что удерживает. Случай «в ячейке»
 * ставит оба рядом, потому что порознь они оба выглядят как «пусто».
 */
import { defineFixture } from '../../internal/fixture.js'
import { EmptyState } from './EmptyState.js'
import { Money } from '../Money/Money.js'
import { DataTable } from '../DataTable/DataTable.js'

/** Строка для случая «в ячейке»: две числовые колонки и одна текстовая. */
interface CellRow {
  id: string
  sum: string
  rest: string | null
}

const CELL_ROWS: CellRow[] = [{ id: 'c1', sum: '12400.00', rest: null }]

/** Иконка раздела. Своя: фикстура не проверяет иконки системы. */
const BOX = (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="4" y="9" width="24" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M4 15h24" stroke="currentColor" strokeWidth="2" />
  </svg>
)

interface Props {
  title: string
  description: string
  variant: 'block' | 'inline'
  withIcon: boolean
}

export default defineFixture<Props>({
  name: 'EmptyState',
  group: 'Отображение',
  kind: 'block',

  props: {
    title: 'Записей нет',
    description: 'Документы появятся здесь после первой загрузки выписки.',
    variant: 'block',
    withIcon: true,
  },

  controls: {
    title: { kind: 'text', prop: true },
    description: { kind: 'text', prop: true },
    variant: { kind: 'enum', values: ['block', 'inline'], prop: true },
    withIcon: { kind: 'bool', prop: false },
  },

  data: {
    // Только заголовок: описание необязательно, и без него блок не должен
    // проваливаться в «половину состояния».
    'title-only': { description: '' },
    long: {
      description:
        'Документы появятся здесь после того, как бухгалтерия закроет период и ' +
        'выписка по расчётному счёту будет загружена в систему — обычно это ' +
        'третий рабочий день месяца.',
    },
  },

  slots: {
    action: {
      title: 'Действие',
      accepts: 'inline',
      prop: 'action',
      note:
        'Сюда кладут кнопку — маршрут, которым пустота заполняется. Позиция ' +
        'под текстом: слишком широкая начинка растянет блок, а не обрежется, ' +
        'потому что блок меряется по содержимому.',
    },
  },

  cases: [
    { id: 'base', title: 'Пустая секция', note: 'Заголовок, объяснение и место под действие.' },
    {
      id: 'with-action',
      title: 'С действием',
      note:
        'Кнопка приезжает начинкой из данных случая. Пустое состояние без ' +
        'маршрута — это сообщение о неудаче; с маршрутом — шаг.',
      slots: { action: { c: 'Button', case: 'base' } },
    },
    {
      id: 'variants',
      title: 'Блок против строки',
      note:
        'Сверху block: центрированный, с иконкой-заглушкой. Снизу inline: та же ' +
        'мысль в одну строку и БЕЗ иконки по умолчанию — в строке она не ' +
        'помещается и начинает выглядеть содержимым ячейки. Порознь оба ' +
        'варианта смотрятся законно; выбор между ними определяется контейнером, ' +
        'а не вкусом.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <EmptyState title={p.title} description={p.description} icon={BOX} />
          <EmptyState title={p.title} description={p.description} variant="inline" />
        </div>
      ),
    },
    {
      id: 'in-cell',
      title: 'В ячейке: где проходит граница с Money',
      note:
        'Одна строка настоящей таблицы, три ячейки. Слева число. В середине — прочерк Money ' +
        'value={null}: он набран с tabular-nums, встаёт по краю вместе с ' +
        'числами и означает «здесь число, которого нет». Справа — EmptyState ' +
        'inline: текстом от начала строки, про пустую ОБЛАСТЬ и маршрут. ' +
        'Поставьте его в числовую колонку — и колонка развалится, хотя каждая ' +
        'ячейка по отдельности выглядит нормально. Именно поэтому ведущего ' +
        'прочерка у inline нет: он притворился бы, что держит колонку.',
      render: () => (
        <div style={{ width: 'min(28rem, 100%)' }}>
          <DataTable<CellRow>
            columns={[
              {
                id: 'sum',
                header: 'Сумма',
                width: 128,
                numeric: true,
                align: 'end',
                render: (r) => <Money value={r.sum} currency="RUB" />,
              },
              {
                id: 'rest',
                header: 'Остаток',
                width: 128,
                numeric: true,
                align: 'end',
                render: (r) => <Money value={r.rest} currency="RUB" />,
              },
              {
                id: 'note',
                header: 'Комментарий',
                render: () => <EmptyState variant="inline" title="Выписка не загружена" />,
              },
            ]}
            rows={CELL_ROWS}
            getRowId={(r) => r.id}
          />
        </div>
      ),
    },
    {
      id: 'no-icon',
      title: 'Без иконки',
      props: { withIcon: false },
      note:
        'Иконка-заглушка не обязательна: в плотной секции она добавляет высоту, ' +
        'ничего не сообщая. Заголовок остаётся обязательным — пустое состояние ' +
        'без слов это просто пустота.',
    },
  ],

  render: (p, slots) => (
    <EmptyState
      title={p.title}
      description={p.description || undefined}
      variant={p.variant}
      icon={p.withIcon && p.variant === 'block' ? BOX : undefined}
      action={slots.action ?? undefined}
    />
  ),
})
