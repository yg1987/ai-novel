import { getChapterContent } from '../api/tauri'
import type { ChapterKey, ChapterRef } from '../types/chapter'
import { isRecord } from '../utils/unknown'
import type { ChapterFlowAnalysisInput } from './chapterFlowAnalysisInput'
import { chapterRefKey } from './chapterDisplay'
import { contentHash, normalizeChapterContent } from './chapterFlowHash'
import {
  readChapterAnalysisDetail,
  readChapterFlowIndex,
  resolveAnalysisStatus,
  type ChapterAnalysisDetail,
  type ChapterFlowFinding,
  type ChapterFlowFindingSummary,
} from './chapterFlowIndexStorage'

const CROSS_PROMPT = `你是小说跨章脉络核对助手。根据两个章节正文、已保存摘要和提供的伏笔 ID，判断它们是否存在可追溯的剧情呼应、推进或回收关系。
只输出 JSON：
{
  "related": true,
  "type": "possible-resolution | possible-advance | possible-continuation | record-conflict",
  "foreshadowId": "只能使用提供的伏笔 ID；无关联时省略",
  "summary": "简短判断",
  "sourceQuote": "必须逐字出现在来源章节正文的摘录",
  "targetQuote": "必须逐字出现在候选章节正文的摘录",
  "confidence": 0.0
}
没有明确的双端原文证据时 related 必须为 false。`

type FindingType = ChapterFlowFindingSummary['type']
const FINDING_TYPES = new Set<FindingType>(['possible-resolution', 'possible-advance', 'possible-continuation', 'record-conflict'])

interface CrossCandidate {
  ref: ChapterRef
  detail: ChapterAnalysisDetail
  contentHash: string
  sharedForeshadowIds: string[]
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const value = (fenced ?? raw).trim()
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start === -1 || end < start) throw new Error('AI 返回的跨章判断不是 JSON 对象')
  return JSON.parse(value.slice(start, end + 1))
}

function tokenSet(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase()
  const tokens = new Set((normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? []))
  const chinese = normalized.replace(/[^\u4e00-\u9fff]/g, '')
  for (let index = 0; index + 1 < chinese.length; index += 1) tokens.add(chinese.slice(index, index + 2))
  return tokens
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  let score = 0
  for (const token of left) if (right.has(token)) score += 1
  return score
}

async function requestCrossFinding(input: ChapterFlowAnalysisInput, userMessage: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 90_000)
  try {
    const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'system', content: CROSS_PROMPT }, { role: 'user', content: userMessage }],
        temperature: 0.1,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`跨章分析 API 请求失败（${response.status}）`)
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content ?? ''
    if (!content.trim()) throw new Error('AI 返回的跨章判断为空')
    return content
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

async function collectCandidates(
  projectId: string,
  source: ChapterRef,
  sourceDetail: ChapterAnalysisDetail,
  sourceFindings: ChapterFlowFinding[],
): Promise<CrossCandidate[]> {
  const indexResult = await readChapterFlowIndex(projectId)
  if (indexResult.kind !== 'ready') return []
  const sourceKey = chapterRefKey(source)
  const sourceIds = new Set(sourceFindings.map((finding) => finding.foreshadowId).filter((id): id is string => Boolean(id)))
  const sourceTokens = tokenSet([sourceDetail.summary, ...sourceDetail.keyEvents].join('\n'))
  const byRef = new Map<string, { ref: ChapterRef; score: number; ids: Set<string> }>()
  for (const finding of indexResult.index.findings) {
    if (finding.status !== 'ready' || chapterRefKey(finding.source) === sourceKey) continue
    const item = indexResult.index.chapters.find((chapter) => chapterRefKey(chapter.ref) === chapterRefKey(finding.source))
    if (!item || resolveAnalysisStatus(item) !== 'ready') continue
    const sharedId = finding.foreshadowId && sourceIds.has(finding.foreshadowId) ? finding.foreshadowId : undefined
    const score = (sharedId ? 100 : 0) + overlapScore(sourceTokens, tokenSet(finding.summary))
    if (score === 0) continue
    const candidate = byRef.get(chapterRefKey(finding.source)) ?? { ref: finding.source, score: 0, ids: new Set<string>() }
    candidate.score = Math.max(candidate.score, score)
    if (sharedId) candidate.ids.add(sharedId)
    byRef.set(chapterRefKey(finding.source), candidate)
  }
  const candidates = [...byRef.values()].sort((left, right) => right.score - left.score).slice(0, 3)
  return (await Promise.all(candidates.map(async (candidate) => {
    try {
      const [detail, item] = await Promise.all([
        readChapterAnalysisDetail(projectId, candidate.ref),
        Promise.resolve(indexResult.index.chapters.find((chapter) => chapterRefKey(chapter.ref) === chapterRefKey(candidate.ref))),
      ])
      if (!item?.contentHash) return null
      return { ref: candidate.ref, detail, contentHash: item.contentHash, sharedForeshadowIds: [...candidate.ids] }
    } catch {
      return null
    }
  }))).filter((candidate): candidate is CrossCandidate => candidate !== null)
}

