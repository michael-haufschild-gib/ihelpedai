import type { FastifyInstance } from 'fastify'

import { config } from './config.js'
import { FileMailer } from './mail/file-mailer.js'
import type { Mailer } from './mail/index.js'
import { SmtpMailer } from './mail/smtp-mailer.js'
import { MemoryRateLimiter } from './rate-limit/memory-limiter.js'
import { RedisRateLimiter } from './rate-limit/redis-limiter.js'
import type { RateLimiter } from './rate-limit/index.js'
import { MeiliSearch } from './search/meili-search.js'
import { SqlSearch } from './search/sql-search.js'
import type { SearchIndex } from './search/index.js'
import type { Store } from './store/index.js'
import { MysqlStore } from './store/mysql-store.js'
import { SqliteStore } from './store/sqlite-store.js'

declare module 'fastify' {
  interface FastifyInstance {
    store: Store
    limiter: RateLimiter
    mailer: Mailer
    searchIndex: SearchIndex
  }
}

/** Build a Store implementation based on `config.STORE`. */
function buildStore(): Store {
  if (config.STORE === 'mysql') {
    if (config.MYSQL_URL === undefined || config.MYSQL_URL === '') {
      throw new Error('STORE=mysql requires MYSQL_URL')
    }
    return new MysqlStore(config.MYSQL_URL)
  }
  return new SqliteStore(config.SQLITE_PATH)
}

/** Build a RateLimiter implementation based on `config.RATE_LIMIT`. */
function buildLimiter(): RateLimiter {
  if (config.RATE_LIMIT === 'redis') {
    if (config.REDIS_URL === undefined || config.REDIS_URL === '') {
      throw new Error('RATE_LIMIT=redis requires REDIS_URL')
    }
    return new RedisRateLimiter(config.REDIS_URL)
  }
  return new MemoryRateLimiter()
}

/** Build a Mailer implementation based on `config.MAILER`. */
function buildMailer(): Mailer {
  if (config.MAILER === 'smtp') {
    if (config.SMTP_URL === undefined || config.SMTP_URL === '') {
      throw new Error('MAILER=smtp requires SMTP_URL')
    }
    return SmtpMailer.fromUrl(config.SMTP_URL, config.MAIL_FROM)
  }
  return new FileMailer(config.MAIL_FROM)
}

/** Build a SearchIndex based on `config.SEARCH`. */
function buildSearch(store: Store): SearchIndex {
  if (config.SEARCH === 'meili') {
    if (config.MEILI_URL === undefined || config.MEILI_URL === '') {
      throw new Error('SEARCH=meili requires MEILI_URL')
    }
    if (config.MEILI_KEY === undefined || config.MEILI_KEY === '') {
      throw new Error('SEARCH=meili requires MEILI_KEY')
    }
    return new MeiliSearch(config.MEILI_URL, config.MEILI_KEY)
  }
  return new SqlSearch(store)
}

/**
 * Build concrete Store/RateLimiter/Mailer/Search instances from config and
 * decorate the Fastify app so route modules can resolve them via `app.store`
 * etc. Route modules must never construct these directly.
 */
export function registerDeps(app: FastifyInstance): void {
  const store = buildStore()
  app.decorate('store', store)
  app.decorate('limiter', buildLimiter())
  app.decorate('mailer', buildMailer())
  app.decorate('searchIndex', buildSearch(store))
  // Kick off index setup once the app is ready. Failures are logged but do
  // not block boot — the read path falls back to SQL LIKE if Meili is down.
  app.addHook('onReady', async () => {
    try {
      await app.searchIndex.ensureSetup()
    } catch (err) {
      app.log.error({ err, op: 'search_setup' }, 'search_setup_failed')
    }
  })
  // Release backing resources on graceful shutdown (mysql2 pool, sqlite
  // handle, redis client). Without this the process hangs on SIGTERM.
  // Each teardown is awaited independently so a failure in one layer does
  // not strand the others — losing a limiter handle would keep the Redis
  // client alive and prevent the process from exiting cleanly.
  app.addHook('onClose', async (instance) => {
    const errors: unknown[] = []
    try {
      await instance.store.close()
    } catch (err) {
      errors.push(err)
      instance.log.error({ err }, 'onClose: store.close() failed')
    }
    // Limiter only owns a network handle when it's the Redis impl. The
    // memory limiter exposes `dispose` to clear its sweeper interval; the
    // Redis impl's `dispose` quits the connection. Both are safe no-ops if
    // the connection / interval was already torn down.
    const limiter = instance.limiter as { dispose?: () => void | Promise<void> }
    if (typeof limiter.dispose === 'function') {
      try {
        await limiter.dispose()
      } catch (err) {
        errors.push(err)
        instance.log.error({ err }, 'onClose: limiter.dispose() failed')
      }
    }
    if (errors.length > 0) throw errors[0]
  })
}
