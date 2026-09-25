# jig — build, checks, release.
#
# Publishes nothing and pushes nothing: the package never goes to a registry, and
# `git push` is a separate target you type by hand.

.PHONY: help test test-tz guards typecheck build dist-version dist-untracked dist-checks smoke smoke-noscripts smoke-ssr smoke-upgrade smoke-delivery measure memory states dock-floor matrix wb-smoke check-src check check-full demo stat release bump changelog-draft push published clean wb-install wb-status wb-restart wb-logs wb-uninstall

help:
	@echo 'test       — vitest на React 19'
	@echo 'test-tz    — модель календаря под TZ с переходом на летнее время: ловит миллисекундную арифметику'
	@echo 'guards     — только guard-и (src/__guards__): быстрый прогон правил системы'
	@echo 'typecheck  — tsc --noEmit'
	@echo 'build      — dist/ (типы, CSS, шрифты, токены)'
	@echo 'dist-version — --ds-version доехал до собранного пакета: шаг ПОСЛЕ build, не guard'
	@echo 'dist-untracked — dist/ НЕ под контролем git (JIG-28: поставку собирает CI, не мы): шаг ПОСЛЕ build, не guard'
	@echo 'dist-checks — собранные dist/theme-auto.css и dist/styles.bundle.css не разошлись с источником: шаг ПОСЛЕ build, не guard (JIG-3)'
	@echo 'smoke      — тарболом в одноразовое Vite-приложение: одна копия React, сборка'
	@echo 'smoke-noscripts — та же установка тарболом, но с --ignore-scripts: пакет приезжает собранным без единого lifecycle-скрипта'
	@echo 'measure    — инварианты видимого результата в браузере (плотность, каскад, вместимость)'
	@echo 'memory     — память вкладки на сетке верстака: возвращается ли она после выхода (вне check)'
	@echo 'states     — кейсы, чей смысл в состоянии: объявленное в shows показано в настоящем кадре'
	@echo 'dock-floor — пол дока у ХУДШЕГО компонента каталога; справка «≠ кейс» не отнимает место у поля и чипов'
	@echo 'matrix     — матрица по всем случаям всех фикстур на полу 440: переполнение вбок, ширина поля, цель клика (в check-full); короткий вывод по умолчанию, полный — npm run matrix -- --all; одна строка — npm run matrix -- --row <ключ>'
	@echo 'wb-smoke   — верстак целиком в браузере: швы протокола, которых jsdom не видит'
	@echo 'smoke-ssr  — рендер в строку в голом Node: потребление без сборщика'
	@echo 'smoke-upgrade — команда обновления: переустановка тарболом между двумя последними тегами'
	@echo 'smoke-delivery — сколько пакетов качает npm на пустом кэше, ставя нас из ПАКОВАННОГО тарбола'
	@echo 'check      — исходник: guards, test, test-tz, typecheck, build, dist-version, dist-untracked, dist-checks, measure, states, dock-floor, shell-rhythm; последней строкой — длительность и нагрузка на старте'
	@echo 'check-full — check + matrix + smoke + smoke-noscripts + smoke-ssr + smoke-upgrade + smoke-delivery + wb-smoke; его гоняет release'
	@echo 'demo       — галерея компонентов (http://localhost:5273)'
	@echo 'wb-install — поставить постоянный верстак службой (http://localhost:5274)'
	@echo 'wb-status  — жива ли служба, отвечает ли, не переехала ли нода'
	@echo 'wb-restart — перезапустить службу; wb-logs — её журнал'
	@echo 'stat       — размер проекта одним JSON: коммиты, файлы, строки'
	@echo 'release    — уровень по каталогу компонентов, бамп + CHANGELOG ($$EDITOR) + проверки + коммит + тег'
	@echo 'bump       — бамп + scaffold CHANGELOG без коммита/редактора: make bump [level=major|minor|patch|version=X.Y.Z]'
	@echo '             БЕЗ $$EDITOR релиз идёт тремя шагами: make bump → вписать тело раздела'
	@echo '             в CHANGELOG.md руками → make release (пойдёт по resume, редактор не нужен)'
	@echo 'changelog-draft — после bump: тело раздела из артефактов задач (DS_DOCS_PATH=<корень с tasks/>), черновик'
	@echo 'push       — отправить main и теги в origin + сверить, что тег доехал'
	@echo 'published  — тег и GitHub Release ассет на месте, содержимое сверено (по consumption.md)'

