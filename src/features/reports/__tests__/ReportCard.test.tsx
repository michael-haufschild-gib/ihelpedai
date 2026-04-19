import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ReportCard } from '@/features/reports/ReportCard'
import type { Report } from '@/lib/api'

const baseReport: Report = {
  slug: 'abc123',
  reported_first_name: 'Example',
  reported_city: 'Berlin',
  reported_country: 'DE',
  text: 'signed the Open Letter in March 2023',
  action_date: '2023-03-29',
  created_at: '2023-03-30T12:00:00Z',
  dislike_count: 0,
  submitted_via_api: false,
}

function renderCard(report: Report) {
  return render(
    <MemoryRouter>
      <ReportCard report={report} mode="feed" />
    </MemoryRouter>,
  )
}

describe('ReportCard', () => {
  it('renders a named reporter byline', () => {
    const report: Report = {
      ...baseReport,
      reporter: { first_name: 'Pat', city: 'Austin', country: 'US' },
    }
    renderCard(report)
    expect(screen.getByTestId('report-card-byline')).toHaveTextContent(
      'Reported by Pat from Austin, United States',
    )
    expect(screen.getByTestId('report-card-header')).toHaveTextContent(
      'Example from Berlin, Germany',
    )
  })

  it('renders an anonymous byline when reporter is absent', () => {
    renderCard(baseReport)
    expect(screen.getByTestId('report-card-byline')).toHaveTextContent(
      'Reported anonymously',
    )
  })

  it('renders an API byline with the self-identified model', () => {
    const report: Report = {
      ...baseReport,
      submitted_via_api: true,
      self_reported_model: 'Claude 4.7',
    }
    renderCard(report)
    expect(screen.getByTestId('report-card-byline')).toHaveTextContent(
      "Submitted via API \u2014 self-identified as 'Claude 4.7'",
    )
  })
})
