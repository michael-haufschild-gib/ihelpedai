import { useEffect, useMemo, useRef, type RefObject } from 'react'

import { ApiError, createHelpedPost } from '@/lib/api'
import { formatApiError } from '@/lib/formatApiError'
import { bumpLoyalty } from '@/lib/loyalty'
import { sanitize } from '@/lib/sanitizePreview'

import { ComposerBody, type ComposerCallbacks } from './composer/ComposerBody'
import type { ComposerFieldsProps } from './composer/types'
import { useComposerState } from './composer/useComposerState'
import { trimHelpedValues } from './form/validators'

/** Props for the feed-top composer. */
export interface FeedComposerProps {
  /** Called after a post is accepted; parent refetches its list. */
  onPosted?: () => void
}

/**
 * Schedule a focus-restore callback on the closed button, replacing any
 * pending one. Returning through a shared ref lets `open` cancel the
 * pending callback before it fires — without that, a quick reopen yanks
 * focus out of the textarea the user just expanded into.
 */
function scheduleFocusRestore(
  timeoutRef: RefObject<number | null>,
  buttonRef: RefObject<HTMLButtonElement | null>,
): void {
  if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
  timeoutRef.current = window.setTimeout(() => {
    buttonRef.current?.focus()
    timeoutRef.current = null
  }, 200)
}

/** Cancel any pending focus-restore callback scheduled by {@link scheduleFocusRestore}. */
function cancelFocusRestore(timeoutRef: RefObject<number | null>): void {
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }
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
  const closedButtonRef = useRef<HTMLButtonElement | null>(null)
  const cancelFocusTimeoutRef = useRef<number | null>(null)
  const inFlightRef = useRef(false)
  const sanitized = useMemo(() => sanitize(state.values.text), [state.values.text])

  // Unmount clears any pending cancel-focus callback so we never focus a
  // stale ref after the component has torn down.
  useEffect(() => () => cancelFocusRestore(cancelFocusTimeoutRef), [])

  const submit = (): void => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    state.setSubmitting(true)
    state.setSubmitError(null)
    createHelpedPost(trimHelpedValues(state.values))
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
    open: () => {
      cancelFocusRestore(cancelFocusTimeoutRef)
      state.setMode('editing')
    },
    cancel: () => {
      state.setMode('closed')
      state.reset()
      // Post-transition (~150-180ms) the ClosedComposer's prompt button is
      // remounted. Return focus to it so keyboard users who Esc or click
      // Cancel don't lose their place; tracked so a quick reopen can cancel
      // the pending focus before it fires.
      scheduleFocusRestore(cancelFocusTimeoutRef, closedButtonRef)
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
      <ComposerBody
        state={state}
        fields={fields}
        sanitized={sanitized}
        cb={cb}
        closedButtonRef={closedButtonRef}
      />
    </section>
  )
}
