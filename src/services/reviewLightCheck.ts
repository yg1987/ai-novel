import { listProjectFiles } from '../api/tauri'
import { checkBannedWords } from './bannedWords'
import type { LightCheckResult, ReviewIssue, LightCheckItem } from '../types/review'

const HTML_TAG_RE = /<[^>]*>/g

function stripHtml(html: string): string {
  return html.replace(HTML_TAG_RE, '').replace(/&nbsp;/g, ' ').trim()
}

/**
 * Extract all character names from character files.
 */
async function loadCharacterNames(projectId: string): Promise<string[]> {
  try {
    const files = await listProjectFiles(projectId, 'characters')
    const names: string[] = []
    for (const f of files) {
      // Character files are named after character names: "林尘.md" → "林尘"
      const name = f.name.replace(/\.md$/i, '')
      if (name) names.push(name)
    }
    return names
  } catch {
    return []
  }
}

/**
 * Lightweight deterministic checks that run on every save.
 * No AI calls, pure rule engine.
 */
export async function runLightCheck(
  projectId: string,
  chapterHtml: string,
): Promise<LightCheckResult> {
  const text = stripHtml(chapterHtml)

  // Check 1: Banned words
  const bannedResult = checkBannedWords(text)
  const bannedIssues: ReviewIssue[] = bannedResult.matches.map((m) => {
    const offset = text.indexOf(m.context)
    return {
      severity: m.severity >= 4 ? 'error' : m.severity >= 2 ? 'warning' : 'hint',
      desc: `禁用句式：${m.pattern}`,
      location: { line: m.line, offset: offset >= 0 ? offset : 0 },
      suggestion: m.suggestion,
      checkType: 'banned_words',
    }
  })

  // Check 2: Character name consistency
  const characterNames = await loadCharacterNames(projectId)
  const charIssues: ReviewIssue[] = []
  // No character name check issues by default — this is a "passive" check
  // that reports which characters appeared in this chapter
  const appearedChars = characterNames.filter((name) => text.includes(name))

  // Check 3: Basic text health
  const healthIssues: ReviewIssue[] = []
  if (text.length < 50) {
    healthIssues.push({
      severity: 'hint',
      desc: '章节内容较短（<50字符），建议继续写作',
      checkType: 'character_names',
    })
  }

  const checks: LightCheckItem[] = [
    {
      name: '禁用词检查',
      passed: bannedIssues.length === 0,
      issues: bannedIssues,
    },
    {
      name: '角色出场',
      passed: true,
      issues: charIssues,
      meta: { appearedCharacters: appearedChars },
    },
    {
      name: '内容健康度',
      passed: healthIssues.length === 0,
      issues: healthIssues,
    },
  ]

  return {
    passed: checks.every((c) => c.passed),
    checks,
    timestamp: new Date().toISOString(),
  }
}
