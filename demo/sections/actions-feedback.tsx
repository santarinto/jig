import { useRef, useState } from 'react'
import { Badge, type BadgeTone } from '../../src/components/Badge/index.js'
import { DropdownMenu } from '../../src/components/DropdownMenu/index.js'
import { Alert, type AlertTone } from '../../src/components/Alert/index.js'
import { Skeleton, type SkeletonAnim } from '../../src/components/Skeleton/index.js'
import { EmptyState } from '../../src/components/EmptyState/index.js'
import { ProgressBar, type ProgressTone } from '../../src/components/ProgressBar/index.js'
import { Avatar, type AvatarPresence, type AvatarSize } from '../../src/components/Avatar/index.js'
import { Stat } from '../../src/components/Stat/index.js'
import { CodeBlock } from '../../src/components/CodeBlock/index.js'
import { Button } from '../../src/components/Button/index.js'
import {
  toast, Toaster, dismissToast, clearToasts,
  NotificationCenter, type NotificationItem,
} from '../../src/components/Notifications/index.js'
import { ButtonMatrixDemo, ButtonVariantsDemo, ButtonGroupsDemo } from './button-matrix.js'
import { DemoBlock } from '../demo-spec.js'
import { DemoMatrix } from '../demo-matrix.js'

/** Текст образца хранится рядом с тоном: подпись «Ошибка» на тоне error — часть примера. */
const BADGE_TONES: { id: BadgeTone; label: string; sample: string }[] = [
  { id: 'neutral', label: 'neutral', sample: 'Черновик' },
  { id: 'accent', label: 'accent', sample: 'В работе' },
  { id: 'success', label: 'success', sample: 'Проведён' },
  { id: 'warning', label: 'warning', sample: 'Ожидает' },
  { id: 'error', label: 'error', sample: 'Ошибка' },
  { id: 'info', label: 'info', sample: 'Новый' },
]

const ALERT_TONES: { id: AlertTone; label: string; sample: string }[] = [
  { id: 'info', label: 'info', sample: 'Документ проведён успешно.' },
  { id: 'success', label: 'success', sample: 'Загрузка завершена.' },
  { id: 'warning', label: 'warning', sample: 'Осталось заполнить контрагента.' },
  { id: 'error', label: 'error', sample: 'Не удалось связаться с сервером.' },
]

const PROGRESS_TONES: { id: ProgressTone; label: string; value: number }[] = [
  { id: 'accent', label: 'accent', value: 62 },
  { id: 'success', label: 'success', value: 90 },
  { id: 'warning', label: 'warning', value: 45 },
  { id: 'error', label: 'error', value: 18 },
]

const AVATAR_SIZES: AvatarSize[] = ['sm', 'md', 'lg']
const AVATAR_PRESENCE: AvatarPresence[] = ['online', 'busy', 'away', 'offline']
const SKELETON_ANIMS: SkeletonAnim[] = ['sweep', 'pulse', 'retro']

const TOAST_CODE = [
  '// <Toaster /> монтируется один раз на приложение',
  '<Toaster position="bottom-right" />',
  '',
  "toast.success('Документ проведён')",
  "toast.error('Не хватает остатков')",
  "toast.warning('Цена ниже себестоимости')",
  "toast.info('Синхронизация завершена')",
  "const id = toast('Липкий тост', { duration: 0 })",
  'dismissToast(id)',
  'clearToasts()',
].join('\n')

const NC_ITEMS: NotificationItem[] = [
  { id: 'n1', tone: 'success', title: 'Документ проведён', text: 'Реализация №142' },
  { id: 'n2', tone: 'warning', title: 'Остаток на складе: 3 шт.' },
  { id: 'n3', tone: 'info', title: 'Справочник обновлён' },
]

const NC_CODE = [
  'const ITEMS: NotificationItem[] = [',
  "  { id: 'n1', tone: 'success', title: 'Документ проведён', text: 'Реализация №142' },",
  "  { id: 'n2', tone: 'warning', title: 'Остаток на складе: 3 шт.' },",
  "  { id: 'n3', tone: 'info', title: 'Справочник обновлён' },",
  ']',
  'const [items, setItems] = useState(ITEMS)',
  '',
  '<NotificationCenter items={items} onDismiss={(id) => setItems(items.filter((n) => n.id !== id))} />',
].join('\n')

