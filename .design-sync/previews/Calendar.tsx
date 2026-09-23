import { useState } from 'react'
import { Calendar } from '@santarinto/jig'

export const Month = () => {
  const [view, setView] = useState({ y: 2026, m: 6 })
  return (
    <Calendar
      year={view.y}
      month={view.m}
      selectedId="2026-07-24"
      onSelect={() => {}}
      onNavigate={(y, m) => setView({ y, m })}
      onToday={() => setView({ y: 2026, m: 6 })}
    />
  )
}

const trainingMarks = [
  '2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24',
  '2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22',
  '2026-08-05', '2026-08-12',
]

export const ThreeMonthsMarked = () => (
  <Calendar
    year={2026}
    month={6}
    months={3}
    markedDates={trainingMarks}
    marks={{ '2026-07-22': 'success', '2026-08-12': 'warning' }}
    onNavigate={() => {}}
  />
)

export const ReadOnlyOverview = () => (
  <Calendar
    year={2026}
    month={6}
    months={3}
    readOnly
    markedDates={trainingMarks}
    selectedId="2026-07-26"
  />
)
