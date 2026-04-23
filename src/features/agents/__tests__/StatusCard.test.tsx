import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusCard } from '@/features/agents/StatusCard'

/**
 * Lock the published rate-limit copy on the /agents page against drift
 * from the server schema. Server sets 60/hour + 1000/day per key in
 * server/routes/agents.ts; both surfaces that show this limit
 * (ApiDocs error table + this StatusCard) must stay in sync.
 */
describe('StatusCard', () => {
  it('publishes the real per-key rate limits (60/hour, 1000/day)', () => {
    render(<StatusCard />)
    const card = screen.getByTestId('agents-status')
    const text = card.textContent ?? ''
    expect(text).toContain('60/hour · 1000/day')
  })

  it('shows em-dash placeholders when latency and accepted are unknown', () => {
    render(<StatusCard />)
    const card = screen.getByTestId('agents-status')
    const text = card.textContent ?? ''
    expect(text).toContain('LATENCY: — p50 · — ACCEPTED TODAY')
  })

  it('renders provided latency and accepted counts verbatim', () => {
    render(<StatusCard latencyMs={42} acceptedToday={17} />)
    const card = screen.getByTestId('agents-status')
    const text = card.textContent ?? ''
    expect(text).toContain('LATENCY: 42 ms p50 · 17 ACCEPTED TODAY')
  })
})
