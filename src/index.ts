export * from './components/Button/index.js'
export * from './components/TextField/index.js'
export * from './components/Textarea/index.js'
export * from './components/Skeleton/index.js'
export * from './components/DropdownMenu/index.js'
export * from './components/DatePicker/index.js'
export * from './components/NumberField/index.js'
export * from './components/LineChart/index.js'
export * from './components/BarChart/index.js'
export * from './components/DonutChart/index.js'
export * from './components/Alert/index.js'
export * from './components/Drawer/index.js'
export * from './components/Accordion/index.js'
export * from './components/Slider/index.js'
export * from './components/Popover/index.js'
export * from './components/EmptyState/index.js'
export * from './components/CodeBlock/index.js'
export * from './components/CodeInput/index.js'
export * from './components/FileDrop/index.js'
export * from './components/Stat/index.js'
export * from './components/Select/index.js'
export * from './components/Toggle/index.js'
export * from './components/Badge/index.js'
export * from './components/DataTable/index.js'
export * from './components/LedgerList/index.js'
export * from './components/CommandBar/index.js'
export * from './components/SectionPanel/index.js'
export * from './components/SideNav/index.js'
export * from './components/MetricStrip/index.js'
export * from './components/Avatar/index.js'
export * from './components/AsOf/index.js'
export * from './components/OrgBadge/index.js'
export * from './components/Money/index.js'
export * from './components/EstimateMark/index.js'
export * from './components/ProgressBar/index.js'
export * from './components/KeyValueList/index.js'
export * from './components/FunctionPanel/index.js'
export * from './components/Form/index.js'
export * from './components/AppBar/index.js'
export * from './components/Breadcrumbs/index.js'
export * from './components/RouteBar/index.js'
export * from './components/Pagination/index.js'
export * from './components/FormTabs/index.js'
export * from './components/GlobalSearch/index.js'
export * from './components/Dashboard/index.js'
export * from './components/Calendar/index.js'
export * from './components/EventCalendar/index.js'
export * from './components/Modal/index.js'
export * from './components/Tooltip/index.js'
export * from './components/Notifications/index.js'
export * from './components/Combobox/index.js'
export * from './components/Tabs/index.js'
export * from './components/ToggleGroup/index.js'
export * from './components/SearchBar/index.js'
export * from './components/ThemeToggle/index.js'
export * from './components/Timeline/index.js'
export * from './components/LogViewer/index.js'
export * from './components/AgentTranscript/index.js'
export * from './components/Heatmap/index.js'
export * from './components/EdgeBundling/index.js'
export * from './components/Stack/index.js'
export * from './components/Grid/index.js'
export * from './components/Box/index.js'
export * from './components/Split/index.js'
export * from './components/Tree/index.js'
export * from './components/Prose/index.js'
export * from './components/PageShell/index.js'
export * from './components/PivotTable/index.js'
// `TreeNode` закреплён за компонентом `Tree`: его узел — каноничный. Узел
// МОДЕЛИ СТРОК с тем же именем переименован в `RowTreeNode` (DS-115) —
// раньше он оставался «доступен из `DataTable/index.js`», и это было неправдой:
// `exports` в `package.json` — allowlist, подпутей к компонентам там нет, и
// потребитель получал `ERR_PACKAGE_PATH_NOT_EXPORTED`. Назвать тип было нельзя
// ниоткуда.
//
// Явная запись оставлена НЕ ради снятой коллизии, а против будущей: два
// `export *` с одним именем от разных объявлений ES-модули роняют молча, без
// ошибки сборки. Здесь корень говорит, что именно он отдаёт. Гейт
// `type-exports` сверяет это утверждение с объявлением, а не с именем.
export type { TreeNode } from './components/Tree/index.js'

// Ядро действия (DS-358). Названо ЗДЕСЬ, а не реэкспортом из barrel-ов
// четырёх компонентов, по той же причине, что и `TreeNode` выше: `ActionBase`
// принадлежит всем четырём сразу, и четыре `export *` с одним именем ES-модули
// роняют молча. Сужения (`RowAction`, `CardTool`, `CommandAction`,
// `DropdownAction`) принадлежат каждое своему компоненту и едут его barrel-ом.
export type { ActionBase, ActionTone } from './internal/action.js'
export * from './examples/index.js'
export {
  getTheme,
  setTheme,
  initTheme,
  useTheme,
  subscribeTheme,
  STORAGE_KEY,
} from './theme/index.js'
export type { Theme } from './theme/index.js'

// Словарь текста, который компоненты произносят от себя (DS-139). Экспорт
// перечислением, как у темы: `src/dictionary/` намеренно НЕ под `src/components/`
// — каталог компонентов детектится как `git ls-tree -d src/components`, и папка
// там подняла бы релиз до minor, тогда как шов ничего в каталог не добавляет.
export { DsText, useDsText, DS_TEXT_RU } from './dictionary/index.js'
// Локаль дат, времени и чисел едет тем же швом (DS-184): один провайдер
// на язык подписей и на язык дат, потому что разъехаться они не должны никогда.
export { useDsLocale, DS_LOCALE_DEFAULT } from './dictionary/index.js'
// Псевдолокаль — не только для верстака: у потребителя тот же вопрос «какой
// текст на экране от системы и могу ли я его сменить», и отвечает на него она
// же. Собирается из `DS_TEXT_RU`, поэтому новый ключ получает маркер сам.
export { DS_TEXT_PSEUDO, PSEUDO_OPEN, PSEUDO_CLOSE } from './dictionary/index.js'
export type { DsTextProps, DsTextDict, DsTextOverrides } from './dictionary/index.js'
// Контракт значка и семь системных глифов (DS-145). `src/icons/`, а не
// `src/components/Icon/`: каталог компонентов детектится как
// `git ls-tree -d src/components`, и папка там подняла бы релиз до minor, тогда
// как контракт ничего в каталог не добавляет.
export { Icon, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, Close, Search, Dots, ToneIcon } from './icons/index.js'
export type { IconProps, GlyphProps, ToneIconProps, ToneName } from './icons/index.js'
export { tokens, cssVar } from '../tokens/tokens.js'
export {
  CHART_SERIES_COUNT,
  chartSeriesVars,
  chartSeriesVar,
} from '../tokens/chartPalette.js'
export type { ChartPaletteSlot } from '../tokens/chartPalette.js'
