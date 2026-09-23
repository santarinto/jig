import { cloneElement, useEffect, useLayoutEffect, useRef, useState, useId } from 'react'
import { useAnchoredPosition } from '../../internal/useAnchoredPosition.js'
import { useDismiss } from '../../internal/useDismiss.js'
import { usePopupLayer } from '../../internal/usePopupLayer.js'
import { useDsText } from '../../dictionary/DsText.js'
import './DropdownMenu.css'
import '../../styles/trigger-floor.css'
import { Icon } from '../../icons/index.js'
import { assertAction, type DropdownAction } from '../../internal/action.js'
import { assertTriggerElement, focusTriggerIn } from '../../internal/trigger.js'

/**
 * Пункт меню — общий `ActionBase` без единого сужения (DS-358): меню и
 * есть то место, где действие живёт в самом общем виде. Объявление и доводы —
 * `src/internal/action.ts`.
 */
export type { DropdownAction }

/**
 * Разделитель остаётся ЧЛЕНОМ СОЮЗА, а не полем действия: у него нет ни
 * подписи, ни обработчика, и поле `separator?: true` на действии означало бы,
 * что разделитель можно кликнуть.
 */
export type DropdownItem = DropdownAction | { separator: true }

const isSep = (i: DropdownItem): i is { separator: true } => 'separator' in i

/**
 * Пропсы, которые `DropdownMenu` навешивает на триггер потребителя.
 *
 * `aria-haspopup`, `aria-expanded` и `aria-controls` ПЕРЕКРЫВАЮТ одноимённые
 * пропы триггера, а не дополняют их: состояние меню знает меню. Обработчики
 * (`onClick`, `onKeyDown`) наоборот СЛИВАЮТСЯ — свой вызывается первым.
 *
 * `type` ставится в `'button'`, если триггер его не объявил: своей обёртки, в
 * которой он стоял до DS-359, больше нет, а голый `<button>` без `type`
 * внутри `<form>` по умолчанию `submit` и отправляет форму. Интринсик `<a>` и
 * любой элемент с `href` атрибут не получают — там он не значит ничего.
 */
