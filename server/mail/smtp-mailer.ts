import type { Mailer, MailMessage } from './index.js'

/**
 * SMTP-backed mailer. Stub for Round 1A; concrete transport added in
 * production rounds (likely `nodemailer` with the server's relay).
 */
export class SmtpMailer implements Mailer {
  constructor(_url: string, _from: string) {
    // no-op stub.
  }

  async send(_message: MailMessage): Promise<void> {
    throw new Error('SmtpMailer.send not yet implemented')
  }
}
