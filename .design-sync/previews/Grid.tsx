import { Grid, Card, Stat } from '@santarinto/jig'

const Cell = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    padding: '8px 12px', background: 'var(--ds-surface-subtle)',
    border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)',
    fontSize: 'var(--ds-fs-sm)',
  }}>{children}</div>
)

export const Columns = () => (
  <Grid columns={3} gap={3}>
    {Array.from({ length: 6 }, (_, i) => <Cell key={i}>№{i + 1}</Cell>)}
  </Grid>
)

/** Явный шаблон — колонка фиксированной ширины плюс тянущаяся. */
export const Template = () => (
  <Grid columns="200px 1fr" gap={3}>
    <Cell>сайдбар 200px</Cell>
    <Cell>контент 1fr — тянется</Cell>
  </Grid>
)

/**
 * Адаптивные колонки: число считает браузер от доступного места.
 * Ширина на обёртке обязательна — без неё `auto-fill` схлопнется в одну колонку.
 */
export const AutoFill = () => (
  <Grid minColumnWidth="150px" gap={3} style={{ width: 480 }}>
    {['Продажи', 'Закупки', 'Склад', 'Касса', 'Зарплата', 'Отчётность'].map((t) => (
      <Cell key={t}>{t}</Cell>
    ))}
  </Grid>
)

/**
 * Сетка показателей — то, ради чего `Grid` обычно и берут.
 *
 * Ширина с запасом намеренно: на 560px три колонки дают ~170px на плитку,
 * и длинное значение переносится на две строки, наезжая на дельту.
 */
export const StatsBoard = () => (
  <Grid columns={3} gap={4} style={{ width: 720 }}>
    <Card dense><Stat label="Выручка за день" value="1,24 млн ₽" delta={{ value: '4,2 %', direction: 'up' }} /></Card>
    <Card dense><Stat label="Документов" value="128" delta={{ value: '1,5 %', direction: 'down' }} /></Card>
    <Card dense><Stat label="Задач в работе" value="7" /></Card>
  </Grid>
)
