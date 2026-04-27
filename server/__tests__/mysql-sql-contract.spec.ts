// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const mysqlStoreSources = ['server/store/mysql-store.ts', 'server/store/mysql-store-admin.ts'] as const

describe('MySQL SQL contract', () => {
  it('uses a parseable SQL literal for backslash LIKE escape clauses', () => {
    for (const file of mysqlStoreSources) {
      const source = readFileSync(resolve(file), 'utf8')
      expect(source, file).not.toContain(String.raw`LIKE ? ESCAPE '\\'`)
    }
  })
})
