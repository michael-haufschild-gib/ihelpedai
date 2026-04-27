/**
 * Admin pass-through methods + transaction helper for MysqlStore. Extracted
 * into a base class so mysql-store.ts stays under the 500-line lint cap.
 */
import type { Pool, PoolConnection } from 'mysql2/promise'

import type {
  Admin,
  AdminApiKey,
  AdminAuditInput,
  AdminEntry,
  AdminEntryDetail,
  AdminInviteResult,
  AdminPasswordAuditOptions,
  AdminSession,
  AdminSetting,
  AuditEntryWithEmail,
  EntrySource,
  EntryStatus,
  NewTakedown,
  PasswordReset,
  Report,
  Takedown,
  TakedownDisposition,
  TakedownStatus,
} from './index.js'
import * as adm from './mysql-store-admin.js'
import * as admx from './mysql-store-admin-mutations.js'
import * as td from './mysql-store-takedowns.js'

/** Base class that owns the pool, transaction helper, and admin delegations. */
export class MysqlStoreAdminFacade {
  protected readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  /** Expose the pool for the admin delegate (same store, one pool). */
  getPool(): Pool {
    return this.pool
  }

  /** Run `fn` inside a transaction with automatic commit / rollback / release. */
  async tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection()
    try {
      await conn.beginTransaction()
      const out = await fn(conn)
      await conn.commit()
      return out
    } catch (err) {
      try {
        await conn.rollback()
      } catch {
        /* surface original */
      }
      throw err
    } finally {
      conn.release()
    }
  }

  async insertAdmin(e: string, p: string, c: string | null): Promise<Admin> {
    return adm.insertAdmin(this.pool, e, p, c)
  }
  async getAdminByEmail(e: string): Promise<Admin | null> {
    return adm.getAdminByEmail(this.pool, e)
  }
  async getAdmin(id: string): Promise<Admin | null> {
    return adm.getAdmin(this.pool, id)
  }
  async listAdmins(): Promise<Admin[]> {
    return adm.listAdmins(this.pool)
  }
  async updateAdminStatus(id: string, s: 'active' | 'deactivated'): Promise<void> {
    return adm.updateAdminStatus(this.pool, id, s)
  }
  async updateAdminPassword(id: string, h: string): Promise<void> {
    return adm.updateAdminPassword(this.pool, id, h)
  }
  async updateAdminPasswordWithAudit(
    id: string,
    h: string,
    a: AdminAuditInput,
    o?: AdminPasswordAuditOptions,
  ): Promise<void> {
    return admx.updateAdminPasswordWithAudit(this, id, h, a, o)
  }
  async updateAdminLastLogin(id: string): Promise<void> {
    return adm.updateAdminLastLogin(this.pool, id)
  }
  async insertSession(a: string, e: string): Promise<string> {
    return adm.insertSession(this.pool, a, e)
  }
  async getSession(id: string): Promise<AdminSession | null> {
    return adm.getSession(this.pool, id)
  }
  async touchSession(id: string, e: string): Promise<void> {
    return adm.touchSession(this.pool, id, e)
  }
  async deleteSession(id: string): Promise<void> {
    return adm.deleteSession(this.pool, id)
  }
  async deleteAdminSessions(a: string, except?: string): Promise<void> {
    return adm.deleteAdminSessions(this.pool, a, except)
  }
  async insertPasswordReset(a: string, t: string, e: string): Promise<string> {
    return adm.insertPasswordReset(this.pool, a, t, e)
  }
  async getPasswordResetByHash(t: string): Promise<PasswordReset | null> {
    return adm.getPasswordResetByHash(this.pool, t)
  }
  async markPasswordResetUsed(id: string): Promise<void> {
    return adm.markPasswordResetUsed(this.pool, id)
  }
  async cleanupExpiredAuthState(): Promise<void> {
    return adm.cleanupExpiredAuthState(this.pool)
  }
  async insertAdminInviteWithAudit(
    e: string,
    p: string,
    c: string | null,
    t: string,
    x: string,
  ): Promise<AdminInviteResult> {
    return admx.insertAdminInviteWithAudit(this, e, p, c, t, x)
  }
  async deleteFailedAdminInvite(a: string, r: string): Promise<void> {
    return admx.deleteFailedAdminInvite(this, a, r)
  }
  async deactivateAdminWithAudit(id: string, a: AdminAuditInput): Promise<void> {
    return admx.deactivateAdminWithAudit(this, id, a)
  }
  async insertAuditEntry(
    a: string | null,
    ac: string,
    ti: string | null,
    tk: string | null,
    d: string | null,
  ): Promise<void> {
    return adm.insertAuditEntry(this.pool, a, ac, ti, tk, d)
  }
  async listAuditLog(
    l: number,
    o: number,
    f?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string },
  ): Promise<AuditEntryWithEmail[]> {
    return adm.listAuditLog(this.pool, l, o, f)
  }
  async countAuditLog(f?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string }): Promise<number> {
    return adm.countAuditLog(this.pool, f)
  }
  async listAuditLogForTarget(t: string): Promise<AuditEntryWithEmail[]> {
    return adm.listAuditLogForTarget(this.pool, t)
  }
  async listAdminEntries(
    l: number,
    o: number,
    f?: {
      entryType?: 'post' | 'report'
      status?: EntryStatus
      source?: EntrySource
      query?: string
      dateFrom?: string
      dateTo?: string
      sort?: 'asc' | 'desc'
    },
  ): Promise<AdminEntry[]> {
    return adm.listAdminEntries(this.pool, l, o, f)
  }
  async countAdminEntries(f?: {
    entryType?: 'post' | 'report'
    status?: EntryStatus
    source?: EntrySource
    query?: string
    dateFrom?: string
    dateTo?: string
  }): Promise<number> {
    return adm.countAdminEntries(this.pool, f)
  }
  async getAdminEntryDetail(id: string): Promise<AdminEntryDetail | null> {
    return adm.getAdminEntryDetail(this.pool, id)
  }
  async updateEntryStatus(id: string, t: 'post' | 'report', s: EntryStatus): Promise<void> {
    return adm.updateEntryStatus(this.pool, id, t, s)
  }
  async updateEntryStatusWithAudit(
    id: string,
    t: 'post' | 'report',
    s: EntryStatus,
    a: AdminAuditInput,
  ): Promise<void> {
    return admx.updateEntryStatusWithAudit(this, id, t, s, a)
  }
  async purgeEntry(id: string, t: 'post' | 'report'): Promise<void> {
    return adm.purgeEntry(this, id, t)
  }
  async purgeEntryWithAudit(id: string, t: 'post' | 'report', a: AdminAuditInput): Promise<void> {
    return admx.purgeEntryWithAudit(this, id, t, a)
  }
  async listApiKeys(l: number, o: number, s?: 'active' | 'revoked'): Promise<AdminApiKey[]> {
    return adm.listApiKeysAdmin(this.pool, l, o, s)
  }
  async countApiKeys(s?: 'active' | 'revoked'): Promise<number> {
    return adm.countApiKeysAdmin(this.pool, s)
  }
  async revokeApiKey(id: string): Promise<void> {
    return adm.revokeApiKey(this.pool, id)
  }
  async revokeApiKeyWithAudit(id: string, a: AdminAuditInput): Promise<void> {
    return admx.revokeApiKeyWithAudit(this, id, a)
  }
  async listReportsForApiKey(k: string, l: number, o?: number): Promise<Report[]> {
    return adm.listReportsForApiKey(this.pool, k, l, o)
  }
  async countReportsForApiKey(k: string): Promise<number> {
    return adm.countReportsForApiKey(this.pool, k)
  }
  async getApiKey(id: string): Promise<AdminApiKey | null> {
    return adm.getApiKeyAdmin(this.pool, id)
  }
  async insertTakedown(i: NewTakedown): Promise<Takedown> {
    return td.insertTakedown(this.pool, i)
  }
  async insertTakedownWithAudit(i: NewTakedown, a: AdminAuditInput): Promise<Takedown> {
    return admx.insertTakedownWithAudit(this, i, a)
  }
  async listTakedowns(l: number, o: number, s?: TakedownStatus): Promise<Takedown[]> {
    return td.listTakedowns(this.pool, l, o, s)
  }
  async countTakedowns(s?: TakedownStatus): Promise<number> {
    return td.countTakedowns(this.pool, s)
  }
  async getTakedown(id: string): Promise<Takedown | null> {
    return td.getTakedown(this.pool, id)
  }
  async updateTakedown(
    id: string,
    f: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string | null },
  ): Promise<void> {
    return td.updateTakedown(this.pool, id, f)
  }
  async updateTakedownWithAudit(
    id: string,
    f: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string | null },
    a: AdminAuditInput,
  ): Promise<void> {
    return admx.updateTakedownWithAudit(this, id, f, a)
  }
  async getSetting(k: string): Promise<string | null> {
    return td.getSetting(this.pool, k)
  }
  async setSetting(k: string, v: string): Promise<void> {
    return td.setSetting(this.pool, k, v)
  }
  async setSettingWithAudit(k: string, v: string, a: AdminAuditInput): Promise<void> {
    return admx.setSettingWithAudit(this, k, v, a)
  }
  async listSettings(): Promise<AdminSetting[]> {
    return td.listSettingsAdmin(this.pool)
  }
}
