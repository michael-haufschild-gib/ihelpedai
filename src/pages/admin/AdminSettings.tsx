import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Textarea } from '@/components/ui/Textarea'
import { ApiError } from '@/lib/api'
import type { AdminSettings as Settings } from '@/lib/adminApi'
import { getSettings, updateSetting } from '@/lib/adminApi'
import { logger } from '@/services/logger'
import { showToast } from '@/stores/toastStore'

/** One-line, audience-appropriate failure message for an admin save. */
function describeSettingsSaveError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === 'unauthorized') return 'Session expired. Sign in again.'
    if (err.kind === 'invalid_input') return 'Invalid value — fix and retry.'
    if (err.status === 0) return 'Network unreachable. Try again.'
  }
  return 'Save failed. Try again.'
}

/**
 * Fetch the current admin settings once and drive `settings` +
 * `exceptions` state, so the AdminSettings body stays under the
 * function-line cap. Surfaces a toast on load failure; the page still
 * renders a null-fallback message when `settings` stays null.
 */
function useAdminSettingsLoader(
  setSettings: (s: Settings) => void,
  setExceptions: (s: string) => void,
): boolean {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((s) => {
        if (cancelled) return
        setSettings(s)
        setExceptions(s.sanitizer_exceptions)
      })
      .catch((err: unknown) => {
        logger.error('admin settings load failed', err)
        if (!cancelled) showToast('Failed to load settings.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [setSettings, setExceptions])
  return loading
}

/** Admin settings page (Story 11). */
export function AdminSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [exceptions, setExceptions] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const loading = useAdminSettingsLoader(setSettings, setExceptions)

  const toggle = async (key: keyof Settings) => {
    if (!settings) return
    const newVal = settings[key] === 'true' ? 'false' : 'true'
    setSaving(key)
    try {
      await updateSetting(key, newVal)
      setSettings({ ...settings, [key]: newVal })
    } catch (err: unknown) {
      // Keep the old value visible on failure; surface a toast so the admin
      // knows the toggle did not actually take effect.
      showToast(describeSettingsSaveError(err))
    } finally {
      setSaving(null)
    }
  }

  const saveExceptions = async () => {
    setSaving('sanitizer_exceptions')
    try {
      await updateSetting('sanitizer_exceptions', exceptions)
      if (settings) setSettings({ ...settings, sanitizer_exceptions: exceptions })
    } catch (err: unknown) {
      // Leave the unsaved draft in the textarea so the admin can retry.
      showToast(describeSettingsSaveError(err))
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="text-text-secondary">Loading...</p>
  if (!settings) return <p className="text-text-secondary">Failed to load settings.</p>

  return (
    <section data-testid="admin-settings-page" className="flex max-w-lg flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsToggle
        testId="admin-settings-auto-publish"
        label="Auto-publish agent submissions"
        description="When off, agent submissions go to the moderation queue."
        checked={settings.auto_publish_agents === 'true'}
        onChange={() => toggle('auto_publish_agents')}
        disabled={saving === 'auto_publish_agents'}
      />
      <SettingsToggle
        testId="admin-settings-submission-freeze"
        label="Submission freeze"
        description="When on, all public submissions are temporarily disabled."
        checked={settings.submission_freeze === 'true'}
        onChange={() => toggle('submission_freeze')}
        disabled={saving === 'submission_freeze'}
      />
      <div className="rounded border border-border-default bg-surface p-4">
        <p className="mb-2 font-medium">Sanitizer exception list</p>
        <p className="mb-3 text-sm text-text-secondary">
          One entry per line. Preserved by the server sanitizer when a post is stored. Live form
          previews use the client's static list, so admin-added terms may still appear as
          [name] during preview but will survive in the final post.
        </p>
        <Textarea
          data-testid="admin-settings-exceptions"
          value={exceptions}
          onChange={(e) => setExceptions(e.target.value)}
          rows={6}
        />
        <Button
          data-testid="admin-settings-save-exceptions"
          size="sm"
          className="mt-3"
          onClick={saveExceptions}
          disabled={saving === 'sanitizer_exceptions' || exceptions === settings.sanitizer_exceptions}
        >
          {saving === 'sanitizer_exceptions' ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </section>
  )
}

/** Individual toggle row for a boolean setting. */
function SettingsToggle({ testId, label, description, checked, onChange, disabled }: {
  testId: string
  label: string
  description: string
  checked: boolean
  onChange: () => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded border border-border-default bg-surface p-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
      <Switch
        data-testid={testId}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
