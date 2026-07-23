import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ readProjectFile: vi.fn(), writeProjectFile: vi.fn() }))
vi.mock('../../api/tauri', () => ({ readProjectFile: mocks.readProjectFile, writeProjectFile: mocks.writeProjectFile }))

import { createWorldviewRule, loadWorldviewRules, updateWorldviewRule } from '../worldviewRules'

const input = {
  name: '复活限制', statement: '任何角色只能复活一次。', strength: 'hard' as const,
  applicableTo: '全大陆', aliases: ['回魂', '复生'], status: 'active' as const, sourceSectionKey: 'world',
}

describe('worldviewRules', () => {
  beforeEach(() => {
    mocks.readProjectFile.mockReset()
    mocks.writeProjectFile.mockReset()
  })

  it('returns an empty rule collection when the file is absent', async () => {
    mocks.readProjectFile.mockRejectedValue(new Error('missing'))
    await expect(loadWorldviewRules('project-1')).resolves.toEqual([])
  })

  it('rejects malformed rule data without overwriting it', async () => {
    mocks.readProjectFile.mockResolvedValue('{bad json')
    await expect(loadWorldviewRules('project-1')).rejects.toThrow('有效的 JSON')
    expect(mocks.writeProjectFile).not.toHaveBeenCalled()
  })

  it('normalizes aliases when creating a manual rule', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T13:00:00.000Z'))
    mocks.readProjectFile.mockResolvedValue('')
    const rule = await createWorldviewRule('project-1', { ...input, aliases: ['回魂', ' 回魂 ', '', '复生'] })
    expect(rule).toMatchObject({ id: 'rule_1784811600000', aliases: ['回魂', '复生'] })
    expect(mocks.writeProjectFile).toHaveBeenCalledWith('project-1', 'worldview', '_worldview_rules.json', expect.stringContaining('复活限制'))
    vi.useRealTimers()
  })

  it('preserves immutable creation metadata while updating a rule', async () => {
    mocks.readProjectFile.mockResolvedValue(JSON.stringify({
      schemaVersion: 1,
      rules: [{ id: 'rule-1', ...input, createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z' }],
    }))
    const updated = await updateWorldviewRule('project-1', 'rule-1', { ...input, statement: '任何角色最多复活一次。' })
    expect(updated.createdAt).toBe('2026-07-20T00:00:00.000Z')
    expect(updated.statement).toBe('任何角色最多复活一次。')
  })
})
