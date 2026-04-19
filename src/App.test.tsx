import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { App } from '@/App'

describe('App', () => {
  it('renders the editor shell with coming-soon content', () => {
    render(<App />)
    expect(screen.getByTestId('app-heading')).toHaveTextContent('Coming soon')
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-left-panel')).toBeInTheDocument()
    expect(screen.getByTestId('menu-view')).toHaveTextContent('VIEW')
  })
})