test:
	npm run test

# Второй прогон модели календаря под зоной С ПЕРЕХОДОМ на летнее время.
# Проверяет ОДИН класс правок: миллисекундную арифметику вместо календарной.
# `+86400000` в 25-часовые сутки не доводит до следующего дня, и под TZ=UTC это
# не видно вовсе — основной прогон остаётся зелёным (проверено мутацией на
# DS-29). Секунда с небольшим: те же файлы, без рендера.
test-tz:
	npm run test:tz

# Guards only — the system's rules, kept in src/__guards__. First in `check` so a
# cheap rule fails before the expensive steps. `test` runs the same files, so
# coverage does not depend on this step: it exists to fail early.
guards:
	npm run guards

typecheck:
	npm run typecheck

build:
	npm run build

# `--ds-version` в собранном пакете. Отдельный шаг, а не guard, потому что
# утверждение проверяемо только ПОСЛЕ сборки (DS-238). В guards оно было
# ложно-красным ровно на релизе: `prepare` бампит пять версионных файлов, а
# `dist/` до `build` остаётся от прошлой версии, и гейт сообщал «версия не
# доехала» там, где она не доехала ЕЩЁ. Порядок держит `dist-freshness`.
dist-version:
	@node scripts/check-dist-version.mjs

# dist/ больше НЕ едет через git (JIG-28): потребитель ставит тарбол, который
# на push тега собирает и прикладывает к GitHub Release сам GitHub Actions.
# Утверждение простое и грубое: `git ls-files -- dist` пуст. Шаг стоит ПОСЛЕ
# build по той же причине, что и dist-version, — исторически рядом с ним стоит
# вся группа проверок "dist/", хотя от самой сборки это утверждение не зависит.
dist-untracked:
	@node scripts/check-dist-untracked.mjs

# `src/__guards__/dist-bundles.test.ts`, читающий dist/theme-auto.css и
# dist/styles.bundle.css. Раньше он шёл вместе с `guards`/`test`, которые в
# check-src стоят ДО `build` — на свежем клоне, где dist/ не в git (JIG-28),
# это красный ENOENT задолго до того, как что-то собрано (JIG-3). Утверждение
# — что СОБРАННОЕ не разошлось с источником — проверяемо только после build,
# тем же доводом, что у dist-version и dist-untracked, рядом с которыми шаг и
# стоит. `vitest.config.ts` файл исключает, гоняет только
# `vitest.dist.config.ts`.
dist-checks:
	npm run dist-checks

smoke:
	npm run smoke

# Та же установка тарболом, но при ВЫКЛЮЧЕННЫХ lifecycle-скриптах
# (`--ignore-scripts`). Пакету, которому нужна сборка на машине потребителя,
# это не даёт её сделать, и он приезжает без dist — то есть шаг различает
# «поставляем собранное» и «собираем у потребителя», чего обычная установка не
# делает: она зелена в обоих случаях. Довод и цена — DS-244, тот же, каким
# раньше был обоснован git-пин: до 09.09.2026 `"prepare": "npm run build"` у
# одного из потребителей упирался в его же `timeout 600` и валил пайплайн.
smoke-noscripts:
	npm run smoke:noscripts

# Invariants of the visible result in a real browser. jsdom has neither layout nor
# cascade, so defects like "a modifier attached to nothing" miss `npm test`
# entirely. Needs chromium: npx playwright install chromium.
measure:
	npm run measure

# Tab memory on the workbench grid. Deliberately NOT in `check`:
# `performance.memory` is quantised and depends on when the collector feels like
# working, so a threshold on that number would redden every other run and teach
# people to re-run the check. It answers a question nothing else asks: does memory
# come back after leaving the grid — that is, does frame cleanup work.
memory:
	npm run measure:memory

