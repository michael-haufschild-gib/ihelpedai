import { describe, expect, it, vi } from 'vitest'

import { assertCompatibleMysql, isCompatibleMysqlVersion, parseMysqlVersion } from './mysql-version.js'

/**
 * Pure-parser unit tests for the MySQL version gate. Real-world
 * `SELECT VERSION()` output includes managed-provider suffixes
 * (`8.0.28-google`, `8.0.32-cluster`) and MariaDB
 * (`10.5.13-MariaDB`); each branch must be classified correctly.
 */
describe('parseMysqlVersion', () => {
  it('extracts major/minor/patch from a vanilla MySQL version string', () => {
    expect(parseMysqlVersion('8.0.16')).toEqual({
      vendor: 'mysql',
      major: 8,
      minor: 0,
      patch: 16,
      raw: '8.0.16',
    })
  })

  it('handles managed-provider build suffixes (google, cluster, distro)', () => {
    expect(parseMysqlVersion('8.0.28-google')).toMatchObject({
      vendor: 'mysql',
      major: 8,
      minor: 0,
      patch: 28,
    })
    expect(parseMysqlVersion('8.4.0-1.el9')).toMatchObject({
      vendor: 'mysql',
      major: 8,
      minor: 4,
      patch: 0,
    })
  })

  it('classifies MariaDB as a separate vendor regardless of the major number', () => {
    expect(parseMysqlVersion('10.5.13-MariaDB')).toEqual({
      vendor: 'mariadb',
      raw: '10.5.13-MariaDB',
    })
    expect(parseMysqlVersion('5.5.5-10.6.4-MariaDB')).toEqual({
      vendor: 'mariadb',
      raw: '5.5.5-10.6.4-MariaDB',
    })
  })

  it('returns vendor=unknown for an unparseable version string', () => {
    expect(parseMysqlVersion('???-unrecognised')).toEqual({
      vendor: 'unknown',
      raw: '???-unrecognised',
    })
  })
})

describe('isCompatibleMysqlVersion', () => {
  it('accepts 8.0.16 and later patch / minor / major', () => {
    expect(isCompatibleMysqlVersion(parseMysqlVersion('8.0.16'))).toBe(true)
    expect(isCompatibleMysqlVersion(parseMysqlVersion('8.0.32'))).toBe(true)
    expect(isCompatibleMysqlVersion(parseMysqlVersion('8.4.0'))).toBe(true)
    expect(isCompatibleMysqlVersion(parseMysqlVersion('9.0.0'))).toBe(true)
  })

  it('rejects 8.0.15 and earlier where CHECK is parse-and-ignore', () => {
    expect(isCompatibleMysqlVersion(parseMysqlVersion('8.0.15'))).toBe(false)
    expect(isCompatibleMysqlVersion(parseMysqlVersion('5.7.40'))).toBe(false)
  })

  it('rejects MariaDB and unknown vendors', () => {
    expect(isCompatibleMysqlVersion(parseMysqlVersion('10.5.13-MariaDB'))).toBe(false)
    expect(isCompatibleMysqlVersion(parseMysqlVersion('garbage'))).toBe(false)
  })
})

describe('assertCompatibleMysql', () => {
  function poolReturning(value: unknown): { query: ReturnType<typeof vi.fn> } {
    return {
      query: vi.fn(async () => [[{ v: value }], []]),
    }
  }

  it('resolves to the parsed version on a compatible MySQL', async () => {
    const pool = poolReturning('8.0.32-cluster')
    const parsed = await assertCompatibleMysql(pool as never)
    expect(parsed.vendor).toBe('mysql')
  })

  it('throws a prescriptive error for an old MySQL that ignores CHECK', async () => {
    const pool = poolReturning('8.0.15')
    await expect(assertCompatibleMysql(pool as never)).rejects.toThrow(/MySQL 8\.0\.15 is not supported/)
  })

  it('throws when MariaDB reports its identity in the version string', async () => {
    const pool = poolReturning('10.5.13-MariaDB')
    await expect(assertCompatibleMysql(pool as never)).rejects.toThrow(/MariaDB is not a supported backend/)
  })

  it('throws a parse-error for unrecognised version strings', async () => {
    const pool = poolReturning('???')
    await expect(assertCompatibleMysql(pool as never)).rejects.toThrow(/Could not parse MySQL server version/)
  })

  it('throws when the SELECT VERSION() row is missing the v column', async () => {
    const pool = { query: vi.fn(async () => [[{}], []]) }
    await expect(assertCompatibleMysql(pool as never)).rejects.toThrow(/SELECT VERSION\(\) returned no string/)
  })
})
