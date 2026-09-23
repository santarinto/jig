import { useState } from 'react'
import { NumberField } from '@santarinto/jig'

export const Weight = () => {
  const [v, setV] = useState(72.5)
  return <NumberField label="Вес" value={v} onChange={setV} min={0} max={300} step={0.5} suffix="кг" />
}

export const Reps = () => {
  const [v, setV] = useState(10)
  return <NumberField label="Повторы" value={v} onChange={setV} min={0} max={100} step={1} />
}

export const Volume = () => {
  const [v, setV] = useState(250)
  return <NumberField label="Объём" size="sm" value={v} onChange={setV} min={0} max={1000} step={50} suffix="мл" />
}
