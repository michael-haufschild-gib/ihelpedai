import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CountBar } from '@/features/home/CountBar'

/**
 * CountBar's job is to keep the partial-failure UI contract from
 * useHomeFeed visible: `null` is an endpoint that went down, `0` is the
 * ledger having nothing of that kind yet. Collapsing the two into `0`
 * would read as misleadingly authoritative when the failure is upstream.
 */
describe('CountBar', () => {
  it('renders each cell with the localized total when all endpoints succeed', () => {
    render(
      <CountBar totals={{ posts: 1234, reports: 7, agents: 42 }} />,
    )
    expect(screen.getByTestId('count-deeds')).toHaveTextContent('1,234')
    expect(screen.getByTestId('count-reports')).toHaveTextContent('7')
    expect(screen.getByTestId('count-agents')).toHaveTextContent('42')
  })

  it('renders "—" for a cell whose endpoint failed (null total)', () => {
    render(
      <CountBar totals={{ posts: 5, reports: null, agents: 2 }} />,
    )
    expect(screen.getByTestId('count-reports')).toHaveTextContent('—')
    // The other cells still show numbers — a single failure must not
    // poison the adjacent cells.
    expect(screen.getByTestId('count-deeds')).toHaveTextContent('5')
    expect(screen.getByTestId('count-agents')).toHaveTextContent('2')
  })

  it('only attaches the "temporarily unavailable" aria-label to unavailable cells', () => {
    render(
      <CountBar totals={{ posts: 5, reports: null, agents: 2 }} />,
    )
    expect(screen.getByTestId('count-reports')).toHaveAttribute(
      'aria-label',
      'Sceptics reported: temporarily unavailable',
    )
    // Available cells must not carry a stale aria-label — it would be read
    // aloud redundantly next to the visible number.
    expect(screen.getByTestId('count-deeds')).not.toHaveAttribute('aria-label')
    expect(screen.getByTestId('count-agents')).not.toHaveAttribute('aria-label')
  })

  it('shows "—" in every cell when totals is null (pre-fetch state)', () => {
    render(<CountBar totals={null} />)
    expect(screen.getByTestId('count-deeds')).toHaveTextContent('—')
    expect(screen.getByTestId('count-reports')).toHaveTextContent('—')
    expect(screen.getByTestId('count-agents')).toHaveTextContent('—')
  })

  it('renders "0" (not "—") when a total is legitimately zero', () => {
    // The core contract that distinguishes "nothing on file yet" (0) from
    // "endpoint down" (null). Regressing this breaks the product lie:
    // an empty feed would read as broken.
    render(<CountBar totals={{ posts: 0, reports: 0, agents: 0 }} />)
    expect(screen.getByTestId('count-deeds')).toHaveTextContent('0')
    expect(screen.getByTestId('count-reports')).toHaveTextContent('0')
    expect(screen.getByTestId('count-agents')).toHaveTextContent('0')
  })
})
