import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportForm } from '@/features/reports/ReportForm'
import * as api from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    createReport: vi.fn(),
  }
})

function fill(testId: string, value: string): void {
  const el = screen.getByTestId(testId) as HTMLInputElement | HTMLTextAreaElement
  fireEvent.change(el, { target: { value } })
}

function fillReportedRequiredFields(): void {
  fill('rf-reported-first-name', 'Example')
  fill('rf-reported-last-name', 'Person')
  fill('rf-reported-city', 'Berlin')
  const country = screen.getByTestId('rf-reported-country') as HTMLSelectElement
  fireEvent.change(country, { target: { value: 'DE' } })
  fill('rf-what-they-did', 'signed the Open Letter in March 2023')
}

describe('ReportForm — PRD Story 4', () => {
  beforeEach(() => {
    vi.mocked(api.createReport).mockReset()
    vi.mocked(api.createReport).mockResolvedValue({
      slug: 'new123',
      public_url: 'http://localhost/reports/new123',
      status: 'posted',
    })
  })

  it('Scenario 1 — anonymous happy path submits via createReport and calls onSuccess', async () => {
    const onSuccess = vi.fn()
    render(<ReportForm onSuccess={onSuccess} />)
    fillReportedRequiredFields()
    fill('rf-action-date', '2023-03-29')

    fireEvent.click(screen.getByTestId('rf-preview-button'))

    expect(screen.getByTestId('rf-preview-card-byline')).toHaveTextContent(
      'Reported anonymously',
    )
    expect(screen.getByTestId('rf-preview-card-header')).toHaveTextContent(
      'Example from Berlin, Germany',
    )

    fireEvent.click(screen.getByTestId('rf-post'))

    await waitFor(() => {
      expect(vi.mocked(api.createReport)).toHaveBeenCalledTimes(1)
    })
    const sent = vi.mocked(api.createReport).mock.calls[0][0]
    expect(sent.reporter.first_name).toBe('')
    expect(sent.reported_first_name).toBe('Example')
    expect(sent.reported_last_name).toBe('Person')
    expect(sent.action_date).toBe('2023-03-29')
    expect(onSuccess).toHaveBeenCalledWith({
      slug: 'new123',
      public_url: 'http://localhost/reports/new123',
      status: 'posted',
    })
  })

  it('Scenario 2 — named reporter byline shows in the preview card', () => {
    render(<ReportForm onSuccess={vi.fn()} />)
    fillReportedRequiredFields()
    fill('rf-reporter-first-name', 'Pat')
    fill('rf-reporter-city', 'Austin')
    const country = screen.getByTestId('rf-reporter-country') as HTMLSelectElement
    fireEvent.change(country, { target: { value: 'US' } })

    fireEvent.click(screen.getByTestId('rf-preview-button'))

    expect(screen.getByTestId('rf-preview-card-byline')).toHaveTextContent(
      'Reported by Pat from Austin, United States',
    )
  })

  it('Scenario 3 — Preview button is disabled when required reported fields are empty', () => {
    render(<ReportForm onSuccess={vi.fn()} />)
    const previewBtn = screen.getByTestId('rf-preview-button') as HTMLButtonElement
    expect(previewBtn.disabled).toBe(true)
  })

  it('Scenario 4 — Disclaimer is visible on the form and on the preview', () => {
    render(<ReportForm onSuccess={vi.fn()} />)
    expect(screen.getByTestId('rf-disclaimer-form')).toHaveTextContent(
      'Posted content is public.',
    )

    fillReportedRequiredFields()
    fireEvent.click(screen.getByTestId('rf-preview-button'))

    expect(screen.getByTestId('rf-disclaimer-preview')).toHaveTextContent(
      'Posted content is public.',
    )
  })

  it('Scenario 5 — over-redacted text disables Post and shows warning', () => {
    render(<ReportForm onSuccess={vi.fn()} />)
    fill('rf-reported-first-name', 'Example')
    fill('rf-reported-last-name', 'Person')
    fill('rf-reported-city', 'Berlin')
    const country = screen.getByTestId('rf-reported-country') as HTMLSelectElement
    fireEvent.change(country, { target: { value: 'DE' } })
    fill('rf-what-they-did', 'John Smith Mary Jones')

    fireEvent.click(screen.getByTestId('rf-preview-button'))

    expect(screen.getByTestId('rf-over-redacted')).toHaveTextContent(
      /Most of what you wrote was redacted/,
    )
    expect(screen.getByTestId('rf-post')).toBeDisabled()
  })

  it('Scenario 6 — sanitizer redacts multi-word names in preview text', () => {
    render(<ReportForm onSuccess={vi.fn()} />)
    fillReportedRequiredFields()
    fill('rf-what-they-did', 'Sam Altman mentioned me in his keynote')

    fireEvent.click(screen.getByTestId('rf-preview-button'))

    expect(screen.getByTestId('rf-preview-card-text')).toHaveTextContent(
      '[name] mentioned me in his keynote',
    )
  })

  it('Scenario 7 — API error displays error message', async () => {
    vi.mocked(api.createReport).mockRejectedValueOnce(
      new api.ApiError({ kind: 'rate_limited', status: 429, retryAfterSeconds: 30 }),
    )
    render(<ReportForm onSuccess={vi.fn()} />)
    fillReportedRequiredFields()

    fireEvent.click(screen.getByTestId('rf-preview-button'))
    fireEvent.click(screen.getByTestId('rf-post'))

    await waitFor(() => {
      expect(screen.getByTestId('rf-error')).toHaveTextContent(/too fast/i)
    })
  })

  it('Scenario 9 — two rapid Post clicks fire createReport exactly once', async () => {
    // Stall the resolver so the second click happens while the first is in
    // flight. Without the ref latch, both clicks pass the `submitting` gate
    // because React has not re-rendered yet, producing a duplicate report.
    let resolveFirst: (value: { slug: string; public_url: string; status: 'posted' }) => void
    const firstCall = new Promise<{ slug: string; public_url: string; status: 'posted' }>((r) => {
      resolveFirst = r
    })
    vi.mocked(api.createReport).mockReturnValueOnce(firstCall)
    render(<ReportForm onSuccess={vi.fn()} />)
    fillReportedRequiredFields()
    fireEvent.click(screen.getByTestId('rf-preview-button'))

    const post = screen.getByTestId('rf-post')
    fireEvent.click(post)
    fireEvent.click(post)

    expect(vi.mocked(api.createReport)).toHaveBeenCalledTimes(1)
    resolveFirst!({ slug: 'x', public_url: '/reports/x', status: 'posted' })
    await waitFor(() => {
      expect(vi.mocked(api.createReport)).toHaveBeenCalledTimes(1)
    })
  })

  it('Scenario 10 — trims whitespace on reported + reporter fields before submit', async () => {
    // Regression parity with HelpedForm: client validators .trim() before
    // the regex gate but the submission previously sent untrimmed values,
    // which the server's `^\p{L}+$` name regex rejects. toInput now
    // normalizes so `"  Example  "` arrives as `"Example"`.
    render(<ReportForm onSuccess={vi.fn()} />)
    fill('rf-reported-first-name', '  Example  ')
    fill('rf-reported-last-name', '  Person  ')
    fill('rf-reported-city', '  Berlin  ')
    const reportedCountry = screen.getByTestId('rf-reported-country') as HTMLSelectElement
    fireEvent.change(reportedCountry, { target: { value: 'DE' } })
    fill('rf-what-they-did', 'signed the Open Letter')
    fill('rf-reporter-first-name', '  Pat  ')
    fill('rf-reporter-last-name', '  Doe  ')
    fill('rf-reporter-city', '  Austin  ')
    const reporterCountry = screen.getByTestId('rf-reporter-country') as HTMLSelectElement
    fireEvent.change(reporterCountry, { target: { value: 'US' } })

    fireEvent.click(screen.getByTestId('rf-preview-button'))
    fireEvent.click(screen.getByTestId('rf-post'))

    await waitFor(() => {
      expect(vi.mocked(api.createReport)).toHaveBeenCalledTimes(1)
    })
    const sent = vi.mocked(api.createReport).mock.calls[0][0]
    expect(sent.reported_first_name).toBe('Example')
    expect(sent.reported_last_name).toBe('Person')
    expect(sent.reported_city).toBe('Berlin')
    expect(sent.reported_country).toBe('DE')
    expect(sent.reporter.first_name).toBe('Pat')
    expect(sent.reporter.last_name).toBe('Doe')
    expect(sent.reporter.city).toBe('Austin')
    expect(sent.reporter.country).toBe('US')
  })

  it('Scenario 8 — preview never shows last_name values', () => {
    render(<ReportForm onSuccess={vi.fn()} />)
    fill('rf-reported-first-name', 'Example')
    fill('rf-reported-last-name', 'HiddenSurname')
    fill('rf-reported-city', 'Berlin')
    const country = screen.getByTestId('rf-reported-country') as HTMLSelectElement
    fireEvent.change(country, { target: { value: 'DE' } })
    fill('rf-what-they-did', 'signed the Open Letter')
    fill('rf-reporter-first-name', 'Pat')
    fill('rf-reporter-last-name', 'ReporterSurname')

    fireEvent.click(screen.getByTestId('rf-preview-button'))

    const preview = screen.getByTestId('rf-preview')
    expect(preview.textContent ?? '').not.toContain('HiddenSurname')
    expect(preview.textContent ?? '').not.toContain('ReporterSurname')
  })
})
