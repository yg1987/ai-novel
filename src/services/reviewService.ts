import { writeProjectFile, readProjectFile, listProjectFiles, loadProviderConfig } from '../api/tauri'
import { runLightCheck } from './reviewLightCheck'
import type { LightCheckResult, DeepCheckResult, ReviewReportMeta, DeepCheckDimension } from '../types/review'

const LIGHT_DIR = 'tracks/review-reports/light'
const FULL_DIR = 'tracks/review-reports/full'

/**
 * Run a light check and save the report.
 * Called automatically on chapter save.
 */
export async function runAndSaveLightCheck(
  projectId: string,
  chapterId: string,
  chapterHtml: string,
): Promise<LightCheckResult> {
  const result = await runLightCheck(projectId, chapterHtml)
  const filename = `${chapterId}.json`
  await writeProjectFile(projectId, LIGHT_DIR, filename, JSON.stringify(result, null, 2))
  return result
}

/**
 * Run a full AI-powered deep review and save the report.
 * Called manually by the user.
 */
export async function runDeepReview(
  projectId: string,
  chapterId: string,
  chapterHtml: string,
): Promise<DeepCheckResult> {
  const text = chapterHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

  // Load context data
  const [cognitionRaw, foreshadowRaw, timelineRaw, styleRaw] = await Promise.all([
    readProjectFile(projectId, 'memory', 'character-states.json').catch(() => ''),
    readProjectFile(projectId, 'memory', 'foreshadows.json').catch(() => ''),
    readProjectFile(projectId, 'memory', 'timeline.json').catch(() => ''),
    readProjectFile(projectId, '', 'style.md').catch(() => ''),
  ])

  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) throw new Error('No AI provider configured')

  const systemPrompt = `你是一个小说一致性审查专家。分析以下章节内容，从4个维度检查问题。

## 审查维度
1. timeline — 时间顺序是否矛盾、跳跃是否合理
2. character_cognition — 角色是否知道不应知道的信息
3. foreshadow_health — 未解伏笔是否过久未回收
4. setting_consistency — 世界观规则是否被违反

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
${styleRaw.slice(0, 500) || '（无数据）'}

## 输出JSON格式
{
  "overall_score": 0-10,
  "dimensions": [
    {
      "name": "timeline",
      "score": 0-10,
      "issues": [
        { "severity": "error|warning|hint", "desc": "问题描述", "location": null }
      ]
    }
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
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch?.[0] ?? raw

  let result: DeepCheckResult
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
      suggestions: ['AI审查解析失败，请重试'],
      timestamp: new Date().toISOString(),
    }
  }

  // Save report
  const filename = `${chapterId}_${Date.now()}.json`
  await writeProjectFile(projectId, FULL_DIR, filename, JSON.stringify(result, null, 2))

  return result
}

/**
 * List all review reports for a project.
 */
export async function listReviewReports(
  projectId: string,
): Promise<ReviewReportMeta[]> {
  const [lightFiles, fullFiles] = await Promise.all([
    listProjectFiles(projectId, LIGHT_DIR).catch(() => []),
    listProjectFiles(projectId, FULL_DIR).catch(() => []),
  ])

  const reports: ReviewReportMeta[] = []

  for (const f of lightFiles) {
    if (!f.name.endsWith('.json')) continue
    const chapterId = f.name.replace('.json', '')
    reports.push({
      filename: f.name,
      type: 'light',
      timestamp: '', // could parse from file content
      chapterId,
    })
  }

  for (const f of fullFiles) {
    if (!f.name.endsWith('.json')) continue
    const chapterId = f.name.split('_')[0] ?? ''
    reports.push({
      filename: f.name,
      type: 'full',
      timestamp: '',
      chapterId,
    })
  }

  return reports
}

/**
 * Load a specific review report.
 */
export async function getReviewReport(
  projectId: string,
  type: 'light' | 'full',
  filename: string,
): Promise<string> {
  const dir = type === 'light' ? LIGHT_DIR : FULL_DIR
  return readProjectFile(projectId, dir, filename)
}
