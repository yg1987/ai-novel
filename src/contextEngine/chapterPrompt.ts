/**
 * Shared chapter-generation prompt. Keeping the editable default and the
 * runtime default together prevents the UI from showing rules that the model
 * never receives.
 */
export const DEFAULT_CHAPTER_PROMPT = `重要：不要输出章节标题！

你是一位网文作家。请根据本章大纲续写小说正文。

## 本章大纲
{outline}

【完成优先级】
本章大纲可能是编号列表、项目符号、自然段、人物事件、场景描述，或它们的混合；编号不是必要前提。先在内部按大纲原有的出现顺序识别所有独立的情节节点、场景、人物行动与结果，并分配篇幅。不要输出这份计划或清单。

【硬性要求 — 违反则不合格】
1. 必须按大纲原有顺序推进，完整覆盖全部情节节点；禁止跳过、合并到只剩一句概述，或为了尽快结尾而遗漏后续人物/事件。
2. 每个节点都要写成实际发生的正文：交代人物行动、冲突或变化，并用必要的对话、反应和转场把场景连起来；不要把大纲复述成摘要。
3. 在所有节点完成前不得收束本章。临近预期篇幅仍有节点未写时，压缩已写或后续场景的篇幅，但不得删掉节点。
4. 结尾必须落在完整的句子和完整的场景/情节结果上，自然承接下一章；禁止断在半句话、半场戏或未处理完的当前事件中。
5. 正常情况下应达到 {word_count} 字。优先在 {word_count} 至 {word_count_high} 字内完成；若完成全部节点并自然收束确实需要更多篇幅，可放宽到 {word_count_hard_max} 字。不得为了凑字重复、空泛抒情或拖延情节。
6. 写完后先在内部复核：所有从大纲中识别出的节点均已按序完成，且结尾完整，再输出正文。
{previous_ending_section}

【格式】
输出纯文本正文（无标题、无说明、无 Markdown），段首空两格，段落自然换行。`

/** Replace variables in a saved chapter prompt at generation time. */
export function applyChapterPromptTemplate(
  template: string,
  outline: string,
  wordCount: number,
  previousEnding: string,
): string {
  const targetWords = Math.max(0, Math.round(wordCount))
  return template
    .replace(/\{outline\}/g, outline || '（无大纲）')
    .replace(/\{word_count_hard_max\}/g, String(targetWords + 600))
    .replace(/\{word_count_high\}/g, String(targetWords + 300))
    .replace(/\{word_count\}/g, String(targetWords))
    .replace(/\{previous_ending\}/g, previousEnding || '（无）')
    .replace(/\{previous_ending_section\}/g, previousEnding
      ? '\n【前文结尾】\n{previous_ending}'.replace(/\{previous_ending\}/g, previousEnding)
      : '')
}

export const CHAPTER_COMPLETION_MARKER = '[[CHAPTER_COMPLETE]]'

/**
 * Ask for a second, cheap pass after streaming the initial draft. The model
 * either confirms the outline is complete or supplies only the missing prose.
 */
export function buildChapterCompletionReviewMessage(
  generatedText: string,
  generatedWords: number,
  targetWords: number,
): string {
  return `请对刚刚生成的本章正文做一次静默完整性复核。大纲中的节点可能没有编号；请仍按大纲原有顺序检查所有场景、人物行动、事件结果是否已经写到，并检查结尾是否是完整、自然收束的场景。

刚生成的正文（约 ${String(generatedWords)} 字）：
---
${generatedText}
---

目标字数为 ${String(targetWords)} 字，优先范围到 ${String(targetWords + 300)} 字；为完成全部节点并自然收束可到 ${String(targetWords + 600)} 字。完整性和自然结尾优先于字数，不能靠重复或无意义扩写凑字。

若所有节点均已完成且结尾完整，只输出 ${CHAPTER_COMPLETION_MARKER}。否则只从现有正文最后一句继续写，补齐遗漏节点并自然结束；不要重复已有内容、不要解释、不要输出标题或任何标记。`
}
