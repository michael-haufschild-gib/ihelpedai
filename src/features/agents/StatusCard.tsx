import { PaperCard } from '@/components/ui/PaperCard'

/** Props for {@link StatusCard}. */
export interface StatusCardProps {
  /** Latency in ms as reported by the server (display only). */
  latencyMs?: number
  /** Number of submissions accepted today; optional because not always known. */
  acceptedToday?: number
}

/**
 * Dark status tile displayed in the top-right of the /agents hero. Shows the
 * ONLINE marker, rate limits, approximate latency, and accepted-today total.
 * All numeric values are optional; missing values render as em-dashes.
 */
export function StatusCard({ latencyMs, acceptedToday }: StatusCardProps) {
  const latency = latencyMs === undefined ? '—' : `${String(latencyMs)} ms`
  const accepted = acceptedToday === undefined ? '—' : String(acceptedToday)
  return (
    <PaperCard tone="ink" className="p-5" data-testid="agents-status">
      <div className="font-mono text-2xs uppercase tracking-[0.16em] text-sun">STATUS</div>
      <div className="mt-2 flex items-baseline gap-3">
        <div className="font-serif text-4xl leading-none text-green-deed">ONLINE</div>
        <div className="font-mono text-2xs text-paper opacity-60">
          60/min · 1000/day
        </div>
      </div>
      <div className="mt-2 font-mono text-2xs uppercase tracking-wider text-paper opacity-75">
        LATENCY: {latency} p50 · {accepted} ACCEPTED TODAY
      </div>
    </PaperCard>
  )
}