export function ActionsSection() {
  return (
    <section className="demo-section" id="actions">
      <h2 className="demo-section__title">Actions</h2>
      <div className="demo-grid demo-grid--1">
        <div className="demo-subsection" id="actions-button">
          <h3 className="demo-subsection__title">Button</h3>
          <ButtonMatrixDemo />
          <div style={{ marginTop: 16 }}>
            <ButtonVariantsDemo />
          </div>
          <div style={{ marginTop: 16 }}>
            <ButtonGroupsDemo />
          </div>
          <DemoBlock
            name="Button as=&quot;a&quot; — навигация без JS"
            block
            code={'<Button as="a" href="/" variant="ghost">Обновить</Button>'}
          >
            <div style={{ display: 'flex', gap: 'var(--ds-space-3)', flexWrap: 'wrap' }}>
              <Button as="a" href="/" variant="ghost">Обновить</Button>
              <Button as="a" href="#actions-badge" variant="secondary">К штрафам</Button>
              <Button as="a" href="/" variant="primary">На главную</Button>
              <Button as="a" href="/" variant="ghost" disabled>Заблокированная ссылка</Button>
            </div>
          </DemoBlock>
        </div>

        <div className="demo-subsection" id="actions-badge">
          <DemoMatrix
            title="Badge — тон"
            rowLabelWidth="7rem"
            minColumnWidth="10rem"
            cellMinHeight="3.5rem"
            maxWidth="40rem"
            columns={[{ id: 'default', label: '' }]}
            rows={BADGE_TONES}
            render={(row) => {
              const t = row as (typeof BADGE_TONES)[number]
              return <Badge tone={t.id}>{t.sample}</Badge>
            }}
            code={(row) => {
              const t = row as (typeof BADGE_TONES)[number]
              return `<Badge tone="${t.id}">${t.sample}</Badge>`
            }}
          />
        </div>

        <div className="demo-subsection" id="actions-dropdown">
          <DemoBlock
            name="DropdownMenu"
          code={`<DropdownMenu\n  items={[\n    { id: 'edit', label: 'Изменить', onSelect: () => {} },\n    { id: 'delete', label: 'Удалить', tone: 'error', onSelect: () => {} },\n  ]}\n/>`}
        >
          <DropdownMenu
            items={[
              { id: 'edit', label: 'Изменить', onSelect: () => {} },
              { id: 'copy', label: 'Копировать', onSelect: () => {} },
              { separator: true },
              { id: 'delete', label: 'Удалить', tone: 'error', onSelect: () => {} },
            ]}
          />
          </DemoBlock>
        </div>

        <div className="demo-subsection" id="actions-codeblock">
          <DemoBlock
            name="CodeBlock"
            block
            code={'<CodeBlock code="npm run build && npm test" copyable />'}
          >
            <CodeBlock code="npm run build && npm test" copyable />
          </DemoBlock>
          <DemoBlock
            name="CodeBlock — wrap"
            block
            code={'<CodeBlock code={LONG_PROMPT} wrap maxHeight={120} />'}
          >
            <CodeBlock
              code="Ты опытный ревьюер кода в распределённых системах. Проверяй изменения на гонки данных, утечки ресурсов и нарушение контрактов API. Если найдена потенциальная проблема — указывай файл и строку, предлагай минимальный исправляющий дифф и поясняй, почему это решает корневую причину, а не симптом."
              wrap
              maxHeight={120}
              label="Системный промт ревьюера"
            />
          </DemoBlock>
        </div>
      </div>
    </section>
  )
}

