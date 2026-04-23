import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Modal } from '@/components/ui/Modal'

/**
 * happy-dom's <dialog> implementation is partial (showModal is a no-op in
 * some versions), so these assertions target the React-rendered subtree
 * rather than the native dialog open state. Focus restoration and ESC
 * handling are verified in Playwright e2e where a real browser is present.
 */
describe('Modal', () => {
  it('renders the title with the modal-title testid when open', () => {
    render(
      <Modal isOpen title="Confirm deletion" onClose={vi.fn()}>
        <p data-testid="body">Are you sure?</p>
      </Modal>,
    )
    expect(screen.getByTestId('modal-title')).toHaveTextContent('Confirm deletion')
    expect(screen.getByTestId('body')).toHaveTextContent('Are you sure?')
  })

  it('forwards the data-testid prop to the dialog element', () => {
    render(
      <Modal data-testid="admin-confirm-modal" isOpen title="X" onClose={vi.fn()}>
        <span data-testid="x-body">x</span>
      </Modal>,
    )
    expect(screen.getByTestId('admin-confirm-modal')).toBeInTheDocument()
  })

  it('renders the close button and invokes onClose when clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen title="X" onClose={onClose}>
        <span data-testid="inner">inner</span>
      </Modal>,
    )
    await user.click(screen.getByTestId('modal-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders headerRight content next to the close button', () => {
    render(
      <Modal
        isOpen
        title="X"
        onClose={vi.fn()}
        headerRight={
          <button data-testid="header-action" className="px-2 text-xs">
            Copy
          </button>
        }
      >
        <span data-testid="inner">inner</span>
      </Modal>,
    )
    expect(screen.getByTestId('header-action')).toBeInTheDocument()
  })

  it('renders children inside the modal body', () => {
    render(
      <Modal isOpen title="X" onClose={vi.fn()}>
        <section data-testid="modal-body-content">
          <span data-testid="inner-para">hello</span>
        </section>
      </Modal>,
    )
    expect(screen.getByTestId('modal-body-content')).toBeInTheDocument()
    expect(screen.getByTestId('inner-para')).toHaveTextContent('hello')
  })
})
