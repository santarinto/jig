# jig → портал santarinto/site — роадмап компонентов

Источник: сравнительный аудит (Web Claude Design System). Портал `frontend-react/` (React 19, сейчас shadcn/ui) мигрирует на jig как единственный UI-kit.

**Правила работы:** интерактивно, по одному компоненту. На каждый — референс от пользователя + подробные вопросы, делаем максимально похоже. Конвенции библиотеки: папка `src/components/<group>/<Name>/` (tsx+css BEM `ds-<name>__*` + index + test + preview `.html`/`.tsx`), только токены `--ds-*` (без raw hex), light+dark из коробки, экспорт из barrel, TDD. Синк в Claude Design — вручную (`/design-sync`).

**DoD (на каждый):** build+lint зелёные; light+dark превью; prompt.md с 2–3 примерами; типы экспортированы; ни одного raw hex; в конце волны — bump версии (minor) + changelog.

## P0 — блокируют миграцию портала
- [x] 1. **Textarea** — многострочный ввод (label/hint/error/size + rows, счётчик N/maxLength, resize:vertical, фокус --ds-accent)
- [x] 2. **Skeleton** — плейсхолдер загрузки (variant text/rect/circle, width/height/lines; анимации sweep[деф]/pulse/retro; токены --ds-skel-*; уважает prefers-reduced-motion)
- [x] 3. **DropdownMenu** — меню действий по «⋯» (items icon/tone/disabled/onSelect + {separator}, встроенный kebab или свой trigger, align start/end, флип вверх, клавиатура ↑↓/Home/End/Enter/Esc, клик-вне)
- [x] 4. **DatePicker** — поле даты (показ ДД.ММ.ГГГГ, ручной ввод) + попап Calendar; value ISO, onChange, label/hint/error, min/max, size, очистка. Calendar доработан под референс учётной системы: выпадашки год/месяц + ‹ ›, оранжевые Сб/Вс (--ds-weekend), серые дни соседних месяцев, зелёная рамка выбора, «Сегодня»
- [x] 5. **NumberField** — число со степперами −/+ по бокам, удержание с ускорением, suffix (кг/мл), min/max/step (в т.ч. дробный), ручной ввод, ArrowUp/Down, role=spinbutton, size/error
- [x] 6. **LineChart** — чистый SVG (без d3/chart.js): series, height, yUnit; fill line[деф]/area/auto, curve smooth[деф]/straight; тултип по наведению, легенда-тумблеры, палитра из токенов, сетка --ds-table-grid

## P1 — отдельные экраны
- [x] 7. **Alert** — инлайновая плашка (tone info/success/warning/error, title?, children, onClose?); иконка тона, левая полоса, тонированная подложка (color-mix), role alert/status
- [x] 8. **Drawer** — выезжающая панель (open/onClose/side left|right|bottom/title/footer); оверлей, слайд-анимация, Esc/клик-фон/фокус-трап, reduced-motion
- [x] 9. **Accordion** — сворачиваемые секции (items id/title/content, multiple?, defaultOpenIds); шеврон, клавиши ↑↓/Home/End, aria-expanded + region
- [x] 10. **Slider** — одиночный range (value/onChange/min/max/step, label/suffix, disabled); teal-заливка до значения, кастомный thumb, native role=slider
- [x] 11. **Popover** — примитив anchor + панель (trigger, open/defaultOpen/onOpenChange, placement bottom/top × start/end); клик-вне + Esc. (DropdownMenu/DatePicker пока свои — рефактор на Popover опционально позже)
- [x] 12. **EmptyState** — пустое состояние (icon?/дефолтный глиф, title, description?, action?); центрировано

## P2 — точечные
- [x] 13. **CodeInput (OTP)** — N ячеек кода (length/value/onChange/onComplete/error); автопереход, backspace, вставка, стрелки, one-time-code, numeric
- [x] 14. **FileDrop** — зона загрузки (клик/drag-drop) + список файлов (имя/размер/удалить); accept/multiple/onFiles, hint, disabled
- [x] 15. **Stat** — карточка показателя (label/value/delta{value,direction,tone?}/hint); стрелка + цвет дельты (auto или tone override)

## Расширения существующих
- [x] E1. **DataTable**: `emptyContent?`, `loading?`+`loadingRows?` (skeleton-строки через Skeleton), `onRowClick?` (клик по чекбоксу не триггерит)
- [x] E2. **Toast**: императивный API `toast.success/error/warning/info(text, {duration})` + очередь; `<Toaster position>` с автозакрытием (переиспользует декларативный Toast); dismiss/clear
- [x] E3. **Combobox**: `onCreate?(label)` — строка «Создать «…»» для незнакомого ввода (клик + Enter, клавиатура), teal-акцент

## Прогресс
_Отмечаем по мере готовности; каждый — отдельный git-коммит._
