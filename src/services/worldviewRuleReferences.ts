import { getChapterContent, listChapters, listProjectFiles, readProjectFile } from '../api/tauri'
import { loadSections } from './worldviewConfig'
import type { WorldviewRule } from './worldviewRules'

export type WorldviewRuleReferenceType = 'worldview' | 'character' | 'foreshadow' | 'chapter' | 'ai_record'
export interface WorldviewRuleReference { type: WorldviewRuleReferenceType; label: string; excerpt: string }

function excerptAround(content: string, term: string): string {
  const index = content.indexOf(term)
  const start = Math.max(0, index - 35)
  const end = Math.min(content.length, index + term.length + 70)
  return `${start > 0 ? '…' : ''}${content.slice(start, end).replace(/\s+/gu, ' ').trim()}${end < content.length ? '…' : ''}`
}

function reference(type: WorldviewRuleReferenceType, label: string, content: string, terms: string[]): WorldviewRuleReference | null {
  const term = terms.find((item) => content.includes(item))
  return term ? { type, label, excerpt: excerptAround(content, term) } : null
}

export async function findWorldviewRuleReferences(projectId: string, rule: WorldviewRule): Promise<WorldviewRuleReference[]> {
  const terms = [rule.name, ...rule.aliases].map((item) => item.trim()).filter(Boolean)
  if (terms.length === 0) return []
  const references: WorldviewRuleReference[] = []
  const sections = await loadSections(projectId).catch(() => null)
  for (const section of sections ?? []) {
    try {
      const found = reference('worldview', section.label, await readProjectFile(projectId, 'worldview', section.file), terms)
      if (found) references.push(found)
    } catch { /* optional source */ }
  }
  for (const file of await listProjectFiles(projectId, 'characters').catch(() => [])) {
    if (!file.name.endsWith('.md')) continue
    try {
      const found = reference('character', file.name.replace(/\.md$/iu, ''), await readProjectFile(projectId, 'characters', file.name), terms)
      if (found) references.push(found)
    } catch { /* optional source */ }
  }
  try {
    const found = reference('foreshadow', '伏笔记录', await readProjectFile(projectId, 'memory', 'foreshadows.json'), terms)
    if (found) references.push(found)
  } catch { /* optional source */ }
  for (const chapter of await listChapters(projectId).catch(() => [])) {
    try {
      const found = reference('chapter', `${chapter.volume} · ${chapter.title || chapter.id}`, await getChapterContent(projectId, chapter.volume, chapter.id), terms)
      if (found) references.push(found)
    } catch { /* optional source */ }
  }
  for (const file of await listProjectFiles(projectId, 'worldview/audits').catch(() => [])) {
    if (!file.name.endsWith('.json')) continue
    try {
      const found = reference('ai_record', file.name, await readProjectFile(projectId, 'worldview/audits', file.name), terms)
      if (found) references.push(found)
    } catch { /* optional source */ }
  }
  return references
}
