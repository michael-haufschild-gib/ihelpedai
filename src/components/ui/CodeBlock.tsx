import type { ReactNode } from 'react'

/** Props for {@link CodeBlock}. */
export interface CodeBlockProps {
  /** Small mono label above the code (e.g., "REQUEST"). */
  title?: string
  /** Raw code string. Rendered verbatim; pre-formatted, wrap-preserving. */
  code: string
  /** Visual slant — 'request' is sun/orange, 'response' is green. */
  variant?: 'request' | 'response'
  /** Optional test-id on the root block. */
  'data-testid'?: string
}

/** Tokenise a JSON-like string into highlighted spans. */
function tokenise(code: string): ReactNode[] {
  const pattern = /("(?:[^"\\]|\\.)*"(?:\s*:)?|\b\d+(?:\.\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/g
  const parts = code.split(pattern)
  return parts.map((part, i) => {
    if (part === '') return null
    if (part.startsWith('"')) {
      const isKey = part.endsWith(':')
      return (
        <span
          key={`t-${String(i)}`}
          className={isKey ? 'text-code-key' : 'text-code-string'}
        >
          {part}
        </span>
      )
    }
    if (/^\d/.test(part)) {
      return (
        <span key={`t-${String(i)}`} className="text-code-number">
          {part}
        </span>
      )
    }
    if (part === 'true' || part === 'false' || part === 'null') {
      return (
        <span key={`t-${String(i)}`} className="text-code-literal">
          {part}
        </span>
      )
    }
    return <span key={`t-${String(i)}`}>{part}</span>
  })
}

/**
 * Dark JSON-ish code panel used on the /agents page. A naive highlighter
 * distinguishes keys, strings, numbers, and literals — good enough for the
 * static example payloads we ship.
 */
export function CodeBlock({
  title,
  code,
  variant = 'request',
  'data-testid': testId,
}: CodeBlockProps) {
  const titleTone = variant === 'response' ? 'text-green-deed' : 'text-sun'
  return (
    <div className="rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed text-paper shadow-paper">
      {title !== undefined && title !== '' && (
        <div className={`mb-2 font-mono text-2xs uppercase tracking-[0.18em] ${titleTone}`}>
          {title}
        </div>
      )}
      <pre
        data-testid={testId}
        className="m-0 overflow-x-auto whitespace-pre-wrap break-words text-code-default"
      >
        {tokenise(code)}
      </pre>
    </div>
  )
}
