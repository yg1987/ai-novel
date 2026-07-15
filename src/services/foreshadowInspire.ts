// src/services/foreshadowInspire.ts
// AI 驱动的卷级伏笔灵感分析 — 发现缺口、可呼应元素、密度问题

import { loadProviderConfig, listChapters, getChapterContent, readProjectFile, listProjectFiles } from '../api/tauri'
import { loadForeshadows } from './foreshadowStorage'
import { htmlToPlainText } from '../utils/htmlToText'
import type {
  ForeshadowInspiration,
  ForeshadowGapSuggestion,
  ForeshadowCallbackSuggestion,
  ForeshadowDensityAssessment,
} from '../types/novel'

export interface InspireRequest {
  projectId: string
  /** 要分析的卷名，"all" 表示全篇 */
  volume: string
}

const SYSTEM_PROMPT = `你是一个网文伏笔分析专家。你的任务是通读指定范围的所有章节，找出三类信息：

1. **缺口（gaps）**：哪些情节转折、能力提升、关系变化缺乏前期铺垫？在哪些章节适合加入伏笔？
2. **呼应（callbacks）**：文中出现了哪些未被充分利用的元素（物品、对白、场景描述），可以回收为伏笔推进？
3. **密度（density）**：哪些章节伏笔过多/过少？分布是否合理？

请严格按以下 JSON 格式输出（不要输出任何其他内容）：

{
  "gaps": [
    {
      "chapterRef": "第3章",
      "reason": "为什么这里缺伏笔",
      "suggestion": "怎么加伏笔",
      "relatedCharacters": ["角色A", "角色B"]
    }
  ],
  "callbacks": [
    {
      "sourceChapter": "第1章",
      "element": "已出现但未被利用的元素",
      "suggestion": "如何回收此元素",
      "relatedForeshadowId": "已有伏笔ID或null"
    }
  ],
  "density": {
    "hotChapters": ["第3章（7条）"],
    "coldChapters": ["第6章", "第7章"],
    "overallAssessment": "总体密度评价"
  },
  "summary": "总结性分析（100字以内）"
}

要求：
- 每条建议必须基于文本中的具体内容，不要凭空想象
- chapterRef 必须引用实际存在的章节
- relatedCharacters 只列与建议直接相关的角色
- 如果没有发现某类问题，返回空数组 []
- density 可以返回 null 如果分析范围太小不足以判断密度
- 伏笔建议应符合作品的已有设定，不要推翻已有剧情`

