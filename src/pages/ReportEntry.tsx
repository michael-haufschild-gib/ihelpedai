import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { ReportCard } from '@/features/reports/ReportCard'
import { useMyVotes } from '@/hooks/useMyVotes'
import { ApiError, getReport, type Report } from '@/lib/api'

type LoadedInner =
  | { kind: 'loaded'; report: Report }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }

type State = { kind: 'loading' } | LoadedInner

function stateFromError(err: unknown): LoadedInner {
  if (err instanceof ApiError && err.status === 404) return { kind: 'not_found' }
  if (err instanceof ApiError) return { kind: 'error', message: err.message }
  return { kind: 'error', message: 'Could not load report.' }
}

function useReport(slug: string | undefined): State {
  const [result, setResult] = useState<{ key: string; inner: LoadedInner } | null>(null)
  const requestKey = slug ?? ''
  useEffect(() => {
    if (slug === undefined || slug === '') return undefined
    let cancelled = false
    getReport(slug)
      .then((report) => {
        if (!cancelled) setResult({ key: requestKey, inner: { kind: 'loaded', report } })
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key: requestKey, inner: stateFromError(err) })
      })
    return () => {
      cancelled = true
    }
  }, [slug, requestKey])
  if (slug === undefined || slug === '') return { kind: 'not_found' }
  if (result === null || result.key !== requestKey) return { kind: 'loading' }
  return result.inner
}

/** Not-here message with a link back to the main reports list. */
function ReportNotFound() {
  return (
    <p data-testid="page-report-entry-not-found" className="text-base text-text-secondary">
      Not here.{' '}
      <Link
        to="/reports"
        className="underline decoration-dotted underline-offset-4 hover:text-text-primary"
        data-testid="report-entry-back-link"
      >
        Back to the reports.
      </Link>
    </p>
  )
}

/**
 * Permalink page for a single report. Fetches the entry by slug and renders
 * it with the shared {@link ReportCard}. A "Copy link" button copies the
 * current URL to the clipboard; the confirmation state is transient.
 */
export function ReportEntry() {
  const { slug } = useParams<{ slug: string }>()
  const state = useReport(slug)
  const votedSet = useMyVotes('report', slug ?? '')
  const voted = slug !== undefined && votedSet.has(slug)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const copy = (): void => {
    const clip = navigator.clipboard as Clipboard | undefined
    const href = typeof window !== 'undefined' ? window.location.href : ''
    if (!clip || typeof clip.writeText !== 'function' || href === '') return
    clip.writeText(href).then(
      () => {
        setCopied(true)
        if (copyTimerRef.current !== null) {
          window.clearTimeout(copyTimerRef.current)
        }
        copyTimerRef.current = window.setTimeout(() => {
          setCopied(false)
          copyTimerRef.current = null
        }, 1500)
      },
      () => undefined,
    )
  }

  return (
    <section data-testid="page-report-entry" className="flex flex-col gap-6">
      <h1
        data-testid="page-report-entry-heading"
        className="text-2xl font-semibold text-text-primary"
      >
        Report
      </h1>
      {state.kind === 'loading' && (
        <p data-testid="page-report-entry-loading" className="text-sm text-text-secondary">
          Loading…
        </p>
      )}
      {state.kind === 'not_found' && <ReportNotFound />}
      {state.kind === 'error' && (
        <p data-testid="page-report-entry-error" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.kind === 'loaded' && (
        <>
          <ReportCard
            report={state.report}
            mode="permalink"
            voted={voted}
            data-testid="page-report-entry-card"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              data-testid="page-report-entry-copy"
              variant="ghost"
              size="sm"
              onClick={copy}
            >
              Copy link
            </Button>
            {copied && (
              <span
                data-testid="page-report-entry-copied"
                className="text-xs text-text-secondary"
              >
                Copied.
              </span>
            )}
          </div>
        </>
      )}
    </section>
  )
}