export function FeedbackSection() {
  const stickyId = useRef('')
  const [items, setItems] = useState<NotificationItem[]>(NC_ITEMS)

  return (
    <section className="demo-section" id="feedback">
      <h2 className="demo-section__title">Feedback</h2>
      <div className="demo-grid demo-grid--1">
        <DemoMatrix
          title="Alert — тон × заголовок"
          stretch
          rowLabelWidth="7rem"
          minColumnWidth="18rem"
          cellMinHeight="5rem"
          columns={[
            { id: 'plain', label: 'Без заголовка' },
            { id: 'titled', label: 'С заголовком' },
          ]}
          rows={ALERT_TONES}
          render={(row, col) => {
            const t = row as (typeof ALERT_TONES)[number]
            return (
              <Alert tone={t.id} title={col.id === 'titled' ? 'Проведение' : undefined}>
                {t.sample}
              </Alert>
            )
          }}
          code={(row, col) => {
            const t = row as (typeof ALERT_TONES)[number]
            const title = col.id === 'titled' ? ' title="Проведение"' : ''
            return `<Alert tone="${t.id}"${title}>${t.sample}</Alert>`
          }}
        />

        <DemoMatrix
          title="ProgressBar — тон × размер"
          stretch
          rowLabelWidth="7rem"
          minColumnWidth="14rem"
          cellMinHeight="4.5rem"
          columns={[
            { id: 'sm', label: 'sm' },
            { id: 'md', label: 'md' },
          ]}
          rows={PROGRESS_TONES}
          render={(row, col) => {
            const t = row as (typeof PROGRESS_TONES)[number]
            return <ProgressBar value={t.value} tone={t.id} size={col.id as 'sm' | 'md'} showValue />
          }}
          code={(row, col) => {
            const t = row as (typeof PROGRESS_TONES)[number]
            return `<ProgressBar value={${t.value}} tone="${t.id}" size="${col.id}" showValue />`
          }}
        />

        <DemoMatrix
          title="Avatar — размер × присутствие"
          rowLabelWidth="7rem"
          minColumnWidth="7rem"
          cellMinHeight="4.5rem"
          columns={AVATAR_PRESENCE.map((p) => ({ id: p, label: p }))}
          rows={AVATAR_SIZES.map((s) => ({ id: s, label: s }))}
          render={(row, col) => (
            <Avatar name="Пётр Иванов" size={row.id as AvatarSize} presence={col.id as AvatarPresence} />
          )}
          code={(row, col) => `<Avatar name="Пётр Иванов" size="${row.id}" presence="${col.id}" />`}
        />

        <DemoMatrix
          title="Skeleton — вариант × анимация"
          stretch
          rowLabelWidth="7rem"
          minColumnWidth="10rem"
          cellMinHeight="5rem"
          columns={SKELETON_ANIMS.map((a) => ({ id: a, label: a }))}
          rows={[
            { id: 'text', label: 'text' },
            { id: 'rect', label: 'rect' },
            { id: 'circle', label: 'circle' },
          ]}
          render={(row, col) => {
            const anim = col.id as SkeletonAnim
            if (row.id === 'text') return <Skeleton variant="text" lines={3} anim={anim} />
            if (row.id === 'circle') return <Skeleton variant="circle" width={40} height={40} anim={anim} />
            return <Skeleton variant="rect" height={48} anim={anim} />
          }}
          code={(row, col) =>
            row.id === 'text'
              ? `<Skeleton variant="text" lines={3} anim="${col.id}" />`
              : row.id === 'circle'
                ? `<Skeleton variant="circle" width={40} height={40} anim="${col.id}" />`
                : `<Skeleton variant="rect" height={48} anim="${col.id}" />`
          }
        />

        <DemoBlock
          name="EmptyState"
          block
          code={'<EmptyState title="Нет документов" description="Создайте первый или измените фильтр." />'}
        >
          <EmptyState title="Нет документов" description="Создайте первый или измените фильтр." />
        </DemoBlock>

        <DemoBlock
          name="Stat"
          block
          code={'<Stat label="Выручка за месяц" value="1,24" unit="млн ₽" delta={{ value: 12, direction: \'up\' }} />'}
        >
          <Stat label="Выручка за месяц" value="1,24" unit="млн ₽" delta={{ value: 12, direction: 'up' }} />
        </DemoBlock>

        <DemoBlock name="toast / Toaster" block code={TOAST_CODE}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button onClick={() => toast.success('Документ проведён')}>success</Button>
            <Button onClick={() => toast.error('Не хватает остатков')}>error</Button>
            <Button onClick={() => toast.warning('Цена ниже себестоимости')}>warning</Button>
            <Button onClick={() => toast.info('Синхронизация завершена')}>info</Button>
            <Button variant="secondary" onClick={() => { stickyId.current = toast('Липкий тост', { duration: 0 }) }}>
              липкий (duration: 0)
            </Button>
            <Button variant="ghost" onClick={() => dismissToast(stickyId.current)}>dismissToast</Button>
            <Button variant="ghost" onClick={() => clearToasts()}>clearToasts</Button>
          </div>
          <Toaster position="bottom-right" />
        </DemoBlock>
        <DemoBlock name="NotificationCenter" block code={NC_CODE}>
          <NotificationCenter items={items} onDismiss={(id) => setItems(items.filter((n) => n.id !== id))} />
        </DemoBlock>
      </div>
    </section>
  )
}
