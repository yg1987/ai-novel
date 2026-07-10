// src/services/aiContext.ts
// Build AI context with worldview reference — fallback chain: worldview → name+genre+description → name+genre
import { readProjectFile, listProjectFiles } from '../api/tauri'

export async function buildAIContext(projectId: string): Promise<string> {
  // 1. Read project metadata
  let name = ''
  let genre = ''
  let description = ''
  try {
    const metaRaw = await readProjectFile(projectId, '', 'project.json')
    const meta = JSON.parse(metaRaw) as { name?: string; genre?: string; description?: string }
    name = meta.name ?? ''
    genre = meta.genre ?? ''
    description = meta.description ?? ''
  } catch { /* ignore */ }

  // 2. Read worldview entries (best effort)
  let worldviewText = ''
  try {
    const worldviewFiles = await listProjectFiles(projectId, 'worldview')
    const snippets: string[] = []
    for (const f of worldviewFiles.slice(0, 5)) {
      const content = await readProjectFile(projectId, 'worldview', f.name).catch(() => '')
      if (content) {
        const text = content.replace(/^---[\s\S]*?---\n?/, '').replace(/<[^>]*>/g, '').trim()
        if (text) snippets.push(`【${f.name.replace(/\.md$/i, '')}】\n${text.slice(0, 800)}`)
      }
    }
    if (snippets.length > 0) worldviewText = snippets.join('\n\n')
  } catch { /* worldview directory or file may not exist */ }

  // 3. Assemble context with fallback chain
  const parts: string[] = []
  if (worldviewText) parts.push(`世界观设定：\n${worldviewText}`)
  if (name) parts.push(`小说名称：${name}`)
  if (genre) parts.push(`类型：${genre}`)
  if (description) parts.push(`简介：${description}`)

  return parts.join('\n')
}
