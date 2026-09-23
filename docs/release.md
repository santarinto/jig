# Выпуск: почему он устроен так

Указатель на этот файл — в CLAUDE.md, раздел Release. Там правила и порядок
шагов; здесь — цена, которой каждое из них куплено. Открывать, когда правило
хочется обойти или отменить, а не перед обычным выпуском.

Почти каждый пункт ниже — выпуск, который сломался по-настоящему.

## Почему тег СНОВА указывает на исходники, а не на поставочный коммит (JIG-28)

Было DS-246: npm, ставя git-зависимость, качает её `devDependencies`
НЕЗАВИСИМО от того, есть ли скрипт подготовки — 184 разных пакета с реестра и
до снятия `prepare` (DS-244), и после; `.npmrc` в корне пакета не
действует, npm читает `.npmrc` потребителя. Единственное, на что npm
смотрит, — полученный манифест, а значит тег обязан указывать на коммит, где
`devDependencies` нет. Замер 09.09.2026 на пустом кэше: 6 пакетов вместо 184,
25M вместо 110M, при том же `dist` файл в файл.

Цена этого решения была названа сразу и держалась полгода: отдельная ветка
`delivery`, трейлер `Source-commit:`, `sourceOf` в каждом месте, что считает
историю (`detectBumpLevel`, `latestTag`, `taskCodes`), мутационный гейт над
формой поставочного дерева (`delivery-commit`, снят), и `git show vX.Y.Z`,
переставший показывать исходники.

JIG-28 меняет транспорт целиком: потребитель вообще не ставит git-зависимость.
GitHub Actions на push тега сам собирает `dist/`, пакует его через `npm pack`
(`prepack`/`postpack` чистят манифест — `scripts/strip-manifest.mjs`, гейт
`dist-shipped`) и прикладывает тарбол к GitHub Release. Раз git-коммит под
тегом больше не устанавливается НИКЕМ, держать ради него вторую ветку —
цена без довода: тег снова смотрит на исходный коммит выпуска, `sourceOf` и
всё, что вокруг него стояло, — сняты. `detectBumpLevel`/`latestTag` считают
от тега напрямую, потому что он снова прямой предок HEAD.

## Почему у каждого пункта CHANGELOG команда поиска: 3.0.1

In 3.0.1 two breaking changes shipped side by side: one cost a consumer twelve
edits, the other zero. From the `Breaking` section the two are indistinguishable —
both read as "this throws now" — so the only way to learn which is which was to
re-read his own code. The description says WHAT changed; only the command says
WHERE it lands, and cheaply enough to be run instead of guessed.

## Почему команда прогоняется на многострочном вызове: 4.0.1

Правило — «команда ПРОГОНЯЕТСЯ на многострочном вызове до того, как попадёт в
CHANGELOG, и обязана различать два состояния». Вот чем оно куплено.

4.0.1 shipped `grep … | grep -v "label="` for
"a field with no `label` prop is now nameless": it measures a LINE, consumer JSX
is multi-line, `label=` sits on the next line — so every labelled field was
reported as nameless. The consumer got 45 hits where 7 were real, a six-fold
overcount, with no regression of his at all. An item with a command like that is
WORSE than an item with none: he either drowns in the output or stops believing
the item, and both look like work was done.

«Стало печатать меньше» ничего не доказывает — меньше печатает и команда,
сломанная в другую сторону. Первая замена молча резала тег пополам на `onChange={() => …}` (стрелка содержит `>`,
а `[^<>]` его исключает) и по числу попаданий выглядела правдоподобно.

## Почему путь потребителя не зашивается и рядом стоит якорь: DS-166

Я просил потребителя прогнать `grep -rn "flattenTree" src/`,
а `src/` у него — PHP, фронт живёт в `frontend/src/`: команда буквально дала бы
0, и это ноль «искал не там», неотличимый от «не используется». Он прогнал по
верному пути и сам приложил знаменатель: `flattenTree` — 0 файлов, `DataTable`
— 33. Без знаменателя ноль не свидетельство ни о чём.

