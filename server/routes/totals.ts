import type { FastifyInstance } from 'fastify'

/**
 * Totals endpoint for footer + hero strips. Both surfaces previously
 * needed the home-page's `useHomeFeed` hook, which fetched three pages of
 * actual rows just to read the totals header. The footer renders on every
 * page, so making it depend on `useHomeFeed` would have meant 3× list
 * fetches per navigation; making it permanently render `—` (the previous
 * state) advertised dead UI.
 *
 * `GET /api/totals` is the lightest-possible answer: three indexed
 * `COUNT(*)` queries, served on the same Fastify instance that handles
 * the rest of the public API. The endpoint is uncached on the server side
 * — the SPA caches the response for ~60s in the Zustand store
 * `useLedgerTotals` to amortize navigation cost.
 */
export async function totalsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/totals', async () => {
    // `countFilteredEntries` already filters to `status='live'` by default
    // and supports the `source` axis for reports — no new SQL needed.
    const [posts, reports, agents] = await Promise.all([
      app.store.countFilteredEntries('posts', {}),
      app.store.countFilteredEntries('reports', {}),
      app.store.countFilteredEntries('reports', { source: 'api' }),
    ])
    return { posts, reports, agents }
  })
}
