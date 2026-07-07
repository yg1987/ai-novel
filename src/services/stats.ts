import { appendStatEvent as apiAppend } from '../api/tauri'
import type { StatEvent } from '../api/tauri'

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
  const lastCount = lastChapterContent.get(key) ?? 0
  const delta = charCount - lastCount
  lastChapterContent.set(key, charCount)

  // Only log if there's a positive delta (or first save)
  if (delta <= 0 && lastCount > 0) return

  const wordCount = estimateWordCount(plainText)
  const event: StatEvent = {
    timestamp: new Date().toISOString(),
    event_type: 'chapter_saved',
    chapter,
    char_count: Math.max(delta, charCount), // first save: log full, subsequent: log delta
    word_count: wordCount,
  }
  apiAppend(projectId, event).catch(console.error)
}

export function logAIGenerated(
  projectId: string,
  chapter: number,
  durationMs: number,
  outputTokens?: number,
): void {
  const event: StatEvent = {
    timestamp: new Date().toISOString(),
    event_type: 'ai_generated',
    chapter,
    duration_ms: durationMs,
    output_tokens: outputTokens,
  }
  apiAppend(projectId, event).catch(console.error)
}

export function logSessionStart(projectId: string): void {
  const event: StatEvent = {
    timestamp: new Date().toISOString(),
    event_type: 'session_start',
  }
  apiAppend(projectId, event).catch(console.error)
}

function estimateWordCount(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const english = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length
  return chinese + english
}
