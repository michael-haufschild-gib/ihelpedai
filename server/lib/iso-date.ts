/**
 * Strict ISO 8601 date-only validator used by every zod schema that
 * accepts a YYYY-MM-DD string. A plain `/^\d{4}-\d{2}-\d{2}$/` regex
 * accepts nonsense like `2026-13-40` — this round-trips through the
 * Date constructor so calendar-invalid inputs are rejected.
 *
 * Pure function: no I/O, no Date.now() — safe to call from hot-path
 * request handlers.
 */
export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return false
  const [, y, m, d] = match
  const date = new Date(`${value}T00:00:00Z`)
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() + 1 === Number(m) &&
    date.getUTCDate() === Number(d)
  )
}
