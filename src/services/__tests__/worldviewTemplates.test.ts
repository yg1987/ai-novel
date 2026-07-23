import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readProjectFile: vi.fn(),
  writeProjectFile: vi.fn(),
}))

vi.mock('../../api/tauri', () => ({
  readProjectFile: mocks.readProjectFile,
  writeProjectFile: mocks.writeProjectFile,
}))

import {
  createWorldviewTemplate,
  deleteWorldviewTemplate,
  loadWorldviewTemplates,
} from '../worldviewTemplates'

const sections = [{
  key: 'world',
  label: '世界背景',
  file: 'world.md',
  hint: '世界设定',
  subs: [{ key: '规则', label: '规则', hint: '核心规则' }],
}]

describe('worldviewTemplates', () => {
  beforeEach(() => {
    mocks.readProjectFile.mockReset()
    mocks.writeProjectFile.mockReset()
  })

  it('treats a missing template file as an empty list', async () => {
    mocks.readProjectFile.mockRejectedValue(new Error('missing'))
    await expect(loadWorldviewTemplates('project-1')).resolves.toEqual([])
  })

  it('rejects malformed template data instead of silently resetting it', async () => {
    mocks.readProjectFile.mockResolvedValue('{not json')
    await expect(loadWorldviewTemplates('project-1')).rejects.toThrow('有效的 JSON')
  })

  it('saves a cloned current section structure as a project template', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'))
    mocks.readProjectFile.mockResolvedValue('')

    const template = await createWorldviewTemplate('project-1', '我的玄幻结构', sections)

    expect(template).toMatchObject({
      id: 'template_1784808000000',
      name: '我的玄幻结构',
      sections,
    })
    expect(mocks.writeProjectFile).toHaveBeenCalledWith(
      'project-1',
      'worldview',
      '_worldview_templates.json',
      expect.stringContaining('我的玄幻结构'),
    )
    vi.useRealTimers()
  })

  it('removes only the selected template', async () => {
    mocks.readProjectFile.mockResolvedValue(JSON.stringify({
      schemaVersion: 1,
      templates: [
        { id: 'one', name: '模板一', createdAt: '2026-07-23T00:00:00.000Z', sections },
        { id: 'two', name: '模板二', createdAt: '2026-07-23T00:00:00.000Z', sections },
      ],
    }))

    await deleteWorldviewTemplate('project-1', 'one')

    const saved = JSON.parse(mocks.writeProjectFile.mock.calls[0]?.[3] as string) as { templates: Array<{ id: string }> }
    expect(saved.templates.map((template) => template.id)).toEqual(['two'])
  })
})
