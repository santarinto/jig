import { useState } from 'react'
import { DatePicker } from '@santarinto/jig'

export const Default = () => {
  const [v, setV] = useState('2026-07-24')
  return (
    <div style={{ width: 240 }}>
      <DatePicker label="Дата тренировки" value={v} onChange={setV} hint="Можно ввести вручную" />
    </div>
  )
}

export const Ranged = () => {
  const [v, setV] = useState('2026-07-10')
  return (
    <div style={{ width: 240 }}>
      <DatePicker label="Июль 2026" value={v} onChange={setV} min="2026-07-01" max="2026-07-31" />
    </div>
  )
}

export const WithError = () => {
  const [v, setV] = useState('2026-07-24')
  return (
    <div style={{ width: 240 }}>
      <DatePicker label="Дата" size="sm" value={v} onChange={setV} error="Дата в будущем" />
    </div>
  )
}
