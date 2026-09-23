import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
// Без этого лаборатория рисуется системным фолбэком, а не Inter.
import '../fonts/inter.css'
import './constraints-lab.css'

import { initTheme, setTheme, STORAGE_KEY } from '../src/theme/index.js'
import { ThemeToggle } from '../src/components/ThemeToggle/index.js'
import { Card, FormRow } from '../src/components/Form/index.js'
import { Grid } from '../src/components/Grid/index.js'
import { Stack } from '../src/components/Stack/index.js'
import { Badge } from '../src/components/Badge/index.js'
import { Button } from '../src/components/Button/index.js'
import { Select } from '../src/components/Select/index.js'
import { TextField } from '../src/components/TextField/index.js'
import { Accordion } from '../src/components/Accordion/index.js'
import { DataTable } from '../src/components/DataTable/index.js'
import { EmptyState } from '../src/components/EmptyState/index.js'
import type { Column } from '../src/internal/columns.js'
import { IconSettings, IconPencil, IconTrash } from '@tabler/icons-react'

/* ------------------------------------------------------------------ *
 * DS-55 — лаборатория по запросу потребителя.
 *
 * Вариант A — СНИМОК чужого кода на 2026-08-13 (повод — факт от потребителя),
 * а не зеркало: их tk-* классы заменены инлайновыми стилями того же смысла
 * (точных значений их листа у нас нет), важна СТРУКТУРА вложенности. У себя
 * они это уже правят — не считать A актуальным состоянием потребителя и
 * не «чинить» его по свежим сведениям: он ценен ровно как то, от чего ушли.
 *
 * Вариант B — то же на примитивах ДС. Что показала лаборатория:
 *  - `Grid minColumnWidth` (auto-fill) на широкой карточке нарезает четыре
 *    колонки, мастер схлопывается в 320px и рвёт текст — нужен явный шаблон;
 *  - `.ds-root` внутри Card красит фоном приложения (#F0F0F0 в #FFFFFF);
 *  - у `Select` нет `error` (DS-56).
 *
 * Вариант C — почему FormRow не годится в узкой колонке (метка 8.75rem).
 * ------------------------------------------------------------------ */

type Effect = 'deny' | 'advise'

interface Rule {
  id: string
  effect: Effect
  ruleText: string
  on?: string
  condition?: string
  arg?: string
}

const RULES: Rule[] = [
  { id: 'r1', effect: 'deny', ruleText: 'Не закрывать задачу без ссылки на коммит', on: 'task', condition: 'status_is', arg: 'done' },
  { id: 'r2', effect: 'advise', ruleText: 'Оценку ставить до начала работы', on: 'task', condition: 'field_empty', arg: 'estimate' },
  { id: 'r3', effect: 'deny', ruleText: 'Правки в main только через ветку' },
]

const EFFECT_LABEL: Record<Effect, string> = { deny: 'запрет', advise: 'совет' }
// Словарь tone канонический (BadgeTone): красный — error, НЕ danger.
const EFFECT_TONE: Record<Effect, 'error' | 'warning'> = { deny: 'error', advise: 'warning' }

const predicateText = (r: Rule) =>
  r.condition ? `${r.on ? `on ${r.on} · ` : ''}${r.condition}${r.arg ? `(${r.arg})` : ''}` : ''

/* ------------------------------------------------------------------ *
 * ВАРИАНТ A — реконструкция «как сейчас»
 * ------------------------------------------------------------------ */

