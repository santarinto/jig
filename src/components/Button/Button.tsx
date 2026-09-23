import { Icon } from '../../icons/index.js'
// Кнопка сама рисует `.ds-icon` через `<Icon>` (DS-360) — импорт листа
// явный, а не понадеявшийся на побочный эффект внутри `icons/Icon.tsx`
// (гейт `shared-sheets`: компонент, ставящий класс общего листа, подключает
// его сам, иначе тот, кто импортирует один `Button`, получил бы голый узел).
import '../../styles/icon.css'
import './Button.css'

/**
 * `success` — подтверждающее действие, которое **запускает** что-то: «Старт»,
 * «Выкатить». Не для «сохранено»: сообщение об успехе — дело `Alert`, а кнопка
 * говорит, что произойдёт, а не что уже произошло.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * Тон `error` — не то же, что `variant="danger"`. Вариант — сплошная
 * красная кнопка («Удалить безвозвратно» как главное действие формы). Тон —
 * красит текст и иконку в error, оставляя кнопку прозрачной: разрушающее
 * действие в ряду прочих (иконка-корзина в колонке действий), где сплошная
 * заливка была бы криком. До этого потребители дописывали `color:
 * var(--ds-error-fg)` поверх `ghost` своим CSS — теперь это первично.
 *
 * Имя тона — `error`, из общего словаря `BadgeTone` (DS-16): один и тот
 * же смысл «красный/error» раньше назывался `danger` у кнопки и действий и
 * `error` у бейджа/алерта — теперь везде `error`. Семантика разрушающего
 * действия осталась (тон красит в error-цвет), унифицировано только имя.
 *
 * Рядом с этим правилом у них лежало дублирующее `:hover` с тем же цветом.
 * Первая редакция объясняла его так: «чтобы системный ховер не перекрашивал
 * кнопку обратно». Потребитель проверил и поправил: `.ds-btn--ghost:hover`
 * трогает только `background`, `color` не трогает вовсе — то есть на момент,
 * когда правило нашли, перекрашивать было нечему. Формулировка описывала
 * **причину, по которой правило когда-то появилось**, а не состояние, в
 * котором оно жило. Оставлено как есть: разница между этими двумя вещами и
 * есть то, ради чего docblock пишется.
 *
 * Значим только с прозрачными вариантами (`ghost`, `secondary`); на сплошных
 * (`primary`/`danger`/`success`) тон не действует — там цвет несёт заливка.
 */
export type ButtonTone = 'error'

/** Общие для кнопки и ссылки: вариант, размер, тон, состояние. `disabled` здесь,
 *  а не в `ButtonHTMLAttributes`, чтобы он был у обоих вариантов — у `<a>` нет
 *  нативного `disabled`, и для него поле превращается в `aria-disabled`. */
interface ButtonBase {
  variant?: ButtonVariant
  size?: ButtonSize
  tone?: ButtonTone
  loading?: boolean
  disabled?: boolean
}

/**
 * Значок и его пара с конца подписи (DS-360). Рисуются ВНУТРИ
 * `.ds-btn__label`, по краям: иконка — `children` — `iconEnd`. Оба декоративны
 * (`aria-hidden`) и оба проходят через системную обёртку значка из
 * `icons/Icon.tsx` (гейт `icon-contract`, DS-145) — толщина штриха,
 * размер и цвет чужого SVG иначе остаются чужими. Класс `ds-btn__icon` садится
 * на ТОТ ЖЕ узел, что и класс этой обёртки (`className` мержится), а не на
 * обёртку сверху, и несёт только выравнивание в `.ds-btn__label` — размер
 * держит обёртка значка. Смысл несёт подпись, то же решение, что у
 * `CommandAction.icon` (`src/internal/action.ts`).
 *
 * `iconOnly` СПОРИТ за содержимое кнопки, если занять сразу два слота —
 * эпик DS-248 («молчаливая деградация API») запрещает молча работающую
 * не так комбинацию, поэтому спор разрешён на уровне типов и throw'ом в
 * рантайме (на случай `any` на пути потребителя):
 * - `iconOnly` + `iconEnd` — у кнопки из одной иконки нет «конца», второго
 *   края подписи не существует;
 * - `iconOnly` + `icon` + `children` — два претендента на одно место: `icon`
 *   САМ есть содержимое такой кнопки.
 * `iconOnly` + `icon` БЕЗ `children` — законно, `icon` и есть содержимое.
 * `iconOnly` + `children` БЕЗ `icon` — тоже законно и НЕ меняется: так
 * рисуют кнопку потребители, у которых иконка уже была одиночным `children`
 * (`RowAction`, `CardTool` и т.п.), и ломать их незачем.
 */
type IconSlots =
  | { iconOnly?: false; icon?: React.ReactNode; iconEnd?: React.ReactNode; children?: React.ReactNode }
  | { iconOnly: true; icon: React.ReactNode; iconEnd?: undefined; children?: undefined }
  | { iconOnly: true; icon?: undefined; iconEnd?: undefined; children?: React.ReactNode }

