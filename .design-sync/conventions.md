# jig — design system conventions

> **Version 4.2.6** — canonical `jig` design system. Synced from git `santarinto/jig` via /design-sync (manual).

A dense enterprise UI system for business screens: compact controls, 14px base text, tight spacing, turquoise accent, light **and** dark themes. Density is a declared value of this system, not an inherited habit — it is what buys the 24px click-target floor over 44. Build business screens (documents, registers, forms, dashboards) with realistic Russian-language business data.

## Setup

Components are self-styled — load `styles.css` and nothing else. There is **no** ThemeProvider to wrap; do not add one.

**Theme:** light by default, dark via `data-theme="dark"` on an ancestor. Use the shipped switch, don't wire it by hand:

```tsx
import { initTheme, setTheme, getTheme, useTheme, subscribeTheme, ThemeToggle } from '@santarinto/jig'

initTheme()                       // on startup: stored choice, else prefers-color-scheme
setTheme('dark')                  // persists to localStorage, sets data-theme on <html>
const [theme, set] = useTheme()   // reactive; subscribeTheme() for non-React listeners
<ThemeToggle />                   // ready-made switch button
```

All of it is SSR-safe. Setting `data-theme` yourself works but skips persistence and the system preference. Every colour flips through tokens — never repaint anything yourself.

**Words and locale — `<DsText>`, optional.** Without it components speak Russian and format in `ru-RU`, so a Russian screen needs no wrapper. To change a word or the language: `<DsText value={EN} locale="en-US">`. `value` overrides `DsTextDict` keys (`'calendar.today'`, `'pagination.range'`…), unset keys stay Russian; keep it a module constant, not a literal in render. Set the words and `locale` together, never one alone. Your own formatting takes the locale from `useDsLocale()`.

**System glyphs.** Exported: `ChevronDown`, `ChevronUp`, `ChevronLeft`, `ChevronRight`, `Close`, `Search`, `Dots`, plus `ToneIcon tone="info|success|warning|error"` — the one tone sign, always with its word beside it. Need one in your own glue? Take the export, never draw a copy. Not an icon pack: any other icon is your own SVG placed inside `<Icon>`, which forces system size, stroke and `currentColor` onto it. `<Icon>` has no `size` prop — the place sizes it by style.

## Tokens — never a raw hex, never a raw px

The library styles its own components (internal `ds-*` BEM classes — you never write those). Style **your own layout glue** with these custom properties so both themes work. All of them are defined at the end of `_ds_bundle.css`: `:root` = light, `[data-theme="dark"]` = dark.

