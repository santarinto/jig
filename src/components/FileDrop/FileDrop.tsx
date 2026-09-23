import { useId, useRef, useState } from 'react'
import '../../styles/field-frame.css'
import { useDsText } from '../../dictionary/DsText.js'
import './FileDrop.css'
import { useMergedRef } from '../../internal/useMergedRef.js'

/**
 * Нативные атрибуты и `ref` едут на скрытый `<input type="file">` — он и есть
 * поле, зона перетаскивания лишь способ его открыть (DS-108).
 * `files`/`onFiles` свои: значение — список `File`, а не `FileList` события.
 */
type FileDropNative = Omit<
  React.ComponentPropsWithRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'size' | 'children' | 'className'
>

export interface FileDropProps extends FileDropNative {
  files: File[]
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  hint?: string
  disabled?: boolean
  className?: string
  /**
   * Видимая подпись. До DS-109 зона не именовалась НИЧЕМ: ни подписи, ни
   * `aria-label` — диктор объявлял её просто «кнопка». Подпись даёт имя зоне
   * через `aria-labelledby`, а клик по ней открывает диалог выбора, потому что
   * `htmlFor` указывает на настоящий файловый ввод.
   */
  label?: string
}

export function FileDrop({
  files, onFiles, accept, multiple = false, hint, disabled, className, label, id, ref, ...rest
}: FileDropProps) {
  const t = useDsText()
  const inputRef = useRef<HTMLInputElement>(null)
  const autoId = useId()
  const baseId = id ?? autoId
  const inputId = `${baseId}-input`
  // Свой ref открывает диалог, чужой отдаётся потребителю: один и тот же ввод.
  const mergedInputRef = useMergedRef(inputRef, ref)
  const [dragOver, setDragOver] = useState(false)

  const add = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const incoming = Array.from(list)
    onFiles(multiple ? [...files, ...incoming] : [incoming[0]])
  }

  const remove = (idx: number) => onFiles(files.filter((_, i) => i !== idx))

  const openDialog = () => { if (!disabled) inputRef.current?.click() }

  return (
    // Корень остаётся `.ds-filedrop`: класс `.ds-field` тоже объявляет display
    // (`inline-flex` против `flex` здесь), и два одинаковых по весу правила на
    // одном узле сделали бы раскладку зависимой от порядка листов. Обёртка тут
    // и так своя — колонка с зазором; из общей семьи берётся только типографика
    // подписи, `.ds-field__label`.
    <div className={['ds-filedrop', className].filter(Boolean).join(' ')}>
      {/*
        `htmlFor` указывает на файловый ввод: клик по подписи открывает диалог
        выбора — это нативное поведение метки, и оно здесь ровно то, что нужно.
        Имя при этом нужно ЗОНЕ, а не скрытому вводу: работает пользователь с
        ней, поэтому у зоны `aria-labelledby`. Одного `htmlFor` не хватило бы —
        имя досталось бы узлу, которого на экране нет.
      */}
      {label && (
        <label className="ds-field__label" id={`${baseId}-label`} htmlFor={inputId}>{label}</label>
      )}
      <div
        className={['ds-filedrop__zone', dragOver && 'is-dragover', disabled && 'is-disabled'].filter(Boolean).join(' ')}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={label ? `${baseId}-label` : undefined}
        aria-disabled={disabled || undefined}
        onClick={openDialog}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDialog() } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!disabled) add(e.dataTransfer.files) }}
      >
        <svg className="ds-filedrop__icon" width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
        </svg>
        <div className="ds-filedrop__text">
          {t['fileDrop.dropHint']} <span className="ds-filedrop__link">{t['fileDrop.browse']}</span>
        </div>
        {hint && <div className="ds-filedrop__hint">{hint}</div>}
      </div>
      {/* Настоящий `<input type="file">` — СОСЕД зоны, а не её потомок.
          Внутри `role="button"` он был интерактивным элементом внутри
          интерактивного, и безвредным это делало ОДНО правило в чужом файле —
          `.ds-filedrop__input { display: none }`. То есть форма разметки была
          неверной, а спасал её лист: снимут `display: none` при рефакторинге —
          и получится два таб-стопа на одну зону, без единой ошибки.

          Диалог открывает `inputRef.current.click()`, а ему всё равно, где
          лежит узел. Поймано гейтом `no-nested-interactive`, наведённым на
          превью (DS-96): покомпонентные проверки этого шва не касались. */}
      <input
        {...rest}
        id={inputId}
        ref={mergedInputRef} type="file" className="ds-filedrop__input"
        accept={accept} multiple={multiple} disabled={disabled}
        onChange={(e) => { add(e.target.files); e.target.value = '' }}
      />

      {files.length > 0 && (
        <ul className="ds-filedrop__list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="ds-filedrop__item">
              <span className="ds-filedrop__name" title={f.name}>{f.name}</span>
              <span className="ds-filedrop__size">{t['fileDrop.size'](f.size)}</span>
              {/* Зона гасится правильно, а список под ней оставался живым, и
                  именно поэтому дефект здесь был незаметнее всех: компонент
                  выглядел аккуратно выключенным, а «Удалить» выбрасывало файл
                  одним кликом (DS-133). */}
              <button type="button" className="ds-filedrop__remove" aria-label={t['fileDrop.remove'](f.name)}
                disabled={disabled} onClick={() => remove(i)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
