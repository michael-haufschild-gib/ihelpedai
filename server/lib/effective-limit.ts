import { config } from '../config.js'

/**
 * Scale a raw rate-limit value by DEV_RATE_MULTIPLIER in non-production
 * environments so manual testing doesn't hit the production caps. Returns
 * the untouched value when NODE_ENV==='production'. Floors at 1 so a
 * multiplier < 1 cannot drive the effective limit to zero (which would
 * block all traffic, not "relax" it).
 */
export function effectiveLimit(base: number): number {
  return config.NODE_ENV === 'production'
    ? base
    : Math.max(1, Math.floor(base * config.DEV_RATE_MULTIPLIER))
}
