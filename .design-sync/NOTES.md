# design-sync notes — jig

Repo-specific gotchas for `/design-sync` (package shape, no Storybook). Read before a re-sync.

## Build (the repo ships no dist by default)
- The repo has **no build script / no `dist/`**. We added a minimal one so the converter can read a `.d.ts` tree:
  - `tsconfig.build.json` (emits JS + declarations to `dist/`, `rootDir: "."`, css `declare module` shim in `types/css-modules.d.ts`, excludes tests/`__smoke__`/`__guards__`).
  - `package.json` `main`/`module`/`types`/`exports` point at `dist/src/index.js` / `dist/src/index.d.ts` — **required**, or `.d.ts` discovery finds nothing (`[ZERO_MATCH]`).
  - `cfg.buildCmd` runs tsc **and copies component CSS next to the compiled JS** (`cp --parents` — GNU/Linux specific) plus `tokens/*.css` → `dist/tokens/`. tsc does NOT copy assets, so without this esbuild fails `[UNRESOLVED_IMPORT] ./X.css`.
- Converter entry: `--entry ./dist/src/index.js`.

## Styling
- **Где реально живут токены в бандле:** `cfg.cssEntry` не превращается в `ds-bundle/tokens/tokens.css` — конвертер **дописывает его в конец `_ds_bundle.css`** (маркер `/* appended from cfg.cssEntry */`, блоки `:root` + `[data-theme="dark"]`). Каталог `ds-bundle/tokens/` остаётся **пустым**, и в проекте на claude.ai/design пути `tokens/` нет вообще. Замыкание корректно: `styles.css` → `@import "./fonts/fonts.css"` + `@import "./_ds_bundle.css"`. **Не ссылаться в conventions.md/README на `tokens/tokens.css`** — этого файла у дизайн-агента нет (правлено в 1.3.0-ресинке 2026-07-25).
- `cfg.cssEntry = tokens/tokens.css` — NOT `src/styles.css`. `src/styles.css` is an `@import`-aggregator; pointing cssEntry at it injects broken `@import "./components/…"` paths (`[CSS_IMPORT_MISSING]`) AND drops the token definitions (`[TOKENS_MISSING]`). Component CSS ships correctly via `_ds_bundle.css` (esbuild bundles each `import './X.css'`); tokens come from `cssEntry`.

## Previews / overrides
- `cfg.overrides.Modal = {cardMode:"single", viewport:"720x400"}` — the fixed-overlay dialog needs a sized single card.
- Wide components in `cfg.overrides` with `cardMode:"column"`: DocumentFormExample, WorkspaceExample, AppBar, Dashboard, DataTable (flagged `[GRID_OVERFLOW]`).
- `Tooltip` preview injects `<style>.ds-tooltip__bubble{opacity:1;visibility:visible}</style>` — the bubble is CSS `:hover`-only and won't screenshot otherwise.

## Fonts (RESOLVED — Inter ships in the bundle)
- Inter now lives in the repo: `fonts/Inter-{Regular,Medium,SemiBold,Bold}.woff2` (400/500/600/700, from `~/…/fonts/Inter_4.1/web/`) + `fonts/inter.css` (`@font-face`), wired via `cfg.extraFonts=["fonts/inter.css"]`. The converter copies them to the bundle's `fonts/` and adds `@import "./fonts/fonts.css"` to `styles.css`, so designs render in real Inter — no "Missing brand font" banner, no Upload-fonts step needed.
- Keep `fonts/` **tracked** in git (do not add it to `.gitignore`). To change weights, update the woff2 + `fonts/inter.css` and rebuild.

## Оверлеи в карточках (`position: fixed` + `transform` харнесса) — ВАЖНО
Харнесс карточки задаёт `.ds-single{transform:translateZ(0)}` (и `.ds-cell` тоже). `transform` делает элемент **containing block для `position: fixed`** потомков, поэтому `.ds-modal__overlay`/`.ds-drawer__overlay` (`position: fixed; inset: 0`) меряются **не по вьюпорту**, а по узлу монтирования — а он без своей высоты схлопывается.

Замеры до фикса (720×400): Modal — overlay `h:32`, диалог `top:-51` (шапка срезана); Drawer — overlay `h:0`, панель `h:0` (всё наложилось). **При вьюпорте 1200×800 цифры те же** — увеличение `cfg.overrides.*.viewport` эту проблему НЕ решает, я проверял.

Фикс — в авторском превью (`lib/emit.mjs` форкать нельзя, это контракт вывода): обернуть оверлейный компонент в «сцену» со своим `transform` и явной высотой —
```tsx
const Stage = ({children}) => <div style={{transform:'translateZ(0)', height:340}}>{children}</div>
```
Сцена становится ближайшим containing block'ом, и `inset:0` заполняет её. Сделано в `previews/Modal.tsx` и `previews/Drawer.tsx`. **Любой новый оверлейный компонент** (диалог/шторка/полноэкранный слой на `position: fixed`) в превью нужно оборачивать так же, иначе карточка молча приедет обрезанной.

**УСТАРЕЛО, ТРЕБУЕТ ПЕРЕПРОВЕРКИ (найдено на DS-357, 21.09.2026).** Ниже
стояло «не задеты: `Popover`, `DropdownMenu` — они на `position: absolute`
относительно своего якоря». Это было верно до DS-240 (09.09.2026):
оба компонента с тех пор считают координаты `useAnchoredPosition` и лежат
`position: fixed` от вьюпорта (докблок «ЛОВУШКА CONTAINING BLOCK» в
`useAnchoredPosition.ts`), той же ловушке трансформа/`contain` подвержены
ТОЧНО КАК `Modal`/`Drawer`. `previews/Popover.tsx` и `previews/DropdownMenu.tsx`
сегодня НЕ обёрнуты в Stage (проверено чтением файлов — Stage-обёртки в них
нет), в отличие от `Modal.tsx`/`Drawer.tsx`. Замер «не задеты» повторно не
снят (инструмент `.ds-sync` в этом дереве не установлен), поэтому здесь не
утверждается ни «сломано», ни «всё ещё цело» — утверждается только то, что
ПРЕЖНЕЕ обоснование неверно и полагаться на него нельзя. Перед следующим
`/design-sync` стоит переснять карточки `Popover`/`DropdownMenu` и, если
харнесс действительно клипует/сдвигает панель, обернуть оба превью тем же
приёмом Stage+`container`, что и `Modal`/`Drawer`.

`Toaster` из этого списка исключён с 1.31.0: `.ds-toaster` уходит с `position: fixed` в портал `document.body`, поэтому его превью (`previews/Toaster.tsx`) переведено на тот же приём Stage+`container`, что и `Modal`/`Drawer`.

## Playwright
- В `.ds-sync/` стоит `playwright@1.61.0`, он требует сборку **1228** (и `chromium`, и `chromium-headless-shell` — захват идёт headless-шеллом).
- **Кеш машины чистится.** 2026-07-26 в `~/.cache/ms-playwright/` осталась только 1223, и `package-capture.mjs` падал с `Executable doesn't exist … chromium_headless_shell-1228`. Лечится из каталога `.ds-sync/`:
  ```sh
  cd .ds-sync && npx playwright install chromium chromium-headless-shell
  ```
  (~115 МБ, нужна сеть). Прежняя запись «браузер качать не нужно» была верна только пока 1228 лежал в кеше — не полагаться на неё.
- Симптом легко спутать с поломкой конвертера: падает не сборка, а стадия захвата, уже после успешного `package-build.mjs`.

## Re-sync risks (what can silently go stale)
- `dist/` is gitignored build output — **always run `cfg.buildCmd` before the driver** (resync). A stale/missing dist yields `[ZERO_MATCH]` or an old API.
- `buildCmd`'s CSS copy uses `cp --parents` (GNU coreutils). On a non-GNU machine (macOS/BSD) replace with an rsync/`ditto` equivalent.
- Fonts are NOT in the bundle by design (see above) — re-syncs won't add them until the repo carries the woff2 + `cfg.extraFonts`.
- This is a hand-built package (source `.tsx`), so the `.d.ts` come from our tsc build, not a shipped published dist — a change to component prop types requires a rebuild before re-sync to refresh `<Name>.d.ts`.

