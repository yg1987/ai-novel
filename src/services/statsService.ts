import { computeProjectStats, computeChapterWordCounts, listProjectFiles, listResourceCategories, listResourceFiles, listChapters } from '../api/tauri'
import type { ProjectStats, ChapterWordCount, DailyStats } from '../api/tauri'
import { loadForeshadows } from './foreshadowStorage'
import { loadAllNotes } from './notesStorage'
import { calcForeshadowHealth, calcForeshadowDensity, getHealthLabel } from './foreshadowHealth'
import type { ChapterMeta } from '../types/chapter'
import { DEFAULT_FORESHADOW_CONFIG } from '../types/novel'
import { loadChapterReviews } from './reviewReportStorage'

/**
 * Pure-function wrapper around stats Tauri commands.
 * Every function is independently callable; no shared state between calls.
 */

export async function getProjectStats(
  projectId: string,
  days: number,
): Promise<ProjectStats> {
  return computeProjectStats(projectId, days)
}

export async function getChapterWordCounts(
  projectId: string,
): Promise<ChapterWordCount[]> {
  return computeChapterWordCounts(projectId)
}

/** Compute writing streak: consecutive days with non-zero word count. */
export function computeStreak(dailyStats: DailyStats[]): number {
  const sorted = [...dailyStats].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  let streak = 0
  for (const d of sorted) {
    if (d.word_count > 0) {
      streak++
    } else {
      break
    }
  }
  return streak
}

/** Best single-day word count from daily stats. */
export function findBestDay(dailyStats: DailyStats[]): { date: string; words: number } | null {
  let best: { date: string; words: number } | null = null
  for (const d of dailyStats) {
    if (!best || d.word_count > best.words) {
      best = { date: d.date, words: d.word_count }
    }
  }
  return best
}

/** Format number to locale string. */
export function fmt(n: number): string {
  return n.toLocaleString()
}

/** Format milliseconds to human-readable (e.g. "48m 30s"). */
export function fmtDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

// ─── Phase C: Project scale ───────────────────────────

export interface ProjectScale {
  characters: number
  outline: number
  notes: number
  resources: number
}

export async function getProjectScale(projectId: string): Promise<ProjectScale> {
  const [charFiles, outlineFiles, subOutlineFiles, allNotes, categories] = await Promise.all([
    listProjectFiles(projectId, 'characters').catch(() => []),
    listProjectFiles(projectId, 'outline').catch(() => []),
    listProjectFiles(projectId, 'outline/细纲').catch(() => []),
    loadAllNotes(projectId).catch(() => []),
    listResourceCategories().catch(() => []),
  ])

  // Count only .md files for characters/worldview (skip order.json etc.)
  const countMd = (files: { name: string }[]) =>
    files.filter((f) => f.name.endsWith('.md')).length

  // Count all resource files across categories
  const resourceCounts = await Promise.all(
    categories.map((cat) =>
      listResourceFiles(cat).then((files) => files.length).catch(() => 0),
    ),
  )
  const resources = resourceCounts.reduce((a, b) => a + b, 0)

  return {
    characters: countMd(charFiles),
    outline: countMd(outlineFiles) + countMd(subOutlineFiles),
    notes: allNotes.length,
    resources,
  }
}

// ─── Phase C: Health metrics ──────────────────────────

export interface ForeshadowHealthMetrics {
  total: number
  resolved: number
  active: number
  healthScore: number
  healthLabel: string
  density: number
  unresolved: number
  totalChapters: number
}

export interface ReviewScoreSummary {
  chaptersWithReviews: number
  totalIssues: number
}

export async function getForeshadowHealthMetrics(
  projectId: string,
): Promise<ForeshadowHealthMetrics> {
  const [store, chapters] = await Promise.all([
    loadForeshadows(projectId).catch(() => ({ entries: [], updatedAt: '' })),
    listChapters(projectId).catch(() => [] as ChapterMeta[]),
  ])

  const entries = store.entries
  const total = entries.length
  const resolved = entries.filter((e) => e.status === 'resolved').length
  const active = entries.filter((e) => e.status === 'planted' || e.status === 'advanced').length

  // Use last chapter as current for health computation
  const lastChapter = chapters.length > 0 ? chapters[chapters.length - 1]!.id : null

  const healthScore = calcForeshadowHealth(entries, lastChapter, chapters, DEFAULT_FORESHADOW_CONFIG)
  const healthLabel = getHealthLabel(healthScore)
  const { density, unresolved, totalChapters } = calcForeshadowDensity(entries, lastChapter, chapters)

  return { total, resolved, active, healthScore, healthLabel, density, unresolved, totalChapters }
}

export async function getReviewSummary(projectId: string): Promise<ReviewScoreSummary> {
  try {
    const reviews = await loadChapterReviews(projectId)
    const chaptersWithReviews = reviews.filter((r) => r.lightCheck || r.deepReviews.length > 0).length
    const totalIssues = reviews.reduce((s, r) => s + r.totalIssues, 0)
    return { chaptersWithReviews, totalIssues }
  } catch {
    return { chaptersWithReviews: 0, totalIssues: 0 }
  }
}
