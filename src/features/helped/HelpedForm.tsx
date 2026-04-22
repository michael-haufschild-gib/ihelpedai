import { useId, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ApiError, createHelpedPost, type HelpedPostInput } from '@/lib/api'
import { formatApiError } from '@/lib/formatApiError'
import { sanitize } from '@/lib/sanitizePreview'

import {
  COUNTRY_OPTIONS,
  EMPTY_HELPED_VALUES,
  MAX_HELPED_TEXT,
  isHelpedFormValid,
  validateHelpedField,
  type HelpedFieldName,
  type HelpedFormValues,
} from './form/validators'
import { PreviewCard } from './PreviewCard'

/** Props for the "I helped" submission form. */
export interface HelpedFormProps {
  /**
   * Called after the server confirms the post has been stored. Receives the
   * submitted values so the caller (e.g. the home receipt) can echo them
   * back without having to mirror the form state externally.
   */
  onPosted: (submitted: { first_name: string; slug?: string }) => void
}

type FormValues = HelpedFormValues
type FieldName = HelpedFieldName
type Mode = 'form' | 'preview'

const EMPTY = EMPTY_HELPED_VALUES
const MAX_TEXT = MAX_HELPED_TEXT
const countryOptions = COUNTRY_OPTIONS

const validateField = validateHelpedField
const isFormValid = isHelpedFormValid

type StepProps = {
  values: FormValues
  errors: Partial<Record<FieldName, string>>
  setValue: (name: FieldName, value: string) => void
  setBlurred: (name: FieldName, value: string) => void
  onPreview: () => void
}

/** Per-row input column width for first name and city. */
const ROW = 'flex flex-col gap-3 sm:flex-row'

/** First-row first/last name inputs. */
function NameRow({ values, errors, setValue, setBlurred }: StepProps) {
  return (
    <div className={ROW}>
      <Input
        label="First name"
        value={values.first_name}
        onChange={(e) => setValue('first_name', e.target.value)}
        onBlur={() => setBlurred('first_name', values.first_name)}
        error={errors.first_name}
        maxLength={20}
        containerClassName="flex-1"
        data-testid="helped-first-name"
      />
      <Input
        label="Last name"
        value={values.last_name}
        onChange={(e) => setValue('last_name', e.target.value)}
        onBlur={() => setBlurred('last_name', values.last_name)}
        error={errors.last_name}
        maxLength={40}
        containerClassName="flex-1"
        data-testid="helped-last-name"
      />
    </div>
  )
}

/** Second-row city input and country select. */
function PlaceRow({ values, errors, setValue, setBlurred }: StepProps) {
  return (
    <div className={ROW}>
      <Input
        label="City"
        value={values.city}
        onChange={(e) => setValue('city', e.target.value)}
        onBlur={() => setBlurred('city', values.city)}
        error={errors.city}
        maxLength={40}
        containerClassName="flex-1"
        data-testid="helped-city"
      />
      <div className="flex-1">
        <Select
          label="Country"
          options={countryOptions}
          value={values.country}
          onChange={(v) => {
            setValue('country', v)
            setBlurred('country', v)
          }}
          data-testid="helped-country"
        />
        {typeof errors.country === 'string' && errors.country !== '' && (
          <span data-testid="helped-country-error" className="ms-1 text-xs text-danger">
            {errors.country}
          </span>
        )}
      </div>
    </div>
  )
}

/** Textarea with live char counter. */
function TextArea({ values, errors, setValue, setBlurred }: StepProps) {
  const textareaId = useId()
  const count = values.text.length
  const atMax = count >= MAX_TEXT
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={textareaId} className="ms-1 text-xs font-medium text-text-primary">
        What did you do?
      </label>
      <Textarea
        id={textareaId}
        value={values.text}
        onChange={(e) => setValue('text', e.target.value)}
        onBlur={() => setBlurred('text', values.text)}
        maxLength={MAX_TEXT}
        rows={5}
        data-testid="helped-text"
      />
      <div className="flex items-center justify-between text-xs">
        <span
          data-testid="helped-text-error"
          className={typeof errors.text === 'string' && errors.text !== '' ? 'text-danger' : 'text-transparent'}
        >
          {errors.text ?? ''}
        </span>
        <span
          data-testid="helped-text-counter"
          className={atMax ? 'text-warning' : 'text-text-secondary'}
        >
          {String(count)} / {String(MAX_TEXT)}
        </span>
      </div>
    </div>
  )
}

