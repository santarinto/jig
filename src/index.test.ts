import { describe, it, expect } from 'vitest'
import * as lib from './index.js'

describe('library barrel', () => {
  it('exports all core components', () => {
    for (const name of ['Button','TextField','Textarea','Skeleton','DropdownMenu','DatePicker','NumberField','LineChart','Alert','Drawer','Accordion','Slider','Popover','EmptyState','CodeInput','FileDrop','Stat','Select','Checkbox','Radio','Switch','Badge','DataTable','CommandBar','SectionPanel','FunctionPanel','Card','FormRow','AppBar','Breadcrumbs','Pagination','FormTabs','GlobalSearch','Dashboard','Tile','Calendar','Modal','Tooltip','Toast','Toaster','toast','NotificationCenter','Combobox','Tabs','SearchBar','SideNav','MetricStrip','Avatar','ProgressBar','KeyValueList','BarChart','DonutChart','ThemeToggle','Timeline','LogViewer','Heatmap','initTheme','setTheme','getTheme','useTheme','subscribeTheme','DocumentFormExample','WorkspaceExample']) {
      expect(lib).toHaveProperty(name)
    }
  })

  /* Компоненты стережёт и src/__guards__/consumption.test.ts, выводя список из
     файловой системы. Всё остальное — токены, палитра, императивный API тостов —
     не покрыто ничем: удали строку реэкспорта, и 269 тестов останутся зелёными,
     а сборка портала упадёт на «has no exported member». */
  it('exports everything that is not a component directory', () => {
    for (const name of ['tokens','cssVar','CHART_SERIES_COUNT','chartSeriesVars','chartSeriesVar',
      'toast','dismissToast','clearToasts',
      'initTheme','setTheme','getTheme','useTheme','subscribeTheme','STORAGE_KEY']) {
      expect(lib, `${name} is gone from the public API`).toHaveProperty(name)
    }
  })

  it('модель строк доступна из корня пакета', async () => {
    const api = await import('./index.js')
    expect(typeof api.flattenTree).toBe('function')
    expect(typeof api.groupByValue).toBe('function')
  })
})
