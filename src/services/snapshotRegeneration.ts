import { getChapterContent, listChapters, readProjectFile, writeProjectFile } from '../api/tauri'
import { analyzeChapter } from './chapterIngest'
import { saveChapterSnapshot } from './memorySync'
import type { ChapterSnapshot } from '../types/novel'
import type { ChapterMeta } from '../types/chapter'

const REPORT_DIR = 'memory'
const REPORT_FILE = 'relationship-graph-regeneration-report.json'

export interface SnapshotRegenerationProgress {
  current: number
  total: number
  chapterId: string
  chapterTitle: string
  status: 'running' | 'success' | 'failed'
  error?: string
}

export interface SnapshotRegenerationRecord {
  chapterId: string
  chapterTitle: string
  chapterOrder: number
  volume: string
  status: 'success' | 'failed'
  rebuiltAt: string
  contentHash: string
  scopeLabel: string
  error?: string
  stale?: boolean
}

export type SnapshotRegenerationScope =
  | { kind: 'all' }
  | { kind: 'single'; chapterId: string }
  | { kind: 'from'; chapterId: string }
  | { kind: 'range'; startChapterId: string; endChapterId: string }

export interface SnapshotRegenerationReport {
  updatedAt: string
  lastRunStartedAt?: string
  lastRunFinishedAt?: string
  lastScopeLabel?: string
  total: number
  success: number
  failed: number
  stale: number
  items: SnapshotRegenerationRecord[]
}

function snapshotFileName(chapterNumber: number): string {
  return `ch${String(chapterNumber).padStart(3, '0')}.snapshot.json`
}

function chapterLabel(chapter: ChapterMeta): string {
  return `第${chapter.order}章 ${chapter.title}`
}

function scopeLabel(scope: SnapshotRegenerationScope, chapters: ChapterMeta[]): string {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]))
  if (scope.kind === 'all') return '全部章节'
  if (scope.kind === 'single') return byId.get(scope.chapterId) ? `单章：${chapterLabel(byId.get(scope.chapterId)!)} ` : '单章'
  if (scope.kind === 'from') return byId.get(scope.chapterId) ? `从 ${chapterLabel(byId.get(scope.chapterId)!)} 开始` : '从指定章节开始'
  const start = byId.get(scope.startChapterId)
  const end = byId.get(scope.endChapterId)
  return start && end ? `${chapterLabel(start)} 至 ${chapterLabel(end)}` : '章节范围'
}

function isLegacyReport(value: unknown): value is {
  startedAt?: string
  finishedAt?: string
  scopeLabel?: string
  items?: SnapshotRegenerationProgress[]
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { items?: unknown }
  return Array.isArray(candidate.items) && candidate.items.some((item) => item && typeof item === 'object' && !('rebuiltAt' in item))
}

function isSnapshotRegenerationReport(value: unknown): value is SnapshotRegenerationReport {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { items?: unknown }
  return Array.isArray(candidate.items)
}

async function hashText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

async function chapterContentHash(projectId: string, chapter: ChapterMeta): Promise<string> {
  return hashText(await getChapterContent(projectId, chapter.volume, chapter.id))
}

function summarizeReport(
  items: SnapshotRegenerationRecord[],
  meta: {
    updatedAt: string
    lastRunStartedAt?: string
    lastRunFinishedAt?: string
    lastScopeLabel?: string
  },
): SnapshotRegenerationReport {
  const sorted = items.slice().sort((a, b) => a.chapterOrder - b.chapterOrder || a.chapterTitle.localeCompare(b.chapterTitle))
  return {
    ...meta,
    total: sorted.length,
    success: sorted.filter((item) => item.status === 'success' && !item.stale).length,
    failed: sorted.filter((item) => item.status === 'failed').length,
    stale: sorted.filter((item) => item.stale).length,
    items: sorted,
  }
}

async function normalizeReport(
  projectId: string,
  parsed: unknown,
  chapters: ChapterMeta[],
): Promise<SnapshotRegenerationReport | null> {
  if (!isSnapshotRegenerationReport(parsed)) return null

  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]))
  const now = new Date().toISOString()
  const legacy = isLegacyReport(parsed)
  const records: SnapshotRegenerationRecord[] = []

  for (const item of parsed.items as Array<SnapshotRegenerationRecord | SnapshotRegenerationProgress>) {
    const chapter = chapterById.get(item.chapterId)
    const rebuiltAt = legacy
      ? (parsed.finishedAt ?? parsed.startedAt ?? now)
      : ((item as SnapshotRegenerationRecord).rebuiltAt ?? now)
    let contentHash = legacy ? '' : ((item as SnapshotRegenerationRecord).contentHash ?? '')
    let stale = false

    if (chapter) {
      try {
        const currentHash = await chapterContentHash(projectId, chapter)
        if (contentHash) stale = currentHash !== contentHash
        else contentHash = currentHash
      } catch {
        stale = (item as SnapshotRegenerationRecord).stale ?? false
      }
    }

    if (item.status !== 'success' && item.status !== 'failed') continue
    records.push({
      chapterId: item.chapterId,
      chapterTitle: chapter?.title ?? item.chapterTitle,
      chapterOrder: chapter?.order ?? (item as SnapshotRegenerationRecord).chapterOrder ?? 0,
      volume: chapter?.volume ?? (item as SnapshotRegenerationRecord).volume ?? '',
      status: item.status,
      rebuiltAt,
      contentHash,
      scopeLabel: legacy ? (parsed.scopeLabel ?? '旧版重建报告') : ((item as SnapshotRegenerationRecord).scopeLabel ?? parsed.lastScopeLabel ?? '快照重建'),
      error: item.error,
      stale,
    })
  }

  return summarizeReport(records, {
    updatedAt: (parsed as SnapshotRegenerationReport).updatedAt ?? (legacy ? (parsed.finishedAt ?? now) : now),
    lastRunStartedAt: (parsed as SnapshotRegenerationReport).lastRunStartedAt ?? (legacy ? parsed.startedAt : undefined),
    lastRunFinishedAt: (parsed as SnapshotRegenerationReport).lastRunFinishedAt ?? (legacy ? parsed.finishedAt : undefined),
    lastScopeLabel: (parsed as SnapshotRegenerationReport).lastScopeLabel ?? (legacy ? parsed.scopeLabel : undefined),
  })
}

