import { Button } from '@/components/ui/Button'

/** Props for the success-banner composer state. */
export interface PostedComposerProps {
  onAnother: () => void
}

/** "Posted." banner with a Post-another reset action. */
export function PostedComposer({ onAnother }: PostedComposerProps) {
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