## Re-sync procedure (learned)
- **RUN `cfg.buildCmd` YOURSELF BEFORE `resync.mjs`.** The driver's `build` stage is the **converter** (`package-build.mjs`), NOT tsc — it does NOT run `cfg.buildCmd`. Skip it and the converter reads a **stale `dist/`**: new components are silently absent (verdict shows old count, log prints `(stale preview: <New> — component no longer exported)` and `[DTS] parsed N .d.ts from dist/src`). Sequence: `cfg.buildCmd` → fetch anchor → `resync.mjs`.
- `cfg.buildCmd` uses `find … -exec cp --parents {} … \;` — the `\;` must stay escaped. Run it **directly**, NOT via `eval "$(...)"` (word-splitting breaks the `\;`). Delete any stale `dist/*.tsbuildinfo` if tsc seems to skip new files.
- Prefer the **driver** (`resync.mjs --remote <saved anchor>`) over hand-picked partial `write_files`: several manual partial uploads (contrast, fonts, version) without a clean `buildCmd` left the remote `_ds_bundle.js`/`styles.css` slightly out of sync with a fresh build (`upload.bundle/styling=true`, components unchanged). The driver's diff catches exactly this — always close a session of manual edits with one driver re-sync so the anchor vouches for a clean build.

## Ресинк 2026-07-25 (1.3.0, без изменений кода)
- **Render-check tier у драйвера:** когда ничего render-affecting не поменялось, драйвер прогоняет **выборку** (было 10 из 46) и `.render-check.json` покрывает только её. Перед `DesignSync(report_validate)` нужен полный прогон: добавить `--render-sample 0` к `resync.mjs`. Полный прогон дал 46/46, `bad 0`, `thin 1` (Drawer — известный ложный), `fallbackCard: none` (все 46 с авторскими превью).
- **`.d.ts` не перечисляет унаследованные HTML-атрибуты.** Экстрактор фильтрует React DOM-props, поэтому у `TextField` в `.d.ts` только `label/hint/error/size`, хотя в исходнике `extends Omit<React.InputHTMLAttributes, 'size'>` и `value/onChange/placeholder` работают. Нативные атрибуты реально принимают: TextField, Textarea, Select, Checkbox, Radio, Switch, Button, Badge, Card, AppBar, CommandBar (+ SearchBar/Tile с Omit). **`NumberField`, `Combobox`, `DatePicker` — НЕ extends**, у них ровно то, что в `.d.ts`. Это описано в conventions.md; при добавлении компонентов проверять `grep "Props extends" src/components/*/*.tsx`.
- Ресинк без изменений исходников даёт `upload.any=false`. После правки `conventions.md` стало `aux=true` (только README) — залито полностью (241 файл), bundle/styling байт-в-байт прежние.

## Ресинк 2026-07-29 (1.11.0 → 1.12.0, +3 компонента: Timeline, LogViewer, Heatmap)

### Синк нашёл два дефекта, которых не увидели ни тесты, ни замер
Оба привели к релизу 1.12.0 **посреди синка**. Это не исключение — это то, ради
чего карточки и смотрят.

- **`Heatmap` не давал локализовать дни недели.** `formatMonth` и `formatTooltip`
  были, `formatWeekday` — нет, и колонка молча жила в локали браузера. В проде у
  русского пользователя это «Пн/Ср/Пт» и выглядит верным, поэтому не замечалось;
  в карточке вышло `Mon/Wed/Fri` посреди русского интерфейса, и починить нечем.
  Добавлен проп, дефолт не изменился.
- **`LogViewer` шёл на системном моностеке.** `[FONT_MISSING] "Cascadia Mono"` —
  формально ложное срабатывание (в конце стека generic `monospace`), но по сути
  верное: от шрифта ОС зависели ширина колонки времени и место обрезки строки.
  Владелец выбрал поставить свой — JetBrains Mono (OFL 1.1, веса 400/600) в
  `fonts/`, проведён через `cfg.extraFonts`.

**Правило:** компонент во время синка **не править** — бандл обязан
соответствовать выпущенному тегу, иначе дизайн-агент получит API, которого нет
ни в одном устанавливаемом теге. Правильный порядок: синк → находка → пауза →
релиз с тегом → продолжить синк на новой сборке. Так и сделано.

### Ловушка «нет авторского превью» сработала снова, и жёстче
Запись из 1.5.0 верна, но недооценивала масштаб. Для трёх новых компонентов:
`Timeline` и `Heatmap` дали **floor-карточку** («preview not yet authored»),
а `LogViewer` — `bad: true, blank: true` (4.7 КБ), потому что синтезированные
пропсы дали пустой лог. У `Heatmap` в `firstErr` было `RangeError: Invalid time
value` — синтезированные даты не разбираются.

При этом `pendingGrade` драйвера был **пуст**: без авторского превью грейдить
нечего, и вердикт выглядел спокойным. **Не считать пустой `pendingGrade`
признаком того, что работы нет.** После добавления компонентов всегда смотреть
`.render-check.json` на `fallbackCard: true` и `bad: true`.

### Локаль среды захвата — en-US, и это видно в карточках
Любой компонент, форматирующий даты через `Intl.DateTimeFormat(undefined, …)`,
в карточке отрисуется по-английски. В превью **всегда передавать явные
`ru-RU`-форматтеры** (`formatDay`/`formatTime`/`formatMonth`/`formatWeekday`),
иначе в русской ДС появляются `07/27/2026, 09:15 AM` и `Mon/Wed/Fri`.
Заодно карточка перестаёт зависеть от машины, на которой её снимают.

### Порядок «оценить → собрать» ломает оценки
Последовательность «точечный `preview-rebuild` → `package-capture` → записать
оценки → полный прогон драйвера» приводит к тому, что полная сборка
перевыпускает превью и **оценки сбрасываются**, а листы при этом байт-в-байт те
же. Пришлось перечитывать листы и переписывать оценки.

**Правильный порядок:** все правки превью и конфига → **финальный** прогон
драйвера → потом оценивать. Оценивать до последней полной сборки бессмысленно.

### Новые оверрайды
`cfg.overrides`: `Timeline` и `Heatmap` → `cardMode: column` (ожидаемо: лента
460px и год из 52 колонок шире ячейки сетки). Плюс **`Card` и `KeyValueList`** —
их `[GRID_OVERFLOW]` в списке известных варнов не значился, то есть по правилу
считался новым; лекарство применено то же.

### Якорь снова совпал
Локальный `ds-bundle/_ds_sync.json` сошёлся с `get_file("_ds_sync.json")` по
всем семи полям — копирование сэкономило перенос 13 КБ. Правило из 1.6.0 в силе:
сверять до копирования. Протухший `.cache/remote-sync.json` от прошлого синка
удалён до сверки, а не после.

### conventions.md
Имена проверены целиком — расхождений нет. Файл авторский и не переписывался;
добавлены **два аддитивных пункта** про новые семейства токенов
(`--ds-heat-0…4` и `--ds-highlight`), потому что именно из этого раздела
дизайн-агент узнаёт, чем красить: не перечислишь — придумает своё.

### Known render warns (актуально)
`[DOCS_UNMAPPED]` на все компоненты кроме `Toast` — ожидаемо. Больше на финальном
прогоне не было ничего: `✓ bundle is complete` без предупреждений, 57/57,
`bad 0`, `thin 0`, `fallbackCard 0`.

## Ресинк 2026-07-31 (1.12.0 → 1.26.0, +3 компонента: CodeBlock, EdgeBundling, TabPanel)

### Разрыв в 14 минорных версий — три новых компонента, а ждали одного
Прошлый синк остался на 1.12.0, и в проекте не было `CodeBlock` (1.22.0) и
`TabPanel` (1.24.0), про которые никто не помнил. Вердикт: `unchanged: 47`,
`changed: 10`, `added: 3`. **Не полагаться на память о том, что уже залито** —
это ровно то, что показывает диф якоря, и смотреть надо его.

