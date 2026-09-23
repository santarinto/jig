import { Badge, type BadgeTone } from '../../src/components/Badge/index.js'
import { Alert, type AlertTone } from '../../src/components/Alert/index.js'
import { ProgressBar, type ProgressTone } from '../../src/components/ProgressBar/index.js'
import { Button } from '../../src/components/Button/index.js'
import { MetricStrip } from '../../src/components/MetricStrip/index.js'
import { DataTable, type Column } from '../../src/components/DataTable/index.js'
import { DropdownMenu } from '../../src/components/DropdownMenu/index.js'
import { DemoBlock } from '../demo-spec.js'

/**
 * Реестр единого словаря `tone` после DS-16. Раньше один и тот же проп
 * нёс три несовместимых диалекта: «красный» звался `error` у badge-семейства и
 * `danger` у action-семейства; «нейтральное» — `neutral` (Badge) и `default`
 * (MetricStrip/RowAction/DropdownMenu). Каноничным принят `BadgeTone`, имена
 * `danger`→`error`, `default`→`neutral` унифицированы везде.
 *
 * Текущие словари (источник — типы в src/components):
 *   Badge        BadgeTone      'neutral'|'accent'|'success'|'warning'|'error'|'info'
 *   Alert        AlertTone      'info'|'success'|'warning'|'error'
 *   ProgressBar  ProgressTone   'accent'|'success'|'warning'|'error'
 *   MetricStrip  MetricTone     'neutral'|'success'|'warning'|'error'
 *   Button       ButtonTone     'error'
 *   DataTable    RowAction.tone 'neutral'|'error'
 *   DropdownMenu item.tone      'neutral'|'error'
 *
 * Цвета ИЗ ДАННЫХ потребителя (`Badge brand`) в реестре нет и быть не должно:
 * реестр отвечает на вопрос «какую КАТЕГОРИЮ компонент умеет назвать», а
 * произвольный хекс из чужой базы категорию не называет. Одно время он стоял
 * седьмым значением `BadgeTone` — и тем молча расширял шесть чужих типов,
 * которые этот же словарь носят под своими именами (DS-81). Теперь это
 * отдельный проп, и словарь снова про категории, а строка `brand` в таблице
 * покрытия не появится и не прочитается как «остальным его не хватает».
 */

/** Тона реестра — тот самый общий словарь, целиком. */
type CanonicalTone = BadgeTone

type CompId = 'badge' | 'alert' | 'progress' | 'metric' | 'button' | 'rowaction' | 'dropdown'

const COMPONENTS: { id: CompId; label: string; type: string }[] = [
  { id: 'badge', label: 'Badge', type: 'BadgeTone' },
  { id: 'alert', label: 'Alert', type: 'AlertTone' },
  { id: 'progress', label: 'ProgressBar', type: 'ProgressTone' },
  { id: 'metric', label: 'MetricStrip', type: 'MetricTone' },
  { id: 'button', label: 'Button', type: "ButtonTone = 'error'" },
  { id: 'rowaction', label: 'DataTable · RowAction', type: "tone?: 'neutral' | 'error'" },
  { id: 'dropdown', label: 'DropdownMenu · item', type: "tone?: 'neutral' | 'error'" },
]

/** Принимает ли компонент данное каноничное значение. */
const COVERAGE: { id: CanonicalTone; label: string; has: Record<CompId, boolean> }[] = [
  { id: 'neutral', label: 'neutral', has: { badge: true, alert: false, progress: false, metric: true, button: false, rowaction: true, dropdown: true } },
  { id: 'accent', label: 'accent', has: { badge: true, alert: false, progress: true, metric: false, button: false, rowaction: false, dropdown: false } },
  { id: 'success', label: 'success', has: { badge: true, alert: true, progress: true, metric: true, button: false, rowaction: false, dropdown: false } },
  { id: 'warning', label: 'warning', has: { badge: true, alert: true, progress: true, metric: true, button: false, rowaction: false, dropdown: false } },
  { id: 'error', label: 'error', has: { badge: true, alert: true, progress: true, metric: true, button: true, rowaction: true, dropdown: true } },
  { id: 'info', label: 'info', has: { badge: true, alert: true, progress: false, metric: false, button: false, rowaction: false, dropdown: false } },
]

