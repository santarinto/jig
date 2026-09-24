#!/usr/bin/env bash
# Delivery smoke (JIG-28): сколько пакетов npm качает, ставя нас из ПАКОВАННОГО
# ТАРБОЛА — тем же путём, каким его соберёт GitHub Actions на push тега.
#
# До JIG-28 (DS-246) потребитель ставил git-зависимость на тег, который
# указывал на отдельный поставочный коммит без `devDependencies`; предмет был —
# npm качает `devDependencies` git-зависимости НЕЗАВИСИМО от того, собран ли
# пакет (184 пакета и до, и после снятия `"prepare"` на DS-244). С JIG-28
# потребитель вообще не ставит git-зависимость — только тарбол по URL, — и
# тот класс дефекта закрыт СТРУКТУРНО: у тарбола нет `devDependencies` вовсе,
# npm их не резолвит и не видит. Гейт остаётся ровно за тем, что: а) тарбол,
# собранный prepack/postpack (`dist-shipped`), действительно не содержит
# `devDependencies` НА УСТАНОВКЕ, а не только на чтении манифеста; б) пакетов
# уходит мало и на пустом кэше — 6 плюс react/react-dom/scheduler
# (`peerDependencies`, приезжают в ЛЮБОМ случае).
#
# Замер, ради которого гейт написан (09.09.2026, до JIG-28, изолированный HOME,
# пустой кэш): тег на исходном коммите git — 184 пакета, 110M; тег на
# поставочном коммите git — 6 пакетов, 25M. С JIG-28 транспорт другой (тарбол,
# не git), но предмет тот же: сколько скачивает УСТАНОВКА.
#
# Мерится КЭШ, а не `node_modules`: `node_modules` дефект прежнего класса не
# различал (7 пакетов в обоих состояниях, `devDependencies` git-зависимости npm
# качал во временный каталог подготовки, минуя `node_modules`), а привычка
# мерить кэш сохранена — вместе с ценой: изолированный `HOME` с ПУСТЫМ кэшем,
# ~25M с реестра на каждый прогон. Тёплый кэш измерял бы состояние машины.
#
# Меряется КОММИТ, не рабочее дерево: тарбол пакуется в ОТДЕЛЬНОМ клоне HEAD
# (`git clone`), тем же `npm run tarball`, каким его пакует релиз, — иначе гейт
# проверял бы похожую самоделку, а не то, что реально уедет к потребителю.
# Клон сначала ставит СВОИ devDependencies обычным `npm ci` (тёплым кэшем —
# это работа пакующей машины, не то, что здесь измеряется), потом собирает и
# пакует; ТОЛЬКО финальная установка тарбола в throwaway-приложение идёт через
# изолированный HOME с пустым кэшем.
#
# Usage: npm run smoke:delivery
set -euo pipefail

DS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CLONE="$WORK/clone"
HOME_ISO="$WORK/home"
APP="$WORK/app"
mkdir -p "$HOME_ISO" "$APP"

echo "== поставка из HEAD ($(git -C "$DS_DIR" rev-parse --short HEAD)) =="
echo "note: рабочее дерево НЕ под проверкой — только закоммиченное"
git clone -q "$DS_DIR" "$CLONE"

VERSION="$(git -C "$CLONE" show HEAD:package.json \
  | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")"

echo "== npm ci в клоне (пакующая машина, тёплый кэш) =="
(cd "$CLONE" && npm ci --no-audit --no-fund --loglevel=error)

echo "== npm run tarball (build + prepack/postpack + npm pack) =="
# Без `--silent`: он глушит и ошибку тоже, и провал приезжает пустым логом
# (тот же довод уже стоит ниже, у установки в throwaway-приложение).
(cd "$CLONE" && npm run tarball >/dev/null)
TGZ="$CLONE/santarinto-jig-$VERSION.tgz"
[ -f "$TGZ" ] || { echo "FAIL: $TGZ не создан"; exit 1; }
echo "тарбол: $(du -h "$TGZ" | cut -f1)"

cd "$APP"
npm init -y >/dev/null 2>&1
echo "== npm install с ПУСТЫМ кэшем =="
START=$(date +%s)
# Без `--silent`: он глушит и ошибку тоже, и провал приезжает пустым логом.
if ! HOME="$HOME_ISO" npm i --loglevel=error --no-audit --no-fund \
     --cache "$HOME_ISO/.npm" \
     "file:$TGZ" > "$WORK/install.log" 2>&1; then
  echo "FAIL: установка не прошла (нужна сеть — гейт мерит СКАЧАННОЕ):"
  tail -30 "$WORK/install.log"
  exit 1
