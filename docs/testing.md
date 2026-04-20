# Testing Guide for LLM Coding Agents

**Purpose**: Where tests go, what they look like, which commands to run.
**Read This When**: adding a component, route, invariant, or bug fix.
**Stack**: Vitest 4 (+ happy-dom, Testing Library React 16) · Playwright 1.59 (Chromium) · `app.inject()` for server integration.

## Three test tiers

| Tier | Runner | Env | File pattern | Location |
|---|---|---|---|---|
| Unit / component | Vitest | happy-dom | `*.test.{ts,tsx}` | co-located: `src/features/<name>/__tests__/`, `server/sanitizer/*.test.ts` |
| Server integration | Vitest | node | `*.spec.ts` | `server/__tests__/*.spec.ts` |
| End-to-end | Playwright | Chromium | `*.spec.ts` | `e2e/*.spec.ts` |

Server integration specs MUST declare `// @vitest-environment node` at the top so happy-dom does not load.

## Query rule (enforced by lint)

**Testing Library**: `getByTestId` / `queryByTestId` / `findByTestId` family only.
**Playwright**: `page.getByTestId(...)` only.
`getByRole`, `getByLabelText`, `getByText`, etc. are lint-blocked — copy and i18n changes should not break tests.

## Templates

### Component unit test

```tsx
// src/features/<feature>/__tests__/<Component>.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { <Component> } from '../<Component>'

vi.mock('@/lib/api', () => ({
  createThing: vi.fn(async () => ({ slug: 'abc', public_url: '/x/abc', status: 'posted' })),
  ApiError: class extends Error {
    constructor(public kind: string) { super(kind) }
  },
}))

describe('<Component>', () => {
  it('posts and shows success', async () => {
    const user = userEvent.setup()
    render(<<Component> onDone={vi.fn()} />)
    await user.type(screen.getByTestId('first-name'), 'Sam')
    await user.click(screen.getByTestId('submit'))
    expect(screen.getByTestId('success')).toBeInTheDocument()
  })
})
```

### Server integration spec

```ts
// server/__tests__/<name>.spec.ts
// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

describe('<feature>', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'ihelped-')), 'test.db')
    const { buildApp } = await import('../index.js')
    app = await buildApp()
  })

  afterAll(async () => { await app.close() })

  it('rejects input missing last_name with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: { first_name: 'Sam', city: 'NYC', country: 'US', text: 'x' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().fields.last_name).toBeTruthy()
  })
})
```

### Playwright e2e

```ts
// e2e/<flow>.spec.ts
import { expect, test } from '@playwright/test'

test('happy path', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('helped-first-name').fill('Sam')
  await page.getByTestId('helped-last-name').fill('Marker')
  /* … fill rest … */
  await page.getByTestId('helped-preview').click()
  await page.getByTestId('helped-post').click()
  await expect(page.getByTestId('helped-success')).toBeVisible()
})
```

## Cross-cutting invariants (keep these specs green)

| Spec | What it locks | Never delete |
|---|---|---|
| `server/__tests__/last-name-discard.spec.ts` | `last_name` never reaches storage, response body, or list responses across all three submission paths | ✅ |
| `server/__tests__/over-redaction.spec.ts` | Over-redacted text returns 400 `invalid_input` with `fields.text = "over_redacted"` | ✅ |
| `server/__tests__/rate-limit.spec.ts` | Per-IP and per-key rate limits trigger 429 with `retry_after_seconds` | ✅ |
| `server/sanitizer/sanitize.test.ts` | Full PRD Story 9 behavior: redaction rules, exception list, idempotence, threshold | ✅ |
| `src/lib/sanitizePreview.test.ts` | Client sanitizer mirrors server for the representative cases | ✅ |

If you change the sanitizer, update both files together and keep both specs green.

## Commands

| Command | Purpose |
|---|---|
| `pnpm test` | All Vitest (unit + server integration) |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm test:e2e` | Playwright against `pnpm dev` (dev server must be running, or Playwright boots it via `webServer.command`) |
| `pnpm typecheck` | TS project references + server TS config |
| `pnpm lint` | Full ESLint incl. custom rules |
| `pnpm build` | Production SPA build + server TS emit via `build:server` |

## Common mistakes

- **Don't** query by role/label/text. **Do** use `getByTestId`. Lint blocks otherwise.
- **Don't** forget `// @vitest-environment node` on server specs — happy-dom leaks into `fetch`/`URL` globals and breaks Fastify.
- **Don't** share a SQLite file between tests. **Do** set `process.env.SQLITE_PATH` to a temp path in `beforeAll` and `import('../index.js')` dynamically after.
- **Don't** start a dev server from a test — Playwright's `reuseExistingServer` handles it.
- **Don't** call `act()` manually for Testing Library — `userEvent` wraps it already.

## On-Demand References

| Topic | Source |
|---|---|
| PRD-driven acceptance criteria → tests | `docs/plans/prd-01-public-site.md` |
| Rate-limit multiplier + dev affordances | `docs/plans/local-dev.md` |
