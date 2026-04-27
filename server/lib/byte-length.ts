/**
 * Return the UTF-8 byte length of `s`. Used to enforce password caps that
 * match bcrypt's actual input window (72 bytes), independent of how many
 * JavaScript code units the string occupies. JS `.length` counts UTF-16
 * code units, which can be smaller (a single grapheme of `\u{1F600}` is 2
 * code units but 4 UTF-8 bytes) or larger (combining marks) than the
 * encoded byte width.
 *
 * Pure function, no allocations beyond the temporary Buffer view; safe to
 * call inside hot Zod refinements.
 */
export function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8')
}
