import { config as loadDotenv } from 'dotenv'
import { z, type RefinementCtx } from 'zod'

loadDotenv({ path: '.env.local', override: false })
loadDotenv()

const isMissing = (value: string | undefined): boolean =>
  value === undefined || value === ''

type EnvShape = {
  NODE_ENV: 'development' | 'test' | 'production'
  PUBLIC_URL: string
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

const DEV_PUBLIC_URL_DEFAULT = 'http://localhost:5173'

/**
 * Parse a comma-separated `ADMIN_SESSION_SECRET` into an ordered list. The
 * first element signs newly issued cookies; later elements are accepted by
 * `@fastify/cookie` for verification only. This lets a deploy add a fresh
 * secret to position 0, leave the previous one in position 1 until existing
 * sessions expire, then drop it on the next deploy. Whitespace and empty
 * entries are stripped so that `KEY1, KEY2 ,, KEY3` parses cleanly.
 */
export function parseAdminSessionSecrets(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
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
    // ADMIN_SESSION_SECRET supports rotation via comma-separated values, so
    // any individual entry matching the dev default is the failure condition,
    // not equality of the raw string.
    if (key === 'ADMIN_SESSION_SECRET') {
      const parts = parseAdminSessionSecrets(env[key])
      if (parts.length === 0 || parts.some((p) => p === devValue)) {
        addRequired(ctx, key, `Production must set ${key} to a non-default value`)
      }
    } else if (env[key] === devValue) {
      addRequired(ctx, key, `Production must set ${key} to a non-default value`)
    }
  }
  // PUBLIC_URL is quietly load-bearing: it prefixes password-reset email
  // links and every public_url response field. Booting prod with the
  // localhost default emits unclickable reset links and misleading
  // response URLs — reject at boot so the miss-config surfaces before
  // users see it.
  if (env.PUBLIC_URL === DEV_PUBLIC_URL_DEFAULT) {
    addRequired(
      ctx,
      'PUBLIC_URL',
      'Production must set PUBLIC_URL to the public origin (e.g. https://ihelped.ai)',
    )
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
    PUBLIC_URL: z.string().url().default(DEV_PUBLIC_URL_DEFAULT),

    IP_HASH_SALT: z.string().min(1).default('dev-ip-hash-salt-change-me'),
    // Zod's `min(1)` accepts `","` or `" , "` — strings that contain characters
    // but parse to zero usable secrets. `@fastify/cookie` with an empty
    // `secret: []` is undefined behaviour, so reject at the config boundary
    // and fail fast. The prod-only default check still runs on top of this.
    ADMIN_SESSION_SECRET: z
      .string()
      .min(1)
      .refine(
        (raw) => parseAdminSessionSecrets(raw).length > 0,
        'must contain at least one non-empty secret',
      )
      .default('dev-session-secret-change-me'),

    MAILER: z.enum(['file', 'smtp']).default('file'),
    // nodemailer's createTransport(url) only understands `smtp://` and
    // `smtps://`. Validating the shape at the config boundary fails the boot
    // fast when MAILER=smtp + SMTP_URL=http://… is set in prod, instead of
    // silently booting and exploding at the first outbound email.
    SMTP_URL: z
      .string()
      .optional()
      .refine((raw) => {
        if (raw === undefined || raw === '') return true
        try {
          const url = new URL(raw)
          return url.protocol === 'smtp:' || url.protocol === 'smtps:'
        } catch {
          return false
        }
      }, 'must be a smtp:// or smtps:// URL'),
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
