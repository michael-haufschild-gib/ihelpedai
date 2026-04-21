import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Textarea } from '@/components/ui/Textarea'
import type { AdminSettings as Settings } from '@/lib/adminApi'
import { getSettings, updateSetting } from '@/lib/adminApi'

/** Admin settings page (Story 11). */
export function AdminSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [exceptions, setExceptions] = useState('')

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((s) => { if (!cancelled) { setSettings(s); setExceptions(s.sanitizer_exceptions) } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const toggle = async (key: keyof Settings) => {
    if (!settings) return
    const newVal = settings[key] === 'true' ? 'false' : 'true'
    setSaving(key)
    try {
      await updateSetting(key, newVal)
      setSettings({ ...settings, [key]: newVal })
    } catch {
      // Keep the old value visible on failure; admin can retry.
    } finally {
      setSaving(null)
    }
  }

  const saveExceptions = async () => {
    setSaving('sanitizer_exceptions')
    try {
      await updateSetting('sanitizer_exceptions', exceptions)
      if (settings) setSettings({ ...settings, sanitizer_exceptions: exceptions })
    } catch {
      // Leave the unsaved draft in the textarea so the admin can retry.
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
          One entry per line. These terms will be preserved by the sanitizer.
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
