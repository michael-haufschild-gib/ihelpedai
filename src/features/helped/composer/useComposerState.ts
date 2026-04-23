import { useState } from 'react'

import {
  EMPTY_HELPED_VALUES,
  validateHelpedField,
  type HelpedFieldName,
  type HelpedFormValues,
} from '@/features/helped/form/validators'

import type { ComposerMode } from './types'

/**
 * State holder for the FeedComposer. Keeps the composer body lean by
 * encapsulating mode + values + per-field errors + in-flight + submit error
 * into a single hook with stable setters. Each mode transition is handled
 * at the call site; this hook only mutates state.
 */
export function useComposerState() {
  const [mode, setMode] = useState<ComposerMode>('closed')
  const [values, setValues] = useState<HelpedFormValues>(EMPTY_HELPED_VALUES)
  const [errors, setErrors] = useState<Partial<Record<HelpedFieldName, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const setValue = (name: HelpedFieldName, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    // Read the latest errors via the functional updater — the
    // `errors` captured in render scope can lag a just-dispatched
    // setErrors in tight event sequencing (e.g. blur-then-type on the
    // same render), which would re-run validation against a stale map.
    setErrors((prev) => {
      if (prev[name] === undefined) return prev
      return { ...prev, [name]: validateHelpedField(name, value) }
    })
  }
  const setBlurred = (name: HelpedFieldName, value: string) => {
    setErrors((prev) => ({ ...prev, [name]: validateHelpedField(name, value) }))
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

/** Aggregate state shape returned by {@link useComposerState}. */
export type ComposerState = ReturnType<typeof useComposerState>
