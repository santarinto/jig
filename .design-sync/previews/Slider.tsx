import { useState } from 'react'
import { Slider } from '@santarinto/jig'

export const Volume = () => {
  const [v, setV] = useState(65)
  return <div style={{ width: 260 }}><Slider label="Громкость" value={v} onChange={setV} suffix="%" /></div>
}

export const Threshold = () => {
  const [v, setV] = useState(7.2)
  return <div style={{ width: 260 }}><Slider label="Порог сахара" value={v} onChange={setV} min={3} max={15} step={0.1} suffix="ммоль/л" /></div>
}

export const Disabled = () => {
  const [v, setV] = useState(40)
  return <div style={{ width: 260 }}><Slider label="Прозрачность" value={v} onChange={setV} suffix="%" disabled /></div>
}
