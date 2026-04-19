import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { ReportCard } from '@/features/reports/ReportCard'
import { ApiError, fetchMyVotes, getReport, type Report } from '@/lib/api'

type LoadedInner =
  | { kind: 'loaded'; report: Report }
  | { kind: 'error'; message: string }

type State = { kind: 'loading' } | LoadedInner

function errorFromApi(err: unknown): string {
  if (err instanceof ApiError && err.status === 404) return 'Not here.'
  if (err instanceof ApiError) return err.message
  return 'Could not load report.'
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
        if (!cancelled) {
          setResult({ key: requestKey, inner: { kind: 'error', message: errorFromApi(err) } })
        }
      })
    return () => {
      cancelled = true
    }
  }, [slug, requestKey])
  if (slug === undefined || slug === '') return { kind: 'error', message: 'Missing slug.' }
  if (result === null || result.key !== requestKey) return { kind: 'loading' }
  return result.inner
}

function copyCurrentUrl(setCopied: (v: boolean) => void): void {
  const clipboard =
    typeof navigator !== 'undefined' && navigator.clipboard !== undefined
      ? navigator.clipboard
      : null
  if (clipboard === null) {
    setCopied(false)
    return
  }
  clipboard
    .writeText(window.location.href)
    .then(() => {
      setCopied(true)
    })
    .catch(() => {
      setCopied(false)
    })
}

function useConcurred(slug: string | undefined): boolean {
  const [voted, setVoted] = useState(false)
  useEffect(() => {
    if (slug === undefined || slug === '') return undefined
    let cancelled = false
    fetchMyVotes('report', [slug])
      .then((r) => {
        if (!cancelled) setVoted(r.voted.includes(slug))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [slug])
  return voted
}

/**
 * Permalink page for a single report. Fetches the entry by slug and renders
 * it with the shared {@link ReportCard}. A "Copy link" button copies the
 * current URL to the clipboard; the confirmation state is transient.
 */
export function ReportEntry() {
  const { slug } = useParams<{ slug: string }>()
  const state = useReport(slug)
  const voted = useConcurred(slug)
  const [copied, setCopied] = useState(false)

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
              onClick={() => {
                copyCurrentUrl(setCopied)
              }}
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
