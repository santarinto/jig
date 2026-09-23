import { useMemo, useRef, useState } from 'react'
import { Caret } from '../../internal/caret.js'
import './Accordion.css'

export interface AccordionItem {
  id: string
  title: React.ReactNode
  content: React.ReactNode
}

export interface AccordionProps {
  items: AccordionItem[]
  /** Allow several sections open at once (default: single). */
  multiple?: boolean
  /**
   * Раскрытые секции (**контролируемо**): задан — состоянием владеет
   * потребитель, и нажатие само по себе ничего не открывает, пока не приедет
   * новый `openIds`. Так снаружи выражается «свернуть всё».
   */
  openIds?: string[]
  /** Section ids expanded initially (неконтролируемо). */
  defaultOpenIds?: string[]
  /** Новый состав раскрытых секций при каждом переключении — в обоих режимах. */
  onOpenChange?: (ids: string[]) => void
  className?: string
}

export function Accordion({
  items, multiple = false, openIds, defaultOpenIds = [], onOpenChange, className,
}: AccordionProps) {
  const [selfOpen, setSelfOpen] = useState<string[]>(defaultOpenIds)
  const openList = openIds ?? selfOpen
  const open = useMemo(() => new Set(openList), [openList])
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([])

  const toggle = (id: string) => {
    const next = open.has(id)
      ? openList.filter((x) => x !== id)
      : multiple ? [...openList, id] : [id]
    onOpenChange?.(next)
    if (openIds == null) setSelfOpen(next)
  }

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); headerRefs.current[(i + 1) % items.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); headerRefs.current[(i - 1 + items.length) % items.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); headerRefs.current[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); headerRefs.current[items.length - 1]?.focus() }
  }

  return (
    <div className={['ds-accordion', className].filter(Boolean).join(' ')}>
      {items.map((it, i) => {
        const isOpen = open.has(it.id)
        return (
          <div key={it.id} className="ds-accordion__item">
            <button
              ref={(el) => { headerRefs.current[i] = el }}
              type="button"
              className={['ds-accordion__header', isOpen && 'is-open'].filter(Boolean).join(' ')}
              aria-expanded={isOpen}
              aria-controls={`${it.id}-panel`}
              id={`${it.id}-header`}
              onClick={() => toggle(it.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <Caret kind="panel" open={isOpen} />
              <span className="ds-accordion__title">{it.title}</span>
            </button>
            {isOpen && (
              <div className="ds-accordion__panel" role="region" id={`${it.id}-panel`} aria-labelledby={`${it.id}-header`}>
                {it.content}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
