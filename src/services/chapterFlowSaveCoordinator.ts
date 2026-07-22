import { commitChapterVersion, getChapterContent, listChapters, saveChapterContent } from '../api/tauri'
import type { ChapterRef } from '../types/chapter'
import { chapterRefKey } from './chapterDisplay'
import { contentHash } from './chapterFlowHash'
import { buildChapterFlowAnalysisInput } from './chapterFlowAnalysisInput'
import {
  deleteChapterFlowDetails,
  findIndexItem,
  updateChapterFlowIndex,
  type ChapterAnalysisIndexItem,
} from './chapterFlowIndexStorage'

const chapterQueues = new Map<string, Promise<void>>()

export interface ChapterSaveResult {
  contentSaved: boolean
  flowIndexUpdated: boolean
  indexError?: string
}

export function queueChapterFlowOperation<T>(projectId: string, ref: ChapterRef, operation: () => Promise<T>): Promise<T> {
  const key = `${projectId}:${chapterRefKey(ref)}`
  const previous = chapterQueues.get(key) ?? Promise.resolve()
  let result: T
  const next = previous.catch(() => undefined).then(async () => { result = await operation() })
  chapterQueues.set(key, next)
  return next.finally(() => {
    if (chapterQueues.get(key) === next) chapterQueues.delete(key)
  }).then(() => result)
}

async function buildInputHash(projectId: string, ref: ChapterRef, hash: string): Promise<string> {
  return (await buildChapterFlowAnalysisInput(projectId, ref, hash)).inputHash
}

export async function markChapterSaved(projectId: string, ref: ChapterRef, html: string): Promise<void> {
  const hash = await contentHash(html)
  const inputHash = await buildInputHash(projectId, ref, hash)
  await updateChapterFlowIndex(projectId, (index) => {
    const existing = findIndexItem(index, ref)
    const item: ChapterAnalysisIndexItem = { ...(existing ?? { ref, status: 'missing' }), contentHash: hash, analysisInputHash: inputHash }
    if (!existing) index.chapters.push(item)
    else Object.assign(existing, item)
    for (const finding of index.findings) {
      const expected = finding.sourceContentHashes[chapterRefKey(ref)]
      if (expected && expected !== hash) finding.status = 'stale'
    }
  })
}

export async function saveChapterWithFlowIndex(
  projectId: string,
  ref: ChapterRef,
  html: string,
  mode: 'auto' | 'unmount' | 'manual',
): Promise<ChapterSaveResult> {
  return queueChapterFlowOperation(projectId, ref, async () => {
    if (mode === 'manual') await commitChapterVersion(projectId, ref.volume, ref.chapterId, html)
    else await saveChapterContent(projectId, ref.volume, ref.chapterId, html)
    try {
      await markChapterSaved(projectId, ref, html)
      return { contentSaved: true, flowIndexUpdated: true }
    } catch (error) {
      return { contentSaved: true, flowIndexUpdated: false, indexError: String(error) }
    }
  })
}

export async function markChapterCreated(projectId: string, ref: ChapterRef): Promise<void> {
  await updateChapterFlowIndex(projectId, (index) => {
    if (!findIndexItem(index, ref)) index.chapters.push({ ref, status: 'missing' })
  })
}

export async function markChapterDeleted(projectId: string, ref: ChapterRef): Promise<void> {
  let findingIds: string[] = []
  await updateChapterFlowIndex(projectId, (index) => {
    index.chapters = index.chapters.filter((item) => chapterRefKey(item.ref) !== chapterRefKey(ref))
    const removed = index.findings.filter((finding) => finding.sourceContentHashes[chapterRefKey(ref)] !== undefined)
    findingIds = removed.map((finding) => finding.id)
    index.findings = index.findings.filter((finding) => !findingIds.includes(finding.id))
  })
  await deleteChapterFlowDetails(projectId, ref, findingIds)
}

export async function scanChapterContentChanges(
  projectId: string,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  const chapters = await listChapters(projectId)
  let cursor = 0
  let completed = 0
  const worker = async () => {
    while (!signal?.aborted) {
      const chapter = chapters[cursor++]
      if (!chapter) return
      const ref = { volume: chapter.volume, chapterId: chapter.id }
      await queueChapterFlowOperation(projectId, ref, async () => {
        const html = await getChapterContent(projectId, ref.volume, ref.chapterId)
        await markChapterSaved(projectId, ref, html)
      })
      completed += 1
      onProgress?.(completed, chapters.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, chapters.length) }, () => worker()))
}
