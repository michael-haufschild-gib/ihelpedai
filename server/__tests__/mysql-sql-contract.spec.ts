// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const mysqlStoreSources = ['server/store/mysql-store.ts', 'server/store/mysql-store-admin.ts'] as const

describe('MySQL SQL contract', () => {
  // The double-escaped form `LIKE ? ESCAPE '\\'` confuses some MySQL clients
  // and SQL linters because the literal contains a backslash inside a single
  // quoted string. Use the helper `escapeLikePattern()` together with a
  // single-character escape literal (e.g. `LIKE ? ESCAPE '|'`) instead so the
  // SQL stays unambiguous regardless of client parsing rules.
  it('uses a parseable SQL literal for backslash LIKE escape clauses', () => {
    for (const file of mysqlStoreSources) {
      const source = readFileSync(resolve(file), 'utf8')
      expect(source, file).not.toContain(String.raw`LIKE ? ESCAPE '\\'`)
    }
  })
})
