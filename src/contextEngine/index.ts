import { getChapterOutline, getChapterContent } from '../api/tauri'

export interface ContextPack {
  systemPrompt: string
  wordBudget: number
}

export async function buildContext(
  projectId: string,
  chapterId: string,
  targetWords: number,
): Promise<ContextPack> {
  const outline = await getChapterOutline(projectId, chapterId)

  // Get previous chapter content (last ~500 chars as "ending")
  const chapterNum = Number(chapterId.replace('ch', ''))
  let previousEnding = ''
  if (chapterNum > 1) {
    const prevId = `ch${String(chapterNum - 1).padStart(3, '0')}`
    try {
      const prevContent = await getChapterContent(projectId, prevId)
      // Strip HTML tags and get last 500 chars
      const text = stripHtml(prevContent)
      previousEnding = text.slice(-500)
    } catch {
      // Previous chapter might not exist
    }
  }

  const systemPrompt = buildSystemPrompt(outline, previousEnding, targetWords)
  return { systemPrompt, wordBudget: targetWords }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function buildSystemPrompt(outline: string, previousEnding: string, targetWords: number): string {
  const parts: string[] = [
    '你是一位优秀的网络小说作家。请根据以下要求续写小说正文。',
    '',
    '## 写作要求',
    '- 只输出小说正文，不要添加任何解释、注释或元描述',
    '- 保持连贯的叙事风格',
    '- 注意章节之间的衔接',
    `- 本章目标字数约 ${String(targetWords)} 字`,
    '- 用自然段落分隔，段落之间用空行',
  ]

  if (outline) {
    parts.push('', '## 本章细纲', outline)
  }

  if (previousEnding) {
    parts.push('', '## 上一章结尾', previousEnding)
  }

  return parts.join('\n')
}
