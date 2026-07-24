import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  readProjectFile: vi.fn(),
  atomicWriteProjectFile: vi.fn(),
}))

vi.mock('../../api/tauri', () => api)

import { defaultCharacterModuleConfig, saveCharacterModuleConfig } from '../characterConfig'

describe('character config persistence', () => {
  beforeEach(() => {
    api.readProjectFile.mockReset()
    api.atomicWriteProjectFile.mockReset()
  })

  it('rejects a stale revision before writing config', async () => {
    const current = { ...defaultCharacterModuleConfig(), revision: 3 }
    api.readProjectFile.mockResolvedValue(JSON.stringify(current))

    await expect(saveCharacterModuleConfig('project-1', { ...current, revision: 2 }, 2)).rejects.toThrow('其他页面修改')
    expect(api.atomicWriteProjectFile).not.toHaveBeenCalled()
  })
})