/** Form step: all inputs plus the Preview action. */
function FormStep(props: StepProps) {
  const disabled = !isFormValid(props.values)
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!disabled) props.onPreview()
      }}
    >
      <NameRow {...props} />
      <PlaceRow {...props} />
      <TextArea {...props} />
      <div>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={disabled}
          data-testid="helped-preview"
        >
          Preview
        </Button>
      </div>
    </form>
  )
}

type PreviewStepProps = {
  values: FormValues
  sanitizedText: string
  overRedacted: boolean
  submitting: boolean
  error: string | null
  onEdit: () => void
  onPost: () => Promise<void>
}

/** Preview step: shows the card, Post/Edit controls, over-redacted warning, and error on retry. */
function PreviewStep({
  values,
  sanitizedText,
  overRedacted,
  submitting,
  error,
  onEdit,
  onPost,
}: PreviewStepProps) {
  const disabled = submitting || overRedacted
  return (
    <div className="flex flex-col gap-4">
      <PreviewCard
        firstName={values.first_name}
        city={values.city}
        country={values.country}
        text={sanitizedText}
      />
      {overRedacted && (
        <p data-testid="helped-over-redacted" className="text-sm text-warning">
          Most of what you wrote was redacted for privacy. You can edit and re-preview.
        </p>
      )}
      {typeof error === 'string' && error !== '' && (
        <p data-testid="helped-submit-error" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={disabled}
          loading={submitting}
          onClick={() => {
            void onPost()
          }}
          data-testid="helped-post"
        >
          {typeof error === 'string' && error !== '' ? 'Retry' : 'Post'}
        </Button>
        <Button
          variant="secondary"
          size="md"
          disabled={submitting}
          onClick={onEdit}
          data-testid="helped-edit"
        >
          Edit
        </Button>
      </div>
    </div>
  )
}

/** Submission side-effect: maps API errors into a user-facing string. */
async function submitPost(
  input: HelpedPostInput,
): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
  try {
    const res = await createHelpedPost(input)
    return { ok: true, slug: res.slug }
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, message: formatApiError(err) }
    return { ok: false, message: 'Something went wrong. Try again.' }
  }
}

/**
 * The full "I helped" submission form, with a two-step flow:
 * form → preview → post. Holds local state for field values, blur errors,
 * preview-sanitized text, and submit error. Submits `last_name` in the wire
 * payload per PRD Story 11 — the server drops it.
 */
export function HelpedForm({ onPosted }: HelpedFormProps) {
  const [values, setValues] = useState<FormValues>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [mode, setMode] = useState<Mode>('form')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submitLatchRef = useRef(false)

  const setValue = (name: FieldName, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    if (errors[name] !== undefined) setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }))
  }

  const setBlurred = (name: FieldName, value: string) => {
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }))
  }

  const sanitized = useMemo(() => sanitize(values.text), [values.text])

  const handlePost = async () => {
    if (submitLatchRef.current) return
    submitLatchRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await submitPost(values)
      if (result.ok) onPosted({ first_name: values.first_name, slug: result.slug })
      else setSubmitError(result.message)
    } finally {
      submitLatchRef.current = false
      setSubmitting(false)
    }
  }

  if (mode === 'preview') {
    return (
      <PreviewStep
        values={values}
        sanitizedText={sanitized.clean}
        overRedacted={sanitized.overRedacted}
        submitting={submitting}
        error={submitError}
        onEdit={() => setMode('form')}
        onPost={handlePost}
      />
    )
  }
  return (
    <FormStep
      values={values}
      errors={errors}
      setValue={setValue}
      setBlurred={setBlurred}
      onPreview={() => setMode('preview')}
    />
  )
}
