import { useState } from 'react'
import { Button } from '../../src/components/Button/index.js'
import { Modal } from '../../src/components/Modal/index.js'
import { Drawer } from '../../src/components/Drawer/index.js'
import { Popover } from '../../src/components/Popover/index.js'
import { Tooltip } from '../../src/components/Tooltip/index.js'
import { DemoBlock } from '../demo-spec.js'

const MODAL_CODE = [
  'const [open, setOpen] = useState(false)',
  '',
  '<Button onClick={() => setOpen(true)}>Открыть модалку</Button>',
  '<Modal',
  '  open={open}',
  '  onClose={() => setOpen(false)}',
  '  title="Проведение документа"',
  '  footer={<>',
  '    <Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button>',
  '    <Button onClick={() => setOpen(false)}>Провести</Button>',
  '  </>}',
  '>',
  '  Документ будет проведён задним числом.',
  '</Modal>',
].join('\n')

const DRAWER_CODE = [
  'const [open, setOpen] = useState(false)',
  '',
  '<Button onClick={() => setOpen(true)}>Открыть панель</Button>',
  '<Drawer open={open} onClose={() => setOpen(false)} side="right" title="Фильтры">',
  '  Содержимое панели фильтров.',
  '</Drawer>',
].join('\n')

const POPOVER_CODE = [
  '// неконтролируемый режим; контролируемый — через open/onOpenChange',
  '<Popover trigger={<Button variant="secondary">Показать поповер</Button>} placement="bottom-start">',
  '  Карточка контрагента: ООО «Ромашка», ИНН 7712345678.',
  '</Popover>',
].join('\n')

const TOOLTIP_CODE = [
  '<Tooltip label="Проведёт документ задним числом">',
  '  <Button variant="secondary">Наведи на меня</Button>',
  '</Tooltip>',
].join('\n')

export function OverlaysSection() {
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <section className="demo-section" id="overlays">
      <h2 className="demo-section__title">Overlays</h2>
      <div className="demo-grid demo-grid--1">
        <div id="overlays-modal">
          <DemoBlock name="Modal" code={MODAL_CODE}>
            <Button onClick={() => setModalOpen(true)}>Открыть модалку</Button>
            <Modal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              title="Проведение документа"
              footer={<>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
                <Button onClick={() => setModalOpen(false)}>Провести</Button>
              </>}
            >
              Документ будет проведён задним числом.
            </Modal>
          </DemoBlock>
        </div>
        <div id="overlays-drawer">
          <DemoBlock name="Drawer" code={DRAWER_CODE}>
            <Button onClick={() => setDrawerOpen(true)}>Открыть панель</Button>
            <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} side="right" title="Фильтры">
              Содержимое панели фильтров.
            </Drawer>
          </DemoBlock>
        </div>
        <div id="overlays-popover">
          <DemoBlock name="Popover" code={POPOVER_CODE}>
            <Popover trigger={<Button variant="secondary">Показать поповер</Button>} placement="bottom-start">
              Карточка контрагента: ООО «Ромашка», ИНН 7712345678.
            </Popover>
          </DemoBlock>
        </div>
        <div id="overlays-tooltip">
          <DemoBlock name="Tooltip" code={TOOLTIP_CODE}>
            <Tooltip label="Проведёт документ задним числом">
              <Button variant="secondary">Наведи на меня</Button>
            </Tooltip>
          </DemoBlock>
        </div>
      </div>
    </section>
  )
}