fi
ELAPSED=$(( $(date +%s) - START ))

CACHE="$HOME_ISO/.npm/_cacache/index-v5"
[ -d "$CACHE" ] || { echo "FAIL: кэша нет — измерять нечего, установка шла мимо $HOME_ISO"; exit 1; }
# Имя пакета из ключа кэша: и метаданные (`.../d3-shape`), и тарбол
# (`.../d3-shape/-/d3-shape-3.2.0.tgz`) сводятся к одному имени. Скоупы
# (`@scope/name`) переживают срез, потому что режется всё от `/-/`.
mapfile -t PKGS < <(find "$CACHE" -type f -exec cat {} \; \
  | grep -o 'registry\.npmjs\.org/[^"]*' \
  | sed 's#registry\.npmjs\.org/##; s#/-/.*##' \
  | sort -u)
COUNT=${#PKGS[@]}

INSTALLED="$APP/node_modules/@santarinto/jig"
DIST_FILES=$(find "$INSTALLED/dist" -type f 2>/dev/null | wc -l)
GOT_VERSION=$(node -p "require('$INSTALLED/package.json').version")
# `--ds-version` из СОБРАННОГО токена — единственная величина в пакете, которую
# манифест не порождает. Сверка её с версией манифеста ловит протухшее
# собранное, приехавшее с свежим манифестом: тот самый класс, на котором
# споткнулся релиз 4.2.3. Без неё все три якоря ниже — про манифест, то есть про
# одно и то же.
TOKEN_VERSION=$(sed -n 's/.*--ds-version:[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$INSTALLED/dist/tokens/tokens.css" | head -1)
HAS_DEV=$(node -p "require('$INSTALLED/package.json').devDependencies ? 'yes' : 'no'")
HAS_SCRIPTS=$(node -p "require('$INSTALLED/package.json').scripts ? 'yes' : 'no'")

echo "скачано разных пакетов: $COUNT — ${PKGS[*]}"
echo "кэш: $(du -sh "$HOME_ISO/.npm" | cut -f1), установка: ${ELAPSED}s"
echo "в установленном пакете: dist $DIST_FILES файлов, версия $GOT_VERSION, --ds-version $TOKEN_VERSION, devDependencies: $HAS_DEV, scripts: $HAS_SCRIPTS"

# Якоря СНАЧАЛА: без них «пакетов мало» зелено и на установке, которой не было.
[ "$GOT_VERSION" = "$VERSION" ] || {
  echo "FAIL: установилась версия $GOT_VERSION, в репозитории $VERSION — тарбол собран не из HEAD"; exit 1; }
[ "$TOKEN_VERSION" = "$GOT_VERSION" ] || {
  echo "FAIL: манифест говорит $GOT_VERSION, собранный токен — $TOKEN_VERSION: приехало протухшее собранное"; exit 1; }
[ "$DIST_FILES" -gt 300 ] || {
  echo "FAIL: в dist приехало $DIST_FILES файлов, ожидалось > 300 — пакет приехал пустым"; exit 1; }
[ "$COUNT" -ge 1 ] || {
  echo "FAIL: с реестра не скачано НИЧЕГО — кэш измерен не тот, счёт ниже пуст"; exit 1; }

# Предмет гейта. Порог, а не точное число: `peerDependencies` тянут
# react/react-dom/scheduler, и их состав от нас не зависит.
[ "$COUNT" -le 10 ] || {
  echo "FAIL: скачано $COUNT разных пакетов, ожидалось не больше 10."
  echo "      Тарбол несёт лишнее — проверь files/prepack."
  exit 1; }
[ "$HAS_DEV" = no ] || {
  echo "FAIL: в установленном манифесте есть devDependencies — prepack не отработал"; exit 1; }
[ "$HAS_SCRIPTS" = no ] || {
  echo "FAIL: в установленном манифесте есть scripts — prepack не отработал (мёртвые ссылки на несуществующий scripts/)"; exit 1; }

echo
echo "DELIVERY OK — $COUNT пакетов с реестра, dist $DIST_FILES файлов, @santarinto/jig@$GOT_VERSION"