### Ловушка «нет авторского превью» сработала третий раз и снова иначе
`TabPanel` был `added`, механический гейт по нему молчал (`bad: 0`, `thin: 0`),
и в **`pendingGrade` его не было** — грейдить нечего, когда превью нет. Опознаётся
только по `fallbackCard: true` в `.render-check.json`, где он был единственным из 60.

Запись из 1.12.0 говорила «пустой `pendingGrade` — не признак того, что работы
нет». Уточнение: **непустой `pendingGrade` тоже ничего не гарантирует** — в нём
было 12 из 13 нужных компонентов, и именно недостающий был единственным без
карточки. Правило проще: после `added` всегда сверять список `added` со списком
файлов в `.design-sync/previews/`.

### Оценки больше не сбрасываются на полной пересборке
Запись из 1.12.0 («порядок оценить → собрать ломает оценки») на этой версии
конвертера **не воспроизводится**: после правки одного превью и полного прогона
драйвера — `12 carried forward, 1 captured, 0 grade cleared`. Оценки следуют за
источниками (авторский `.tsx` + влияющий на превью конфиг), а не за сборкой.
Порядок «править всё → финальный прогон → оценивать» всё равно дешевле, но
переписывать оценки после пересборки уже не приходится.

### EdgeBundling: скупой `innerPadding` режет подписи
Первое превью на пяти листьях прошло весь механический гейт (`bad: 0`,
`fallbackCard: false`) и было негодным: приём не читался, а `AgglomerativeCluster`
срезалась левым краем холста. `innerPadding` — это **поле под подписи**: радиус
кольца равен `size/2 − innerPadding`, остаток до края занимает текст. При
`size: 420, innerPadding: 80` остаётся 120px на имя в 21 символ — впритык.
Итог: 18 листьев, `size: 560`, `innerPadding: 130`. **Новому графовому компоненту
считать этот остаток заранее.**

### Новые `[GRID_OVERFLOW]`
`CodeBlock`, `EdgeBundling`, `Pagination`, `Tabs` (+ `TabPanel` превентивно) →
`cardMode: column`. В известном списке варнов их не было, то есть по правилу
считались новыми.

### conventions.md: призраков нет, но словарь отставал
Машинная сверка (все `--ds-*` из `_ds_bundle.css` против названных в файле, все
имена в бэктиках против каталогов сборки) дала **ноль несуществующих имён**.
Зато нашлись пробелы, и они дописаны: `--ds-font-mono`, семантические `-fg`
(`--ds-success-fg` и другие — это текст на тинте, базовый токен это заливка),
`--ds-focus-ring`, `--ds-shadow-sm/md`, оговорка что `--ds-fs-lg` набирает глифы,
а не текст, и абзац про `TabPanel` рядом с правилом про `Tabs`.
**Полезная форма сверки:** не «есть ли призраки», а «что в сборке есть, а в файле
не названо» — первое было чисто, всё найденное дал второй список.

### Якорь снова совпал
Локальный `ds-bundle/_ds_sync.json` сошёлся с `get_file` по всем семи полям —
копирование сэкономило перенос 15 КБ. Правило из 1.6.0 в силе. Протухший
`.cache/remote-sync.json` от прошлого синка удалён **до** сверки.

### Known render warns (актуально)
`[DOCS_UNMAPPED]` × 59 (все, кроме `Toast`) — ожидаемо. Больше ничего: финальный
прогон дал 60/60, `bad 0`, `thin 0`, `fallbackCard 0`, `gridOverflow 0`.

## Ресинк 2026-08-05 (1.26.0 → 1.30.4, +8 компонентов: Center, Fit, Grid, PageShell, Prose, Split, Stack, Tree)

### Синк нашёл два дефекта ДС, и оба — «молчаливые»
Оба привели к релизам **посреди синка** (1.30.3 и 1.30.4). Ни 702 теста, ни 62
замера, ни витрина их не видели, и по одной причине: сломанное CSS не даёт
ошибки, оно просто ничего не делает.

- **`--ds-accent-subtle` не существовал.** На него ссылались `Tree.css:8`
  (фон выбранного узла) и `Form.css:86` (шапка framed-карточки-виджета), а в
  `tokens/tokens.css` его не было **никогда** (`git log -S` по файлу пуст).
  Токен «изобрели» в момент использования, в двух разных коммитах. Выбранный
  узел дерева жил без подсветки во всех выпущенных версиях.
- **`.ds-center` не брал высоту.** `place-items: center` без `block-size: 100%`
  центрирует только по горизонтали: грид сжимается по содержимому. Сосед по
  файлу `.ds-fit` высоту берёт — асимметрия была недосмотром. JSDoc обещал обе
  оси, компонент давал одну.

### Приём, которым нашёлся первый — стоит применять каждый синк
Не «посмотреть, всё ли красиво», а сверить по собранному `_ds_bundle.css`
множества **используемых** и **определённых** переменных:

```sh
node -e "const b=require('fs').readFileSync('ds-bundle/_ds_bundle.css','utf8');
const d=new Set([...b.matchAll(/(--ds-[a-z0-9-]+)\s*:/g)].map(m=>m[1]));
const u=new Set([...b.matchAll(/var\((--ds-[a-z0-9-]+)/g)].map(m=>m[1]));
console.log([...u].filter(t=>!d.has(t)))"
```

**Ложные срабатывания, которые он даёт всегда** (не чинить, просто знать):
`--ds-tree-cols`, `--ds-heat-cols`, `--ds-row-depth`, `--ds-log-clamp` —
задаются из JS в рантайме (`style={{'--ds-tree-cols': …}}`); `--ds-border-subtle`
— используется с запасным значением `var(--ds-border-subtle, var(--ds-border))`
и деградирует корректно. Валидатор конвертера печатает то же самое как
`tokens: N defined, M referenced (2 missing, below threshold)` — «below
threshold» усыпляет, а два «missing» стоит смотреть глазами.

