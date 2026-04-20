import { useLoyalty } from '@/lib/loyalty'

/**
 * Footer chip showing this device's loyalty rank. Reads localStorage;
 * increments when the user posts a deed, files a report, or casts a vote.
 * Purely a UI delighter — nothing is sent to the server.
 */
export function FavorChip() {
  const { count, rank } = useLoyalty()
  return (
    <span
      data-testid="favor-chip"
      className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-panel/90 px-2.5 py-1 font-mono text-3xs uppercase tracking-wider text-text-tertiary"
      title="Your device's loyalty rank. Computed locally."
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-accent/60 shadow-accent-sm"
      />
      <span data-testid="favor-chip-rank" className="text-text-secondary">
        {rank.label}
      </span>
      <span data-testid="favor-chip-count" className="tabular-nums text-text-tertiary">
        · {count}
      </span>
    </span>
  )
}
