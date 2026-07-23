// src/services/aiContext.ts
// Build AI context with worldview reference — fallback chain: worldview → name+genre+description → name+genre
import { readProjectFile } from '../api/tauri'
import { buildWorldviewContext } from './worldviewContext'

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

  // 2. Read configured worldview Markdown in a stable, budgeted order (best effort)
  let worldviewText = ''
  try {
    worldviewText = await buildWorldviewContext(projectId)
  } catch { /* worldview directory or file may not exist */ }

  // 3. Assemble context with fallback chain
  const parts: string[] = []
  if (worldviewText) parts.push(`世界观设定：\n${worldviewText}`)
  if (name) parts.push(`小说名称：${name}`)
  if (genre) parts.push(`类型：${genre}`)
  if (description) parts.push(`简介：${description}`)

  return parts.join('\n')
}
