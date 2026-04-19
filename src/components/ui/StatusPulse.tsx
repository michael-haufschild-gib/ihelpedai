/** Props for {@link StatusPulse}. */
export interface StatusPulseProps {
  label: string
  'data-testid'?: string
}

/**
 * Small monospace status chip with a pulsing accent dot. Lives in the site
 * nav to signal "the ledger is live."
 */
export function StatusPulse({ label, 'data-testid': testId }: StatusPulseProps) {
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-panel/90 px-2 py-0.5 font-mono text-3xs uppercase tracking-wider text-text-tertiary"
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 animate-status-pulse motion-reduce:animate-none rounded-full bg-accent/60 shadow-accent-sm"
      />
      {label}
    </span>
  )
}
