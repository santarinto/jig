import { useState } from 'react'
import { IconChevronDown, IconHome } from '@tabler/icons-react'
import { Button, type ButtonSize } from '../../src/components/Button/index.js'
import { DropdownMenu } from '../../src/components/DropdownMenu/index.js'
import { Checkbox } from '../../src/components/Toggle/index.js'
import { DemoSpec } from '../demo-spec.js'
import { DemoMatrix, DemoGrid } from '../demo-matrix.js'
import { buttonMatrixCode, buttonMatrixName, buttonVariantCode } from '../spec-code.js'
import '../button-matrix.css'

// DS-360: `top`/`bottom` ушли вместе с `is-stacked` — демо-выдумкой без
// API в системе (решение координатора: демо не учит классам, которых нет).
// `left`/`right` — реальные пропы Button, `icon`/`iconEnd`.
type Layout = 'text' | 'icon' | 'left' | 'right'

const SIZES: { size: ButtonSize; label: string }[] = [
  { size: 'sm', label: 'Small' },
  { size: 'md', label: 'Medium' },
  { size: 'lg', label: 'Large' },
]

const ROWS: { layout: Layout; label: string }[] = [
  { layout: 'text', label: 'Text Only' },
  { layout: 'icon', label: 'Icon Only' },
  { layout: 'left', label: 'Icon and Text (left)' },
  { layout: 'right', label: 'Icon and Text (right)' },
]

const SIZE_LABEL: Record<ButtonSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' }

function MatrixButton({
  layout, size, disabled,
}: {
  layout: Layout
  size: ButtonSize
  disabled: boolean
}) {
  // Значок через `icon`/`iconEnd` идёт в системный `<Icon>` (гейт `icon-contract`)
  // и держит ОДИН размер по `--ds-size-icon`, а не по размеру кнопки — своего
  // масштабирования по sm/md/lg в системе нет (`icons/Icon.tsx`: проп `size` не
  // взят намеренно), так что демо больше не подбирает px под ряд.
  const icon = <IconHome stroke={1.75} aria-hidden />
  const text = SIZE_LABEL[size]

  if (layout === 'icon') {
    return <Button variant="primary" size={size} iconOnly icon={icon} disabled={disabled} aria-label="Home" />
  }
  if (layout === 'text') {
    return (
      <Button variant="primary" size={size} disabled={disabled}>
        {text}
      </Button>
    )
  }
  if (layout === 'right') {
    return (
      <Button variant="primary" size={size} iconEnd={icon} disabled={disabled}>
        {text}
      </Button>
    )
  }
  return (
    <Button variant="primary" size={size} icon={icon} disabled={disabled}>
      {text}
    </Button>
  )
}

export function ButtonMatrixDemo() {
  const [disabled, setDisabled] = useState(false)

  return (
    <div className="demo-matrix-host">
      <DemoMatrix
        title="Primary — размер × раскладка"
        columns={SIZES.map((s) => ({ id: s.size, label: s.label }))}
        rows={ROWS.map((r) => ({ id: r.layout, label: r.label }))}
        name={(row, col) => buttonMatrixName(row.id as Layout, col.id as ButtonSize)}
        code={(row, col) => buttonMatrixCode(row.id as Layout, col.id as ButtonSize, disabled)}
        render={(row, col) => (
          <MatrixButton
            layout={row.id as Layout}
            size={col.id as ButtonSize}
            disabled={disabled}
          />
        )}
        toolbar={
          <Checkbox
            label="Disabled"
            checked={disabled}
            onChange={(e) => setDisabled(e.target.checked)}
          />
        }
      />
    </div>
  )
}

const GROUP_OPTS = [
  { id: '1', label: 'Option One' },
  { id: '2', label: 'Option Two' },
  { id: '3', label: 'Option Three' },
] as const

const MENU_ITEMS = [
  { id: 'item-1', label: 'Menu Item 1', onSelect: () => {} },
  { id: 'item-2', label: 'Menu Item 2', onSelect: () => {} },
  { id: 'item-3', label: 'Menu Item 3', onSelect: () => {} },
]

function MenuButton({ disabled, defaultOpen }: { disabled: boolean; defaultOpen?: boolean }) {
  // Каретка — `iconEnd` (DS-360), не безымянный child со своим классом;
  // размер даёт `<Icon>` по `--ds-size-icon`, свой `size` тут лишний.
  const caret = <IconChevronDown stroke={1.75} aria-hidden />
  if (disabled) {
    return (
      <Button variant="primary" disabled iconEnd={caret}>
        Menu Button
      </Button>
    )
  }
  return (
    <DropdownMenu
      className="demo-menu-btn"
      defaultOpen={defaultOpen}
      items={MENU_ITEMS}
      // Триггер — настоящая кнопка системы (DS-359). Прежде сюда клали
      // фрагмент, а заливку `primary` демо перерисовывало на обёртке
      // `.ds-dropdown__triggerwrap` своим правилом в `button-matrix.css`.
      trigger={(
        <Button variant="primary" iconEnd={caret}>
          Menu Button
        </Button>
      )}
    />
  )
}

