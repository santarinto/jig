import { useId } from 'react'
import { Search } from '../../icons/glyphs.js'
import '../../styles/field-surface.css'
import '../../styles/field-frame.css'
import '../../styles/button-surface.css'
import { useDsText } from '../../dictionary/DsText.js'
import './SearchBar.css'

/** `ComponentPropsWithRef` ради `ref` — см. `TextFieldProps` (DS-108). */
export interface SearchBarProps extends Omit<React.ComponentPropsWithRef<'input'>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  onSearch?: () => void
  /**
   * Видимая подпись. До DS-109 её не было как пропа вовсе, и поле
   * именовалось только `aria-label` — то есть имя нельзя было ни увидеть, ни
   * оформить. Без подписи компонент остаётся прежним: обёртки нет, именует
   * потребитель через `aria-label`.
   */
  label?: string
}

export function SearchBar({
  value, onChange, onClear, onSearch, placeholder, label, id,
  // `disabled` вынут из `...rest` НАМЕРЕННО: через `...rest` он садится только
  // на `<input>`, а кнопки в той же рамке остаются живыми — и «Очистить» зовёт
  // `onChange('')` у поля, менять которое запрещено (DS-133). Раздаётся
  // руками каждому интерактивному узлу; гейт `field-disabled` за этим следит.
  disabled, ...rest
}: SearchBarProps) {
  const t = useDsText()
  const autoId = useId()
  const inputId = id ?? autoId
  const bar = (
    <div className="ds-searchbar">
      <span className="ds-searchbar__field">
        <input
          id={inputId}
          type="search"
          // `role="searchbox"` снят: у `<input type="search">` роль неявная, и
          // явная её только дублировала. Заодно это было последнее место, где
          // жила роль, отвергнутая в `GlobalSearch`, — там поле управляет
          // списком и роль обязана быть `combobox` (DS-110).
          className="ds-searchbar__input"
          value={value}
          placeholder={placeholder ?? t['searchBar.placeholder']}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
        {value && (
          <button type="button" className="ds-searchbar__clear" aria-label={t['searchBar.clear']} disabled={disabled}
            onClick={() => { onChange(''); onClear?.() }}>×</button>
        )}
      </span>
      <button type="button" className="ds-searchbar__go" aria-label={t['searchBar.submit']} disabled={disabled} onClick={() => onSearch?.()}>
        <Search size={14} aria-hidden="true" />
      </button>
    </div>
  )

  // Обёртка появляется только вместе с подписью: у строки поиска в тулбаре
  // её обычно нет, и лишний `div.ds-field` менял бы раскладку там, где ничего
  // не просили.
  return label
    ? (
      <div className="ds-field">
        <label className="ds-field__label" htmlFor={inputId}>{label}</label>
        {bar}
      </div>
    )
    : bar
}
