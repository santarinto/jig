import './Tabs.css'

export interface TabPanelProps {
  /**
   * Тот же `id`, что у соседних `Tabs`. Из него собираются связи: панель
   * получает `id="${tabsId}-panel"`, на который ссылаются вкладки, и
   * `aria-labelledby` на активную вкладку.
   *
   * Обязателен намеренно. Панель без связи выглядела бы точно так же, но
   * перестала бы быть панелью для всех, кто её не видит.
   */
  tabsId: string
  /** Тот же `selectedId`, что у `Tabs`: панель называется активной вкладкой. */
  selectedId: string
  /**
   * Убрать внутренний паддинг — под содержимое, у которого свои края:
   * `DataTable` рисует строки от границы до границы и несёт свои разделители.
   *
   * Слово то же, что у `Card`, а не `padding={false}`: два имени для одного
   * понятия в одной системе хуже любого из них.
   */
  noPadding?: boolean
  children?: React.ReactNode
  className?: string
}

export function TabPanel({ tabsId, selectedId, noPadding = false, children, className }: TabPanelProps) {
  return (
    <div
      id={`${tabsId}-panel`}
      role="tabpanel"
      aria-labelledby={`${tabsId}-tab-${selectedId}`}
      // Панель фокусируема: содержимое может не иметь ни одного управляемого
      // элемента (график, текст), и тогда до него нельзя добраться с клавиатуры.
      tabIndex={0}
      className={['ds-tabs__panel', noPadding && 'ds-tabs__panel--flush', className]
        .filter(Boolean).join(' ')}
    >{children}</div>
  )
}