- **Colour:** `--ds-accent` (+`-hover`/`-active`); surfaces `--ds-bg-app` / `--ds-surface` / `--ds-surface-subtle` / `--ds-section-bar`; borders `--ds-border` / `--ds-border-strong` / `--ds-control-border`; text `--ds-text-primary` / `--ds-text-secondary` / `--ds-text-muted` / `--ds-text-on-accent` / `--ds-text-on-solid`; tones `--ds-success` / `--ds-warning` / `--ds-error` / `--ds-info`, each with a text counterpart `--ds-success-fg` / `--ds-warning-fg` / `--ds-error-fg` / `--ds-info-fg` (the base token is the **fill**, the `-fg` is the text colour legible on that tone's tint — `Badge` works exactly this way); table `--ds-table-header` / `--ds-table-zebra` / `--ds-table-selected` / `--ds-table-hover` / `--ds-table-grid`; muted row text `--ds-row-muted-fg` (a text colour, not a surface); `--ds-overlay`.
- **Accent wash:** `--ds-accent-subtle` — the pale accent surface behind a selected non-row element (a `Tree` node, a framed `Card` header). It is the one tint measured to keep `--ds-accent` text above 4.5:1; a hand-lightened accent is not. A selected **table** row takes `--ds-table-selected` instead, paired with `--ds-text-primary`.
- **Type:** `--ds-font-ui` (Inter), `--ds-font-mono` (JetBrains Mono — use it for anything monospaced, never a bare `monospace`). Sizes `--ds-fs-sm`(12) `--ds-fs-base`(14) `--ds-fs-lg`(16) `--ds-fs-xl`(20) `--ds-fs-2xl`(24). `--ds-fs-sm` is the floor, for service captions only (a chart tick, a sort arrow); body and label text takes `--ds-fs-base`. `--ds-fs-lg` sizes glyphs (`×`, an arrow, an OTP digit), not text.
- **Space:** `--ds-space-0`(0) `--ds-space-1`(2) `--ds-space-2`(4) `--ds-space-3`(6) `--ds-space-4`(8) `--ds-space-5`(12) `--ds-space-6`(16) `--ds-space-7`(20) `--ds-space-8`(24). **The step is not uniform** — 2px up to `--ds-space-4`, 4px after — so read the value off this list, never compute it from the index. `--ds-space-0` is a real step (`gap={0}` on `Stack`/`Grid`). Radius `--ds-radius-sm` / `--ds-radius` / `--ds-radius-md` / `--ds-radius-pill` (a count chip). Control heights `--ds-h-compact`(28) / `--ds-h-default`(32) / `--ds-h-comfortable`(36).
- **Object sizes:** `--ds-size-icon`(16) — a system glyph; `--ds-size-icon-lg`(32) — the large sign on an empty screen (`EmptyState`, `FileDrop`); `--ds-size-swatch`(22) — a colour swatch. Use them to line your glue up with what the system draws; they are never a `font-size`.
- **Effects:** `--ds-focus-ring` on every focusable thing of your own (`box-shadow: var(--ds-focus-ring)` on `:focus-visible`). `--ds-focus-ring-inset` when the element is stretched to its panel's edges (a menu row, a list line) — the outward ring gets clipped there. `--ds-focus-ring-error` for an invalid field. `--ds-focus-ring-contrast` when the fill under the ring comes from DATA or an ordered scale (a heatmap step, a tag swatch), where the accent can land on a fill identical to itself. Never re-author a ring as a literal. Elevation is two steps: `--ds-shadow-sm` (a resting control), `--ds-shadow-md` (anything floating). Don't author a third.
- **Layers:** `--ds-z-popup`(100) / `--ds-z-tooltip`(200) / `--ds-z-drawer`(300) / `--ds-z-modal`(400) / `--ds-z-toast`(500). Never a bare `z-index` for a floating layer of your own — offset from the slot it belongs between (`calc(var(--ds-z-modal) + 10)`); the gaps are 100 for that. A toast sits above a modal on purpose. `Modal`, `Drawer` and `Toaster` portal to `document.body`, so a `z-index` at their call site cannot reach them.
- **Categorical palette:** `--ds-chart-1`…`--ds-chart-8` — the system's ONE set of categorical colours, for chart series and equally for a label's colour (`ToggleGroup variant="swatch"`). Which colour a given tag has is your DATA; the set it comes from is ours — literal hexes in a page are a defect, they don't flip with the theme. Components pick from it themselves; `chartSeriesVar(i)` is exported for a legend or dot of your own. Never colour a series with `--ds-success`/`--ds-error` — those mean status, not identity. **Take the colours in order:** any prefix of the eight is as spread out as it can be, and picking 1/5/7 by eye throws that away. **When a subset must keep the colours it has in the full chart**, pin `paletteSlot: 1..8` on the series or slice — the slot travels with the data and is read by the chart, its legend and its tooltip; two items pinned to one slot throw. Any two of the eight are distinguishable under protanopia, deuteranopia and tritanopia as well as normal vision — but that is measured on flat fields, so a thin line whose identity matters needs a second channel too (marker shape, dash, direct label).
- **Sequential ramp:** `--ds-heat-0`…`--ds-heat-4` — an **ordered** scale for magnitudes (`Heatmap`; `0` is "nothing happened"). The series palette is deliberately hard to read as one scale, this one deliberately easy. Never build your own ramp by lightening the accent.
- **Search hit:** `--ds-highlight` — the background of a found match (`LogViewer`). Warm on purpose: teal already means interactive.

## The colour law

**Colour encodes state or category — never magnitude.** Magnitude lives in position, in height, or in the ordered ramp: `--ds-heat-0`…`--ds-heat-4` is the one place where colour carries magnitude, and `--ds-chart-1`…`--ds-chart-8` is categorical. A bar's colour says which state it is, its height says how much; a day's type is marked by shape, not by a darker step. "Make it darker when the number is bigger" on anything but the ramp is the request to refuse — the picture would lie about the data.

**Colour ratifies a tone, never carries it alone.** A tone always has an icon and a word as well. In the light theme the 12% tints of `warning` and `error` are the same colour under deuteranopia, so a status built out of a tint alone does not exist.

**A button is told from a field by its fill, not by its border.** Both take `--ds-control-border`. A field is `--ds-surface` (the sheet you write on); a secondary button is one step off, `--ds-surface-subtle`, going to `--ds-table-hover` under the cursor. Never give a button of your own a lighter border instead, and never put an inset shadow on a field — a shadow here means a layer. Exception: a button lying on a `--ds-surface-subtle` block (`CodeBlock`'s copy button) takes `--ds-surface`, or the step would dissolve it into its ground.

**Which foreground is legal on which surface is declared**, not decided per screen — the whole matrix is at `demo/pairings.html`. A pair is legal, or passes-but-is-not-intended, or below the floor. An undeclared pair is not the system's answer even when its contrast passes; if your glue needs a combination the matrix doesn't declare, take the token its row names.

**Charts name themselves.** All three chart components carry `role="img"` with a name — pass `ariaLabel` when you have a good one, otherwise they derive it from their series labels.

## Scale and density

Every metric token is `rem × var(--ds-ui-scale)`. `--ds-ui-scale` (default `1`) belongs on the root `<html>`: set on a plain wrapper it does **half** the job, because tokens declared in `:root` resolve there.

**To scale a subtree you don't own** (an artboard, an embedded widget) use the class — it re-declares every metric token on that element:

```html
<div class="ds-scale" style="--ds-ui-scale: 1.25"> … </div>
```

Never hand-write a partial set of tokens on your container: a partial set splits a component at the seams (font grows, padding doesn't) and reads as a decision rather than a bug. Scales don't compound — a nested `.ds-scale` counts from the base rem.

A heatmap that must be bigger takes `cellSize={18}`, not a scale on its wrapper: the cell is its module, and gaps, the weekday column and labels all follow it.

Keep screens dense: `size="sm"`, compact densities, small gaps (`--ds-space-3/4`), short labels.

**The floor on a click target is 24 CSS px.** Anything clickable — a button, a caret, a close ×, a menu link, a checkbox — is at least `24 × 24`, held by measurement, so a mockup below it draws something the components will not render:

```css
min-height: var(--ds-target-min); min-width: var(--ds-target-min);
```

`--ds-target-min` is the one token that does **not** ride `--ds-ui-scale` and is not in `rem` — a floor that sinks with the reader's font or with density is not a floor. Hence `min-*`, never `height`. 44px is not this system's bar: density is a stated value here, and a tablet gets `.ds-scale` instead. Never justify a small target by the room around it — that room belongs to the page, not to you.

## One name per idea

There are **no aliases** — the old spelling is gone:

- **`tone` is always `neutral | accent | success | warning | error | info`** — on `Button`, `Badge`, `Alert`, `ProgressBar`, `MetricStrip`, `Timeline`, `LogViewer`, `BarChart`, `Heatmap` and `Calendar`. Never `tone="danger"` or `tone="default"`. Two different dictionaries on purpose: `Button` also has `variant="danger"` (a variant, not a tone), and `Money` has `tone="default" | "muted" | "positive" | "negative"` (sign, not status).
- **An ACTION has its own tone dictionary, and it has TWO values** — `ActionTone = 'neutral' | 'error'`, not the six above. Since DS-358 every action in the system is one type, `ActionBase` (`id`, `label`, `icon?`, `tone?`, `disabled?`, `onSelect?`), exported from the package root together with `ActionTone`, and narrowed per place: `RowAction` (`DataTable`, `LedgerList`), `DropdownAction` (`DropdownMenu`), `CommandAction` (`CommandBar`, `AppBar`), `CardTool` (`Card tools`). Two values because an action is either ordinary or destructive: `success` on a command over a row says nothing, since state belongs to the row and not to the command. `neutral` is the NAME OF HAVING NO TONE — components turn it into `tone={undefined}`. `CardTool` has no `tone` at all, and that is deliberate: a tool is drawn as one icon, and a red icon with no word is colour as the sole carrier of meaning.
- **Density is `dense?: boolean`**, everywhere it exists: `Card`, `DataTable`, `LedgerList`, `Timeline`, `MetricStrip`, `KeyValueList`, `AgentTranscript`. `<Card dense><DataTable dense/></Card>` is the idiom.
- **Selection is `selectedId` / `selectedIds`, the callback `onSelect` / `onSelectionChange`.** `selectedId` drives `Tabs`, `TabPanel`, `SideNav`, `SectionPanel`, `FormTabs`, `RouteBar`, `Calendar`, `Tree`; `selectedIds` + `onSelectionChange` drive `DataTable` checkboxes and `Tree`. `onSelectionChange` hands you **the whole new set**, not the toggled id — pass a setter straight to it, never toggle by hand. A prop that changes gets `on<Prop>Change` (`Split`'s `onSizeChange`).
- **`Card` variants are `plain | framed`.**
- **`hint` names two ideas.** On a *field* it is the sub-label, and it **disappears the moment `error` arrives** — they share one `aria-describedby`, so never render your own error text beside a field's hint. That pair is on `TextField`, `Textarea`, `Select`, `NumberField`, `DatePicker`; `Combobox` and `CodeInput` take `error` without a hint. Elsewhere the word is unrelated and no error displaces it: `Stat.hint` and a `MetricStrip` metric's hint are sub-captions, `FileDrop.hint` is the drop-zone instruction, `EstimateMark.hint` is why a value is marked.

## Money is a component, not a formatted string

Never render an amount with `toLocaleString`/`toFixed` and a currency glyph.

- **`Money` takes `value` as a *string*** (`"6900000.00"` straight from a NUMERIC column) — kopecks on large sums do not survive float64. `currency` is `RUB | EUR | KZT | PLN | USD`. Value, zero and "no data" are distinguishable **in text**, not by colour: no data is an em dash with `unknownHint` as visible text, and zero is never muted — it is a fact, not an absence. `tone` colours by sign, `signed` shows the `+`, `secondary` adds a converted amount (`{value, currency, rateDate}`) or an honest `{unavailable}`.
- **`AsOf` states how old a number is** — «остаток на 30.06.2026». ISO `YYYY-MM-DD` in, formatting its own. Staleness is `stale={{afterDays, today}}` — `today` is a **prop, never the clock**, so a screen renders the same in a test as in production, and a stale value is flagged with a word, not a colour.
- **`EstimateMark`** is the one asterisk for an estimated magnitude. `Money` raises it via `estimated`; use the component directly for anything that is not money.

Pair them — the amount, then `AsOf` beneath it. That is the house style for any balance.

## Purpose is part of the contract

A component that renders acceptably in a role it wasn't designed for is still the wrong component.

- **`Tabs` are sibling views of one thing** (a task's Overview / Comments / History), never top-level navigation. Full-width navigation is `AppBar`: its `children` are the centre slot, its `actions` are DATA — `CommandAction[]`, same as `CommandBar`, folding into «Ещё» on a narrow screen — and a `ReactNode` there is a type error that throws; avatar, initials, counts, «Выйти» go in `trailing`, which never folds. `Breadcrumbs` above `Tabs` is the idiomatic pairing.
- **Navigation between pages is `RouteBar`** — links with `aria-current="page"`. `Tabs`, `SectionPanel` and `SideNav` move focus from JS, so on a page rendered without hydration only one of their items is reachable by keyboard; `RouteBar` has no such state by construction.
- **`TabPanel` is wired by two matching values, not by state:** `tabsId` equals the `Tabs`' `id`, `selectedId` equals theirs — so give `Tabs` an `id` whenever a panel follows it. `noPadding` is for content with its own edges (a `DataTable`); text, figures and charts want the default padding.
- **`Calendar` picks a day; `EventCalendar` is a schedule** (day/week/month on a time grid), fully controlled — `events`, `view`, `date` are yours, and without `onEventChange` / `onEventCreate` / `onDateChange` / `onViewChange` the gestures do nothing. Times are zone-less local strings (`'2026-09-02T09:30'`), the end exclusive.
- **`DataTable` shows rows as given; `PivotTable` aggregates raw rows itself** — `rowDimensions`, `columnDimensions`, `measures` with `agg: 'sum' | 'avg' | 'count' | 'min' | 'max'` — and computes totals from the source rows, not from the visible cells. Never pre-aggregate for it or fake a pivot with `DataTable`: an average of averages is a wrong number.
- **Every field looks the same, disabled included** — `TextField`, `Textarea`, `Select`, `SearchBar`, `Combobox`, `CodeInput`, `NumberField` and `Pagination`'s page-size select share one surface, hover and ring. Pass `disabled`; never author your own "looks disabled".
- **A strip item can be unavailable without disappearing** — `Tabs`, `SectionPanel` and `FormTabs` take `disabled` on an item. Removing it instead would renumber the strip for a screen reader.

## Wide content carries its own scroller — the page shell will not

Anything wider than its column (a table, a toolbar, a `<pre>`, an unbreakable string) must scroll inside itself. `PageShell` does not catch it: a wide child without its own scroller slides the **document** sideways and takes the page header off screen with it. The obvious repairs are closed — `overflow-x: auto` on the shell body kills every `position: sticky` inside the page, and `overflow-x: clip` makes the content past the edge silently unreachable. The DS does this to itself: `Tabs` and `CommandBar` take the scrollbar onto their own strip, switched on by measurement so a standing `overflow` doesn't clip the focus ring.

`DataTable` follows the rule with one visible cost: **while its scrollbar is on, the sticky column header stops sticking** — a horizontal scrollport cannot also stick vertically. If a sticky header matters more on your screen, give the table fewer columns with `hideBelow` so it fits.

## Where the truth lives

- `styles.css` — the styling entry; it `@import`s `fonts/fonts.css` and `_ds_bundle.css`. **`_ds_bundle.css` holds the component styles and, appended at the end, every `--ds-*` token** (`:root` light, `[data-theme="dark"]` dark). There is no separate tokens file.
- `components/<group>/<Name>/<Name>.d.ts` — the exact props. `<Name>.prompt.md` — usage.
- **The `.d.ts` lists only DS-specific props.** These also accept their native HTML attributes (`value`, `onChange`, `placeholder`, `disabled`, `name`, `required`, `maxLength`…) without enumerating them: `TextField`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `Button`, `Badge`, `Card`, `AppBar`, `CommandBar`, `Tile`. Exceptions: `size` is DS-owned on `TextField`/`Textarea`/`Select` (`"sm" | "md"`), and `SearchBar` owns its `value`/`onChange`. Everything else — `NumberField`, `Combobox`, `DatePicker`, every chart — takes exactly what its `.d.ts` shows.

## Idiomatic snippet

```tsx
import { Card, FormRow, TextField, Combobox, Button, Badge } from '@santarinto/jig'

<Card title="Реализация товаров №РТ-0001"
  footer={<><Button variant="ghost" size="sm">Отмена</Button><Button size="sm">Записать и закрыть</Button></>}>
  <FormRow label="Организация">
    <Combobox options={[{ value: 'r', label: 'ООО «Ромашка»' }]} value="r" onChange={() => {}} />
  </FormRow>
  <FormRow label="Контрагент"><TextField defaultValue="ООО «Покупатель»" /></FormRow>
  <div style={{ display: 'flex', gap: 'var(--ds-space-3)', alignItems: 'center' }}>
    <Badge tone="warning">Не проведён</Badge>
  </div>
</Card>
```

`DocumentFormExample` and `WorkspaceExample` are full reference screens — read them to see how the parts fit together.