const VALUE_COLOR: Record<CanonicalTone, string> = {
  error: 'var(--ds-error-fg)',
  success: 'var(--ds-success-fg)',
  warning: 'var(--ds-warning-fg)',
  info: 'var(--ds-info-fg)',
  accent: 'var(--ds-accent)',
  neutral: 'var(--ds-text-muted)',
}

const BADGE_TONES: { id: CanonicalTone; sample: string }[] = [
  { id: 'neutral', sample: 'Черновик' },
  { id: 'accent', sample: 'В работе' },
  { id: 'success', sample: 'Проведён' },
  { id: 'warning', sample: 'Ожидает' },
  { id: 'error', sample: 'Ошибка' },
  { id: 'info', sample: 'Новый' },
]

const ALERT_TONES: { id: AlertTone; sample: string }[] = [
  { id: 'info', sample: 'Документ проведён успешно.' },
  { id: 'success', sample: 'Загрузка завершена.' },
  { id: 'warning', sample: 'Осталось заполнить контрагента.' },
  { id: 'error', sample: 'Не удалось связаться с сервером.' },
]

const PROGRESS_TONES: { id: ProgressTone; value: number }[] = [
  { id: 'accent', value: 62 },
  { id: 'success', value: 90 },
  { id: 'warning', value: 45 },
  { id: 'error', value: 18 },
]

interface ActionRow { id: string; name: string }

const ACTION_ROWS: ActionRow[] = [
  { id: '1', name: 'Реализация №142' },
  { id: '2', name: 'Счёт №89' },
]

const ACTION_COLS: Column<ActionRow>[] = [
  { key: 'name', header: 'Документ' },
  {
    id: 'actions',
    header: '',
    align: 'end',
    actions: () => [
      { id: 'edit', icon: <span aria-hidden>✎</span>, label: 'Изменить', tone: 'neutral', onSelect: () => {} },
      { id: 'delete', icon: <span aria-hidden>🗑</span>, label: 'Удалить', tone: 'error', onSelect: () => {} },
    ],
  },
]

