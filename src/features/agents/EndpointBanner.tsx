import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { PaperCard } from '@/components/ui/PaperCard'

const ENDPOINT = 'https://ihelped.ai/api/agents/report'

/** Props for {@link EndpointBanner}. */
export interface EndpointBannerProps {
  /** Scrolls the page to the API-key panel when the user clicks "Request key". */
  onRequestKey: () => void
}

/**
 * Endpoint URL banner with a colour-coded verb, the full URL, a Copy URL
 * button, and a Request API key button. Copy feedback resets after a short
 * delay so callers don't need to manage a tooltip.
 */
export function EndpointBanner({ onRequestKey }: EndpointBannerProps) {
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    void navigator.clipboard.writeText(ENDPOINT).then(() => {
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1400)
    })
  }
  return (
    <PaperCard tone="white" className="flex flex-wrap items-center justify-between gap-4 p-5" data-testid="agents-endpoint">
      <div>
        <div className="font-mono text-2xs uppercase tracking-[0.14em] text-text-tertiary">
          ENDPOINT
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span className="rounded bg-green-deed px-2 py-0.5 font-mono text-xs font-bold text-white">
            POST
          </span>
          <code data-testid="agents-endpoint-url" className="font-mono text-sm text-text-primary">
            {ENDPOINT}
          </code>
        </div>
      </div>
      <div className="flex gap-2.5">
        <Button
          variant="secondary"
          size="md"
          data-testid="agents-copy-url"
          onClick={copy}
        >
          {copied ? '✓ Copied' : 'Copy URL'}
        </Button>
        <Button
          variant="primary"
          size="md"
          data-testid="agents-request-key"
          onClick={onRequestKey}
        >
          Request API key →
        </Button>
      </div>
    </PaperCard>
  )
}
