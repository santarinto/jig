import { useEffect, useState } from 'react'
import { toast, Toaster, clearToasts } from '@santarinto/jig'

// Since 1.31.0 Toaster порталится в document.body по умолчанию (тот же фикс,
// что и у Modal/Drawer — тост должен быть кликабелен и виден скринридеру,
// пока открыт оверлей, а не немеет под его inert-свипом). На карточке превью
// портал в document.body сбежал бы из сцены на весь вьюпорт; container держит
// его внутри — см. Stage в previews/Modal.tsx, тот же приём.
const Stage = ({ children }: { children: (container: HTMLElement) => React.ReactNode }) => {
  const [node, setNode] = useState<HTMLElement | null>(null)
  return (
    <div ref={setNode} style={{ transform: 'translateZ(0)', minHeight: 220, position: 'relative' }}>
      {node && children(node)}
    </div>
  )
}

export const Stacked = () => {
  useEffect(() => {
    toast.success('Реализация №РТ-0001 проведена', { duration: 0 })
    toast.error('Не удалось связаться с сервером', { duration: 0 })
    toast.info('Автосохранение включено', { duration: 0 })
    return () => clearToasts()
  }, [])
  return (
    <Stage>
      {(container) => (
        <>
          <div style={{ color: 'var(--ds-text-secondary)' }}>
            toast.success(text) / toast.error(text) — очередь и автозакрытие берёт &lt;Toaster/&gt;.
          </div>
          <Toaster position="bottom-right" container={container} />
        </>
      )}
    </Stage>
  )
}
