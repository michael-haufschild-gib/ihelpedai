/**
 * Escape SQL `LIKE` wildcards in a user-supplied substring so it matches
 * literally. Without this, a search for `foo_bar` would false-positive on
 * `fooXbar` because LIKE treats `_` as "any single character". Call sites
 * must pair the escaped pattern with `ESCAPE '\'` on the LIKE clause; both
 * SQLite and MySQL accept that form.
 *
 * Backslash is escaped first so its doubling does not re-consume the
 * wildcards escaped after it.
 */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&')
}

/** Wrap an escaped substring in `%…%` to build a LIKE contains-pattern. */
export function buildContainsLikePattern(raw: string): string {
  return `%${escapeLikePattern(raw)}%`
}
