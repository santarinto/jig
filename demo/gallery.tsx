import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import './gallery.css'

import { Combobox, type ComboboxOption } from '../src/components/Combobox'

function ComboboxDemo() {
  const [options, setOptions] = useState<ComboboxOption[]>([
    { value: 'squat', label: 'Приседания' },
    { value: 'bench', label: 'Жим лёжа' },
    { value: 'deadlift', label: 'Становая тяга' },
  ])
  const [value, setValue] = useState('bench')

  const create = (label: string) => {
    const value = label.toLowerCase().replace(/\s+/g, '-')
    setOptions((o) => [...o, { value, label }])
    setValue(value)
  }

  return (
    <div style={{ display: 'grid', gap: 12, width: 280 }}>
      <div className="case__sub">Введи «планк» → строка «Создать»</div>
      <Combobox label="Упражнение" options={options} value={value} onChange={setValue} onCreate={create} placeholder="Выберите…" />
      <div style={{ fontSize: 12, color: 'var(--ds-text-muted)' }}>
        Всего опций: {options.length}
      </div>
    </div>
  )
}

function Panel({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className="pane" data-theme={theme}>
      <div className="pane__label">{theme}</div>
      <section className="case">
        <h3 className="case__title">Combobox — onCreate</h3>
        <ComboboxDemo />
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="split">
      <Panel theme="light" />
      <Panel theme="dark" />
    </div>
  </StrictMode>,
)
