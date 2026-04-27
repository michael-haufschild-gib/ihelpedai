// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const deployScript = readFileSync(resolve('deploy/deploy.sh'), 'utf8')

describe('deploy script contract', () => {
  it('marks APP_VERSION dirty when deploying uncommitted tracked or untracked code', () => {
    expect(deployScript).toContain('git diff --quiet')
    expect(deployScript).toContain('git diff --cached --quiet')
    expect(deployScript).toContain('git ls-files --others --exclude-standard')
    expect(deployScript).toContain('-dirty')
  })

  it('applies MySQL schema upgrades before restarting the API', () => {
    const schemaStep = deployScript.indexOf('[deploy] applying MySQL schema upgrades')
    const restartStep = deployScript.indexOf('[deploy] restarting systemd unit')
    expect(schemaStep).toBeGreaterThan(-1)
    expect(restartStep).toBeGreaterThan(schemaStep)
    expect(deployScript).toContain('server/deploy/schema/001-init.mysql.sql')
    expect(deployScript).toContain('MYSQL_URL')
    expect(deployScript).toContain('mysql -h "$db_host" -P "$db_port" -u "$db_user" "$db_name" < "$schema_path"')
  })
})
