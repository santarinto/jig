import { CodeBlock } from '@santarinto/jig'

/** Одна команда CLI: прокрутка вбок, копирование, без подсветки. */
export const Default = () => (
  <div style={{ width: 520 }}>
    <CodeBlock code={'php bin/console app:tracker:task:add portal "Проверить отчёт" --priority=high'} />
  </div>
)

/** Без кнопки — когда копировать нечего или нельзя. */
export const NotCopyable = () => (
  <div style={{ width: 520 }}>
    <CodeBlock code="npm run build" copyable={false} />
  </div>
)
