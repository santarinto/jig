import { Popover } from '@santarinto/jig'

export const Settings = () => (
  <div style={{ padding: '0 0 140px' }}>
    <Popover defaultOpen trigger={<button className="ds-btn ds-btn--secondary">Настройки ▾</button>}>
      <div style={{ display: 'grid', gap: 8, minWidth: 200 }}>
        <strong>Отображение</strong>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" defaultChecked /> Показывать сетку
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" /> Компактный режим
        </label>
      </div>
    </Popover>
  </div>
)

export const Info = () => (
  <div style={{ padding: '0 0 120px' }}>
    <Popover defaultOpen placement="bottom-end" trigger={<button className="ds-btn">Инфо</button>}>
      <div style={{ maxWidth: 220, color: 'var(--ds-text-secondary)' }}>
        Всплывающая панель-примитив: закрывается по клику вне и Esc.
      </div>
    </Popover>
  </div>
)
