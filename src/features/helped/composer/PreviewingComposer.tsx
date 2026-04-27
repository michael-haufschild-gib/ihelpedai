import { Button } from '@/components/ui/Button'
import { PreviewCard } from '@/features/helped/PreviewCard'
import { trimHelpedValues, type HelpedFormValues } from '@/features/helped/form/validators'

/** Props for the previewing-mode composer body. */
export interface PreviewingComposerProps {
  values: HelpedFormValues
  sanitizedText: string
  overRedacted: boolean
  submitting: boolean
  error: string | null
  onEdit: () => void
  onPost: () => void
}

/** Shows the sanitized post + edit/post buttons. Disables Post on over-redaction. */
export function PreviewingComposer({
  values,
  sanitizedText,
  overRedacted,
  submitting,
  error,
  onEdit,
  onPost,
}: PreviewingComposerProps) {
  const disabled = submitting || overRedacted
  const previewValues = trimHelpedValues(values)
  return (
    <div className="flex flex-col gap-3">
      <PreviewCard
        firstName={previewValues.first_name}
        city={previewValues.city}
        country={previewValues.country}
        text={sanitizedText}
      />
      {overRedacted && (
        <p data-testid="composer-over-redacted" className="text-sm text-warning">
          Most of what you wrote was redacted. Edit and re-preview.
        </p>
      )}
      {typeof error === 'string' && error !== '' && (
        <p data-testid="composer-submit-error" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" size="md" disabled={submitting} onClick={onEdit} data-testid="composer-edit">
          Edit
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={disabled}
          loading={submitting}
          onClick={onPost}
          data-testid="composer-post"
        >
          {typeof error === 'string' && error !== '' ? 'Retry' : 'Post'}
        </Button>
      </div>
    </div>
  )
}
