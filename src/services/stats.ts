import { appendStatEvent as apiAppend } from '../api/tauri'
import type { StatEvent } from '../api/tauri'
import { estimateWordCount } from '../utils/cjkCount'

const lastChapterContent = new Map<string, number>()

export function logChapterSaved(
  projectId: string,
  chapter: number,
  content: string,
): void {
  const plainText = content.replace(/<[^>]*>/g, '')
  const charCount = plainText.length

  // Compute delta: only count new chars since last save
  const key = `${projectId}:${chapter}`
  const lastCharCount = lastChapterContent.get(key) ?? 0
  const charDelta = charCount - lastCharCount
  lastChapterContent.set(key, charCount)

  // Only log if there's a positive delta (or first save)
  if (charDelta <= 0 && lastCharCount > 0) return

  // delta semantic: word_count = estimated new words
  // estimate delta word count from tail slice of delta chars
  const deltaPlainText = plainText.slice(lastCharCount)
  const deltaWordCount = estimateWordCount(deltaPlainText)

  const event: StatEvent = {
    timestamp: new Date().toISOString(),
    event_type: 'chapter_saved',
    chapter,
    char_count: Math.max(charDelta, charCount), // first save: full, subsequent: delta
    word_count: deltaWordCount,                 // ← always delta
    event_version: 1,                           // ← mark new semantic
  }
  apiAppend(projectId, event).catch(console.error)
}

export function logAIGenerated(
  projectId: string,
  chapter: number | null,
  durationMs: number,
  outputTokens?: number,
  details?: {
    feature?: string
    operation?: string
    inputTokens?: number
  },
): void {
  const event: StatEvent = {
    timestamp: new Date().toISOString(),
    event_type: 'ai_generated',
    chapter,
    duration_ms: durationMs,
    output_tokens: outputTokens,
    input_tokens: details?.inputTokens,
    feature: details?.feature,
    operation: details?.operation,
  }
  apiAppend(projectId, event).catch(console.error)
}

let sessionStartTime: number | null = null

export function logSessionStart(projectId: string): void {
  sessionStartTime = Date.now()
  const event: StatEvent = {
    timestamp: new Date().toISOString(),
    event_type: 'session_start',
  }
  apiAppend(projectId, event).catch(console.error)
}

export function logSessionEnd(projectId: string): void {
  if (sessionStartTime === null) return
  const durationMs = Date.now() - sessionStartTime
  sessionStartTime = null
  const event: StatEvent = {
    timestamp: new Date().toISOString(),
    event_type: 'session_end',
    duration_ms: Math.round(durationMs),
    event_version: 1,
  }
  apiAppend(projectId, event).catch(console.error)
}
