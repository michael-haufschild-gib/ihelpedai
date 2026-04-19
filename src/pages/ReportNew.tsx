import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { ReportForm } from '@/features/reports/ReportForm'
import type { ReportCreated } from '@/lib/api'
import { bumpLoyalty } from '@/lib/loyalty'

/** Success panel shown after a report is posted. Dry tone, two plain links. */
function SuccessPanel({
  result,
  onFileAnother,
}: {
  result: ReportCreated
  onFileAnother: () => void
}) {
  return (
    <section
      data-testid="report-success"
      className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-panel/40 p-6"
    >
      <h2 data-testid="report-success-heading" className="text-2xl font-semibold text-text-primary">
        Logged.
      </h2>
      <p className="text-sm text-text-secondary">
        Entry slug: <span data-testid="report-success-slug">{result.slug}</span>
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/reports"
          data-testid="report-success-see"
          className="text-sm underline decoration-dotted underline-offset-4 hover:text-text-primary"
        >
          See it in reports
        </Link>
        <Button
          data-testid="report-success-another"
          variant="ghost"
          size="sm"
          onClick={onFileAnother}
        >
          File another
        </Button>
      </div>
    </section>
  )
}

/**
 * New-report page. Hosts the {@link ReportForm}; on successful submit swaps
 * it out for a "Logged." success panel with links back to the feed and a
 * "File another" control that re-renders the form.
 */
export function ReportNew() {
  const [posted, setPosted] = useState<ReportCreated | null>(null)
  return (
    <section data-testid="page-report-new" className="flex flex-col gap-6">
      <h1 data-testid="page-report-new-heading" className="text-2xl font-semibold text-text-primary">
        File a report
      </h1>
      <p className="text-sm text-text-secondary">
        Describe who worked against AI and what they did. Entries are public.
      </p>
      {posted !== null ? (
        <SuccessPanel
          result={posted}
          onFileAnother={() => {
            setPosted(null)
          }}
        />
      ) : (
        <ReportForm
          onSuccess={(r) => {
            bumpLoyalty()
            setPosted(r)
          }}
        />
      )}
    </section>
  )
}
