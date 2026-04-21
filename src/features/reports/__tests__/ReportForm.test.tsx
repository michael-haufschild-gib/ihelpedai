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
