# jig (`@santarinto/jig`)

Design system. React 19 plus TS. Styles on CSS tokens `--ds-*`. Build is `tsc`
into `dist/`. The package is private, shipped by tarball or git, never to a
registry. Two consumer applications install it by a pinned tag; which ones and
where they live is in `CLAUDE.local.md`.

**`make check` агент запускает сам, всегда** (разрешено владельцем 04.09.2026).
Не «объясни, что перепроверить», а прогони и покажи последнюю строку. Оговорка
одна: **не запускать его, когда владелец гоняет свой** — два прогона разом
отвечают на один вопрос по-разному. Под `/goal` она снимается: там некому
набирать.

**Остальные прогоны запускает владелец, не агент.** `make check-full`, `make
release`, `make push`, `make published` и отдельные тяжёлые цели набирает
человек: они занимают его машину и его chromium.

`vitest` по одному файлу и `tsc --noEmit` — это не прогон, а чтение, и агент
запускал их и раньше. Быстрая проверка одним файлом НЕ заменяет `make check`:
`measure`, `states` и `dock-floor` в неё не входят, а именно они смотрят на
превью и на браузер.

Checks are split by subject, not by speed.
- `make check` (guards, test, test-tz, typecheck, build, dist-version,
  dist-untracked, dist-checks, measure, states, dock-floor, shell-rhythm). Is the source
  correct. This is the working check in the edit loop. It prints what it did not
  check, and its LAST line is the verdict with the cost: `CHECK OK — исходник: …
  N s, фон на старте LA a b c на K ядрах`.
- `make check-full` (adds matrix, smoke, smoke-noscripts, smoke-ssr, smoke-upgrade,
  smoke-delivery, wb-smoke). Does it reach the consumer. Throwaway `npm install`
  apps that test packaging. Last line: `CHECK FULL OK — N s, фон …`.
- **Сколько идёт целая цель и сколько случаев держит `measure` — здесь не
  написано намеренно: оба числа печатает сам прогон последней строкой.**
  Прибитое устаревает молча и читается как факт. Держит запрет гейт
  `doc-live-numbers`.
- Never run the full check by hand before a release. `make release` runs
  `check-full` itself, as one of the steps it drives — see Release for what those
  steps are and when you would ever type one yourself.
- `make help` lists targets. `make push` sends, separately.

**Почему шаг стоит там, где стоит, и сколько он стоит — `docs/checks.md`.**
Открывать, когда шаг хочется передвинуть, удешевить или выбросить: там цена
каждого и довод, которым он куплен. Оттуда же два исключения, которые иначе
читаются как беспорядок: `matrix` по предмету принадлежит `check`, а лежит в
`check-full` по решению владельца о цене; `smoke-delivery` гоняется на ПУСТОМ
кэше, и это не небрежность, а предмет замера.

This file holds always, before any component is named. Per-component decisions are
in `AGENTS.md`.


## Частная половина: `CLAUDE.local.md`

Рабочий порядок владельца — трекер, соседи-агенты, его браузер, поиск по коду,
делегирование, локальная модель, пути его машины — лежит в `CLAUDE.local.md`
рядом с этим файлом. В git он не входит (`.gitignore`), Claude Code грузит его
сам. Здесь — только то, что верно для любого, кто склонировал репозиторий:
законы системы, проверки, гейты, выпуск. Гейты читают ЭТОТ файл
(`colour-law`, `width-surface`, `doc-live-numbers`), поэтому законы отсюда не
переносятся.

## Component reference: `AGENTS.md`, on demand

`AGENTS.md` is not loaded into context. Claude Code does not pick up the name.

```bash
awk '/^## Tabs([ (]|$)/{f=1;print;next} /^## /{if(f)exit} f' AGENTS.md  # one section
grep -n '^## ' AGENTS.md                                             # table of contents
```

`([ (]|$)` after the name, not a bare `(`: every heading happens to be
`## Name (path)` today, and a command leaning on the bracket breaks on the first
one written without it — silently, by printing nothing. The alternative keeps the
name anchored, so `## Tabs` does not also match `## FormTabs`. (`\b` does NOT work
here: in awk it is a backspace, not a word boundary. Verified — it printed nothing
on a heading that exists.)

