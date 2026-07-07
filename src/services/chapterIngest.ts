import { loadProviderConfig } from '../api/tauri'
import type { ChapterSnapshot } from '../types/novel'

/**
 * Analyze chapter content using the configured AI provider.
 * Extracts structured data: summary, characters, state changes, foreshadowing, timeline.
 */
export async function analyzeChapter(
  chapterNumber: number,
  chapterTitle: string,
  chapterContent: string,
  previousSnapshot?: ChapterSnapshot | null,
): Promise<ChapterSnapshot> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) {
    throw new Error('No AI provider configured')
  }

  const plainText = stripHtml(chapterContent)
  if (plainText.trim().length < 50) {
    // Skip analysis for empty/minimal chapters
    return createEmptySnapshot(chapterNumber, chapterTitle)
  }

  const systemPrompt = buildAnalysisPrompt(plainText, previousSnapshot)
  const result = await callAnalysisAPI(provider.base_url, provider.api_key, provider.models.analysis, systemPrompt)
  return parseAnalysisResult(result, chapterNumber, chapterTitle)
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function createEmptySnapshot(chapterNumber: number, chapterTitle: string): ChapterSnapshot {
  return {
    chapterNumber,
    chapterTitle,
    summary: '',
    characters: [],
    locations: [],
    items: [],
    characterStateChanges: [],
    relationshipChanges: [],
    knowledgeChanges: [],
    foreshadowingChanges: [],
    timelineEvents: [],
    endingHook: '',
  }
}

function buildAnalysisPrompt(text: string, previousSnapshot: ChapterSnapshot | null | undefined): string {
  const parts: string[] = [
    `你是一个小说章节分析器。分析以下章节内容，提取结构化信息。`,
    `只输出 JSON，不要解释。`,
    ``,
    `## 章节正文`,
    text.slice(0, 8000),
    ``,
  ]

  if (previousSnapshot) {
    parts.push(
      `## 上一章的状态（供参考连续性）`,
      `摘要: ${previousSnapshot.summary}`,
      `角色状态变化: ${previousSnapshot.characterStateChanges.join('; ')}`,
      `伏笔变化: ${previousSnapshot.foreshadowingChanges.join('; ')}`,
      `结尾钩子: ${previousSnapshot.endingHook}`,
      ``,
    )
  }

  parts.push(`## 输出 JSON 格式

{
  "summary": "200字以内的本章摘要",
  "characters": ["出场角色名列表"],
  "locations": ["涉及地点"],
  "items": ["涉及物品"],
  "characterStateChanges": [
    "角色名: 状态变化描述（心理/位置/实力等）"
  ],
  "relationshipChanges": [
    "角色A → 关系变化 → 角色B"
  ],
  "knowledgeChanges": [
    "角色名知道/发现了/意识到/得知 信息描述",
    "角色名不知道/没察觉 信息描述"
  ],
  "foreshadowingChanges": [
    "新增伏笔: 伏笔描述",
    "推进伏笔: 伏笔名称",
    "回收伏笔: 伏笔名称"
  ],
  "timelineEvents": ["时间推进或事件记录"],
  "endingHook": "本章末尾钩子/悬念",
  "qualityScore": 0-10的数字评分,
  "suggestions": ["改进建议列表"]
}`)

  return parts.join('\n')
}

async function callAnalysisAPI(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  // Use a shorter timeout for analysis (cheap model, quick task)
  const controller = new AbortController()
  const timeout = setTimeout(() => { controller.abort() }, 30000)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个章节分析器。只输出 JSON。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown')
      throw new Error(`Analysis API error ${String(response.status)}: ${errText}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content ?? ''
  } finally {
    clearTimeout(timeout)
  }
}

function parseAnalysisResult(
  raw: string,
  chapterNumber: number,
  chapterTitle: string,
): ChapterSnapshot {
  // Try to extract JSON from the response (handle markdown-wrapped JSON)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch?.[0] ?? raw

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    return {
      chapterNumber,
      chapterTitle,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      characters: arrayOrEmpty(parsed.characters),
      locations: arrayOrEmpty(parsed.locations),
      items: arrayOrEmpty(parsed.items),
      characterStateChanges: arrayOrEmpty(parsed.characterStateChanges),
      relationshipChanges: arrayOrEmpty(parsed.relationshipChanges),
      knowledgeChanges: arrayOrEmpty(parsed.knowledgeChanges),
      foreshadowingChanges: arrayOrEmpty(parsed.foreshadowingChanges),
      timelineEvents: arrayOrEmpty(parsed.timelineEvents),
      endingHook: typeof parsed.endingHook === 'string' ? parsed.endingHook : '',
      qualityScore: typeof parsed.qualityScore === 'number' ? parsed.qualityScore : undefined,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : undefined,
    }
  } catch {
    return createEmptySnapshot(chapterNumber, chapterTitle)
  }
}

function arrayOrEmpty(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String)
  return []
}
