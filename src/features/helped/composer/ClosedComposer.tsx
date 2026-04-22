import { Button } from '@/components/ui/Button'

/** Props for the collapsed composer state. */
export interface ClosedComposerProps {
  onOpen: () => void
}

/** Single-row prompt that expands the composer when clicked. */
export function ClosedComposer({ onOpen }: ClosedComposerProps) {
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