function SplitButton({ disabled }: { disabled: boolean }) {
  return (
    <div className="demo-btn-group" role="group" aria-label="Split Button">
      <Button variant="primary" disabled={disabled}>Split Button</Button>
      <Button variant="primary" iconOnly disabled={disabled} aria-label="Ещё">
        <IconChevronDown size={16} stroke={1.75} aria-hidden />
      </Button>
    </div>
  )
}

function IconsRow({ disabled, vertical, menuDefaultOpen }: {
  disabled: boolean
  vertical?: boolean
  menuDefaultOpen?: boolean
}) {
  if (vertical) {
    return (
      <div className="demo-btn-group demo-btn-group--vertical demo-btn-group--block" role="group" aria-label="Icons and Arrows">
        <Button variant="primary" disabled={disabled}>
          <IconHome size={16} stroke={1.75} className="demo-btn-matrix__icon" aria-hidden />
          Button
        </Button>
        <div className="demo-btn-group__menu">
          <MenuButton disabled={disabled} defaultOpen={menuDefaultOpen} />
        </div>
        <SplitButton disabled={disabled} />
      </div>
    )
  }
  return (
    <>
      <Button variant="primary" disabled={disabled}>
        <IconHome size={16} stroke={1.75} className="demo-btn-matrix__icon" aria-hidden />
        Button
      </Button>
      <MenuButton disabled={disabled} defaultOpen={menuDefaultOpen} />
      <SplitButton disabled={disabled} />
    </>
  )
}