export async function runForeshadowInspire(
  request: InspireRequest,
): Promise<ForeshadowInspiration> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) throw new Error('未配置 AI Provider')

  // ── Build context ────────────────────────────

  const contextParts: string[] = []

  // Project metadata
  try {
    const metaRaw = await readProjectFile(request.projectId, '', 'project.json')
    const meta = JSON.parse(metaRaw)
    contextParts.push(`作品名称：${meta.name || ''}\n类型：${meta.genre || ''}\n简介：${meta.description || ''}`)
  } catch { /* ignore */ }

  // Chapters in the selected volume
  const allChapters = await listChapters(request.projectId)
  const targetChapters = request.volume === 'all'
    ? [...allChapters].sort((a, b) => a.order - b.order)
    : allChapters.filter((c) => c.volume === request.volume).sort((a, b) => a.order - b.order)

  if (targetChapters.length === 0) {
    throw new Error('所选范围没有章节')
  }

  // Build chapter summaries (not full text, to fit token budget)
  const chapterSummaries: string[] = []
  for (const ch of targetChapters) {
    try {
      const html = await getChapterContent(request.projectId, ch.volume, ch.id)
      const text = htmlToPlainText(html)
      // Send first 500 chars as summary context
      chapterSummaries.push(`## 第${ch.order}章 · ${ch.title}\n${text.slice(0, 500)}${text.length > 500 ? '...' : ''}`)
    } catch { /* skip unreadable chapters */ }
  }
  contextParts.push(`## 章节内容（共${targetChapters.length}章）\n${chapterSummaries.join('\n\n')}`)

  // Existing foreshadows
  try {
    const store = await loadForeshadows(request.projectId)
    if (store.entries.length > 0) {
      const lines = store.entries.map((e) =>
        `- [${e.status === 'resolved' ? '已回收' : e.status === 'abandoned' ? '已废弃' : '活跃'}] ${e.name}：${e.description}（${e.plantedChapterId}）关联角色: ${e.relatedCharacters.join(', ') || '无'}`
      )
      contextParts.push(`## 已有伏笔\n${lines.join('\n')}`)
    } else {
      contextParts.push('## 已有伏笔\n暂无伏笔记录')
    }
  } catch { /* ignore */ }

  // Character list
  try {
    const entries = await listProjectFiles(request.projectId, 'characters')
    const names = entries
      .filter((e) => e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/i, ''))
    if (names.length > 0) {
      contextParts.push(`## 角色列表\n${names.join('、')}`)
    }
  } catch { /* ignore */ }

  const userMessage = contextParts.join('\n\n') || '（暂无项目数据）'

  // ── Call AI ──────────────────────────────────

  const controller = new AbortController()
  const timeout = setTimeout(() => { controller.abort() }, 60000)

  try {
    const response = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify({
        model: provider.models.analysis,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 3072,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown')
      throw new Error(`Inspire API error ${String(response.status)}: ${errText}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const rawContent = data.choices?.[0]?.message?.content ?? ''
    return parseInspirationResult(rawContent)
  } finally {
    clearTimeout(timeout)
  }
}

// ── Parse ────────────────────────────────────

function parseInspirationResult(raw: string): ForeshadowInspiration {
  // Strip markdown code fences if present
  let jsonStr = raw
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1]!.trim()
  } else {
    // Try to extract JSON object from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    jsonStr = jsonMatch?.[0] ?? raw
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    const gaps: ForeshadowGapSuggestion[] = Array.isArray(parsed.gaps)
      ? parsed.gaps.map((g: any) => ({
        type: 'gap' as const,
        chapterRef: String(g.chapterRef || ''),
        reason: String(g.reason || ''),
        suggestion: String(g.suggestion || ''),
        relatedCharacters: Array.isArray(g.relatedCharacters) ? g.relatedCharacters.map(String) : [],
      }))
      : []

    const callbacks: ForeshadowCallbackSuggestion[] = Array.isArray(parsed.callbacks)
      ? parsed.callbacks.map((c: any) => ({
        type: 'callback' as const,
        sourceChapter: String(c.sourceChapter || ''),
        element: String(c.element || ''),
        suggestion: String(c.suggestion || ''),
        relatedForeshadowId: c.relatedForeshadowId && c.relatedForeshadowId !== 'null'
          ? String(c.relatedForeshadowId) : undefined,
      }))
      : []

    const density: ForeshadowDensityAssessment | null = parsed.density && typeof parsed.density === 'object'
      ? {
        type: 'density' as const,
        hotChapters: Array.isArray((parsed.density as any).hotChapters)
          ? (parsed.density as any).hotChapters.map(String) : [],
        coldChapters: Array.isArray((parsed.density as any).coldChapters)
          ? (parsed.density as any).coldChapters.map(String) : [],
        overallAssessment: String((parsed.density as any).overallAssessment || ''),
      }
      : null

    return {
      suggestions: [...gaps, ...callbacks, ...(density ? [density] : [])],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    }
  } catch {
    // If parsing fails, show raw output so user can see what AI returned
    return {
      suggestions: [{
        type: 'gap' as const,
        chapterRef: '',
        reason: 'AI 返回格式异常（未输出合法 JSON），以下是原始输出：',
        suggestion: jsonStr.slice(0, 800),
        relatedCharacters: [],
      }],
      summary: '解析失败，请重试。如反复出现，可尝试更换 AI 模型。',
    }
  }
}
