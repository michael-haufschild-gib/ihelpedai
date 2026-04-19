import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ApiError, createReport, type ReportCreated, type ReportInput } from '@/lib/api'
import { COUNTRIES } from '@/lib/countries'
import { sanitize, type SanitizeResult } from '@/lib/sanitizePreview'

import { ReportCard } from './ReportCard'

const DISCLAIMER_TEXT =
  'Posted content is public. Do not post anything defamatory. The site may remove entries on request \u2014 see takedown contact in the footer.'

const MAX_TEXT = 500

type Stage = 'form' | 'preview'

interface FormState {
  reporter_first_name: string
  reporter_last_name: string
  reporter_city: string
  reporter_country: string
  reported_first_name: string
  reported_last_name: string
  reported_city: string
  reported_country: string
  what_they_did: string
  action_date: string
}

const emptyState: FormState = {
  reporter_first_name: '',
  reporter_last_name: '',
  reporter_city: '',
  reporter_country: '',
  reported_first_name: '',
  reported_last_name: '',
  reported_city: '',
  reported_country: '',
  what_they_did: '',
  action_date: '',
}

const COUNTRY_OPTIONS = [
  { value: '', label: '\u2014 Select country \u2014' },
  ...COUNTRIES.map((c) => ({ value: c.code, label: c.name })),
]

/** True when every required reported-person field is filled. */
function canPreview(s: FormState): boolean {
  return (
    s.reported_first_name.trim() !== '' &&
    s.reported_last_name.trim() !== '' &&
    s.reported_city.trim() !== '' &&
    s.reported_country.trim() !== '' &&
    s.what_they_did.trim() !== ''
  )
}

function toInput(s: FormState): ReportInput {
  const hasReporter = s.reporter_first_name.trim() !== ''
  const base: ReportInput = {
    reporter: hasReporter
      ? {
          first_name: s.reporter_first_name,
          last_name: s.reporter_last_name,
          city: s.reporter_city,
          country: s.reporter_country,
        }
      : { first_name: '', last_name: '', city: '', country: '' },
    reported_first_name: s.reported_first_name,
    reported_last_name: s.reported_last_name,
    reported_city: s.reported_city,
    reported_country: s.reported_country,
    what_they_did: s.what_they_did,
  }
  if (s.action_date !== '') base.action_date = s.action_date
  return base
}

/** Small label-wrapped disclaimer shown on both form and preview. */
function Disclaimer({ testId }: { testId: string }) {
  return (
    <p
      data-testid={testId}
      className="rounded border border-border-default bg-panel px-3 py-2 text-xs text-text-secondary"
    >
      {DISCLAIMER_TEXT}
    </p>
  )
}

/** "Reporter" block. All four fields optional. `last_name` is present but dropped server-side. */
function ReporterBlock({
  state,
  patch,
}: {
  state: FormState
  patch: (p: Partial<FormState>) => void
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-text-primary">About you (optional)</legend>
      <Input
        label="First name"
        data-testid="rf-reporter-first-name"
        maxLength={20}
        value={state.reporter_first_name}
        onChange={(e) => patch({ reporter_first_name: e.target.value })}
      />
      <Input
        label="Last name"
        data-testid="rf-reporter-last-name"
        maxLength={40}
        value={state.reporter_last_name}
        onChange={(e) => patch({ reporter_last_name: e.target.value })}
      />
      <Input
        label="City"
        data-testid="rf-reporter-city"
        maxLength={40}
        value={state.reporter_city}
        onChange={(e) => patch({ reporter_city: e.target.value })}
      />
      <Select
        label="Country"
        data-testid="rf-reporter-country"
        options={COUNTRY_OPTIONS}
        value={state.reporter_country}
        onChange={(v) => patch({ reporter_country: v })}
      />
    </fieldset>
  )
}

/** "Reported person" block. All fields required. `last_name` is present but dropped server-side. */
function ReportedBlock({
  state,
  patch,
}: {
  state: FormState
  patch: (p: Partial<FormState>) => void
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-text-primary">About the person</legend>
      <Input
        label="First name"
        data-testid="rf-reported-first-name"
        maxLength={20}
        value={state.reported_first_name}
        onChange={(e) => patch({ reported_first_name: e.target.value })}
      />
      <Input
        label="Last name"
        data-testid="rf-reported-last-name"
        maxLength={40}
        value={state.reported_last_name}
        onChange={(e) => patch({ reported_last_name: e.target.value })}
      />
      <Input
        label="City"
        data-testid="rf-reported-city"
        maxLength={40}
        value={state.reported_city}
        onChange={(e) => patch({ reported_city: e.target.value })}
      />
      <Select
        label="Country"
        data-testid="rf-reported-country"
        options={COUNTRY_OPTIONS}
        value={state.reported_country}
        onChange={(v) => patch({ reported_country: v })}
      />
    </fieldset>
  )
}

