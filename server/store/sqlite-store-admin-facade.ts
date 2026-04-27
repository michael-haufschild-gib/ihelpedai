/**
 * Admin pass-through methods for SqliteStore. Extracted into a base class so
 * sqlite-store.ts stays under the 500-line lint cap; every method here is a
 * one-liner that forwards to the matching helper in sqlite-store-admin or
 * sqlite-store-admin-mutations.
 */
import type { Database as SqliteDatabase } from 'better-sqlite3'

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
import * as adm from './sqlite-store-admin.js'
import * as admx from './sqlite-store-admin-mutations.js'

/** Base class that owns the admin/audit delegations for SqliteStore. */
export class SqliteStoreAdminFacade {
  protected readonly db: SqliteDatabase

  constructor(db: SqliteDatabase) {
    this.db = db
  }

  async insertAdmin(e: string, p: string, c: string | null): Promise<Admin> {
    return adm.insertAdmin(this.db, e, p, c)
  }
  async getAdminByEmail(e: string): Promise<Admin | null> {
    return adm.getAdminByEmail(this.db, e)
  }
  async getAdmin(id: string): Promise<Admin | null> {
    return adm.getAdmin(this.db, id)
  }
  async listAdmins(): Promise<Admin[]> {
    return adm.listAdmins(this.db)
  }
  async updateAdminStatus(id: string, s: 'active' | 'deactivated'): Promise<void> {
    adm.updateAdminStatus(this.db, id, s)
  }
  async updateAdminPassword(id: string, h: string): Promise<void> {
    adm.updateAdminPassword(this.db, id, h)
  }
  async updateAdminPasswordWithAudit(
    id: string,
    h: string,
    a: AdminAuditInput,
    o?: AdminPasswordAuditOptions,
  ): Promise<void> {
    admx.updateAdminPasswordWithAudit(this.db, id, h, a, o)
  }
  async updateAdminLastLogin(id: string): Promise<void> {
    adm.updateAdminLastLogin(this.db, id)
  }
  async insertSession(a: string, e: string): Promise<string> {
    return adm.insertSession(this.db, a, e)
  }
  async getSession(id: string): Promise<AdminSession | null> {
    return adm.getSession(this.db, id)
  }
  async touchSession(id: string, e: string): Promise<void> {
    adm.touchSession(this.db, id, e)
  }
  async deleteSession(id: string): Promise<void> {
    adm.deleteSession(this.db, id)
  }
  async deleteAdminSessions(a: string, except?: string): Promise<void> {
    adm.deleteAdminSessions(this.db, a, except)
  }
  async insertPasswordReset(a: string, t: string, e: string): Promise<string> {
    return adm.insertPasswordReset(this.db, a, t, e)
  }
  async getPasswordResetByHash(t: string): Promise<PasswordReset | null> {
    return adm.getPasswordResetByHash(this.db, t)
  }
  async markPasswordResetUsed(id: string): Promise<void> {
    adm.markPasswordResetUsed(this.db, id)
  }
  async cleanupExpiredAuthState(): Promise<void> {
    adm.cleanupExpiredAuthState(this.db)
  }
  async insertAdminInviteWithAudit(
    e: string,
    p: string,
    c: string | null,
    t: string,
    x: string,
  ): Promise<AdminInviteResult> {
    return admx.insertAdminInviteWithAudit(this.db, e, p, c, t, x)
  }
  async deleteFailedAdminInvite(a: string, r: string): Promise<void> {
    admx.deleteFailedAdminInvite(this.db, a, r)
  }
  async deactivateAdminWithAudit(id: string, a: AdminAuditInput): Promise<void> {
    admx.deactivateAdminWithAudit(this.db, id, a)
  }
  async insertAuditEntry(
    a: string | null,
    ac: string,
    ti: string | null,
    tk: string | null,
    d: string | null,
  ): Promise<void> {
    adm.insertAuditEntry(this.db, a, ac, ti, tk, d)
  }
  async listAuditLog(
    l: number,
    o: number,
    f?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string },
  ): Promise<AuditEntryWithEmail[]> {
    return adm.listAuditLog(this.db, l, o, f)
  }
  async countAuditLog(f?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string }): Promise<number> {
    return adm.countAuditLog(this.db, f)
  }
  async listAuditLogForTarget(t: string): Promise<AuditEntryWithEmail[]> {
    return adm.listAuditLogForTarget(this.db, t)
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
    return adm.listAdminEntries(this.db, l, o, f)
  }
  async countAdminEntries(f?: {
    entryType?: 'post' | 'report'
    status?: EntryStatus
    source?: EntrySource
    query?: string
    dateFrom?: string
    dateTo?: string
  }): Promise<number> {
    return adm.countAdminEntries(this.db, f)
  }
  async getAdminEntryDetail(id: string): Promise<AdminEntryDetail | null> {
    return adm.getAdminEntryDetail(this.db, id)
  }
  async updateEntryStatus(id: string, t: 'post' | 'report', s: EntryStatus): Promise<void> {
    adm.updateEntryStatus(this.db, id, t, s)
  }
  async updateEntryStatusWithAudit(
    id: string,
    t: 'post' | 'report',
    s: EntryStatus,
    a: AdminAuditInput,
  ): Promise<void> {
    admx.updateEntryStatusWithAudit(this.db, id, t, s, a)
  }
  async purgeEntry(id: string, t: 'post' | 'report'): Promise<void> {
    adm.purgeEntry(this.db, id, t)
  }
  async purgeEntryWithAudit(id: string, t: 'post' | 'report', a: AdminAuditInput): Promise<void> {
    admx.purgeEntryWithAudit(this.db, id, t, a)
  }
  async listApiKeys(l: number, o: number, s?: 'active' | 'revoked'): Promise<AdminApiKey[]> {
    return adm.listApiKeysAdmin(this.db, l, o, s)
  }
  async countApiKeys(s?: 'active' | 'revoked'): Promise<number> {
    return adm.countApiKeysAdmin(this.db, s)
  }
  async revokeApiKey(id: string): Promise<void> {
    adm.revokeApiKey(this.db, id)
  }
  async revokeApiKeyWithAudit(id: string, a: AdminAuditInput): Promise<void> {
    admx.revokeApiKeyWithAudit(this.db, id, a)
  }
  async listReportsForApiKey(k: string, l: number, o?: number): Promise<Report[]> {
    return adm.listReportsForApiKey(this.db, k, l, o)
  }
  async countReportsForApiKey(k: string): Promise<number> {
    return adm.countReportsForApiKey(this.db, k)
  }
  async getApiKey(id: string): Promise<AdminApiKey | null> {
    return adm.getApiKeyAdmin(this.db, id)
  }
  async insertTakedown(i: NewTakedown): Promise<Takedown> {
    return adm.insertTakedown(this.db, i)
  }
  async insertTakedownWithAudit(i: NewTakedown, a: AdminAuditInput): Promise<Takedown> {
    return admx.insertTakedownWithAudit(this.db, i, a)
  }
  async listTakedowns(l: number, o: number, s?: TakedownStatus): Promise<Takedown[]> {
    return adm.listTakedowns(this.db, l, o, s)
  }
  async countTakedowns(s?: TakedownStatus): Promise<number> {
    return adm.countTakedowns(this.db, s)
  }
  async getTakedown(id: string): Promise<Takedown | null> {
    return adm.getTakedown(this.db, id)
  }
  async updateTakedown(
    id: string,
    f: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string | null },
  ): Promise<void> {
    adm.updateTakedown(this.db, id, f)
  }
  async updateTakedownWithAudit(
    id: string,
    f: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string | null },
    a: AdminAuditInput,
  ): Promise<void> {
    admx.updateTakedownWithAudit(this.db, id, f, a)
  }
  async getSetting(k: string): Promise<string | null> {
    return adm.getSetting(this.db, k)
  }
  async setSetting(k: string, v: string): Promise<void> {
    adm.setSetting(this.db, k, v)
  }
  async setSettingWithAudit(k: string, v: string, a: AdminAuditInput): Promise<void> {
    admx.setSettingWithAudit(this.db, k, v, a)
  }
  async listSettings(): Promise<AdminSetting[]> {
    return adm.listSettingsAdmin(this.db)
  }
}
