import {
  Card, FormRow, TextField, Button, DropdownMenu,
  KeyValueList, MetricStrip, Badge, DataTable,
} from '@santarinto/jig'

export const Form = () => (
  <div style={{ width: 480 }}>
    <Card title="Контрагент (создание)" footer={<><Button variant="ghost" size="sm">Отмена</Button><Button size="sm">Записать и закрыть</Button></>}>
      <FormRow label="Наименование"><TextField defaultValue="ООО «Ромашка»" /></FormRow>
      <FormRow label="ИНН"><TextField defaultValue="7701234567" /></FormRow>
    </Card>
  </div>
)

const kvItems = [
  { id: 'org', label: 'Организация', value: 'ООО «Ромашка»' },
  { id: 'sum', label: 'Сумма', value: '1 240 500,00 ₽' },
  { id: 'status', label: 'Статус', value: <Badge tone="warning">Не проведён</Badge> },
]

export const WithKeyValueList = () => (
  <div style={{ width: 360 }}>
    <Card
      title="Последние заметки"
      subtitle="за июль 2026"
      headerAction={
        <DropdownMenu
          ariaLabel="Действия"
          items={[
            { id: 'open-all', label: 'Открыть все' },
            { id: 'refresh', label: 'Обновить' },
            { separator: true },
            { id: 'hide', label: 'Скрыть виджет' },
          ]}
        />
      }
    >
      <KeyValueList items={kvItems} dividers />
    </Card>
  </div>
)

const metrics = [
  { id: 'rev', label: 'Выручка', value: '1 240 500 ₽', hint: 'за июль' },
  { id: 'debt', label: 'Задолженность', value: '86 300 ₽', tone: 'warning' as const },
  { id: 'paid', label: 'Оплачено', value: '94 %', tone: 'success' as const },
]

export const WithMetricStrip = () => (
  <div style={{ width: 520 }}>
    <Card title="Показатели" subtitle="обновлено 5 минут назад">
      <MetricStrip metrics={metrics} />
    </Card>
  </div>
)

const docRows = [
  { id: '1', doc: 'Реализация №РТ-0001', date: '24.07.2026', sum: '128 400 ₽' },
  { id: '2', doc: 'Поступление №ПТ-0042', date: '23.07.2026', sum: '56 200 ₽' },
]

const docColumns = [
  { key: 'doc' as const, header: 'Документ' },
  { key: 'date' as const, header: 'Дата' },
  { key: 'sum' as const, header: 'Сумма', numeric: true },
]

export const FlushTable = () => (
  <div style={{ width: 480 }}>
    <Card title="Последние документы" subtitle="продажи" noPadding>
      <DataTable columns={docColumns} rows={docRows} getRowId={(r) => r.id} dense />
    </Card>
  </div>
)

/**
 * Тон помечает состояние контейнера, содержимое остаётся обычным.
 *
 * Не путать с `Alert`: тот сообщает о событии и сам читается как сообщение.
 * «Заблокирована» карточкой в списке — это `tone`; «заблокирована»
 * уведомлением вверху экрана — это `Alert`.
 */
export const Tones = () => (
  <div style={{ display: 'flex', gap: 'var(--ds-space-5)', flexWrap: 'wrap' }}>
    <div style={{ width: 230 }}>
      <Card title="Задача TK-418" subtitle="заблокирована" tone="error" dense>
        Ждём ответа заказчика по формату выгрузки.
      </Card>
    </div>
    <div style={{ width: 230 }}>
      <Card title="Майлстон «Отчётность»" subtitle="готов" tone="success" dense>
        Все 14 задач закрыты, релиз выкачен.
      </Card>
    </div>
    <div style={{ width: 230 }}>
      <Card title="Импорт номенклатуры" subtitle="выполняется" tone="accent" dense>
        Обработано 4 200 из 9 800 позиций.
      </Card>
    </div>
  </div>
)
