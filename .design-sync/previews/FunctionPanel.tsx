import { FunctionPanel } from '@santarinto/jig'
export const Sections = () => (
  <FunctionPanel groups={[
    { title: 'Документы', links: [{ id: 'a', label: 'Реализация товаров' }, { id: 'b', label: 'Заказ покупателя' }, { id: 'c', label: 'Счёт на оплату' }] },
    { title: 'Справочники', links: [{ id: 'd', label: 'Номенклатура' }, { id: 'e', label: 'Контрагенты' }] },
    { title: 'Отчёты', links: [{ id: 'f', label: 'Продажи' }, { id: 'g', label: 'Остатки товаров' }] },
  ]} />
)

/**
 * Ссылки роутера: `renderItem` ПОДМЕНЯЕТ элемент пункта, а не оборачивает
 * кнопку. `onOpen` рядом с ним — ошибка типов: источник перехода один.
 */
export const RouterLinks = () => (
  <FunctionPanel
    groups={[
      { title: 'Документы', links: [{ id: 'sales', label: 'Реализация товаров' }, { id: 'orders', label: 'Заказ покупателя' }] },
      { title: 'Справочники', links: [{ id: 'goods', label: 'Номенклатура' }] },
    ]}
    renderItem={(link, props) => <a href={`/${link.id}`} {...props} />}
  />
)