function selectChapters(chapters: ChapterMeta[], scope: SnapshotRegenerationScope): { selected: ChapterMeta[]; startIndex: number } {
  if (scope.kind === 'all') return { selected: chapters, startIndex: 0 }

  if (scope.kind === 'single') {
    const index = chapters.findIndex((chapter) => chapter.id === scope.chapterId)
    return { selected: index >= 0 ? [chapters[index]!] : [], startIndex: Math.max(0, index) }
  }

  if (scope.kind === 'from') {
    const index = chapters.findIndex((chapter) => chapter.id === scope.chapterId)
    return { selected: index >= 0 ? chapters.slice(index) : [], startIndex: Math.max(0, index) }
  }

  const startIndex = chapters.findIndex((chapter) => chapter.id === scope.startChapterId)
  const endIndex = chapters.findIndex((chapter) => chapter.id === scope.endChapterId)
  if (startIndex < 0 || endIndex < 0) return { selected: [], startIndex: 0 }
  const from = Math.min(startIndex, endIndex)
  const to = Math.max(startIndex, endIndex)
  return { selected: chapters.slice(from, to + 1), startIndex: from }
}

async function loadPreviousSnapshot(projectId: string, chapters: ChapterMeta[], startIndex: number): Promise<ChapterSnapshot | null> {
  if (startIndex <= 0) return null
  const previousChapter = chapters[startIndex - 1]
  if (!previousChapter) return null
  try {
    const raw = await readProjectFile(projectId, 'memory/snapshots', snapshotFileName(previousChapter.order))
    return JSON.parse(raw) as ChapterSnapshot
  } catch {
    return null
  }
}

export async function loadSnapshotRegenerationReport(projectId: string): Promise<SnapshotRegenerationReport | null> {
  try {
    const raw = await readProjectFile(projectId, REPORT_DIR, REPORT_FILE)
    if (!raw.trim()) return null
    const chapters = (await listChapters(projectId)).slice().sort((a, b) => a.order - b.order)
    return normalizeReport(projectId, JSON.parse(raw), chapters)
  } catch {
    return null
  }
}

async function saveSnapshotRegenerationReport(projectId: string, report: SnapshotRegenerationReport): Promise<void> {
  await writeProjectFile(projectId, REPORT_DIR, REPORT_FILE, JSON.stringify(report, null, 2))
}

export async function regenerateSnapshots(
  projectId: string,
  scope: SnapshotRegenerationScope,
  onProgress?: (progress: SnapshotRegenerationProgress) => void,
): Promise<SnapshotRegenerationReport> {
  const chapters = (await listChapters(projectId)).slice().sort((a, b) => a.order - b.order)
  const { selected, startIndex } = selectChapters(chapters, scope)
  const runScopeLabel = scopeLabel(scope, chapters)
  let previousSnapshot = await loadPreviousSnapshot(projectId, chapters, startIndex)
  const existing = await loadSnapshotRegenerationReport(projectId)
  const records = new Map<string, SnapshotRegenerationRecord>()
  for (const item of existing?.items ?? []) records.set(item.chapterId, item)
  const startedAt = new Date().toISOString()

  for (let index = 0; index < selected.length; index++) {
    const chapter = selected[index]!
    const base = {
      current: index + 1,
      total: selected.length,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
    }

    onProgress?.({ ...base, status: 'running' })

    let stage = '读取章节正文'
    let contentHash = ''
    try {
      const content = await getChapterContent(projectId, chapter.volume, chapter.id)
      contentHash = await hashText(content)
      stage = 'AI 分析章节'
      const snapshot = await analyzeChapter(chapter.order, chapter.title, content, previousSnapshot)
      stage = '保存章节快照'
      await saveChapterSnapshot(projectId, snapshot)
      previousSnapshot = snapshot
      const progress: SnapshotRegenerationProgress = { ...base, status: 'success' }
      records.set(chapter.id, {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        volume: chapter.volume,
        status: 'success',
        rebuiltAt: new Date().toISOString(),
        contentHash,
        scopeLabel: runScopeLabel,
        stale: false,
      })
      onProgress?.(progress)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const progress: SnapshotRegenerationProgress = { ...base, status: 'failed', error: `${stage}失败：${message}` }
      records.set(chapter.id, {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        volume: chapter.volume,
        status: 'failed',
        rebuiltAt: new Date().toISOString(),
        contentHash,
        scopeLabel: runScopeLabel,
        error: progress.error,
        stale: false,
      })
      onProgress?.(progress)
    }
  }

  const finishedAt = new Date().toISOString()
  const report = summarizeReport(Array.from(records.values()), {
    updatedAt: finishedAt,
    lastRunStartedAt: startedAt,
    lastRunFinishedAt: finishedAt,
    lastScopeLabel: runScopeLabel,
  })
  await saveSnapshotRegenerationReport(projectId, report)
  return report
}

export async function regenerateAllSnapshots(
  projectId: string,
  onProgress?: (progress: SnapshotRegenerationProgress) => void,
): Promise<void> {
  await regenerateSnapshots(projectId, { kind: 'all' }, onProgress)
}
