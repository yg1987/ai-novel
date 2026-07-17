import { readProjectFile, listProjectFiles, listChapters } from '../api/tauri'
import type { ChapterMeta } from '../types/chapter'
import type { LightCheckResult, DeepCheckResult, ReviewReportMeta } from '../types/review'

const LIGHT_DIR = 'tracks/review-reports/light'
const FULL_DIR = 'tracks/review-reports/full'

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
      timestamp: '',
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

/** Combined review data for a single chapter loaded from saved reports. */
export interface ChapterReviewData {
  chapterId: string
  chapterLabel: string
  lightCheck: LightCheckResult | null
  deepReviews: DeepCheckResult[]
  totalIssues: number
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

  const groups = new Map<string, ReviewReportMeta[]>()
  for (const r of allReports) {
    const list = groups.get(r.chapterId) ?? []
    list.push(r)
    groups.set(r.chapterId, list)
  }

  const results: ChapterReviewData[] = []
  for (const [chapterId, reports] of groups) {
    const lightMeta = reports.find((r) => r.type === 'light')
    const fullMetas = reports.filter((r) => r.type === 'full')

    let lightCheck: LightCheckResult | null = null
    const deepReviews: DeepCheckResult[] = []

    if (lightMeta) {
      try {
        const raw = await getReviewReport(projectId, 'light', lightMeta.filename)
        lightCheck = JSON.parse(raw) as LightCheckResult
      } catch { /* ignore corrupt files */ }
    }

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

  results.sort((a, b) => {
    const na = chapters.find(c => c.id === a.chapterId)?.order ?? 0
    const nb = chapters.find(c => c.id === b.chapterId)?.order ?? 0
    return na - nb
  })

  return results
}
