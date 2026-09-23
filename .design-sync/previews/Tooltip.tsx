import { Tooltip, Button } from '@santarinto/jig'
export const Default = () => (
  <div style={{ padding: '48px 16px 16px' }}>
    <style>{'.ds-tooltip__bubble{opacity:1 !important;visibility:visible !important}'}</style>
    <Tooltip label="Провести документ (Ctrl+Enter)">
      <Button variant="secondary">Навести для подсказки</Button>
    </Tooltip>
  </div>
)
