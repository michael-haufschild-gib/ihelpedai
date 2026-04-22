/**
 * Takedown + admin-settings storage for MySQL, split out from
 * mysql-store-admin.ts to keep both files under the 500-line lint cap.
 */
import { customAlphabet } from 'nanoid'
import type { Pool, RowDataPacket } from 'mysql2/promise'

import type {
  AdminSetting,
  NewTakedown,
  Takedown,
  TakedownDisposition,
  TakedownStatus,
} from './index.js'

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const newId = customAlphabet(ID_ALPHABET, 10)
const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString())

type TakedownRow = RowDataPacket & {
  id: string; requester_email: string | null; entry_id: string | null
  entry_kind: string | null; reason: string; notes: string; status: string
  disposition: string | null; closed_by: string | null; date_received: Date
  created_at: Date; updated_at: Date
}
type SettingRow = RowDataPacket & { key: string; value: string; updated_at: Date }

const takedownFromRow = (r: TakedownRow): Takedown => ({
  id: r.id, requesterEmail: r.requester_email, entryId: r.entry_id,
  entryKind: r.entry_kind, reason: r.reason, notes: r.notes,
  status: r.status as Takedown['status'], disposition: r.disposition as Takedown['disposition'],
  closedBy: r.closed_by, dateReceived: iso(r.date_received)!,
  createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
})

/** Insert a takedown. */
export async function insertTakedown(pool: Pool, input: NewTakedown): Promise<Takedown> {
  const id = newId()
  await pool.execute(
    'INSERT INTO takedowns (id, requester_email, entry_id, entry_kind, reason, date_received) VALUES (?, ?, ?, ?, ?, ?)',
    [id, input.requesterEmail, input.entryId, input.entryKind, input.reason, input.dateReceived],
  )
  const t = await getTakedown(pool, id)
  if (t === null) throw new Error('insertTakedown: round-trip read returned null')
  return t
}

/** List takedowns. */
export async function listTakedowns(pool: Pool, limit: number, offset: number, statusFilter?: TakedownStatus): Promise<Takedown[]> {
  const hasFilter = statusFilter !== undefined
  const sql = hasFilter
    ? 'SELECT * FROM takedowns WHERE status = ? ORDER BY date_received DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM takedowns ORDER BY date_received DESC LIMIT ? OFFSET ?'
  const params: (string | number)[] = hasFilter ? [statusFilter, limit, offset] : [limit, offset]
  const [rows] = await pool.query<TakedownRow[]>(sql, params)
  return rows.map(takedownFromRow)
}

/** Count takedowns. */
export async function countTakedowns(pool: Pool, statusFilter?: TakedownStatus): Promise<number> {
  const sql = statusFilter !== undefined
    ? 'SELECT COUNT(*) AS n FROM takedowns WHERE status = ?'
    : 'SELECT COUNT(*) AS n FROM takedowns'
  const [rows] = await pool.query<RowDataPacket[]>(sql, statusFilter !== undefined ? [statusFilter] : [])
  return (rows[0] as { n: number }).n
}

/** Get a single takedown. */
export async function getTakedown(pool: Pool, id: string): Promise<Takedown | null> {
  const [rows] = await pool.query<TakedownRow[]>('SELECT * FROM takedowns WHERE id = ?', [id])
  return rows[0] !== undefined ? takedownFromRow(rows[0]) : null
}

/** Update takedown fields. */
export async function updateTakedown(
  pool: Pool, id: string,
  fields: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string | null },
): Promise<void> {
  const sets: string[] = ['updated_at = UTC_TIMESTAMP(3)']
  const params: (string | number | null)[] = []
  if (fields.status !== undefined) { sets.push('status = ?'); params.push(fields.status) }
  if (fields.disposition !== undefined) { sets.push('disposition = ?'); params.push(fields.disposition) }
  if (fields.notes !== undefined) { sets.push('notes = ?'); params.push(fields.notes) }
  if (fields.closedBy !== undefined) { sets.push('closed_by = ?'); params.push(fields.closedBy) }
  params.push(id)
  await pool.execute(`UPDATE takedowns SET ${sets.join(', ')} WHERE id = ?`, params)
}

/** Get a setting value. */
export async function getSetting(pool: Pool, key: string): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT value FROM admin_settings WHERE `key` = ?', [key])
  return (rows[0] as { value: string } | undefined)?.value ?? null
}

/** Set a setting value (upsert). */
export async function setSetting(pool: Pool, key: string, value: string): Promise<void> {
  await pool.execute(
    'INSERT INTO admin_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP(3)',
    [key, value],
  )
}

/** List all settings. */
export async function listSettingsAdmin(pool: Pool): Promise<AdminSetting[]> {
  const [rows] = await pool.query<SettingRow[]>('SELECT * FROM admin_settings ORDER BY `key`')
  return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: iso(r.updated_at)! }))
}
