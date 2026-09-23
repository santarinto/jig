#!/usr/bin/env bash
# Consumer smoke test: packs the DS, installs the tarball into a throwaway Vite +
# React 19 app (the portal's stack), imports real components and the stylesheet,
# and builds. Proves the published artifact is self-contained — the thing a green
# `npm test` in this repo cannot tell us.
#
# Typechecks the consumer sources against the INSTALLED package before building:
# `vite build` never looks at types, so a removed API shape used to sail through
# this smoke green (DS-89).
#
# Usage: npm run smoke            — from the packed tarball (what `npm run pack` emits)
#        npm run smoke:noscripts  — same tarball, ALSO installed once with --ignore-scripts
#
# JIG-28: there is no git mode any more. The consumer no longer pins a git tag —
# `dist/` is not committed at all (see `.gitignore`, gate `dist-untracked`) —
# GitHub Actions builds and attaches the tarball to a GitHub Release on push of
# `v*`, and a consumer installs THAT. `npm run pack` here builds the SAME way
# release does (`prepack`/`postpack` strip devDependencies/scripts — see
# `scripts/strip-manifest.mjs`, gate `dist-shipped`), so this script proves the
# tarball a real release would produce, not a lookalike.
#
# The `--ignore-scripts` differentiator moved here from the old git mode, same
# reasoning: a package that still needed building on the consumer's machine
# would arrive EMPTY under `--ignore-scripts`, and a plain install cannot tell
# the two apart — it is green either way, just slower. DS-244's cost is
# the reason it is checked at all: before 09.09.2026, `"prepare": "npm run
# build"` killed one consumer's own `timeout 600` at second 600, three
# pipelines out of four.
set -euo pipefail

MODE="${1:-tarball}"
DS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$DS_DIR/package.json').version")"
TGZ="$DS_DIR/santarinto-jig-$VERSION.tgz"
DEP_SPEC="file:$TGZ"

echo "== packing @santarinto/jig@$VERSION =="
(cd "$DS_DIR" && npm run --silent pack >/dev/null)
[ -f "$TGZ" ] || { echo "FAIL: $TGZ not produced"; exit 1; }
echo "tarball: $(du -h "$TGZ" | cut -f1)"

# `smoke:noscripts` ONLY: тот же тарбол под ВЫКЛЮЧЕННЫМИ lifecycle-скриптами.
# Пакету, которому нужна сборка, `--ignore-scripts` не даёт её сделать, и он
# приезжает без dist — то есть шаг различает «поставляем собранное» и
# «собираем у потребителя». Обычная установка зелена в обоих случаях.
if [ "$MODE" = noscripts ]; then
  NOSCRIPTS="$(mktemp -d)"
  # Снос связан с заведением одним именем и одним trap'ом (гейт tmp-hygiene):
  # ручной `rm` в каждой ветке рвётся молча на первом же `exit` не оттуда.
  trap 'rm -rf "$NOSCRIPTS"' EXIT
  cat > "$NOSCRIPTS/package.json" <<JSON
{ "name":"ds-noscripts","private":true,"version":"0.0.0","type":"module",
  "dependencies":{ "@santarinto/jig":"$DEP_SPEC" } }
JSON
  echo "== install with --ignore-scripts (сборка у потребителя запрещена) =="
  (cd "$NOSCRIPTS" && npm install --ignore-scripts --no-audit --no-fund --loglevel=error)
  for ENTRY in dist/src/index.js dist/src/index.d.ts dist/src/styles.css dist/tokens/tokens.css; do
    [ -f "$NOSCRIPTS/node_modules/@santarinto/jig/$ENTRY" ] || {
      echo "FAIL: $ENTRY нет при --ignore-scripts — пакет требует сборки у потребителя"
      exit 1
    }
  done
  # Якорь: без него четыре -f выше зелены и на пустом каталоге, если пути
  # разъедутся. Считаем то, что реально приехало.
  FILES="$(find "$NOSCRIPTS/node_modules/@santarinto/jig/dist" -type f | wc -l)"
  [ "$FILES" -gt 300 ] || { echo "FAIL: в dist приехало $FILES файлов, ожидалось > 300"; exit 1; }
  echo "ok: пакет приехал собранным без единого lifecycle-скрипта ($FILES файлов dist)"
fi

