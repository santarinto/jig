import { useState } from 'react'
import { Combobox, type ComboboxOption } from '@santarinto/jig'

const cur = [{ value: 'rub', label: 'Рубль', icon: '₽' }, { value: 'usd', label: 'Доллар США', icon: '$' }, { value: 'eur', label: 'Евро', icon: '€' }]

export const Default = () => <div style={{ width: 240, height: 60 }}><Combobox label="Валюта" options={cur} value="rub" onChange={() => {}} /></div>

export const WithCreate = () => {
  const [options, setOptions] = useState<ComboboxOption[]>([
    { value: 'squat', label: 'Приседания' },
    { value: 'bench', label: 'Жим лёжа' },
  ])
  const [value, setValue] = useState('bench')
  return (
    <div style={{ width: 240, height: 60 }}>
      <Combobox
        label="Упражнение"
        options={options}
        value={value}
        onChange={setValue}
        onCreate={(label) => {
          const v = label.toLowerCase().replace(/\s+/g, '-')
          setOptions((o) => [...o, { value: v, label }])
          setValue(v)
        }}
      />
    </div>
  )
}
