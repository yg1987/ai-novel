// src/services/savePipeline.ts
//
// Split into two independent operations:
//   - runSavePipeline  — pure save (persist + stats + vector index), no review
//   - runReview        — review only (banned words + light check + consistency + deep review)
//
// Save pipeline order (sequential):
//   1. saveChapterContent    — persist HTML to filesystem
//   2. logChapterSaved       — stats event log
//   3. chunk + embed + index — vector store upsert

import { vectorUpsertChunks, commitChapterVersion } from '../api/tauri'
import { checkBannedWords, type CheckResult } from './bannedWords'
import { loadReviewRules } from './reviewRules'
import { logChapterSaved } from './stats'
import { chunkMarkdown } from './textChunker'
import { embedChunks } from './embeddings'
import { runAndSaveLightCheck } from './reviewLightService'
import { runConsistencyChecks } from './consistencyCheck'

// ─── Public types ─────────────────────────────────

export interface SavePipelineInput {
  projectId: string
  volume: string
  chapterId: string
  chapterNumber: number
  html: string
}

export interface ReviewResult {
  bannedCheck: CheckResult
  lightCheckResult: { passed: boolean; issues: number } | null
  deepReviewTriggered: boolean
  consistencyIssues: number
}

// ─── Throttle state (module-level, survives re-renders) ──

const DEEP_REVIEW_INTERVAL_MS = 30 * 60 * 1000   // 30 min
const DEEP_REVIEW_SAVE_THRESHOLD = 5               // every 5 saves

const deepReviewThrottle = new Map<string, { count: number; lastTime: number }>()

// ─── Private helpers ──────────────────────────────

/** Step 4: Chunk plain-text chapter content, embed, and upsert to vector store. */
async function indexChapterContent(
  projectId: string,
  chapterId: string,
  plainText: string,
): Promise<void> {
  try {
    const chunks = chunkMarkdown(plainText, chapterId, { maxChunkChars: 1500 })
    const results = await embedChunks(chunks)
    if (results) {
      await vectorUpsertChunks(
        projectId,
        results.map((r) => ({
          chunk_id: r.chunk.chunkId,
          page_id: r.chunk.pageId,
          chunk_index: r.chunk.chunkIndex,
          heading_path: r.chunk.headingPath,
          chunk_text: r.chunk.content,
          embedding: Array.from(r.embedding),
        })),
      )
    }
  } catch (e) {
    console.error('Vector indexing failed:', e)
  }
}

/** Step 5: Run light check and save report. */
async function performLightCheck(
  projectId: string,
  chapterId: string,
  html: string,
): Promise<{ passed: boolean; issues: number } | null> {
  try {
    const result = await runAndSaveLightCheck(projectId, chapterId, html)
    return {
      passed: result.passed,
      issues: result.checks.reduce((sum, c) => sum + c.issues.length, 0),
    }
  } catch (e) {
    console.error('Light check failed:', e)
    return null
  }
}

/** Step 6: Optionally run deep review if throttle conditions are met.  */
async function maybeRunDeepReview(
  projectId: string,
  chapterId: string,
  html: string,
  plainText: string,
): Promise<boolean> {
  if (plainText.trim().length <= 200) return false
  if (chapterId.startsWith('new-')) return false

  const key = `${projectId}:${chapterId}`
  let throttle = deepReviewThrottle.get(key)
  if (!throttle) {
    throttle = { count: 0, lastTime: 0 }
    deepReviewThrottle.set(key, throttle)
  }
  throttle.count++

  const now = Date.now()
  const timeSinceLast = now - throttle.lastTime
  if (throttle.count < DEEP_REVIEW_SAVE_THRESHOLD && timeSinceLast < DEEP_REVIEW_INTERVAL_MS) {
    return false // throttle not yet tripped
  }

  throttle.count = 0
  throttle.lastTime = now

  try {
    const { runDeepReview } = await import('./reviewDeepService')
    await runDeepReview(projectId, chapterId, html)
    return true
  } catch (e) {
    console.error('Auto deep review failed:', e)
    return false
  }
}

// ─── Public API ──────────────────────────────────

/**
 * Execute the save pipeline — persist only, no review.
 */
export async function runSavePipeline(input: SavePipelineInput): Promise<void> {
  const { projectId, volume, chapterId, chapterNumber, html } = input

  // 1. Commit version snapshot + persist chapter content to disk
  await commitChapterVersion(projectId, volume, chapterId, html)

  const plainText = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')

  // 2. Log stat event
  logChapterSaved(projectId, chapterNumber, html)

  // 3. Vector indexing (only when content is substantial)
  if (plainText.trim().length > 100) {
    await indexChapterContent(projectId, chapterId, plainText)
  }
}

/**
 * Run review checks only — banned words, light check, deep review.
 * Does NOT save content. Call runSavePipeline separately for that.
 */
export async function runReview(input: SavePipelineInput): Promise<ReviewResult> {
  const { projectId, chapterId, html } = input
  const plainText = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')

  // Load project-level review rules
  const rules = await loadReviewRules(projectId)

  // Banned-words check (synchronous)
  const bannedCheck = checkBannedWords(plainText, rules.bannedWords)

  // Light check
  let lightCheckResult: ReviewResult['lightCheckResult'] = null
  if (plainText.trim().length > 50) {
    lightCheckResult = await performLightCheck(projectId, chapterId, html)
  }

  // Consistency check (deterministic, no AI cost)
  let consistencyIssues = 0
  if (plainText.trim().length > 50) {
    try {
      const charFiles = plainText.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]{2,4}/g) ?? []
      const result = await runConsistencyChecks(projectId, input.chapterId, charFiles, rules.consistency)
      consistencyIssues = result.summary.total
    } catch (e) { console.error('Consistency check failed:', e) }
  }

  // Deep review (throttled)
  const deepReviewTriggered = await maybeRunDeepReview(projectId, chapterId, html, plainText)

  return { bannedCheck, lightCheckResult, deepReviewTriggered, consistencyIssues }
}