APP="$(mktemp -d)"
# Перекрывает trap выше, поэтому называет ОБА каталога: EXIT-trap в bash один,
# и «забыл дописать» здесь означало бы утечку $NOSCRIPTS без единого признака.
trap 'rm -rf "$APP" "${NOSCRIPTS:-}"' EXIT
echo "== consumer app in $APP =="

cat > "$APP/package.json" <<JSON
{
  "name": "ds-consumer-smoke",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "build": "vite build" },
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@santarinto/jig": "$DEP_SPEC"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.0"
  }
}
JSON

cat > "$APP/vite.config.ts" <<'TS'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
TS

# Тайпчек потребителя — отдельный предмет от сборки: vite build транспилирует
# esbuild'ом и типов не смотрит вовсе, поэтому удалённая форма API проезжала
# через смоук зелёной (DS-89). `types: vite/client` нужен ради импортов
# css: без него `@santarinto/jig/styles.css` не резолвится и тайпчек падает не о том.
cat > "$APP/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
JSON

cat > "$APP/index.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><title>smoke</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
HTML

mkdir -p "$APP/src"
# Imports exercise every export subpath a consumer needs: the barrel, the
# stylesheet, and the font css.
cat > "$APP/src/main.tsx" <<'TSX'
import { createRoot } from 'react-dom/client'
import {
  Button, TextField, DataTable, Badge,
  initTheme, setTheme, ThemeToggle,
} from '@santarinto/jig'
import '@santarinto/jig/styles.css'
import '@santarinto/jig/fonts/inter.css'

initTheme()

type Row = { id: string; name: string; sum: number }
const rows: Row[] = [{ id: '1', name: 'ООО «Ромашка»', sum: 1200 }]

function App() {
  return (
    <div>
      <Button variant="primary" size="sm" onClick={() => setTheme('dark')}>
        Тёмная тема
      </Button>
      <ThemeToggle />
      <TextField label="Контрагент" defaultValue="ООО «Ромашка»" />
      <Badge tone="warning">Не проведён</Badge>
      <DataTable<Row>
        columns={[
          { key: 'name', header: 'Контрагент' },
          { key: 'sum', header: 'Сумма', align: 'end', numeric: true },
        ]}
        rows={rows}
        getRowId={(r) => r.id}
      />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
TSX

cd "$APP"
echo "== npm install =="
npm install --no-audit --no-fund --loglevel=error

echo "== single React check =="
COPIES="$(find node_modules -path '*node_modules/react/package.json' -not -path '*/node_modules/*/node_modules/*' | wc -l)"
echo "react copies in node_modules: $COPIES"
[ "$COPIES" -eq 1 ] || { echo "FAIL: expected exactly 1 copy of react (peerDependencies regression)"; exit 1; }
echo "react version: $(node -p "require('$APP/node_modules/react/package.json').version")"

# Тайпчек ПРОТИВ УСТАНОВЛЕННОГО ПАКЕТА: типы приезжают из
# node_modules/@santarinto/jig/dist, то есть проверяется и упаковка `.d.ts` в тарбол,
# а не только исходник рабочего дерева.
#
# `--listFiles` тут не для красоты: без него зелёный tsc не отличить от tsc,
# который не увидел ни одного файла приложения (пустой include выходит нулём) и
# от tsc, читающего пакет как нетипизированный. Обход утверждается двумя
# якорями — файлом приложения и `.d.ts` пакета.
echo "== typecheck (consumer sources against the installed package) =="
if ! npx --no-install tsc --noEmit --listFiles > "$APP/tsc.out" 2>&1; then
  grep -vE '\.d\.ts$' "$APP/tsc.out" | head -40
  echo "FAIL: тайпчек потребителя не прошёл — форма публичного API не доехала"
  exit 1
fi

grep -qx "$APP/src/main.tsx" "$APP/tsc.out" || {
  echo "FAIL: тайпчек не читал src/main.tsx — проверен пустой охват, а не потребитель"
  exit 1
}
DTS="$(grep -c "/node_modules/@santarinto/jig/dist/.*\.d\.ts$" "$APP/tsc.out" || true)"
[ "$DTS" -gt 0 ] || {
  echo "FAIL: ни одного .d.ts из @santarinto/jig — пакет прочитан как нетипизированный"
  exit 1
}
echo "ok: типы пакета читались ($DTS файлов .d.ts), исходники потребителя в охвате"

echo "== vite build =="
npm run build

echo
echo "SMOKE OK ($MODE) — consumer built against @santarinto/jig@$(node -p "require('$APP/node_modules/@santarinto/jig/package.json').version")"
