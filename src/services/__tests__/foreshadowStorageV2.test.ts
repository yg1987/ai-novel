import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => new Map<string, string>())
const tauri = vi.hoisted(() => ({
  atomicWriteProjectFile: vi.fn(async (_projectId: string, directory: string, filename: string, content: string) => {
    files.set(`${directory}/${filename}`, content)
  }),
  deleteProjectFile: vi.fn(),
  readProjectFile: vi.fn(async (_projectId: string, directory: string, filename: string) => files.get(`${directory}/${filename}`) ?? ''),
  writeProjectFile: vi.fn(),
}))

vi.mock('../../api/tauri', () => tauri)
vi.mock('../characterConfig', () => ({
  defaultCharacterModuleConfig: () => ({ organizationKinds: [] }),
  loadCharacterModuleConfig: vi.fn(async () => ({ organizationKinds: [] })),
}))
vi.mock('../characterCatalog', () => ({
  loadCharacterCatalog: vi.fn(async () => ({ catalog: { records: [{ id: 'char-1', name: '林烬', aliases: ['小烬'] }] } })),
  resolveCharacterName: (records: Array<{ id: string; name: string; aliases: string[] }>, name: string) => {
    const record = records.find((item) => item.name === name || item.aliases.includes(name))
    return record ? { characterId: record.id } : { diagnostic: { value: name, kind: 'unresolved' } }
  },
}))

import { loadForeshadows, saveForeshadows } from '../foreshadowStorage'

const legacyEntry = {
  id: 'f1',
  name: '身世',
  description: '旧版伏笔',
  status: 'planted',
  category: 'identity',
  importance: 0.8,
  plantedChapter: { volume: '卷1', chapterId: 'ch001' },
  progress: [],
  relatedCharacters: ['小烬', '未知人'],
  notes: '',
  createdAt: '',
  updatedAt: '',
}

describe('foreshadow schema v2 migration', () => {
  beforeEach(() => {
    files.clear()
    vi.clearAllMocks()
    files.set('memory/foreshadows.json', JSON.stringify({ schemaVersion: 1, entries: [legacyEntry], updatedAt: '' }))
  })

  it('previews stable IDs without rewriting the legacy source', async () => {
    const source = files.get('memory/foreshadows.json')
    const store = await loadForeshadows('p1')

    expect(store.schemaVersion).toBe(2)
    expect(store.entries[0]?.relatedCharacterIds).toEqual(['char-1'])
    expect(store.migration?.unresolvedNames).toEqual(['未知人'])
    expect(files.get('memory/foreshadows.json')).toBe(source)
    expect(tauri.atomicWriteProjectFile).not.toHaveBeenCalled()
  })

  it('backs up and verifies v1 before the first v2 save', async () => {
    const store = await loadForeshadows('p1')
    await saveForeshadows('p1', store)

    const backup = [...files.entries()].find(([path]) => path.startsWith('memory/legacy-backups/foreshadows-v1-'))
    expect(backup?.[1]).toContain('"schemaVersion":1')
    expect(JSON.parse(files.get('memory/foreshadows.json') ?? '{}')).toMatchObject({ schemaVersion: 2 })
  })
})
