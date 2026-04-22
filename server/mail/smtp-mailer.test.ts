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
    const options = spy.mock.calls[0][0]
    expect(options).toMatchObject({
      from: 'noreply@ihelped.ai',
      to: 'user@example.com',
      subject: 'Your key',
      text: 'Hello world',
    })
    // Ensure no HTML alternative was quietly added — PRD 01 is plaintext only.
    expect('html' in (options as object)).toBe(false)
    const info = (await spy.mock.results[0]!.value) as { message: Buffer }
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
    expect(spy.mock.calls[0][0].from).toBe('bounce@ihelped.ai')
    expect(spy.mock.calls[1][0].from).toBe('bounce@ihelped.ai')
  })

  it('propagates transport errors to the caller', async () => {
    const failing = {
      sendMail: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as ReturnType<typeof nodemailer.createTransport>
    const mailer = new SmtpMailer(failing, 'noreply@ihelped.ai')
    await expect(mailer.send({ to: 'u@example.com', subject: 's', text: 't' }))
      .rejects.toThrow('connection refused')
  })

  it('fromUrl builds a transporter from a connection URL', () => {
    const mailer = SmtpMailer.fromUrl('smtp://127.0.0.1:25', 'noreply@ihelped.ai')
    expect(mailer).toBeInstanceOf(SmtpMailer)
  })
})
