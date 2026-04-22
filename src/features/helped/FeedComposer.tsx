import { useEffect, useMemo, useRef } from 'react'

import { ApiError, createHelpedPost } from '@/lib/api'
import { formatApiError } from '@/lib/formatApiError'
import { bumpLoyalty } from '@/lib/loyalty'
import { sanitize } from '@/lib/sanitizePreview'

import { ComposerBody, type ComposerCallbacks } from './composer/ComposerBody'
import type { ComposerFieldsProps } from './composer/types'
import { useComposerState } from './composer/useComposerState'

/** Props for the feed-top composer. */
export interface FeedComposerProps {
  /** Called after a post is accepted; parent refetches its list. */
  onPosted?: () => void
}

/**
 * Social-media-style quick composer. Starts collapsed with the prompt
 * "How have you helped AI today?"; expands to the full form inline and
 * walks the user through form → preview → post, mirroring the sanitizer
 * invariant required of every submission surface. Calls `onPosted` after
 * a successful submission so the parent feed can refetch.
 *
 * Mode-specific subcomponents live in {@link ./composer}; this orchestrator
 * owns submit + autofocus + the in-flight latch and stays well under the
 * file-length cap.
 */
export function FeedComposer({ onPosted }: FeedComposerProps) {
  const state = useComposerState()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const inFlightRef = useRef(false)
  const sanitized = useMemo(() => sanitize(state.values.text), [state.values.text])

  const submit = (): void => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    state.setSubmitting(true)
    state.setSubmitError(null)
    createHelpedPost(state.values)
      .then(() => {
        bumpLoyalty()
        inFlightRef.current = false
        state.setSubmitting(false)
        state.setMode('posted')
        state.reset()
        onPosted?.()
      })
      .catch((err: unknown) => {
        inFlightRef.current = false
        state.setSubmitting(false)
        if (err instanceof ApiError) state.setSubmitError(formatApiError(err))
        else state.setSubmitError('Something went wrong. Try again.')
      })
  }

  const cb: ComposerCallbacks = {
    open: () => state.setMode('editing'),
    cancel: () => {
      state.setMode('closed')
      state.reset()
    },
    preview: () => state.setMode('previewing'),
    edit: () => state.setMode('editing'),
    post: submit,
  }

  // Autofocus the body field once the composer enters editing mode. The
  // 80ms delay lets the AnimatePresence enter transition settle before we
  // grab focus, otherwise the Tailwind transition can fight the focus call.
  useEffect(() => {
    if (state.mode !== 'editing') return
    const t = window.setTimeout(() => textareaRef.current?.focus(), 80)
    return () => {
      window.clearTimeout(t)
    }
  }, [state.mode])

  const fields: ComposerFieldsProps = {
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
