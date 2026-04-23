import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { resetPassword } from '@/lib/adminApi'
import { ApiError } from '@/lib/api'

/**
 * Translate the reset-password API failure into a user-actionable message.
 * The server returns `fields.password = 'weak_password'` for zxcvbn rejects
 * and `fields.confirm_password = 'passwords_must_match'` for the confirm
 * mismatch, usually without a human `message`. For expired/used-token
 * branches the server DOES set a specific message — surface that verbatim.
 */
function describeResetError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.fields?.password === 'weak_password') {
      return 'Password too weak. Use more variety (mixed case, digits, symbols) or a longer passphrase.'
    }
    if (err.fields?.confirm_password === 'passwords_must_match') {
      return "Passwords don't match."
    }
    if (typeof err.message === 'string' && err.message !== '' && err.message !== err.kind) {
      return err.message
    }
    if (err.kind === 'rate_limited') return 'Too many attempts. Try again in a few minutes.'
  }
  return 'Reset failed. Try again.'
}

/** Password reset form page (Story 2). */
export function AdminResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (token === '') {
      setError('Reset link is invalid or expired.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }
    setLoading(true)
    try {
      await resetPassword(token, password, confirm)
      setDone(true)
    } catch (err) {
      setError(describeResetError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app text-text-primary">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border-default bg-panel p-6">
        <h1 data-testid="admin-reset-heading" className="text-xl font-semibold">
          Set new password
        </h1>
        {done ? (
          <div data-testid="admin-reset-done">
            <p className="text-sm text-text-secondary">Password updated. Log in with your new password.</p>
            <Link
              to="/admin/login"
              data-testid="admin-back-to-login"
              className="mt-4 block text-sm text-accent hover:underline"
            >
              Log in
            </Link>
          </div>
        ) : (
          <form data-testid="admin-reset-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error !== '' && (
              <p data-testid="admin-reset-error" className="text-sm text-danger">{error}</p>
            )}
            <Input
              data-testid="admin-reset-password"
              type="password"
              placeholder="New password (min 12 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              data-testid="admin-reset-confirm"
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <Button data-testid="admin-reset-submit" type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
