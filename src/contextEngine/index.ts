import { getChapterOutline, getChapterContent, readProjectFile } from '../api/tauri'
import { DataSourceRegistry } from './dataSource'
import { cognitionDS, foreshadowDS, styleDS, recentSummaryDS, notesDS } from './sources'
import { estimateTokens, truncateToBudget, getDefaultSystemPrompt } from './budget'
import type { ContextLoadContext } from './dataSource'

export interface ContextPack {
  systemPrompt: string
  wordBudget: number
  sources: string[]
}

const MAX_PROMPT_TOKENS = 4096

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export async function buildContext(
  projectId: string,
  volume: string,
  chapterId: string,
  targetWords: number,
): Promise<ContextPack> {
  const chapterNumber = Number(chapterId.replace('ch', ''))
  const ctx: ContextLoadContext = { projectId, volume, chapterId, chapterNumber, targetWords }

  // 1. Load outline. If empty, fall back to project metadata
  const outline = await getChapterOutline(projectId, chapterId)
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
  if (chapterNumber > 1) {
    const prevId = `ch${String(chapterNumber - 1).padStart(3, '0')}`
    try {
      const prevContent = await getChapterContent(projectId, volume, prevId)
      const text = stripHtml(prevContent)
      previousEnding = text.slice(-500)
    } catch { /* no previous chapter */ }
  }

  // 2. Load context sources via DataSourceRegistry
  const registry = new DataSourceRegistry()
  registry.registerAll([recentSummaryDS, cognitionDS, foreshadowDS, notesDS, styleDS])
  const loaded = await registry.loadAll(ctx)
  const assembled = registry.assemble(loaded)

  // 3. Keep only the top outline/ending + as many sources as fit budget
  const promptBase = getDefaultSystemPrompt()
  let promptBudget = MAX_PROMPT_TOKENS - estimateTokens(promptBase)

  // Outline / project context gets 25% of budget
  const guideTokens = estimateTokens(chapterGuide)
  const guideActual = Math.min(guideTokens, Math.floor(promptBudget * 0.25))
  promptBudget -= guideActual

  // Previous ending gets 10%
  const endingTokens = estimateTokens(previousEnding)
  const endingActual = Math.min(endingTokens, Math.floor(promptBudget * 0.15))
  promptBudget -= endingActual

  // Remaining budget for sources (dropped lowest priority first)
  const fitted = truncateToBudget(assembled, Math.max(0, promptBudget))

  // 4. Assemble final prompt
  const sections: string[] = [promptBase]

  if (chapterGuide) {
    const label = outline ? '## 本章细纲' : '## 项目背景'
    sections.push('', label, chapterGuide)
  }
  if (previousEnding) sections.push('', '## 上一章结尾', previousEnding)

  for (const src of fitted) {
    sections.push('', `## ${src.name}`, src.content)
  }

  sections.push('', `## 字数要求`, `本章必须写满约 ${String(targetWords)} 字，请确保情节充分展开、描写细致到位，不要仓促收尾或省略细节。`)

  return {
    systemPrompt: sections.join('\n'),
    wordBudget: targetWords,
    sources: assembled.map((s) => s.name),
  }
}