import type { Mailer, MailMessage } from './index.js'

/**
 * SMTP-backed mailer. Stub for Round 1A; concrete transport added in
 * production rounds (likely `nodemailer` with the server's relay). Constructor
 * fails fast so `MAILER=smtp` cannot boot an unsupported build.
 */
export class SmtpMailer implements Mailer {
  constructor(_url: string, _from: string) {
    throw new Error(
      'MAILER=smtp is not yet implemented in this build. Use MAILER=file.',
    )
  }

  async send(_message: MailMessage): Promise<void> {
    throw new Error('unreachable')
  }
}
