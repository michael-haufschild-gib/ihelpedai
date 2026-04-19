import type {
  ApiKey,
  CountableTable,
  NewApiKey,
  NewPost,
  NewReport,
  Post,
  Report,
  ReportSourceFilter,
  Store,
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

  async countEntries(_table: CountableTable): Promise<number> {
    return NOT_IMPL('countEntries')
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

  async close(): Promise<void> {
    // no-op; real impl will close the pool.
  }
}
