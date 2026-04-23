import { createHash } from 'node:crypto'

import { config } from '../config.js'

/**
 * Hash a value with sha256 using the server-side IP_HASH_SALT. Used for
 * IP-bucket keys, API-key storage hashes, and email-hash lookups. The salt
 * is frozen at boot by `config` and cannot rotate without a restart —
 * callers that need hash stability across process lifetimes must use the
 * same IP_HASH_SALT env value. `undefined` / empty inputs hash to the
 * fixed 'unknown' sentinel so callers never accidentally bucket every
 * IP-less request into the same empty-string slot.
 */
export function hashWithSalt(value: string | undefined): string {
  const safe = value === undefined || value === '' ? 'unknown' : value
  return createHash('sha256').update(`${config.IP_HASH_SALT}:${safe}`).digest('hex')
}
