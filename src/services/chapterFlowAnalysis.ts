import { getChapterContent } from '../api/tauri'
import type { ChapterKey, ChapterRef } from '../types/chapter'
import { isRecord } from '../utils/unknown'
import { buildChapterFlowAnalysisInput, CHAPTER_FLOW_CONTENT_LIMIT, CHAPTER_FLOW_SYSTEM_PROMPT } from './chapterFlowAnalysisInput'
import { chapterRefKey } from './chapterDisplay'
import { contentHash, normalizeChapterContent } from './chapterFlowHash'
import { queueChapterFlowOperation } from './chapterFlowSaveCoordinator'
import { generateCrossChapterFindings } from './chapterFlowFindings'
import {
  deleteChapterFlowDetails,
  deleteChapterFlowFindingDetails,
  findIndexItem,
  updateChapterFlowIndex,
  writeChapterAnalysisDetail,
  writeChapterFlowFinding,
  type ChapterAnalysisDetail,
  type ChapterFlowFinding,
  type ChapterFlowFindingSummary,
} from './chapterFlowIndexStorage'

type FindingType = ChapterFlowFindingSummary['type']
const FINDING_TYPES = new Set<FindingType>(['possible-resolution', 'possible-advance', 'possible-continuation', 'record-conflict'])

export interface ChapterFlowAnalysisProgress {
  completed: number
  total: number
  succeeded: number
  failed: number
  current?: ChapterRef
}

export interface ChapterFlowAnalysisResult {
  completed: number
  succeeded: number
  failed: number
  cancelled: boolean
}

interface AiFinding {
  type: FindingType
  foreshadowId?: string
  summary: string
  quote: string
  confidence: number
}

interface AiChapterResult {
  summary: string
  keyEvents: string[]
  endingHook: string
  findings: AiFinding[]
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function jsonFromResponse(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = (fenced ?? raw).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end < start) throw new Error('AI 返回的内容不是 JSON 对象')
  return JSON.parse(candidate.slice(start, end + 1))
}

function parseAiChapterResult(raw: string, allowedForeshadowIds: Set<string>): AiChapterResult {
  const parsed = jsonFromResponse(raw)
  if (!isRecord(parsed)) throw new Error('AI 返回的 JSON 根节点不是对象')
  const findings = Array.isArray(parsed.findings) ? parsed.findings.flatMap((value): AiFinding[] => {
    if (!isRecord(value)) return []
    const type = stringValue(value.type) as FindingType
    const summary = stringValue(value.summary)
    const quote = stringValue(value.quote)
    if (!FINDING_TYPES.has(type) || !summary || !quote) return []
    const candidateId = stringValue(value.foreshadowId)
    if (candidateId && !allowedForeshadowIds.has(candidateId)) return []
    const foreshadowId = candidateId || undefined
    const parsedConfidence = typeof value.confidence === 'number' ? value.confidence : Number(value.confidence)
    const confidence = Number.isFinite(parsedConfidence) ? Math.min(1, Math.max(0, parsedConfidence)) : 0.5
    return [{ type, foreshadowId, summary, quote, confidence }]
  }) : []
  return {
    summary: stringValue(parsed.summary),
    keyEvents: Array.isArray(parsed.keyEvents)
      ? parsed.keyEvents.map(stringValue).filter(Boolean).slice(0, 12)
      : [],
    endingHook: stringValue(parsed.endingHook),
    findings,
  }
}

async function requestAnalysis(input: {
  baseUrl: string
  apiKey: string
  model: string
  userMessage: string
  signal?: AbortSignal
}): Promise<string> {
  if (!input.baseUrl.trim() || !input.apiKey.trim() || !input.model.trim() || input.model === 'unconfigured') {
    throw new Error('请先在 AI 配置中设置启用的 Provider、API Key 和分析模型')
  }
  const controller = new AbortController()
  const abort = () => controller.abort()
  input.signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 90_000)
  try {
    const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: CHAPTER_FLOW_SYSTEM_PROMPT },
          { role: 'user', content: input.userMessage },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`章节分析 API 请求失败（${response.status}）：${await response.text().catch(() => '')}`)
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content ?? ''
    if (!content.trim()) throw new Error('AI 返回内容为空')
    return content
  } finally {
    clearTimeout(timeout)
    input.signal?.removeEventListener('abort', abort)
  }
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof DOMException && error.name === 'AbortError')
}

function userMessage(ref: ChapterRef, title: string, chapter: string, foreshadows: Array<{ id: string; name: string; plannedResolutionChapter?: ChapterRef }>): string {
  const context = foreshadows.length === 0
    ? '（当前没有未回收的伏笔记录）'
    : foreshadows.map((entry) => `- ID: ${entry.id}\n  名称: ${entry.name}\n  计划回收: ${entry.plannedResolutionChapter ? `${entry.plannedResolutionChapter.volume} · ${entry.plannedResolutionChapter.chapterId}` : '未设置'}`).join('\n')
  return `章节引用：${ref.volume} · ${ref.chapterId}\n章节标题：${title}\n\n伏笔上下文（只能使用以下 ID）：\n${context}\n\n章节正文：\n${chapter.slice(0, CHAPTER_FLOW_CONTENT_LIMIT)}`
}