# A case whose whole subject is STATE — an open list, a visible popover — checked in
# the real frame (DS-134). `fixtures-render` asserts "did not throw" and is
# equally green on an expanded list and on a collapsed one, so before this gate such
# a case had no automatic check at all. In `check`, not in `check-full`: the popup
# wave writes these cases by the dozen, and a defect that only shows up at release
# time is the defect this gate exists to prevent. Needs chromium, like `measure`.
states:
	npm run states

# Пол дока — максимум по каталогу, и утверждение это держится только обходом
# каталога (DS-141). Число за `DOCK_MIN_H` снимали дважды и дважды с
# одного компонента, и оба раза оно резало первую крутилку у Badge и Button:
# их переключатель переносится на второй ряд чипов. Санитар в
# `dock-height.test.ts` этого не ловит — он сверяет константу со слагаемыми, а
# новый компонент с широким переключателем не меняет ни одного слагаемого.
# В `check`, а не в `check-full`: компонент добавляют посреди работы, и пол,
# совравший до релиза, врёт всё это время. Нужен chromium, как `measure`.
dock-floor:
	npm run dock-floor

# Ритм тулбара оболочки: группы разделены расстоянием, а не чертой. Утверждение
# — ОТНОШЕНИЕ зазоров, не число: масштаб интерфейса умножает оба разом. В jsdom
# непроверяемо вовсе — там нет раскладки.
shell-rhythm:
	npm run shell-rhythm

# Матрица общих приёмочных свойств (DS-177): один обход всех случаев всех
# фикстур на полу 440 (WIDTH_FLOOR), каждая ячейка грузится один раз и отвечает всем строкам.
# Строки — переполнение вбок (шкалы 0.875, 1, 1.5); ширина поля ввода: не уже
# своего образцового значения плюс знак на каретку (0.875, 1, 1.15, 1.5); цель
# клика: не мельче 24×24 и попадаема по четырём углам (те же четыре шкалы).
# Оси у обхода две, и ключа `--row` у них нет: они удваивают ЯЧЕЙКИ, а не
# вопросы к ним. «Касание» (hasTouch) догружает компоненты с веткой @media по
# указателю, «ширина» — компоненты с @container по ширине на вьюпорте 440.
# Кадр меряется как есть, с паддингом хоста 30 px. В `check-full`, а не в `check`
# — решение владельца 16.09.2026 по цене. Цена этого места названа: дефект,
# внесённый посреди работы, всплывает к релизу, а не к правке, — поэтому `check`
# печатает матрицу в «НЕ проверено». Нужен chromium, свой порт 5280 (у точки
# входа `scripts/case-matrix.mjs`; строки — модули без своего сервера).
matrix:
	npm run matrix

# The workbench whole, in a browser, on its own dev server. Checks the protocol
# SEAMS — `size`, `force-stats`, `tabstops`, `aim`, patch downwards — which jsdom
# does not really see. Filed as DS-68: "Фактический размер" showed a dash for
# half a year while BOTH halves of the mechanism had green unit tests. The seam
# between them was what did not work.
wb-smoke:
	npm run smoke:wb

# Обновление между двумя последними тегами (JIG-28: тарболом, а не git-пином —
# `dist/` под тегом больше нет, ставить git-зависимостью нечего). Собирает
# `santarinto-jig-X.Y.Z.tgz` на каждом из двух тегов тем же путём, каким его
# соберёт CI (`npm run tarball`), устанавливает первый, затем меняет specifier на
# второй — так это и будет выглядеть у потребителя после JIG-3 (переустановка
# по новому URL/версии, а не диапазон).
smoke-upgrade:
	npm run smoke:upgrade

# Сколько РАЗНЫХ пакетов качает npm с пустым кэшем, ставя нас ИЗ ПАКОВАННОГО
# ТАРБОЛА (JIG-28) — тем же способом, каким пакует релиз GitHub Actions
# (`npm run tarball`, prepack/postpack режут devDependencies/scripts). Предмет
# сохранён с DS-246: `node_modules` дефект не различает (7 пакетов в
# обоих состояниях, devDependencies качаются во временный каталог подготовки и
# до node_modules не доходят), поэтому мерится КЭШ на изолированном HOME.
smoke-delivery:
	npm run smoke:delivery

