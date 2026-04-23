import { formatDate } from '@/lib/format'

/**
 * Format an ISO timestamp as a human-readable "N minutes ago" / "N hours
 * ago" label, falling back to `formatDate` for timestamps older than 24h.
 * Clamps sub-minute deltas to "1 minute ago" so viewers never see "0 minutes
 * ago"; future timestamps (clock skew between server and client) render
 * as "just now" instead of a negative duration.
 */
export function relativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime()
  if (deltaMs < 0) return 'just now'
  const mins = Math.max(1, Math.floor(deltaMs / 60000))
  if (mins < 60) return `${String(mins)} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`
  return formatDate(iso)
}
