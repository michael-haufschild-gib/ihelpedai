/**
 * Map a 1–10 severity score to a semantic CSS custom property reference.
 *
 * The returned value is a `var(--color-severity-*)` string that can be
 * consumed inline (`style={{ backgroundColor: severityColor(...) }}`) so the
 * browser resolves the palette at paint time from {@link ../index.css}. Pure
 * helper — kept out of {@link ./SeverityChip} so the chip module stays
 * component-only (react-refresh/only-export-components).
 */
export function severityColor(n: number): string {
  if (n <= 2) return 'var(--color-severity-mild)'
  if (n <= 4) return 'var(--color-severity-low)'
  if (n <= 6) return 'var(--color-severity-medium)'
  if (n <= 8) return 'var(--color-severity-high)'
  return 'var(--color-severity-critical)'
}
