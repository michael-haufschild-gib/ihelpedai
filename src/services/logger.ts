/**
 * Minimal browser logger.
 *
 * Severity routing:
 *  - `debug` and `info` are DEV-only — they are silenced in production
 *    builds so an over-eager trace doesn't leak object internals or PII
 *    into a sympathetic user's devtools.
 *  - `warn` and `error` are emitted in EVERY environment, including
 *    production. Browser errors that go nowhere when the page misbehaves
 *    are debugging dead ends; a user-visible console line is the cheapest
 *    "something went wrong here" signal we have without a real telemetry
 *    sink. The cost is small (no PII passes through these in current
 *    callers) and the benefit is being able to talk a user through a
 *    repro using their own devtools.
 *
 * This module is the single allowed entry point for direct `console.*`
 * calls (see the per-file override in `eslint.config.js`). Any other file
 * touching `console.*` is a lint error.
 */

const isDev = import.meta.env?.DEV === true

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args)
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args)
  },
  warn: (...args: unknown[]) => {
    console.warn(...args)
  },
  error: (...args: unknown[]) => {
    console.error(...args)
  },
}
