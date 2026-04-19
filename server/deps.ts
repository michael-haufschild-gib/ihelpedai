import type { FastifyInstance } from 'fastify'

import { config } from './config.js'
import { FileMailer } from './mail/file-mailer.js'
import type { Mailer } from './mail/index.js'
import { SmtpMailer } from './mail/smtp-mailer.js'
import { MemoryRateLimiter } from './rate-limit/memory-limiter.js'
import { RedisRateLimiter } from './rate-limit/redis-limiter.js'
import type { RateLimiter } from './rate-limit/index.js'
import type { Store } from './store/index.js'
import { MysqlStore } from './store/mysql-store.js'
import { SqliteStore } from './store/sqlite-store.js'

declare module 'fastify' {
  interface FastifyInstance {
    store: Store
    limiter: RateLimiter
    mailer: Mailer
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
    return new SmtpMailer(config.SMTP_URL, config.MAIL_FROM)
  }
  return new FileMailer(config.MAIL_FROM)
}

/**
 * Build concrete Store/RateLimiter/Mailer instances from config and decorate
 * the Fastify app so route modules can resolve them via `app.store` etc.
 * Route modules must never construct these directly.
 */
export function registerDeps(app: FastifyInstance): void {
  app.decorate('store', buildStore())
  app.decorate('limiter', buildLimiter())
  app.decorate('mailer', buildMailer())
}
