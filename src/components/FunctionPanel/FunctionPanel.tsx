import { useDsText } from '../../dictionary/DsText.js'
import './FunctionPanel.css'

/** Ссылка панели: `id` уходит в `onOpen` или в `renderItem`, `label` — подпись. */
export interface FunctionLink { id: string; label: string }
export interface FunctionGroup { title: string; links: FunctionLink[] }

/**
 * Пропсы, которые ссылка отдаёт потребителю в `renderItem`. Разложить их на свой
 * `<a>`/`<Link>` — и он **становится** ссылкой панели.
 *
 * `onClick` здесь нет, в отличие от `SideNavRenderProps`: у панели нет
 * выбранного пункта, отмечать нечего, а переход целиком принадлежит элементу
 * потребителя. `tabIndex` и `aria-current` по той же причине: роуминга и
 * «текущей страницы» у панели нет, и пустые поля читались бы как обещание.
 */
export interface FunctionPanelRenderProps {
  className: string
  children: React.ReactNode
}

interface PanelBase { groups: FunctionGroup[] }

/**
 * Ссылки кнопками: переход делает `onOpen`. Годится для команд («Обмен с
 * банком»), а не для навигации — средний клик и «открыть в новой вкладке» у
 * кнопки не работают.
 */
interface OpenPanel extends PanelBase {
  onOpen?: (id: string) => void
  renderItem?: never
}

/**
 * Ссылки элементом потребителя (DS-273):
 *
 * ```tsx
 * renderItem={(link, props) => <Link to={`/${link.id}`} {...props} />}
 * ```
 *
 * Шов **подменяет** элемент, а не оборачивает кнопку: `<a><button>` — вложенная
 * интерактивность (гейт `no-nested-interactive`), и средний клик в ней сначала
 * достаётся кнопке, то есть шов не дал бы того, ради чего его берут. Ровно на
 * этом `SideNav` чинили ломающей правкой в 1.17.0. Получают шов ВСЕ ссылки:
 * веток у панели нет, исключать нечего.
 */
interface LinkPanel extends PanelBase {
  renderItem: (link: FunctionLink, props: FunctionPanelRenderProps) => React.ReactNode
  onOpen?: never
}

/**
 * `onOpen` и `renderItem` взаимоисключающие — ошибка типов И бросок.
 *
 * Переход — один вопрос с одним источником правды: либо панель зовёт `onOpen`,
 * либо ссылкой владеет элемент потребителя. Оба сразу означали бы, что автор
 * ждёт от клика два действия; молча проигнорировать `onOpen` значило бы
 * «принять и ничего не сделать» — дефект, который выглядит работающим.
 */
export type FunctionPanelProps = OpenPanel | LinkPanel

export function FunctionPanel(props: FunctionPanelProps) {
  const { groups, onOpen, renderItem } = props
  // Рантайм-половина запрета: через `any` тип не держит ничего.
  if (onOpen != null && renderItem != null) {
    throw new Error(
      'jig: FunctionPanel — переданы и `onOpen`, и `renderItem`. Источник '
      + 'перехода один: `renderItem`, если ссылки ведут по адресу, или `onOpen`, '
      + 'если это команды. Уберите один из двух (DS-273).',
    )
  }
  const t = useDsText()
  return (
    <nav className="ds-fnpanel" aria-label={t['functionPanel.nav']}>
      {groups.map((g) => (
        <div key={g.title} className="ds-fnpanel__group">
          <div className="ds-fnpanel__title">{g.title}</div>
          <ul className="ds-fnpanel__list">
            {g.links.map((l) => (
              <li key={l.id}>
                {renderItem
                  ? renderItem(l, { className: 'ds-fnpanel__link', children: l.label })
                  : <button type="button" className="ds-fnpanel__link" onClick={() => onOpen?.(l.id)}>{l.label}</button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
