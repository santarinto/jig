import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconCopy } from '@tabler/icons-react'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyChip({
  label,
  value,
  className,
  title,
}: {
  label: string
  value: string
  className?: string
  title?: string
}) {
  const [flash, setFlash] = useState(false)

  const onCopy = useCallback(async () => {
    if (await copyText(value)) {
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1200)
    }
  }, [value])

  return (
    <button
      type="button"
      className={[className, flash && 'is-copied'].filter(Boolean).join(' ')}
      title={title ?? `Скопировать: ${value}`}
      onClick={onCopy}
    >
      {flash ? '✓' : label}
    </button>
  )
}

/** Обёртка одного визуального элемента — имя, bbox, JSX. */
export function DemoSpec({
  children,
  name,
  code,
  block,
  inline,
  className,
}: {
  children: ReactNode
  name: string
  code?: string
  block?: boolean
  /** Компактно в ячейке таблицы / в ряд — без рамки тела. */
  inline?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [codeFlash, setCodeFlash] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.ceil(r.width), h: Math.ceil(r.height) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const sizeText = size ? `${size.w}×${size.h} px` : '…'
  // Копируется самоописательный код: заголовок-комментарий с названием блока
  // плюс JSX с реальными пропсами. Название в отрыве от кода вводило в
  // заблуждение — агент читал «Tabs · Basic» и искал `variant='basic'`, которого
  // нет. Теперь копия несёт и что это, и чем задаётся.
  const snippet = code ? `// ${name}\n${code}` : `// ${name}`

  const onCopyCode = useCallback(async () => {
    if (await copyText(snippet)) {
      setCodeFlash(true)
      window.setTimeout(() => setCodeFlash(false), 1200)
    }
  }, [snippet])

  const cls = [
    'demo-spec',
    block && 'demo-spec--block',
    inline && 'demo-spec--inline',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      <div className="demo-spec__bar">
        <CopyChip
          className="demo-spec__name"
          label={name}
          value={snippet}
          title="Скопировать JSX с пропсами"
        />
        <div className="demo-spec__actions">
          {size && (
            <CopyChip
              className="demo-spec__size"
              label={sizeText}
              value={sizeText}
              title="Скопировать размер"
            />
          )}
          <button
            type="button"
            className={['demo-spec__copy', codeFlash && 'is-copied'].filter(Boolean).join(' ')}
            title="Скопировать JSX"
            aria-label="Скопировать JSX"
            onClick={onCopyCode}
          >
            {codeFlash ? '✓' : <IconCopy size={13} stroke={1.75} aria-hidden />}
          </button>
        </div>
      </div>
      <div className="demo-spec__body">
        <div className="demo-spec__content" ref={ref}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function DemoBlock({
  name,
  code,
  block,
  children,
}: {
  name: string
  code?: string
  block?: boolean
  children: ReactNode
}) {
  return (
    <DemoSpec name={name} code={code} block={block}>
      {children}
    </DemoSpec>
  )
}
