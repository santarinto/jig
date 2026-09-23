import { Stack } from '../../src/components/Stack/index.js'
import { Grid } from '../../src/components/Grid/index.js'
import { Fit, Center } from '../../src/components/Box/index.js'
import { Split } from '../../src/components/Split/index.js'
import { Prose } from '../../src/components/Prose/index.js'
import { PageShell } from '../../src/components/PageShell/index.js'
import { Dashboard, Tile } from '../../src/components/Dashboard/index.js'
import { DemoBlock } from '../demo-spec.js'

const PROSE_HTML = [
  '<h2>Заявка №1024</h2>',
  '<p>Тело задачи, отрендеренное на сервере из markdown. Ссылка на <a href="#">регламент</a>, список:</p>',
  '<ul><li>Проверить реквизиты</li><li>Согласовать сумму</li></ul>',
  '<pre><code>make release VERSION=1.28.0 &amp;&amp; make push  # длинная строка кода скроллится внутри блока, а не распирает контейнер</code></pre>',
  '<blockquote>Важно: не трогать общие эндпоинты.</blockquote>',
  '<table><thead><tr><th>Поле</th><th>Значение</th></tr></thead><tbody><tr><td>ИНН</td><td>7701234567</td></tr></tbody></table>',
].join('')

const DASHBOARD_CODE = [
  '<Dashboard>',
  '  <Tile title="Выручка за день" value="1,24 млн ₽" tone="accent" />',
  '  <Tile title="Документов" value={128} onClick={openDocuments} />',
  '  <Tile title="Задач в работе" value={7} />',
  '</Dashboard>',
].join('\n')

/** Пейн сплита — заливка + подпись, чтобы видеть границы областей. */
function Pane({ children, tone = 'subtle' }: { children: React.ReactNode; tone?: 'subtle' | 'accent' }) {
  return (
    <div style={{
      boxSizing: 'border-box', height: '100%', display: 'grid', placeItems: 'center', padding: 8,
      background: tone === 'accent' ? 'var(--ds-accent-subtle)' : 'var(--ds-surface-subtle)',
      fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)', textAlign: 'center',
    }}>{children}</div>
  )
}

/** Область фикс-размера — «сцена», внутри которой видно поведение утилиты. */
function Stage({ children, height = 120 }: { children: React.ReactNode; height?: number }) {
  return (
    <div style={{ width: 360, height, border: '1px dashed var(--ds-border-strong)', borderRadius: 'var(--ds-radius-sm)' }}>
      {children}
    </div>
  )
}

/** Демонстрационная ячейка — просто видимый блок, чтобы читать раскладку. */
function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 12px', background: 'var(--ds-surface-subtle)',
      border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)',
      fontSize: 'var(--ds-fs-sm)', whiteSpace: 'nowrap',
    }}>{children}</div>
  )
}

