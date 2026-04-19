import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { App } from '@/App'

describe('App', () => {
  it('renders the app heading', () => {
    render(<App />)
    expect(screen.getByTestId('app-heading')).toHaveTextContent('ihelpedai')
  })
})
