# Architecture Guide for LLM Coding Agents

**Purpose**: Where new code goes and what it should look like.
**Read This When**: adding routes, pages, features, primitives, or server modules.
**Stack**: React 19 + Vite 8 + Tailwind 4 (SPA) · Fastify 5 + Zod (API) · SQLite (dev) / MySQL (prod).

## Folder map — where things live

| Concern | Path | Rule |
|---|---|---|
| Public UI primitives | `src/components/ui/` | **Only** place raw `<button>/<input>/<select>/<textarea>` may be rendered. |
| Site chrome (nav, footer, 404 shell) | `src/layout/` | No feature code. |
| Route-level page containers | `src/pages/` | One file per route. Composes features + UI primitives. No business logic. |
| Feature modules | `src/features/{helped,reports,agents}/` | Feature-specific components + tests. May import UI primitives and `@/lib`. |
| Small utilities, constants, API client | `src/lib/` | Pure TS. No React. |
| Zustand stores | `src/stores/` | One store per domain. Subscribe via hooks in `src/hooks/`. |
| Global services (logger, audio) | `src/services/` | Singletons. Never imported by tests without a mock. |
| Theme + design tokens | `src/styles/` | See `docs/meta/styleguide.md`. |
| Test setup | `src/test/setup.ts` | Vitest setup, `afterEach(cleanup)`. |
| Fastify app + route registry | `server/index.ts`, `server/routes/index.ts` | Export `buildApp()` from `index.ts` for tests. |
| Feature routes | `server/routes/{helped,reports,agents,api-keys,health}.ts` | One file per feature. Registers under its own path prefix. |
| Swappable interfaces (dev vs prod impl) | `server/{store,search,rate-limit,mail}/` | `index.ts` = interface; `{sqlite,memory,sql,file}-*.ts` = dev; `{mysql,redis,meili,smtp}-*.ts` = prod. |
| Sanitizer (pure fn) | `server/sanitizer/sanitize.ts` | Plus mirror at `src/lib/sanitizePreview.ts` for preview parity. |
| Seed data | `server/seed/seed-dev.ts` | Dev only. Never runs in prod. |
| Server tests (integration) | `server/__tests__/*.spec.ts` | Boot via `buildApp()` + `app.inject()`. Use `// @vitest-environment node`. |
| Deploy | `deploy/{nginx,systemd,schema}/` + `deploy/deploy.sh` | Do not inline deploy config elsewhere. |
| Design/spec docs | `docs/plans/` | PRDs, orchestration plan, local-dev notes. |

## Naming conventions

| Kind | Convention | Example |
|---|---|---|
| Component file | `PascalCase.tsx` | `FeedCard.tsx` |
| Hook file | `camelCase.ts` starting `use` | `useViewMenuItems.ts` |
| Utility file | `camelCase.ts` | `sanitizePreview.ts` |
| Route module | `kebab-case.ts` | `api-keys.ts` |
| Test file (unit) | `*.test.{ts,tsx}` | `HelpedForm.test.tsx` |
| Test file (server integration) | `*.spec.ts` | `last-name-discard.spec.ts` |
| Test file (e2e) | `e2e/*.spec.ts` | `helped-flow.spec.ts` |
| Data-testid | `kebab-case`, feature-scoped | `data-testid="helped-first-name"` |

## Decision tree — where do I put X?

```text
Is it shared across features?           → src/components/ui/ (primitive)
Is it one feature's internal widget?    → src/features/<name>/
Is it a full page?                      → src/pages/
Is it site chrome (nav, footer)?        → src/layout/
Is it a pure helper or type?            → src/lib/ or src/types/
Is it a Zustand store?                  → src/stores/
Is it a new API endpoint?               → server/routes/<feature>.ts
Is it a new persistence impl?           → server/store/<engine>-store.ts
Is it a cross-cutting invariant?        → server/sanitizer/ OR server/__tests__/
```

## Templates

### React page (route target)

