import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(() => ({
  getChapterContent: vi.fn(),
  listChapters: vi.fn(),
  readProjectFile: vi.fn(),
}))

vi.mock('../../api/tauri', () => tauri)

import { loadChapterFlowView } from '../chapterFlowService'

describe('chapter flow lightweight loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tauri.readProjectFile.mockImplementation((_projectId: string, dir: string, name: string) => Promise.resolve(
      dir === 'memory' && name === 'foreshadows.json'
        ? JSON.stringify({ schemaVersion: 1, entries: [], updatedAt: '' })
        : '',
    ))
  })

  it('opens a 1000-chapter project from metadata and index only', async () => {
    tauri.listChapters.mockResolvedValue(Array.from({ length: 1000 }, (_, index) => ({
      volume: `卷${Math.floor(index / 200) + 1}`,
      id: `ch${String((index % 200) + 1).padStart(3, '0')}`,
      order: (index % 200) + 1,
      title: `章节 ${index + 1}`,
    })))

    const view = await loadChapterFlowView('p1')

    expect(view.volumes.flatMap((volume) => volume.chapters)).toHaveLength(1000)
    expect(view.analysisItems).toHaveLength(1000)
    expect(tauri.getChapterContent).not.toHaveBeenCalled()
  })

  it('keeps the internal volume number in the displayed custom volume name', async () => {
    tauri.listChapters.mockResolvedValue([{ volume: '卷1', id: 'ch001', order: 1, title: '开场' }])
    tauri.readProjectFile.mockImplementation((_projectId: string, dir: string, name: string) => Promise.resolve(
      dir === 'memory' && name === 'foreshadows.json'
        ? JSON.stringify({ schemaVersion: 1, entries: [], updatedAt: '' })
        : dir === 'memory' && name === '_volume_names.json' ? JSON.stringify({ 卷1: '台风' }) : '',
    ))

    const view = await loadChapterFlowView('p1')

    expect(view.volumes[0]?.label).toBe('卷1 台风')
  })
})
