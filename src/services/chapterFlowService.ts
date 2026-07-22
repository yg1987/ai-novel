import { listChapters } from '../api/tauri'
import type { ChapterKey, ChapterMeta, ChapterRef } from '../types/chapter'
import type { ForeshadowEntry, ForeshadowProgress } from '../types/novel'
import { buildChapterSequence, formatChapterId } from './chapterCatalog'
import { loadChapterDisplayMetadata, chapterRefKey, chapterContextLabel, volumeDisplayName } from './chapterDisplay'
import { loadForeshadows } from './foreshadowStorage'
import { readChapterFlowIndex, resolveAnalysisStatus, type ChapterAnalysisStatus, type ChapterFlowIndex } from './chapterFlowIndexStorage'

export type ForeshadowExecutionState =
  | 'abandoned'
  | 'unplanned'
  | 'pending'
  | 'on-schedule'
  | 'early'
  | 'late'
  | 'overdue'
  | 'record-incomplete'
  | 'invalid-reference'

export type ForeshadowAiState = 'not-analyzed' | 'ready' | 'stale' | 'needs-review' | 'failed'

export interface ForeshadowExecutionCheck {
  foreshadowId: string
  plantedChapter: ChapterRef
  plannedResolutionChapter?: ChapterRef
  recordedResolutionChapter?: ChapterRef
  progress: ForeshadowProgress[]
  state: ForeshadowExecutionState
  aiState: ForeshadowAiState
  chapterDelta?: number
  message: string
}

export interface ChapterFlowEntry {
  entry: ForeshadowEntry
  check: ForeshadowExecutionCheck
}

export interface ChapterFlowVolume {
  volume: string
  label: string
  chapters: Array<{ meta: ChapterMeta; label: string; position: number }>
  plannedPositions: Array<{ ref: ChapterRef; entries: ChapterFlowEntry[] }>
}

export interface ChapterFlowView {
  checks: ChapterFlowEntry[]
  volumes: ChapterFlowVolume[]
  summary: Record<ForeshadowExecutionState, number>
  analysisItems: Array<{ ref: ChapterRef; status: ChapterAnalysisStatus }>
  indexError?: string
}

function sameRef(left: ChapterRef, right: ChapterRef): boolean {
  return left.volume === right.volume && left.chapterId === right.chapterId
}

function flowVolumeLabel(volume: string, metadata: Awaited<ReturnType<typeof loadChapterDisplayMetadata>>): string {
  const customName = volumeDisplayName(volume, metadata)
  return customName === volume ? volume : `${volume} ${customName}`
}

function chapterOrder(ref: ChapterRef): number | null {
  const match = /^ch(\d+)$/i.exec(ref.chapterId)
  if (!match) return null
  const order = Number(match[1])
  return Number.isInteger(order) && order > 0 ? order : null
}

function refExists(ref: ChapterRef, positionByKey: Map<ChapterKey, number>): boolean {
  return positionByKey.has(chapterRefKey(ref))
}

function validFuturePlannedRef(ref: ChapterRef, chapters: ChapterMeta[]): boolean {
  if (!chapters.some((chapter) => chapter.volume === ref.volume)) return false
  const order = chapterOrder(ref)
  if (!order || ref.chapterId !== formatChapterId(order)) return false
  if (chapters.some((chapter) => chapter.volume === ref.volume && chapter.id === ref.chapterId)) return false

  const virtual = { volume: ref.volume, id: ref.chapterId, order, title: '' }
  const sequence = buildChapterSequence([...chapters, virtual])
  return (sequence.positionByKey.get(chapterRefKey(ref)) ?? 0) > sequence.lastWrittenPosition - 1
}

function checkEntry(entry: ForeshadowEntry, chapters: ChapterMeta[]): ForeshadowExecutionCheck {
  const sequence = buildChapterSequence(chapters)
  const exists = (ref: ChapterRef) => refExists(ref, sequence.positionByKey)
  const basic: Omit<ForeshadowExecutionCheck, 'state' | 'message'> = {
    foreshadowId: entry.id,
    plantedChapter: entry.plantedChapter,
    plannedResolutionChapter: entry.plannedResolutionChapter,
    recordedResolutionChapter: entry.recordedResolutionChapter,
    progress: entry.progress,
    aiState: 'not-analyzed',
  }
  if (entry.status === 'abandoned') return { ...basic, state: 'abandoned', message: '已废弃，不参与计划执行统计。' }

  const plannedValid = !entry.plannedResolutionChapter
    || exists(entry.plannedResolutionChapter)
    || validFuturePlannedRef(entry.plannedResolutionChapter, chapters)
  if (!exists(entry.plantedChapter)
    || entry.progress.some((progress) => !exists(progress.chapter))
    || (entry.recordedResolutionChapter && !exists(entry.recordedResolutionChapter))
    || !plannedValid) {
    return { ...basic, state: 'invalid-reference', message: '存在不在章节目录中的章节引用。' }
  }

  const plantedPosition = sequence.positionByKey.get(chapterRefKey(entry.plantedChapter))!
  const recordedPosition = entry.recordedResolutionChapter
    ? sequence.positionByKey.get(chapterRefKey(entry.recordedResolutionChapter))
    : undefined
  const invalidRecord = (entry.status === 'resolved' && !entry.recordedResolutionChapter)
    || (entry.status !== 'resolved' && Boolean(entry.recordedResolutionChapter))
    || (recordedPosition !== undefined && recordedPosition < plantedPosition)
    || entry.progress.some((progress) => sequence.positionByKey.get(chapterRefKey(progress.chapter))! < plantedPosition)
    || (entry.status === 'advanced' && entry.progress.length === 0)
  if (invalidRecord) return { ...basic, state: 'record-incomplete', message: '正式状态与推进或回收记录不一致。' }
  if (!entry.plannedResolutionChapter) return { ...basic, state: 'unplanned', message: '尚未设置计划回收章节。' }

  const plannedPosition = sequence.positionByKey.get(chapterRefKey(entry.plannedResolutionChapter))
  if (!recordedPosition) {
    if (plannedPosition === undefined) return { ...basic, state: 'pending', message: '计划回收章节尚未创建。' }
    return plannedPosition > sequence.lastWrittenPosition
      ? { ...basic, state: 'pending', message: '尚未写到计划回收章节。' }
      : { ...basic, state: 'overdue', message: '已到达或超过计划回收章节，但没有正式回收记录。' }
  }
  const delta = recordedPosition - plannedPosition!
  if (delta === 0) return { ...basic, state: 'on-schedule', chapterDelta: 0, message: '已按计划回收。' }
  if (delta < 0) return { ...basic, state: 'early', chapterDelta: delta, message: `提前 ${Math.abs(delta)} 章回收。` }
  return { ...basic, state: 'late', chapterDelta: delta, message: `延迟 ${delta} 章回收。` }
}

