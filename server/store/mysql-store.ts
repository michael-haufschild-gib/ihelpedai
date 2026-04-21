import type {
  Admin,
  AdminApiKey,
  AdminEntry,
  AdminEntryDetail,
  AdminSession,
  AdminSetting,
  AuditEntryWithEmail,
  ApiKey,
  CountableTable,
  EntrySource,
  EntryStatus,
  NewApiKey,
  NewPost,
  NewReport,
  NewTakedown,
  PasswordReset,
  Post,
  Report,
  ReportSourceFilter,
  Store,
  Takedown,
  TakedownDisposition,
  TakedownStatus,
  VoteKind,
  VoteToggleResult,
} from './index.js'

const NOT_IMPL = (method: string): never => {
  throw new Error(`MysqlStore.${method} not yet implemented`)
}

/**
 * Production Store backed by MySQL (mysql2/promise).
 * Round 1A ships a constructor-only stub so prod config selection can
 * resolve the class without a crash; concrete methods are filled in
 * alongside the production deploy work.
 */
export class MysqlStore implements Store {
  private readonly url: string

  constructor(url: string) {
    if (url === '') throw new Error('MysqlStore: MYSQL_URL is required')
    this.url = url
    throw new Error(
      'STORE=mysql is not yet implemented in this build. Use STORE=sqlite until the MySQL backend ships.',
    )
  }

  /** Exposed for later rounds to build the mysql2 pool. */
  getUrl(): string {
    return this.url
  }

  async insertPost(_input: NewPost): Promise<Post> {
    return NOT_IMPL('insertPost')
  }

  async insertReport(_input: NewReport): Promise<Report> {
    return NOT_IMPL('insertReport')
  }

  async getPost(_id: string): Promise<Post | null> {
    return NOT_IMPL('getPost')
  }

  async getReport(_id: string): Promise<Report | null> {
    return NOT_IMPL('getReport')
  }

  async listPosts(_limit: number, _offset: number, _query?: string): Promise<Post[]> {
    return NOT_IMPL('listPosts')
  }

  async listReports(
    _limit: number,
    _offset: number,
    _query?: string,
    _sourceFilter?: ReportSourceFilter,
  ): Promise<Report[]> {
    return NOT_IMPL('listReports')
  }

  async listAgentReports(_limit: number, _offset: number): Promise<Report[]> {
    return NOT_IMPL('listAgentReports')
  }

  async insertApiKey(_input: NewApiKey): Promise<ApiKey> {
    return NOT_IMPL('insertApiKey')
  }

  async getApiKeyByHash(_keyHash: string): Promise<ApiKey | null> {
    return NOT_IMPL('getApiKeyByHash')
  }

  async incrementApiKeyUsage(_keyHash: string): Promise<void> {
    return NOT_IMPL('incrementApiKeyUsage')
  }

  async insertAgentReport(_input: NewReport, _keyHash: string, _initialStatus?: EntryStatus): Promise<Report> {
    return NOT_IMPL('insertAgentReport')
  }

  async countEntries(_table: CountableTable, _status?: EntryStatus): Promise<number> {
    return NOT_IMPL('countEntries')
  }

  async countFilteredEntries(
    _table: 'posts' | 'reports',
    _opts?: { query?: string; source?: ReportSourceFilter; status?: EntryStatus },
  ): Promise<number> {
    return NOT_IMPL('countFilteredEntries')
  }

  async toggleVote(
    _entryId: string,
    _entryKind: VoteKind,
    _ipHash: string,
  ): Promise<VoteToggleResult | null> {
    return NOT_IMPL('toggleVote')
  }

  async getVotedEntryIds(
    _ipHash: string,
    _entryKind: VoteKind,
    _entryIds: readonly string[],
  ): Promise<readonly string[]> {
    return NOT_IMPL('getVotedEntryIds')
  }

