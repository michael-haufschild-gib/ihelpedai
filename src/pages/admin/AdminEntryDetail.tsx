import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import type { AdminEntryDetail as EntryDetail } from '@/lib/adminApi'
import { entryAction, getEntry, purgeEntry } from '@/lib/adminApi'

/** Format a date string for display. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

/** Admin entry detail page (Story 4). */
export function AdminEntryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<EntryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ action: string; label: string } | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    if (!id) return undefined
    let cancelled = false
    getEntry(id)
      .then((e) => { if (!cancelled) setEntry(e) })
      .catch(() => { if (!cancelled) setEntry(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const handleAction = async (action: string) => {
    if (!entry) return
    setActionLoading(true)
    try {
      if (action === 'purge') {
        await purgeEntry(entry.id, confirmation, reason !== '' ? reason : undefined)
      } else {
        await entryAction(entry.id, action, reason !== '' ? reason : undefined)
      }
      navigate('/admin', { replace: true })
    } catch {
      setActionLoading(false)
    }
  }

  if (loading) return <p className="text-text-secondary">Loading...</p>
  if (!entry) return <p data-testid="admin-entry-not-found" className="text-text-secondary">Not found.</p>

  return (
    <section data-testid="admin-entry-detail" className="flex flex-col gap-6">
      <EntryHeader entry={entry} onBack={() => navigate('/admin')} />
      <EntryFields entry={entry} />
      <EntryActions entry={entry} onAction={(action, label) => setModal({ action, label })} />
      <EntryAuditLog auditLog={entry.audit_log} />
      {modal && (
        <ActionModal
          modal={modal}
          confirmation={confirmation}
          reason={reason}
          actionLoading={actionLoading}
          onConfirmationChange={setConfirmation}
          onReasonChange={setReason}
          onConfirm={() => handleAction(modal.action)}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  )
}

/** Header with back button and status indicator. */
function EntryHeader({ entry, onBack }: { entry: EntryDetail; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Button data-testid="admin-entry-back" variant="ghost" size="sm" onClick={onBack}>
        Back
      </Button>
      <h1 className="text-xl font-semibold">Entry {entry.id}</h1>
      <span className="rounded bg-surface px-2 py-0.5 text-2xs capitalize">{entry.status}</span>
    </div>
  )
}

/** Detail fields card. */
function EntryFields({ entry }: { entry: EntryDetail }) {
  const createdDisplay = formatDate(entry.createdAt)
  return (
    <div className="rounded border border-border-default bg-surface p-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt className="text-text-secondary">Type</dt>
        <dd className="capitalize">{entry.entryType}</dd>
        <dt className="text-text-secondary">Source</dt>
        <dd>{entry.source === 'api' ? `API${entry.selfReportedModel !== null ? ` — ${entry.selfReportedModel}` : ''}` : 'Form'}</dd>
        <dt className="text-text-secondary">Created</dt>
        <dd>{createdDisplay}</dd>
        {entry.clientIpHash !== null && (
          <>
            <dt className="text-text-secondary">Client IP hash</dt>
            <dd className="font-mono text-2xs">{entry.clientIpHash}</dd>
          </>
        )}
      </dl>
      <div className="mt-4 border-t border-border-subtle pt-4">
        <h2 className="mb-2 text-sm font-medium text-text-secondary">Fields</h2>
        <pre data-testid="admin-entry-fields" className="whitespace-pre-wrap text-sm">
          {JSON.stringify(entry.fields, null, 2)}
        </pre>
      </div>
    </div>
  )
}

/** Action buttons for entry (approve, reject, delete, restore, purge). */
function EntryActions({ entry, onAction }: { entry: EntryDetail; onAction: (action: string, label: string) => void }) {
  const isPending = entry.status === 'pending'
  const isLive = entry.status === 'live'
  const isDeleted = entry.status === 'deleted'

  return (
    <div className="flex flex-wrap gap-2">
      {isPending && (
        <>
          <Button data-testid="admin-entry-approve" onClick={() => onAction('approve', 'APPROVE')}>Approve</Button>
          <Button data-testid="admin-entry-reject" variant="danger" onClick={() => onAction('reject', 'REJECT')}>Reject</Button>
        </>
      )}
      {(isLive || isPending) && (
        <Button data-testid="admin-entry-delete" variant="danger" onClick={() => onAction('delete', 'DELETE')}>Delete</Button>
      )}
      {isDeleted && (
        <Button data-testid="admin-entry-restore" onClick={() => onAction('restore', 'RESTORE')}>Restore</Button>
      )}
      <Button data-testid="admin-entry-purge" variant="danger" onClick={() => onAction('purge', `${entry.id} PURGE`)}>Purge</Button>
    </div>
  )
}

/** Audit log section. */
function EntryAuditLog({ auditLog }: { auditLog: EntryDetail['audit_log'] }) {
  if (auditLog.length === 0) return null
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium">Audit log</h2>
      <table data-testid="admin-entry-audit" className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-text-secondary">
            <th className="py-1 pr-3">Date</th>
            <th className="py-1 pr-3">Admin</th>
            <th className="py-1 pr-3">Action</th>
            <th className="py-1">Details</th>
          </tr>
        </thead>
        <tbody>
          {auditLog.map((log) => (
            <tr key={log.id} className="border-b border-border-subtle">
              <td className="py-1 pr-3 text-text-secondary">{formatDate(log.createdAt)}</td>
              <td className="py-1 pr-3">{log.adminEmail ?? 'system'}</td>
              <td className="py-1 pr-3">{log.action}</td>
              <td className="py-1 text-text-secondary">{log.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Confirmation modal for entry actions. */
function ActionModal({ modal, confirmation, reason, actionLoading, onConfirmationChange, onReasonChange, onConfirm, onClose }: {
  modal: { action: string; label: string }
  confirmation: string
  reason: string
  actionLoading: boolean
  onConfirmationChange: (v: string) => void
  onReasonChange: (v: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal data-testid="admin-action-modal" isOpen title={`Confirm: ${modal.action}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-text-secondary">
          Type <strong>{modal.label}</strong> to confirm.
        </p>
        <Input
          data-testid="admin-action-confirmation"
          value={confirmation}
          onChange={(e) => onConfirmationChange(e.target.value)}
          placeholder={modal.label}
        />
        <Textarea
          data-testid="admin-action-reason"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Reason (optional)"
        />
        <div className="flex gap-2">
          <Button
            data-testid="admin-action-confirm"
            disabled={confirmation !== modal.label || actionLoading}
            onClick={onConfirm}
          >
            {actionLoading ? 'Processing...' : 'Confirm'}
          </Button>
          <Button data-testid="admin-action-cancel" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
