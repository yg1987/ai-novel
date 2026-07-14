import { writeProjectFile, readProjectFile, listProjectFiles, loadProviderConfig, listChapters } from '../api/tauri'
import { runLightCheck } from './reviewLightCheck'
import type { LightCheckResult, DeepCheckResult, ReviewReportMeta, DeepCheckDimension } from '../types/review'
import type { ReviewDimensionConfig } from './reviewRules'
import { getDefaultReviewRules } from './reviewRules'
import type { ChapterMeta } from '../types/chapter'

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

  // Load worldview data for setting_consistency checks (设计文档 §4.3)
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

  // Multi-layer JSON extraction (设计文档 §4.3)
  const extractJSON = (text: string): string | null => {
    const trimmed = text.trim()
    // 1. Direct parse
    try { JSON.parse(trimmed); return trimmed } catch { /* try next */ }
    // 2. ```json ... ``` block
    const blockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    if (blockMatch) {
      try { JSON.parse(blockMatch[1]!); return blockMatch[1]! } catch { /* try next */ }
    }
    // 3. { ... } object
    const objMatch = trimmed.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { JSON.parse(objMatch[0]); return objMatch[0] } catch { /* give up */ }
    }
    return null
  }

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

// ─── Chapter-review aggregate ──────────────────

/** Combined review data for a single chapter (loaded from saved reports). */
export interface ChapterReviewData {
  chapterId: string
  /** Readable label, e.g. "第1章" */
  chapterLabel: string
  /** Most recent light-check result (banned words / character presence / health) */
  lightCheck: LightCheckResult | null
  /** Deep-review runs for this chapter (most recent first) */
  deepReviews: DeepCheckResult[]
  /** Total issue count across light + deep reviews */
  totalIssues: number
  /** ISO timestamp of the most recent review */
  lastReviewedAt: string | null
}

function chapterIdToLabel(chapterId: string, chapters: ChapterMeta[]): string {
  return chapters.find(c => c.id === chapterId)?.title ?? chapterId
}

function countIssues(light: LightCheckResult | null, deeps: DeepCheckResult[]): number {
  let n = 0
  if (light) n += light.checks.reduce((sum, c) => sum + c.issues.length, 0)
  for (const d of deeps) {
    n += d.dimensions.reduce((sum, dim) => sum + dim.issues.length, 0)
  }
  return n
}

function latestTimestamp(light: LightCheckResult | null, deeps: DeepCheckResult[]): string | null {
  let latest = light?.timestamp ?? null
  for (const d of deeps) {
    if (!latest || d.timestamp > latest) latest = d.timestamp
  }
  return latest
}

/**
 * Load and group all review data by chapter.
 * Returns chapters sorted by chapter number, each with combined review data.
 */
export async function loadChapterReviews(
  projectId: string,
): Promise<ChapterReviewData[]> {
  const allReports = await listReviewReports(projectId)
  const chapters = await listChapters(projectId)

  // Group reports by chapter
  const groups = new Map<string, ReviewReportMeta[]>()
  for (const r of allReports) {
    const list = groups.get(r.chapterId) ?? []
    list.push(r)
    groups.set(r.chapterId, list)
  }

  // Load and parse content for each chapter
  const results: ChapterReviewData[] = []
  for (const [chapterId, reports] of groups) {
    const lightMeta = reports.find((r) => r.type === 'light')
    const fullMetas = reports.filter((r) => r.type === 'full')

    let lightCheck: LightCheckResult | null = null
    const deepReviews: DeepCheckResult[] = []

    // Load light check
    if (lightMeta) {
      try {
        const raw = await getReviewReport(projectId, 'light', lightMeta.filename)
        lightCheck = JSON.parse(raw) as LightCheckResult
      } catch { /* ignore corrupt files */ }
    }

    // Load deep reviews (most recent first by filename sort)
    fullMetas.sort((a, b) => b.filename.localeCompare(a.filename))
    for (const meta of fullMetas) {
      try {
        const raw = await getReviewReport(projectId, 'full', meta.filename)
        deepReviews.push(JSON.parse(raw) as DeepCheckResult)
      } catch { /* ignore corrupt files */ }
    }

    results.push({
      chapterId,
      chapterLabel: chapterIdToLabel(chapterId, chapters),
      lightCheck,
      deepReviews,
      totalIssues: countIssues(lightCheck, deepReviews),
      lastReviewedAt: latestTimestamp(lightCheck, deepReviews),
    })
  }

  // Sort by chapter order ascending
  results.sort((a, b) => {
    const na = chapters.find(c => c.id === a.chapterId)?.order ?? 0
    const nb = chapters.find(c => c.id === b.chapterId)?.order ?? 0
    return na - nb
  })

  return results
}
