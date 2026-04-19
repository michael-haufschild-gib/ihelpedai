import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Mailer, MailMessage } from './index.js'

const MAIL_DIR = resolve(process.cwd(), 'tmp', 'mail')

const sanitizeSubject = (subject: string): string =>
  subject.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 40)

const toEmlBody = (from: string, m: MailMessage): string => {
  const lines = [
    `From: ${from}`,
    `To: ${m.to}`,
    `Subject: ${m.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    m.text,
  ]
  return lines.join('\r\n')
}

/**
 * Writes each outgoing email to ./tmp/mail/*.eml and prints the full path
 * on stdout so the developer can copy the file path into an editor. Files
 * and their parent directory are owner-only (0o700/0o600) because the
 * plaintext body can contain one-time API keys.
 */
export class FileMailer implements Mailer {
  constructor(private readonly from: string) {}

  async send(message: MailMessage): Promise<void> {
    await mkdir(MAIL_DIR, { recursive: true, mode: 0o700 })
    const filename = `${String(Date.now())}-${randomUUID()}-${sanitizeSubject(message.subject)}.eml`
    const path = resolve(MAIL_DIR, filename)
    await writeFile(path, toEmlBody(this.from, message), { encoding: 'utf8', mode: 0o600 })
    process.stdout.write(`[file-mailer] wrote ${path}\n`)
  }
}
