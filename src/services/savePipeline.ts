// src/services/savePipeline.ts
//
// Encapsulates all post-save side effects into a single pipeline.
// Editor.tsx calls runSavePipeline() — it no longer imports 8 individual services.
//
// Pipeline order (sequential, each step awaits the previous):
//   1. saveChapterContent    — persist HTML to filesystem
//   2. checkBannedWords      — synchronous AI-味 detection
//   3. logChapterSaved       — stats event log
//   4. chunk + embed + index — vector store upsert
//   5. runAndSaveLightCheck  — deterministic rule checks
//   6. runDeepReview         — AI consistency check (throttled)

import { saveChapterContent, vectorUpsertChunks } from '../api/tauri'
import { checkBannedWords, type CheckResult } from './bannedWords'
import { logChapterSaved } from './stats'
import { chunkMarkdown } from './textChunker'
import { embedChunks } from './embeddings'
import { runAndSaveLightCheck } from './reviewService'

// ─── Public types ─────────────────────────────────

export interface SavePipelineInput {
  projectId: string
  chapterId: string
  chapterNumber: number
  html: string
}

export interface SavePipelineResult {
  /** Banned-words check result (always present; synchronous) */
  bannedCheck: CheckResult
  /** Light-check outcome — null when chapter is too short (< 50 chars) */
  lightCheckResult: { passed: boolean; issues: number } | null
  /** Whether a deep AI review was triggered this save */
  deepReviewTriggered: boolean
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
    // Dynamic import keeps the top-level dependency graph light;
    // reviewService is only loaded when a deep review actually fires.
    const { runDeepReview } = await import('./reviewService')
    await runDeepReview(projectId, chapterId, html)
    return true
  } catch (e) {
    console.error('Auto deep review failed:', e)
    return false
  }
}

// ─── Public API ──────────────────────────────────

/**
 * Execute the full save pipeline.
 *
 * Steps run **sequentially** (each awaits the previous), which is a
 * deliberate simplification over the original fire-and-forget `.then()`
 * chain.  No functional outcome changes — all side effects are identical;
 * only the internal ordering of stats-logging vs. ingest vs. vector-index
 * is now deterministic instead of race-condition-dependent.
 *
 * Chapter **ingest** (AI analysis + memory sync) is intentionally NOT
 * part of this pipeline — it has its own UI state (`ingesting` spinner)
 * and is triggered separately by the caller.
 */
export async function runSavePipeline(input: SavePipelineInput): Promise<SavePipelineResult> {
  const { projectId, chapterId, chapterNumber, html } = input

  // 1. Persist chapter content to disk
  await saveChapterContent(projectId, chapterId, html)

  const plainText = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')

  // 2. Banned-words check (synchronous)
  const bannedCheck = checkBannedWords(plainText)

  // 3. Log stat event (fire-and-forget in original code; now awaited for determinism)
  logChapterSaved(projectId, chapterNumber, html)

  // 4. Vector indexing (only when content is substantial)
  if (plainText.trim().length > 100) {
    await indexChapterContent(projectId, chapterId, plainText)
  }

  // 5. Light check
  let lightCheckResult: SavePipelineResult['lightCheckResult'] = null
  if (plainText.trim().length > 50) {
    lightCheckResult = await performLightCheck(projectId, chapterId, html)
  }

  // 6. Auto deep review (throttled)
  const deepReviewTriggered = await maybeRunDeepReview(projectId, chapterId, html, plainText)

  return { bannedCheck, lightCheckResult, deepReviewTriggered }
}
