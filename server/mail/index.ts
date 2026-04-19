/** Parameters for a transactional email. */
export type MailMessage = {
  to: string
  subject: string
  text: string
}

/**
 * Email abstraction. Dev writes .eml files to disk; production sends
 * via SMTP. All PRD 01 email flows are plaintext only — no HTML.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>
}
