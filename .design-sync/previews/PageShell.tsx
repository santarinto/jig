import { PageShell, Button, Stack, Card, KeyValueList, Breadcrumbs } from '@santarinto/jig'

const Frame = ({ children, height = 220 }: { children: React.ReactNode; height?: number }) => (
  <div style={{
    width: 460, height, overflow: 'hidden',
    border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)',
  }}>{children}</div>
)

export const TitleAndActions = () => (
  <Frame>
    <PageShell
      title="Заметки по задачам"
      actions={<Stack direction="row" gap={2}><Button variant="ghost" size="sm">Обновить</Button><Button size="sm">Создать</Button></Stack>}
      style={{ height: '100%' }}
    >
      <Card dense>
        <KeyValueList
          items={[
            { id: 'total', label: 'Всего заметок', value: '128' },
            { id: 'open', label: 'Открытых вкладок', value: '14' },
          ]}
          dividers
        />
      </Card>
    </PageShell>
  </Frame>
)

/** Своя шапка целиком — когда заголовка и действий мало (хлебные крошки, фильтры). */
export const CustomHeader = () => (
  <Frame>
    <PageShell
      header={
        <Stack gap={2} style={{ width: '100%' }}>
          <Breadcrumbs items={[{ id: 'home', label: 'portal' }, { id: 'notes', label: 'Задачи' }]} />
          <Stack direction="row" justify="between" align="center">
            <h1 style={{ margin: 0, fontSize: 'var(--ds-fs-lg)' }}>Реализация №РТ-0001</h1>
            <Button size="sm">Провести</Button>
          </Stack>
        </Stack>
      }
      style={{ height: '100%' }}
    >
      <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>
        Тело страницы с едиными отступами. Раскладку внутри собирают из Split / Stack / Grid.
      </div>
    </PageShell>
  </Frame>
)

/** `maxWidth` ограничивает и центрирует тело — читаемая колонка на широком экране. */
export const MaxWidth = () => (
  <Frame height={200}>
    <PageShell title="Регламент" maxWidth={280} style={{ height: '100%' }}>
      <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>
        Тело ограничено 280px и стоит по центру: на широком мониторе строка не
        растягивается на всю ширину и остаётся читаемой.
      </div>
    </PageShell>
  </Frame>
)
