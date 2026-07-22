import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(() => ({
  atomicWriteProjectFile: vi.fn(),
  deleteProjectFile: vi.fn(),
  readProjectFile: vi.fn(),
}))

vi.mock('../../api/tauri', () => tauri)

import { readChapterFlowIndex, recoverChapterFlowIndex } from '../chapterFlowIndexStorage'

describe('chapter flow index recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tauri.readProjectFile.mockResolvedValue('{broken index')
    tauri.atomicWriteProjectFile.mockResolvedValue(undefined)
  })

  it('keeps corrupt content untouched during ordinary reads', async () => {
    await expect(readChapterFlowIndex('p1')).resolves.toMatchObject({ kind: 'corrupt', raw: '{broken index' })
    expect(tauri.atomicWriteProjectFile).not.toHaveBeenCalled()
  })

  it('backs up corrupt content before explicit recovery writes a new index', async () => {
    await recoverChapterFlowIndex('p1')

    expect(tauri.atomicWriteProjectFile).toHaveBeenCalledTimes(2)
    expect(tauri.atomicWriteProjectFile.mock.calls[0]?.slice(0, 2)).toEqual(['p1', 'memory/chapter-flow/recovery'])
    expect(tauri.atomicWriteProjectFile.mock.calls[0]?.[3]).toBe('{broken index')
    expect(tauri.atomicWriteProjectFile.mock.calls[1]?.slice(0, 3)).toEqual(['p1', 'memory/chapter-flow', 'index.json'])
  })
})
