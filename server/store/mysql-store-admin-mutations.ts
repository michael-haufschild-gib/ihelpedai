/**
 * Atomic MySQL admin mutations that pair state changes with audit rows.
 */
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'

import type {
  Admin,
  AdminAuditInput,
  AdminInviteResult,
  AdminPasswordAuditOptions,
  EntryStatus,
  NewTakedown,
  Takedown,
  TakedownDisposition,
  TakedownStatus,
} from './index.js'
import type { MysqlStore } from './mysql-store.js'
import { iso, isoDate, newId } from './mysql-utils.js'
import { takedownEntryKindFromDb } from './takedown-entry-kind.js'

type AdminRow = RowDataPacket & {
  id: string
  email: string
  password_hash: string
  status: string
  created_by: string | null
  last_login_at: Date | null
  created_at: Date
}

type TakedownRow = RowDataPacket & {
  id: string
  requester_email: string | null
  entry_id: string | null
  entry_kind: string | null
  reason: string
  notes: string
  status: string
  disposition: string | null
  closed_by: string | null
  date_received: Date
  created_at: Date
  updated_at: Date
}

const adminFromRow = (r: AdminRow): Admin => ({
  id: r.id,
  email: r.email,
  passwordHash: r.password_hash,
  status: r.status as Admin['status'],
  createdBy: r.created_by,
  lastLoginAt: iso(r.last_login_at),
  createdAt: iso(r.created_at),
})

const takedownFromRow = (r: TakedownRow): Takedown => ({
  id: r.id,
  requesterEmail: r.requester_email,
  entryId: r.entry_id,
  entryKind: takedownEntryKindFromDb(r.entry_kind),
  reason: r.reason,
  notes: r.notes,
  status: r.status as Takedown['status'],
  disposition: r.disposition as Takedown['disposition'],
  closedBy: r.closed_by,
  dateReceived: isoDate(r.date_received),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
})

const requiredRow = <T>(rows: readonly T[], context: string): T => {
  const row = rows[0]
  if (row === undefined) throw new Error(`${context}: selected row not found`)
  return row
}

/** Create invited admin, audit row, and reset token in one transaction. */
export async function insertAdminInviteWithAudit(
  store: MysqlStore,
  email: string,
  passwordHash: string,
  createdBy: string | null,
  tokenHash: string,
  expiresAt: string,
): Promise<AdminInviteResult> {
  return store.tx(async (conn) => {
    const adminId = newId()
    await conn.execute(
      `INSERT INTO admins (id, email, password_hash, status, created_by) VALUES (?, ?, ?, 'active', ?)`,
      [adminId, email.toLowerCase(), passwordHash, createdBy],
    )
    await insertAudit(conn, {
      adminId: createdBy,
      action: 'create_admin',
      targetId: adminId,
      targetKind: 'admin',
      details: null,
    })
    const resetId = newId()
    await conn.execute('INSERT INTO password_resets (id, admin_id, token_hash, expires_at) VALUES (?, ?, ?, ?)', [
      resetId,
      adminId,
      tokenHash,
      expiresAt,
    ])
    const [rows] = await conn.query<AdminRow[]>('SELECT * FROM admins WHERE id = ?', [adminId])
    return { admin: adminFromRow(requiredRow(rows, 'insertAdminInviteWithAudit')), resetId }
  })
}

/** Remove every row created for an invite that failed before email delivery. */
export async function deleteFailedAdminInvite(store: MysqlStore, adminId: string, resetId: string): Promise<void> {
  await store.tx(async (conn) => {
    await conn.execute('DELETE FROM password_resets WHERE id = ? AND admin_id = ?', [resetId, adminId])
    await conn.execute(
      `DELETE FROM audit_log
       WHERE target_id = ? AND target_kind = 'admin' AND action = 'create_admin'`,
      [adminId],
    )
    await conn.execute('DELETE FROM admins WHERE id = ?', [adminId])
  })
}

/** Deactivate an admin, clear sessions, and audit atomically. */
export async function deactivateAdminWithAudit(store: MysqlStore, id: string, audit: AdminAuditInput): Promise<void> {
  await store.tx(async (conn) => {
    await conn.execute(`UPDATE admins SET status = 'deactivated' WHERE id = ?`, [id])
    await conn.execute('DELETE FROM admin_sessions WHERE admin_id = ?', [id])
    await insertAudit(conn, audit)
  })
}

