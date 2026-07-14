// src/services/foreshadowContext.ts
// Four-level urgency classification for AI context injection
import type { ForeshadowEntry, ForeshadowConfig } from '../types/novel'
import type { ChapterMeta } from '../types/chapter'

export type ForeshadowUrgency = 'critical' | 'upcoming' | 'active' | 'background'

// ─── Helpers ───────────────────────────────

function getChapterOrder(chapterId: string, chapters: ChapterMeta[]): number {
  return chapters.find((c) => c.id === chapterId)?.order ?? 0
}

function getLatestClueOrder(entry: ForeshadowEntry, chapters: ChapterMeta[]): number {
  if (entry.clues.length === 0) return 0
  const sorted = [...entry.clues].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
  return getChapterOrder(sorted[0]!.chapterId, chapters)
}

// ─── Classification ────────────────────────

export function classifyForeshadows(
  entries: ForeshadowEntry[],
  currentChapterId: string | null,
  chapters: ChapterMeta[],
  config: ForeshadowConfig,
): Record<ForeshadowUrgency, ForeshadowEntry[]> {
  const result: Record<ForeshadowUrgency, ForeshadowEntry[]> = {
    critical: [],
    upcoming: [],
    active: [],
    background: [],
  }

  // Only classify unresolved entries
  const unresolved = entries.filter(
    (e) => e.status !== 'resolved' && e.status !== 'abandoned',
  )

  // If no current chapter, everything is background
  if (!currentChapterId) {
    result.background = unresolved
    return result
  }

  const currentOrder = getChapterOrder(currentChapterId, chapters)

  for (const entry of unresolved) {
    // Rule 1: Critical — target chapter has passed or is current
    if (entry.targetChapterId) {
      const targetOrder = getChapterOrder(entry.targetChapterId, chapters)
      if (targetOrder > 0 && targetOrder <= currentOrder) {
        result.critical.push(entry)
        continue
      }
      // Rule 2: Upcoming — target is within upcomingWindow
      const diff = targetOrder - currentOrder
      if (targetOrder > 0 && diff > 0 && diff <= config.upcomingWindow) {
        result.upcoming.push(entry)
        continue
      }
    }

    // Rule 3: Active — recently advanced (clue within dormantThreshold)
    if (entry.status === 'advanced' && entry.clues.length > 0) {
      const latestClueOrder = getLatestClueOrder(entry, chapters)
      if (latestClueOrder > 0 && (currentOrder - latestClueOrder) <= config.dormantThreshold) {
        result.active.push(entry)
        continue
      }
    }

    // Rule 4: Background — everything else
    result.background.push(entry)
  }

  return result
}

// ─── Text Formatting ───────────────────────

function formatEntryLine(entry: ForeshadowEntry, chapters: ChapterMeta[]): string {
  const plantedLabel = chapters.find((c) => c.id === entry.plantedChapterId)?.title
    ?? entry.plantedChapterId
  const statusLabel = entry.status === 'advanced' ? '推进中' : '已埋设'
  return `- [${statusLabel}] **${entry.name}**：${entry.description}（${plantedLabel}埋设）`
}

function formatCriticalLine(entry: ForeshadowEntry, chapters: ChapterMeta[], currentOrder: number): string {
  const base = formatEntryLine(entry, chapters)
  if (entry.targetChapterId) {
    const targetOrder = getChapterOrder(entry.targetChapterId, chapters)
    if (targetOrder > 0) {
      const overdue = currentOrder - targetOrder
      if (overdue > 0) {
        return `${base}\n  ⚠️ 已超期${overdue}章，尽快回收`
      }
      return `${base}\n  计划本章回收${entry.resolutionPlan ? ` → ${entry.resolutionPlan}` : ''}`
    }
  }
  return base
}

function formatUpcomingLine(entry: ForeshadowEntry, chapters: ChapterMeta[], currentOrder: number): string {
  const base = formatEntryLine(entry, chapters)
  if (entry.targetChapterId) {
    const targetOrder = getChapterOrder(entry.targetChapterId, chapters)
    if (targetOrder > 0) {
      const remaining = targetOrder - currentOrder
      return `${base}\n  距计划回收还有${remaining}章`
    }
  }
  return base
}

function formatActiveLine(entry: ForeshadowEntry): string {
  const clueCount = entry.clues.length
  return `- [推进中] **${entry.name}**：${entry.description}（已推进${clueCount}次）`
}

export function classifiedForeshadowsToText(
  classified: Record<ForeshadowUrgency, ForeshadowEntry[]>,
  chapters: ChapterMeta[],
  currentChapterId: string | null,
  currentChars?: string[],
): string {
  const sections: string[] = []
  const currentOrder = currentChapterId ? getChapterOrder(currentChapterId, chapters) : 0

  // 🔴 Critical
  if (classified.critical.length > 0) {
    const lines = classified.critical.map((e) => formatCriticalLine(e, chapters, currentOrder))
    sections.push(`## 🔴 必须处理的伏笔（${classified.critical.length}条）`, ...lines)
  }

  // 🟡 Upcoming
  if (classified.upcoming.length > 0) {
    const lines = classified.upcoming.map((e) => formatUpcomingLine(e, chapters, currentOrder))
    sections.push(`## 🟡 近期需要铺垫的伏笔（${classified.upcoming.length}条）`, ...lines)
  }

  // 🔵 Active
  if (classified.active.length > 0) {
    const lines = classified.active.map((e) => formatActiveLine(e))
    sections.push(`## 🔵 进行中的伏笔（${classified.active.length}条）`, ...lines)
  }

  // ⚪ Background
  if (classified.background.length > 0) {
    const lines = classified.background.map((e) => formatEntryLine(e, chapters))
    sections.push(`## ⚪ 已埋设的伏笔（${classified.background.length}条）`, ...lines)
  }

  // 👤 Character-related (if currentChars provided)
  if (currentChars && currentChars.length > 0) {
    const allEntries = [
      ...classified.critical,
      ...classified.upcoming,
      ...classified.active,
      ...classified.background,
    ]
    const charRelated = allEntries.filter(
      (e) => e.relatedCharacters.some((c) => currentChars.includes(c)),
    )
    if (charRelated.length > 0) {
      sections.push(
        `## 👤 本章出场角色关联的伏笔（${charRelated.length}条）`,
        `本章出场：${currentChars.join('、')}`,
        ...charRelated.map((f) => {
          const related = f.relatedCharacters.filter((c) => currentChars.includes(c))
          return `- **${f.name}**：${f.description}（关联${related.join('、')}）`
        }),
      )
    }
  }

  return sections.join('\n')
}
