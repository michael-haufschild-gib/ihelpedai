import nodemailer, { type Transporter } from 'nodemailer'

import type { Mailer, MailMessage } from './index.js'

/**
 * SMTP-backed Mailer built on nodemailer. Accepts a pre-built Transporter so
 * tests can inject `streamTransport: true, buffer: true` for in-memory
 * assertions; production code instantiates via {@link SmtpMailer.fromUrl}.
 * All outgoing mail is plaintext only (no HTML alternative) — PRD 01.
 */
export class SmtpMailer implements Mailer {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  /** Build an SmtpMailer from a connection URL like `smtp://127.0.0.1:25` or `smtps://user:pass@host:465`. */
  static fromUrl(url: string, from: string): SmtpMailer {
    return new SmtpMailer(nodemailer.createTransport(url), from)
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    })
  }
}