export interface DropdownMenuTriggerProps {
  onClick: (e: React.MouseEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  type: 'button' | 'submit' | 'reset'
  className: string
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls'?: string
}

export interface DropdownMenuProps {
  items: DropdownItem[]
  /**
   * Элемент-кнопка: `<Button>`, `<button>` или `<a href>`; `<span>` БРОСАЕТ.
   * Пропуск — встроенный кебаб «⋯».
   *
   * Первая строка короткая намеренно: экстрактор дизайн-синка кладёт в `.d.ts`
   * и `.prompt.md` только первые 120 знаков JSDoc пропа и режет молча
   * (`.design-sync/NOTES.md`, ресинк 1.6.3). Ограничение обязано попасть
   * внутрь этих 120 знаков — именно так туда уехала прежняя, теперь неверная
   * заметка «только span, не button».
   *
   * Тип — **элемент**, а не `ReactNode`: на него навешиваются `onClick`,
   * `onKeyDown`, `type` и `aria-*`, а навесить их можно только на узел с
   * пропсами. Это ОДИН ответ системы на один вопрос (DS-359) — тот же,
   * что у `Popover`. Прежде компонент оборачивал переданное в свою кнопку
   * `.ds-dropdown__triggerwrap`, и потому потребителю приходилось класть сюда
   * `<span className="ds-btn …">`: настоящая кнопка дала бы `<button><button>`,
   * ровно ту вложенную интерактивность, которую держит гейт
   * `no-nested-interactive`. Ценой было то, что оформление кнопки приходилось
   * перерисовывать токенами заново — `.ds-cmdbar__more` и `.ds-appbar__more`
   * делали это поимённо.
   *
   * ЧТО КОМПОНЕНТ ДЕЛАЕТ С ВАШИМ ЭЛЕМЕНТОМ:
   * - `aria-haspopup`, `aria-expanded`, `aria-controls` — ПЕРЕКРЫВАЕТ
   *   одноимённые ваши, а не добавляется к ним: состояние меню знает меню;
   * - `onClick` и `onKeyDown` — сливает, ваш вызывается первым;
   * - `type` — ставит `'button'`, если вы его не объявили (иначе триггер
   *   внутри `<form>` отправит форму); `<a>` и всё с `href` не трогает;
   * - `className` — ДОПИСЫВАЕТ `ds-dropdown__trigger`, в котором нет
   *   оформления, только пол цели клика `--ds-target-min`. Компонент, который
   *   `className` не пробрасывает, пола не получит; у инлайнового `<a href>`
   *   `min-*` не действует по правилам CSS — это названный предел, а не
   *   недосмотр.
   *
   * `className` самого `DropdownMenu` ложится не сюда, а на корень
   * `.ds-dropdown`, и корень служит ЯКОРЕМ меню: правило потребителя,
   * растягивающее корень (`display: block; width: 100%`), уводит меню от
   * кнопки — меню встанет по краю корня, а не триггера.
   *
   * `<span>` здесь — БРОСОК, а не деградация: типом его от `<button>` не
   * отличить, см. `assertTriggerElement` в `src/internal/trigger.ts`.
   */
  trigger?: React.ReactElement<Partial<DropdownMenuTriggerProps>>
  /** Horizontal alignment of the menu relative to the trigger. */
  align?: 'start' | 'end'
  /** Accessible label for the built-in kebab button. */
  ariaLabel?: string
  /** Render the menu open on mount (uncontrolled). */
  defaultOpen?: boolean
  className?: string
}

export function DropdownMenu({
  items,
  trigger,
  align = 'start',
  ariaLabel,
  defaultOpen = false,
  className,
}: DropdownMenuProps) {
  const t = useDsText()
  const menuLabel = ariaLabel ?? t['dropdownMenu.label']
  const [open, setOpen] = useState(defaultOpen)
  const zIndex = usePopupLayer(open)
  const [active, setActive] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  const enabledIdx = items
    .map((it, i) => (!isSep(it) && !it.disabled ? i : -1))
    .filter((i) => i >= 0)

  const close = (returnFocus = true) => {
    setOpen(false)
    setActive(-1)
    // Триггер ищется в DOM, а не держится рефом: с DS-359 он может быть
    // компонентом потребителя, который реф не обязан пробрасывать. Тот же код
    // и тот же довод, что у `Popover` — `src/internal/trigger.ts`.
    if (returnFocus) focusTriggerIn(rootRef.current, menuId)
  }

  useDismiss({ enabled: open, ref: rootRef, onDismiss: (r) => close(r === 'escape') })

  // Координаты — из вьюпорта, а не от триггера (DS-240). Меню лежало
  // `position: absolute` внутри `.ds-dropdown`, и любой прокручиваемый предок
  // его клиповал: в `DataTable` с прокруткой обёртки от меню строки оставался
  // 1px из 90. Переворот вверх тоже переехал сюда — раньше его считал
  // `useLayoutEffect` ниже, и он умел только «не влезло вниз», не умея ни
  // поджать к краю, ни пересчитаться при прокрутке предка.
  //
  // ЯКОРЬ — КОРЕНЬ, А НЕ ТРИГГЕР (DS-359), и это не потеря точности:
  // `.ds-dropdown` — `inline-block` вокруг одного триггера, его прямоугольник
  // равен триггерову, а меню в него не входит, потому что `fixed` в раскладке
  // родителя не участвует. Реф на элемент потребителя здесь недоступен по той
  // же причине, по которой выше фокус возвращается поиском в DOM. Тот же
  // приём, что у `Popover`.
  const anchored = useAnchoredPosition({
    enabled: open,
    anchorRef: rootRef,
    floatingRef: menuRef,
    side: 'bottom',
    align,
  })

  // Set initial active item when opening.
  //
  // `enabledIdx` намеренно вне зависимостей, и это не забытая зависимость, а
  // само поведение: активный пункт выбирается ОДИН РАЗ, в момент открытия.
  // С ним в списке любая смена `items` при открытом меню швыряла бы активный
  // пункт на первый прямо под клавиатурной навигацией пользователя — массив
  // пересчитывается каждым рендером и каждый раз новый. Стережёт это не
  // комментарий, а кейс «смена items при открытом меню не сбрасывает активный
  // пункт»: раньше здесь стояла eslint-директива, которая ничего не подавляла,
  // потому что линтера в проекте нет (DS-113).
  useLayoutEffect(() => {
    if (!open) return
    setActive(enabledIdx[0] ?? -1)
  }, [open])

  // Move DOM focus to the active item.
  useEffect(() => {
    if (open && active >= 0) itemRefs.current[active]?.focus()
  }, [open, active])

  const moveActive = (dir: 1 | -1) => {
    if (!enabledIdx.length) return
    const pos = enabledIdx.indexOf(active)
    const next = pos < 0 ? (dir === 1 ? 0 : enabledIdx.length - 1) : (pos + dir + enabledIdx.length) % enabledIdx.length
    setActive(enabledIdx[next])
  }

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveActive(1); break
      case 'ArrowUp': e.preventDefault(); moveActive(-1); break
      case 'Home': e.preventDefault(); setActive(enabledIdx[0] ?? -1); break
      case 'End': e.preventDefault(); setActive(enabledIdx[enabledIdx.length - 1] ?? -1); break
      case 'Tab': close(false); break
    }
  }

  // Старая форма пункта (без `id`, DS-358) обязана БРОСАТЬ: под `any` у
  // потребителя меню нарисовалось бы как прежде, а свёртка полосы в «Ещё»
  // потеряла бы различитель — дефект, который видно не здесь и не сразу.
  items.forEach((it) => { if (!isSep(it)) assertAction(it, 'DropdownMenu: `items`') })

  const runAction = (it: DropdownAction) => {
    if (it.disabled) return
    close()
    it.onSelect?.()
  }

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setOpen(true)
    }
  }

  // Триггер потребителя — ЕГО узел, клонированный нашими пропсами. Бросок на
  // `<span>` стоит здесь, в рендере, а не в эффекте: на сервере эффекта нет
  // вовсе, а у потребителя отказ обязан прилететь из той фазы, где стоит его
  // вызов.
  let anchor: React.ReactNode
  if (trigger !== undefined) {
    assertTriggerElement(trigger, 'DropdownMenu')
    const own = trigger.props as Partial<DropdownMenuTriggerProps> & { href?: unknown }
    // ССЫЛКЕ `type` НЕ СТАВИТСЯ: у `<a>` атрибут значит тип содержимого по
    // ссылке, а не роль кнопки. Признака два, и второй не лишний: интринсик
    // `<a>` и ЛЮБОЙ элемент с `href` — так под правило попадает и
    // `<Button as="a" href>`, у которого тип элемента — компонент.
    const isLink = trigger.type === 'a' || own.href != null
    anchor = cloneElement(trigger, {
      onClick: (e: React.MouseEvent) => {
        own.onClick?.(e)
        setOpen((o) => !o)
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        own.onKeyDown?.(e)
        onTriggerKeyDown(e)
      },
      // ТИП — `button`, если потребитель не объявил своего. До DS-359
      // его гарантировала наша обёртка; теперь триггер — кнопка потребителя, а
      // голая `<button>` без `type` внутри `<form>` по умолчанию `submit`, и
      // клик по «Действия» отправлял бы форму заодно с открытием меню. Наш
      // `Button` с DS-365 ставит `button` сам, но триггером бывает и
      // голая `<button>` потребителя. Свой `type` потребителя переживает клон:
      // триггер меню сабмитом не бывает, но запрещать это здесь — не наше
      // дело, а вот молча отправлять форму — дефект.
      ...(isLink ? {} : { type: own.type ?? 'button' }),
      // ПОЛ ЦЕЛИ КЛИКА (DS-323, пересмотр 359) — классом, а не
      // обёрткой. В `ds-dropdown__trigger` нет оформления, только
      // `min-block-size`/`min-inline-size` от `--ds-target-min`: голый
      // `<button>` потребителя высотой в строку текста (замерено 21.3 при
      // шкале 1.15 на прежней обёртке) иначе терял бы пол молча, а ни один
      // гейт чужой элемент не судит. Дописывается к своему `className`, а не
      // заменяет его.
      className: [own.className, 'ds-dropdown__trigger'].filter(Boolean).join(' '),
      // `aria-*` ПЕРЕКРЫВАЮТ одноимённые пропы потребителя, а не сливаются с
      // ними: раскрыто меню или нет, знает меню.
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      ...(open ? { 'aria-controls': menuId } : {}),
    } as Partial<DropdownMenuTriggerProps>)
  } else {
    anchor = (
      <button
        type="button"
        className="ds-dropdown__kebab"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <span aria-hidden="true">⋯</span>
      </button>
    )
  }

  return (
    <div ref={rootRef} className={['ds-dropdown', className].filter(Boolean).join(' ')}>
      {anchor}

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          className={[
            'ds-dropdown__menu',
            `ds-dropdown__menu--${align}`,
            anchored.side === 'top' && 'ds-dropdown__menu--up',
          ].filter(Boolean).join(' ')}
          // `right`/`bottom` гасит сам хук (DS-287): модификаторы `--end`
          // и `--up` остаются в листе статическим фолбэком для РУЧНОЙ вёрстки
          // (превью и `measure` рисуют разметку без JS), а инлайн хука
          // перекрывает их целиком.
          style={{ ...anchored.style, zIndex }}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((it, i) =>
            isSep(it) ? (
              <div key={i} className="ds-dropdown__sep" role="separator" />
            ) : (
              // Ключ пункта — его `id`, а не индекс (DS-358). Ради этого
              // поле и сделано обязательным: сообщение броска обещает, что
              // действие «остаётся собой между рендерами», и обещание держит
              // именно эта строка. `itemRefs` при этом ОСТАЁТСЯ на индексе —
              // роуминг ходит по позиции в списке, и позиция разделителя в нём
              // тоже занята; ключа у разделителя нет вовсе.
              <button
                key={it.id}
                ref={(el) => { itemRefs.current[i] = el }}
                type="button"
                role="menuitem"
                tabIndex={i === active ? 0 : -1}
                disabled={it.disabled}
                className={[
                  'ds-dropdown__item',
                  it.tone === 'error' && 'ds-dropdown__item--error',
                  i === active && 'is-active',
                ].filter(Boolean).join(' ')}
                onClick={() => runAction(it)}
                onMouseEnter={() => setActive(i)}
              >
                <Icon className="ds-dropdown__item-icon" aria-hidden="true">{it.icon}</Icon>
                <span className="ds-dropdown__item-label">{it.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