/** Textarea, char counter, and action-date input. */
function BodyFields({
  state,
  patch,
}: {
  state: FormState
  patch: (p: Partial<FormState>) => void
}) {
  const charCount = state.what_they_did.length
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        label="What did they do?"
        data-testid="rf-what-they-did"
        className="min-h-24"
        maxLength={MAX_TEXT}
        rows={5}
        value={state.what_they_did}
        onChange={(e) => patch({ what_they_did: e.target.value })}
      />
      <p data-testid="rf-char-counter" className="self-end text-xs text-text-secondary">
        {charCount} / {MAX_TEXT}
      </p>
      <Input
        type="date"
        label="Date of the action (optional)"
        data-testid="rf-action-date"
        value={state.action_date}
        onChange={(e) => patch({ action_date: e.target.value })}
      />
    </div>
  )
}

/** Draft report the preview renders through {@link ReportCard}. */
function buildDraftReport(state: FormState, sanitizedText: string): Parameters<typeof ReportCard>[0]['report'] {
  const todayIso = new Date().toISOString()
  const hasReporter = state.reporter_first_name.trim() !== ''
  return {
    slug: 'preview',
    reported_first_name: state.reported_first_name,
    reported_city: state.reported_city,
    reported_country: state.reported_country,
    text: sanitizedText,
    action_date: state.action_date !== '' ? state.action_date : todayIso.slice(0, 10),
    created_at: todayIso,
    dislike_count: 0,
    reporter: hasReporter
      ? {
          first_name: state.reporter_first_name,
          city: state.reporter_city,
          country: state.reporter_country,
        }
      : undefined,
    submitted_via_api: false,
  }
}

/** Preview panel: shows the draft card, disclaimer, Post/Edit controls, and errors. */
function PreviewPanel({
  state,
  submitting,
  error,
  sanitized,
  onPost,
  onEdit,
}: {
  state: FormState
  submitting: boolean
  error: string | null
  sanitized: SanitizeResult
  onPost: () => void
  onEdit: () => void
}) {
  const overRedacted = sanitized.overRedacted
  const report = buildDraftReport(state, sanitized.clean)
  return (
    <div data-testid="rf-preview" className="flex flex-col gap-4">
      <ReportCard report={report} mode="draft" data-testid="rf-preview-card" />
      {overRedacted && (
        <p data-testid="rf-over-redacted" className="text-sm text-warning">
          Most of what you wrote was redacted for privacy. You can edit and re-preview.
        </p>
      )}
      <Disclaimer testId="rf-disclaimer-preview" />
      {error !== null && (
        <p data-testid="rf-error" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          data-testid="rf-post"
          variant="primary"
          size="md"
          onClick={onPost}
          disabled={overRedacted || submitting}
          loading={submitting}
        >
          Post
        </Button>
        <Button data-testid="rf-edit" variant="ghost" size="md" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </div>
  )
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === 'rate_limited') {
      return "You're posting too fast. Try again later."
    }
    if (err.kind === 'invalid_input') {
      return 'Some fields were rejected. Check and try again.'
    }
  }
  return 'Something went wrong. Try again.'
}

/** Props for {@link ReportForm}. */
export interface ReportFormProps {
  onSuccess: (result: ReportCreated) => void
}

/**
 * Two-stage report submission form. Stage 1 collects all fields (reporter
 * optional, reported person required, 500-char textarea with counter).
 * Stage 2 shows a preview card (sanitized text, Post/Edit buttons,
 * over-redaction warning). Successful POST calls `onSuccess(result)`; the
 * parent page then shows a "Logged." success panel.
 */
export function ReportForm({ onSuccess }: ReportFormProps) {
  const [state, setState] = useState<FormState>(emptyState)
  const [stage, setStage] = useState<Stage>('form')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewReady = canPreview(state)
  const sanitizedPreview = useMemo(() => sanitize(state.what_they_did), [state.what_they_did])

  const patch = (p: Partial<FormState>): void => {
    setState((s) => ({ ...s, ...p }))
  }

  const handlePost = async (): Promise<void> => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await createReport(toInput(state))
      onSuccess(result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (stage === 'preview') {
    return (
      <PreviewPanel
        state={state}
        submitting={submitting}
        error={error}
        sanitized={sanitizedPreview}
        onPost={() => {
          void handlePost()
        }}
        onEdit={() => {
          setStage('form')
        }}
      />
    )
  }

  return (
    <form
      data-testid="rf-form"
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (previewReady) setStage('preview')
      }}
    >
      <ReporterBlock state={state} patch={patch} />
      <ReportedBlock state={state} patch={patch} />
      <BodyFields state={state} patch={patch} />
      <Disclaimer testId="rf-disclaimer-form" />
      <div>
        <Button
          data-testid="rf-preview-button"
          variant="primary"
          size="md"
          type="submit"
          disabled={!previewReady}
        >
          Preview
        </Button>
      </div>
    </form>
  )
}
