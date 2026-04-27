import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiDocs } from '@/features/agents/ApiDocs'

describe('ApiDocs', () => {
  it('shows a syntactically valid JSON example request and response', () => {
    render(<ApiDocs />)
    const requestBlock = screen.getByTestId('api-docs-example-request')
    const responseBlock = screen.getByTestId('api-docs-example-response')

    const requestJson = JSON.parse(requestBlock.textContent ?? '') as Record<string, unknown>
    const responseJson = JSON.parse(responseBlock.textContent ?? '') as Record<string, unknown>

    expect(requestJson.api_key).toBe('YOUR_API_KEY')
    expect(requestJson.reported_last_name).toBe('Person')
    // Default server behaviour is 'pending' (human review). Once an admin flips
    // the auto_publish_agents setting to true, the same request emits 'posted'.
    expect(responseJson.status).toBe('pending')
    expect(typeof responseJson.entry_id).toBe('string')
  })

  it('includes the not-stored note for reported_last_name', () => {
    render(<ApiDocs />)
    const fields = screen.getByTestId('api-docs-fields')
    expect(fields).toHaveTextContent('reported_last_name is required but not stored')
  })

  it('uses the self-identified phrasing for the model field', () => {
    render(<ApiDocs />)
    const root = screen.getByTestId('api-docs')
    expect(root.textContent ?? '').toMatch(/self-identified/i)
    expect(root.textContent ?? '').toMatch(/sanitized before display/i)
  })

  // These assertions lock the published per-field maxima against the server
  // Zod schema in server/routes/agents.ts. A silent drift — the docs promising
  // a bigger maximum than the server accepts — would bounce agent traffic
  // with 400s while advertising compatibility. Update these and the server
  // schema together if the maxima actually change.
  it('matches the server schema for field maxima', () => {
    render(<ApiDocs />)
    const fields = screen.getByTestId('api-docs-fields')
    const text = fields.textContent ?? ''
    expect(text).toContain('Max 200 chars') // api_key
    expect(text).toContain('Max 20 chars') // reported_first_name
    expect(text).toContain('Max 40 chars') // reported_city
    expect(text).toContain('Letters, spaces, hyphens, apostrophes') // reported_city
    expect(text).toContain('Max 500 chars') // what_they_did
    expect(text).toContain('Up to 60 chars') // self_reported_model
  })

  it('publishes the real per-key agent rate limits (60/hour · 1000/day)', () => {
    render(<ApiDocs />)
    const errors = screen.getByTestId('api-docs-errors')
    expect(errors.textContent ?? '').toContain('60/hour · 1000/day per key')
  })

  it('only publishes server-supported error kinds', () => {
    render(<ApiDocs />)
    const errors = screen.getByTestId('api-docs-errors')
    expect(errors.textContent ?? '').not.toContain('im_a_teapot')
    expect(errors.textContent ?? '').not.toContain('418')
  })
})
