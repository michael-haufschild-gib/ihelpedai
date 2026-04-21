import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiError } from '@/lib/api'
import { login } from '@/lib/adminApi'
import { useAdminStore } from '@/stores/adminStore'

/** Admin login page (Story 1). */
export function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setAdmin = useAdminStore((s) => s.setAdmin)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(email, password)
      setAdmin(result.admin)
      navigate('/admin', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'rate_limited') {
        setError(err.message === '' ? 'Too many attempts. Try again later.' : err.message)
      } else {
        setError('Email or password is incorrect.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app text-text-primary">
      <form
        data-testid="admin-login-form"
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border-default bg-panel p-6"
      >
        <h1 data-testid="admin-login-heading" className="text-xl font-semibold">
          ihelped.ai admin
        </h1>
        {error !== '' && (
          <p data-testid="admin-login-error" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Input
          data-testid="admin-login-email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          data-testid="admin-login-password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button data-testid="admin-login-submit" type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </Button>
        <Link
          to="/admin/forgot-password"
          data-testid="admin-forgot-password-link"
          className="text-sm text-accent hover:underline"
        >
          Forgot password?
        </Link>
      </form>
    </div>
  )
}
