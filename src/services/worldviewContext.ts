import { listProjectFiles, readProjectFile } from '../api/tauri'
import { loadSections, type SectionDef } from './worldviewConfig'

const DEFAULT_TOKEN_BUDGET = 1_200
const TRUNCATION_MARKER = '\n[世界观内容已按预算截断]'

interface WorldviewContextEntry {
  label: string
  file: string
}

function estimateTokens(text: string): number {
  const cjkCount = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) ?? []).length
  const nonCjkCount = text.length - cjkCount
  return Math.ceil(cjkCount * 0.7 + nonCjkCount * 0.25)
}

function trimToTokenBudget(text: string, budget: number): string {
  if (estimateTokens(text) <= budget) return text
  if (budget <= 0) return ''

  const markerBudget = estimateTokens(TRUNCATION_MARKER)
  const contentBudget = Math.max(0, budget - markerBudget)
  let low = 0
  let high = text.length
  let best = 0

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (estimateTokens(text.slice(0, middle)) <= contentBudget) {
      best = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return `${text.slice(0, best).trimEnd()}${TRUNCATION_MARKER}`
}

function cleanContent(content: string): string {
  return content
    .replace(/^---[\s\S]*?---\n?/, '')
    .replace(/<[^>]*>/g, '')
    .trim()
}

function configuredEntries(sections: SectionDef[]): WorldviewContextEntry[] {
  return sections
    .filter((section) => section.file.endsWith('.md'))
    .map((section) => ({ label: section.label, file: section.file }))
}

async function loadEntries(projectId: string): Promise<WorldviewContextEntry[]> {
  const configured = await loadSections(projectId)
  if (configured && configured.length > 0) return configuredEntries(configured)

  const files = await listProjectFiles(projectId, 'worldview')
  return files
    .map((file) => file.name)
    .filter((name) => name.endsWith('.md'))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((file) => ({ label: file.replace(/\.md$/i, ''), file }))
}

/**
 * Loads configured worldview Markdown in a stable order for AI context.
 * Config, drafts, backups, and other non-Markdown project files are excluded.
 */
export async function buildWorldviewContext(
  projectId: string,
  tokenBudget = DEFAULT_TOKEN_BUDGET,
): Promise<string> {
  const entries = await loadEntries(projectId)
  const blocks: string[] = []
  let remaining = tokenBudget

  for (const entry of entries) {
    if (remaining <= 0) break
    const content = cleanContent(await readProjectFile(projectId, 'worldview', entry.file).catch(() => ''))
    if (!content) continue

    const block = `【${entry.label}】\n${content}`
    const fitted = trimToTokenBudget(block, remaining)
    if (!fitted) break
    blocks.push(fitted)
    remaining -= estimateTokens(fitted)
  }

  return blocks.join('\n\n')
}
