import { DataTable } from '@santarinto/jig'
import type { Column } from '@santarinto/jig'

interface Line { id: string; name: string; qty: number; price: string; sum: string }

// Тип на колонках, а не `as const` на каждом ключе: он же даёт вывод `T` там,
// где строк нет (`rows={[]}` в историях «загрузка» и «пусто») — без него `T`
// выводится в `never`, и `getRowId` перестаёт типизироваться.
const columns: Column<Line>[] = [
  { key: 'name', header: 'Номенклатура' },
  { key: 'qty', header: 'Кол-во', numeric: true },
  { key: 'price', header: 'Цена', numeric: true },
  { key: 'sum', header: 'Сумма', numeric: true },
]

const rows: Line[] = [
  { id: '1', name: 'Ноутбук ASUS Vivobook', qty: 2, price: '54 900,00', sum: '109 800,00' },
  { id: '2', name: 'Мышь Logitech MX', qty: 5, price: '1 290,00', sum: '6 450,00' },
  { id: '3', name: 'Монитор LG 27"', qty: 3, price: '18 400,00', sum: '55 200,00' },
]

export const Default = () => (
  <div style={{ width: 640 }}>
    <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />
  </div>
)

export const WithSelection = () => (
  <div style={{ width: 640 }}>
    <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} selectedIds={['2']} onSelectionChange={() => {}} />
  </div>
)

export const Loading = () => (
  <div style={{ width: 640 }}>
    <DataTable columns={columns} rows={[]} getRowId={(r) => r.id} loading loadingRows={4} />
  </div>
)

export const Empty = () => (
  <div style={{ width: 640 }}>
    <DataTable
      columns={columns}
      rows={[]}
      getRowId={(r) => r.id}
      emptyContent={<div style={{ color: 'var(--ds-text-muted)' }}>Нет позиций в документе</div>}
    />
  </div>
)

/**
 * Колонка без поля в строке: `id` вместо `key`, `render` обязателен. Годится под
 * кнопки действий, прогресс из двух чисел, иконку состояния.
 */
export const WithDisplayColumn = () => (
  <div style={{ width: 720 }}>
    <DataTable
      columns={[
        ...columns,
        // Подпись есть, глазами не нужна — ровно случай `headerHidden` (DS-80).
        // Пустой `header` у колонки БЕЗ `actions` компонент запрещает броском: пустой
        // <th> диктор объявляет безымянным столбцом.
        { id: 'actions', header: 'Действия', headerHidden: true, render: (r) => <a href={`/line/${r.id}`}>Открыть</a> },
      ]}
      rows={rows}
      getRowId={(r) => r.id}
    />
  </div>
)

/**
 * Колонки, которые прячутся, когда таблице тесно. Порог считается от ширины
 * таблицы, а не вьюпорта, поэтому работает и в узкой панели.
 */
export const HideBelow = () => (
  <div style={{ width: 420 }}>
    <DataTable
      columns={[
        { key: 'name', header: 'Номенклатура' },
        { key: 'qty', header: 'Кол-во', numeric: true },
        { key: 'price', header: 'Цена', numeric: true, hideBelow: 'sm' },
        { key: 'sum', header: 'Сумма', numeric: true, hideBelow: 'md' },
      ]}
      rows={rows}
      getRowId={(r) => r.id}
    />
  </div>
)