```tsx
// src/pages/<Name>.tsx
import { useEffect } from 'react'

import { Button } from '@/components/ui/Button'

/** Route component for /<path>. Composes feature modules; no business logic here. */
export function Name() {
  return (
    <section data-testid="page-<slug>" className="flex flex-col gap-6">
      <h1 data-testid="page-<slug>-heading" className="text-2xl font-semibold text-text-primary">
        <Title>
      </h1>
      {/* Feature composition */}
    </section>
  )
}
```

Register the route in `src/router.tsx` under `<SiteLayout />`.

### Feature component

```tsx
// src/features/<feature>/<Name>.tsx
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface <Name>Props {
  /** Doc for each prop. */
  onDone: () => void
}

/** One-sentence summary of what the component does. */
export function <Name>({ onDone }: <Name>Props) {
  return (
    <div className="flex flex-col gap-4">{/* ... */}</div>
  )
}
```

### Fastify route module

```ts
// server/routes/<feature>.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { getStore } from '@/server/store'
import { getRateLimiter } from '@/server/rate-limit'
import { sanitize } from '@/server/sanitizer/sanitize'

const CreateInput = z.object({
  first_name: z.string().min(1).max(20).regex(/^\p{L}+$/u),
  last_name: z.string().min(1).max(40),        // required at input; discarded server-side
  /* ... */
})

/** Register /<feature> endpoints on the Fastify app. */
export async function registerFeatureRoutes(app: FastifyInstance) {
  const store = getStore()
  const limiter = getRateLimiter()

  app.post('/api/<feature>', async (req, reply) => {
    const input = CreateInput.parse(req.body)
    // Drop last_name at the boundary — never pass it to the store.
    const { last_name: _drop, ...rest } = input
    const { clean, overRedacted } = sanitize(rest.text)
    if (overRedacted) return reply.status(400).send({ error: 'invalid_input', fields: { text: 'over_redacted' } })
    const row = await store.insertFeature({ ...rest, text: clean })
    return reply.status(201).send({ slug: row.slug, public_url: `/feature/${row.slug}`, status: 'posted' })
  })
}
```

## Common mistakes

- **Don't** render raw `<button>/<input>/<select>/<textarea>` outside `src/components/ui/`. **Do** import `Button`, `Input`, `Select`, `Textarea` primitives. Lint blocks this (`no-raw-form-controls`).
- **Don't** pass `last_name` into storage layers. **Do** destructure-and-drop it at the HTTP handler boundary.
- **Don't** skip the `sanitize()` call on any user-submitted free-text field. **Do** run it server-side before insert and re-run on preview.
- **Don't** write feature logic in `src/pages/`. **Do** push it into `src/features/<name>/`.
- **Don't** import from `@/features/helped/` inside `src/features/reports/`. **Do** share via `src/components/ui/` or `src/lib/`.
- **Don't** create new persistence code in feature routes. **Do** add methods to the `Store` interface and implement in `sqlite-store.ts` + `mysql-store.ts`.
- **Don't** use `eslint-disable` directives or arbitrary `text-[Npx]` classes — both lint-blocked.
- **Don't** use raw palette colors (`bg-zinc-*`, `text-red-*`). **Do** use semantic tokens (`bg-panel`, `text-text-primary`, `text-danger`). See `docs/meta/styleguide.md`.

## Invariants (verify before merging)

1. `last_name` never reaches storage or any response body. (Covered by `server/__tests__/last-name-discard.spec.ts` — keep it passing.)
2. Every user-submitted textarea goes through `sanitize()`.
3. Every form has a preview step showing exactly what will be stored.
4. No file uploads anywhere (no `multipart/form-data`, no `<input type="file">`).
5. Interactive elements carry both `data-testid` and `className`.

## On-Demand References

| Topic | Source |
|---|---|
| Behavioral spec for public site | `docs/plans/prd-01-public-site.md` |
| Behavioral spec for admin backoffice (phase 2) | `docs/plans/prd-02-admin-backoffice.md` |
| Dev/prod environment matrix | `docs/plans/local-dev.md` |
| Full code style detail | Serena memory `code_style_conventions` |
| Folder purpose detail | Serena memory `codebase_structure` |
| Sanitizer contract + exceptions | Serena memory `ihelped_sanitizer_contract` |
| `last_name` discard guarantees | Serena memory `ihelped_last_name_discard` |
