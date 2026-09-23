import { useState } from 'react'
import { ToggleGroup, type ToggleItem } from '../../src/components/ToggleGroup/index.js'
import { DemoBlock } from '../demo-spec.js'

const KINDS: ToggleItem[] = [
  { id: 'all', label: 'Все', count: 42 },
  { id: 'message', label: 'message', count: 30 },
  { id: 'pane', label: 'pane', count: 8 },
  { id: 'result', label: 'result', count: 4 },
]

const FEATURES: ToggleItem[] = [
  { id: 'bold', label: 'Жирный' },
  { id: 'italic', label: 'Курсив' },
  { id: 'under', label: 'Подчёркнутый' },
]

function SingleDemo() {
  const [kind, setKind] = useState('all')
  return (
    <ToggleGroup mode="single" value={kind} onChange={setKind} items={KINDS} aria-label="Тип записи" />
  )
}

function MultipleDemo() {
  const [on, setOn] = useState<string[]>(['bold'])
  return (
    <ToggleGroup mode="multiple" value={on} onChange={setOn} items={FEATURES} aria-label="Начертание" />
  )
}

export function ToggleGroupSection() {
  return (
    <section className="demo-section" id="togglegroup">
      <h2 className="demo-section__title">ToggleGroup</h2>
      <div className="demo-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <DemoBlock name="ToggleGroup · Single (radiogroup)" block code={`<ToggleGroup
  mode="single" value={kind} onChange={setKind}
  items={[
    { id: 'all', label: 'Все', count: 42 },
    { id: 'message', label: 'message', count: 30 },
    { id: 'pane', label: 'pane', count: 8 },
    { id: 'result', label: 'result', count: 4 },
  ]}
  aria-label="Тип записи"
/>`}>
          <SingleDemo />
        </DemoBlock>
        <DemoBlock name="ToggleGroup · Multiple (group)" block code={`<ToggleGroup
  mode="multiple" value={on} onChange={setOn}
  items={[
    { id: 'bold', label: 'Жирный' },
    { id: 'italic', label: 'Курсив' },
    { id: 'under', label: 'Подчёркнутый' },
  ]}
  aria-label="Начертание"
/>`}>
          <MultipleDemo />
        </DemoBlock>
      </div>
    </section>
  )
}