export function LayoutsSection() {
  return (
    <section className="demo-section" id="layouts">
      <h2 className="demo-section__title">Layouts</h2>
      <div className="demo-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <DemoBlock name="Stack · row" block code={'<Stack direction="row" gap={3}>…</Stack>'}>
          <Stack direction="row" gap={3}>
            <Cell>Раз</Cell><Cell>Два</Cell><Cell>Три</Cell>
          </Stack>
        </DemoBlock>
        <DemoBlock name="Stack · column" block code={'<Stack direction="column" gap={2}>…</Stack>'}>
          <Stack gap={2}>
            <Cell>Первый</Cell><Cell>Второй</Cell><Cell>Третий</Cell>
          </Stack>
        </DemoBlock>
        <DemoBlock name="Stack · justify between" block code={'<Stack direction="row" justify="between">…</Stack>'}>
          <Stack direction="row" justify="between">
            <Cell>Лево</Cell><Cell>Право</Cell>
          </Stack>
        </DemoBlock>
        <DemoBlock name="Stack · align + gap" block code={'<Stack direction="row" gap={4} align="center">…</Stack>'}>
          <Stack direction="row" gap={4} align="center">
            <Cell>маленький</Cell>
            <div style={{ padding: '20px 12px', background: 'var(--ds-accent-subtle)', borderRadius: 'var(--ds-radius-sm)', fontSize: 'var(--ds-fs-sm)' }}>высокий</div>
            <Cell>маленький</Cell>
          </Stack>
        </DemoBlock>
        <DemoBlock name="Stack · wrap" block code={'<Stack direction="row" gap={2} wrap>…</Stack>'}>
          <Stack direction="row" gap={2} wrap>
            {Array.from({ length: 9 }, (_, i) => <Cell key={i}>Чип {i + 1}</Cell>)}
          </Stack>
        </DemoBlock>

        <DemoBlock name="Grid · 3 колонки" block code={'<Grid columns={3} gap={3}>…</Grid>'}>
          <Grid columns={3} gap={3}>
            {Array.from({ length: 6 }, (_, i) => <Cell key={i}>№{i + 1}</Cell>)}
          </Grid>
        </DemoBlock>
        <DemoBlock name="Grid · шаблон 200px 1fr" block code={'<Grid columns="200px 1fr" gap={3}>…</Grid>'}>
          <Grid columns="200px 1fr" gap={3}>
            <Cell>сайдбар 200px</Cell>
            <Cell>контент 1fr — тянется</Cell>
          </Grid>
        </DemoBlock>
        <DemoBlock name="Grid · auto-fill minmax" block code={`// width: обёртка демо сжимается до контента, а auto-fill
// считает число колонок от доступного места — без ширины
// вставленный пример схлопнется в одну колонку.
<Grid minColumnWidth="140px" gap={3} style={{ width: 460 }}>…</Grid>`}>
          <Grid minColumnWidth="140px" gap={3} style={{ width: 460 }}>
            {Array.from({ length: 8 }, (_, i) => <Cell key={i}>Карточка {i + 1}</Cell>)}
          </Grid>
        </DemoBlock>

        <DemoBlock name="Fit" block code={'<Fit><div>контент на всю площадь</div></Fit>'}>
          <Stage>
            <Fit>
              <div style={{ display: 'grid', placeItems: 'center', background: 'var(--ds-accent-subtle)', borderRadius: 'var(--ds-radius-sm)', fontSize: 'var(--ds-fs-sm)' }}>
                контент на всю площадь контейнера
              </div>
            </Fit>
          </Stage>
        </DemoBlock>
        <DemoBlock name="Center" block code={'<Center><Cell>по центру</Cell></Center>'}>
          <Stage>
            <Center>
              <Cell>по центру обеих осей</Cell>
            </Center>
          </Stage>
        </DemoBlock>

        <DemoBlock name="Split · горизонтальный" block code={'<Split direction="row" defaultSize={180} min={100}><PaneA/><PaneB/></Split>'}>
          <div style={{ width: '100%', height: 180, border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)', overflow: 'hidden' }}>
            <Split defaultSize={180} min={100} style={{ height: '100%' }} aria-label="Ширина левой панели">
              <Pane tone="accent">Слева<br />тяните границу →</Pane>
              <Pane>Справа</Pane>
            </Split>
          </div>
        </DemoBlock>

        <DemoBlock name="Prose (серверный html)" block code={'<Prose html={markdownHtml} />'}>
          <div style={{ width: 360 }}>
            <Prose html={PROSE_HTML} />
          </div>
        </DemoBlock>
        <DemoBlock name="PageShell" block code={'<PageShell title="Заметки" actions={<button className="ds-btn ds-btn--ghost ds-btn--sm">Создать</button>}>…</PageShell>'}>
          <div style={{ width: 420, height: 200, border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)', overflow: 'hidden' }}>
            <PageShell
              title="Заметки"
              actions={<button type="button" className="ds-btn ds-btn--ghost ds-btn--sm">Создать</button>}
              style={{ height: '100%' }}
            >
              <div style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-secondary)' }}>
                Тело страницы с едиными отступами. Внутри — Split/Stack/Grid.
              </div>
            </PageShell>
          </div>
        </DemoBlock>
        <DemoBlock name="Split · storageKey (запоминает размер)" block code={'<Split storageKey="demo-persist" defaultSize={200}>…</Split>'}>
          <div style={{ width: '100%', height: 180, border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)', overflow: 'hidden' }}>
            <Split storageKey="demo-persist" defaultSize={200} min={100} style={{ height: '100%' }} aria-label="Ширина панели (запоминается)">
              <Pane tone="accent">Измените размер<br />и перезагрузите →</Pane>
              <Pane>размер сохранится</Pane>
            </Split>
          </div>
        </DemoBlock>

        <DemoBlock name="Split · вертикальный" block code={'<Split direction="column" defaultSize={90}>…</Split>'}>
          <div style={{ width: '100%', height: 220, border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)', overflow: 'hidden' }}>
            <Split direction="column" defaultSize={90} min={48} style={{ height: '100%' }} aria-label="Высота верхней панели">
              <Pane tone="accent">Сверху ↕</Pane>
              <Pane>Снизу</Pane>
            </Split>
          </div>
        </DemoBlock>

        <DemoBlock name="Split · вложенный" block code={`<div style={{ height: 240, border: '1px solid var(--ds-border)' }}>
  <Split defaultSize={140} min={80} style={{ height: '100%' }}>
    <Sidebar />
    <Split direction="column" defaultSize={60} min={40} style={{ height: '100%' }}>
      <Header />
      <Content />
    </Split>
  </Split>
</div>`}>
          <div style={{ width: '100%', height: 240, border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)', overflow: 'hidden' }}>
            <Split defaultSize={140} min={80} style={{ height: '100%' }} aria-label="Ширина сайдбара">
              <Pane tone="accent">Сайдбар</Pane>
              <Split direction="column" defaultSize={60} min={40} style={{ height: '100%' }} aria-label="Высота шапки">
                <Pane>Шапка</Pane>
                <Pane>Контент</Pane>
              </Split>
            </Split>
          </div>
        </DemoBlock>

        <DemoBlock name="Split · collapsible" block code={'<Split defaultSize={180} collapsible>…</Split> — 2× клик по разделителю'}>
          <div style={{ width: '100%', height: 180, border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius-sm)', overflow: 'hidden' }}>
            <Split defaultSize={180} min={100} collapsible style={{ height: '100%' }} aria-label="Ширина панели (двойной клик — свернуть)">
              <Pane tone="accent">Двойной клик<br />по разделителю →</Pane>
              <Pane>свернёт левую панель</Pane>
            </Split>
          </div>
        </DemoBlock>

        <DemoBlock name="Dashboard / Tile" block code={DASHBOARD_CODE}>
          <Dashboard>
            <Tile title="Выручка за день" value="1,24 млн ₽" tone="accent" />
            {/* Нажимаемая — только та, за которой есть переход; остальные показатели */}
            <Tile title="Документов" value={128} onClick={() => {}} />
            <Tile title="Задач в работе" value={7} />
          </Dashboard>
        </DemoBlock>
      </div>
    </section>
  )
}
