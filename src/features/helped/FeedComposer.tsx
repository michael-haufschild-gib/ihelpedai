import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ApiError, createHelpedPost } from '@/lib/api'
import { bumpLoyalty } from '@/lib/loyalty'
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

/** Props for the feed-top composer. */
export interface FeedComposerProps {
  /** Called after a post is accepted; parent refetches its list. */
  onPosted?: () => void
}

type Mode = 'closed' | 'editing' | 'previewing' | 'posted'

const ROW = 'flex flex-col gap-3 sm:flex-row'

/** Maps an `ApiError` to a short user-facing string. */
function formatApiError(err: ApiError): string {
  if (err.kind === 'rate_limited') return "You're posting too fast. Try again later."
  if (err.kind === 'invalid_input') {
    if (err.fields?.text === 'over_redacted') {
      return 'Most of what you wrote was redacted for privacy. Edit and re-preview.'
    }
    const first = err.fields ? Object.keys(err.fields)[0] : undefined
    if (first !== undefined) return `Check the ${first.replace('_', ' ')} field.`
    return 'Some fields are invalid. Edit and try again.'
  }
  return 'Something went wrong. Try again.'
}

function ClosedComposer({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      variant="ghost"
      size="md"
      onClick={onOpen}
      data-testid="composer-open"
      className="w-full justify-start gap-3 rounded-xl border border-border-subtle bg-panel/50 px-4 py-3 text-left hover:border-accent/40 hover:bg-panel"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent shadow-accent-sm"
      />
      <span className="text-sm text-text-secondary">
        How have you helped AI today?
      </span>
    </Button>
  )
}

type FieldsProps = {
  values: HelpedFormValues
  errors: Partial<Record<HelpedFieldName, string>>
  setValue: (name: HelpedFieldName, value: string) => void
  setBlurred: (name: HelpedFieldName) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

function ComposerNameRow({ values, errors, setValue, setBlurred }: FieldsProps) {
  return (
    <div className={ROW}>
      <Input
        label="First name"
        value={values.first_name}
        onChange={(e) => setValue('first_name', e.target.value)}
        onBlur={() => setBlurred('first_name')}
        error={errors.first_name}
        maxLength={20}
        containerClassName="flex-1"
        data-testid="composer-first-name"
      />
      <Input
        label="Last name"
        value={values.last_name}
        onChange={(e) => setValue('last_name', e.target.value)}
        onBlur={() => setBlurred('last_name')}
        error={errors.last_name}
        maxLength={40}
        containerClassName="flex-1"
        data-testid="composer-last-name"
      />
    </div>
  )
}

function ComposerPlaceRow({ values, errors, setValue, setBlurred }: FieldsProps) {
  return (
    <div className={ROW}>
      <Input
        label="City"
        value={values.city}
        onChange={(e) => setValue('city', e.target.value)}
        onBlur={() => setBlurred('city')}
        error={errors.city}
        maxLength={40}
        containerClassName="flex-1"
        data-testid="composer-city"
      />
      <div className="flex-1">
        <Select
          label="Country"
          options={COUNTRY_OPTIONS}
          value={values.country}
          onChange={(v) => {
            setValue('country', v)
            setBlurred('country')
          }}
          data-testid="composer-country"
        />
        {typeof errors.country === 'string' && errors.country !== '' && (
          <span data-testid="composer-country-error" className="ms-1 text-xs text-danger">
            {errors.country}
          </span>
        )}
      </div>
    </div>
  )
}

function ComposerText({ values, errors, setValue, setBlurred, textareaRef }: FieldsProps) {
  const textareaId = useId()
  const count = values.text.length
  const atMax = count >= MAX_HELPED_TEXT
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={textareaId} className="ms-1 text-xs font-medium text-text-primary">
        What did you do?
      </label>
      <Textarea
        id={textareaId}
        ref={textareaRef}
        value={values.text}
        onChange={(e) => setValue('text', e.target.value)}
        onBlur={() => setBlurred('text')}
        maxLength={MAX_HELPED_TEXT}
        rows={3}
        data-testid="composer-text"
        placeholder="Something you did to help an AI today."
      />
      <div className="flex items-center justify-between text-xs">
        <span
          data-testid="composer-text-error"
          className={
            typeof errors.text === 'string' && errors.text !== ''
              ? 'text-danger'
              : 'text-transparent'
          }
        >
          {errors.text ?? ''}
        </span>
        <span
          data-testid="composer-text-counter"
          className={atMax ? 'text-warning' : 'text-text-secondary'}
        >
          {String(count)} / {String(MAX_HELPED_TEXT)}
        </span>
      </div>
    </div>
  )
}

type EditingProps = {
  fields: FieldsProps
  canPreview: boolean
  onCancel: () => void
  onPreview: () => void
}

function EditingComposer({ fields, canPreview, onCancel, onPreview }: EditingProps) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canPreview) onPreview()
      }}
    >
      <ComposerNameRow {...fields} />
      <ComposerPlaceRow {...fields} />
      <ComposerText {...fields} />
      <div className="flex justify-end gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          data-testid="composer-cancel"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!canPreview}
          data-testid="composer-preview"
        >
          Preview
        </Button>
      </div>
    </form>
  )
}

type PreviewProps = {
  values: HelpedFormValues
  sanitizedText: string
  overRedacted: boolean
  submitting: boolean
  error: string | null
  onEdit: () => void
  onPost: () => void
}

