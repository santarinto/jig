/**
 * Accessible name for a chart.
 *
 * The first attempt at this hid an unlabelled chart from assistive tech, on the
 * grounds that an unnamed `role="img"` announces "image" and then has nothing to
 * say. That traded one defect for a worse one: the legend toggles sit outside
 * the plot, so they stayed in the accessibility tree as controls for content
 * that no longer existed there — and a focusable element inside an `aria-hidden`
 * subtree is a violation in its own right.
 *
 * A chart knows what it is showing, so it can name itself. `role="img"` is then
 * always honest and nothing has to be hidden.
 */
export function chartLabel(
  explicit: string | undefined,
  kind: string,
  parts: readonly string[],
): string {
  if (explicit?.trim()) return explicit
  const named = parts.filter((p) => p?.trim())
  return named.length ? `${kind}: ${named.join(', ')}` : kind
}