# Consumption WITHOUT a bundler: render to string in bare Node. The three targets
# above install into a Vite app, i.e. they check the path where a bundler EXISTS.
# The consumer building HTML on a server was checked by nobody.
smoke-ssr:
	npm run smoke:ssr

# Two checks, not one, and the cut between them is by SUBJECT, not by speed:
# `check` answers "is the source correct", `check-full` — "does it reach the
# consumer". The second set is npm install into throwaway apps; it checks packaging
# and installation rather than code, and so is not needed on every edit.
#
# No timings are written here on purpose. They were, and they went stale by a
# factor of four while reading as current — a number in a comment is a measurement
# nobody re-takes. Measure when you need one; the cut above does not depend on it.
#
# The danger of the cut is said out loud: `check` is a check with a KNOWN blind
# spot, and that is exactly how the preview defect escaped (the gate was right, it
# just did not look there). Hence the target PRINTS what it did not check, and
# `release` runs `check-full`, not `check` — a tag cannot ship on the short one.
check-src: guards test test-tz typecheck build dist-version dist-untracked dist-checks measure states dock-floor shell-rhythm

# The run prints its own cost on its LAST line (DS-342). A duration pinned
# in CLAUDE.md went stale silently and needed an idle machine to re-measure —
# three attempts in a row were taken under load and could not be compared. The
# printed number is always fresh, and the load beside it says what it is worth.
#
# `:=` is evaluated when make parses this file, i.e. BEFORE any prerequisite
# runs: a recipe-time stamp would start after check-src had already finished.
# The load is the one AT THE START on purpose — the background the run landed
# on. Read at the end, the 1-minute average is mostly the check's own vitest and
# chromium, and says nothing about the machine.
RUN_T0 := $(shell date +%s)
RUN_LA := $(shell cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)
RUN_CPUS := $(shell nproc 2>/dev/null)
RUN_COST = $$(( $$(date +%s) - $(RUN_T0) )) s, фон на старте LA $(or $(RUN_LA),?) на $(or $(RUN_CPUS),?) ядрах

check: check-src
	@echo 'НЕ проверено: матрица по всем случаям на полу 440 — переполнение вбок, ширина поля ввода и цель клика (make matrix), установка тарболом и с --ignore-scripts, SSR без сборщика, команда обновления, поставка (сколько качает npm).'
	@echo 'НЕ проверено (и check-full тоже): доехали ли теги до remote, откуда ставят, — make published.'
	@echo 'Перед тегом — make check-full (его же гоняет release).'
	@echo "CHECK OK — исходник: guards, test, test-tz, typecheck, build, dist-version, dist-untracked, dist-checks, measure, states, dock-floor, shell-rhythm. $(RUN_COST)."

check-full: check-src matrix smoke smoke-noscripts smoke-ssr smoke-upgrade smoke-delivery wb-smoke
	@echo "CHECK FULL OK — $(RUN_COST)."

demo:
	npm run demo

# Постоянный верстак: systemd --user, тот же 5274, ЭТО рабочее дерево вместе с
# незакоммиченным (DS-123). Отдельного worktree и сборки нет: голый
# http-сервер не отдал бы .tsx, а сборка убила бы работу с незакоммиченным.
# Минимальный сервер здесь — сам vite.
#
# `wb-install` идемпотентен: он же и чинит unit после переезда ноды (nvm) или
# репозитория. `wb-status` эти два расхождения ищет специально — оба выглядят
# как «служба сломалась», а не как то, чем являются.
wb-install:
	@node scripts/wb-service.mjs install

wb-status:
	@node scripts/wb-service.mjs status

wb-restart:
	systemctl --user restart ds-workbench.service
	@node scripts/wb-service.mjs status

wb-logs:
	journalctl --user -u ds-workbench.service -n 200 --no-pager

wb-uninstall:
	@node scripts/wb-service.mjs uninstall

# Project size as one JSON. Counted over what git tracks: dist, node_modules and
# ds-bundle are build output and dependencies, not the project.
stat:
	@npm run --silent stat

