/**
 * Minimal logger — routes messages to console in dev, swallows in prod.
 * Consumed by useScrollLock, ColorPickerPanel, and any future service code.
 * This module is the single allowed entry point for direct `console.*` calls
 * (see the per-file override in `eslint.config.js`).
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