export function buildChapterFlow(entries: ForeshadowEntry[], chapters: ChapterMeta[]): ChapterFlowEntry[] {
  return entries.map((entry) => ({ entry, check: checkEntry(entry, chapters) }))
}

function aiStateForEntry(entry: ForeshadowEntry, index: ChapterFlowIndex): ForeshadowAiState {
  const refs = [entry.plantedChapter, ...entry.progress.map((progress) => progress.chapter), entry.recordedResolutionChapter]
    .filter((ref): ref is ChapterRef => Boolean(ref))
  const items = refs.map((ref) => index.chapters.find((item) => chapterRefKey(item.ref) === chapterRefKey(ref))).filter(Boolean)
  if (index.findings.some((finding) => finding.foreshadowId === entry.id && finding.type === 'record-conflict' && finding.status === 'ready')) return 'needs-review'
  if (items.some((item) => resolveAnalysisStatus(item!) === 'failed')) return 'failed'
  if (items.some((item) => resolveAnalysisStatus(item!) === 'stale')) return 'stale'
  if (items.length > 0 && items.every((item) => resolveAnalysisStatus(item!) === 'ready')) return 'ready'
  return 'not-analyzed'
}

export async function loadChapterFlowView(projectId: string): Promise<ChapterFlowView> {
  const [chapters, store, metadata, indexResult] = await Promise.all([
    listChapters(projectId),
    loadForeshadows(projectId),
    loadChapterDisplayMetadata(projectId),
    readChapterFlowIndex(projectId),
  ])
  const sequence = buildChapterSequence(chapters)
  const checks = buildChapterFlow(store.entries, sequence.chapters)
  if (indexResult.kind === 'ready') {
    for (const item of checks) item.check.aiState = aiStateForEntry(item.entry, indexResult.index)
  }
  const byVolume = new Map<string, ChapterFlowVolume>()
  for (const chapter of sequence.chapters) {
    const group = byVolume.get(chapter.volume) ?? {
      volume: chapter.volume,
      label: flowVolumeLabel(chapter.volume, metadata),
      chapters: [],
      plannedPositions: [],
    }
    group.chapters.push({
      meta: chapter,
      label: chapterContextLabel(chapter, metadata),
      position: sequence.positionByKey.get(chapterRefKey(chapter))!,
    })
    byVolume.set(chapter.volume, group)
  }
  for (const item of checks) {
    const ref = item.check.plannedResolutionChapter
    if (!ref || refExists(ref, sequence.positionByKey)) continue
    const group = byVolume.get(ref.volume)
    if (!group) continue
    const planned = group.plannedPositions.find((position) => sameRef(position.ref, ref))
    if (planned) planned.entries.push(item)
    else group.plannedPositions.push({ ref, entries: [item] })
  }
  const summary = Object.fromEntries(
    (['abandoned', 'unplanned', 'pending', 'on-schedule', 'early', 'late', 'overdue', 'record-incomplete', 'invalid-reference'] as ForeshadowExecutionState[])
      .map((state) => [state, checks.filter((item) => item.check.state === state).length]),
  ) as Record<ForeshadowExecutionState, number>
  return {
    checks,
    volumes: [...byVolume.values()],
    summary,
    analysisItems: sequence.chapters.map((chapter) => {
      const ref = { volume: chapter.volume, chapterId: chapter.id }
      const item = indexResult.kind === 'ready'
        ? indexResult.index.chapters.find((candidate) => chapterRefKey(candidate.ref) === chapterRefKey(ref))
        : undefined
      return { ref, status: item ? resolveAnalysisStatus(item) : 'missing' }
    }),
    indexError: indexResult.kind === 'corrupt' ? indexResult.error : undefined,
  }
}
