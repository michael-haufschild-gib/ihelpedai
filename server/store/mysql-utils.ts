/**
 * Shared low-level helpers used by every MysqlStore module
 * (mysql-store, mysql-store-admin, mysql-store-takedowns). Extracted so the
 * nanoid alphabet and UTC formatters live in one place instead of three.
 */
import { customAlphabet } from 'nanoid'

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** 10-char URL-safe id matching the sqlite-store alphabet. */
export const newId = customAlphabet(ID_ALPHABET, 10)

/** UTC ISO-8601 string with ms precision ("…Z"), matching SqliteStore output. */
export function iso(d: Date): string
export function iso(d: null): null
export function iso(d: Date | null): string | null
export function iso(d: Date | null): string | null {
  return d === null ? null : d.toISOString()
}

/**
 * Render a DATE column (midnight-UTC Date object) as `YYYY-MM-DD`.
 * mysql2 returns DATE columns as Date at midnight UTC, so `toISOString()`
 * would emit `YYYY-MM-DDT00:00:00.000Z` and drift from SqliteStore's bare
 * date string. Slicing to the first 10 characters keeps both backends
 * returning the same shape for action_date / date_received.
 */
export function isoDate(d: Date): string
export function isoDate(d: null): null
export function isoDate(d: Date | null): string | null
export function isoDate(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10)
}
