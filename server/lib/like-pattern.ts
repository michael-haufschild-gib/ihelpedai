/**
 * Escape SQL `LIKE` wildcards in a user-supplied substring so it matches
 * literally. Without this, a search for `foo_bar` would false-positive on
 * `fooXbar` because LIKE treats `_` as "any single character". Call sites
 * must pair the escaped pattern with `ESCAPE '\'` on the LIKE clause; both
 * SQLite and MySQL accept that form.
 *
 * Backslash is escaped first so its doubling does not re-consume the
 * wildcards escaped after it.
 *
 * **Length contract.** This helper does NOT cap input length; callers
 * must do that at the request layer. Every public list endpoint caps
 * `q` at 200 characters via Zod (`server/routes/helped.ts`,
 * `server/routes/reports.ts`, `server/routes/admin/entries.ts`). With
 * a 200-char ceiling the post-escape worst case is ~3× the input
 * (every byte is a backslash + every other byte is `%`/`_`), bounding
 * the SQL parameter at roughly 600 bytes — comfortably under the
 * per-statement parameter size limits on both backends. Raise the
 * input cap with care: SQLite's default `SQLITE_MAX_LENGTH` is 1 GB
 * but the LIKE matcher's worst case is `O(n*m)`, so a cap above ~3 KB
 * on a 100 K-row table flips the query plan toward a sequential scan.
 */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&')
}

/** Wrap an escaped substring in `%…%` to build a LIKE contains-pattern. */
export function buildContainsLikePattern(raw: string): string {
  return `%${escapeLikePattern(raw)}%`
}
