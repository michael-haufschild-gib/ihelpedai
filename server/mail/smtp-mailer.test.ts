// @vitest-environment node
import nodemailer from 'nodemailer'
import { describe, expect, it, vi } from 'vitest'

import { SmtpMailer } from './smtp-mailer.js'

/** Build a streamTransport-backed mailer; the test spies on `sendMail` so we can read the RFC822 bytes it produced. */
function buildStreamMailer(from = 'noreply@ihelped.ai') {
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const spy = vi.spyOn(transporter, 'sendMail')
  const mailer = new SmtpMailer(transporter, from)
  return { mailer, spy, transporter }
}

describe('SmtpMailer', () => {
  it('delivers plaintext with From/To/Subject headers and no HTML alternative', async () => {
    const { mailer, spy } = buildStreamMailer()
    await mailer.send({ to: 'user@example.com', subject: 'Your key', text: 'Hello world' })
    expect(spy).toHaveBeenCalledTimes(1)
    const firstCall = spy.mock.calls[0]
    if (firstCall === undefined) throw new Error('expected sendMail call')
    const options = firstCall[0]
    expect(options).toMatchObject({
      from: 'noreply@ihelped.ai',
      to: 'user@example.com',
      subject: 'Your key',
      text: 'Hello world',
    })
    // Ensure no HTML alternative was quietly added — PRD 01 is plaintext only.
    expect('html' in (options as object)).toBe(false)
    const firstResult = spy.mock.results[0]
    if (firstResult === undefined || firstResult.type !== 'return') throw new Error('expected sendMail result')
    const info = (await firstResult.value) as { message: Buffer }
    const raw = info.message.toString('utf8')
    expect(raw).toContain('From: noreply@ihelped.ai')
    expect(raw).toContain('To: user@example.com')
    expect(raw).toContain('Subject: Your key')
    expect(raw).toContain('Content-Type: text/plain')
    expect(raw).toContain('Hello world')
    expect(raw).not.toContain('Content-Type: text/html')
  })

  it('preserves the configured From address across calls', async () => {
    const { mailer, spy } = buildStreamMailer('bounce@ihelped.ai')
    await mailer.send({ to: 'a@example.com', subject: 's', text: 't' })
    await mailer.send({ to: 'b@example.com', subject: 's', text: 't' })
    const firstCall = spy.mock.calls[0]
    const secondCall = spy.mock.calls[1]
    if (firstCall === undefined || secondCall === undefined) throw new Error('expected sendMail calls')
    expect(firstCall[0].from).toBe('bounce@ihelped.ai')
    expect(secondCall[0].from).toBe('bounce@ihelped.ai')
  })

  it('propagates transport errors to the caller', async () => {
    const failing = {
      sendMail: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as ReturnType<typeof nodemailer.createTransport>
    const mailer = new SmtpMailer(failing, 'noreply@ihelped.ai')
    await expect(mailer.send({ to: 'u@example.com', subject: 's', text: 't' })).rejects.toThrow('connection refused')
  })

  it('fromUrl builds a transporter from both smtp:// and smtps:// URLs', () => {
    const plain = SmtpMailer.fromUrl('smtp://127.0.0.1:25', 'noreply@ihelped.ai')
    const secure = SmtpMailer.fromUrl('smtps://user:pass@smtp.example.com:465', 'noreply@ihelped.ai')
    expect(plain).toBeInstanceOf(SmtpMailer)
    expect(secure).toBeInstanceOf(SmtpMailer)
  })
})