function crossMessage(source: { ref: ChapterRef; detail: ChapterAnalysisDetail; text: string }, target: { ref: ChapterRef; detail: ChapterAnalysisDetail; text: string }, allowedIds: string[]): string {
  return `可用伏笔 ID：${allowedIds.join(', ') || '无'}\n\n来源章节：${source.ref.volume} · ${source.ref.chapterId}\n来源摘要：${source.detail.summary}\n来源关键事件：${source.detail.keyEvents.join('；')}\n来源正文：\n${source.text.slice(0, 12_000)}\n\n候选章节：${target.ref.volume} · ${target.ref.chapterId}\n候选摘要：${target.detail.summary}\n候选关键事件：${target.detail.keyEvents.join('；')}\n候选正文：\n${target.text.slice(0, 12_000)}`
}

/** Generates only a few evidence-backed candidate links; failures are local to one candidate. */
export async function generateCrossChapterFindings(input: {
  projectId: string
  source: ChapterRef
  sourceHash: string
  sourceText: string
  sourceDetail: ChapterAnalysisDetail
  sourceFindings: ChapterFlowFinding[]
  analysisInput: ChapterFlowAnalysisInput
  signal?: AbortSignal
}): Promise<ChapterFlowFinding[]> {
  if (!input.analysisInput.baseUrl.trim() || !input.analysisInput.apiKey.trim()) return []
  const candidates = await collectCandidates(input.projectId, input.source, input.sourceDetail, input.sourceFindings)
  const allowedIds = new Set(input.analysisInput.foreshadows.map((entry) => entry.id))
  const generatedAt = new Date().toISOString()
  const output: ChapterFlowFinding[] = []
  for (const candidate of candidates) {
    if (input.signal?.aborted) break
    try {
      const html = await getChapterContent(input.projectId, candidate.ref.volume, candidate.ref.chapterId)
      const targetText = normalizeChapterContent(html)
      const targetHash = await contentHash(html)
      if (targetHash !== candidate.contentHash) continue
      const parsed = extractJson(await requestCrossFinding(input.analysisInput, crossMessage(
        { ref: input.source, detail: input.sourceDetail, text: input.sourceText },
        { ref: candidate.ref, detail: candidate.detail, text: targetText },
        [...allowedIds],
      ), input.signal))
      if (!isRecord(parsed) || parsed.related !== true) continue
      const type = stringValue(parsed.type) as FindingType
      const summary = stringValue(parsed.summary)
      const sourceQuote = normalizeChapterContent(stringValue(parsed.sourceQuote))
      const targetQuote = normalizeChapterContent(stringValue(parsed.targetQuote))
      const foreshadowId = stringValue(parsed.foreshadowId)
      const confidenceValue = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence)
      if (!FINDING_TYPES.has(type) || !summary || !sourceQuote || !targetQuote || !input.sourceText.includes(sourceQuote) || !targetText.includes(targetQuote)) continue
      if (foreshadowId && !allowedIds.has(foreshadowId)) continue
      output.push({
        id: crypto.randomUUID(),
        type,
        foreshadowId: foreshadowId || undefined,
        source: input.source,
        target: candidate.ref,
        summary,
        evidence: [
          { chapter: input.source, quote: sourceQuote, contentHash: input.sourceHash },
          { chapter: candidate.ref, quote: targetQuote, contentHash: targetHash },
        ],
        confidence: Number.isFinite(confidenceValue) ? Math.min(1, Math.max(0, confidenceValue)) : 0.5,
        sourceContentHashes: {
          [chapterRefKey(input.source)]: input.sourceHash,
          [chapterRefKey(candidate.ref)]: targetHash,
        } as Record<ChapterKey, string>,
        generatedAt,
      })
    } catch (error) {
      if (input.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) break
    }
  }
  return output
}
