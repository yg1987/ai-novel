import { getChapterOutline, getChapterContent } from '../api/tauri'
import { DataSourceRegistry } from './dataSource'
import { cognitionDS, foreshadowDS, styleDS, recentSummaryDS } from './sources'
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
  chapterId: string,
  targetWords: number,
): Promise<ContextPack> {
  const chapterNumber = Number(chapterId.replace('ch', ''))
  const ctx: ContextLoadContext = { projectId, chapterId, chapterNumber, targetWords }

  // 1. Load outline + previous ending (direct, these are always needed)
  const outline = await getChapterOutline(projectId, chapterId)

  let previousEnding = ''
  if (chapterNumber > 1) {
    const prevId = `ch${String(chapterNumber - 1).padStart(3, '0')}`
    try {
      const prevContent = await getChapterContent(projectId, prevId)
      const text = stripHtml(prevContent)
      previousEnding = text.slice(-500)
    } catch { /* no previous chapter */ }
  }

  // 2. Load context sources via DataSourceRegistry
  const registry = new DataSourceRegistry()
  registry.registerAll([recentSummaryDS, cognitionDS, foreshadowDS, styleDS])
  const loaded = await registry.loadAll(ctx)
  const assembled = registry.assemble(loaded)

  // 3. Keep only the top outline/ending + as many sources as fit budget
  const promptBase = getDefaultSystemPrompt()
  let promptBudget = MAX_PROMPT_TOKENS - estimateTokens(promptBase)

  // Outline gets 25% of budget
  const outlineTokens = estimateTokens(outline)
  const outlineActual = Math.min(outlineTokens, Math.floor(promptBudget * 0.25))
  promptBudget -= outlineActual

  // Previous ending gets 10%
  const endingTokens = estimateTokens(previousEnding)
  const endingActual = Math.min(endingTokens, Math.floor(promptBudget * 0.15))
  promptBudget -= endingActual

  // Remaining budget for sources (dropped lowest priority first)
  const fitted = truncateToBudget(assembled, Math.max(0, promptBudget))

  // 4. Assemble final prompt
  const sections: string[] = [promptBase]

  if (outline) sections.push('', '## 本章细纲', outline)
  if (previousEnding) sections.push('', '## 上一章结尾', previousEnding)

  for (const src of fitted) {
    sections.push('', `## ${src.name}`, src.content)
  }

  sections.push('', `## 字数要求`, `本章目标字数约 ${String(targetWords)} 字`)

  return {
    systemPrompt: sections.join('\n'),
    wordBudget: targetWords,
    sources: assembled.map((s) => s.name),
  }
}