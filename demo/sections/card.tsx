import { useState } from 'react'
import { IconRefresh, IconSettings, IconX } from '@tabler/icons-react'
import { Card } from '../../src/components/Form/index.js'
import { Tabs, TabPanel } from '../../src/components/Tabs/index.js'
import { DemoBlock } from '../demo-spec.js'

const ICON = { size: 16, stroke: 1.75 } as const

/** Card с вкладками внутри: тело без паддинга, лента вкладок впритык к краям. */
function TabbedCard() {
  const [tab, setTab] = useState('req')
  const tabs = [
    { id: 'req', label: 'Реквизиты' },
    { id: 'history', label: 'История', count: 4 },
    { id: 'files', label: 'Файлы', count: 2 },
  ]
  const body: Record<string, string> = {
    req: 'ИНН, КПП, юридический адрес, банковские счета.',
    history: 'Хронология изменений по заявке.',
    files: 'Вложения: договор.pdf, акт.pdf.',
  }
  return (
    <Card title="Заявка №1024" subtitle="ООО «Ромашка»" noPadding>
      <div style={{ padding: 'var(--ds-space-5)' }}>
        <Tabs tabs={tabs} selectedId={tab} onSelect={setTab} id="card-tabs" />
        <TabPanel tabsId="card-tabs" selectedId={tab}>
          <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>{body[tab]}</div>
        </TabPanel>
      </div>
    </Card>
  )
}

export function CardSection() {
  return (
    <section className="demo-section" id="card">
      <h2 className="demo-section__title">Card</h2>
      <div className="demo-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <DemoBlock
          name="Card"
          block
          code={'<Card title="Продажи" subtitle="за месяц" headerAction={…}>…</Card>'}
        >
          <Card title="Продажи" subtitle="за месяц" headerAction={<button type="button" className="ds-btn ds-btn--ghost ds-btn--sm">Ещё</button>}>
            <div style={{ fontSize: 'var(--ds-fs-2xl)', fontWeight: 600 }}>1,24 млн ₽</div>
          </Card>
        </DemoBlock>
        <DemoBlock
          name="Card · collapsible"
          block
          code={'<Card title="Фильтры" collapsible>…</Card>'}
        >
          <Card title="Фильтры" subtitle="клик по шапке сворачивает" collapsible>
            <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>
              Тело панели. Нажмите на заголовок или шеврон — панель свернётся до шапки.
            </div>
          </Card>
        </DemoBlock>
        <DemoBlock
          name="Card · tools"
          block
          code={'<Card title="Виджет" tools={[{ id, icon, label, onSelect }]} headerAction={…} />'}
        >
          <Card
            title="Виджет"
            tools={[
              { id: 'refresh', icon: <IconRefresh {...ICON} />, label: 'Обновить', onSelect: () => {} },
              { id: 'settings', icon: <IconSettings {...ICON} />, label: 'Настройки', onSelect: () => {} },
              { id: 'close', icon: <IconX {...ICON} />, label: 'Закрыть', onSelect: () => {} },
            ]}
            headerAction={<button type="button" className="ds-btn ds-btn--ghost ds-btn--sm">Все</button>}
          >
            <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>
              Инструменты в шапке — каждый со своим доступным именем; клик не сворачивает панель.
            </div>
          </Card>
        </DemoBlock>
        <DemoBlock
          name="Card · framed"
          block
          code={'<Card title="Отчёт" variant="framed">…</Card>'}
        >
          <Card title="Отчёт" subtitle="акцентная шапка" variant="framed">
            <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>
              Обрамлённый вид: рамка построже, шапка на акценте.
            </div>
          </Card>
        </DemoBlock>
        <DemoBlock
          name="Card · toolbar"
          block
          code={'<Card title="Документы" toolbar={<…кнопки…>}>…</Card>'}
        >
          <Card
            title="Документы"
            toolbar={
              <>
                <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm">Добавить</button>
                <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm">Импорт</button>
                <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm">Экспорт</button>
              </>
            }
          >
            <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>
              Док-тулбар под шапкой над телом. Нижний бар — это существующий footer.
            </div>
          </Card>
        </DemoBlock>
        <DemoBlock
          name="Card + Tabs внутри"
          block
          code={'<Card title="Заявка" noPadding><Tabs …/><TabPanel …/></Card>'}
        >
          <TabbedCard />
        </DemoBlock>
      </div>
    </section>
  )
}
