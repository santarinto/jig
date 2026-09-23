import { useState } from 'react'
import { Modal, Button } from '@santarinto/jig'

// The card harness puts `transform: translateZ(0)` on the mount node. Since 1.31.0 the
// overlay portals to document.body by default — on the capture page that's the whole
// viewport, not the card. Mounting into the stage keeps the overlay inside the card:
// the stage's own transform makes it the containing block for `position: fixed`.
const Stage = ({ children }: { children: (container: HTMLElement) => React.ReactNode }) => {
  const [node, setNode] = useState<HTMLElement | null>(null)
  return (
    <div ref={setNode} style={{ transform: 'translateZ(0)', height: 340 }}>
      {node && children(node)}
    </div>
  )
}

export const Confirm = () => (
  <Stage>
    {(container) => (
      <Modal open container={container} onClose={() => {}} title="Подтверждение"
        footer={<><Button variant="ghost" size="sm">Отмена</Button><Button variant="danger" size="sm">Удалить</Button></>}>
        Удалить документ «Реализация №РТ-0001»? Действие необратимо.
      </Modal>
    )}
  </Stage>
)
