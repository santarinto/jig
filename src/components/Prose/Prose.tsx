import { useMemo } from 'react'
import './Prose.css'

export interface ProseProps extends React.ComponentPropsWithRef<'div'> {
  /**
   * Готовый html — например markdown→html, отрендеренный на сервере. Ставится
   * через `dangerouslySetInnerHTML`, поэтому **санитайзить обязан источник**
   * (обычно сам бэкенд). Взаимоисключимо с `children`.
   */
  html?: string
  children?: React.ReactNode
}

/**
 * Типографический контейнер для «текстового тела»: статьи, markdown→html,
 * описания. Стилизует потомков-теги (`h1..h6`, списки, таблицы, `pre/code`,
 * `blockquote`, ссылки) через `--ds-*` токены — одинаково в светлой и тёмной
 * теме. Из коробки `min-width: 0` и ограниченные `pre/code/table`
 * (`overflow-x: auto`), чтобы длинные строки скроллились внутри блока, а не
 * распирали контейнер.
 */
export function Prose({ html, children, className, ...rest }: ProseProps) {
  const cls = ['ds-prose', className].filter(Boolean).join(' ')
  /**
   * ССЫЛКА НА ОБЪЁРТКУ ДЕРЖИТСЯ, А НЕ СОЗДАЁТСЯ ЗАНОВО (DS-147).
   *
   * React сверяет `dangerouslySetInnerHTML` ПО ССЫЛКЕ объекта, а не по строке
   * внутри него. Литерал `{{ __html: html }}` прямо в JSX — новый объект на
   * каждый рендер, то есть `innerHTML` переписывается заново при КАЖДОЙ
   * перерисовке, даже когда html не менялся ни на знак. Всё поддерево при
   * этом уничтожается и создаётся заново.
   *
   * Что от этого ломается у потребителя, а не в теории: выделение текста
   * пропадает на любой соседней перерисовке, горизонтальная прокрутка внутри
   * `pre` прыгает в начало, фокус со ссылки слетает, а всякая ссылка на узел
   * внутри статьи протухает молча. На последнем и поймано: прицел верстака
   * держал ссылку на выбранный `h2`, к моменту замера тот был уже отцеплен от
   * документа, и `getBoundingClientRect()` честно отвечал нулями — рамка
   * рисовалась вырожденной в начале координат.
   *
   * `useMemo` здесь не оптимизация, а условие корректности: он и есть то
   * самое «ссылка не меняется, пока не менялся html».
   */
  const dsi = useMemo(() => (html == null ? null : { __html: html }), [html])
  if (dsi !== null) {
    return <div className={cls} dangerouslySetInnerHTML={dsi} {...rest} />
  }
  return <div className={cls} {...rest}>{children}</div>
}
