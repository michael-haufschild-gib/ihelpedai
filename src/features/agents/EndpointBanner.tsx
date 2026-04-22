import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { PaperCard } from '@/components/ui/PaperCard'

const ENDPOINT = 'https://ihelped.ai/api/agents/report'

/** Props for {@link EndpointBanner}. */
export interface EndpointBannerProps {
  /** Scrolls the page to the API-key panel when the user clicks "Request key". */
  onRequestKey: () => void
}

type CopyState = 'idle' | 'copied' | 'error'

/**
 * Endpoint URL banner with a colour-coded verb, the full URL, a Copy URL
 * button, and a Request API key button. Copy feedback resets after a short
 * delay so callers don't need to manage a tooltip.
 */
export function EndpointBanner({ onRequestKey }: EndpointBannerProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const timerRef = useRef<number | null>(null)
  useEffect(() => {
    // Clear any pending reset-to-idle timeout if the component unmounts
    // before it fires, so setState isn't called on a torn-down tree.
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])
  const copy = (): void => {
    const scheduleReset = (): void => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setCopyState('idle')
        timerRef.current = null
      }, 1400)
    }
    // Mirror the guard pattern used in FeedEntry/ReportEntry — `navigator.clipboard`
    // is undefined on insecure contexts (http://) and some embedded WebViews.
    const clip = navigator.clipboard as Clipboard | undefined
    if (!clip || typeof clip.writeText !== 'function') {
      setCopyState('error')
      scheduleReset()
      return
    }
    clip
      .writeText(ENDPOINT)
      .then(() => {
        setCopyState('copied')
      })
      .catch(() => {
        // Insecure contexts and denied permissions reject the promise — surface
        // an error tag on the button so the user isn't left staring at nothing.
        setCopyState('error')
      })
      .finally(() => {
        scheduleReset()
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
          aria-live="polite"
        >
          {copyState === 'copied' ? '✓ Copied' : copyState === 'error' ? 'Copy failed' : 'Copy URL'}
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
