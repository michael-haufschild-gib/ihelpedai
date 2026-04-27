import { useState } from 'react'

import { useHelpedSubmission, type HelpedSubmissionState } from '@/features/helped/form/useHelpedSubmission'

import type { ComposerMode } from './types'

/**
 * State holder for the FeedComposer. Wraps the shared
 * {@link useHelpedSubmission} core (values + errors + submit-latch +
 * sanitiser memo) and adds only what is unique to the composer: the
 * `closed → editing → previewing → posted` lifecycle axis.
 *
 * The standalone {@link HelpedForm} consumes the same core but with a
 * lighter `form ↔ preview` toggle held in the page itself, so the
 * lifecycle does not need to live in this hook.
 */
export function useComposerState(): ComposerState {
  const core = useHelpedSubmission()
  const [mode, setMode] = useState<ComposerMode>('closed')
  return {
    ...core,
    mode,
    setMode,
  }
}

/** Aggregate state shape returned by {@link useComposerState}. */
export type ComposerState = HelpedSubmissionState & {
  mode: ComposerMode
  setMode: (mode: ComposerMode) => void
}