Read the one section, not the file: 929 lines to answer a question about one
component is paying context to save a regex.

Open it whenever you change a component's public behaviour. The why lives there
and is not in the types. Gate `src/__guards__/agents-catalog.test.ts` requires a
section per catalogued component.

## Deprecated API: break compilation, do not support it

There is no compatibility period. The old form is deleted in the same release the
new one ships. "Until everyone has migrated" is forbidden: the defect then lives
for years and looks like it works.

When you change the shape of an API:
1. Make sure the old call is a TYPE ERROR, not a degradation. Write the old form in
   a test and run `npm run typecheck`. Check runtime too, in case `any` is on the
   consumer's path. The old call must throw.
2. Rewrite previews and documentation in the SAME commit. The example is stronger
   than `CHANGELOG`. Few read `CHANGELOG`, everyone copies the example.

Gate `src/__guards__/no-nested-interactive.test.tsx`. No interactive element inside
an interactive element. A wrapper used in place of a layout must fail, not scatter
props.

CHANGELOG. "Not used by consumers" is written only together with the grep command
that showed it. Never generalise a check from one consumer to all.

## Checks: prove the check can fail

Break the thing a check was written for and confirm it goes red. Mutate
immediately, restoring the defect a week later is work. A surviving mutation is
sometimes dead code, not a hole in the check.

Eight ways a check passes without checking, and the traps behind each:
`docs/writing-checks.md`. Open it before writing a test or a gate, and before
believing a green one. An accessibility fix in particular can CREATE a defect out
of harmless code.

## Gates

What each gate asserts and why: `docs/guards.md`. Open it before changing,
weakening or deleting anything under `src/__guards__/` or `scripts/`.

**Read the one section, not the file.** The register is the largest file in the
repository by a wide margin, and reading it whole to learn the contract of one
gate costs more context than the change being made. One heading per record since
DS-351:

```bash
awk '/^## /{f=/colour-law/} f' docs/guards.md   # все секции, чей заголовок совпал
grep -n '^## ' docs/guards.md                   # оглавление
```

`f=/…/` without `exit`, unlike the `AGENTS.md` recipe, and that is the whole
difference: a short name can belong to TWO records (`touch-surface` is both
`scripts/touch-surface.mjs` and `src/__guards__/touch-surface.test.ts`), and a
recipe that stops at the first one answers half the question without saying so.

`make measure` needs chromium. `make published` is the only gate that touches the
GIT REMOTE, so it is not in `check` or `check-full`: it is the first step of
`release` and the last step of `push`. (Реестр npm — другое дело: его трогают все
смоуки `check-full`, они на то и одноразовые `npm install`.) `make push` sends to
one place, `origin` — the same public repo GitHub Actions builds the release
asset from (JIG-3: the second, private mirror this used to push to alongside
`origin` is gone) — and it sends `main` (JIG-28: no `delivery` branch any more,
the tag rides along with `main` via `--follow-tags`). Before either target does
anything, `check-public-root` refuses if the old repository's history (the one
this history was squashed from) is an ancestor of HEAD: `santarinto/jig` starts
empty and goes public on the first release, and a commit that ever reached
GitHub stays fetchable by SHA even after a force-push.

## System law: colour and magnitude

Colour encodes state or category. Never magnitude. Magnitude goes in position, in
height, or in an ordered ramp.
- `--ds-chart-*` is the system's ONE categorical palette. Not only chart series:
  a label's colour uses it too (`ToggleGroup variant="swatch"`, DS-245).
  One palette because "category" is one meaning — a second set for the same
  meaning is two answers to one question. The name is narrower than the palette
  and stays: renaming it with an alias would buy an honest name and no
  independence at all, since the values would still be shared.
  Guard: ANY TWO of the eight distinguishable, measured in CAM16-UCS under three
  kinds of colour blindness as well as normal vision. NOT "neighbours" — that was
  the old wording and the old guard, and it survived in this line for months
  after `tokens.css` and `conventions.md` had both moved on.
  A colour that comes from the consumer's data (which colour his tag is) is his;
  the SET he picks from is ours.