function CurrentShape() {
  return (
    <Card className="lab-card" title="Project constraints" icon={<IconSettings size={13} />}>
      {/* .ds-root внутри нашей же Card — как у них */}
      <div className="ds-root">
        <section aria-label="Project constraints (реконструкция)">
          {/* их tk-panel-h: свой заголовок секции + кнопка Add */}
          <div className="lab-panel-h">
            <span>Project constraints</span>
            <Button type="button" variant="ghost" size="sm">Add</Button>
          </div>

          {/* сырой грид в две колонки */}
          <div className="lab-grid2">
            <div>
              <ul className="lab-list">
                {RULES.map((r) => (
                  <li key={r.id} className="lab-list__item">
                    {/* кастомный ConstraintBadge на color-mix */}
                    <span className={`lab-badge lab-badge--${r.effect}`}>{EFFECT_LABEL[r.effect]}</span>
                    <span style={{ fontWeight: 500 }}>{r.ruleText}</span>
                    {predicateText(r) && <span className="lab-faint">{predicateText(r)}</span>}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      <Button variant="ghost" size="sm">Edit</Button>
                      {/* tone="danger" — написания больше нет с 2.2.0 */}
                      <Button variant="ghost" size="sm">Delete</Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* их tk-card вокруг формы — третий уровень рамок */}
              <div className="lab-inner-card">
                <Select label="Effect" size="sm" options={[{ value: 'deny', label: 'запрет' }]} defaultValue="deny" />
                <TextField label="Rule" size="sm" placeholder="Не закрывать задачу без…" />
                <Select label="Predicate" size="sm" options={[{ value: 'typed', label: 'условие' }]} defaultValue="typed" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm">Save</Button>
                  <Button size="sm" variant="secondary">Cancel</Button>
                </div>
              </div>

              <details className="lab-details" open>
                <summary>Что писать в Rule</summary>
                <div>
                  <p>Одно предложение в повелительном наклонении.</p>
                  <ul><li>Не закрывать задачу без ссылки на коммит</li><li>Оценку ставить до начала работы</li></ul>
                </div>
              </details>
            </div>
          </div>
        </section>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * ВАРИАНТ B — на примитивах ДС
 * ------------------------------------------------------------------ */

const HELP = [
  {
    id: 'help',
    title: 'Что писать в Rule',
    content: (
      <Stack gap={2}>
        <p style={{ margin: 0 }}>Одно предложение в повелительном наклонении — то, что агент должен сделать или не делать.</p>
        <ul style={{ margin: 0, paddingLeft: 'var(--ds-space-6)' }}>
          <li>Не закрывать задачу без ссылки на коммит</li>
          <li>Оценку ставить до начала работы</li>
          <li>Правки в main только через ветку</li>
        </ul>
      </Stack>
    ),
  },
]

function DsShape() {
  const [editing, setEditing] = useState<string | null>(null)
  const [ruleText, setRuleText] = useState('')
  const [touched, setTouched] = useState(false)

  const ruleError = touched && ruleText.trim() === '' ? 'Правило не может быть пустым' : undefined

  const columns: Column<Rule>[] = [
    {
      id: 'effect',
      header: 'Эффект',
      // Числом, а не `'5.5rem'`: голый rem не едет с `--ds-ui-scale`, а высота
      // строки едет, и под `.ds-scale` сетка расходится (DS-82).
      // 88px = те же 5.5rem при базовом размере.
      width: 88,
      render: (r) => <Badge tone={EFFECT_TONE[r.effect]}>{EFFECT_LABEL[r.effect]}</Badge>,
    },
    { key: 'ruleText', header: 'Правило' },
    {
      id: 'predicate',
      header: 'Условие',
      render: (r) =>
        predicateText(r)
          ? <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>{predicateText(r)}</span>
          : <span style={{ color: 'var(--ds-text-muted)' }}>—</span>,
    },
    {
      id: 'actions',
      // 72px было мало: две иконочные кнопки дают 58px + 8/8 отступов ячейки =
      // 74px. Переполнение на 2px браузер дорисовывает многоточием
      // `text-overflow` — его нет ни в DOM, ни в `::after`, поэтому DOM-пробы
      // молчат, а на пикселях у бордера видны три точки.
      // Числом, а не `'7.5rem'`: см. колонку «Эффект» выше.
      width: 120,
      actions: (r) => [
        { id: 'edit', icon: <IconPencil size={16} />, label: `Изменить: ${r.ruleText}`, onSelect: () => { setEditing(r.id); setRuleText(r.ruleText); setTouched(false) } },
        { id: 'delete', icon: <IconTrash size={16} />, label: `Удалить: ${r.ruleText}`, tone: 'error', onSelect: () => {} },
      ],
    },
  ]

  return (
    <Card
      className="lab-card"
      title="Project constraints"
      icon={<IconSettings size={13} />}
      // Кнопка Add уезжает в шапку САМОЙ карточки — свой заголовок секции не нужен
      headerAction={
        editing === null
          ? <Button variant="ghost" size="sm" onClick={() => { setEditing('new'); setRuleText(''); setTouched(false) }}>Добавить</Button>
          : null
      }
      noPadding={false}
    >
      {/* Явный шаблон, а НЕ minColumnWidth: тот разворачивается в
          `repeat(auto-fill, minmax(20rem, 1fr))` и на широкой карточке нарезает
          четыре колонки — мастер схлопывается в 320px и рвёт текст. Здесь два
          пейна: список забирает остаток, форма стоит фиксированной колонкой. */}
      <Grid columns="minmax(0, 1fr) minmax(0, 28.5rem)" gap={5}>
        {/* ЛЕВО: список правил */}
        {RULES.length === 0
          ? <EmptyState title="Правил пока нет" description="Добавьте первое — оно применится ко всем задачам проекта." />
          : <DataTable columns={columns} rows={RULES} getRowId={(r) => r.id} dense />}

        {/* ПРАВО: форма и справка */}
        <Stack gap={4}>
          {editing !== null && (
            <Stack gap={3}>
              <Select
                label="Эффект" size="sm" defaultValue="deny"
                options={[{ value: 'deny', label: 'запрет' }, { value: 'advise', label: 'совет' }]}
              />
              <TextField
                label="Правило" size="sm"
                placeholder="Не закрывать задачу без ссылки на коммит"
                hint="Одно предложение в повелительном наклонении."
                value={ruleText}
                error={ruleError}
                onChange={(e) => setRuleText(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              <Select
                label="Предикат" size="sm" defaultValue="none"
                options={[{ value: 'none', label: 'всегда' }, { value: 'typed', label: 'по условию' }]}
              />
              <Stack direction="row" gap={2}>
                <Button size="sm" onClick={() => setTouched(true)}>Сохранить</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Отмена</Button>
              </Stack>
            </Stack>
          )}

          <Accordion items={HELP} defaultOpenIds={['help']} />
        </Stack>
      </Grid>
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Проба C — почему в узкой колонке FormRow не подходит
 * ------------------------------------------------------------------ */

function FormRowProbe() {
  return (
    <Grid columns={2} gap={5}>
      <Card className="lab-card" title="FormRow (метка 8.75rem слева)">
        <Stack gap={3}>
          <FormRow label="Эффект"><Select options={[{ value: 'deny', label: 'запрет' }]} size="sm" /></FormRow>
          <FormRow label="Правило"><TextField size="sm" placeholder="Не закрывать задачу без…" /></FormRow>
        </Stack>
      </Card>
      <Card className="lab-card" title="Своя метка контрола (вертикально)">
        <Stack gap={3}>
          <Select label="Эффект" size="sm" options={[{ value: 'deny', label: 'запрет' }]} />
          <TextField label="Правило" size="sm" placeholder="Не закрывать задачу без ссылки на коммит" />
        </Stack>
      </Card>
    </Grid>
  )
}

function App() {
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setTheme('light')
    initTheme()
  }, [])

  return (
    <div className="lab ds-root">
      <header className="lab__head">
        <div>
          <h1 className="lab__title">ConstraintsEditor — DS-55</h1>
          <p className="lab__hint">
            Слева реконструкция присланного кода (их <code>tk-*</code> заменены инлайновыми
            стилями того же смысла), справа — то же на примитивах ДС. Переключи тему: конфликт
            токенов виден именно в тёмной.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="lab__row">
        <div className="lab__col">
          <h2 className="lab__h2">A. Как сейчас (реконструкция)</h2>
          <CurrentShape />
        </div>
        <div className="lab__col">
          <h2 className="lab__h2">B. На примитивах ДС</h2>
          <DsShape />
        </div>
      </section>

      <section>
        <h2 className="lab__h2">C. FormRow против собственной метки контрола в узкой колонке</h2>
        <FormRowProbe />
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