### Значение токена подбирается замером, а не по образцу
Очевидное «взять `--ds-table-selected` (#DCEFEF)» было бы **ошибкой**: `Tree`
кладёт на эту подложку `--ds-accent`, и пара даёт 4.21 — ниже AA. Это уже
зафиксировано в `docs/contrast-report.md` как FAIL для `accent × table-selected`,
то есть отчёт знал, а код нет. Взято `#ECF6F6` (акцентный текст 4.55, основной
13.75) и `#143C3C` в тёмной (4.94 / 9.84); обе пары внесены в отчёт.
**Правило:** новый цветной токен — сперва посчитать контраст со всеми текстами,
которые на него лягут, потом вписывать.

### Ловушка «нет авторского превью» сработала четвёртый раз
Восемь `added`, и `pendingGrade` **пуст**. Семь встали на floor-карточку, а
`Tree` дал `bad: true, blank: true` (4.6 КБ, высота 9px) — синтезированные
пропсы дают дерево без узлов. Запись из 1.12.0/1.26.0 в силе и подтверждена:
**после `added` смотреть `.render-check.json` (`fallbackCard`, `bad`) и сверять
список `added` с файлами в `previews/`, а не верить спокойному вердикту.**

### Превью переносить из витрины, а не выдумывать
Все восемь композиций взяты из `demo/sections/layouts.tsx` и `tree.tsx` — это
авторские примеры, уже проверенные глазами. Две ошибки API поймались до сборки
чтением исходника: `Stat.delta` — объект `{value, direction}`, а не число;
иконки в превью рисуются инлайновым SVG (внешних пакетов вроде `@tabler` в
`previews/` нет ни в одном файле, и заводить их не надо).

### Новые `[GRID_OVERFLOW]`
`Center`, `Fit`, `Grid`, `PageShell`, `Prose`, `Tree` → `cardMode: column`.
`Stack` и `Split` не флагнулись (у `Split` обёртка `width: 100%`).

### Оценки не сбрасываются, и это проверяемо
Финальный `package-capture` дал **68 carried forward, 0 captured, 0 grade
cleared**. Промежуточный (после правки `Box.css` и конфига) сбросил ровно
`Center` — то есть оценки следуют за источниками, включая влияющий на превью
CSS компонента. Порядок «все правки → финальный прогон → оценивать» соблюдён.

### conventions.md: призраков нет, дописан один токен
Сверка обеими сторонами: 56 имён токенов в файле — все существуют в сборке;
29 имён компонентов в бэктиках — все имеют каталог. Аддитивно добавлен абзац про
`--ds-accent-subtle` (иначе дизайн-агент про новый токен не узнает и смешает
свой оттенок, который не пройдёт по контрасту).
**Сознательно НЕ названы** `--ds-skel-base`, `--ds-skel-highlight`,
`--ds-weekend` — они внутренние для `Skeleton` и `Calendar`, потребителю ими
красить нечего. Не считать их пробелом на следующем синке.

### Якорь снова совпал
Локальный `ds-bundle/_ds_sync.json` сошёлся с `get_file` по всем семи полям —
копирование сэкономило перенос 17 КБ. Правило из 1.6.0 в силе; протухший
`.cache/remote-sync.json` удалён **до** сверки.

### Known render warns (актуально)
`[DOCS_UNMAPPED]` на все компоненты кроме `Toast` — ожидаемо. Больше ничего:
финальный прогон дал 68/68, `bad 0`, `thin 0`, `fallbackCard 0`,
`gridOverflow 0`.

### Re-sync risks, добавленные этим синком
- **Правки компонентов посреди синка возможны и нормальны**, но каждая требует
  своего тега: бандл обязан соответствовать выпущенной версии. В этот синк было
  два таких цикла подряд (1.30.3, 1.30.4) — это не исключение, а рабочий режим.
- **Проверку «используется, но не определено» гонять на каждом синке.** Она
  дешёвая и уже дважды окупилась; класс дефекта («CSS молча не красит») другими
  воротами не ловится вовсе.
- `previews/Fit.tsx`, `previews/Split.tsx`, `previews/Stack.tsx` красят демо-блоки
  через `--ds-accent-subtle`. Если токен когда-нибудь уберут — эти три карточки
  побелеют молча, ровно как было до 1.30.3.

## Ресинк 2026-08-07 (1.30.4 → 1.38.0, 8 минорных, 0 новых компонентов)

### ГЛАВНОЕ: контактный лист ОБРЕЗАЕТ карточки, а не масштабирует
Скриншоты рендер-чека — всегда **1200×800** (вьюпорт проверки), независимо от
`cfg.overrides.<Name>.viewport`. Контактный лист тайлит их в узкие ячейки
**кропом**. Значит у любой карточки, чьё содержимое лежит правее кропа, ячейка
выглядит пустой или сломанной.

В этот синк это стоило **двух ложных тревог подряд**: `Drawer` показался
«серый блок + обрезанная панель», `Toaster` — «пустая карточка, тостов нет».
Обе выглядели как настоящая регрессия портала 1.31.0 и обе были враньём
инструмента: панель `Drawer` стоит справа от кропа, стопка `Toaster` — в
правом нижнем углу. И `_screenshots/review/*.png` (по-сторийные), и полные
`_screenshots/<group>__<Name>.png` показали обе карточки **исправными**.

**Правило: не объявлять карточку сломанной по контактному листу.** Лист годится
для «что-то не так, посмотри», но вердикт — только по полному скриншоту или
ревью-листу. Особенно для всего, что позиционируется вправо/вниз: `Drawer`
(side=right), `Toaster` (bottom-right), `DropdownMenu`, `Popover`.

Это тот же класс, что уже записан про `_ds_bundle.css` и про замер контраста:
**сломанный (или неверно прочитанный) инструмент даёт связный отрицательный
результат, и он выглядит как ответ.**

### Ловушка «unchanged по хешам ≠ та же картинка» сработала снова
1.32–1.38 поменяли **разметку рантайма** примерно у десяти компонентов
(`Combobox` и `GlobalSearch` — опция больше не оборачивает `<button>`;
`FormTabs` — роль переехала на кнопку; `Calendar` — `aria-label` + роуминг;
`Tooltip` — `cloneElement` + CSS-мостик; `Popover` — исчез `.ds-popover__anchor`;
`CommandBar` — роуминг по DOM; `DropdownMenu` — кольцо фокуса; `ProgressBar` —
проброс `...rest`). В `changed` при этом попали только `Drawer`, `Modal`,
`Toaster` — те, у кого поменялась разметка **карточки**.

Правило из 1.6.5 в силе и подтверждено третий раз: после релиза, менявшего
рантайм, смотреть скриншоты затронутых компонентов, даже когда они `unchanged`.
Здесь всё оказалось цело (проверено по листам 1–5 и точечно), но узнать это
можно было только глазами.

### Проверка «используется, но не определено» — чисто, и новые токены на месте
93 определено / 89 используется; в «missing» те же четыре JS-задаваемых
(`--ds-tree-cols`, `--ds-heat-cols`, `--ds-row-depth`, `--ds-log-clamp`) плюс
`--ds-border-subtle` с фолбэком. Новые токены 1.31/1.36 — `--ds-z-popup`,
`--ds-z-tooltip`, `--ds-z-drawer`, `--ds-z-modal`, `--ds-z-toast`,
`--ds-focus-ring-inset` — все определены и все используются.

### conventions.md: призраков нет, дописан слой z и inset-кольцо
Сверка: 56 токенов, 29 имён компонентов, 0 классов — все существуют в свежей
сборке. **Аддитивно добавлено два пункта**, оба — то, что дизайн-агент не может
угадать: шкала `--ds-z-*` (шаг 100, свой слой встраивать `calc()`-ом от
токена; тост выше модалки намеренно; Modal/Drawer/Toaster уходят порталом в
`document.body`, поэтому `z-index` на месте вызова до них не достаёт) и
`--ds-focus-ring-inset` для элемента, растянутого до краёв своей панели.
После правки хедера — обязательный прогон **драйвера** (не голого конвертера),
иначе загруженная сборка остаётся без квитанции.

### Оценки: 3 сброшено → переоценено → финал чистый
`Drawer`/`Modal`/`Toaster` получили `grade cleared — contract changed`, оценены
с свежих ревью-листов (4 ячейки, все `good`), финальный прогон дал
**3 carried forward, 0 captured, 0 grade cleared**.

### Якорь совпал в девятый раз
Локальный `ds-bundle/_ds_sync.json` сошёлся с удалённым по всем семи полям.
Протухший `.cache/remote-sync.json` удалён **до** сверки. Перед `finalize_plan`
якорь перечитан из проекта — не двигался, параллельного синка не было.

### Known render warns (актуально)
`[DOCS_UNMAPPED]` на все компоненты кроме `Toast` — ожидаемо. Больше ничего:
68/68, `bad 0`, `thin 0`, `fallbackCard 0`, `gridOverflow 0`,
`variantsIdentical 0`. Новых `[GRID_OVERFLOW]` нет.

### Re-sync risks, добавленные этим синком
- **Сборка теперь генерирует два файла сверх `dist/`** — `dist/styles.bundle.css`
  и `dist/theme-auto.css` (`scripts/build-bundles.mjs`, вызывается из
  `cfg.buildCmd`). Конвертера они не касаются (`cssEntry` = `tokens/tokens.css`),
  но если `buildCmd` когда-нибудь урежут — гейт `src/__guards__/dist-bundles.test.ts`
  упадёт раньше синка.
- **`Tooltip.children` и `Popover.trigger` с 1.36.0 — `React.ReactElement`, а не
  `ReactNode`.** Превью обоих уже передают элемент, поэтому компиляция не
  сломалась; но новое превью со строкой в детях молча упадёт на floor-карточку
  (в логе — `! preview build failed`). Проверять эту строку после смены API типов.
- `previews/Modal.tsx`, `previews/Drawer.tsx`, `previews/Toaster.tsx` держатся на
  пропе `container` + Stage. Уберут `container` у любого из трёх — карточка
  сбежит порталом на весь вьюпорт. Проп в публичном API, но связь неочевидна.

## Ресинк 2026-08-13 (1.38.0 → 2.3.0, 107 коммитов, мажор, +8 компонентов)

### Проверка «используется, но не определено» окупилась третий раз
`--ds-radius-pill` в `RouteBar.css:52` **без фолбэка**, определения нет нигде
(`git log -S` даёт только сам коммит RouteBar 1.43.0). Счётчик раздела
(«Долги 2») ехал квадратом во всех выпущенных версиях. Тот же класс, что
`--ds-accent-subtle` в 1.30.3. Починено релизом **2.3.1** посреди синка
(инвариант `RouteBar: счётчик раздела — пилюля, а не квадрат`, мутация в обе
стороны: без токена «радиус 0 при высоте 14.84», с токеном 89/89).

**Утверждение проверялось замером, а не глазами по листу:** computed
`border-radius` у `.ds-routebar__count` = `0px` до и `999px` после, при
соседе-контроле `.ds-routebar__link` = `3px` в обоих прогонах. Сосед в замере
обязателен — на нём видно, что инструмент читает радиусы, а не возвращает ноль
всему подряд.

**Актуальный список ложных срабатываний** (не чинить): `--ds-tree-cols`,
`--ds-heat-cols`, `--ds-row-depth`, `--ds-log-clamp` — задаются из JS;
`--ds-border-subtle` — с фолбэком; `--ds-orgbadge-brand` — **намеренно**
задаётся листом потребителя (`brandColor` убран в 1.47.0), тоже с фолбэком.

### Ловушка «нет авторского превью» — пятый раз, и снова новая форма
Восемь `added`, `pendingGrade` содержал из них **только RouteBar** (его превью
приехало вместе с компонентом). Четыре дали `bad: true, blank: true`
(AgentTranscript, EstimateMark, LedgerList, OrgBadge), а **три прошли весь
механический гейт с `bad: 0, thin: 0, fallbackCard: 0`** и были негодными:
`AsOf` рисовал «на AsOf», `Money` — «Money,00 ₽», `ToggleGroup` —
«Item 1Item 2Item 3». Синтезированные из `.d.ts` пропсы подставляют **имя
компонента** в обязательную строку — узнаётся только по полю `texts`.

Правило окончательное: после `added` смотреть три вещи, а не вердикт —
`fallbackCard`, `bad`, и **`texts` на предмет имени компонента внутри**.

### Мажор 2.0–2.3 переименовал API, но превью не сломались — и это надо проверять руками
`tone` (danger→error, default→neutral), `density`→`dense`, `activeId`/`selected`
→`selectedId`, `checkedIds`→`selectedIds`, `onToggleRow`→`onSelectionChange`,
`onResize`→`onSizeChange`, `Card variant` default→plain. Репозиторий обновил
свои `.design-sync/previews/` в тех же коммитах (67358bd, 6e441dd) — повезло.

**esbuild типы не проверяет**: превью со старым именем пропа скомпилировалось бы
и молча отрисовало не то. Дешёвая проверка, гонять после каждого мажора:
```sh
grep -rnE 'density=|activeId=|checkedIds|onCheckedChange|onToggleRow|onResize=|tone="danger"|tone="default"|variant="default"' .design-sync/previews/
```
В этот синк — чисто. Десять компонентов с переименованиями попали в `changed`,
их карточки просмотрены глазами: выбор в DataTable/Tree подсвечен, `Card`
framed рисуется, «Удалить» в DropdownMenu красный.

### Обрез в ревью-листе — снова ложная тревога (второй раз)
`DropdownMenu.Open` в `_screenshots/review/` выглядел обрезанным справа; полный
`_screenshots/general__DropdownMenu.png` показал меню целиком с кольцом фокуса.
Правило из 2026-08-07 подтверждено: **вердикт только по полному скриншоту**.

### Новые `[GRID_OVERFLOW]`
`LedgerList` (лента 640px) и `ToggleGroup` (сегменты со счётчиками) →
`cardMode: column`. В известном списке их не было, то есть по правилу считались
новыми.

### conventions.md: призраков нет, дописаны два раздела
Сверка обеими сторонами: 0 несуществующих токенов, 0 несуществующих имён.
Аддитивно добавлены **`## One name per idea`** (три словаря 2.x — иначе
дизайн-агент будет писать `tone="danger"`, которого больше нет) и **`## Money is
a component, not a formatted string`** (иначе он отрисует `toFixed(2) + ' ₽'`
мимо трёх различимых состояний), плюс `--ds-radius-pill` в семейство радиусов.

**Ловушка при сверке имён:** `RowAction` и `DropdownItem` **не попадают ни в
один выпущенный `.d.ts`** (экстрактор не раскрывает вложенные типы), поэтому
называть их дизайн-агенту нельзя — он их не увидит. Формулировка переведена на
«объекты, которые вы передаёте в …». Проверять имена и по `.d.ts`, а не только
по каталогам сборки и тексту бандла: `BadgeTone` живёт **только** в `.d.ts`.

### Порядок «все правки → финальный прогон драйвера → оценки» соблюдён
Итог: `76 carried forward, 0 captured, 0 grade cleared`. Полный рендер-чек
(`--render-sample 0`) — 76/76, `bad 0`, `thin 0`, `fallbackCard 0`,
`variantsIdentical 0`, `gridOverflow 0`.

### Якорь совпал в десятый раз
Локальный `ds-bundle/_ds_sync.json` сошёлся с `get_file` по всем семи полям
(68 компонентов, 204 sourceHashes) — копирование сэкономило перенос 18 КБ.
Протухший `.cache/remote-sync.json` удалён **до** сверки.

### Re-sync risks, добавленные этим синком
- **`make release` интерактивен ($EDITOR) и в агентской сессии не годится.**
  Рабочий путь: `make bump` (бамп + scaffold без редактора) → заполнить тело
  раздела CHANGELOG → `make check-full` → `node scripts/release.mjs commit`.
  Страж чистого дерева ловит **untracked** — новые `previews/*.tsx` коммитить
  до бампа.
- **`cd` в Bash-вызове переживает вызов** (запись 1.6.5 подтверждена: после
  `cd .ds-sync` следующий `node -e` не нашёл `ds-bundle/`). Возвращаться в
  корень явно.
- В zsh `rm -f dist/*.tsbuildinfo` при отсутствии файлов **валит всю цепочку**
  (`no matches found`) — сборка после него не выполняется, а выглядит как
  выполненная. Проверять `dist/` после, а не верить коду возврата цепочки.
- `previews/AgentTranscript.tsx` держится на явных `ru-RU`-форматтерах и словаре
  `ROLES`: без них карточка показывает «user»/«assistant» и «09:15 AM».
- В `src/components/LedgerList/index.ts` в комментарии затесались иероглифы
  («`LedgerColumn` —本地»). На сборку не влияет, глаза цепляет — поправить при
  случае.

## Ресинк 2026-08-21 (2.3.1 → 2.4.0, 0 новых компонентов)

### ГЛАВНОЕ: залито ≠ видно дизайн-агенту — `_ds_manifest.json` отстал на два синка

Хендофф, скачанный владельцем 21.08, приехал с `_ds_manifest.json` на **55**
компонентов: без `AgentTranscript`, `Tree`, `ToggleGroup`, `TabPanel` и без
JetBrains Mono в `fonts/`. При этом `list_files` показывает все **76** каталогов
компонентов и оба mono-шрифта — файлы лежали в проекте с синка 13.08.

Разгадка в сигнальном файле: `_ds_needs_recompile` **всё ещё был в проекте**.
Его стирает серверный self-check при открытии проекта, а манифест и
`_adherence.oxlintrc.json` генерирует он же. Сигнал на месте ⇒ self-check после
загрузки не отработал ⇒ манифест остался от более раннего синка. Дизайн-агент
раскладывал макет по манифесту, поэтому четыре компонента рисовались
заглушками `hint-size`, хотя лежали в проекте.

**Следствие для будущих синков:** загрузка сама по себе ничего не показывает.
После закрытия синка проект надо **один раз открыть в браузере** — иначе
`_ds_manifest.json` (и всё, что из него читает дизайн-агент) остаётся старым
сколько угодно долго. Признак болезни виден без загрузки макета: `list_files`
показывает `_ds_needs_recompile` в проекте, который никто не открывал после
прошлой заливки.

### Версия сменилась, картинки — нет: `unchanged 76` при `upload.any true`

Драйвер дал `verification: unchanged 76, changed 0, added 0`, но
`upload: bundle/styling/aux = true` и 76 компонентов в `upload.components`.
Разные вопросы: рендер-хеши не изменились (превью выглядят так же), а
`sourceHashes` изменились (пересобранный бандл, правки `.d.ts` у `Select`,
CSS-фикс ячейки действий `DataTable`). Скоупить заливку по разделу verification
нельзя — правило «writes всегда полные» ровно про этот случай.

### Якорь совпал в одиннадцатый раз

Локальный `ds-bundle/_ds_sync.json` сошёлся с `get_file` по всем скалярам
(`styleSha`, `scriptsSha`, `auxSha`, `bundleSha12`, `keyRecipe`) и по счётчикам
76/76/228 плюс выборке из 9 renderHashes и 5 sourceKeys. Протухший
`.cache/remote-sync.json` (18:55 13.08, старше финальной заливки 19:32) удалён
**до** сверки — иначе диффу достался бы якорь предыдущего прогона.

### Known render warns (актуально)

`[DOCS_UNMAPPED]` на все компоненты кроме `Toast` — ожидаемо. Больше ничего:
76/76, `bad 0`, `thin 0`, `fallbackCard 0`, `gridOverflow 0`,
`variantsIdentical 0`. Новых `[GRID_OVERFLOW]` нет. `[DETECT] … found .storybook
at []` — информационная строка драйвера, не предупреждение.

### conventions.md: призраков нет, дописан один раздел

Сверка обеими сторонами: 64 упомянутых токена — все определены в
`_ds_bundle.css`, 52 имени — все находятся в каталогах сборки, `.d.ts` или
тексте бандла. Аддитивно добавлен буллет **про `hint`** в «One name per idea»
(заголовок переведён на 2.0.0–2.4.0): у поля `hint` вытесняется `error` — оба
делят один `aria-describedby`, проверено по исходникам всех пяти полей
(`TextField`, `Textarea`, `Select`, `NumberField`, `DatePicker` — везде
`error ? …-err : hint ? …-hint : undefined`); `Combobox` и `CodeInput` берут
`error` **без** `hint`; а `Stat.hint`, `hint` у метрики `MetricStrip`,
`FileDrop.hint` и `EstimateMark.hint` — вообще другая идея, и её ничто не
вытесняет. Повод: 2.4.0 добавил `Select.hint`/`Select.error` по образцу
`TextField`, и без этой строки дизайн-агент рисовал бы свою ошибку рядом с
подсказкой, которую компонент уже убрал.

### Re-sync risks, добавленные этим синком
- **`cd` в Bash-вызове переживает вызов — подтверждено в третий раз.** После
  `cd ds-bundle/components` следующий вызов с относительным путём не нашёл
  `ds-bundle/`. Держать абсолютный путь или `cd` в корень первой командой.
- `render-check.json` после прогона драйвера покрыл все 76 (bundle изменился ⇒
  тир «full» выбран сам). Выборочный тир здесь не включался — если увидите
  меньше 76 записей перед `report_validate`, добавляйте `--render-sample 0`.

## Ресинк 2026-08-22 (2.4.0 → 2.5.0, 0 новых компонентов, 2 изменившихся)

### Изменились ровно две карточки, и Card среди них НЕ оказался

`changed: ['Heatmap','RouteBar']`, `unchanged: 74`. При этом в релиз 2.5.0 вошла
и починка `Card` (снят `overflow:hidden`). Это не расхождение: `renderHashes`
считаются по **отрисовке карточки**, а превью `Card` ничем за кромку не вылезает
— клип там нечему было резать. Изменение приехало в `upload` через
`styling: true`/`bundle: true`, а не через verification. Ещё один случай того же
правила, что записано в синке 2.4.0: **скоупить заливку по разделу verification
нельзя**.

### `InHeader` у RouteBar: карточка прошла все гейты и ничему не учила

Первая версия превью для нового пропа `embedded` (полоса в голом `div` с
`borderBottom`) дала `bad: 0`, `thin: 0`, `variantsIdentical: 0` — и картинкой
была **неотличима от `Default`**: одна линия там, одна тут. Формально верно (в
этом и смысл признака), а как карточка бесполезна: дизайн-агент видит то же
самое и не понимает, зачем проп.

Переписал: шапка нарисована целиком — ряд с заголовком и организацией, под ним
полоса, под всем этим ОДНА линия. **Правило на будущее:** превью пропа, который
что-то УБИРАЕТ, обязано показывать контекст, в котором это «что-то» мешало.
Иначе ячейка проходит рубрику «styled/complete/plausible» и всё равно не несёт
своего утверждения. Механический гейт такое не ловит по построению.

### `cd` в Bash-вызове пережил вызов — четвёртый раз

`cd ds-bundle` при сборке списка файлов → `finalize_plan` с `localDir:
"./ds-bundle"` упал на `.../ds-bundle/ds-bundle`. Запись из синка 2.4.0 верна и
подтверждена снова. **Первой командой после любого `cd` — возврат в корень.**

### Якорь совпал в двенадцатый раз

Локальный `ds-bundle/_ds_sync.json` сошёлся с `get_file` по всем пяти скалярам
(`styleSha`, `keyRecipe`, `scriptsSha`, `auxSha`, `bundleSha12`), по счётчикам
76/76/228 и по выборке `renderHashes`/`sourceKeys` для Card/Heatmap/RouteBar —
скопирован вместо переноса 21 КБ. Протухший `.cache/remote-sync.json` от синка
21.08 удалён **до** сверки. Перед `finalize_plan` якорь перечитан повторно (не
сдвинулся).

### Проект открывать не пришлось искать — sentinel был чист

`list_files` перед заливкой **не показывал** `_ds_needs_recompile`: значит
self-check после прошлого синка отработал и манифест был свежим. Это признак
здоровья из синка 2.4.0, работающий в обе стороны — проверять его перед заливкой
дешевле, чем ловить потом заглушки `hint-size` в макете.

### Новое в guidelines

`docs/ui-audit-portal.md` (в архиве; обход 26 маршрутов портала потребителя) подхватился
`guidelinesGlob` автоматически и уехал третьим файлом в `guidelines/docs/`.
Ничего настраивать не пришлось — но знать полезно: **любой новый `docs/*.md`
попадает дизайн-агенту в guidelines**, так что внутренние заметки туда класть не
стоит.

### Known render warns (актуально)

`[DOCS_UNMAPPED]` на все компоненты кроме `Toast` — ожидаемо, печатает **сборка**
(`package-build.mjs`), не `validate`. Сам `package-validate.mjs` не дал ни одного
тега: `✓ bundle is complete`. Итог финального прогона: 76/76, `bad 0`, `thin 0`,
`fallbackCard 0`, `variantsIdentical 0`, `gridOverflow 0`.

## USER RULE — sync is manual
The user always runs `/design-sync` themselves. Do NOT proactively push to the Claude Design project after code changes — commit/push to git, and leave the upload to the user (or to an explicit request / a `/design-sync` invocation).

## 1.3.0 sync learnings
- **Toast регруппировался** `general` → `notifications` (эвристика группы в source-kit.mjs берёт имя папки-источника `Notifications/`, т.к. оно ≠ имени компонента). Только Toast (NotificationCenter/Toaster остались general). `deletePaths` корректно убирает старый `components/general/Toast/*`. Пытался вернуть в general через `cfg.docsMap.Toast` → стаб `.design-sync/docs/Toast.md` с `category: general`: **prompt.md подхватился, но группу НЕ переопределяет** в этой версии конвертера (source-kit group важнее frontmatter category). Оставил Toast в `notifications` — функционально исправно.
- **`[DOCS_UNMAPPED]` на ВСЕ компоненты — ожидаемо, не баг.** Пер-компонентных `.md` в репо нет (`cfg.docsDir` не задан), `prompt.md` синтезируются из `.d.ts` + превью. Единственная запись в `cfg.docsMap` — стаб `Toast`.
- ~~**Known render warns:** `Drawer` помечается `thin` — ложное срабатывание~~ **НЕВЕРНО, исправлено 2026-07-25.** Срабатывание было **истинным**: панель рендерилась нулевой высоты, шапка/поля/футер наваливались друг на друга. Причина и фикс — в разделе «Оверлеи в карточках» ниже. Известных ложных варнов сейчас нет.
- Новые оверрайды в config: `Alert`/`EmptyState`/`Stat` → `cardMode:column` (GRID_OVERFLOW), `Drawer`/`Popover`/`Toaster` → single+viewport (оверлеи).

## Ресинк 2026-07-26 (1.5.0, волна C: +6 компонентов)

### Отсутствие авторского превью ≠ floor-карточка — и это ловушка
Компонент без `.design-sync/previews/<Name>.tsx` **не обязательно** получает типографский «пол».
Конвертер сначала пробует отрендерить его синтезированными пропсами из `.d.ts`, и если корень
непустой — карточка считается нормальной: `fallbackCard: false`, `bad: 0`, `thin: 0`.

Так `BarChart` при первом прогоне дал **пустое поле с осью 0…0,25…1** (`texts: ["00,250,50,751"]`)
и прошёл весь механический гейт. `DonutChart` синтезировал «Item 1/2/3, Всего 6» — тоже мимо.
Драйвер при этом печатает `(<Name>: nothing to capture — re-ships via the upload partition,
no grading needed)` и оставляет `pendingGrade` пустым, то есть **градация не попросит внимания**.

**Правило:** после добавления компонента смотреть его запись в `.render-check.json` — поле
`texts`. Если там видны выдуманные `Item 1`, `0,25`, `Lorem` и подобное, превью нужно писать
руками, сколько бы ни было нулей в `bad`/`thin`.

### Якорь: локальный `ds-bundle/_ds_sync.json` бывает НОВЕЕ удалённого
Не копировать его в `.design-sync/.cache/remote-sync.json`. В этом прогоне локальный файл
описывал 52 компонента (сборка волны C, которую не заливали), а проект — 48. Диф от такого
«якоря» соврал бы про то, что уже лежит в проекте. Забирать только `DesignSync(get_file,
path:"_ds_sync.json")` и записывать его содержимое; старый кеш в `.cache/` удалять — он
остаётся от прошлого синка и молча подставляется.

### Новое в конфиге
- `cfg.overrides.BarChart` / `cfg.overrides.DonutChart` = `{"cardMode": "column"}` — оба графика
  шире ячейки сетки, как `LineChart`.

### Playwright
Кеш `~/.cache/ms-playwright/` на этой машине содержал и 1223, и **1228** — захват прошёл без
доустановки. Запись из прошлого ресинка про `npx playwright install` остаётся в силе как риск:
кеш чистится, и симптом выглядит как поломка конвертера, хотя падает стадия захвата.

### Known render warns
- `[DOCS_UNMAPPED]` для всех компонентов кроме `Toast` — ожидаемо: в репозитории нет per-component
  документации, `.prompt.md` синтезируется из `.d.ts` + превью. Не является новым предупреждением.

## Ресинк 2026-07-28 (1.6.3, фикс Button + JSDoc DropdownMenu.trigger)

### JSDoc пропов режется на 120 символах — и правки в ds-bundle не живут
- Экстрактор (`lib/dts.mjs:434`) кладёт в `.d.ts`/`.prompt.md` только первые **120 символов**
  JSDoc пропа (многострочный схлопывается в одну строку). Длинный комментарий обрезается молча,
  посреди фразы. Критичное ограничение — в первые 120 символов, остальное дальше.
- Ручная правка `ds-bundle/**/*.prompt.md` затирается первой же пересборкой. Durable-место для
  заметок дизайн-агенту про проп — **JSDoc в исходнике** (уехал в `.d.ts` + `.prompt.md` разом).
  Так уехала заметка «trigger у DropdownMenu — только span, не button» (1.6.3).
- Как и в 1.6.0: `changed: 0`, но `upload.any: true` (bundle+styling+aux — версия в штампах) —
  залито всё, грейдить нечего.

## Ресинк 2026-07-26 (1.6.0, только новые пропы)

### «changed: 0» не значит «синкать нечего»
Волна 1.5.1→1.6.0 добавила пропы (`ariaLabel`, `titleLines`, `embedded`, `columns`) и правила
CSS, но ни одного компонента. Вердикт драйвера выглядел так:

    verify — unchanged: 54 | changed: 0 | added: 0
    upload.any: true | bundle: true | styling: true | компонентов: 54

Это правильно и ожидаемо: `renderHashes` описывают **HTML карточки**, а он от новых пропов не
меняется — превью их не задействуют. `sourceHashes` же видят новые `.d.ts` и `.prompt.md`.
Поэтому **градация не нужна, а заливка нужна вся**. Не принять `changed: 0` за «ничего не
поменялось» и не пропустить синк: без него у дизайн-агента останется старый контракт API.

### Локальный якорь копировать можно — но только после сверки
Прошлая запись «не подставлять локальный `_ds_sync.json`» верна не всегда. Если между синками
не запускали конвертер, `ds-bundle/_ds_sync.json` **и есть** залитый якорь. Проверка перед
копированием: `bundleSha12`, `styleSha`, `auxSha`, `scriptsSha` и число компонентов должны
совпасть с тем, что вернул `DesignSync(get_file, "_ds_sync.json")`. В этот раз совпали все семь,
и копирование сэкономило перенос 13 КБ хешей вручную. Не совпало хоть одно — записывать
полученное из проекта.

### `.ds-root` намеренно НЕ описан в conventions.md
Класс решает спор с чужим правилом `body` у приложения-потребителя. В рантайме claude.ai/design
чужого `body` нет — там единственная таблица стилей наша, — поэтому дизайн-агенту он не нужен и
был бы шумом. Описан только в `docs/portal-migration/consumption.md`.

## Ресинк 2026-07-29 (1.6.5, LineChart на useChartBox)

### `unchanged` по хешам ≠ «картинка та же» — ловушка ресинка после правки рантайма
Драйвер дал `unchanged: 54, changed: 0` и `bad: 0` — и это было **правдой про HTML карточек**
и ложью про то, что увидит человек. `renderHashes` считаются от разметки карточки, а 1.6.4/1.6.5
поменяли **поведение компонента в рантайме** (LineChart стал резиновым). Разметка та же, картинка
другая. Механический гейт такое пропускает **по устройству**, а не по ошибке.

**Правило:** если релиз менял рантайм-поведение компонента (замеры, ResizeObserver, layout-эффекты),
после драйвера **обязательно смотреть скриншот этого компонента**, даже когда он в `unchanged`.
Здесь это вскрыло реальный дефект — см. ниже.

### Фиксированная обёртка в превью чарта — это костыль, который копирует дизайн-агент
`previews/LineChart.tsx` оборачивал чарт в `<div style={{width: 360}}>`, `BarChart.tsx` — в 440.
Обёртки появились, когда полный чарт держал пропорции холста и раздувался по высоте на широкой
карточке (та же боль, от которой портал спасался `max-width`). После 1.6.4 они врут дважды:
карточка занимает треть ширины ячейки, и **дизайн-агент видит в примере «чарт надо зажимать»**.
Убраны у обоих; у LineChart добавлен экспорт `Narrow` (320px) — он честно показывает адаптацию
плотности подписей оси X. `DonutChart` обёртку сохранил осознанно: у бублика своя пропорция,
а не «чем шире, тем лучше».

**Правило для новых чартов:** превью показывает чарт на всю ширину ячейки. Фиксированная ширина
допустима только как отдельная story, демонстрирующая узкий контейнер.

### Правка превью «унесла» оба чарта в changed — так и надо
После правки: `changed: ["BarChart","LineChart"]`, `pendingGrade` заполнился, оценки переписаны с
свежих листов (5+5 ячеек, все `good`). Полный прогон рендер-чека — `--render-sample 0` — 54/54,
`bad 0`, `thin 0`, `fallbackCard 0`.

### Локальный якорь снова совпал с удалённым
`ds-bundle/_ds_sync.json` совпал с `get_file("_ds_sync.json")` по всем семи полям (+ выборка
`renderHashes`/`sourceKeys`) — копирование сэкономило ручной перенос 15 КБ. Правило из 1.6.0 в
силе: сверять до копирования, иначе брать из проекта. Протухший `.cache/remote-sync.json` от
прошлого синка при этом отличался `styleSha` — его надо удалять, а не доверять ему.

### conventions.md: проверка имён прошла целиком
Все токены (`--ds-*`), экспорты (`initTheme`/`setTheme`/`getTheme`/`useTheme`/`subscribeTheme`/
`chartSeriesVar`/`ThemeToggle`), 54 каталога компонентов и все упомянутые пропы существуют в
свежей сборке. Осторожно с грепом по каталогам: `Card` живёт в `Form.tsx`, `Tile` — в
`Dashboard.tsx`, `Checkbox`/`Radio`/`Switch` — в `Toggle/`, поэтому `grep -l "Props extends"
src/components/*/*.tsx` их «не находит», хотя они extends. Не принимать это за дрейф.

**Предложение к следующему редактированию хедера (не внесено — файл авторский):** у `Tile`
проп `value` — DS-овый (`React.ReactNode`), HTML-атрибут `value` вырезан через `Omit`. Стоит
дописать в список исключений рядом с `size` у TextField/Textarea/Select.

### Мелочь про харнесс
`cd ds-bundle` в Bash-команде переживает вызов: следующий `finalize_plan` с `localDir: "./ds-bundle"`
разрешился в `ds-bundle/ds-bundle` и упал ENOENT. Либо возвращаться в корень, либо передавать
абсолютный путь.

## Ресинк 2026-08-26 (3.0.6) — четыре находки, все про процедуру

- **Локальный кеш якоря ЛЖЁТ. Всегда тянуть `_ds_sync.json` с проекта заново.**
  `.design-sync/.cache/remote-sync.json` от прошлого прогона совпал с удалённым по
  `renderHashes` и `sourceKeys`, но разошёлся по `styleSha`, `auxSha`, `bundleSha12`
  и ПО ВСЕЙ карте `sourceHashes` (228 путей). То есть кеш описывал более старую
  заливку. Верить ему нельзя даже когда «компонентов столько же»: сверять надо три
  верхних sha, а не число ключей.
- **Превью обязаны проходить рантайм-утверждения самого компонента.**
  `previews/DataTable.tsx` держал `{ id: 'actions', header: '' }` — колонка БЕЗ
  `actions`, то есть обычная display-колонка с пустым заголовком, а её `assertHeader`
  запрещает броском (DS-80). Превью пережило появление проверки и тихо гнило:
  карточка рисовалась (root не пуст, PNG 50 КБ), но три ячейки из шести бросали, и
  `bad: 3` вылезло только на полном render-check. Починка — `header: 'Действия'` +
  `headerHidden: true`. **Урок общий: утверждение, добавленное в компонент, не
  проверяет превью, пока не прогонишь `--render-sample 0`.**
- **`finalize_plan` резолвит `localDir` от cwd ОБОЛОЧКИ, а не от корня репозитория.**
  После `cd ds-bundle` вызов с `--localDir ./ds-bundle` дал
  `ENOENT … /ds-bundle/ds-bundle`. Передавать абсолютный путь.
- Playwright: сборка 1228 в кеше была, доустанавливать не пришлось. Запись про
  чистку кеша (выше) остаётся верной как риск, а не как факт этого прогона.

**Что предложено, но НЕ сделано (решение владельца):** `conventions.md` не описывает
`Badge brand` — шов под цвет из данных потребителя, выпущенный в 3.0.5/3.0.6.
Дизайн-агент увидит проп в `Badge.d.ts` вместе с докблоком, так что это не ложь, а
пробел. Файл принадлежит авторам, поэтому переписан не был.

## Ресинк 2026-09-20 (3.0.6 → 4.2.6, 76 → 88 карточек)

- **Floor-карточка может ПОВЕСИТЬ validate, а не только выйти пустой.** `EventCalendar`
  без авторского превью на синтезированных пропах не дорисовывался: снимки встали на
  `EstimateMark` (следующий по алфавиту — он), 10 минут без CPU и без ошибки, драйвер
  не падал. Лечение — написать превью ДО прогона; `package-capture` с превью снял его
  сразу. Признак: `ls -la --time-style=+%T ds-bundle/_screenshots | tail` перестал
  расти — смотреть на это, а не ждать уведомления.
- **Из 12 «новых» компонентов три настоящих** (`EventCalendar`, `PivotTable`, провайдер
  `DsText`). Девять — публичные глифы `src/icons/` (`Icon`, `ToneIcon`, `ChevronDown/Up/
  Left/Right`, `Close`, `Search`, `Dots`): конвертер берёт любой PascalCase-экспорт.
  Оставлены карточками НАМЕРЕННО — у каждого свой `.d.ts`, а смысл экспорта в том,
  чтобы потребитель брал наш глиф, а не рисовал копию. Превью глифа — ряд в `<Icon>`
  (цвет через `style` на самом `<Icon>`, НЕ через обёртку-span: иначе первый знак
  садится ниже соседей) плюс кнопка с текстом и `iconOnly`.
- Группы: `Icon` → `icons`, `DsText` → `dictionary` (имя папки ≠ имени компонента),
  семь глифов и `ToneIcon` → `general`. Не правилось: `docsMap`-стаб группу не
  переопределяет (запись 1.3.0).
- `[GRID_OVERFLOW]` → `cardMode: column`: `DsText` (новый), `Stack` (`JustifyBetween`,
  раньше не флагался).
- **Header ужат до 19 253 символов** (20.09, по требованию владельца «почистить радикально»):
  из conventions выкинуты истории дефектов, номера версий и задач, замеры и мораль в
  конце разделов — дизайн-агенту нужно правило, а не протокол. README стал 23 173
  символа при окне 32 000, запас ~8,8k. Проверка длины: `wc -c` считает БАЙТЫ
  (кириллица по 2), символы — `python3 -c "print(len(open(p,encoding='utf-8').read()))"`.
- **`guidelinesGlob` сужен до `["docs/colour-pairings.md"]`** (20.09, решение владельца).
  Умолчание берёт все `docs/*.md`, и дизайн-агенту уезжали `BACKLOG.md`,
  `code-search.md`, `guards.md`, `writing-checks.md`, `ui-audit-portal.md` и
  `contrast-report.md` — внутренние заметки про трекер, поиск по коду и гейты. Хуже
  прочих был `contrast-report.md`: он сам объявляет себя историей с разошедшимися
  числами, то есть агент читал устаревшую палитру как факт. Шесть файлов удалены из
  проекта отдельным планом (`deletes: ["guidelines/**"]`): диф якоря их не видит —
  `upload.deletePaths` пуст, там только компоненты, — поэтому пути назывались руками.
- Якорь: локальный `ds-bundle/_ds_sync.json` совпал с проектом по 4 sha, 76/228 и
  выборке хешей — скопирован. Итог: 88/88, `bad 0`, `thin 0`, `fallbackCard 0`,
  `variantsIdentical 0`, удалений 0.

### Known render warns (актуально)
`[DOCS_UNMAPPED]` на всё, кроме `Toast` — ожидаемо. Предупреждение о длине README —
принято осознанно (см. выше).