export function ToneDialectsSection() {
  return (
    <section className="demo-section" id="tone">
      <style>{`
        .td-intro {
          max-width: 46rem;
          color: var(--ds-text-muted);
          line-height: 1.55;
          margin: 0 0 1.25rem;
        }
        .td-intro code { color: inherit; }
        .td-table-wrap {
          overflow-x: auto;
          border: 1px solid var(--ds-border);
          border-radius: var(--ds-radius);
          margin-bottom: 2rem;
          background: var(--ds-surface);
        }
        .td-table { border-collapse: collapse; width: 100%; font-size: 0.85rem; min-width: 50rem; }
        .td-table th, .td-table td {
          border: 1px solid var(--ds-border);
          padding: 0.5rem 0.6rem;
          text-align: center;
          vertical-align: middle;
        }
        .td-table thead th {
          background: var(--ds-surface-subtle);
          font-weight: 600;
          white-space: nowrap;
        }
        .td-table thead th .td-type { display: block; font-weight: 400; color: var(--ds-text-muted); font-size: 0.72rem; margin-top: 0.15rem; }
        .td-table tbody th { font-weight: 600; white-space: nowrap; background: var(--ds-surface); text-align: left; }
        .td-table td.td-yes { color: var(--ds-success-fg); font-weight: 600; }
        .td-table td.td-no { color: var(--ds-text-muted); }
        .td-chip {
          font-family: var(--ds-font-mono);
          font-size: 0.78rem;
        }
        .td-group { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
        .td-block { margin-bottom: 1.5rem; }
      `}</style>

      <h2 className="demo-section__title">Tone — единый словарь <code>tone</code></h2>

      <p className="td-intro">
        После <code>DS-16</code> проп <code>tone</code> во всех компонентах
        держит один словарь — <code>BadgeTone</code>. Раньше «красный» звался{' '}
        <code>error</code> у badge-семейства и <code>danger</code> у action-семейства,
        а «нейтральное» — <code>neutral</code> и <code>default</code>; теперь везде{' '}
        <code>error</code> и <code>neutral</code>. Ниже — какие значения кто принимает
        и живые рендеры каждого компонента.
      </p>

      <div className="td-table-wrap">
        <table className="td-table">
          <thead>
            <tr>
              <th scope="col">tone</th>
              {COMPONENTS.map((c) => (
                <th key={c.id} scope="col">
                  {c.label}
                  <span className="td-type">{c.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COVERAGE.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <code className="td-chip" style={{ color: VALUE_COLOR[row.id] }}>{row.label}</code>
                </th>
                {COMPONENTS.map((c) =>
                  row.has[c.id] ? (
                    <td key={c.id} className="td-yes">✓</td>
                  ) : (
                    <td key={c.id} className="td-no">—</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="td-block">
        <DemoBlock
          name="Badge — все тоны"
          code={'<Badge tone="…">…</Badge>'}
        >
          <div className="td-group">
            {BADGE_TONES.map((t) => (
              <Badge key={t.id} tone={t.id}>{t.sample}</Badge>
            ))}
          </div>
        </DemoBlock>
      </div>

      <div className="td-block">
        <DemoBlock
          name="Alert — все тоны"
          block
          code={'<Alert tone="…">…</Alert>'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '32rem' }}>
            {ALERT_TONES.map((t) => (
              <Alert key={t.id} tone={t.id}>{t.sample}</Alert>
            ))}
          </div>
        </DemoBlock>
      </div>

      <div className="td-block">
        <DemoBlock
          name="ProgressBar — все тоны"
          block
          code={'<ProgressBar value={…} tone="…" showValue />'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '28rem' }}>
            {PROGRESS_TONES.map((t) => (
              <ProgressBar key={t.id} value={t.value} tone={t.id} showValue />
            ))}
          </div>
        </DemoBlock>
      </div>

      <div className="td-block">
        <DemoBlock
          name="MetricStrip — neutral / success / warning / error"
          block
          code={'<MetricStrip metrics={[{ id, label, value, tone }]} />'}
        >
          <MetricStrip
            metrics={[
              { id: 'a', label: 'neutral', value: '9427,50' },
              { id: 'b', label: 'success', value: '0,00', tone: 'success' },
              { id: 'c', label: 'warning', value: '320,00', tone: 'warning' },
              { id: 'd', label: 'error', value: '−54,00', tone: 'error' },
            ]}
          />
        </DemoBlock>
      </div>

      <div className="td-block">
        <DemoBlock
          name="Button — tone=&quot;error&quot; (значим только на ghost / secondary)"
          code={'<Button variant="ghost" tone="error">Удалить</Button>'}
        >
          <div className="td-group">
            <Button variant="ghost" tone="error">Удалить</Button>
            <Button variant="secondary" tone="error">Удалить</Button>
            <Button variant="ghost">Без тона</Button>
            <Button variant="danger">variant=&quot;danger&quot;</Button>
          </div>
        </DemoBlock>
      </div>

      <div className="td-block">
        <DemoBlock
          name="DataTable · RowAction — neutral / error"
          block
          code={`<DataTable rows={rows} columns={[{ key:'name' }, { id:'actions', actions:(r)=>[\n  { icon, label:'Изменить', tone:'neutral', onClick },\n  { icon, label:'Удалить', tone:'error', onClick },\n] }]} getRowId={(r)=>r.id} />`}
        >
          <DataTable rows={ACTION_ROWS} columns={ACTION_COLS} getRowId={(r) => r.id} />
        </DemoBlock>
      </div>

      <div className="td-block">
        <DemoBlock
          name="DropdownMenu · item — neutral / error"
          code={`<DropdownMenu items={[\n  { id:'edit', label:'Изменить', onSelect },\n  { id:'delete', label:'Удалить', tone:'error', onSelect },\n]} />`}
        >
          <DropdownMenu
            items={[
              { id: 'edit', label: 'Изменить (neutral)', onSelect: () => {} },
              { id: 'copy', label: 'Копировать (neutral)', onSelect: () => {} },
              { separator: true },
              { id: 'delete', label: 'Удалить (error)', tone: 'error', onSelect: () => {} },
            ]}
          />
        </DemoBlock>
      </div>
    </section>
  )
}
