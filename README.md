# jig Design System

React + TypeScript design system for dense business screens.
Light + dark themes. Import components from `src/index.ts`; styles from `src/styles.css`.
Publish to Claude Design with `/design-sync`.

## Theme

Use the public API — do not set `data-theme` by hand unless you have a reason to:

```ts
import { initTheme, setTheme, getTheme, useTheme, ThemeToggle } from '@santarinto/jig'

// Call once at app boot (before paint if possible) to apply stored choice
// or prefers-color-scheme when localStorage is empty:
initTheme()

setTheme('dark')
getTheme() // 'light' | 'dark'

function Header() {
  const [theme, set] = useTheme()
  return <ThemeToggle /> // or set(theme === 'dark' ? 'light' : 'dark')
}
```

`setTheme` writes `localStorage` (`ds-theme`) and sets/removes `data-theme="dark"` on
`document.documentElement`. The module is SSR-safe: no DOM access at import time.

## Дев-серверы: четыре порта и одна служба

| порт | что | как поднимается |
| --- | --- | --- |
| 5273 | демо-галерея | `npm run demo`, руками |
| 5274 | **верстак компонентов** | **служба `ds-workbench`, поднят всегда** |
| 5275 | `wb-smoke` | сам, на время прогона |
| 5276 | `measure:memory` | сам, на время прогона |

Верстак на 5274 — постоянный: `systemd --user`, из ЭТОГО рабочего дерева, вместе
с незакоммиченным. Открывается закладкой <http://localhost:5274/>, отдельный
компонент — <http://localhost:5274/frame.html?c=DataTable&case=dense> (кадр там
самостоятельный документ верхнего уровня, и для chrome-расширения это важно:
через границу iframe оно работает иначе).

```
make wb-install    поставить или починить службу (идемпотентно)
make wb-status     жива, отвечает, не переехала ли нода
make wb-restart    перезапустить
make wb-logs       журнал
```

`npm run wb` руками теперь ПАДАЕТ с `Port 5274 is already in use`, и это
правильный ответ: верстак уже работает, открой вкладку. Все конфиги несут
`strictPort` — иначе vite молча уехал бы на соседний порт, показав не тот сервер,
который открыт в закладке, и заодно отобрав 5275 у `wb-smoke`. Держит гейт
`src/__guards__/dev-server-ports.test.ts`.

Нода стоит под nvm, а `systemd --user` её в PATH не имеет, поэтому unit несёт свой
`Environment=PATH=` — то есть пин на версию. После `nvm install` служба при
следующем рестарте умрёт с `status=203/EXEC`, что читается как «сломалась», а не
«нода переехала». Это ловит `make wb-status`; чинит `make wb-install`.

## License

MIT — see [LICENSE](LICENSE).

The fonts in `fonts/` (shipped as `dist/fonts/`) are not covered by MIT: Inter and
JetBrains Mono are distributed under the SIL Open Font License 1.1, see
[fonts/OFL-Inter.txt](fonts/OFL-Inter.txt) and
[fonts/OFL-JetBrainsMono.txt](fonts/OFL-JetBrainsMono.txt).
