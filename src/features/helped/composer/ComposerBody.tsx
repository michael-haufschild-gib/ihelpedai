import { AnimatePresence, m } from 'motion/react'
import type { Ref } from 'react'

import { isHelpedFormValid } from '@/features/helped/form/validators'

import { ClosedComposer } from './ClosedComposer'
import { EditingComposer } from './EditingComposer'
import { PostedComposer } from './PostedComposer'
import { PreviewingComposer } from './PreviewingComposer'
import type { ComposerFieldsProps } from './types'
import type { ComposerState } from './useComposerState'

/** Callback bag wired by the orchestrator into the body subcomponents. */
export interface ComposerCallbacks {
  open: () => void
  cancel: () => void
  preview: () => void
  edit: () => void
  post: () => void
}

/** Sanitised preview state passed in from the orchestrator. */
export interface ComposerSanitised {
  clean: string
  overRedacted: boolean
}

/** Props for {@link ComposerBody}. */
export interface ComposerBodyProps {
  state: ComposerState
  fields: ComposerFieldsProps
  sanitized: ComposerSanitised
  cb: ComposerCallbacks
  /** Ref forwarded to the prompt button so the orchestrator can refocus it. */
  closedButtonRef?: Ref<HTMLButtonElement>
}

/** Renders one of four mode-specific layouts inside the composer shell. */
export function ComposerBody({ state, fields, sanitized, cb, closedButtonRef }: ComposerBodyProps) {
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
          <ClosedComposer onOpen={cb.open} buttonRef={closedButtonRef} />
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
