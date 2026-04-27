import { useCallback, useMemo, useRef, useState } from 'react'

import { sanitize, type SanitizeResult } from '@/lib/sanitizePreview'

import { EMPTY_HELPED_VALUES, validateHelpedField, type HelpedFieldName, type HelpedFormValues } from './validators'

/**
 * Shared form-state core used by every "I helped" submission surface.
 *
 * The two surfaces (the standalone-page {@link HelpedForm} and the inline
 * feed-top {@link FeedComposer}) used to duplicate the same five pieces of
 * state — values, per-field errors, submitting flag, submit error, and an
 * `inFlightRef` to swallow double-clicks — plus the same sanitize memo
 * over `values.text`. Three years of independent edits had drifted the
 * latch logic out of sync (one site keyed on `submitting`, the other on
 * a ref) and a future test that asserted "double-clicking Post does not
 * fire two requests" would land on the wrong call site.
 *
 * This hook owns those mechanics in one place. Lifecycle modes
 * (form↔preview vs closed↔editing↔previewing↔posted) stay in the caller
 * because they're genuinely different state machines — the FeedComposer
 * needs a `closed` and `posted` mode the standalone form doesn't have.
 */
export interface HelpedSubmissionState {
  values: HelpedFormValues
  errors: Partial<Record<HelpedFieldName, string>>
  submitting: boolean
  submitError: string | null
  /**
   * Memoised sanitiser output keyed on `values.text`. Both form surfaces
   * read this on the preview screen, so memoising once here avoids
   * re-running the regex pipeline on every keystroke in the caller.
   */
  sanitized: SanitizeResult
  setValue: (name: HelpedFieldName, value: string) => void
  setBlurred: (name: HelpedFieldName, value: string) => void
  setSubmitting: (next: boolean) => void
  setSubmitError: (next: string | null) => void
  /** Reset values / errors / submit error / submitting flag in one shot. */
  reset: () => void
  /**
   * Reentrancy latch shared by both submission surfaces. A user who
   * double-taps Post in the same React tick must not fire two
   * `createHelpedPost` calls; the `submitting` boolean lags one render,
   * so the second click slips through unless a ref-backed latch
   * intercepts. The ref is kept inside the hook and surfaced through
   * `claimSubmit` / `releaseSubmit` so callers cannot mutate it
   * directly (react-hooks/immutability would flag a raw ref export).
   */
  claimSubmit: () => boolean
  releaseSubmit: () => void
}

/**
 * Construct a fresh state container. The hook deliberately accepts no
 * arguments — every caller starts at empty values; pre-fill via
 * `setValue` after mount if a future page wants seeded defaults.
 */
export function useHelpedSubmission(): HelpedSubmissionState {
  const [values, setValues] = useState<HelpedFormValues>(EMPTY_HELPED_VALUES)
  const [errors, setErrors] = useState<Partial<Record<HelpedFieldName, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submitLatchRef = useRef(false)

  // The sanitised preview is read on every preview-screen render. Memoising
  // on `values.text` keeps the regex pipeline off the keystroke path even
  // when the user is still typing in the form-screen (the memo is cheap
  // when the input doesn't change).
  const sanitized = useMemo(() => sanitize(values.text), [values.text])

  const setValue = (name: HelpedFieldName, value: string): void => {
    setValues((prev) => ({ ...prev, [name]: value }))
    // Read the latest errors via the functional updater — the `errors`
    // captured in render scope can lag a just-dispatched setErrors in
    // tight event sequencing (blur-then-type on the same render),
    // which would re-run validation against a stale map.
    setErrors((prev) => {
      if (prev[name] === undefined) return prev
      return { ...prev, [name]: validateHelpedField(name, value) }
    })
  }

  const setBlurred = (name: HelpedFieldName, value: string): void => {
    setErrors((prev) => ({ ...prev, [name]: validateHelpedField(name, value) }))
  }

  const reset = (): void => {
    setValues(EMPTY_HELPED_VALUES)
    setErrors({})
    setSubmitError(null)
    setSubmitting(false)
    submitLatchRef.current = false
  }

  // `claimSubmit` returns true exactly once per release cycle. Callers
  // pattern: `if (!submission.claimSubmit()) return; … submission.releaseSubmit()`.
  // The two-step API hides the underlying ref so consumers do not
  // mutate state-shaped values returned from a hook (lint rule
  // react-hooks/immutability).
  const claimSubmit = useCallback((): boolean => {
    if (submitLatchRef.current) return false
    submitLatchRef.current = true
    return true
  }, [])

  const releaseSubmit = useCallback((): void => {
    submitLatchRef.current = false
  }, [])

  return {
    values,
    errors,
    submitting,
    submitError,
    sanitized,
    setValue,
    setBlurred,
    setSubmitting,
    setSubmitError,
    reset,
    claimSubmit,
    releaseSubmit,
  }
}
