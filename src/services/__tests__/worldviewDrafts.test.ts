import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteProjectFile: vi.fn(),
  readProjectFile: vi.fn(),
  writeProjectFile: vi.fn(),
}))

vi.mock('../../api/tauri', () => ({
  deleteProjectFile: mocks.deleteProjectFile,
  readProjectFile: mocks.readProjectFile,
  writeProjectFile: mocks.writeProjectFile,
}))

import {
  contentHash,
  deleteWorldviewDraft,
  loadWorldviewDraft,
  saveWorldviewDraft,
} from '../worldviewDrafts'

describe('worldview drafts', () => {
  beforeEach(() => {
    mocks.deleteProjectFile.mockReset()
    mocks.readProjectFile.mockReset()
    mocks.writeProjectFile.mockReset()
  })

  it('saves drafts under the project-local hidden draft directory', async () => {
    const draft = {
      schemaVersion: 1 as const,
      sectionFile: '力量体系.md',
      savedAt: '2026-07-23T00:00:00.000Z',
      baseContentHash: 'hash',
      content: '草稿',
      subValues: { 境界: '炼气' },
    }

    await saveWorldviewDraft('project-1', draft)

    expect(mocks.writeProjectFile).toHaveBeenCalledWith(
      'project-1',
      'worldview/.drafts',
      `${encodeURIComponent('力量体系.md')}.json`,
      JSON.stringify(draft, null, 2),
    )
  })

  it('rejects malformed drafts and safely clears missing drafts', async () => {
    mocks.readProjectFile.mockResolvedValue('{broken')
    await expect(loadWorldviewDraft('project-1', 'rules.md')).resolves.toBeNull()

    mocks.deleteProjectFile.mockRejectedValue(new Error('missing'))
    await expect(deleteWorldviewDraft('project-1', 'rules.md')).resolves.toBeUndefined()
  })

  it('uses a stable SHA-256 content hash for draft conflict detection', async () => {
    await expect(contentHash('世界观')).resolves.toMatch(/^[0-9a-f]{64}$/)
    await expect(contentHash('世界观')).resolves.toBe(await contentHash('世界观'))
  })
})
