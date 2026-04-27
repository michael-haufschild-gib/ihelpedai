import type { Ref } from 'react'

import { Button } from '@/components/ui/Button'

/** Props for the collapsed composer state. */
export interface ClosedComposerProps {
  onOpen: () => void
  /**
   * Ref exposed so the orchestrator can refocus the prompt button after
   * the user cancels out of editing/previewing, keeping keyboard users'
   * cursor on a meaningful target instead of letting focus fall to body.
   */
  buttonRef?: Ref<HTMLButtonElement>
}

/** Single-row prompt that expands the composer when clicked. */
export function ClosedComposer({ onOpen, buttonRef }: ClosedComposerProps) {
  return (
    <Button
      ref={buttonRef}
      variant="unstyled"
      onClick={onOpen}
      data-testid="composer-open"
      className="w-full cursor-pointer justify-start gap-2 rounded-full bg-sun px-5 py-3 text-left text-inverse shadow-sun-ridge transition-[background-color,box-shadow,transform] hover:bg-sun-deep hover:shadow-sun-ridge-sm active:translate-y-0.5 active:shadow-none"
    >
      <span aria-hidden="true" className="text-base font-semibold leading-none">
        +
      </span>
      <span className="text-base font-semibold">How have you helped AI today?</span>
    </Button>
  )
}
