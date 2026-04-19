import { config as loadDotenv } from 'dotenv'
import { z, type RefinementCtx } from 'zod'

loadDotenv({ path: '.env.local', override: false })
loadDotenv()

const isMissing = (value: string | undefined): boolean =>
  value === undefined || value === ''

type EnvShape = {
  NODE_ENV: 'development' | 'test' | 'production'
  IP_HASH_SALT: string
  ADMIN_SESSION_SECRET: string
  MAILER: 'file' | 'smtp'
  SMTP_URL?: string
  STORE: 'sqlite' | 'mysql'
  MYSQL_URL?: string
  SEARCH: 'sql' | 'meili'
  MEILI_URL?: string
  MEILI_KEY?: string
  RATE_LIMIT: 'memory' | 'redis'
  REDIS_URL?: string
}

/** Add a `custom` issue tied to a single field with a short message. */
function addRequired(ctx: RefinementCtx, path: string, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
}

const PROD_DEFAULTS: ReadonlyArray<{ key: 'IP_HASH_SALT' | 'ADMIN_SESSION_SECRET'; devValue: string }> = [
  { key: 'IP_HASH_SALT', devValue: 'dev-ip-hash-salt-change-me' },
  { key: 'ADMIN_SESSION_SECRET', devValue: 'dev-session-secret-change-me' },
]

function refineProductionSecrets(env: EnvShape, ctx: RefinementCtx): void {
  if (env.NODE_ENV !== 'production') return
  for (const { key, devValue } of PROD_DEFAULTS) {
    if (env[key] === devValue) {
      addRequired(ctx, key, `Production must set ${key} to a non-default value`)
    }
  }
}

function refineModeRequirements(env: EnvShape, ctx: RefinementCtx): void {
  if (env.MAILER === 'smtp' && isMissing(env.SMTP_URL)) {
    addRequired(ctx, 'SMTP_URL', 'Required when MAILER=smtp')
  }
  if (env.STORE === 'mysql' && isMissing(env.MYSQL_URL)) {
    addRequired(ctx, 'MYSQL_URL', 'Required when STORE=mysql')
  }
  if (env.SEARCH === 'meili') {
    if (isMissing(env.MEILI_URL)) addRequired(ctx, 'MEILI_URL', 'Required when SEARCH=meili')
    if (isMissing(env.MEILI_KEY)) addRequired(ctx, 'MEILI_KEY', 'Required when SEARCH=meili')
  }
  if (env.RATE_LIMIT === 'redis' && isMissing(env.REDIS_URL)) {
    addRequired(ctx, 'REDIS_URL', 'Required when RATE_LIMIT=redis')
  }
}

function refineEnv(env: EnvShape, ctx: RefinementCtx): void {
  refineProductionSecrets(env, ctx)
  refineModeRequirements(env, ctx)
}

const envSchema = z
  .object({
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
  .superRefine(refineEnv)

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