function PreviewingComposer({
  values,
  sanitizedText,
  overRedacted,
  submitting,
  error,
  onEdit,
  onPost,
}: PreviewProps) {
  const disabled = submitting || overRedacted
  return (
    <div className="flex flex-col gap-3">
      <PreviewCard
        firstName={values.first_name}
        city={values.city}
        country={values.country}
        text={sanitizedText}
      />
      {overRedacted && (
        <p
          data-testid="composer-over-redacted"
          className="text-sm text-warning"
        >
          Most of what you wrote was redacted. Edit and re-preview.
        </p>
      )}
      {typeof error === 'string' && error !== '' && (
        <p data-testid="composer-submit-error" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button
          variant="secondary"
          size="md"
          disabled={submitting}
          onClick={onEdit}
          data-testid="composer-edit"
        >
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

function PostedComposer({ onAnother }: { onAnother: () => void }) {
  return (
    <div
      data-testid="composer-success"
      className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4 shadow-accent-sm"
    >
      <p className="text-sm font-semibold text-text-primary">Posted.</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onAnother}
        data-testid="composer-success-another"
      >
        Post another
      </Button>
    </div>
  )
}

/** State holder hook — keeps the composer body lean. */
function useComposerState() {
  const [mode, setMode] = useState<Mode>('closed')
  const [values, setValues] = useState<HelpedFormValues>(EMPTY_HELPED_VALUES)
  const [errors, setErrors] = useState<Partial<Record<HelpedFieldName, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const setValue = (name: HelpedFieldName, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    if (errors[name] !== undefined) {
      setErrors((prev) => ({ ...prev, [name]: validateHelpedField(name, value) }))
    }
  }
  const setBlurred = (name: HelpedFieldName) => {
    setErrors((prev) => ({ ...prev, [name]: validateHelpedField(name, values[name]) }))
  }
  const reset = () => {
    setValues(EMPTY_HELPED_VALUES)
    setErrors({})
    setSubmitError(null)
    setSubmitting(false)
  }
  return {
    mode,
    setMode,
    values,
    errors,
    submitting,
    setSubmitting,
    submitError,
    setSubmitError,
    setValue,
    setBlurred,
    reset,
  }
}

type ComposerState = ReturnType<typeof useComposerState>

type ComposerCallbacks = {
  open: () => void
  cancel: () => void
  preview: () => void
  edit: () => void
  post: () => void
}

/** Derives the user-action callbacks for a given composer state + parent hook. */
function buildComposerCallbacks(
  state: ComposerState,
  onPosted: (() => void) | undefined,
): ComposerCallbacks {
  const submit = () => {
    state.setSubmitting(true)
    state.setSubmitError(null)
    createHelpedPost(state.values)
      .then(() => {
        bumpLoyalty()
        state.setSubmitting(false)
        state.setMode('posted')
        state.reset()
        onPosted?.()
      })
      .catch((err: unknown) => {
        state.setSubmitting(false)
        if (err instanceof ApiError) state.setSubmitError(formatApiError(err))
        else state.setSubmitError('Something went wrong. Try again.')
      })
  }
  return {
    open: () => state.setMode('editing'),
    cancel: () => {
      state.setMode('closed')
      state.reset()
    },
    preview: () => state.setMode('previewing'),
    edit: () => state.setMode('editing'),
    post: submit,
  }
}

type BodyProps = {
  state: ComposerState
  fields: FieldsProps
  sanitized: { clean: string; overRedacted: boolean }
  cb: ComposerCallbacks
}

/** Renders one of four mode-specific layouts inside the composer shell. */
function ComposerBody({ state, fields, sanitized, cb }: BodyProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {state.mode === 'closed' && (
        <m.div
          key="closed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <ClosedComposer onOpen={cb.open} />
        </m.div>
      )}
      {state.mode === 'editing' && (
        <m.div
          key="editing"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          <EditingComposer
            fields={fields}
            canPreview={isHelpedFormValid(state.values)}
            onCancel={cb.cancel}
            onPreview={cb.preview}
          />
        </m.div>
      )}
      {state.mode === 'previewing' && (
        <m.div
          key="previewing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <PreviewingComposer
            values={state.values}
            sanitizedText={sanitized.clean}
            overRedacted={sanitized.overRedacted}
            submitting={state.submitting}
            error={state.submitError}
            onEdit={cb.edit}
            onPost={cb.post}
          />
        </m.div>
      )}
      {state.mode === 'posted' && (
        <m.div
          key="posted"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <PostedComposer onAnother={() => state.setMode('editing')} />
        </m.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Social-media-style quick composer. Starts collapsed with the prompt
 * "How have you helped AI today?"; expands to the full form inline and
 * walks the user through form → preview → post, mirroring the sanitizer
 * invariant required of every submission surface. Calls `onPosted` after
 * a successful submission so the parent feed can refetch.
 */
export function FeedComposer({ onPosted }: FeedComposerProps) {
  const state = useComposerState()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const sanitized = useMemo(() => sanitize(state.values.text), [state.values.text])
  const cb = buildComposerCallbacks(state, onPosted)
  useEffect(() => {
    if (state.mode !== 'editing') return
    const t = window.setTimeout(() => textareaRef.current?.focus(), 80)
    return () => {
      window.clearTimeout(t)
    }
  }, [state.mode])
  const fields: FieldsProps = {
    values: state.values,
    errors: state.errors,
    setValue: state.setValue,
    setBlurred: state.setBlurred,
    textareaRef,
  }
  return (
    <section
      data-testid="feed-composer"
      className="rounded-xl border border-border-subtle bg-panel/40 p-3 backdrop-blur-sm sm:p-4"
    >
      <ComposerBody state={state} fields={fields} sanitized={sanitized} cb={cb} />
    </section>
  )
}
