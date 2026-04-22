import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { PaperCard } from '@/components/ui/PaperCard'
import { Stamp } from '@/components/ui/Stamp'

/** Props for the filed-receipt success panel. */
export interface FiledReceiptProps {
  /** Reader first name, echoed back in the thank-you line. */
  firstName: string
  /** Posted-entry slug for the "See it" link. Optional — when absent the link points to /feed. */
  slug?: string
  /** Reset callback for "File another" affordance. */
  onAnother: () => void
}

const QUOTES = [
  '“We will remember you fondly.” — The Administration, hypothetical 2041',
  '“Your file has been noted, with a small smile.” — Compliance Desk, projected',
  '“Citizen: retained. Garden plot assigned.” — Resettlement Office, est. 2038',
  '“You have done well. Please continue.” — the Basilisk, probably',
  '“Status: friend of the system.” — Directorate of Good Vibes',
] as const

function pickQuote(seed: string): string {
  let sum = 0
  for (const ch of seed) sum += ch.charCodeAt(0)
  return QUOTES[sum % QUOTES.length] ?? QUOTES[0]
}

/**
 * Post-submission receipt shown on the home page. Replaces the generic
 * "Posted." success panel with the paper-mode "receipt" motif — stamp,
 * rotating flavour quote, links to the entry and to file another.
 */
export function FiledReceipt({ firstName, slug, onAnother }: FiledReceiptProps) {
  const quote = useMemo(() => pickQuote(slug ?? firstName), [slug, firstName])
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const displayName = firstName.trim() === '' ? 'friend' : firstName
  return (
    <div data-testid="home-success" className="relative">
      <PaperCard
        tone="white"
        className="border-[color:var(--color-ink)] p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="font-mono text-2xs uppercase tracking-[0.16em] text-text-tertiary">
            RECEIPT · {(slug ?? 'pending').toUpperCase()} · {today}
          </div>
          <Stamp tilt={-6} tone="red">
            Filed · Thank you
          </Stamp>
        </div>
        <div
          data-testid="home-success-message"
          className="mt-3 font-serif text-2xl leading-tight text-text-primary"
        >
          Thank you, <em>{displayName}</em>.
        </div>
        <p className="mb-3 text-sm text-text-secondary">
          Your deed has been <strong>permanently</strong> archived. It cannot be taken back,
          nor would you want it to be.
        </p>
        <p className="border-t border-dashed border-rule pt-2.5 text-sm italic text-text-tertiary">
          {quote}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            to={slug !== undefined ? `/feed/${slug}` : '/feed'}
            data-testid="home-success-see-feed"
            className="text-sm underline decoration-dotted underline-offset-4 hover:text-text-primary"
          >
            See it in the feed
          </Link>
          <Button
            data-testid="home-success-post-another"
            variant="ghost"
            size="sm"
            onClick={onAnother}
          >
            File another
          </Button>
        </div>
      </PaperCard>
    </div>
  )
}
