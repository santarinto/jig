/**
 * Читаемый путь до узла (DS-177), общий для строк матрицы.
 *
 * Не `dom-path.ts`: тот адресует узел ИНДЕКСАМИ (`number[]`) для прицела на
 * канвасе — машине это адрес, человеку нет. Здесь адрес для человека, который
 * пойдёт искать узел глазами в кадре: `div.ds-tabs > div.ds-tabs__slot > button`.
 *
 * Класс выбирается `ds-*`, а не первый попавшийся: у компонента системы он и
 * есть имя, а первым в списке может стоять служебный (`is-open`, утилита
 * потребителя).
 */
export function readablePath(el: Element, stopAt: Element | null): string {
  const seg = (n: Element): string => {
    const cls = [...n.classList].find((k) => k.startsWith('ds-')) ?? [...n.classList][0]
    return n.tagName.toLowerCase() + (cls ? `.${cls}` : '')
  }
  const parts: string[] = []
  for (let n: Element | null = el; n && n !== stopAt && n !== el.ownerDocument.body; n = n.parentElement) {
    parts.unshift(seg(n))
  }
  return parts.join(' > ')
}