## Почему правило шире, чем `Breaking`: 3.0.3

The rule was scoped to `Breaking` when it was written and 3.0.3 widened it on its
first exercise, because the silent kind needs the address MORE, not less. A break
announces itself at the consumer's compiler; a font-size that changed announces
nothing at all, and the command in the item is the only thing standing between
him and re-reading his own code. Scoping the rule to `Breaking` would have put
the address in the one place where something else already gives it.

## Почему уровень считает каталог, а не сообщения коммитов

It read conventional commits until 3.0.2 and was not merely imprecise — it
answered a different question, about compatibility. Over two releases in a row it
walked the version to 4.0.0, which had to be unwound by hand.

## Как список из шести файлов рос, и что каждый раз ломалось

CHANGELOG-заголовок вошёл в гейт только на DS-302; до этого CLAUDE.md
утверждал пять, а гейт держал четыре.

`tokens/tokens.css` became the fifth on DS-215, and the count here stayed
at four for three releases after it. `--ds-version` is the only way to read the
version FROM the consumer's page; it would have lied from its first release on had
it not bumped with the rest, and a lying marker is worse than an absent one,
because it is believed. `release.mjs` carries it in `DOC_SITES` (`package.json`,
the `CHANGELOG.md` heading and the lock are handled separately) — so the
authoritative count is `DOC_SITES.length + 3`.

The lock joined on DS-318, after it had held 3.0.6 through fourteen
releases to 4.2.5. The reason is NOT `npm ci`: measured on a clean clone (npm
11.13.0), `npm ci` passes on a lock whose root `version` or root ranges differ
from the manifest — it checks the resolved TREE against the manifest and fails
(`EUSAGE … are in sync`) only when the tree no longer satisfies it. The reason is
a lying record that the first unrelated `npm install` rewrites into someone
else's diff. `bump` edits the two root `version` fields by parsing JSON, not by
`npm install --package-lock-only`, which would go to the registry and could
re-resolve the tree inside a release commit. Root RANGES are a different cause
(package.json edited without `npm install`) and a different gate,
`lockfile-deps`; `bump` never touches them.

## Почему `prepare` больше НЕ собирает и не стейджит `dist/`: снято на JIG-28

Было 4.2.3, чинилось трижды (`commit` carries dist, `dirtyNonVersion` stops
calling it foreign, `prepare` builds and stages it) и ломалось every time —
каждая правка была downstream места, где расхождение появляется: `dist/` в
git, значит после бампа `--ds-version` в `tokens/tokens.css` собранная копия
устаревала, а `check-full` пересобирал её уже ПОСЛЕ `prepare`. С JIG-28 предмет
снят целиком, а не починен в четвёртый раз: `dist/` не едет в релизный коммит
и не проверяется против индекса вовсе (гейт `dist-untracked` требует
ПРОТИВОПОЛОЖНОГО — чтобы `dist/` там не было), собирает его GitHub Actions
после push тега, независимо от того, что делал `release.mjs`.

## Почему без `$EDITOR` бамп не откатывается: DS-146

один в один. До этой задачи путь существовал (`bumpFromArgs`), но был назван
только в докблоке исходника, а сообщение об отказе врало — «редактор вышел с
кодом 1» при том, что редактор не запускался. Теперь `$EDITOR не задан` и
`редактор вышел с кодом N` — два разных отказа с разной починкой. Держат это
три случая гейта `release-flow`, и мутация «слить их обратно в один код
возврата» роняет все три.

## Почему шесть файлов после бампа не коммитят: 3.0.6

`git add -A` между бампом и тегом сметает их в чужой коммит. Дерево при этом
зелёное, `check-full` проходит, и выпуск падает на последнем шаге с `nothing to
commit, working tree clean`. Починка — в CLAUDE.md, тем же абзацем.