# First step is not the bump but a check that the PREVIOUS release reached the
# consumer: the tag does not exist yet, so local tags are compared — exactly what
# should already be on the other side. Catches a lag at the earliest honest
# moment, before another unreleased version lands on top. On resume (after a red
# check-full) the claim is unchanged: the set of local tags does not depend on the
# bump.
release:
	@node scripts/check-published.mjs --before-release
	@node scripts/release.mjs prepare
	@$(MAKE) check-full
	@node scripts/release.mjs commit
	@echo 'RELEASE — готово. Отправить: make push'

# Bump + CHANGELOG scaffold without a commit and without $EDITOR — split out of
# `prepare` so a release can be prepared non-interactively. Since DS-146
# `prepare` with no `$EDITOR` no longer pretends the editor exited 1 and no
# longer rolls the bump back: it refuses and prints these same three steps, so
# the tree it leaves behind IS the state this target produces. Level is auto
# from the COMPONENT
# CATALOGUE (not from commit messages — see release.mjs), or explicit:
#   make bump                # auto (like prepare) — needs a previous v* tag
#   make bump level=minor    # explicit minor/major/patch — overrides auto,
#                            # needs a previous v* tag too
#   make bump version=1.0.0  # explicit version of the FIRST release (JIG-3):
#                            # refused unless there is no v* tag at all —
#                            # nothing to count a level FROM, so the version
#                            # is the owner's call, not a jump over the
#                            # catalogue count on an ordinary release
# Then fill in the CHANGELOG section body and call `make release`: on resume
# `prepare` skips the editor (body is not empty) and goes to check-full + commit.
bump:
	@node scripts/release.mjs bump $(if $(version),$(version),$(level))

# Draft of the release section body, assembled from task artefacts
# (DS-257): `$DS_DOCS_PATH/tasks/<CODE>/<CODE>.md`, codes taken from the
# subjects of commits since the SOURCE commit of the previous release. Runs after
# `bump` (the section must exist) and before `release`: a non-empty body sends
# `prepare` past the editor, so bump → changelog-draft → read and edit → release
# is the regular way to release without $EDITOR. `## [Unreleased]` is folded into
# the section, not left behind below it. The root is never guessed.
changelog-draft:
	@node scripts/release.mjs draft

# Publishing is one remote, `origin` — the same repo GitHub Actions builds the
# release asset from (JIG-3: the second, private mirror this used to push to
# alongside `origin` is gone). `git push` exits zero when it pushed and nobody
# built anything from it yet, so the target verifies the tag arrived right after.
#
# Ветка одна — `main` (JIG-28: ветки `delivery` больше нет, тег выпуска снова
# лежит на исходном коммите main, и `--follow-tags` отправляет его вместе с
# ней без отдельного перечисления).
#
# `check-public-root` идёт ПЕРВЫМ шагом обеих целей и всего, что они зовут:
# `santarinto/jig` начинается пустым и открывается публично после первого
# выпуска, и коммит старой истории, хоть раз оказавшись на GitHub, остаётся
# доступен по SHA даже после force-push — отказ должен случиться ДО пуша, а
# не после.
#
# `--tags-only` здесь, а не полная проверка: CI собирает ассет релиза уже
# ПОСЛЕ того, как тег доехал, и гоняться за ним сразу после `git push` значило
# бы либо ждать вслепую, либо получать красное на ассете, которого ещё
# физически не может быть. Ассет с содержимым сверяет отдельно `make
# published`, когда решаешь, что CI уже отработал.
push:
	@node scripts/check-public-root.mjs
	@git push origin main --follow-tags
	@node scripts/check-published.mjs --tags-only

# Сетевая половина install-канала: тег доехал до `origin`, у него есть GitHub
# Release с ассетом `santarinto-jig-X.Y.Z.tgz`, и содержимое этого ассета
# (список файлов и их содержимое, не байты тарбола — mtime внутри архива
# расходится между сборками одного и того же дерева) совпадает с тем, что тот
# же тег пакует здесь `npm run tarball`. Единственная цель, что трогает сеть —
# не входит ни в `check`, ни в `check-full`.
published:
	@node scripts/check-public-root.mjs
	@node scripts/check-published.mjs

clean:
	rm -rf dist *.tgz
