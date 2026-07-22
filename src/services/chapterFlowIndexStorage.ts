import { atomicWriteProjectFile, deleteProjectFile, readProjectFile } from '../api/tauri'
import type { ChapterKey, ChapterRef } from '../types/chapter'
import { chapterRefKey } from './chapterDisplay'
import { chapterFileKey } from './chapterFlowHash'
import { isRecord } from '../utils/unknown'

const DIR = 'memory/chapter-flow'
const INDEX_FILE = 'index.json'
const ANALYSES_DIR = `${DIR}/analyses`
const FINDINGS_DIR = `${DIR}/findings`
const RECOVERY_DIR = `${DIR}/recovery`

export type ChapterAnalysisStatus = 'missing' | 'stale' | 'ready' | 'failed'

export interface ChapterAnalysisIndexItem {
  ref: ChapterRef
  contentHash?: string
  analysisInputHash?: string
  analyzedInputHash?: string
  lastAttemptInputHash?: string
  lastAttemptedAt?: string
  status: ChapterAnalysisStatus
  analyzedAt?: string
  summary?: string
  error?: string
}

export interface ChapterFlowFindingSummary {
  id: string
  type: 'possible-resolution' | 'possible-advance' | 'possible-continuation' | 'record-conflict'
  foreshadowId?: string
  source: ChapterRef
  target?: ChapterRef
  summary: string
  confidence: number
  evidenceCount: number
  sourceContentHashes: Record<ChapterKey, string>
  generatedAt: string
  status: 'ready' | 'stale'
}

export interface ChapterAnalysisDetail {
  schemaVersion: 1
  ref: ChapterRef
  contentHash: string
  analysisInputHash: string
  analyzedAt: string
  summary: string
  keyEvents: string[]
  endingHook: string
  findingIds: string[]
}

export interface ChapterFlowFinding {
  id: string
  type: ChapterFlowFindingSummary['type']
  foreshadowId?: string
  source: ChapterRef
  target?: ChapterRef
  summary: string
  evidence: Array<{ chapter: ChapterRef; quote: string; contentHash: string }>
  confidence: number
  sourceContentHashes: Record<ChapterKey, string>
  generatedAt: string
}

export interface ChapterFlowIndex {
  schemaVersion: 1
  revision: number
  updatedAt: string
  chapters: ChapterAnalysisIndexItem[]
  findings: ChapterFlowFindingSummary[]
}

export type ChapterFlowIndexRead = { kind: 'ready'; index: ChapterFlowIndex } | { kind: 'corrupt'; raw: string; error: string }
type IndexMutator = (index: ChapterFlowIndex) => void | Promise<void>
const projectQueues = new Map<string, Promise<void>>()

export function emptyChapterFlowIndex(): ChapterFlowIndex {
  return { schemaVersion: 1, revision: 0, updatedAt: '', chapters: [], findings: [] }
}

function isRef(value: unknown): value is ChapterRef {
  return isRecord(value) && typeof value.volume === 'string' && typeof value.chapterId === 'string'
}

function isIndex(value: unknown): value is ChapterFlowIndex {
  return isRecord(value) && value.schemaVersion === 1 && typeof value.revision === 'number'
    && typeof value.updatedAt === 'string' && Array.isArray(value.chapters) && Array.isArray(value.findings)
    && value.chapters.every((item) => isRecord(item) && isRef(item.ref) && typeof item.status === 'string')
}

export function resolveAnalysisStatus(item: ChapterAnalysisIndexItem): ChapterAnalysisStatus {
  if (item.analyzedInputHash) return item.analysisInputHash === item.analyzedInputHash ? 'ready' : 'stale'
  if (item.lastAttemptInputHash && item.lastAttemptInputHash === item.analysisInputHash && item.error) return 'failed'
  return 'missing'
}

export async function readChapterFlowIndex(projectId: string): Promise<ChapterFlowIndexRead> {
  const raw = await readProjectFile(projectId, DIR, INDEX_FILE)
  if (!raw.trim()) return { kind: 'ready', index: emptyChapterFlowIndex() }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isIndex(parsed)) return { kind: 'corrupt', raw, error: '章节脉络索引格式无效' }
    parsed.chapters = parsed.chapters.map((item) => ({ ...item, status: resolveAnalysisStatus(item) }))
    return { kind: 'ready', index: parsed }
  } catch (error) {
    return { kind: 'corrupt', raw, error: `章节脉络索引损坏：${String(error)}` }
  }
}

function recoveryTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

async function loadWritableIndex(projectId: string): Promise<ChapterFlowIndex> {
  const result = await readChapterFlowIndex(projectId)
  if (result.kind === 'ready') return result.index
  await atomicWriteProjectFile(projectId, RECOVERY_DIR, `index-${recoveryTimestamp()}.corrupt.json`, result.raw)
  return emptyChapterFlowIndex()
}

export async function updateChapterFlowIndex(projectId: string, mutator: IndexMutator): Promise<ChapterFlowIndex> {
  let output = emptyChapterFlowIndex()
  const previous = projectQueues.get(projectId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(async () => {
    const index = await loadWritableIndex(projectId)
    await mutator(index)
    index.chapters = index.chapters.map((item) => ({ ...item, status: resolveAnalysisStatus(item) }))
    index.revision += 1
    index.updatedAt = new Date().toISOString()
    await atomicWriteProjectFile(projectId, DIR, INDEX_FILE, JSON.stringify(index, null, 2))
    output = index
  })
  projectQueues.set(projectId, next)
  try {
    await next
    return output
  } finally {
    if (projectQueues.get(projectId) === next) projectQueues.delete(projectId)
  }
}

/** Explicit recovery entry: backs up a corrupt index, then writes a new empty index. */
export async function recoverChapterFlowIndex(projectId: string): Promise<ChapterFlowIndex> {
  return updateChapterFlowIndex(projectId, () => undefined)
}

export async function deleteChapterFlowDetails(projectId: string, ref: ChapterRef, findingIds: string[]): Promise<void> {
  await deleteProjectFile(projectId, ANALYSES_DIR, `${chapterFileKey(ref)}.json`).catch(() => undefined)
  await deleteChapterFlowFindingDetails(projectId, findingIds)
}

export async function deleteChapterFlowFindingDetails(projectId: string, findingIds: string[]): Promise<void> {
  await Promise.all(findingIds.map((id) => deleteProjectFile(projectId, FINDINGS_DIR, `${id}.json`).catch(() => undefined)))
}

export async function readChapterAnalysisDetail(projectId: string, ref: ChapterRef): Promise<ChapterAnalysisDetail> {
  const raw = await readProjectFile(projectId, ANALYSES_DIR, `${chapterFileKey(ref)}.json`)
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRef(parsed.ref)
    || typeof parsed.contentHash !== 'string' || typeof parsed.analysisInputHash !== 'string'
    || typeof parsed.analyzedAt !== 'string' || typeof parsed.summary !== 'string'
    || !Array.isArray(parsed.keyEvents) || !parsed.keyEvents.every((item) => typeof item === 'string')
    || typeof parsed.endingHook !== 'string' || !Array.isArray(parsed.findingIds)
    || !parsed.findingIds.every((item) => typeof item === 'string')) {
    throw new Error('章节分析详情格式无效')
  }
  return parsed as unknown as ChapterAnalysisDetail
}

export async function writeChapterAnalysisDetail(projectId: string, detail: ChapterAnalysisDetail): Promise<void> {
  await atomicWriteProjectFile(projectId, ANALYSES_DIR, `${chapterFileKey(detail.ref)}.json`, JSON.stringify(detail, null, 2))
}

export async function readChapterFlowFinding(projectId: string, id: string): Promise<ChapterFlowFinding> {
  const raw = await readProjectFile(projectId, FINDINGS_DIR, `${id}.json`)
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.summary !== 'string'
    || !isRef(parsed.source) || !Array.isArray(parsed.evidence)) {
    throw new Error('章节脉络发现详情格式无效')
  }
  return parsed as unknown as ChapterFlowFinding
}

export async function writeChapterFlowFinding(projectId: string, finding: ChapterFlowFinding): Promise<void> {
  await atomicWriteProjectFile(projectId, FINDINGS_DIR, `${finding.id}.json`, JSON.stringify(finding, null, 2))
}

export function findIndexItem(index: ChapterFlowIndex, ref: ChapterRef): ChapterAnalysisIndexItem | undefined {
  return index.chapters.find((item) => chapterRefKey(item.ref) === chapterRefKey(ref))
}
