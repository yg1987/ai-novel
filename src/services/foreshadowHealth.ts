// src/services/foreshadowHealth.ts
// Health scoring, density analysis, and labeling for the foreshadowing system
import type { ForeshadowEntry, ForeshadowConfig } from '../types/novel'
import type { ChapterMeta, ChapterRef } from '../types/chapter'
import { classifyForeshadows } from './foreshadowContext'
import { buildChapterSequence } from './chapterCatalog'
import { chapterRefKey } from './chapterDisplay'

// ─── Helpers ───────────────────────────────

function getChapterPosition(ref: ChapterRef, chapters: ChapterMeta[]): number {
  return buildChapterSequence(chapters).positionByKey.get(chapterRefKey(ref)) ?? 0
}

// ─── Health Score ──────────────────────────

export function calcForeshadowHealth(
  entries: ForeshadowEntry[],
  currentChapter: ChapterRef | null,
  chapters: ChapterMeta[],
  config: ForeshadowConfig,
): number {
  // No chapter context or no unresolved entries → perfect score
  const unresolved = entries.filter(
    (e) => e.status !== 'resolved' && e.status !== 'abandoned',
  )
  if (!currentChapter || unresolved.length === 0) return 100

  const classified = classifyForeshadows(entries, currentChapter, chapters, config)

  // Base score: critical entries are expensive, background entries mild
  let score = 100 - classified.critical.length * 10 - classified.background.length * 3

  // Density penalty
  const currentOrder = getChapterPosition(currentChapter, chapters)
  const density = unresolved.length / Math.max(1, currentOrder)
  if (density > config.densityWarningThreshold) {
    score -= Math.round((density - config.densityWarningThreshold) * 100)
  }

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, score))
}

// ─── Health Label ──────────────────────────

export function getHealthLabel(score: number): string {
  if (score >= 90) return '优秀'
  if (score >= 70) return '良好'
  if (score >= 50) return '一般'
  return '欠佳'
}

// ─── Density Analysis ──────────────────────

export function calcForeshadowDensity(
  entries: ForeshadowEntry[],
  currentChapter: ChapterRef | null,
  chapters: ChapterMeta[],
): { density: number; unresolved: number; totalChapters: number } {
  const unresolved = entries.filter(
    (e) => e.status !== 'resolved' && e.status !== 'abandoned',
  )

  if (!currentChapter || unresolved.length === 0) {
    return { density: 0, unresolved: unresolved.length, totalChapters: chapters.length }
  }

  const currentOrder = getChapterPosition(currentChapter, chapters)
  const density = unresolved.length / Math.max(1, currentOrder)

  return {
    density: Math.round(density * 1000) / 1000,
    unresolved: unresolved.length,
    totalChapters: currentOrder,
  }
}
