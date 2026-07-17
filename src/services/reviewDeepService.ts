import { writeProjectFile, readProjectFile, listProjectFiles, loadProviderConfig } from '../api/tauri'
import type { DeepCheckResult, DeepCheckDimension } from '../types/review'
import type { ReviewDimensionConfig } from './reviewRules'
import { getDefaultReviewRules } from './reviewRules'

const FULL_DIR = 'tracks/review-reports/full'

function extractJSON(text: string): string | null {
  const trimmed = text.trim()
  try {
    JSON.parse(trimmed)
    return trimmed
  } catch { /* try next */ }

  const blockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (blockMatch) {
    try {
      JSON.parse(blockMatch[1]!)
      return blockMatch[1]!
    } catch { /* try next */ }
  }

  const objMatch = trimmed.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      JSON.parse(objMatch[0])
      return objMatch[0]
    } catch { /* give up */ }
  }

  return null
}

/**
 * Run a full AI-powered deep review and save the report.
 * Called manually by the user.
 */
export async function runDeepReview(
  projectId: string,
  chapterId: string,
  chapterHtml: string,
  dimensions?: ReviewDimensionConfig[],
): Promise<DeepCheckResult> {
  const text = chapterHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

  // Load context data
  const [cognitionRaw, foreshadowRaw, timelineRaw, styleRaw] = await Promise.all([
    readProjectFile(projectId, 'memory', 'character-states.json').catch(() => ''),
    readProjectFile(projectId, 'memory', 'foreshadows.json').catch(() => ''),
    readProjectFile(projectId, 'memory', 'timeline.json').catch(() => ''),
    readProjectFile(projectId, '', 'style.md').catch(() => ''),
  ])

  // Load worldview data for setting_consistency checks.
  let worldviewText = ''
  try {
    const worldviewFiles = await listProjectFiles(projectId, 'worldview')
    const snippets: string[] = []
    for (const f of worldviewFiles.slice(0, 5)) {
      const content = await readProjectFile(projectId, 'worldview', f.name).catch(() => '')
      if (content) {
        const snippetText = content.replace(/^---[\s\S]*?---\n?/, '').replace(/<[^>]*>/g, '').trim()
        if (snippetText) snippets.push(`【${f.name.replace(/\.md$/i, '')}】\n${snippetText.slice(0, 800)}`)
      }
    }
    if (snippets.length > 0) worldviewText = '\n\n## 世界观设定\n' + snippets.join('\n\n')
  } catch { /* worldview not available */ }

  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) throw new Error('No AI provider configured')

  const dims = dimensions?.length ? dimensions : getDefaultReviewRules().reviewDimensions
  const dimListText = dims.map((d, i) => `${i + 1}. ${d.id} — ${d.description}`).join('\n')
  const dimJsonExample = dims.map((d) =>
    `    {\n      "name": "${d.id}",\n      "score": 0-10,\n      "issues": []\n    }`
  ).join(',\n')

  const systemPrompt = `你是一个小说一致性审查专家。分析以下章节内容，从${dims.length}个维度检查问题。

## 审查维度
${dimListText}

只输出JSON，不要解释。`

  const userPrompt = `## 当前章节正文
${text.slice(0, 4000)}

## 角色认知状态
${cognitionRaw.slice(0, 1000) || '（无数据）'}

## 未解伏笔
${foreshadowRaw.slice(0, 1000) || '（无数据）'}

## 时间线
${timelineRaw.slice(0, 500) || '（无数据）'}

## 文风设定
${styleRaw.slice(0, 500) || '（无数据）'}${worldviewText}

## 输出JSON格式
{
  "overall_score": 0-10,
  "dimensions": [
${dimJsonExample}
  ],
  "suggestions": ["建议1"]
}`

  const response = await fetch(`${provider.base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify({
      model: provider.models.review,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`Review API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = data.choices?.[0]?.message?.content ?? ''
  const jsonStr = extractJSON(raw)

  let result: DeepCheckResult
  if (!jsonStr) {
    result = {
      overall_score: 0,
      dimensions: [],
      suggestions: ['AI审查解析失败，请重试'],
      timestamp: new Date().toISOString(),
    }
  } else {
    try {
      const parsed = JSON.parse(jsonStr) as {
        overall_score?: number
        dimensions?: Array<{
          name: string
          score: number
          issues: Array<{
            severity: string
            desc: string
            location?: { line: number; offset: number } | null
            suggestion?: string
          }>
        }>
        suggestions?: string[]
      }
      result = {
        overall_score: typeof parsed.overall_score === 'number' ? parsed.overall_score : 0,
        dimensions: (parsed.dimensions ?? []).map((d): DeepCheckDimension => ({
          name: d.name as DeepCheckDimension['name'],
          score: typeof d.score === 'number' ? d.score : 0,
          issues: d.issues.map((issue) => ({
            severity: (issue.severity === 'error' || issue.severity === 'warning' || issue.severity === 'hint')
              ? issue.severity
              : 'hint',
            desc: issue.desc,
            location: issue.location ?? null,
            suggestion: issue.suggestion,
          })),
        })),
        suggestions: parsed.suggestions ?? [],
        timestamp: new Date().toISOString(),
      }
    } catch {
      result = {
        overall_score: 0,
        dimensions: [],
        suggestions: ['AI审查结果格式异常，请重试'],
        timestamp: new Date().toISOString(),
      }
    }
  }

  const filename = `${chapterId}_${Date.now()}.json`
  await writeProjectFile(projectId, FULL_DIR, filename, JSON.stringify(result, null, 2))

  return result
}