export function ButtonGroupsDemo() {
  const [disabled, setDisabled] = useState(false)
  const [single, setSingle] = useState('2')
  const [multi, setMulti] = useState<Set<string>>(() => new Set(['2']))

  const toggleMulti = (id: string) => {
    setMulti((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="demo-card demo-card--plain">
      <p className="demo-card__label">Groups — toggle и составные</p>
      <div className="demo-btn-matrix__toolbar">
        <Checkbox
          label="Disabled"
          checked={disabled}
          onChange={(e) => setDisabled(e.target.checked)}
        />
      </div>
      <div className="demo-btn-groups-wrap">
        <div className="demo-btn-groups" role="table" aria-label="Button groups">
          <div className="demo-btn-groups__row">
            <div className="demo-btn-groups__label" role="rowheader">Toggle Group</div>
            <div className="demo-btn-groups__cell" role="cell">
              <DemoSpec
                inline
                name="Button Group · Toggle"
                code={`// Слитная группа кнопок — паттерна нет в DS (ToggleGroup в бэклоге, P1-1).
// Обвязка — локальный стиль демо, не API системы.
<div role="group" aria-label="Toggle Group">
  <Button variant="secondary" aria-pressed={false}>Option One</Button>
  <Button variant="primary" aria-pressed>Option Two</Button>
  <Button variant="secondary" aria-pressed={false}>Option Three</Button>
</div>`}
              >
                <div className="demo-btn-group" role="group" aria-label="Toggle Group">
                  {GROUP_OPTS.map((opt) => (
                    <Button
                      key={opt.id}
                      variant={single === opt.id ? 'primary' : 'secondary'}
                      disabled={disabled}
                      aria-pressed={single === opt.id}
                      onClick={() => setSingle(opt.id)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </DemoSpec>
            </div>
          </div>

          <div className="demo-btn-groups__row">
            <div className="demo-btn-groups__label" role="rowheader">Multiple Toggle</div>
            <div className="demo-btn-groups__cell" role="cell">
              <DemoSpec
                inline
                name="Button Group · Multiple Toggle"
                code={`// Слитная группа кнопок — паттерна нет в DS (ToggleGroup в бэклоге, P1-1).
// Обвязка — локальный стиль демо, не API системы. Multiple: у каждой кнопки
// свой aria-pressed, нажатых может быть несколько.
<div role="group" aria-label="Multiple Toggle">
  <Button variant="secondary" aria-pressed={false}>Option One</Button>
  <Button variant="primary" aria-pressed>Option Two</Button>
  <Button variant="secondary" aria-pressed={false}>Option Three</Button>
</div>`}
              >
                <div className="demo-btn-group" role="group" aria-label="Multiple Toggle">
                  {GROUP_OPTS.map((opt) => (
                    <Button
                      key={opt.id}
                      variant={multi.has(opt.id) ? 'primary' : 'secondary'}
                      disabled={disabled}
                      aria-pressed={multi.has(opt.id)}
                      onClick={() => toggleMulti(opt.id)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </DemoSpec>
            </div>
          </div>

          <div className="demo-btn-groups__row">
            <div className="demo-btn-groups__label" role="rowheader">No Toggle</div>
            <div className="demo-btn-groups__cell" role="cell">
              <DemoSpec
                inline
                name="Button Group · No Toggle"
                code={`// Слитная группа кнопок — паттерна нет в DS (ToggleGroup в бэклоге, P1-1).
// Обвязка — локальный стиль демо, не API системы.
<div role="group" aria-label="No Toggle">
  <Button variant="secondary">Option One</Button>
  <Button variant="secondary">Option Two</Button>
  <Button variant="secondary">Option Three</Button>
</div>`}
              >
                <div className="demo-btn-group" role="group" aria-label="No Toggle">
                  {GROUP_OPTS.map((opt) => (
                    <Button key={opt.id} variant="secondary" disabled={disabled}>
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </DemoSpec>
            </div>
          </div>

          <div className="demo-btn-groups__row">
            <div className="demo-btn-groups__label" role="rowheader">Icons and Arrows</div>
            <div className="demo-btn-groups__cell demo-btn-groups__cell--spread" role="cell">
              <div className="demo-row demo-row--spec">
                <DemoSpec
                  inline
                  name="Button · Icon + Text"
                  code={'<Button variant="primary">\n  <IconHome />\n  Button\n</Button>'}
                >
                  <Button variant="primary" disabled={disabled}>
                    <IconHome size={16} stroke={1.75} className="demo-btn-matrix__icon" aria-hidden />
                    Button
                  </Button>
                </DemoSpec>
                <DemoSpec
                  inline
                  name="Menu Button"
                  code={`<DropdownMenu
  items={[
    { label: 'Menu Item 1', onSelect: () => {} },
    { label: 'Menu Item 2', onSelect: () => {} },
    { label: 'Menu Item 3', onSelect: () => {} },
  ]}
  trigger={<Button variant="primary" iconEnd={<IconChevronDown />}>Menu Button</Button>}
/>`}
                >
                  <MenuButton disabled={disabled} defaultOpen />
                </DemoSpec>
                <DemoSpec
                  inline
                  name="Split Button"
                  code={`// Слитная пара «действие + меню» — паттерна нет в DS (бэклог).
// Обвязка — локальный стиль демо, не API системы.
<div role="group" aria-label="Split Button">
  <Button variant="primary">Split Button</Button>
  <Button variant="primary" iconOnly aria-label="Ещё">
    <IconChevronDown />
  </Button>
</div>`}
                >
                  <SplitButton disabled={disabled} />
                </DemoSpec>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="demo-btn-groups__section-title">Vertical</p>
      <div className="demo-btn-groups-v-wrap">
        <div className="demo-btn-groups-v" role="table" aria-label="Vertical button groups">
          <div className="demo-btn-groups-v__col" role="cell">
            <div className="demo-btn-groups-v__head" role="columnheader">Toggle Group</div>
            <DemoSpec
              inline
              name="Button Group · Toggle · Vertical"
              code={`// Слитная группа кнопок — паттерна нет в DS (ToggleGroup в бэклоге, P1-1).
// Обвязка (в т.ч. вертикальная укладка) — локальный стиль демо, не API системы.
<div role="group" aria-label="Toggle Group vertical">
  <Button variant="secondary" aria-pressed={false}>Option One</Button>
  <Button variant="primary" aria-pressed>Option Two</Button>
  <Button variant="secondary" aria-pressed={false}>Option Three</Button>
</div>`}
            >
              <div className="demo-btn-group demo-btn-group--vertical demo-btn-group--block" role="group" aria-label="Toggle Group vertical">
                {GROUP_OPTS.map((opt) => (
                  <Button
                    key={opt.id}
                    variant={single === opt.id ? 'primary' : 'secondary'}
                    disabled={disabled}
                    aria-pressed={single === opt.id}
                    onClick={() => setSingle(opt.id)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </DemoSpec>
          </div>

          <div className="demo-btn-groups-v__col" role="cell">
            <div className="demo-btn-groups-v__head" role="columnheader">Multiple Toggle</div>
            <DemoSpec
              inline
              name="Button Group · Multiple · Vertical"
              code={`// Слитная группа кнопок — паттерна нет в DS (ToggleGroup в бэклоге, P1-1).
// Обвязка (в т.ч. вертикальная укладка) — локальный стиль демо, не API системы. Multiple: у каждой кнопки
// свой aria-pressed, нажатых может быть несколько.
<div role="group" aria-label="Multiple Toggle vertical">
  <Button variant="secondary" aria-pressed={false}>Option One</Button>
  <Button variant="primary" aria-pressed>Option Two</Button>
  <Button variant="secondary" aria-pressed={false}>Option Three</Button>
</div>`}
            >
              <div className="demo-btn-group demo-btn-group--vertical demo-btn-group--block" role="group" aria-label="Multiple Toggle vertical">
                {GROUP_OPTS.map((opt) => (
                  <Button
                    key={opt.id}
                    variant={multi.has(opt.id) ? 'primary' : 'secondary'}
                    disabled={disabled}
                    aria-pressed={multi.has(opt.id)}
                    onClick={() => toggleMulti(opt.id)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </DemoSpec>
          </div>

          <div className="demo-btn-groups-v__col" role="cell">
            <div className="demo-btn-groups-v__head" role="columnheader">No Toggle</div>
            <DemoSpec
              inline
              name="Button Group · No Toggle · Vertical"
              code={`// Слитная группа кнопок — паттерна нет в DS (ToggleGroup в бэклоге, P1-1).
// Обвязка (в т.ч. вертикальная укладка) — локальный стиль демо, не API системы.
<div role="group" aria-label="No Toggle vertical">
  <Button variant="secondary">Option One</Button>
  <Button variant="secondary">Option Two</Button>
  <Button variant="secondary">Option Three</Button>
</div>`}
            >
              <div className="demo-btn-group demo-btn-group--vertical demo-btn-group--block" role="group" aria-label="No Toggle vertical">
                {GROUP_OPTS.map((opt) => (
                  <Button key={opt.id} variant="secondary" disabled={disabled}>
                    {opt.label}
                  </Button>
                ))}
              </div>
            </DemoSpec>
          </div>

          <div className="demo-btn-groups-v__col" role="cell">
            <div className="demo-btn-groups-v__head" role="columnheader">Icons and Arrows</div>
            <DemoSpec
              inline
              name="Button Group · Icons · Vertical"
              code={`// Вертикальный столбец из кнопки, меню и split button.
// Укладка и слитные углы — локальный стиль демо, не API системы.
<div role="group" aria-label="Icons and Arrows">
  <Button variant="primary">
    <IconHome />
    Button
  </Button>
  <DropdownMenu items={items} trigger={<Button variant="primary" iconEnd={<IconChevronDown />}>Menu Button</Button>} />
  <div role="group" aria-label="Split Button">
    <Button variant="primary">Split Button</Button>
    <Button variant="primary" iconOnly aria-label="Ещё">
      <IconChevronDown />
    </Button>
  </div>
</div>`}
            >
              <IconsRow disabled={disabled} vertical />
            </DemoSpec>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ButtonVariantsDemo() {
  const [loading, setLoading] = useState(false)

  const items = [
    { id: 'primary', name: 'Button · Primary', code: buttonVariantCode('primary', 'Primary'),
      render: () => <Button variant="primary">Primary</Button> },
    { id: 'secondary', name: 'Button · Secondary', code: buttonVariantCode('secondary', 'Secondary'),
      render: () => <Button variant="secondary">Secondary</Button> },
    { id: 'ghost', name: 'Button · Ghost', code: buttonVariantCode('ghost', 'Ghost'),
      render: () => <Button variant="ghost">Ghost</Button> },
    { id: 'danger', name: 'Button · Danger', code: buttonVariantCode('danger', 'Danger'),
      render: () => <Button variant="danger">Danger</Button> },
    { id: 'success', name: 'Button · Success', code: buttonVariantCode('success', 'Success'),
      render: () => <Button variant="success">Success</Button> },
    { id: 'sm', name: 'Button · Small', code: buttonVariantCode('secondary', 'Small', 'sm'),
      render: () => <Button size="sm" variant="secondary">Small</Button> },
    { id: 'md', name: 'Button · Medium', code: buttonVariantCode('primary', 'Medium', 'md'),
      render: () => <Button size="md">Medium</Button> },
    { id: 'lg', name: 'Button · Large', code: buttonVariantCode('primary', 'Large', 'lg'),
      render: () => <Button size="lg">Large</Button> },
    { id: 'loading', name: 'Button · Loading', code: '<Button loading={loading}>Toggle loading</Button>',
      render: () => (
        <Button loading={loading} onClick={() => setLoading((v) => !v)}>
          {loading ? 'Loading…' : 'Toggle loading'}
        </Button>
      ) },
  ]

  return <DemoGrid title="Variant и размер" items={items} columns={5} />
}