/**
 * Слот занят тогда и только тогда, когда React что-то нарисует (ревью
 * DS-360). `icon={cond && <IconPlus/>}` — рядовой идиом условной
 * иконки, и при ложном `cond` выражение даёт `false` — ровно эпик DS-248
 * («молчаливая деградация API»): `icon != null` пропускало `false` внутрь, и
 * `.ds-btn__icon` рисовалась ПУСТОЙ — узел без содержимого во флекс-потоке
 * `.ds-btn__label` всё равно занимает `gap`, и подпись молча уезжала на
 * величину зазора (6px на шкале 1). React не рисует `false`/`null`/`undefined`
 * и пустую строку — они и есть «слота нет»; `0` React рисует, и здесь это не
 * особый случай, слот занят.
 */
const hasSlot = (x: React.ReactNode): boolean => x != null && typeof x !== 'boolean' && x !== ''

/**
 * Кнопка-ссылка: `as="a"` рендерит `<a>` вместо `<button>`, для навигационного
 * действия без гидрации («Обновить» → `/`, «Долги» → якорь). Кнопкой его не
 * сделать: без JS `<button>` мертва, а рисовать `<a class="ds-btn">` руками —
 * вне системы.
 *
 * Союз дискриминирован по `as`: при `as="a"` доступны только якорные атрибуты
 * (`href`, `target`, `rel`, …), а `type`, `form`, `onClick` с типом кнопки —
 * нет. Старая форма (`type="button"` при `as="a"`) даёт ошибку типов, а не
 * деградацию — правило «устаревшее API ломает компиляцию». `href` обязан быть
 * строкой (не `undefined`): ссылка без адреса — это кнопка, а не ссылка.
 *
 * Второй механизм отдать свой элемент — `renderItem` у `SideNav`/`Tabs`/
 * `Breadcrumbs` — для коллекций, где каждый узел подменяется. Здесь коллекции
 * нет, шов был бы выдуманной абстракцией под один узел; `as` прямее.
 */
type OmittedKeys = keyof ButtonBase | 'icon' | 'iconEnd' | 'iconOnly' | 'children'

export type ButtonProps =
  | (ButtonBase & IconSlots & { as?: 'button' } & Omit<React.ComponentPropsWithRef<'button'>, OmittedKeys>)
  | (ButtonBase & IconSlots & { as: 'a'; href: string } & Omit<React.ComponentPropsWithRef<'a'>, OmittedKeys>)

export function Button(props: ButtonProps) {
  const {
    as = 'button',
    variant = 'primary',
    size = 'md',
    tone,
    loading = false,
    iconOnly = false,
    icon,
    iconEnd,
    disabled,
    className,
    children,
    ...rest
  } = props

  // Спор за содержимое кнопки (DS-360) — throw и на `any`-пути
  // потребителя, где типы не защитили. Тексты называют конкретный проп, а не
  // «что-то не так с Button», как остальные сообщения системы. `hasSlot`, а не
  // `!= null`: `iconEnd={cond && <X/>}` при ложном `cond` — не занятый слот, и
  // бросать тут нечего (ревью DS-360).
  if (iconOnly && hasSlot(iconEnd)) {
    throw new TypeError(
      'Button: iconOnly с iconEnd несовместимы (DS-360) — у кнопки из одной иконки нет '
      + '«конца», второго края подписи. Уберите iconEnd или снимите iconOnly.',
    )
  }
  if (iconOnly && hasSlot(icon) && hasSlot(children)) {
    throw new TypeError(
      'Button: iconOnly с icon и children разом — два претендента на содержимое кнопки '
      + '(DS-360). icon сам есть содержимое такой кнопки: оставьте либо icon без '
      + 'children, либо children без icon.',
    )
  }

  const classes = [
    'ds-btn',
    `ds-btn--${variant}`,
    `ds-btn--${size}`,
    tone && `ds-btn--tone-${tone}`,
    iconOnly && 'ds-btn--icon',
    loading && 'is-loading',
    className,
  ].filter(Boolean).join(' ')

  const label = (
    <>
      {loading && <span className="ds-btn__spinner" aria-hidden="true" />}
      <span className="ds-btn__label">
        {hasSlot(icon) && <Icon className="ds-btn__icon" aria-hidden="true">{icon}</Icon>}
        {children}
        {hasSlot(iconEnd) && <Icon className="ds-btn__icon" aria-hidden="true">{iconEnd}</Icon>}
      </span>
    </>
  )

  if (as === 'a') {
    // У `<a>` нет нативного `disabled`. `aria-disabled` + `tabIndex={-1}` дают
    // то же: скринридер «заблокировано», фокуса нет. `pointer-events: none`
    // (в CSS на `[aria-disabled="true"]`) гасит и мышь — ховера на заблокированной
    // ссылке быть не должно, как и на заблокированной кнопке.
    const off = disabled || loading
    return (
      <a
        className={classes}
        aria-disabled={off || undefined}
        tabIndex={off ? -1 : undefined}
        {...(rest as React.ComponentPropsWithRef<'a'>)}
      >
        {label}
      </a>
    )
  }

  // `type="button"` по умолчанию (DS-365). Дефолт браузера — `submit`, и
  // любая наша кнопка в `<form>` потребителя отправляла форму, хотя её действие
  // задано `onClick`: «Отмена» рядом с «Сохранить», действие полосы в форме
  // документа. Отправка — явное `type="submit"`; оно приходит в `rest` и стоит
  // ПОСЛЕ дефолта, поэтому перекрывает его.
  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading}
      {...(rest as React.ComponentPropsWithRef<'button'>)}
    >
      {label}
    </button>
  )
}
