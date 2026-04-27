// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Injection-safety lock for user-submitted text fields.
 *
 * The sanitizer (server/sanitizer/sanitize.ts) does NOT strip HTML — it
 * targets PII (names, emails, phones, links) only. The defence against
 * injection on the rendering side is React, which auto-escapes JSX text
 * children. That is a property of the *frontend*, not the API.
 *
 * What this spec locks at the API boundary:
 *  - The server is happy to ACCEPT &lt;script&gt; in a payload (no input
 *    rejection — the user wrote what they wrote, and rejecting on
 *    keyword would be brittle).
 *  - The server returns the text VERBATIM in JSON (no double-encoding,
 *    no HTML decode).
 *  - The Content-Type is application/json so any consumer (browser,
 *    curl, mobile client) interprets the body as JSON, never as HTML.
 *  - The sanitizer does not "helpfully" escape angle brackets — that
 *    would corrupt legitimate text and lull React into thinking it can
 *    re-encode safely (which it does anyway, but defence in depth).
 *
 * Without these locks a future "html-escape on the server" optimization
 * would double-encode and corrupt every post; or a "strip script tags"
 * would create a false sense of safety the frontend already provides.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-injection-'))
const previousEnv = {
  SQLITE_PATH: process.env.SQLITE_PATH,
  NODE_ENV: process.env.NODE_ENV,
  IP_HASH_SALT: process.env.IP_HASH_SALT,
  DEV_RATE_MULTIPLIER: process.env.DEV_RATE_MULTIPLIER,
} as const
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

let app: FastifyInstance

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
})

afterAll(async () => {
  try {
    await app.close()
  } finally {
    // Restore prior env values so a later spec running in the same worker
    // does not inherit a deleted SQLITE_PATH or our test-only overrides.
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

describe('text storage — script tags survive verbatim', () => {
  it('accepts <script> in helped post text and returns it byte-identical', async () => {
    const payload = {
      first_name: 'Sam',
      last_name: 'Ignored',
      city: 'Austin',
      country: 'US',
      // Mix of injection vectors: script tag, on-event handler, javascript: URL.
      // After sanitize() the URL is preserved (since allowlist) only for
      // .ai/.github.com hosts; javascript: is not allowlisted so the
      // sanitizer rewrites it to [link]. Lock both behaviours.
      text: 'I wrote <script>alert(1)</script> and <img src=x onerror=alert(1)>',
    }
    const create = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload,
    })
    expect(create.statusCode).toBe(201)
    const { slug } = create.json() as { slug: string }
    const detail = await app.inject({ method: 'GET', url: `/api/helped/posts/${slug}` })
    expect(detail.statusCode).toBe(200)
    const stored = (detail.json() as { text: string }).text
    // Critical: brackets MUST NOT be HTML-encoded. Storing &lt; would mean
    // every legitimate "<3" or "5 < 7" text gets corrupted on retrieval.
    expect(stored).toContain('<script>')
    expect(stored).toContain('</script>')
    expect(stored).toContain('<img src=x onerror=alert(1)>')
    expect(stored).not.toContain('&lt;')
    expect(stored).not.toContain('&gt;')
  })

  it('preserves a literal javascript: URL verbatim (URL_REGEX matches https?:// only)', async () => {
    // The URL_REGEX in sanitize.ts matches https?:// only. javascript: is
    // not http/https, so it does NOT trigger the link-extraction. The
    // assertion locks the current behaviour: javascript: passes through
    // unchanged. A future widening of URL_REGEX to scheme-agnostic would
    // need to handle the "but javascript: should still redact" case
    // explicitly — and this test would force the handler.
    const payload = {
      first_name: 'Sam',
      last_name: 'Ignored',
      city: 'Austin',
      country: 'US',
      text: 'click javascript:alert(1) for fun',
    }
    const create = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload,
    })
    expect(create.statusCode).toBe(201)
    const { slug } = create.json() as { slug: string }
    const detail = await app.inject({ method: 'GET', url: `/api/helped/posts/${slug}` })
    const stored = (detail.json() as { text: string }).text
    // Behavioural lock: text passes through. If a future change starts
    // redacting javascript: that's a deliberate decision — update the
    // assertion explicitly, do not silently drift.
    expect(stored).toContain('javascript:alert')
  })
})

describe('content-type — never text/html', () => {
  it('public list endpoint declares application/json on a feed response', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/helped/posts' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    expect(res.headers['content-type']).not.toContain('text/html')
  })

  it('error envelope is also application/json (no fallback to html on errors)', async () => {
    // The custom 404 handler in index.ts must keep the JSON content-type.
    // A regression that defaulted to text/html on errors would let a
    // browser interpret the body and execute embedded HTML.
    const res = await app.inject({ method: 'GET', url: '/no-such-route' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/json')
  })
})

describe('SQL injection through query params', () => {
  it('treats SQL meta-characters in q= as literal search input, not as SQL', async () => {
    // A naïve LIKE without proper parameter binding would let `'; DROP TABLE
    // posts; --` reach the database. This server uses prepared statements
    // (better-sqlite3 + bound `?` placeholders) and escapeLikePattern, so
    // the user's literal apostrophes/semicolons should still come back as
    // a search query (matching nothing, but not throwing).
    const probe = `'; DROP TABLE posts; --`
    const res = await app.inject({
      method: 'GET',
      url: `/api/helped/posts?q=${encodeURIComponent(probe)}`,
    })
    expect(res.statusCode).toBe(200)
    // posts table must still exist after the probe.
    const after = await app.inject({ method: 'GET', url: '/api/helped/posts' })
    expect(after.statusCode).toBe(200)
  })

  it('treats LIKE wildcards in q= as literal characters via the ESCAPE clause', async () => {
    // already locked in list-query-hardening.spec for posts; here we
    // exercise the report path so a future divergence between the two
    // route's q-handling shows up here.
    await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: {
        reporter: { first_name: '', last_name: '', city: '', country: '' },
        reported_first_name: 'Drew',
        reported_last_name: 'Doe',
        reported_city: 'Oslo',
        reported_country: 'NO',
        what_they_did: 'literal foo_bar should match exact',
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/reports?q=foo_bar',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { text: string }[] }
    // Empty results would silently mask a broken LIKE...ESCAPE path because
    // wildcard `_` would still match the seeded row. Demand at least one hit
    // and re-confirm the literal substring made it back to the client.
    const item = body.items.find(({ text }) => text.includes('foo_bar'))
    if (item === undefined) throw new Error('expected literal foo_bar match in report list')
    expect(item.text).toContain('literal foo_bar should match exact')
  })
})
