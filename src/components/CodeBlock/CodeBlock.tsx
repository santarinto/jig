import { useState } from 'react'
import '../../styles/button-surface.css'
import { useDsText } from '../../dictionary/DsText.js'
import './CodeBlock.css'

export type CopyState = 'idle' | 'copied' | 'failed'

export interface CodeBlockProps {
  /** Код как текст. Он же попадает в буфер обмена. */
  code: string
  /**
   * Готовая разметка вместо простого текста — если код подсвечен вашим
   * средством. Подсветки в системе нет намеренно: она тянет либо парсер на
   * сотни килобайт, либо покрытие в полтора языка.
   *
   * Копируется всегда `code`, а не то, что здесь: из разметки текст пришлось бы
   * вынимать обратно, и любая вставка вроде номера строки уехала бы в буфер.
   */
  children?: React.ReactNode
  /** Кнопка копирования. По умолчанию есть. */
  copyable?: boolean
  /** Подписи кнопки: покой, успех, отказ. */
  copyLabels?: { idle: string, copied: string, failed: string }
  /** Сколько держать состояние после нажатия, мс. */
  copyResetMs?: number
  /** Доступное имя блока — «Команда добавления задачи». */
  label?: string
  /**
   * Ограничить высоту блока: длинный JSON (сотни строк) не растягивает карточку,
   * а прокручивается внутри. `number` — px, масштабируется `--ds-ui-scale`;
   * строка — дословно (`'12rem'`). Вертикальная прокрутка появляется вместе с
   * лимитом. По умолчанию команда скроллится по горизонтали и не переносится
   * (см. AGENTS); для сплошного текста без переносов (промт роли) включите `wrap`.
   */
  maxHeight?: number | string
  /**
   * Мягкий перенос длинных строк вместо горизонтальной прокрутки. По умолчанию
   * выключено: код читают как есть, скролл сохраняет отступы/выравнивание. Включают
   * для блока, чьё содержимое — не код, а сплошной текст без собственных переносов
   * (длинный промт роли на странице настроек воркера): иначе одна строка уезжает
   * вправо и `maxHeight` не ловит её вертикальным скроллом. Перенос сочетается с
   * `maxHeight` — текст сворачивается в несколько строк и подхватывает лимит.
   */
  wrap?: boolean
  className?: string
  id?: string
}

export function CodeBlock({
  code, children,
  copyable = true,
  copyLabels,
  copyResetMs = 2000,
  label,
  maxHeight,
  wrap = false,
  className, id,
}: CodeBlockProps) {
  const t = useDsText()
  const labels = copyLabels ?? {
    idle: t['codeBlock.copy'], copied: t['codeBlock.copied'], failed: t['codeBlock.copyFailed'],
  }
  const [state, setState] = useState<CopyState>('idle')
  // Числовой размер — интерфейсный, масштабируется (js-px-scale гейт); строка
  // передаётся дословно (отдушина для фиксированной высоты).
  const maxH = maxHeight == null
    ? undefined
    : typeof maxHeight === 'number'
      ? `calc(${maxHeight}px * var(--ds-ui-scale, 1))`
      : maxHeight

  async function copy() {
    try {
      // `navigator.clipboard` нет без защищённого контекста и может отказать по
      // разрешению. Молчаливый отказ здесь хуже отсутствия кнопки: человек
      // уходит уверенным, что скопировал, и вставляет старое.
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(code)
      setState('copied')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState('idle'), copyResetMs)
  }

  return (
    <div className={['ds-codeblock', className].filter(Boolean).join(' ')} id={id}>
      <pre className={['ds-codeblock__pre', wrap && 'ds-codeblock__pre--wrap'].filter(Boolean).join(' ')} tabIndex={0} role="group" aria-label={label}
        style={maxH ? { maxHeight: maxH, overflowY: 'auto' } : undefined}>
        <code className="ds-codeblock__code">{children ?? code}</code>
      </pre>
      {copyable && (
        <button
          type="button"
          className={['ds-codeblock__copy', state !== 'idle' && `is-${state}`].filter(Boolean).join(' ')}
          onClick={copy}
        >
          <span className="ds-codeblock__copytext">{labels[state]}</span>
          {/* Невидимый распорщик со всеми тремя подписями: кнопка всегда шириной
              с самую длинную из них. Иначе «Копировать» → «Скопировано» на
              нажатии расширяло бы кнопку, область кода сжималась, и текст
              дёргался бы в ответ на действие, которое его не касается.
              Распорщик, а не фиксированная ширина: `copyLabels` задаёт
              потребитель, и любое число в пикселях было бы угадыванием. */}
          <span className="ds-codeblock__copysizer" aria-hidden="true">
            {[labels.idle, labels.copied, labels.failed].map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </span>
        </button>
      )}
    </div>
  )
}
