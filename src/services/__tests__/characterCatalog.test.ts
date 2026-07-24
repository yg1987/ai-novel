import { describe, expect, it } from 'vitest'
import type { CharacterRecord } from '../../types/character'
import { assertUniqueCharacterNames, isCharacterCatalog, resolveCharacterName, resolveCharacterReferenceAsAlias, syncCharacterCatalogRecord } from '../characterCatalog'
import { defaultCharacterModuleConfig } from '../characterConfig'

function record(id: string, name: string, aliases: string[] = []): CharacterRecord {
  return {
    id, name, aliases, fileName: `${name}.md`, identity: '', stanceId: 'neutral', statusId: 'active', gender: '未知', tags: [], affiliations: [], contentHash: '', projectionHash: '', createdAt: '', updatedAt: '',
  }
}

describe('characterCatalog name index', () => {
  it('requires global uniqueness across official names and aliases', () => {
    expect(() => assertUniqueCharacterNames([record('a', 'Alice'), record('b', '林烬', ['alice'])])).toThrow('冲突')
  })

  it('resolves old aliases through the same NFC/case-insensitive index', () => {
    expect(resolveCharacterName([record('a', '林烬', ['Old Name'])], 'old name')).toEqual({ characterId: 'a' })
    expect(resolveCharacterName([record('a', '林烬')], '未登记')).toEqual({ diagnostic: { value: '未登记', kind: 'unresolved' } })
  })

  it('repairs an old reference by assigning its alias to the selected character', () => {
    const records = [record('a', '林烬'), record('b', '顾寒', ['旧称'])]
    const repaired = resolveCharacterReferenceAsAlias(records, '旧称', 'a')

    expect(repaired[0]?.aliases).toEqual(['旧称'])
    expect(repaired[1]?.aliases).toEqual([])
    expect(resolveCharacterName(repaired, '旧称')).toEqual({ characterId: 'a' })
    expect(() => resolveCharacterReferenceAsAlias(records, '顾寒', 'a')).toThrow('正式名称')
  })

  it('keeps affiliation history when Markdown removes a current organization', async () => {
    const existing = record('a', '林烬')
    existing.affiliations = [{ organizationId: 'org-1', periods: [{ id: 'p1', role: '弟子', status: 'active', notes: '' }] }]
    const catalog = { schemaVersion: 1 as const, revision: 1, records: [existing], updatedAt: '' }
    const next = await syncCharacterCatalogRecord(catalog, '林烬.md', '角色：林烬\n所属组织：[]', defaultCharacterModuleConfig(), [{
      id: 'org-1', name: '玄天宗', aliases: [], kindId: 'sect', description: '', status: 'active', createdAt: '', updatedAt: '',
    }])
    expect(next.records[0]?.affiliations[0]?.periods[0]?.status).toBe('former')
    expect(catalog.records[0]?.affiliations[0]?.periods[0]?.status).toBe('active')
  })

  it('rejects malformed affiliation periods at the JSON boundary', () => {
    const invalid = record('a', '林烬')
    invalid.affiliations = [{ organizationId: 'org-1', periods: [{ id: 'p1', role: '', status: 'active', notes: '' }] }]
    const serialized = JSON.parse(JSON.stringify({ schemaVersion: 1, revision: 1, records: [invalid], updatedAt: '' })) as { records: Array<{ affiliations: Array<{ periods: Array<Record<string, unknown>> }> }> }
    serialized.records[0]!.affiliations[0]!.periods[0]!.status = 'invalid'
    expect(isCharacterCatalog(serialized)).toBe(false)
  })
})
