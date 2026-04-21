import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { forgotPassword } from '@/lib/adminApi'

/** Forgot password request page (Story 2). */
export function AdminForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await forgotPassword(email)
    } catch {
      // Swallow failures intentionally: showing an error would leak whether
      // the email exists on the admin roster. The PRD Story 2 response is the
      // same regardless of outcome.
    } finally {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app text-text-primary">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border-default bg-panel p-6">
        <h1 data-testid="admin-forgot-heading" className="text-xl font-semibold">
          Reset password
        </h1>
        {sent ? (
          <div data-testid="admin-forgot-sent">
            <p className="text-sm text-text-secondary">
              If an admin account exists for this email, a reset link has been sent.
            </p>
            <Link
              to="/admin/login"
              data-testid="admin-back-to-login"
              className="mt-4 block text-sm text-accent hover:underline"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <form data-testid="admin-forgot-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              data-testid="admin-forgot-email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button data-testid="admin-forgot-submit" type="submit" disabled={loading}>
              Send reset link
            </Button>
            <Link
              to="/admin/login"
              data-testid="admin-back-to-login"
              className="text-sm text-accent hover:underline"
            >
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
