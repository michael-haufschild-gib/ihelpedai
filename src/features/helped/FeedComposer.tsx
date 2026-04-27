import { useEffect, useRef, type RefObject } from 'react'

import { ApiError, createHelpedPost } from '@/lib/api'
import { formatApiError } from '@/lib/formatApiError'
import { bumpLoyalty } from '@/lib/loyalty'

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
  // `sanitized` and `submitLatchRef` come from the shared
  // `useHelpedSubmission` core via `useComposerState` — both used to be
  // duplicated here with the standalone HelpedForm and the two
  // implementations had drifted. Pulling them off `state` keeps the two
  // submission surfaces locked to the same memoisation and latch
  // semantics.

  // Unmount clears any pending cancel-focus callback so we never focus a
  // stale ref after the component has torn down.
  useEffect(() => () => cancelFocusRestore(cancelFocusTimeoutRef), [])

  const submit = (): void => {
    if (!state.claimSubmit()) return
    state.setSubmitting(true)
    state.setSubmitError(null)
    createHelpedPost(trimHelpedValues(state.values))
      .then(() => {
        bumpLoyalty()
        state.releaseSubmit()
        state.setSubmitting(false)
        state.setMode('posted')
        state.reset()
        onPosted?.()
      })
      .catch((err: unknown) => {
        state.releaseSubmit()
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

  // Autofocus the body field once the composer enters editing mode.
  // AnimatePresence runs in `mode="wait"`, so the closed branch's exit
  // animation (~150ms) finishes BEFORE the editing branch mounts and
  // populates `textareaRef`. A fixed setTimeout would fire while the ref
  // is still null. Poll once per animation frame until the textarea
  // mounts, with a hard frame cap so a never-mounting branch can't spin.
  useEffect(() => {
    if (state.mode !== 'editing') return
    let cancelled = false
    let framesLeft = 30
    const tryFocus = (): void => {
      if (cancelled) return
      const node = textareaRef.current
      if (node !== null) {
        node.focus()
        return
      }
      framesLeft -= 1
      if (framesLeft <= 0) return
      window.requestAnimationFrame(tryFocus)
    }
    window.requestAnimationFrame(tryFocus)
    return () => {
      cancelled = true
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
        sanitized={state.sanitized}
        cb={cb}
        closedButtonRef={closedButtonRef}
      />
    </section>
  )
}
