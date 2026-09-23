/**
 * Тот ли кадр мерился — общий вопрос КАЖДОЙ строки матрицы (DS-177).
 *
 * Пустой кадр не переполнен никогда и не несёт ни одной мелкой цели; кадр чужой
 * темы, не доехавшей шкалы или не того вьюпорта отвечает на другой вопрос. Все
 * четыре исхода — «не измерено», то есть красное, а не зелёный ни о чём. Пока
 * строка была одна, проверка жила в её вердикте; вторая строка её либо
 * скопировала бы (и копии разошлись бы молча — у одной появится пятый исход, у
 * другой нет), либо забыла бы.
 *
 * ДВЕ ПОЛОВИНЫ, и живут они в разных местах по построению. `frameFacts`
 * исполняется В СТРАНИЦЕ: проба строки уходит туда `page.evaluate` целиком и
 * берёт модуль `await import('/frame-facts.ts')` — корень дев-сервера верстака
 * `workbench/`, тот же приём, что у `/culprit-path.ts`. `frameWhy` исполняется в
 * node, в вердикте строки, и берётся оттуда сборкой `loadTs`. Один файл на обе
 * половины — чтобы имена полей, которые одна пишет, а другая читает, не могли
 * разойтись по двум файлам.
 */

export interface FrameFacts {
  /** `data-theme` корня. */
  theme: string | undefined
  /** `--ds-ui-scale` на документе, строкой как есть: пусто — тоже ответ. */
  scale: string
  /** `documentElement.clientWidth` — вьюпорт без вертикальной полосы. */
  clientWidth: number
  /** Почему кадр пуст, либо `null`, если в хосте есть что мерить. */
  empty: string | null
}

export function frameFacts(doc: Document = document): FrameFacts {
  const de = doc.documentElement
  const host = doc.querySelector('.wbf-host')
  return {
    theme: de.dataset.theme,
    scale: doc.defaultView!.getComputedStyle(de).getPropertyValue('--ds-ui-scale').trim(),
    clientWidth: de.clientWidth,
    empty: !host ? 'нет .wbf-host'
      : doc.querySelector('.wbf-empty') ? 'кадр «Фикстуры нет»'
      : doc.querySelector('.wbf-error') ? `фикстура упала: ${doc.querySelector('.wbf-error__text')?.textContent ?? ''}`
      : host.children.length === 0 ? 'хост пуст' : null,
  }
}

/**
 * Причина «не измерено» либо `null`, если кадр тот. Вьюпорт приходит ОТ ХОДОКА
 * (четвёртый аргумент вердикта), а не из констант строки: сверять кадр с чужим
 * числом значило бы объявить «не измерено» на каждой ячейке по неверной причине.
 */
export function frameWhy(f: FrameFacts, scale: number, viewport: { width: number }): string | null {
  if (f.empty) return f.empty
  if (f.theme !== 'light') return `тема кадра ${f.theme}`
  if (Number(f.scale) !== scale) return `шкала на документе ${f.scale || '(пусто)'} вместо ${scale}`
  if (f.clientWidth !== viewport.width) return `clientWidth ${f.clientWidth} вместо ${viewport.width} — мерился не тот вьюпорт`
  return null
}
