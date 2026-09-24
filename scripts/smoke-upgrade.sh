#!/usr/bin/env bash
# Upgrade smoke (JIG-28): does moving from one release's tarball to the next
# actually move the installed version?
#
# До JIG-28 это проверялось командой из consumption.md — `npm install --save
# git+…#vX.Y.Z` — потому что потребитель обновлялся git-пином, и предмет был
# лок npm: для git-зависимости npm пишет `resolved` с конкретным коммитом, и на
# простом `npm install` лок побеждает новый тег в package.json — версия не
# двигается, и npm выходит нулём (замер на портале, апгрейд 1.6.1 → 1.6.2).
#
# С JIG-28 потребитель git-зависимость не ставит вовсе (см. `smoke-consumer.sh`
# и `dist-untracked`) — тег больше не указывает на поставку, поставку собирает
# и прикладывает к GitHub Release CI. Строка `npm install` в consumption.md
# переедет на новую форму в JIG-3, вместе с первым выпуском по новой схеме; до
# тех пор эта команда здесь НЕ цитируется дословно из документа (расхождение
# названо, а не спрятано). Предмет остаётся тем же классом риска — лок, а не
# сеть: обновление версии не срабатывает «само», сменой ОДНОЙ цифры в теге, а
# требует смены specifier'а (`file:`/URL с именем тарбола внутри), и именно эту
# смену тестирует гейт — тем же приёмом, что и раньше: не кодом выхода, а
# ФАКТОМ, что версия в node_modules действительно сдвинулась.
#
# Каждый тег пакуется из СВОЕГО коммита отдельным `git worktree` (детач, без
# правки основного дерева) — тем же `npm run tarball`, каким соберёт релиз CI —
# а не берётся готовым откуда-то: тегов на GitHub Release ещё может не быть
# локально доступно, а предмет — лок npm, не сеть до места публикации (та
# сеть — область `make published`).
#
# Usage: npm run smoke:upgrade
set -euo pipefail

DS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DS_DIR"

# Отбор `v*`, а не все теги подряд: релизным тегом считается только `v*` (то же
# определение в `check-published.mjs` и в `latestTag`), и любой служебный тег
# — метка ветки, что угодно — иначе оказался бы выпуском, между которым
# «обновляются».
mapfile -t TAGS < <(git tag --list 'v*' --sort=-v:refname | head -2)
if [ "${#TAGS[@]}" -lt 2 ]; then
  echo "SKIP: fewer than two tags — nothing to upgrade between"
  exit 0
fi
LATEST="${TAGS[0]}"
PREV="${TAGS[1]}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; git worktree remove --force "$WORK/wt-prev" 2>/dev/null || true; git worktree remove --force "$WORK/wt-latest" 2>/dev/null || true' EXIT

# Пакует тег в СВОЁМ worktree: build + prepack/postpack + npm pack, тем же
# путём, каким это сделает релиз/CI. Возвращает путь тарбола на stdout.
pack_tag() {
  local tag="$1" wt="$2"
  git worktree add -q --detach "$wt" "$tag" >&2
  ( cd "$wt" && npm ci --no-audit --no-fund --loglevel=error >&2 && npm run tarball >/dev/null )
  local v
  v="$(node -p "require('$wt/package.json').version")"
  echo "$wt/santarinto-jig-$v.tgz"
}

echo "== packing $PREV =="
PREV_TGZ="$(pack_tag "$PREV" "$WORK/wt-prev")"
from="$(node -p "require('$WORK/wt-prev/package.json').version")"
echo "== packing $LATEST =="
LATEST_TGZ="$(pack_tag "$LATEST" "$WORK/wt-latest")"
want="$(node -p "require('$WORK/wt-latest/package.json').version")"

echo "== upgrade $PREV ($from) → $LATEST ($want) =="

APP="$WORK/app"
mkdir -p "$APP"
cd "$APP"
npm init -y >/dev/null 2>&1

echo "== installing $PREV =="
npm i --silent "file:$PREV_TGZ" >/dev/null 2>&1
got="$(node -p "require('$APP/node_modules/@santarinto/jig/package.json').version")"
[ "$got" = "$from" ] || { echo "FAIL: expected $from from $PREV, got $got"; exit 1; }
[ -f package-lock.json ] || { echo "FAIL: no lockfile — this gate needs one to be meaningful"; exit 1; }
echo "installed $got, lockfile present"

# Смена specifier'а — не смена одной цифры в уже стоящем range: `file:` несёт
# ИМЯ тарбола с версией внутри, поэтому апгрейд — это `--save` НОВОГО пути, а
# не `npm update` по диапазону (`dependencies` пинует ровно этот файл).
echo "== upgrading by installing the NEXT tarball's specifier =="
npm install --silent --save "file:$LATEST_TGZ" >/dev/null 2>&1

got="$(node -p "require('$APP/node_modules/@santarinto/jig/package.json').version")"
if [ "$got" != "$want" ]; then
  echo "FAIL: after upgrading to $LATEST the installed version is still $got, expected $want"
  echo "      npm exits 0 on this — the specifier change did not move the version."
  exit 1
fi

echo "UPGRADE OK — $from → $got via the new tarball's specifier"