/** Update password, clear auth state, and audit atomically. */
export async function updateAdminPasswordWithAudit(
  store: MysqlStore,
  id: string,
  passwordHash: string,
  audit: AdminAuditInput,
  opts: AdminPasswordAuditOptions = {},
): Promise<void> {
  await store.tx(async (conn) => {
    await conn.execute('UPDATE admins SET password_hash = ? WHERE id = ?', [passwordHash, id])
    if (opts.resetId !== undefined) {
      await conn.execute('UPDATE password_resets SET used = 1 WHERE id = ?', [opts.resetId])
    }
    if (opts.exceptSessionId !== undefined) {
      await conn.execute('DELETE FROM admin_sessions WHERE admin_id = ? AND id != ?', [id, opts.exceptSessionId])
    } else {
      await conn.execute('DELETE FROM admin_sessions WHERE admin_id = ?', [id])
    }
    await insertAudit(conn, audit)
  })
}

/** Update entry status and audit atomically. */
export async function updateEntryStatusWithAudit(
  store: MysqlStore,
  id: string,
  entryType: 'post' | 'report',
  status: EntryStatus,
  audit: AdminAuditInput,
): Promise<void> {
  const table = entryType === 'post' ? 'posts' : 'reports'
  await store.tx(async (conn) => {
    await conn.execute(`UPDATE ${table} SET status = ? WHERE id = ?`, [status, id])
    await insertAudit(conn, audit)
  })
}

/** Purge an entry and audit atomically. */
export async function purgeEntryWithAudit(
  store: MysqlStore,
  id: string,
  entryType: 'post' | 'report',
  audit: AdminAuditInput,
): Promise<void> {
  const table = entryType === 'post' ? 'posts' : 'reports'
  await store.tx(async (conn) => {
    await conn.execute('DELETE FROM votes WHERE entry_id = ? AND entry_kind = ?', [id, entryType])
    await conn.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
    await insertAudit(conn, audit)
  })
}

/** Revoke an API key and audit atomically. */
export async function revokeApiKeyWithAudit(store: MysqlStore, id: string, audit: AdminAuditInput): Promise<void> {
  await store.tx(async (conn) => {
    await conn.execute(`UPDATE agent_keys SET status = 'revoked' WHERE id = ?`, [id])
    await insertAudit(conn, audit)
  })
}

/** Insert a takedown and audit atomically. */
export async function insertTakedownWithAudit(
  store: MysqlStore,
  input: NewTakedown,
  audit: AdminAuditInput,
): Promise<Takedown> {
  return store.tx(async (conn) => {
    const id = newId()
    await conn.execute(
      'INSERT INTO takedowns (id, requester_email, entry_id, entry_kind, reason, date_received) VALUES (?, ?, ?, ?, ?, ?)',
      [id, input.requesterEmail, input.entryId, input.entryKind, input.reason, input.dateReceived],
    )
    await insertAudit(conn, { ...audit, targetId: id })
    const [rows] = await conn.query<TakedownRow[]>('SELECT * FROM takedowns WHERE id = ?', [id])
    return takedownFromRow(requiredRow(rows, 'insertTakedownWithAudit'))
  })
}

/** Update a takedown and audit atomically. */
export async function updateTakedownWithAudit(
  store: MysqlStore,
  id: string,
  fields: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string | null },
  audit: AdminAuditInput,
): Promise<void> {
  await store.tx(async (conn) => {
    const sets: string[] = ['updated_at = UTC_TIMESTAMP(3)']
    const params: (string | number | null)[] = []
    if (fields.status !== undefined) {
      sets.push('status = ?')
      params.push(fields.status)
    }
    if (fields.disposition !== undefined) {
      sets.push('disposition = ?')
      params.push(fields.disposition)
    }
    if (fields.notes !== undefined) {
      sets.push('notes = ?')
      params.push(fields.notes)
    }
    if (fields.closedBy !== undefined) {
      sets.push('closed_by = ?')
      params.push(fields.closedBy)
    }
    params.push(id)
    await conn.execute(`UPDATE takedowns SET ${sets.join(', ')} WHERE id = ?`, params)
    await insertAudit(conn, audit)
  })
}

/** Upsert a setting and audit atomically. */
export async function setSettingWithAudit(
  store: MysqlStore,
  key: string,
  value: string,
  audit: AdminAuditInput,
): Promise<void> {
  await store.tx(async (conn) => {
    await conn.execute(
      'INSERT INTO admin_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP(3)',
      [key, value],
    )
    await insertAudit(conn, audit)
  })
}

async function insertAudit(conn: PoolConnection, audit: AdminAuditInput): Promise<void> {
  await conn.execute(
    'INSERT INTO audit_log (id, admin_id, action, target_id, target_kind, details) VALUES (?, ?, ?, ?, ?, ?)',
    [newId(), audit.adminId, audit.action, audit.targetId, audit.targetKind, audit.details],
  )
}
