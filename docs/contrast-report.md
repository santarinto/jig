# Contrast report (WCAG AA) — wave 2 / B4–B5 (post-check)

> **ИСТОРИЯ, А НЕ ИСТОЧНИК (DS-181).** Таблицы ниже набраны руками и
> МОЛЧА РАЗОШЛИСЬ с `tokens/tokens.css`: палитра серий в них предыдущая (`#2F6FBD`
> и соседи), зебра `#FAFAFA` против нынешней `#F5F5F5`, тёмная `section-bar`
> `#202020` против `#181818`. Ронять было нечему — числа никто не считал.
>
> Живая матрица «передний план × поверхность × тема» теперь строится из токенов:
> `tokens/colourPairs.ts`, гейт `tokens/colourPairs.test.ts`, страница
> `demo/pairings.html`, правила и причины — `docs/colour-pairings.md`.
>
> Ценность этого файла — в РЕШЕНИЯХ и их доводах: раздел «Decisions», разбор
> `-fg`-токенов, группа D про волосяные границы, стопка тинтов у `SideNav`. Их
> не пересчитать из токенов, и они остаются здесь.
>
> **Таблицы замеров удалены на DS-351.** Они и были тем, что разошлось:
> набранные руками числа, которые никто не считал и которым верили. Живая
> матрица — `tokens/colourPairs.ts` плюс `demo/pairings.html`; конкретный
> замер там свежий по построению. Числа, оставшиеся в прозе ниже, — это
> доводы решений, они стареют вместе с решением, а не сами собой.

Thresholds: **4.5:1** normal text, **3:1** large text (≥18pt / ≥14pt bold) and UI
control borders/edges / graphical objects (chart series strokes).

Recalculated after the post-check pass: Badge/Alert text-on-own-tint tokens,
Switch contour decision, chart×surface (B5).

Method: relative luminance per WCAG 2.x on hex values from `tokens/tokens.css`.
Badge tints: `color-mix(in srgb, tone 12%, transparent)` approximated as
`mix(tone, surface, 12%)` (assumes a surface parent). Alert tints:
`color-mix(in srgb, tone 12%, surface)`.

## Decisions (accepted)

| ID | Decision |
|---|---|
| Accent | `--ds-accent` / hover / active **unchanged** in both themes. |
| Tokens (B4) | light: warning `#8A6600`, success `#2A7030`, weekend `#BE4E1E`, text-muted `#6B6B6B`; dark: text-muted `#9A9A9A`. |
| Tokens (post-check) | light error `#BB2F28`, light info `#2764AD`; dark error `#F2847D`, dark info `#63ACED` — so Badge/Alert text on **own 12% tint** clears 4.5:1. |
| Tokens (DS-209) | **`--ds-text-faint`** added: light `#757575` (4.61 on `#FFFFFF`), dark `#8E8E8E` (4.62 on `#262626`). The weakest text that still clears 4.5:1 on the surface — for cells that are present but not the subject (a day of the neighbouring month), **never for `:disabled`**. It replaces `opacity` on the element: opacity dims the whole group (focus ring and inner marks with it) and is invisible to any nominal `color` × `background-color` measurement. The window between it and `--ds-text-muted` (5.33/5.38) is only ΔL\* ≈ 4 — that is the AA wall for grey text, not stinginess. |
| Tokens (DS-233) | **`--ds-text-disabled`** added: light `#B0B0B0`, dark `#5A5A5A`. The one text token deliberately BELOW 4.5:1 — WCAG 1.4.3 exempts disabled, and the dimming here IS the message. It exists because the message must be written in COLOUR, not in `opacity` on the element: `.ds-cal__day:disabled` carried `--ds-text-muted` under `opacity: 0.4`, which (a) dimmed the focus ring and the mark dot with the text and (b) beat `.ds-cal__day--out` on specificity (0,2,0 vs 0,1,0), so with `min`/`max` set, "a day of the neighbouring month" and "a day out of range" landed on the SAME screen pixel `rgb(196,196,196)`. Two numbers were fixed, and the second matters more: 2.17 on `--ds-surface` (the day number stays readable — a calendar must not dissolve because part of it is out of range) and **2.12 against `--ds-text-faint`**, i.e. disabled is distinguishable from FAINT, not only from normal. The old pair gave 1.00 against faint. Dark is symmetric by construction: 2.19 and 2.11. NOTE: this is so far the only place where disabled is written as a token — `Button`, `Pagination`, `FileDrop`, `Slider` and field buttons still dim themselves with `opacity` (the list lives in the `measure` case «Приглушение прозрачностью»); unifying them is separate work. |
| Components | Badge/Alert semantic alphas → **12%** for all tones (info was 14%); dark Badge accent → `--ds-accent`; dark `Button--danger` → `text-on-accent`. |
| White on accent (dark) | Components must use `--ds-text-on-accent`, not `--ds-text-on-solid`. |
| **D — Borders** | **ПЕРЕСМОТРЕНО DS-267 — см. строку ниже.** ~~Keep hairline borders as-is (intentional product look). WCAG 1.4.11 for controls is met via `--ds-focus-ring` (accent) and interactive hover → `--ds-border-strong` / accent, not resting `--ds-border` contrast.~~ |
| **D′ — Граница контрола (DS-267)** | **Опознание контрола В ПОКОЕ берёт 3:1 собственным токеном `--ds-control-border`** (светлая `#878787`, тёмная `#777777`). Волосяные рамки как приём ОСТАЮТСЯ — `--ds-border` и `--ds-border-strong` не тронуты и продолжают держать структуру: рельс `Timeline`, нулевую линию `BarChart`, разделитель `CommandBar`, сетку и рамки карточек. **Почему D отменено, и это факт, а не смена вкуса.** Довод D опирался на ЛЕСТНИЦУ «покой `--ds-border` → наведение `--ds-border-strong`». Этой лестницы в коде больше нет: `src/styles/field-surface.css` ставил `--ds-border-strong` В ПОКОЕ, а наведение уводил на `--ds-accent`; к моменту пересмотра прежней схемой жил ровно один селектор, `.ds-cal__select`. То есть ступень, на которую ссылалось D, была израсходована, и опознание держалось на 1.49–1.78 при пороге 3. Второй довод D — «1.4.11 закрыт кольцом фокуса» — неверен по существу: кольцо отвечает на вопрос «где фокус», а 1.4.11 спрашивает «виден ли контрол» ДО всякого касания, с мышью и без клавиатуры вовсе. **Чем доказано.** Обход всего каталога браузером, 68 фикстур × 383 кейса × 2 темы, дважды (по обоим граничным токенам): 0 из 53 и 0 из 44 контролов брали порог. Настоящих подложек под контуром контрола четыре, не девятнадцать: `surface`, `surface-subtle`, `bg-app`, `section-bar`. Числа считаются, не хранятся — гейт `tokens/controlBorder.test.ts`, краску сторожит случай `measure` с флагом `pixels`. |
| **Switch thumb contour** | **Removed** (same spirit as group D). A theme-flipping border on the white thumb failed (≥3:1 vs accent); an outer ring on a 14px thumb looks crude. Switch state is carried by **track color** (accent vs neutral), which is contrastive. Keep only `--ds-shadow-sm` for elevation. |
| Chart series (B5) | Primary bar vs surface is **3:1** (lines/markers/legend dots). Legend labels use `--ds-text-primary` + a color chip. |

