/**
 * Map a 1–10 severity score to a single cross-theme colour hex.
 *
 * Pure helper kept out of {@link SeverityChip} so the chip file stays
 * component-only — required by eslint's `react-refresh/only-export-components`
 * rule which forbids mixed exports in modules that render components.
 */
export function severityColor(n: number): string {
  if (n <= 2) return '#e6dfc2'
  if (n <= 4) return '#f3c242'
  if (n <= 6) return '#e86a1e'
  if (n <= 8) return '#c9541a'
  return '#8a1e0b'
}