  async insertAdmin(_e: string, _p: string, _c: string | null): Promise<Admin> { return NOT_IMPL('insertAdmin') }
  async getAdminByEmail(_e: string): Promise<Admin | null> { return NOT_IMPL('getAdminByEmail') }
  async getAdmin(_id: string): Promise<Admin | null> { return NOT_IMPL('getAdmin') }
  async listAdmins(): Promise<Admin[]> { return NOT_IMPL('listAdmins') }
  async updateAdminStatus(_id: string, _s: 'active' | 'deactivated'): Promise<void> { return NOT_IMPL('updateAdminStatus') }
  async updateAdminPassword(_id: string, _h: string): Promise<void> { return NOT_IMPL('updateAdminPassword') }
  async updateAdminLastLogin(_id: string): Promise<void> { return NOT_IMPL('updateAdminLastLogin') }
  async insertSession(_a: string, _e: string): Promise<string> { return NOT_IMPL('insertSession') }
  async getSession(_id: string): Promise<AdminSession | null> { return NOT_IMPL('getSession') }
  async touchSession(_id: string, _e: string): Promise<void> { return NOT_IMPL('touchSession') }
  async deleteSession(_id: string): Promise<void> { return NOT_IMPL('deleteSession') }
  async deleteAdminSessions(_a: string): Promise<void> { return NOT_IMPL('deleteAdminSessions') }
  async insertPasswordReset(_a: string, _t: string, _e: string): Promise<string> { return NOT_IMPL('insertPasswordReset') }
  async getPasswordResetByHash(_t: string): Promise<PasswordReset | null> { return NOT_IMPL('getPasswordResetByHash') }
  async markPasswordResetUsed(_id: string): Promise<void> { return NOT_IMPL('markPasswordResetUsed') }
  async insertAuditEntry(_a: string | null, _ac: string, _ti: string | null, _tk: string | null, _d: string | null): Promise<void> { return NOT_IMPL('insertAuditEntry') }
  async listAuditLog(_l: number, _o: number, _f?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string }): Promise<AuditEntryWithEmail[]> { return NOT_IMPL('listAuditLog') }
  async countAuditLog(_f?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string }): Promise<number> { return NOT_IMPL('countAuditLog') }
  async listAuditLogForTarget(_t: string): Promise<AuditEntryWithEmail[]> { return NOT_IMPL('listAuditLogForTarget') }
  async listAdminEntries(_l: number, _o: number, _f?: { entryType?: 'post' | 'report'; status?: EntryStatus; source?: EntrySource; query?: string; dateFrom?: string; dateTo?: string; sort?: 'asc' | 'desc' }): Promise<AdminEntry[]> { return NOT_IMPL('listAdminEntries') }
  async countAdminEntries(_f?: { entryType?: 'post' | 'report'; status?: EntryStatus; source?: EntrySource; query?: string; dateFrom?: string; dateTo?: string }): Promise<number> { return NOT_IMPL('countAdminEntries') }
  async getAdminEntryDetail(_id: string): Promise<AdminEntryDetail | null> { return NOT_IMPL('getAdminEntryDetail') }
  async updateEntryStatus(_id: string, _t: 'post' | 'report', _s: EntryStatus): Promise<void> { return NOT_IMPL('updateEntryStatus') }
  async purgeEntry(_id: string, _t: 'post' | 'report'): Promise<void> { return NOT_IMPL('purgeEntry') }
  async listApiKeys(_l: number, _o: number, _s?: 'active' | 'revoked'): Promise<AdminApiKey[]> { return NOT_IMPL('listApiKeys') }
  async countApiKeys(_s?: 'active' | 'revoked'): Promise<number> { return NOT_IMPL('countApiKeys') }
  async revokeApiKey(_id: string): Promise<void> { return NOT_IMPL('revokeApiKey') }
  async listReportsForApiKey(_k: string, _l: number): Promise<Report[]> { return NOT_IMPL('listReportsForApiKey') }
  async getApiKey(_id: string): Promise<AdminApiKey | null> { return NOT_IMPL('getApiKey') }
  async insertTakedown(_i: NewTakedown): Promise<Takedown> { return NOT_IMPL('insertTakedown') }
  async listTakedowns(_l: number, _o: number, _s?: TakedownStatus): Promise<Takedown[]> { return NOT_IMPL('listTakedowns') }
  async countTakedowns(_s?: TakedownStatus): Promise<number> { return NOT_IMPL('countTakedowns') }
  async getTakedown(_id: string): Promise<Takedown | null> { return NOT_IMPL('getTakedown') }
  async updateTakedown(_id: string, _f: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string | null }): Promise<void> { return NOT_IMPL('updateTakedown') }
  async getSetting(_k: string): Promise<string | null> { return NOT_IMPL('getSetting') }
  async setSetting(_k: string, _v: string): Promise<void> { return NOT_IMPL('setSetting') }
  async listSettings(): Promise<AdminSetting[]> { return NOT_IMPL('listSettings') }

  async close(): Promise<void> {
    // no-op; real impl will close the pool.
  }
}
