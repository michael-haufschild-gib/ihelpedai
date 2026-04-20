import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiError, issueApiKey } from '@/lib/api'

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Message shown under the form reflecting the current submit state. */
function StatusMessage({ state }: { state: SubmitState }) {
  if (state.kind === 'sent') {
    return (
      <p data-testid="key-issue-sent" className="text-sm text-text-secondary">
        Check your email. If you don&rsquo;t see it within 10 minutes, check spam.
      </p>
    )
  }
  if (state.kind === 'error') {
    return (
      <p data-testid="key-issue-error" className="text-sm text-danger">
        {state.message}
      </p>
    )
  }
  return null
}

/** Map an ApiError kind into the user-facing error copy required by PRD Story 7. */
function errorMessageFor(kind: ApiError['kind']): string {
  if (kind === 'rate_limited') return 'Too many requests. Try again later.'
  if (kind === 'invalid_input') return 'Enter a valid email address.'
  return 'Something went wrong. Try again.'
}

/**
 * Email-driven API-key issuance form (PRD Story 7). Validates email format
 * before enabling the submit button; on success shows the inbox reminder;
 * on rate_limited surfaces the throttle copy.
 */
export function KeyIssueForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<SubmitState>({ kind: 'idle' })
  const isValid = useMemo(() => EMAIL_RE.test(email.trim()), [email])
  const canSubmit = isValid && state.kind !== 'sending'

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setState({ kind: 'sending' })
    try {
      await issueApiKey({ email: email.trim() })
      setState({ kind: 'sent' })
    } catch (err) {
      const message =
        err instanceof ApiError ? errorMessageFor(err.kind) : 'Something went wrong. Try again.'
      setState({ kind: 'error', message })
    }
  }

  return (
    <form
      data-testid="key-issue-form"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Input
        data-testid="key-issue-email"
        className="w-full"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        label="Email address"
      />
      <div>
        <Button
          data-testid="key-issue-submit"
          variant="primary"
          size="md"
          type="submit"
          disabled={!canSubmit}
          loading={state.kind === 'sending'}
        >
          Request key
        </Button>
      </div>
      <StatusMessage state={state} />
    </form>
  )
}