async function analyzeOne(projectId: string, ref: ChapterRef, signal?: AbortSignal): Promise<void> {
  const html = await getChapterContent(projectId, ref.volume, ref.chapterId)
  const normalized = normalizeChapterContent(html)
  const hash = await contentHash(html)
  const input = await buildChapterFlowAnalysisInput(projectId, ref, hash)
  await updateChapterFlowIndex(projectId, (index) => {
    const existing = findIndexItem(index, ref)
    const item = existing ?? { ref, status: 'missing' as const }
    item.contentHash = hash
    item.analysisInputHash = input.inputHash
    item.lastAttemptInputHash = input.inputHash
    item.lastAttemptedAt = new Date().toISOString()
    item.error = undefined
    if (!existing) index.chapters.push(item)
  })
  const raw = await requestAnalysis({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    userMessage: userMessage(ref, input.title, normalized, input.foreshadows),
    signal,
  })
  const result = parseAiChapterResult(raw, new Set(input.foreshadows.map((item) => item.id)))
  const generatedAt = new Date().toISOString()
  const sourceKey = chapterRefKey(ref)
  const baseFindings: ChapterFlowFinding[] = result.findings.flatMap((item): ChapterFlowFinding[] => {
    const quote = normalizeChapterContent(item.quote)
    if (!quote || !normalized.includes(quote)) return []
    return [{
      id: crypto.randomUUID(),
      type: item.type,
      foreshadowId: item.foreshadowId,
      source: ref,
      summary: item.summary,
      evidence: [{ chapter: ref, quote, contentHash: hash }],
      confidence: item.confidence,
      sourceContentHashes: { [sourceKey]: hash } as Record<ChapterKey, string>,
      generatedAt,
    }]
  })
  const detail: ChapterAnalysisDetail = {
    schemaVersion: 1,
    ref,
    contentHash: hash,
    analysisInputHash: input.inputHash,
    analyzedAt: generatedAt,
    summary: result.summary,
    keyEvents: result.keyEvents,
    endingHook: result.endingHook,
    findingIds: baseFindings.map((finding) => finding.id),
  }
  const crossFindings = await generateCrossChapterFindings({
    projectId,
    source: ref,
    sourceHash: hash,
    sourceText: normalized,
    sourceDetail: detail,
    sourceFindings: baseFindings,
    analysisInput: input,
    signal,
  })
  const findings = [...baseFindings, ...crossFindings]
  detail.findingIds = findings.map((finding) => finding.id)
  await Promise.all([
    writeChapterAnalysisDetail(projectId, detail),
    ...findings.map((finding) => writeChapterFlowFinding(projectId, finding)),
  ])
  let accepted = false
  let obsoleteFindingIds: string[] = []
  await updateChapterFlowIndex(projectId, (index) => {
    const existing = findIndexItem(index, ref)
    if (existing?.contentHash && existing.contentHash !== hash) return
    accepted = true
    obsoleteFindingIds = index.findings
      .filter((finding) => chapterRefKey(finding.source) === sourceKey)
      .map((finding) => finding.id)
    index.findings = index.findings.filter((finding) => !obsoleteFindingIds.includes(finding.id))
    index.findings.push(...findings.map((finding) => ({
      id: finding.id,
      type: finding.type,
      foreshadowId: finding.foreshadowId,
      source: finding.source,
      target: finding.target,
      summary: finding.summary,
      confidence: finding.confidence,
      evidenceCount: finding.evidence.length,
      sourceContentHashes: finding.sourceContentHashes,
      generatedAt: finding.generatedAt,
      status: 'ready' as const,
    })))
    const next = {
      ...(existing ?? { ref, status: 'missing' as const }),
      contentHash: hash,
      analysisInputHash: input.inputHash,
      analyzedInputHash: input.inputHash,
      lastAttemptInputHash: input.inputHash,
      lastAttemptedAt: generatedAt,
      analyzedAt: generatedAt,
      summary: detail.summary,
      error: undefined,
    }
    if (existing) Object.assign(existing, next)
    else index.chapters.push(next)
  })
  if (!accepted) {
    await deleteChapterFlowDetails(projectId, ref, findings.map((finding) => finding.id))
    return
  }
  if (obsoleteFindingIds.length > 0) {
    await deleteChapterFlowFindingDetails(projectId, obsoleteFindingIds)
  }
}

async function markFailure(projectId: string, ref: ChapterRef, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await updateChapterFlowIndex(projectId, (index) => {
    const existing = findIndexItem(index, ref)
    const item = existing ?? { ref, status: 'missing' as const }
    item.lastAttemptedAt = new Date().toISOString()
    item.lastAttemptInputHash = item.analysisInputHash
    item.error = message
    if (!existing) index.chapters.push(item)
  })
}

/** Runs in request order and never starts an AI call until the caller explicitly invokes it. */
export async function runChapterFlowAnalysis(
  projectId: string,
  refs: ChapterRef[],
  signal?: AbortSignal,
  onProgress?: (progress: ChapterFlowAnalysisProgress) => void,
): Promise<ChapterFlowAnalysisResult> {
  let completed = 0
  let succeeded = 0
  let failed = 0
  for (const ref of refs) {
    if (signal?.aborted) break
    onProgress?.({ completed, total: refs.length, succeeded, failed, current: ref })
    try {
      await queueChapterFlowOperation(projectId, ref, () => analyzeOne(projectId, ref, signal))
      completed += 1
      succeeded += 1
    } catch (error) {
      if (isAbort(error, signal)) break
      completed += 1
      failed += 1
      await queueChapterFlowOperation(projectId, ref, () => markFailure(projectId, ref, error))
    }
    onProgress?.({ completed, total: refs.length, succeeded, failed, current: ref })
  }
  return { completed, succeeded, failed, cancelled: Boolean(signal?.aborted) }
}
