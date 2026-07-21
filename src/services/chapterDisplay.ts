import { readProjectFile } from '../api/tauri'
import type { BrainstormChapterRef, BrainstormScope } from '../types/brainstorm'
import type { ChapterKey, ChapterMeta, ChapterRef } from '../types/chapter'
import { asString, isRecord } from '../utils/unknown'

export interface ChapterDisplayMetadata {
  volumeNames: Record<string, string>
  chapterTitles: Record<string, string>
}

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

function parseStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, asString(item).trim()] as const)
      .filter((entry) => Boolean(entry[1])),
  )
}

async function loadStringMap(projectId: string, filename: string): Promise<Record<string, string>> {
  try {
    const raw = await readProjectFile(projectId, 'memory', filename)
    return raw.trim() ? parseStringMap(JSON.parse(raw) as unknown) : {}
  } catch {
    return {}
  }
}

export async function loadChapterDisplayMetadata(projectId: string): Promise<ChapterDisplayMetadata> {
  const [volumeNames, chapterTitles] = await Promise.all([
    loadStringMap(projectId, '_volume_names.json'),
    loadStringMap(projectId, '_chapter_titles.json'),
  ])
  return { volumeNames, chapterTitles }
}

export function chapterRefKey(chapter: ChapterRef | Pick<ChapterMeta, 'volume' | 'id'>): ChapterKey {
  const chapterId = 'chapterId' in chapter ? chapter.chapterId : chapter.id
  return `${chapter.volume}:${chapterId}` as ChapterKey
}

export function compareChapters(left: ChapterMeta, right: ChapterMeta): number {
  const volumeOrder = collator.compare(left.volume, right.volume)
  return volumeOrder !== 0 ? volumeOrder : left.order - right.order
}

export function volumeDisplayName(volume: string, metadata: ChapterDisplayMetadata): string {
  return metadata.volumeNames[volume] || volume
}

export function chapterNumberLabel(chapter: ChapterMeta, metadata: ChapterDisplayMetadata): string {
  return `${volumeDisplayName(chapter.volume, metadata)} · 第 ${chapter.order} 章`
}

export function chapterContextLabel(chapter: ChapterMeta, metadata: ChapterDisplayMetadata): string {
  const base = chapterNumberLabel(chapter, metadata)
  const title = (metadata.chapterTitles[chapterRefKey(chapter)] || chapter.title).trim()
  const isNumberOnlyTitle = /^第\s*(?:\d+|[零〇一二三四五六七八九十百千万两]+)\s*章$/u.test(title)
  return title && !isNumberOnlyTitle ? `${base}《${title}》` : base
}

function orderFromRef(chapter: BrainstormChapterRef): number {
  const match = chapter.chapterId.match(/(\d+)$/)
  return match ? Number(match[1]) : 0
}

function formatOrders(orders: number[]): string {
  const sorted = [...new Set(orders)].filter((order) => order > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return '未识别章节'
  const ranges: Array<[number, number]> = []
  for (const order of sorted) {
    const last = ranges.at(-1)
    if (last && order === last[1] + 1) last[1] = order
    else ranges.push([order, order])
  }
  return ranges.map(([start, end]) => start === end ? `第 ${start} 章` : `第 ${start}-${end} 章`).join('、')
}

function chapterOrder(ref: BrainstormChapterRef, chapters: ChapterMeta[]): number {
  return chapters.find((chapter) => chapter.volume === ref.volume && chapter.id === ref.chapterId)?.order ?? orderFromRef(ref)
}

export function selectedChapterSummary(
  refs: BrainstormChapterRef[],
  chapters: ChapterMeta[],
  metadata: ChapterDisplayMetadata,
): string {
  const grouped = new Map<string, number[]>()
  for (const ref of refs) {
    const values = grouped.get(ref.volume) ?? []
    values.push(chapterOrder(ref, chapters))
    grouped.set(ref.volume, values)
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => collator.compare(left, right))
    .map(([volume, orders]) => `${volumeDisplayName(volume, metadata)}：${formatOrders(orders)}`)
    .join('；') || '未选择章节'
}

export function scopeDisplaySummary(
  scope: BrainstormScope,
  chapters: ChapterMeta[],
  metadata: ChapterDisplayMetadata,
): string {
  if (scope.type === 'whole_project') {
    return `全书 · ${new Set(chapters.map((chapter) => chapter.volume)).size} 卷 / ${chapters.length} 章`
  }
  if (scope.type === 'current_volume') {
    const orders = chapters.filter((chapter) => chapter.volume === scope.volume).map((chapter) => chapter.order)
    return `${volumeDisplayName(scope.volume, metadata)} · ${formatOrders(orders)}`
  }
  if (scope.type === 'selected_chapters') return selectedChapterSummary(scope.chapters, chapters, metadata)
  const chapter = chapters.find((item) => item.volume === scope.chapter.volume && item.id === scope.chapter.chapterId)
  if (chapter) return chapterNumberLabel(chapter, metadata)
  const order = orderFromRef(scope.chapter)
  return `${volumeDisplayName(scope.chapter.volume, metadata)} · ${order > 0 ? `第 ${order} 章` : scope.chapter.chapterTitle}`
}
