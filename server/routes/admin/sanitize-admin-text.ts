import { parseSanitizerExceptionList, sanitize } from '../../sanitizer/sanitize.js'
import type { Store } from '../../store/index.js'

/** Sanitize admin-entered free text before it reaches audit or takedown storage. */
export async function sanitizeAdminFreeText(store: Store, value: string): Promise<string> {
  const extraExceptions = parseSanitizerExceptionList((await store.getSetting('sanitizer_exceptions')) ?? '')
  return sanitize(value, { extraExceptions }).clean
}

/** Sanitize optional admin free text while preserving absent optional fields as null. */
export async function sanitizeOptionalAdminFreeText(store: Store, value: string | undefined): Promise<string | null> {
  return value === undefined ? null : sanitizeAdminFreeText(store, value)
}
