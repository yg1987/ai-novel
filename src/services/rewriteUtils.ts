// src/services/rewriteUtils.ts
// Shared utilities for textarea-based AI rewrite/expand/polish.

export interface TextareaSelection {
  start: number
  end: number
  selectedText: string
  beforeText: string
  afterText: string
}

/**
 * Get the current textarea selection with surrounding context.
 * Returns null when there's no text selected.
 */
export function getTextareaSelection(
  textarea: HTMLTextAreaElement | null,
  fullContent: string,
): TextareaSelection | null {
  if (!textarea) return null
  const { selectionStart, selectionEnd } = textarea
  if (selectionStart === null || selectionEnd === null) return null
  if (selectionStart === selectionEnd) return null
  const start = selectionStart
  const end = selectionEnd
  const selectedText = fullContent.slice(start, end)
  if (!selectedText.trim()) return null
  const beforeText = fullContent.slice(Math.max(0, start - 200), start)
  const afterText = fullContent.slice(end, Math.min(fullContent.length, end + 200))
  return { start, end, selectedText, beforeText, afterText }
}

/**
 * Replace the selected range with new text (for textarea content).
 */
export function applyTextareaRewrite(
  fullContent: string,
  start: number,
  end: number,
  newText: string,
): string {
  return fullContent.slice(0, start) + newText + fullContent.slice(end)
}
