import type { ChapterMeta, ChapterRef } from '../types/chapter'
import type { ForeshadowConfig, ForeshadowEntry } from '../types/novel'
import { buildChapterSequence } from './chapterCatalog'
import { chapterRefKey } from './chapterDisplay'

export type ForeshadowUrgency = 'critical' | 'upcoming' | 'active' | 'background'

function position(ref: ChapterRef, chapters: ChapterMeta[]): number {
  return buildChapterSequence(chapters).positionByKey.get(chapterRefKey(ref)) ?? 0
}

function latestProgressPosition(entry: ForeshadowEntry, chapters: ChapterMeta[]): number {
  if (entry.progress.length === 0) return 0
  return Math.max(...entry.progress.map((progress) => position(progress.chapter, chapters)))
}

export function classifyForeshadows(
  entries: ForeshadowEntry[],
  currentChapter: ChapterRef | null,
  chapters: ChapterMeta[],
  config: ForeshadowConfig,
): Record<ForeshadowUrgency, ForeshadowEntry[]> {
  const result: Record<ForeshadowUrgency, ForeshadowEntry[]> = { critical: [], upcoming: [], active: [], background: [] }
  const unresolved = entries.filter((entry) => entry.status !== 'resolved' && entry.status !== 'abandoned')
  const currentPosition = currentChapter ? position(currentChapter, chapters) : 0
  if (!currentPosition) {
    result.background = unresolved
    return result
  }

  for (const entry of unresolved) {
    const plannedPosition = entry.plannedResolutionChapter ? position(entry.plannedResolutionChapter, chapters) : 0
    if (plannedPosition && plannedPosition <= currentPosition) {
      result.critical.push(entry)
    } else if (plannedPosition && plannedPosition - currentPosition <= config.upcomingWindow) {
      result.upcoming.push(entry)
    } else if (entry.status === 'advanced'
      && latestProgressPosition(entry, chapters)
      && currentPosition - latestProgressPosition(entry, chapters) <= config.dormantThreshold) {
      result.active.push(entry)
    } else {
      result.background.push(entry)
    }
  }
  return result
}

function chapterLabel(ref: ChapterRef, chapters: ChapterMeta[]): string {
  const chapter = chapters.find((item) => item.volume === ref.volume && item.id === ref.chapterId)
  return chapter ? `${chapter.volume}·${chapter.title}` : `${ref.volume}·${ref.chapterId}`
}

function formatEntryLine(entry: ForeshadowEntry, chapters: ChapterMeta[]): string {
  const statusLabel = entry.status === 'advanced' ? '推进中' : '已埋设'
  return `- [${statusLabel}] **${entry.name}**：${entry.description}（${chapterLabel(entry.plantedChapter, chapters)}埋设）`
}

export function classifiedForeshadowsToText(
  classified: Record<ForeshadowUrgency, ForeshadowEntry[]>,
  chapters: ChapterMeta[],
  currentChapter: ChapterRef | null,
  currentChars?: string[],
): string {
  const currentPosition = currentChapter ? position(currentChapter, chapters) : 0
  const sections: string[] = []
  const group = (title: string, entries: ForeshadowEntry[], detail?: (entry: ForeshadowEntry) => string) => {
    if (entries.length > 0) sections.push(title, ...entries.map((entry) => `${formatEntryLine(entry, chapters)}${detail?.(entry) ?? ''}`))
  }
  group(`## 🔴 必须处理的伏笔（${classified.critical.length}条）`, classified.critical, (entry) => {
    const planned = entry.plannedResolutionChapter ? position(entry.plannedResolutionChapter, chapters) : 0
    return planned ? `\n  ⚠️ 已超期${Math.max(0, currentPosition - planned)}章，尽快回收` : ''
  })
  group(`## 🟡 近期需要铺垫的伏笔（${classified.upcoming.length}条）`, classified.upcoming)
  group(`## 🔵 进行中的伏笔（${classified.active.length}条）`, classified.active, (entry) => `（已推进${entry.progress.length}次）`)
  group(`## ⚪ 已埋设的伏笔（${classified.background.length}条）`, classified.background)

  if (currentChars?.length) {
    const related = Object.values(classified).flat().filter((entry) => entry.relatedCharacters.some((name) => currentChars.includes(name)))
    if (related.length) sections.push(`## 👤 本章出场角色关联的伏笔（${related.length}条）`, ...related.map((entry) => `- **${entry.name}**：${entry.description}`))
  }
  return sections.join('\n')
}
