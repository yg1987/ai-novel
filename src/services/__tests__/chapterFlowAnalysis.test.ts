import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(() => ({
  atomicWriteProjectFile: vi.fn(),
  deleteProjectFile: vi.fn(),
  getChapterContent: vi.fn(),
  loadProviderConfig: vi.fn(),
  readProjectFile: vi.fn(),
}))

vi.mock('../../api/tauri', () => tauri)

import { runChapterFlowAnalysis } from '../chapterFlowAnalysis'

const files = new Map<string, string>()
const key = (dir: string, name: string) => `${dir}/${name}`

const store = {
  schemaVersion: 1,
  updatedAt: '',
  entries: [{
    id: 'f1', name: '身世谜团', description: '身份伏笔', status: 'planted', category: 'identity', importance: 0.8,
    plantedChapter: { volume: '卷1', chapterId: 'ch001' }, progress: [], relatedCharacters: [], notes: '', createdAt: '', updatedAt: '',
  }],
}

describe('chapter flow analysis task', () => {
  beforeEach(() => {
    files.clear()
    vi.clearAllMocks()
    tauri.readProjectFile.mockImplementation((_projectId: string, dir: string, name: string) => Promise.resolve(files.get(key(dir, name)) ?? (dir === 'memory' && name === 'foreshadows.json' ? JSON.stringify(store) : '')))
    tauri.atomicWriteProjectFile.mockImplementation((_projectId: string, dir: string, name: string, content: string) => {
      files.set(key(dir, name), content)
      return Promise.resolve()
    })
    tauri.deleteProjectFile.mockResolvedValue(null)
    tauri.getChapterContent.mockResolvedValue('<p>真相终于揭晓。</p>')
    tauri.loadProviderConfig.mockResolvedValue({
      active_profile: 'test',
      providers: [{ name: 'test', base_url: 'https://example.test/v1', api_key: 'key', models: { analysis: 'analysis-model' } }],
    })
  })

  it('persists only findings with an allowed id and verbatim normalized evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({
        summary: '章节揭示真相。', keyEvents: ['揭示身份'], endingHook: '',
        findings: [
          { type: 'possible-resolution', foreshadowId: 'f1', summary: '身份伏笔可能回收', quote: '真相终于揭晓。', confidence: 0.9 },
          { type: 'possible-advance', foreshadowId: 'unknown', summary: '无效关联', quote: '真相终于揭晓。', confidence: 0.8 },
          { type: 'possible-advance', foreshadowId: 'f1', summary: '无证据', quote: '正文中不存在', confidence: 0.8 },
        ],
      }) } }] }),
    }))

    await expect(runChapterFlowAnalysis('p1', [{ volume: '卷1', chapterId: 'ch001' }])).resolves.toMatchObject({ succeeded: 1, failed: 0 })

    const index = JSON.parse(files.get(key('memory/chapter-flow', 'index.json')) ?? '{}') as { chapters: Array<{ status: string }>; findings: Array<{ foreshadowId?: string; evidenceCount: number }> }
    expect(index.chapters[0]?.status).toBe('ready')
    expect(index.findings).toEqual([expect.objectContaining({ foreshadowId: 'f1', evidenceCount: 1 })])
    expect([...files.keys()].filter((name) => name.startsWith('memory/chapter-flow/findings/'))).toHaveLength(1)
  })

  it('continues after one chapter fails and records the failure for retry', async () => {
    tauri.getChapterContent.mockImplementation((_projectId: string, _volume: string, chapterId: string) => {
      if (chapterId === 'ch001') return Promise.resolve('<p>第一章</p>')
      return Promise.resolve('<p>第二章</p>')
    })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'bad gateway' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: 'ok', keyEvents: [], endingHook: '', findings: [] }) } }] }) }))

    const result = await runChapterFlowAnalysis('p1', [
      { volume: '卷1', chapterId: 'ch001' },
      { volume: '卷1', chapterId: 'ch002' },
    ])

    expect(result).toMatchObject({ completed: 2, succeeded: 1, failed: 1, cancelled: false })
    const index = JSON.parse(files.get(key('memory/chapter-flow', 'index.json')) ?? '{}') as { chapters: Array<{ ref: { chapterId: string }; status: string; error?: string }> }
    expect(index.chapters.find((item) => item.ref.chapterId === 'ch001')).toMatchObject({ status: 'failed' })
    expect(index.chapters.find((item) => item.ref.chapterId === 'ch002')).toMatchObject({ status: 'ready' })
  })

  it('keeps completed work when cancellation stops later chapters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: 'ok', keyEvents: [], endingHook: '', findings: [] }) } }] }),
    }))
    const controller = new AbortController()
    const result = await runChapterFlowAnalysis('p1', [
      { volume: '卷1', chapterId: 'ch001' },
      { volume: '卷1', chapterId: 'ch002' },
    ], controller.signal, (progress) => {
      if (progress.completed === 1) controller.abort()
    })

    expect(result).toMatchObject({ completed: 1, succeeded: 1, failed: 0, cancelled: true })
    const index = JSON.parse(files.get(key('memory/chapter-flow', 'index.json')) ?? '{}') as { chapters: Array<{ ref: { chapterId: string }; status: string }> }
    expect(index.chapters).toEqual([expect.objectContaining({ ref: { volume: '卷1', chapterId: 'ch001' }, status: 'ready' })])
  })

  it('limits cross-chapter AI calls to indexed candidates and stores two-sided evidence', async () => {
    tauri.getChapterContent.mockImplementation((_projectId: string, _volume: string, chapterId: string) => Promise.resolve(
      chapterId === 'ch001' ? '<p>旧日玉佩刻着家徽。</p>' : '<p>他认出玉佩上的家徽。</p>',
    ))
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        summary: '玉佩出现。', keyEvents: ['玉佩家徽'], endingHook: '', findings: [{ type: 'possible-advance', foreshadowId: 'f1', summary: '身份线索出现', quote: '玉佩刻着家徽。', confidence: 0.8 }],
      }) } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        summary: '家徽被认出。', keyEvents: ['认出家徽'], endingHook: '', findings: [{ type: 'possible-resolution', foreshadowId: 'f1', summary: '身份线索推进', quote: '认出玉佩上的家徽。', confidence: 0.9 }],
      }) } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        related: true, type: 'possible-continuation', foreshadowId: 'f1', summary: '家徽线索形成前后呼应', sourceQuote: '认出玉佩上的家徽。', targetQuote: '玉佩刻着家徽。', confidence: 0.92,
      }) } }] }) }))

    await runChapterFlowAnalysis('p1', [{ volume: '卷1', chapterId: 'ch001' }])
    await runChapterFlowAnalysis('p1', [{ volume: '卷1', chapterId: 'ch002' }])

    const index = JSON.parse(files.get(key('memory/chapter-flow', 'index.json')) ?? '{}') as { findings: Array<{ type: string; source: { chapterId: string }; target?: { chapterId: string }; evidenceCount: number }> }
    expect(index.findings).toHaveLength(3)
    expect(index.findings).toContainEqual(expect.objectContaining({
      type: 'possible-continuation', source: { volume: '卷1', chapterId: 'ch002' }, target: { volume: '卷1', chapterId: 'ch001' }, evidenceCount: 2,
    }))
  })
})
