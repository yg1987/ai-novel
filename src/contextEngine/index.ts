import { getChapterOutline, getChapterContent, readProjectFile, listChapters } from '../api/tauri'
import { DataSourceRegistry } from './dataSource'
import { cognitionDS, foreshadowDS, styleDS, recentSummaryDS, notesDS, materialDS, worldviewDS } from './sources'
import { applyChapterPromptTemplate, estimateTokens, truncateToBudget, getDefaultSystemPrompt } from './budget'
import type { ContextLoadContext } from './dataSource'
import type { MaterialContextSelection } from '../types/material'

export interface ContextPack {
  systemPrompt: string
  wordBudget: number
  maxTokens: number
  sources: string[]
  outlineContent: string
  previousEnding: string
  materialSelections: MaterialContextSelection[]
}

const MAX_PROMPT_TOKENS = 4096
const MATERIAL_TOKEN_BUDGET = 800

function fitMaterials(selections: MaterialContextSelection[]): MaterialContextSelection[] {
  let remaining = MATERIAL_TOKEN_BUDGET
  const fitted: MaterialContextSelection[] = []
  for (const selection of selections) {
    if (remaining <= 0) break
    const label = `【${selection.title}】\n`
    const available = remaining - estimateTokens(label)
    if (available <= 0) break
    let excerpt = selection.excerpt
    if (estimateTokens(excerpt) > available) {
      let end = excerpt.length
      while (end > 0 && estimateTokens(excerpt.slice(0, end)) > available) end = Math.floor(end * 0.8)
      excerpt = `${excerpt.slice(0, end)}\n[素材摘录已按本章预算截断]`
    }
    fitted.push({ ...selection, excerpt })
    remaining -= estimateTokens(`${label}${excerpt}`)
  }
  return fitted
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export async function buildContext(
  projectId: string,
  volume: string,
  chapterId: string,
  targetWords: number,
  materialSelections: MaterialContextSelection[] = [],
  promptTemplate: string = getDefaultSystemPrompt(),
): Promise<ContextPack> {
  const chapters = await listChapters(projectId)
  const chapterNumber = chapters.find(c => c.id === chapterId)?.order ?? 0
  const fittedMaterials = fitMaterials(materialSelections)
  const ctx: ContextLoadContext = { projectId, volume, chapterId, chapterNumber, targetWords, materialSelections: fittedMaterials }

  // 1. Load outline. If empty, fall back to project metadata
  const outline = await getChapterOutline(projectId, volume, chapterId)
  let chapterGuide = outline
  if (!chapterGuide) {
    try {
      const raw = await readProjectFile(projectId, '', 'project.json')
      const meta = JSON.parse(raw) as { name?: string; genre?: string; description?: string }
      const lines: string[] = []
      if (meta.name) lines.push(`小说名称：${meta.name}`)
      if (meta.genre) lines.push(`类型：${meta.genre}`)
      if (meta.description) lines.push(`简介：${meta.description}`)
      chapterGuide = lines.join('\n')
    } catch { chapterGuide = '' }
  }

  let previousEnding = ''
  const prevId = chapters.find(c => c.order === chapterNumber - 1)?.id
  if (prevId) {
    try {
      const prevContent = await getChapterContent(projectId, volume, prevId)
      const text = stripHtml(prevContent)
      previousEnding = text.slice(-500)
    } catch { /* no previous chapter */ }
  }

  // 2. Load context sources via DataSourceRegistry
  const registry = new DataSourceRegistry()
  registry.registerAll([worldviewDS, recentSummaryDS, cognitionDS, foreshadowDS, materialDS, notesDS, styleDS])
  const loaded = await registry.loadAll(ctx)
  const assembled = registry.assemble(loaded)

  // 3. Render the selected prompt before allocating the remaining context.
  // This makes the editable default exactly the prompt used at runtime.
  const promptBase = applyChapterPromptTemplate(promptTemplate, chapterGuide, targetWords, previousEnding)
  const promptBudget = Math.max(0, MAX_PROMPT_TOKENS - estimateTokens(promptBase))

  // Remaining budget for sources (dropped lowest priority first)
  const fitted = truncateToBudget(assembled, Math.max(0, promptBudget))

  // 4. Assemble final prompt
  const sections: string[] = [promptBase]

  for (const src of fitted) {
    sections.push('', `## ${src.name}`, src.content)
  }

  return {
    systemPrompt: sections.join('\n'),
    wordBudget: targetWords,
    maxTokens: Math.ceil(targetWords * 1.5),
    sources: fitted.map((s) => s.name),
    outlineContent: chapterGuide,
    previousEnding,
    materialSelections: fittedMaterials,
  }
}
