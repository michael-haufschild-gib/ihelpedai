import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

loadDotenv({ path: '.env.local', override: false })
loadDotenv()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),

  IP_HASH_SALT: z.string().min(1).default('dev-ip-hash-salt-change-me'),
  ADMIN_SESSION_SECRET: z.string().min(1).default('dev-session-secret-change-me'),

  MAILER: z.enum(['file', 'smtp']).default('file'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('noreply@ihelped.ai'),

  STORE: z.enum(['sqlite', 'mysql']).default('sqlite'),
  SQLITE_PATH: z.string().default('./dev.db'),
  MYSQL_URL: z.string().optional(),

  SEARCH: z.enum(['sql', 'meili']).default('sql'),
  MEILI_URL: z.string().optional(),
  MEILI_KEY: z.string().optional(),

  RATE_LIMIT: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().optional(),

  DEV_RATE_MULTIPLIER: z.coerce.number().positive().default(10),
})

/**
 * Parsed, validated runtime configuration. Loaded once at module import.
 * Exits the process with a readable error if validation fails.
 */
export type Config = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  // Fastify hasn't started yet, so a plain stderr write is the only signal
  // available. The non-zero exit is what prevents a half-configured server
  // from booting.
  process.stderr.write(
    `Invalid server configuration:\n${JSON.stringify(parsed.error.flatten(), null, 2)}\n`,
  )
  process.exit(1)
}

export const config: Config = parsed.data
