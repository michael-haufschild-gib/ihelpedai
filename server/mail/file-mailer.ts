import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Mailer, MailMessage } from './index.js'

/** Default drop directory used when no `mailDir` is passed to the constructor. */
export const DEFAULT_MAIL_DIR = resolve(process.cwd(), 'tmp', 'mail')

/** Permission mode applied to newly-created .eml files. */
export const MAIL_FILE_MODE = 0o600

/** Permission mode applied to the drop directory when it is newly created. */
export const MAIL_DIR_MODE = 0o700

/** Strip non-filename-safe characters from a subject and cap at 40 chars. */
function sanitizeSubject(subject: string): string {
  return subject.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 40)
}

/** Format an outgoing message as an RFC 822 plaintext .eml payload. */
function toEmlBody(from: string, m: MailMessage): string {
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
 * Writes each outgoing email to a drop directory (default `./tmp/mail/`) as
 * a standalone .eml file and prints the full path on stdout so the developer
 * can copy it into an editor. Files and their parent directory are
 * owner-only (0o700/0o600) because the plaintext body can contain one-time
 * API keys and admin password-reset tokens. Tests may pass a custom
 * `mailDir` for isolation.
 */
export class FileMailer implements Mailer {
  private readonly mailDir: string

  constructor(
    private readonly from: string,
    mailDir: string = DEFAULT_MAIL_DIR,
  ) {
    this.mailDir = mailDir
  }

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.mailDir, { recursive: true, mode: MAIL_DIR_MODE })
    const filename = `${String(Date.now())}-${randomUUID()}-${sanitizeSubject(message.subject)}.eml`
    const path = resolve(this.mailDir, filename)
    await writeFile(path, toEmlBody(this.from, message), {
      encoding: 'utf8',
      mode: MAIL_FILE_MODE,
    })
    process.stdout.write(`[file-mailer] wrote ${path}\n`)
  }
}
