import { Textarea } from '@santarinto/jig'

export const Default = () => (
  <div style={{ width: 320 }}>
    <Textarea label="Заметка" defaultValue="Клиент просил перезвонить после 15:00." rows={3} />
  </div>
)

export const WithCounter = () => (
  <div style={{ width: 320 }}>
    <Textarea
      label="Описание тренировки"
      placeholder="Что делали, как самочувствие…"
      hint="Кратко опишите нагрузку"
      maxLength={200}
      rows={4}
    />
  </div>
)

export const WithError = () => (
  <div style={{ width: 320 }}>
    <Textarea label="Комментарий" defaultValue="—" error="Заполните комментарий" rows={2} />
  </div>
)
