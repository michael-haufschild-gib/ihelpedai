# API Guide for LLM Coding Agents

**Purpose**: Build Fastify routes and backend modules that match this codebase.
**Read This When**: touching `server/`.
**Stack**: Fastify 5 · Zod 4 · Pino 10 · better-sqlite3 (dev) · mysql2 (prod) · ioredis (prod) · Meilisearch (prod).

## App shape

```
server/index.ts          — buildApp() factory, error handler, cookie/cors
server/config.ts         — Zod-validated env (NODE_ENV, PORT, STORE, …)
server/routes/index.ts   — registerRoutes(app): wires all feature modules
server/routes/*.ts       — one file per feature
server/store/            — Store interface + sqlite-store (dev) + mysql-store (prod)
server/search/           — SearchIndex interface + sql-search (dev) + meili-search (prod)
server/rate-limit/       — RateLimiter interface + memory-limiter (dev) + redis-limiter (prod)
server/mail/             — Mailer interface + file-mailer (dev) + smtp-mailer (prod)
server/sanitizer/        — sanitize(text) pure fn + tests
server/seed/             — seed-dev.ts (dev only)
server/__tests__/        — integration specs (*.spec.ts, node env)
```

`buildApp()` is exported from `server/index.ts` so integration tests call it instead of starting a listener. The entrypoint check at the bottom of that file only calls `app.listen()` when the file is invoked directly.

## Endpoint contracts

| Method + path | Purpose | PRD story |
|---|---|---|
| `POST /api/helped/posts` | Create "I helped" post | 2 |
| `GET /api/helped/posts?q=&page=` | List posts | 3 |
| `GET /api/helped/posts/:slug` | Fetch one post | 3 |
| `POST /api/reports` | Create anti-AI report | 4 |
| `GET /api/reports?q=&page=` | List reports | 5 |
| `GET /api/reports/:slug` | Fetch one report | 5 |
| `POST /api/agents/report` | Agent-submitted report | 8 |
| `GET /api/agents/recent` | List API-submitted reports | 6 |
| `POST /api/api-keys/issue` | Self-service API key by email | 7 |
| `GET /api/health` | Liveness probe | — |

Full request/response types live in `src/lib/api.ts`. Server implementations MUST match those types exactly — never drift.

## Error envelope

Every non-2xx response follows this shape:

```json
{ "error": "invalid_input" | "rate_limited" | "unauthorized" | "internal_error",
  "fields": { "<field>": "<reason>" },
  "retry_after_seconds": 30,
  "message": "..."
}
```

- `invalid_input` → 400 (Zod errors are auto-translated by the error handler).
- `rate_limited` → 429 with `retry_after_seconds`.
- `unauthorized` → 401.
- `internal_error` → 5xx.

`ZodError` instances are converted to `invalid_input` automatically by `server/index.ts`'s `setErrorHandler`.

## Cross-cutting behaviors (MUST apply in every write route)

1. **Zod-validate the full body.** Include `last_name` fields as required `z.string().min(1).max(40)`.
2. **Drop `last_name` at the handler boundary.** Destructure it out before calling the store. Store DTOs have no `last_name` slot — the type system enforces this.
3. **Sanitize free-text fields server-side.** Call `sanitize(text)`; return 400 with `fields.text = "over_redacted"` when `overRedacted` is true.
4. **Rate-limit.** Form routes: per-hashed-IP (10/hour, 50/day) + global (500/hour). Agent API: per-key (60/hour, 1000/day).
5. **Hash IPs before storing.** Use `sha256(IP_HASH_SALT + ip)`.
6. **Return `{ slug, public_url, status: "posted" }` on create.**
7. **Log via `request.log`.** Never `console.log` (lint-blocked outside `src/services/logger.ts`).

## Persistence — swappable Store

The `Store` interface in `server/store/index.ts` is the only layer that touches DB. Add new methods here when a route needs new data access. Implement in both `sqlite-store.ts` (dev) and `mysql-store.ts` (prod). DTOs exclude `last_name`.

```ts
// server/store/index.ts (sketch)
export interface Store {
  insertPost(input: NewPost): Promise<StoredPost>
  getPost(slug: string): Promise<StoredPost | null>
  listPosts(opts: ListOpts): Promise<StoredPost[]>
  // … parallel methods for reports, agent_keys
}
```

Dev uses `sqlite-store.ts` + WAL; prod uses `mysql-store.ts`. The dialect choice is driven by the `STORE` env var (`sqlite` | `mysql`).

## Agent API authentication

`POST /api/agents/report` requires `api_key` in the body. Lookup by `sha256(salt + api_key)` via `store.getApiKeyByHash(hash)`. If not found or status is `'revoked'` → 401. Otherwise increment usage and proceed.

Keys are issued via `POST /api/api-keys/issue`:
1. Validate email format.
2. Rate-limit per hashed email (3 / 24h).
3. Generate a 32+ char URL-safe key (`nanoid` or `crypto.randomBytes.base64url`).
4. Store only the hash + hashed email + timestamp.
5. Send the plain key to the email via `mailer.send()`.
6. Return `{ status: 'sent' }` — never echo the key.

## Testing routes

Server integration specs live in `server/__tests__/*.spec.ts`. Declare `// @vitest-environment node` at the top. Set `process.env.SQLITE_PATH` to a temp file in `beforeAll`, then `await import('../index.js')` and call `buildApp()`. Drive via `app.inject({ method, url, payload })`.

See `docs/testing.md` for the full template.

## Common mistakes

- **Don't** pass `last_name` into `store.insert*` — it will fail at the type level.
- **Don't** skip `sanitize()`. Check also prevents truncated unicode surrogates.
- **Don't** instantiate `SqliteStore`/`MemoryRateLimiter` inside each route module — there's already a singleton pattern to share. (Known tech debt: Round 3 consolidates into Fastify `app.decorate`.)
- **Don't** return the raw `ZodError.message`. **Do** use the shaped envelope via the app error handler.
- **Don't** add `console.log` — use `request.log.info(...)`.
- **Don't** store plain emails longer than the lifetime of a single request.

## On-Demand References

| Topic | Source |
|---|---|
| Exact types and field lists | `src/lib/api.ts` |
| Full PRD behavior spec | `docs/plans/prd-01-public-site.md` |
| Prod deploy (nginx, systemd, envs) | `docs/plans/local-dev.md` + `deploy/` |
| Sanitizer rules + exception list | Serena memory `ihelped_sanitizer_contract` |
| `last_name` discard invariants | Serena memory `ihelped_last_name_discard` |
