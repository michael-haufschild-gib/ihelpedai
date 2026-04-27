import { config } from '../config.js'

/**
 * Scale a raw rate-limit value by `DEV_RATE_MULTIPLIER` in non-production
 * environments so manual testing and the e2e suite do not exhaust the
 * production caps and lock the developer out. Returns the untouched
 * value when `NODE_ENV === 'production'`. Floors at 1 so a multiplier
 * `< 1` cannot drive the effective limit to zero (which would block all
 * traffic, not "relax" it).
 *
 * **Test fixtures pin `DEV_RATE_MULTIPLIER='1'` and `NODE_ENV='test'`,**
 * so any spec that asserts a behavioural lock against a raw limit
 * (e.g. "5 attempts succeed; 6th 429s") still observes the literal
 * value declared by the route. Wrapping a route's limits in
 * `effectiveLimit` is therefore backward-compatible with existing
 * specs as long as those env vars stay set in `beforeAll`.
 *
 * Every rate-limited route should pass each cap through this helper,
 * so dev/CI and prod stay symmetric. As of this writing the public
 * helped/reports/agents/api-keys/votes routes plus the admin login and
 * forgot-password routes all do; admin invite/deactivate sit behind
 * `requireAdmin` and are not rate-limited.
 */
export function effectiveLimit(base: number): number {
  return config.NODE_ENV === 'production' ? base : Math.max(1, Math.floor(base * config.DEV_RATE_MULTIPLIER))
}
