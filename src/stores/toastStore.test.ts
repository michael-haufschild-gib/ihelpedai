import { beforeEach, describe, expect, it } from 'vitest'

import { showToast, useToastStore } from './toastStore'

/**
 * Pin the three contract points every caller depends on:
 *   (1) showToast() places the message on the store;
 *   (2) successive showToast() calls bump a monotonically increasing `id`
 *       so a React consumer keyed on that id can remount the toast
 *       component and re-run entry animations;
 *   (3) clearToast() nulls the message without resetting the id so
 *       subsequent shows still see a strictly-greater key.
 */
describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ message: null })
  })

  it('showToast sets the message', () => {
    showToast('hello')
    expect(useToastStore.getState().message).toBe('hello')
  })

  it('successive showToast calls produce strictly increasing ids', () => {
    showToast('first')
    const firstId = useToastStore.getState().id
    showToast('second')
    const secondId = useToastStore.getState().id
    expect(secondId).toBeGreaterThan(firstId)
  })

  it('clearToast nulls the message but does not rewind the id counter', () => {
    showToast('flash')
    const shownId = useToastStore.getState().id
    useToastStore.getState().clearToast()
    expect(useToastStore.getState().message).toBe(null)
    expect(useToastStore.getState().id).toBe(shownId)
  })
})
