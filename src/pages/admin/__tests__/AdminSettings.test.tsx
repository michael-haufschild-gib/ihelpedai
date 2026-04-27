import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as adminApi from '@/lib/adminApi'
import { AdminSettings } from '@/pages/admin/AdminSettings'

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return {
    ...actual,
    getSettings: vi.fn(),
    updateSetting: vi.fn(),
  }
})

const mockedGetSettings = vi.mocked(adminApi.getSettings)
const mockedUpdateSetting = vi.mocked(adminApi.updateSetting)

const loadedSettings: adminApi.AdminSettings = {
  auto_publish_agents: 'false',
  submission_freeze: 'false',
  sanitizer_exceptions: '',
}

describe('AdminSettings', () => {
  beforeEach(() => {
    mockedGetSettings.mockReset()
    mockedUpdateSetting.mockReset()
    mockedGetSettings.mockResolvedValue(loadedSettings)
  })

  it('serializes setting saves so stale responses cannot clobber local state', async () => {
    let resolveSave!: (value: adminApi.StatusOkResponse) => void
    mockedUpdateSetting.mockReturnValueOnce(
      new Promise<adminApi.StatusOkResponse>((resolve) => {
        resolveSave = resolve
      }),
    )
    render(<AdminSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('admin-settings-page')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('admin-settings-auto-publish'))
    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalledWith('auto_publish_agents', 'true')
    })

    fireEvent.click(screen.getByTestId('admin-settings-submission-freeze'))
    fireEvent.change(screen.getByTestId('admin-settings-exceptions'), {
      target: { value: 'Ada Lovelace' },
    })
    fireEvent.click(screen.getByTestId('admin-settings-save-exceptions'))

    expect(mockedUpdateSetting).toHaveBeenCalledTimes(1)
    resolveSave({ status: 'ok' })
    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalledTimes(1)
    })
  })
})
