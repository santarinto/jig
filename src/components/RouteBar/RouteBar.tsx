import { useDsText } from '../../dictionary/DsText.js'
import './RouteBar.css'
import { Icon } from '../../icons/index.js'

export interface Route {
  id: string
  label: string
  /**
   * Адрес раздела. **Обязателен, и это главное решение компонента.**
   *
   * Полоса разделов существует ради страниц, у которых клиентского JS нет
   * вовсе, — там переход делает браузер по `href`, а не обработчик. Не будь
   * проп обязательным, «полоса без адресов» компилировалась бы и рисовала
   * пять мёртвых ссылок; так это ошибка типов на месте вызова.
   */
  href: string
  icon?: React.ReactNode
  /** Счётчик справа от подписи (непрочитанное, ожидающее, …). */
  count?: number
}

/**
 * Пропсы, которые раздел отдаёт потребителю в `renderItem`. Разложить их на
 * свой элемент — и он **становится** пунктом полосы.
 *
 * Обработчика здесь нет и не будет: переход — работа браузера. Отсюда же и
 * `href` в наборе, хотя у роутерной ссылки адрес свой: потребитель, написавший
 * `<a {...props} />`, обязан получить рабочую ссылку, а не заготовку.
 */
export interface RouteRenderProps {
  className: string
  children: React.ReactNode
  href: string
  'aria-current'?: 'page'
}

export interface RouteBarProps {
  routes: Route[]
  /** Раздел, на котором пользователь стоит. Помечается `aria-current="page"`. */
  selectedId: string
  /**
   * Имя полосы для скринридера (default «Разделы»). На странице с несколькими
   * `<nav>` их различают именно им.
   */
  ariaLabel?: string
  /**
   * Шов под роутер: **подменяет элемент раздела**, а не оборачивает наш.
   *
   * ```tsx
   * renderItem={(route, props) => <Link {...props} to={route.href} />}
   * ```
   *
   * Оборачивать нельзя: `<Link>{наш элемент}</Link>` даёт `<a><a>` — два
   * таб-стопа на один раздел и объявление пункта, который никуда не ведёт.
   */
  renderItem?: (route: Route, props: RouteRenderProps) => React.ReactNode
  /**
   * Полоса стоит **внутри чужой шапки**, у которой своя разделительная линия
   * уже есть: собственная нижняя граница не рисуется.
   *
   * Признак называет раскладку, а не действие. «Убрать рамку» звучало бы как
   * вкус и предлагало бы убирать её где попало; убирать её осмысленно ровно
   * там, где под полосой сразу идёт вторая линия — то есть в шапке. Тот же
   * приём и то же имя, что у `Calendar.embedded` (панель внутри `Card`).
   */
  embedded?: boolean
  className?: string
  id?: string
}

/**
 * Полоса разделов: плоский набор равноправных страниц, между которыми ходят
 * ссылками.
 *
 * **Почему это не `Tabs` и не `SectionPanel`.** Те раздают roving `tabIndex`
 * (`active ? 0 : -1`), а фокус остальным пунктам возвращает обработчик стрелок.
 * На странице без гидрации обработчик не подключается — и из пяти разделов
 * клавиатурой достижим ровно один. Здесь роуминга нет: каждый раздел это
 * ссылка и обычный таб-стоп, как ей и положено.
 *
 * Вторая причина — семантика. `role="tab"` обещает панели в том же документе и
 * переключение без ухода со страницы. Здесь уход со страницы и есть смысл, а
 * значит `<nav>` со списком ссылок и `aria-current="page"` на текущей.
 */
export function RouteBar({
  routes, selectedId, ariaLabel, renderItem, embedded = false, className, id,
}: RouteBarProps) {
  const t = useDsText()
  return (
    <nav
      id={id}
      className={['ds-routebar', embedded && 'ds-routebar--embedded', className]
        .filter(Boolean).join(' ')}
      aria-label={ariaLabel ?? t['routeBar.nav']}
    >
      <ul className="ds-routebar__list">
        {routes.map((r) => {
          const active = r.id === selectedId
          const props: RouteRenderProps = {
            className: ['ds-routebar__link', active && 'is-active'].filter(Boolean).join(' '),
            href: r.href,
            'aria-current': active ? 'page' : undefined,
            children: (
              <>
                {r.icon && <Icon className="ds-routebar__icon" aria-hidden="true">{r.icon}</Icon>}
                <span className="ds-routebar__label">{r.label}</span>
                {r.count != null && <span className="ds-routebar__count">{r.count}</span>}
              </>
            ),
          }
          return (
            <li key={r.id} className="ds-routebar__item">
              {renderItem ? renderItem(r, props) : <a {...props} />}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
