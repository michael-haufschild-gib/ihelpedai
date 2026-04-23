import { describe, it, expect } from 'vitest'

// The shared parity fixture lives under src/lib/__fixtures__ so it is
// reachable from both runtimes via the same module — the server side imports
// it relatively, the client side via the @/ alias. Any sanitizer-rule change
// updates the fixture, which then forces both test suites to acknowledge
// the new behaviour.
import { SANITIZER_PARITY_CASES } from '@/lib/__fixtures__/sanitizer-parity-cases'
import { sanitize } from '@/lib/sanitizePreview'

describe('sanitizePreview — parity fixture (client mirror)', () => {
  for (const c of SANITIZER_PARITY_CASES) {
    it(c.name, () => {
      const result = sanitize(c.input)
      expect(result.clean).toBe(c.expectedClean)
      expect(result.overRedacted).toBe(c.expectedOverRedacted)
      expect(sanitize(result.clean).clean).toBe(result.clean)
    })
  }
})
