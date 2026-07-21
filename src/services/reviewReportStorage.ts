import { deleteProjectFile, listProjectFiles, readProjectFile, listChapters, writeProjectFile } from '../api/tauri'
import type { ChapterKey, ChapterRef } from '../types/chapter'
import type { LightCheckResult, DeepCheckResult, ReviewReportMeta } from '../types/review'
import { chapterRefKey, compareChapters, loadChapterDisplayMetadata } from './chapterDisplay'

const LIGHT_DIR = 'tracks/review-reports/light'
const FULL_DIR = 'tracks/review-reports/full'

export function reviewReportStem(ref: ChapterRef): string {
  return `${encodeURIComponent(ref.volume)}--${encodeURIComponent(ref.chapterId)}`
}

function parseReportStem(stem: string): ChapterRef | null {
  const [encodedVolume, encodedChapterId] = stem.split('--')
  if (!encodedVolume || !encodedChapterId) return null
  try {
    const volume = decodeURIComponent(encodedVolume)
    const chapterId = decodeURIComponent(encodedChapterId)
    return /^卷\d+$/.test(volume) && /^ch\d+$/i.test(chapterId) ? { volume, chapterId } : null
  } catch {
    return null
  }
}

export async function listReviewReports(projectId: string): Promise<ReviewReportMeta[]> {
  const [lightFiles, fullFiles] = await Promise.all([
    listProjectFiles(projectId, LIGHT_DIR).catch(() => []),
    listProjectFiles(projectId, FULL_DIR).catch(() => []),
  ])
  const reports: ReviewReportMeta[] = []
  for (const file of lightFiles) {
    if (!file.name.endsWith('.json')) continue
    const ref = parseReportStem(file.name.replace(/\.json$/, ''))
    if (ref) reports.push({ filename: file.name, type: 'light', timestamp: '', ...ref })
  }
  for (const file of fullFiles) {
    if (!file.name.endsWith('.json')) continue
    const ref = parseReportStem(file.name.replace(/\.json$/, '').split('__')[0] ?? '')
    if (ref) reports.push({ filename: file.name, type: 'full', timestamp: '', ...ref })
  }
  return reports
}

export async function getReviewReport(projectId: string, type: 'light' | 'full', filename: string): Promise<string> {
  return readProjectFile(projectId, type === 'light' ? LIGHT_DIR : FULL_DIR, filename)
}

export interface ChapterReviewData {
  ref: ChapterRef
  key: ChapterKey
  volumeLabel: string
  chapterOrder: number
  chapterLabel: string
  lightCheck: LightCheckResult | null
  deepReviews: DeepCheckResult[]
  totalIssues: number
  lastReviewedAt: string | null
  hasReports: boolean
}

function issueCount(light: LightCheckResult | null, deep: DeepCheckResult | null): number {
  return (light?.checks.reduce((sum, check) => sum + check.issues.length, 0) ?? 0)
    + (deep?.dimensions.reduce((sum, dimension) => sum + dimension.issues.length, 0) ?? 0)
}

export async function loadChapterReviews(projectId: string): Promise<ChapterReviewData[]> {
  const [chapters, reports, metadata] = await Promise.all([
    listChapters(projectId),
    listReviewReports(projectId),
    loadChapterDisplayMetadata(projectId),
  ])
  const grouped = new Map<ChapterKey, ReviewReportMeta[]>()
  for (const report of reports) {
    const key = chapterRefKey(report)
    grouped.set(key, [...(grouped.get(key) ?? []), report])
  }
  return [...chapters].sort(compareChapters).map((chapter) => {
    const ref = { volume: chapter.volume, chapterId: chapter.id }
    const key = chapterRefKey(ref)
    const chapterReports = grouped.get(key) ?? []
    const title = metadata.chapterTitles[key] || chapter.title
    const volumeLabel = metadata.volumeNames[chapter.volume] ? `${chapter.volume} · ${metadata.volumeNames[chapter.volume]}` : chapter.volume
    const chapterLabel = title && title !== `第${chapter.order}章` ? `第${chapter.order}章 · ${title}` : `第${chapter.order}章`
    return {
      ref,
      key,
      volumeLabel,
      chapterOrder: chapter.order,
      chapterLabel,
      lightCheck: null,
      deepReviews: [],
      totalIssues: 0,
      lastReviewedAt: null,
      hasReports: chapterReports.length > 0,
    }
  })
}

export async function loadChapterReviewDetails(projectId: string, chapter: ChapterReviewData): Promise<ChapterReviewData> {
  const reports = (await listReviewReports(projectId)).filter((report) => chapterRefKey(report) === chapter.key)
  const lightMeta = reports.find((report) => report.type === 'light')
  const latestFull = reports.filter((report) => report.type === 'full').sort((left, right) => right.filename.localeCompare(left.filename))[0]
  const [light, deep] = await Promise.all([
    lightMeta ? getReviewReport(projectId, 'light', lightMeta.filename).then((raw) => JSON.parse(raw) as LightCheckResult).catch(() => null) : Promise.resolve(null),
    latestFull ? getReviewReport(projectId, 'full', latestFull.filename).then((raw) => JSON.parse(raw) as DeepCheckResult).catch(() => null) : Promise.resolve(null),
  ])
  return { ...chapter, lightCheck: light, deepReviews: deep ? [deep] : [], totalIssues: issueCount(light, deep), lastReviewedAt: deep?.timestamp ?? light?.timestamp ?? null }
}

export async function archiveChapterReviews(projectId: string, ref: ChapterRef): Promise<void> {
  const stem = reviewReportStem(ref)
  const [lightFiles, fullFiles] = await Promise.all([
    listProjectFiles(projectId, LIGHT_DIR).catch(() => []),
    listProjectFiles(projectId, FULL_DIR).catch(() => []),
  ])
  const archiveId = new Date().toISOString().replace(/[:.]/g, '-')
  const targets = [
    ...lightFiles.filter((file) => file.name === `${stem}.json`).map((file) => ({ type: 'light' as const, filename: file.name })),
    ...fullFiles.filter((file) => file.name.startsWith(`${stem}__`) && file.name.endsWith('.json')).map((file) => ({ type: 'full' as const, filename: file.name })),
  ]
  await Promise.all(targets.map(async (target) => {
    const sourceDir = target.type === 'light' ? LIGHT_DIR : FULL_DIR
    const content = await readProjectFile(projectId, sourceDir, target.filename)
    await writeProjectFile(projectId, `tracks/review-reports/archive/${archiveId}/${target.type}`, target.filename, content)
    await deleteProjectFile(projectId, sourceDir, target.filename)
  }))
}
