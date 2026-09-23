/**
 * Подсветка вхождений запроса в тексте.
 *
 * Общий для `LogViewer` и `AgentTranscript`. Копия жила в обоих файлах
 * посимвольно, и в комментарии транскрипта прямо стояло условие выноса —
 * «стоит при втором потребителе». Второй потребитель им же и оказался
 * (DS-112).
 */

/** В логе и репликах полно путей, скобок и точек — запрос ищется буквально, не как регэксп. */
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Режет текст на куски по вхождениям запроса. Пустой запрос отдаёт текст одним
 * куском — разбиение «на всякий случай» плодило бы узлы на каждой строке лога
 * без единой подсветки.
 *
 * `markClass` — единственное, чем копии отличались, и параметром он остаётся
 * НАМЕРЕННО: `.ds-log__hit` и `.ds-transcript__hit` красятся своими листами, и
 * один класс на оба означал бы, что у одного из компонентов подсветка
 * перестала попадать под собственный CSS.
 */
export function highlight(
  text: string,
  query: string | undefined,
  markClass: string,
): React.ReactNode {
  if (!query) return text
  const re = new RegExp(escapeRe(query), 'gi')
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const at = m.index!
    if (at > last) out.push(text.slice(last, at))
    out.push(<mark key={at} className={markClass}>{m[0]}</mark>)
    last = at + m[0].length
  }
  if (out.length === 0) return text
  if (last < text.length) out.push(text.slice(last))
  return out
}
