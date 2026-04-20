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
    expect(responseJson.status).toBe('posted')
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
  })
})