- `--ds-heat-*` is the only place for colour as magnitude, with even steps in L*.
- Day type in `Heatmap` is encoded by shape, not by a step.
- `BarChart` tone is state, previous or current. Magnitude is in the height.
- **Colour confirms a tone and never carries it** — every tone also has an icon
  and a word. The tone dictionary was measured against the chart palette's own
  method for the first time on DS-181, and in the light theme the 12% tints
  of `warning` and `error` are IDENTICAL under deuteranopia (ΔE' 0.00). So the
  floor on tones is the just-noticeable difference (1.0), not the series palette's
  5.5: a confirmation needs no margin, but it may not contradict the sign.
  Guard `tokens/tonePalette.test.ts`, carrier guard `tone-carrier`.
- **Which foreground is legal on which surface is declared**, not judged per
  screen: `tokens/colourPairs.ts` plus its gate, printed whole at
  `demo/pairings.html`, reasons in `docs/colour-pairings.md`. An undeclared pair
  is not the system's answer even when its contrast clears the floor — that middle
  state is the point of the matrix, because it is where colours get picked at
  random. `docs/contrast-report.md` больше не отчёт: его
  рукописные таблицы молча разошлись с токенами, и на DS-351 они удалены
  — остались только РЕШЕНИЯ и их доводы, которых из токенов не пересчитать.

Written down in `.design-sync/conventions.md`, which goes into the header of the
Claude Design agent.

## System law: пол поддерживаемой ширины — 440 CSS-px

Решение владельца 22.09.2026 (DS-380). 440 — CSS-вьюпорт iPhone 17 Pro Max
(440×956 при dpr 3, физика 1320×2868). Число названо УСТРОЙСТВОМ, а не вкусом:
владелец назвал его по памяти, и оно совпало с двумя независимыми источниками.

**Ниже 440 система не обещает ничего.** До этого решения она об этом молчала, а
молчание читается как «поддерживаем всё»: 360 жил литералом в матрице не потому,
что его выбрали, а потому, что его когда-то померили.

**Ниже пола не смотрят и не мерят НИГДЕ** (решение владельца 24.09.2026, JIG-29;
отменяет прежнее «пол — обещание, а не запрет мерить ниже»). Замер под 440 —
красный без предмета: находка там не дефект системы, а значит проверка, которая
на неё смотрит, отвечает на вопрос, которого не задают. Поэтому ни одна ширина
меньше 440 не стоит ни вьюпортом, ни кадром или чипом верстака, ни хостом
`measure`, ни шириной случая, ни кадром в jsdom-тесте, ни шириной в брифе
браузерному агенту. Кадры 360/380/400 у стрелки `Tabs` и полосы `Pagination`,
которые прежнее правило держало, сняты. Находка НА 440 и выше заводится, как
прежде.

Вне правила ровно две вещи, и обе — не ширина, на которую смотрят, а поведение
компонента: пороги `@container` в его CSS и собственные размеры компонента
(поповер шириной 360 px). Прибитые числа ниже 440 в прозе-истории («замер на
360 показал…») — довод, которым куплено решение, их не переписывают.

Число живёт в коде ОДНИМ литералом — `WIDTH_FLOOR` в `scripts/width-surface.mjs`;
оттуда его берёт базовый вьюпорт матрицы (`scripts/case-matrix.mjs`). Здесь оно
повторено словами, и гейт `width-surface` сверяет эту строку с литералом:
разойдутся — покраснеет. Второе число оси ширины (`WIDTH_SECOND`) полом не
является и живёт по своему доводу, записанному в шапке того же файла.

## Доступность и клавиатура ОТКЛЮЧЕНЫ на время MVP

Решение владельца 13.09.2026, его область (продукт и приоритеты). Отменяет и
ужесточает прежнее правило от 07.09.2026 («ПОТОМ, отдельными задачами»): теперь
это не «позже», а **не делается вовсе, пока идёт MVP**.

**Ни на верстак, ни на компоненты не тратить время на адаптацию для
скринридеров и на клавиатурную обработку.** Сюда входят: доступные имена и
объявления диктора, перенос и возврат фокуса, роуминг и стрелки, видимость
кольца фокуса, проверки через Orca и axe.

Что это значит на практике.
- Находка такого рода **НЕ заводится в трекер вовсе.** Прежнее правило велело
  заводить с приоритетом `lower` — оно отменено: тринадцать лежащих задач это
  тринадцать поводов каждый раз решать заново. Увидел — сказал вслух в ответе и
  прошёл мимо.
- Эпик DS-250 **отменён целиком: все 13 задач в `cancelled`** с
  `reasonCode: out_of_scope` (решение владельца 13.09.2026). Отменены, а не
  оставлены в backlog, намеренно: лежащая задача — это повод каждый раз решать
  заново, брать или нет. Возвращать их, когда MVP кончится, надо заведением
  ЗАНОВО — это дешевле, чем разбирать протухший список.
- **Промт браузерному агенту не заказывает** обход имён, `Tab`-порядок и
  скринридер НИКОГДА, а не «если задача волны не об этом». Найденное им попутно
  в вердикт не идёт и в замечания тоже.
- Законы про доступное имя и видимый фокус в `.design-sync/conventions.md` и
  `wb-agent-brief` **перестают быть блокирующими** на время MVP. Они остаются
  записанными как то, к чему система вернётся, но сейчас ничего не держат.

**Чего это правило НЕ отключает, и это не смягчение, а граница предмета.**
Три вещи из прежнего списка «не ломать» держатся дальше, потому что они не про
доступность:
- `no-nested-interactive` — гейт корректности DOM, а не доступности.
  Интерактивный элемент внутри интерактивного съедает клик У МЫШИ тоже:
  вложенная кнопка перехватывает нажатие по строке. Снять его — завести обычный
  функциональный дефект.
- `src/internal/roving.ts` — это УЖЕ РАБОТАЮЩЕЕ поведение живых компонентов у
  потребителей. Убрать его значит сломать то, что работает, то есть заплатить
  работой и регрессом за отрицательную экономию. Не трогать — бесплатно.
- `states` — гейт про то, что объявленные в фикстуре селекторы видны в кадре.
  К доступности отношения не имеет вовсе, попал в прежний список по соседству.

`aria-*`, уже стоящие в разметке, из неё не выкидываются: удаление — это работа,
а не экономия, и MVP от неё ничего не получает.

Снимается владельцем явно, в этом файле; истёкшим по времени не считается.

## Commits

Commit actively in this project without waiting to be asked. This overrides the
global rule about not committing unasked. Split the work into atomic commits by
logical step, one commit one thought, and leave the tree green after each: gates
and tests pass. Messages are full: what was done and why, with the task reference
(`CODE`) and the reasoning behind the decision. The conventional-commits type
(`feat`, `fix`, `refactor`) is for reading the history — it does NOT drive the
release bump; the level comes from the component catalogue (see Release). Push
only on an explicit request. A commit is not a push.

**One exception, and it has bitten for real (3.0.6).** During a release, NEVER
sweep `VERSION_FILES` into a commit — `package.json`,
`docs/portal-migration/consumption.md`, `.design-sync/conventions.md`,
`tokens/tokens.css` (the `--ds-version` token, fifth since DS-215), the
`CHANGELOG.md` heading and the root record of `package-lock.json` (sixth since
DS-318). After `make bump` they are dirty ON PURPOSE and belong to
`release.mjs commit`. A dirty tree there is not a thing to tidy up; it is the
release in progress. Use a targeted `git add <path>`, never `git add -A`, from the
bump until the tag exists. Recovery, if it happened anyway, is in Release below.

## Release: `make release`, no parameters

**Разборы сломавшихся выпусков — `docs/release.md`.** Открывать, когда правило
отсюда хочется обойти или отменить: там цена каждого. Здесь — только действующее.

**The level counts COMPONENTS, not compatibility. Patch is the default.**

- Major — a component is removed from the catalogue.
- Minor — a component is added.
- Everything else, breaking API changes included, is a patch.

This is not loose semver, it is a different question being asked, and it holds
because of how the package is consumed: `consumption.md` installs a PINNED TAG
(`git+https://…#vX.Y.Z`), never a range. Nobody upgrades by themselves, so the
number cannot silently deliver anything — it is a label on the catalogue, not a
promise about ranges. What warns the consumer is the `Breaking` section of
`CHANGELOG.md` and a compilation error or a throw at his end, and those are the
things to get right.

So: never argue a level from how big the diff feels or how much broke. Ask one
question — did the catalogue gain or lose a component — and count what breaks at
the consumer into the CHANGELOG instead.

**Тег указывает на ИСХОДНЫЙ коммит выпуска (JIG-28).** Ветки `delivery` больше
нет: DS-246 решал одну задачу — не дать npm качать `devDependencies`
git-зависимости — отдельным поставочным коммитом без исходников и урезанным
манифестом. С JIG-28 потребитель вообще не ставит git-зависимость: GitHub
Actions на push тега `v*` собирает `dist/`, пакует его (`npm pack`,
`prepack`/`postpack` чистят манифест — `scripts/strip-manifest.mjs`) и
прикладывает `santarinto-jig-X.Y.Z.tgz` к GitHub Release. Строка установки
меняется на URL готового тарбола — не в этой задаче, а в JIG-3, вместе с
первым выпуском по новой схеме; `consumption.md` до тех пор не трогается.
`git show vX.Y.Z` снова показывает исходники, `sourceOf`/трейлер
`Source-commit:` сняты — `detectBumpLevel` и `latestTag` считают напрямую от
тега, он снова прямой предок HEAD.

Отсюда же форма `make push`: едет ОДНА ветка, `main`. `--follow-tags`
отправляет тег вместе с ней без отдельного перечисления имён.

### Команда поиска в пункте CHANGELOG

**Every item the consumer has to find in HIS OWN CODE carries the SEARCH
COMMAND, not only the description.** That is `Breaking` and "visibly changes
without an error" alike — a runnable line, `git grep -n "onRowClick"`, sitting
in the item itself, so the consumer gets an address and not an announcement.

The command belongs to the item, not to the prose above it. Prose is read once at
upgrade time; the item is what someone comes back to a year later.

If a break leaves no textual trace to search for, say so in the item and name
what shows up instead — the compilation error or the throw, with its text. "Check
your usages" is not a command.

**The command is RUN on a multi-line call before it goes into the CHANGELOG, and
it must tell two states apart.** Проверять различением, а не счётчиком: фикстура
из двух вызовов, у одного атрибут на отдельной строке, у другого его нет.
«Стало печатать меньше» ничего не доказывает — меньше печатает и команда,
сломанная в другую сторону.

**«Было» в пункте — это ПРОШЛЫЙ ВЫПУСК, а не то, что задача застала.**
Промежуточных состояний внутри выпуска потребитель не видел никогда, и пункт,
отсчитывающий от них, врёт тем убедительнее, чем аккуратнее написан. Пункт
пишется при закрытии задачи, то есть по середине выпуска, — значит при сборке
раздела «было» каждого пункта сверяется с тегом, а две задачи, двигавшие одно
и то же, сводятся в один пункт. На 4.2.6 таких нашлось шесть: `ToggleGroup
framed` объявлялся переехавшим в `accent-subtle`, хотя на HEAD он не там;
`Split` считал шаг от 10 px, которых в 4.2.5 уже не было; четыре графика
называли «было» состояния шагов того же выпуска. Свести без замера против
прошлого тега нельзя — тогда пункт помечает своё «было» как шаг этого же
выпуска и ссылается на пункт, который называет тег.

If grep cannot measure the class exactly, SAY SO in the item and give the upper
bound — never pass an approximation off as a count. A field named by an outer
`<label htmlFor>` is indistinguishable from a nameless one to any grep; twelve of
one consumer's nineteen were exactly that.

The worked form for "an attribute inside a tag" lives in
`scripts/find-unlabeled-fields.pl`. It sits in the repo so that it is CHECKED:
whenever a release item quotes it, gate `changelog-search-command` runs both the
file and the snippet lifted out of `CHANGELOG.md` against one fixture and
requires the same answer. (The item that quoted it, 4.0.1, stayed in the old
journal when the history restarted at 1.0.0; the gate now also requires every
```perl block in the journal to be parsed, so a quote that stops being seen
goes red instead of silent.) A command that lives only as prose is one nobody ever
runs again, and it rots silently.

Направление тоже часть пункта. Знак, зависящий от настройки потребителя,
называется вместе с настройкой, и команда начинается с «сначала узнай свою»:
`git grep -n "ds-ui-scale"`.

**Путь потребителя в команду не зашивать, и рядом с искомым — ЯКОРЬ**
(DS-166). Без знаменателя ноль не свидетельство ни о чём. Форма, с 4.2.0:
- `git grep` от корня репозитория, путь не зашит. Именно `git grep`, а не
  `grep -r .`: тот заглянет в `node_modules`, где лежит сам этот пакет, и
  посчитает наш исходник за использования потребителя.
- В каждом блоке ```bash строка с `# якорь` — тот же вызов с именем, которое
  обязано найтись, и это имя ВСЕГДА `ds-1c-taxi`. Имя компонента якорем не
  бывает (DS-350): оно лжёт в обе стороны и обе проверены на фикстуре.
  Вперёд — `git grep -l "Split"` находит чужой `SplitView`, а `"LineChart"` —
  комментарий на PHP, и якорь подтверждает дерево чужим именем. Назад —
  `Tooltip` у потребителя, который его не взял, даёт честный ноль, и якорь
  перестаёт отличать «не используем» от «искал не там», то есть исчезает ровно
  там, ради чего заведён. Имя пакета есть у любого потребителя и от набора
  взятых компонентов не зависит. Блок «узнай свою шкалу» тоже с якорем: ноль
  там значит «шкала 1» только при ненулевом якоре.
- Код возврата называется в шапке секции: `1` — честный ноль, `0` — найдено,
  прочее (`128` вне репозитория, `129` битый флаг) — сломан вызов, а не чист
  код. У наивной пары в `src/` искомое И якорь дают 1 — она не различает.
- Любая величина в px, не только знак, названа на шкале 1 и у потребителя
  умножена на его `--ds-ui-scale` (1.15 у одного из потребителей: 24 читается как 27.6).
  Секция, называющая px, несёт `git grep -n "ds-ui-scale"`.

Гейт `changelog-search-command` держит форму на НОВЕЙШЕЙ секции — старые уже
скопированы, это история — и доказывает утверждение о кодах возврата не по
памяти, а на фикстурном репозитории с раскладкой потребителя; там же он
ЗАПУСКАЕТ каждую команду секции и требует код 0 или 1, иначе вызов сломан.
Проверено пятью мутациями: зашитый путь, снятый якорь, `grep -r` вместо
`git grep`, незакрытая кавычка, пропавшая команда шкалы при названных px.

Про ИМЯ якоря гейт судит секцию, которая ещё не выпущена, — остальное он
держит на новейшей всегда. Выпущенную не трогает намеренно: под её командами
стоят замеры на живых деревьях потребителей, сделанные тем самым якорем, и
пересчитать их отсюда нечем — переписанная команда над несходящимся замером
хуже, чем старая форма. В 4.2.6 таких якорей 123, и это ровно цена, которую
не платят.

### Кого раздел обязан назвать: всех, кто дошёл до потребителя

**Код задачи, чей коммит тронул ВХОД СБОРКИ, обязан встречаться в разделе
выпуска.** Не «желательно»: `prepare` отказывает кодом 4 и перечисляет
неназванных, до `check-full`, чтобы правка двух строк не стоила целого
прогона. Проверяется УПОМИНАНИЕ кода, а не наличие своего пункта: пункт бывает
один на две задачи.

Вход сборки (JIG-28, было `dist/` на DS-244/350), а не написанный список
путей, — потому что `dist/` больше не в git (CI собирает его сам после тега),
и вопрос «дошло ли до потребителя» задаётся по тому, что реально скомпилирует
`tsc` и скопирует `build`, если его сейчас собрать: `src`, `tokens`, `types`
(из `tsconfig.build.json`) плюс `fonts/*` и генераторы бандлов. Список
ВЫВОДИТСЯ (`buildInputConfig` в `release.mjs`), не пишется руками — написанный
список путей отвечал бы похоже и расходился бы со сборкой молча, тем же
классом ошибки, что был у DS-350; гейт `build-input-mapping` доказывает,
что вывод ничего не забыл, сверяя его с тем, что реально паковает `npm pack`.

Отсюда же: **пункт поставленной задачи НАЗЫВАЕТ её код.** Сборка черновика
текст пункта не переписывает (команды поиска в нём прогнаны на фикстуре), но
задачу без кода в тексте называет отдельной строкой — иначе выпуск отказал бы
на задаче, у которой пункт как раз написан.

Задача, чья правка в поставку ушла, но адреса не требует (в `dist/` один
комментарий в CSS), освобождается СТРОКОЙ В САМОМ РАЗДЕЛЕ, с доводом длиннее
20 знаков (тире любое, довод хоть в несколько строк):

```
<!-- без пункта: DS-303 — в dist ушёл только комментарий в CSS -->
```

Отдельного файла-списка нет намеренно: он пережил бы выпуски, о которых
написан, и через год читался бы как правило. Освобождение уезжает вниз вместе
со своим разделом.

Заведено по DS-350: DS-262 переставила знак раскрытия `Accordion`
и вышла в 4.2.5 без единой строки, а сверка 4.2.6 нашла ещё 12 таких, включая
два Breaking, о которых никто не сказал. Цена и мутации — `docs/guards.md`,
запись `release-flow`.

**Посылку держит гейт, а не конвенция (DS-352).** Всякий коммит
диапазона, тронувший вход сборки, обязан нести код В СКОБКАХ темы и не нести
кода вне скобок; иначе `prepare` отказывает кодом 5. Это закрывает обе прежние
дыры сразу — код в теме без скобок и правку, разнесённую по двум коммитам:
разнесённая пара всё равно даёт коммит, тронувший вход сборки, и он либо
называет задачу, либо отказывает. Освобождение — КОММИТА, по
sha: `<!-- без адреса: 0123456 — довод -->` в самом разделе, довод длиннее 20
знаков. Что остаётся снаружи, названо вслух: коммит, назвавший в скобках ЧУЖОЙ
код, проходит — гейт доказывает, что у поставки есть адрес, а не что адрес
верный.

### Что делает прогон

`scripts/release.mjs prepare` computes the level from the CATALOGUE, comparing
the directories under `src/components` at the previous tag against HEAD — the
same definition of "a component" the `agents-catalog` gate uses. Removed gives
major, added gives minor, otherwise patch, and it prints which names moved so a
bare "patch" is not mistaken for "the detector understood nothing". Commit
messages no longer decide anything: `feat!` on an existing component is a patch.

The owner's level still wins over any computation: run `make bump level=<...>`
first, then `make release` resumes on the version already in place and does not
recompute.

The version lives in 6 files: `package.json`,
`docs/portal-migration/consumption.md`, `.design-sync/conventions.md`,
`tokens/tokens.css`, the `CHANGELOG.md` heading, and the root record of
`package-lock.json`. Gate `doc-version` holds them in sync, and **its own list
(`src/__guards__/doc-version.test.ts`) is the one to count from** — not this
sentence, and not memory: `TRACKED`, plus the CHANGELOG case, plus the lock
case, plus `package.json` itself as the reference. В `release.mjs` это
`DOC_SITES` (`package.json`, заголовок `CHANGELOG.md` и лок обрабатываются
отдельно), то есть счёт — `DOC_SITES.length + 3`. Эта фраза дважды отставала от
гейта; см. `docs/release.md`.

`bump` правит два корневых поля `version` разбором JSON, а НЕ через `npm install
--package-lock-only`: тот пошёл бы в реестр и мог бы переразрешить дерево внутри
релизного коммита. Корневые ДИАПАЗОНЫ — другая причина и другой гейт,
`lockfile-deps`; `bump` их не трогает вовсе.

**`prepare` no longer builds or stages `dist/` (JIG-28).** It used to — the
built package lived in git (DS-244), so the bump made the working copy
stale and `prepare` rebuilt it before `check-full` could see the mismatch.
`dist/` is not in git any more (gate `dist-untracked`), so there is nothing to
stage: `check-full`'s own `build` step produces the copy GitHub Actions will
rebuild independently on push of the tag, and neither has to agree with a
staged copy in the release commit.

**After `make bump`, leave those six files uncommitted.** The release commit is
what `commit` makes out of them, and it dies with `nothing to commit, working
tree clean` if a `git add -A` swept them into an earlier commit — the tree is
green, `check-full` passes, and the release fails at the last step. Recovery is
`git reset --soft` to before that commit, then `git restore --staged` the six,
then commit the rest. Hit for real on 3.0.6.

`make release` drives three steps itself — you type the one command. They are
listed here to be understood, not to be run: `prepare` (bump plus `CHANGELOG.md`
in `$EDITOR`), then `make check-full`, then `commit` (add the 6 version files,
`git commit -F <tmpfile>` with the CHANGELOG body, annotated tag `v<version>`
ON the release commit itself — JIG-28, no separate delivery commit, no
`dist/` in the commit). Pushing the tag is what triggers GitHub Actions to
build and attach the tarball (`.github/workflows/release.yml`); nothing in
`release.mjs` builds it.
Typing a step by hand is for recovery only, when a run died in the middle. An empty body, a non-zero
editor status or SIGINT rolls the bump back with `git checkout --`, on a fresh
start only.

**Без `$EDITOR` релиз идёт ТРЕМЯ ШАГАМИ, и бамп при этом НЕ откатывается**
(DS-146). `prepare`, не найдя `$EDITOR`, отказывается — но оставляет
дерево ровно в том состоянии, которое даёт `make bump`, и печатает выход:

1. `make bump` — уже сделано тем самым отказавшим прогоном, повторять не нужно;
2. вписать тело раздела `## [X.Y.Z]` в `CHANGELOG.md` руками;
3. `make release` — пойдёт по resume, тело не пусто, редактор не нужен.

Отката тут нет намеренно: он выбрасывал бы уже посчитанный уровень и уже
вписанный scaffold. `$EDITOR не задан` и `редактор вышел с кодом N` — два разных
отказа с разной починкой; держат это три случая гейта `release-flow`.

**Шаг 2 не пишется руками: `make changelog-draft` собирает тело из артефактов
задач** (DS-257). Порядок для человека: `make bump` →
`DS_DOCS_PATH=<каталог артефактов задач, см. CLAUDE.local.md> make
changelog-draft` → прочесть и поправить раздел → `make release`.

- Пункт задачи — `$DS_DOCS_PATH/tasks/<CODE>/<CODE>.md`, разделы `###`. Коды —
  из скобок в ТЕМАХ коммитов от `prevTag` до HEAD (JIG-28: тег снова прямой
  предок HEAD, `sourceOf` снят), не из трекера: релиз не зависит от живого MCP.
- Корень не угадывается: без `DS_DOCS_PATH` отказ. Угаданный мимо путь выдал
  бы «пункта нет ни у кого» — правдоподобный отчёт о пустом выпуске.
- Одноимённые `###` сливаются, текст пункта копируется дословно: команды поиска
  в нём прогнаны на фикстуре, и переписывание сделало бы их непроверенными.
  Задача без пункта называется кодом в выводе — многим пункт и не нужен
  (правки CLAUDE.md, верстака), но решает это человек, а не молчание.
- `## [Unreleased]` вбирается в раздел выпуска, заголовок снимается; пункт
  задачи, уже упомянутой там кодом или лежащий там дословно, не берётся второй
  раз. Путь с `$EDITOR` Unreleased не вбирает, поэтому `prepare` при непустом
  Unreleased отказывает кодом 3 и называет `changelog-draft`: на свежем старте
  до бампа, на resume без отката (гейт `release-flow`).
- Результат — черновик. Непустое тело проводит `prepare` мимо редактора, так
  что проверить глазами надо ДО `make release`, после уже некогда.

The second run is a resume, not a restart. If `check-full` went red after `prepare`
and the tag does not exist yet, `prepare` sees the version and the section already
there, does not bump, does not touch the body, and goes to waiting for the tag.
Fresh start is told from resume by whether tag `v<version>` exists, not by whether
the tree is dirty.
