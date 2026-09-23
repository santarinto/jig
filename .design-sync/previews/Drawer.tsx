import { useState } from 'react'
import { Drawer } from '@santarinto/jig'

// See Modal.tsx: the harness mount node carries `transform`, so it is the containing
// block for the overlay's `position: fixed`. Since 1.31.0 the overlay portals to
// document.body by default — on the capture page that escapes the card entirely, so the
// panel must portal into the stage instead, whose own transform makes it the containing
// block and keeps `inset: 0` scoped to the card.
const Stage = ({ children }: { children: (container: HTMLElement) => React.ReactNode }) => {
  const [node, setNode] = useState<HTMLElement | null>(null)
  return (
    <div ref={setNode} style={{ transform: 'translateZ(0)', height: 340 }}>
      {node && children(node)}
    </div>
  )
}

const fields = (
  <div style={{ display: 'grid', gap: 12 }}>
    <div className="ds-field"><span className="ds-field__label">Контрагент</span>
      <input className="ds-input" placeholder="Начните вводить…" /></div>
    <div className="ds-field"><span className="ds-field__label">Сумма от</span>
      <input className="ds-input" placeholder="0,00" /></div>
  </div>
)

const footer = (
  <>
    <button className="ds-btn ds-btn--secondary">Сбросить</button>
    <button className="ds-btn ds-btn--primary">Применить</button>
  </>
)

export const Right = () => (
  <Stage>
    {(container) => (
      <Drawer open side="right" title="Фильтр отбора" container={container} onClose={() => {}} footer={footer}>{fields}</Drawer>
    )}
  </Stage>
)

export const Bottom = () => (
  <Stage>
    {(container) => (
      <Drawer open side="bottom" title="Действия" container={container} onClose={() => {}} footer={footer}>{fields}</Drawer>
    )}
  </Stage>
)
