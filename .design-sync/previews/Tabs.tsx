import { Tabs, TabPanel } from '@santarinto/jig'

const tabs = [
  { id: 'in', label: 'Входящие' },
  { id: 'out', label: 'Исходящие' },
]

export const Default = () => <Tabs tabs={tabs} selectedId="out" onSelect={() => {}} />

/** Счётчик живёт внутри кнопки, поэтому попадает в доступное имя вкладки. */
export const WithCounts = () => (
  <Tabs
    selectedId="all"
    onSelect={() => {}}
    tabs={[
      { id: 'all', label: 'Все', count: 42 },
      { id: 'open', label: 'В работе', count: 7 },
      // Ноль показывается, а не прячется: «Готово: 0» — содержательный ответ,
      // спрятанный счётчик читался бы как «не считали».
      { id: 'done', label: 'Готово', count: 0 },
    ]}
  />
)

/**
 * Шов под роутер: `renderItem` **подменяет** элемент вкладки, а не оборачивает
 * наш. Ссылка потребителя сама становится вкладкой — один интерактивный
 * элемент, один таб-стоп, средний клик работает нативно.
 */
export const RouterLinks = () => (
  <Tabs
    tabs={tabs}
    selectedId="out"
    onSelect={() => {}}
    renderItem={(tab, props) => <a href={`/mail/${tab.id}`} {...props} />}
  />
)

/**
 * Значок статуса. Декоративен и в доступное имя не попадает — в отличие от
 * счётчика: смысл статуса несёт подпись вкладки, а не картинка.
 */
export const WithIcons = () => (
  <Tabs
    selectedId="todo"
    onSelect={() => {}}
    tabs={[
      { id: 'todo', label: 'В работе', count: 7, icon: <span>●</span> },
      { id: 'done', label: 'Готово', count: 12, icon: <span>✓</span> },
    ]}
  />
)

/**
 * Виджет целиком: вкладки соединены с телом. Активная вкладка размыкает линию
 * в панель, неактивная — нет. `noPadding` под содержимое со своими краями.
 */
export const WithPanel = () => (
  <div style={{ width: 520 }}>
    <Tabs
      id="history"
      selectedId="branches"
      onSelect={() => {}}
      tabs={[{ id: 'branches', label: 'Ветки', count: 12 }, { id: 'langs', label: 'Языки' }]}
    />
    <TabPanel tabsId="history" selectedId="branches">
      Содержимое активной вкладки. Паддинг по умолчанию — под текст и графики.
    </TabPanel>
  </div>
)
