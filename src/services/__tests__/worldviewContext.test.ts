import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listProjectFiles: vi.fn(),
  readProjectFile: vi.fn(),
  loadSections: vi.fn(),
}))

vi.mock('../../api/tauri', () => ({
  listProjectFiles: mocks.listProjectFiles,
  readProjectFile: mocks.readProjectFile,
}))

vi.mock('../worldviewConfig', () => ({
  loadSections: mocks.loadSections,
}))

import { buildWorldviewContext } from '../worldviewContext'

describe('buildWorldviewContext', () => {
  beforeEach(() => {
    mocks.listProjectFiles.mockReset()
    mocks.readProjectFile.mockReset()
    mocks.loadSections.mockReset()
  })

  it('uses configured order and labels rather than file order', async () => {
    mocks.loadSections.mockResolvedValue([
      { key: 'rules', label: '核心规则', file: 'rules.md', subs: [], hint: '' },
      { key: 'history', label: '历史背景', file: 'history.md', subs: [], hint: '' },
    ])
    mocks.readProjectFile.mockImplementation(async (_projectId: string, _dir: string, file: string) => ({
      'rules.md': '# 规则\n不能复活。',
      'history.md': '# 历史\n王朝覆灭。',
    })[file] ?? '')

    await expect(buildWorldviewContext('project-1')).resolves.toBe(
      '【核心规则】\n# 规则\n不能复活。\n\n【历史背景】\n# 历史\n王朝覆灭。',
    )
    expect(mocks.listProjectFiles).not.toHaveBeenCalled()
  })

  it('falls back to Markdown only when no section config exists', async () => {
    mocks.loadSections.mockResolvedValue(null)
    mocks.listProjectFiles.mockResolvedValue([
      { name: '_worldview_sections.json' },
      { name: 'b.md' },
      { name: 'a.md' },
      { name: '.drafts' },
    ])
    mocks.readProjectFile.mockImplementation(async (_projectId: string, _dir: string, file: string) => `${file} 内容`)

    await expect(buildWorldviewContext('project-1')).resolves.toBe('【a】\na.md 内容\n\n【b】\nb.md 内容')
    expect(mocks.readProjectFile).toHaveBeenCalledTimes(2)
  })

  it('marks content that exceeds the configured token budget', async () => {
    mocks.loadSections.mockResolvedValue([
      { key: 'rules', label: '规则', file: 'rules.md', subs: [], hint: '' },
    ])
    mocks.readProjectFile.mockResolvedValue('这是一段很长的世界观设定。'.repeat(80))

    await expect(buildWorldviewContext('project-1', 40)).resolves.toContain('[世界观内容已按预算截断]')
  })
})
