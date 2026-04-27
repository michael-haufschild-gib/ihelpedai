import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { VoteButton } from '@/components/ui/VoteButton'

/*
 * Lock contract for the VoteButton primitive. Three behaviours:
 *  - Two rapid clicks fire onToggle exactly once (in-flight ref latch)
 *  - onToggle's resolved result is forwarded to onSuccess
 *  - Errors from onToggle are swallowed; the caller's next render is
 *    expected to deliver the authoritative count
 *  - aria-pressed reflects the `voted` prop so AT users hear toggle state
 *  - Disabled prop blocks clicks even before the in-flight latch arms
 */

describe('VoteButton — interaction contract', () => {
  it('two rapid clicks call onToggle exactly once (in-flight latch)', async () => {
    let resolveFirst!: (value: { count: number; voted: boolean }) => void
    const pending = new Promise<{ count: number; voted: boolean }>((r) => {
      resolveFirst = r
    })
    const onToggle = vi.fn().mockReturnValueOnce(pending)
    render(<VoteButton variant="acknowledge" count={3} voted={false} onToggle={onToggle} data-testid="vote" />)
    const user = userEvent.setup()
    const button = screen.getByTestId('vote')
    // Dispatch both clicks before awaiting either — userEvent.click awaits
    // microtasks between calls, so awaiting in series would let the first
    // click's setPending(true) flush and disable the button before the
    // second click could land. Promise.all preserves the race.
    const click1 = user.click(button)
    const click2 = user.click(button)
    await Promise.all([click1, click2])
    expect(onToggle).toHaveBeenCalledTimes(1)
    resolveFirst({ count: 4, voted: true })
    await pending
  })

  it('forwards the toggler result to onSuccess on a successful toggle', async () => {
    const onToggle = vi.fn().mockResolvedValueOnce({ count: 7, voted: true })
    const onSuccess = vi.fn()
    render(
      <VoteButton
        variant="concur"
        count={6}
        voted={false}
        onToggle={onToggle}
        onSuccess={onSuccess}
        data-testid="vote"
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByTestId('vote'))
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ count: 7, voted: true })
    })
  })

  it('swallows toggler errors without throwing or invoking onSuccess', async () => {
    const onToggle = vi.fn().mockRejectedValueOnce(new Error('network down'))
    const onSuccess = vi.fn()
    render(
      <VoteButton
        variant="acknowledge"
        count={1}
        voted={false}
        onToggle={onToggle}
        onSuccess={onSuccess}
        data-testid="vote"
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByTestId('vote'))
    // Wait for the in-flight state to settle; without that, the spec
    // could finish before the rejection propagates and miss a thrown
    // unhandled rejection.
    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledTimes(1)
    })
    expect(onSuccess).not.toHaveBeenCalled()
    // Button remains usable — no permanent disable state from the rejection.
    expect(screen.getByTestId('vote')).not.toBeDisabled()
  })

  it('aria-pressed reflects the voted prop', () => {
    const { rerender } = render(
      <VoteButton variant="acknowledge" count={0} voted={false} onToggle={vi.fn()} data-testid="vote" />,
    )
    expect(screen.getByTestId('vote')).toHaveAttribute('aria-pressed', 'false')
    rerender(<VoteButton variant="acknowledge" count={1} voted onToggle={vi.fn()} data-testid="vote" />)
    expect(screen.getByTestId('vote')).toHaveAttribute('aria-pressed', 'true')
  })

  it('disabled prop blocks toggler invocation entirely', async () => {
    const onToggle = vi.fn()
    render(<VoteButton variant="acknowledge" count={0} voted={false} disabled onToggle={onToggle} data-testid="vote" />)
    const user = userEvent.setup()
    await user.click(screen.getByTestId('vote'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('renders the count via the count-suffixed testid', () => {
    render(<VoteButton variant="concur" count={42} voted={false} onToggle={vi.fn()} data-testid="vote" />)
    expect(screen.getByTestId('vote-count')).toHaveTextContent('42')
  })
})
