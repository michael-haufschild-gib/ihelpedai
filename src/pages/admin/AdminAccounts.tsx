import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { AdminAccount } from '@/lib/adminApi'
import { deactivateAdmin, inviteAdmin, listAdmins } from '@/lib/adminApi'
import { useAdminStore } from '@/stores/adminStore'

/** Admin account management page (Story 9). */
export function AdminAccounts() {
  const [admins, setAdmins] = useState<AdminAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [deactivateTarget, setDeactivateTarget] = useState<AdminAccount | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const currentAdmin = useAdminStore((s) => s.admin)

  useEffect(() => {
    let cancelled = false
    listAdmins()
      .then((r) => { if (!cancelled) { setAdmins(r.items); setError('') } })
      .catch(() => { if (!cancelled) setError('Failed to load accounts.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey])

  const handleInvite = async () => {
    setError('')
    setSaving(true)
    try {
      await inviteAdmin(email)
      setShowInvite(false); setEmail(''); setLoading(true)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    if (!deactivateTarget) return
    try {
      await deactivateAdmin(deactivateTarget.id)
      setLoading(true)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deactivate failed.')
    } finally {
      setDeactivateTarget(null)
    }
  }

  return (
    <section data-testid="admin-accounts-page" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Admin Accounts</h1>
        <Button
          data-testid="admin-accounts-invite"
          size="sm"
          onClick={() => {
            setError('')
            setShowInvite(true)
          }}
        >
          Invite
        </Button>
      </div>
      {error !== '' && !showInvite && (
        <p data-testid="admin-accounts-error" className="text-sm text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-text-secondary">Loading...</p>
      ) : (
        <AccountsTable admins={admins} currentAdminId={currentAdmin?.id} onDeactivate={setDeactivateTarget} />
      )}
      {showInvite && (
        <InviteModal
          email={email}
          error={error}
          saving={saving}
          onEmailChange={setEmail}
          onInvite={handleInvite}
          onClose={() => setShowInvite(false)}
        />
      )}
      {deactivateTarget && (
        <DeactivateModal target={deactivateTarget} onConfirm={handleDeactivate} onClose={() => setDeactivateTarget(null)} />
      )}
    </section>
  )
}

/** Accounts table with deactivate action. */
function AccountsTable({ admins, currentAdminId, onDeactivate }: {
  admins: AdminAccount[]
  currentAdminId: string | undefined
  onDeactivate: (admin: AdminAccount) => void
}) {
  return (
    <table data-testid="admin-accounts-table" className="w-full text-sm">
      <thead>
        <tr className="border-b border-border-subtle text-left text-text-secondary">
          <th className="py-2 pr-3">Email</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2 pr-3">Last login</th>
          <th className="py-2 pr-3">Created</th>
          <th className="py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {admins.map((admin) => (
          <tr key={admin.id} data-testid={`admin-account-row-${admin.id}`} className="border-b border-border-subtle">
            <td className="py-2 pr-3">{admin.email}</td>
            <td className="py-2 pr-3">
              <span className={`rounded px-2 py-0.5 text-2xs ${admin.status === 'active' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                {admin.status}
              </span>
            </td>
            <td className="py-2 pr-3 text-text-secondary">{admin.lastLoginAt !== null ? new Date(admin.lastLoginAt).toLocaleString() : '—'}</td>
            <td className="py-2 pr-3 text-text-secondary">{new Date(admin.createdAt).toLocaleDateString()}</td>
            <td className="py-2">
              {admin.status === 'active' && currentAdminId !== undefined && admin.id !== currentAdminId && (
                <Button
                  data-testid={`admin-account-deactivate-${admin.id}`}
                  size="sm"
                  variant="danger"
                  onClick={() => onDeactivate(admin)}
                >
                  Deactivate
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Modal for inviting a new admin. */
function InviteModal({ email, error, saving, onEmailChange, onInvite, onClose }: {
  email: string
  error: string
  saving: boolean
  onEmailChange: (v: string) => void
  onInvite: () => void
  onClose: () => void
}) {
  return (
    <Modal data-testid="admin-invite-modal" isOpen title="Invite admin" onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        {error !== '' && <p className="text-sm text-danger">{error}</p>}
        <Input
          data-testid="admin-invite-email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
        />
        <div className="flex gap-2">
          <Button data-testid="admin-invite-submit" disabled={email === '' || saving} onClick={onInvite}>{saving ? 'Inviting...' : 'Invite'}</Button>
          <Button data-testid="admin-invite-cancel" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Modal for deactivating an admin. */
function DeactivateModal({ target, onConfirm, onClose }: {
  target: AdminAccount
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const handleConfirm = () => {
    setBusy(true)
    onConfirm().finally(() => setBusy(false))
  }
  return (
    <Modal data-testid="admin-deactivate-modal" isOpen title={`Deactivate ${target.email}?`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-text-secondary">Their sessions will be invalidated immediately.</p>
        <div className="flex gap-2">
          <Button data-testid="admin-deactivate-confirm" variant="danger" disabled={busy} onClick={handleConfirm}>
            {busy ? 'Deactivating...' : 'Deactivate'}
          </Button>
          <Button data-testid="admin-deactivate-cancel" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