## Badge / Alert — text on own tint (the real component pairs)

These are the pairs that previously hid failures when only “tone × surface” was checked.

**The label no longer uses the tone token.** A tone had to serve as fill, border, icon
*and* label at once, and the tightest pair (light warning) landed on exactly 4.50:1 — any
later nudge to a tone or a tint alpha would have dropped it below AA silently. Each tone
now has a paired `--ds-<tone>-fg` used only for text on that tone's tint, held to a **5.0**
floor by `tokens/badgeTintContrast.test.ts`. Tints, borders and icons still come from the
tone itself, so nothing changes visually except a slightly stronger label.

Smallest margin over AA is now **+1.06** (dark info), against **+0.00** before.

## Counters on an accent tint — DS-130

Same shape as Badge/Alert above, found four months later and the same way: a pair
that no “token × token” table contains, because the background is built by
`color-mix` at runtime. Light `accent × mix(accent 14%, surface)` was **4.15** —
the count inside an active `Tabs` tab, the `RouteBar` count, the `SideNav` count.
`--ds-fs-sm` is 12px, so the threshold is 4.5 with no large-text relief.

**`--ds-accent-fg` added** (light `#095B5B`, dark `#5FD8D3`): the accent as TEXT
on its own tint. The tone stays free to be a fill, a border and an icon, where
4.15 is legal. Exactly the split the semantic tones got, for exactly the reason.

The `SideNav` row is the interesting one: the count plate sat on
`--ds-table-selected`, which is itself a tint, and two tints stack. Dark gave
**3.39**. No token pair shows that — stacking is visible only where the FINAL
pixel is computed, which is why the gate computes it.

The quiet `SideNav` count lost its bespoke translucent plate: dark
`text-secondary × mix(text-primary 10%, surface)` = **4.42**, and lowering the
alpha does not save it — at 6% it reads 4.90 at rest but 4.42 again under the
cursor, where the item's own hover plate (`--ds-surface-subtle`) slides
underneath and the two add up. It joined the language `Tabs` and `RouteBar`
already speak: solid
`--ds-surface-subtle` with `--ds-text-muted`, 4.97 light and 4.83 dark, in every
state, because a solid colour does not depend on what is under it.

Held by `src/__guards__/color-mix-contrast.test.ts`, which walks every
`color-mix` in `src/**/*.css` — every one of them must be named in its catalogue
with the text token that lands on it, or with the reason there is no text.

## Notes on remaining non-border fails

- **`text-on-solid × accent/error` (dark):** invariant white is for non-text chrome (Switch thumb fill). Labels on accent/error fills use `--ds-text-on-accent`.
- **`accent-active × table-selected` (dark):** not used by Badge accent anymore (uses `--ds-accent`). Kept for the token pair.
- **Border / table-grid:** accepted group D — и это ВСЁ ЕЩЁ ВЕРНО для СТРУКТУРНЫХ линий, но больше не покрывает контролы: их контур вынесен в `--ds-control-border` и берёт 3:1 (решение D′, DS-267). Числа группы D относились к `--ds-border` / `--ds-table-grid` и границу контрола не описывают вовсе.
- **Switch thumb:** no border/ring — see decision table; state via track color.
- **Badge/Alert text on own tint:** all four tones pass ≥4.5:1 after post-check token updates (guarded by `tokens/badgeTintContrast.test.ts`).
- **light `chart-3 × surface`:** 4.36:1 — fine for lines (3:1); avoid as small body text.
