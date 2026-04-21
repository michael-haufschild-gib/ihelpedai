import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { AdminApiKey, Paginated } from '@/lib/adminApi'
import { listApiKeys, revokeApiKey } from '@/lib/adminApi'
import { showToast } from '@/stores/toastStore'

/** Admin API key management page (Story 7). */
export function AdminApiKeys() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<Paginated<AdminApiKey> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<AdminApiKey | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [revoking, setRevoking] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const pageRaw = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const statusRaw = searchParams.get('status') ?? ''
  const statusFilter = (statusRaw === 'active' || statusRaw === 'revoked') ? statusRaw : ''

  useEffect(() => {
    let cancelled = false
    listApiKeys({ status: statusFilter !== '' ? statusFilter : undefined, page })
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch(() => { if (!cancelled) setError('Failed to load API keys.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, statusFilter, refreshKey])

  const handleRevoke = () => {
    if (!revokeTarget || revoking) return; setRevoking(true)
    revokeApiKey(revokeTarget.id, reason !== '' ? reason : undefined)
      .then(() => { setRevokeTarget(null); setConfirmation(''); setReason(''); setRefreshKey((k) => k + 1) })
      .catch(() => { showToast('Failed to revoke key.') }).finally(() => setRevoking(false))
  }

  const setFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value !== '') next.set(key, value); else next.delete(key); next.set('page', '1'); return next
    })
  }

  const setPage = (p: number) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('page', String(p)); return next })
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <section data-testid="admin-apikeys-page" className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">API Keys</h1>
      <Select
        data-testid="admin-apikeys-status-filter"
        value={statusFilter}
        onChange={(v) => setFilter('status', v)}
        options={[
          { value: '', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'revoked', label: 'Revoked' },
        ]}
      />
      {loading ? (
        <p className="text-text-secondary">Loading...</p>
      ) : error !== null ? (
        <p data-testid="admin-apikeys-error" className="text-sm text-danger">{error}</p>
      ) : !data || data.items.length === 0 ? (
        <p data-testid="admin-apikeys-empty" className="text-text-secondary">No API keys found.</p>
      ) : (
        <>
          <ApiKeysTable items={data.items} onRevoke={setRevokeTarget} />
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
              <span className="text-sm text-text-secondary">Page {page} of {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
      {revokeTarget && (
        <RevokeModal
          target={revokeTarget}
          confirmation={confirmation}
          reason={reason}
          revoking={revoking}
          onConfirmationChange={setConfirmation}
          onReasonChange={setReason}
          onRevoke={handleRevoke}
          onClose={() => { setRevokeTarget(null); setConfirmation(''); setReason('') }}
        />
      )}
    </section>
  )
}

/** Table of API keys. */
function ApiKeysTable({ items, onRevoke }: { items: AdminApiKey[]; onRevoke: (key: AdminApiKey) => void }) {
  return (
    <table data-testid="admin-apikeys-table" className="w-full text-sm">
      <thead>
        <tr className="border-b border-border-subtle text-left text-text-secondary">
          <th className="py-2 pr-3">ID</th>
          <th className="py-2 pr-3">Last 4</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2 pr-3">Issued</th>
          <th className="py-2 pr-3">Last used</th>
          <th className="py-2 pr-3">Requests</th>
          <th className="py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((key) => (
          <tr key={key.id} data-testid={`admin-apikey-row-${key.id}`} className="border-b border-border-subtle hover:bg-surface">
            <td className="py-2 pr-3 font-mono text-2xs">{key.id}</td>
            <td className="py-2 pr-3 font-mono">…{key.keyLast4}</td>
            <td className="py-2 pr-3">
              <span className={`rounded px-2 py-0.5 text-2xs ${key.status === 'active' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                {key.status}
              </span>
            </td>
            <td className="py-2 pr-3 text-text-secondary">{new Date(key.issuedAt).toLocaleDateString()}</td>
            <td className="py-2 pr-3 text-text-secondary">{key.lastUsedAt !== null ? new Date(key.lastUsedAt).toLocaleDateString() : '—'}</td>
            <td className="py-2 pr-3">{key.usageCount}</td>
            <td className="py-2">
              {key.status === 'active' && (
                <Button data-testid={`admin-apikey-revoke-${key.id}`} size="sm" variant="danger" onClick={() => onRevoke(key)}>
                  Revoke
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Modal for revoking an API key. */
function RevokeModal({ target, confirmation, reason, revoking, onConfirmationChange, onReasonChange, onRevoke, onClose }: {
  target: AdminApiKey
  confirmation: string
  reason: string
  revoking: boolean
  onConfirmationChange: (v: string) => void
  onReasonChange: (v: string) => void
  onRevoke: () => void
  onClose: () => void
}) {
  return (
    <Modal data-testid="admin-revoke-modal" isOpen title={`Revoke API key …${target.keyLast4}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-text-secondary">Type <strong>REVOKE</strong> to confirm.</p>
        <Input
          data-testid="admin-revoke-confirmation"
          value={confirmation}
          onChange={(e) => onConfirmationChange(e.target.value)}
          placeholder="REVOKE"
        />
        <Input
          data-testid="admin-revoke-reason"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Reason (optional)"
        />
        <div className="flex gap-2">
          <Button data-testid="admin-revoke-confirm" variant="danger" disabled={confirmation !== 'REVOKE' || revoking} onClick={onRevoke}>
            {revoking ? 'Revoking...' : 'Revoke'}
          </Button>
          <Button data-testid="admin-revoke-cancel" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
