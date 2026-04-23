// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FileMailer, MAIL_DIR_MODE, MAIL_FILE_MODE } from './file-mailer.js'

describe('FileMailer', () => {
  let dir: string
  let parentDir: string
  let writeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    parentDir = await mkdtemp(join(tmpdir(), 'ihelped-mail-'))
    // Keep the drop dir one level below so mkdir actually creates it with
    // the requested mode; mkdir ignores mode on pre-existing directories.
    dir = join(parentDir, 'mail')
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(async () => {
    writeSpy.mockRestore()
    // Each test creates its own tmp tree under `/tmp/ihelped-mail-*`. Without
    // cleanup these accumulate indefinitely in local and CI runs.
    await rm(parentDir, { recursive: true, force: true })
  })

  it('creates the drop directory with 0o700 when it does not exist yet', async () => {
    const mailer = new FileMailer('noreply@ihelped.ai', dir)
    await mailer.send({ to: 'u@example.com', subject: 's', text: 't' })
    const dirStat = await stat(dir)
    // API keys and reset tokens land in these files — the directory must
    // be owner-only so a coexisting local user cannot list them.
    expect(dirStat.mode & 0o777).toBe(MAIL_DIR_MODE)
  })

  it('writes each .eml with 0o600 so local readers cannot slurp secrets', async () => {
    const mailer = new FileMailer('noreply@ihelped.ai', dir)
    await mailer.send({ to: 'u@example.com', subject: 'Your key', text: 'secret' })
    const entries = await readdir(dir)
    expect(entries).toHaveLength(1)
    const fileStat = await stat(join(dir, entries[0]!))
    expect(fileStat.mode & 0o777).toBe(MAIL_FILE_MODE)
  })

  it('emits a well-formed RFC 822 plaintext body with required headers', async () => {
    const mailer = new FileMailer('noreply@ihelped.ai', dir)
    await mailer.send({
      to: 'user@example.com',
      subject: 'Your ihelped.ai API key',
      text: 'line one\nline two',
    })
    const [name] = await readdir(dir)
    const raw = await readFile(join(dir, name!), 'utf8')
    expect(raw).toContain('From: noreply@ihelped.ai')
    expect(raw).toContain('To: user@example.com')
    expect(raw).toContain('Subject: Your ihelped.ai API key')
    expect(raw).toContain('MIME-Version: 1.0')
    expect(raw).toContain('Content-Type: text/plain; charset=utf-8')
    // Blank line separates headers from body; body text preserved verbatim.
    expect(raw).toMatch(/\r\n\r\nline one\nline two$/)
    // No HTML alternative — PRD 01 is plaintext only.
    expect(raw).not.toContain('Content-Type: text/html')
  })

  it('uses CRLF line endings for header block (RFC 822 compliance)', async () => {
    const mailer = new FileMailer('noreply@ihelped.ai', dir)
    await mailer.send({ to: 'u@example.com', subject: 's', text: 't' })
    const [name] = await readdir(dir)
    const raw = await readFile(join(dir, name!), 'utf8')
    const headerBlock = raw.split('\r\n\r\n')[0]!
    // Every header line is terminated with CRLF — no bare LF allowed in
    // headers or permissive parsers will split them differently.
    expect(headerBlock).not.toMatch(/[^\r]\n/)
  })

  it('sanitizes subject in filename, capping non-filename chars and length', async () => {
    const mailer = new FileMailer('noreply@ihelped.ai', dir)
    const longSubject = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/\\:*?"<>|'
    await mailer.send({ to: 'u@example.com', subject: longSubject, text: 't' })
    const [name] = await readdir(dir)
    expect(name!.endsWith('.eml')).toBe(true)
    // Path separators and special shell chars must never leak into the name.
    expect(name).not.toContain('/')
    expect(name).not.toContain('\\')
    expect(name).not.toContain(':')
    expect(name).not.toContain('*')
    // Filename template is `<epoch>-<uuid>-<subject>.eml`; the sanitized
    // subject segment must be capped at 40 chars.
    const subjectSegment = name!.replace(/^\d+-[0-9a-f-]{36}-/, '').replace(/\.eml$/, '')
    expect(subjectSegment.length).toBeLessThanOrEqual(40)
  })

  it('writes two messages to distinct files (no collision)', async () => {
    const mailer = new FileMailer('noreply@ihelped.ai', dir)
    await mailer.send({ to: 'a@example.com', subject: 's', text: 'a' })
    await mailer.send({ to: 'b@example.com', subject: 's', text: 'b' })
    const entries = await readdir(dir)
    expect(new Set(entries).size).toBe(2)
  })

  it('logs the written path to stdout so devs can copy it into an editor', async () => {
    const mailer = new FileMailer('noreply@ihelped.ai', dir)
    await mailer.send({ to: 'u@example.com', subject: 's', text: 't' })
    const [name] = await readdir(dir)
    const emitted = writeSpy.mock.calls.map((args: unknown[]) => String(args[0])).join('')
    expect(emitted).toContain(join(dir, name!))
  })
})
