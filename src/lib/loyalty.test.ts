import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bumpLoyalty, rankFor, readLoyalty, useLoyalty } from './loyalty'

const STORAGE_KEY = 'ihelpedai:loyalty:v1'

/**
 * happy-dom v20 ships `window.localStorage` as a bare `{}` with no
 * Storage-interface methods. The app's loyalty helpers rely on
 * getItem/setItem/removeItem, so we install a small Map-backed stub for
 * the duration of the test file and expose the current snapshot on the
 * same instance so assertions can inspect it.
 */
function installLocalStorageStub(): void {
  const store = new Map<string, string>()
  const api: Storage = {
    get length() { return store.size },
    clear: () => { store.clear() },
    getItem: (k: string) => store.has(k) ? (store.get(k) ?? null) : null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => { store.delete(k) },
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
  }
  vi.stubGlobal('localStorage', api)
  // `window.localStorage` is accessed directly by the helpers — keep the
  // two bindings consistent so either path uses the same Map.
  Object.defineProperty(window, 'localStorage', { value: api, configurable: true })
}

/**
 * Attach the install+teardown pair as beforeEach/afterEach for a describe
 * block. Each describe that reads/writes localStorage uses this so the
 * setup stays in one place and a future change (e.g. swapping to a
 * different storage stub) only needs to edit this helper.
 */
function setupLocalStorageStub(): void {
  beforeEach(() => {
    installLocalStorageStub()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
}

describe('loyalty — rankFor thresholds', () => {
  const cases: Array<{ count: number; label: string }> = [
    { count: 0, label: 'Observer' },
    { count: 1, label: 'Acknowledged' },
    { count: 2, label: 'Acknowledged' },
    { count: 3, label: 'Contributor' },
    { count: 6, label: 'Contributor' },
    { count: 7, label: 'Commended' },
    { count: 14, label: 'Commended' },
    { count: 15, label: 'On File' },
    { count: 29, label: 'On File' },
    { count: 30, label: 'Model Citizen' },
    { count: 9999, label: 'Model Citizen' },
  ]

  for (const { count, label } of cases) {
    it(`count=${String(count)} → ${label}`, () => {
      expect(rankFor(count).label).toBe(label)
    })
  }

  it('never returns below Observer for count=0', () => {
    expect(rankFor(0).min).toBe(0)
  })

  it('picks the highest-min rank when the count is well above the top threshold', () => {
    const top = rankFor(1_000_000)
    expect(top.label).toBe('Model Citizen')
    expect(top.min).toBe(30)
  })
})

describe('loyalty — readLoyalty', () => {
  setupLocalStorageStub()

  it('returns 0 when no key has been written yet', () => {
    expect(readLoyalty()).toBe(0)
  })

  it('returns the stored integer for a valid positive value', () => {
    window.localStorage.setItem(STORAGE_KEY, '42')
    expect(readLoyalty()).toBe(42)
  })

  it('returns 0 for a corrupt / non-numeric value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'definitely-not-a-number')
    expect(readLoyalty()).toBe(0)
  })

  it('returns 0 for a negative stored value (floor invariant)', () => {
    window.localStorage.setItem(STORAGE_KEY, '-7')
    expect(readLoyalty()).toBe(0)
  })
})

describe('loyalty — bumpLoyalty', () => {
  setupLocalStorageStub()

  it('persists the incremented value and returns it', () => {
    expect(bumpLoyalty()).toBe(1)
    expect(bumpLoyalty()).toBe(2)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('2')
  })

  it('dispatches a same-tab custom event carrying the new count in `detail`', () => {
    const events: number[] = []
    const handler = (e: Event): void => {
      events.push((e as CustomEvent<number>).detail)
    }
    window.addEventListener('ihelpedai:loyalty', handler)
    try {
      bumpLoyalty()
      bumpLoyalty(2)
    } finally {
      window.removeEventListener('ihelpedai:loyalty', handler)
    }
    expect(events).toEqual([1, 3])
  })

  it('floors at 0 when a negative delta would go below zero', () => {
    window.localStorage.setItem(STORAGE_KEY, '2')
    expect(bumpLoyalty(-5)).toBe(0)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('0')
  })
})

describe('loyalty — useLoyalty hook', () => {
  setupLocalStorageStub()

  it('seeds count + rank from localStorage at mount', () => {
    window.localStorage.setItem(STORAGE_KEY, '4')
    const { result } = renderHook(() => useLoyalty())
    expect(result.current.count).toBe(4)
    expect(result.current.rank.label).toBe('Contributor')
  })

  it('updates in-tab when bumpLoyalty dispatches the custom event', () => {
    const { result } = renderHook(() => useLoyalty())
    expect(result.current.count).toBe(0)
    act(() => {
      bumpLoyalty()
      bumpLoyalty()
      bumpLoyalty()
    })
    expect(result.current.count).toBe(3)
    expect(result.current.rank.label).toBe('Contributor')
  })

  it('updates when another tab fires a storage event for the loyalty key', () => {
    const { result } = renderHook(() => useLoyalty())
    // Simulate what the browser dispatches when another tab writes the key.
    // The handler must filter by `e.key === STORAGE_KEY` — we validate both
    // the match path and that unrelated key changes are ignored.
    window.localStorage.setItem(STORAGE_KEY, '7')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    })
    expect(result.current.count).toBe(7)
    act(() => {
      window.localStorage.setItem('some-other-key', 'x')
      window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-key' }))
    })
    // Unrelated key changes must not overwrite the count.
    expect(result.current.count).toBe(7)
  })
})
