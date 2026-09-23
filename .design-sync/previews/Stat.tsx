import { Stat, Badge } from '@santarinto/jig'

export const Health = () => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: 360 }}>
    <Stat label="Вес" value="71.2 кг" delta={{ value: '0.8 кг', direction: 'down', tone: 'positive' }} hint="за неделю" />
    <Stat label="Шаги сегодня" value="8 240" delta={{ value: '12%', direction: 'up' }} hint="цель 10 000" />
  </div>
)

export const Finance = () => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: 360 }}>
    <Stat label="Расходы за месяц" value="128 400 ₽" delta={{ value: '7%', direction: 'up', tone: 'negative' }} hint="к июню" />
    <Stat label="Пульс покоя" value="58" delta={{ value: '2', direction: 'down', tone: 'neutral' }} hint="уд/мин" />
  </div>
)

/**
 * Единица и статус. Единица — отдельный проп, иначе она получила бы кегль и вес
 * числа. Статус стоит у подписи, а не у значения, где уже живёт delta.
 */
export const UnitAndStatus = () => (
  <div style={{ width: 240 }}>
    <Stat
      label="За последний час"
      value={12}
      unit="commits/hour"
      adornment={<Badge tone="success">новый коммит</Badge>}
      delta={{ value: 3, direction: 'up' }}
    />
  </div>
)
