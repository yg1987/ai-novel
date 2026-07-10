/**
 * CJK-aware character and word counting utilities.
 *
 * In Chinese web novel context, "字数" (word count) = Chinese characters + English words.
 * This is NOT the same as English "word count" (space-separated tokens).
 */

/**
 * Count Chinese characters + English words.
 *
 * Chinese characters: matches Unicode range \u4e00-\u9fff
 * English words: space-separated tokens containing at least one ASCII letter
 *
 * This matches the Rust backend's `count_words()` in `src-tauri/src/commands/version.rs`.
 */
export function estimateWordCount(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const english = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length
  return chinese + english
}

/**
 * Count only Chinese characters (for CJK-only display purposes).
 */
export function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length
}
