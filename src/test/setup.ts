import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key: string) {
      return data.get(key) ?? null
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null
    },
    removeItem(key: string) {
      data.delete(key)
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
  }
}

function installMemoryStorage(): void {
  if (typeof window === 'undefined') return
  Object.defineProperty(window, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
  })
}

installMemoryStorage()

afterEach(() => {
  cleanup()
  installMemoryStorage()
})
