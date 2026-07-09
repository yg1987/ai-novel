// src/services/brainstormService.ts
import { loadProviderConfig, listChapters, getChapterContent, readProjectFile } from '../api/tauri'
import { htmlToPlainText } from '../utils/htmlToText'

export type BrainstormMode = 'plot_twist' | 'scene_idea' | 'character_dev' | 'world_expand'

export interface BrainstormRequest {
  mode: BrainstormMode
  projectId: string
}

const MODE_PROMPTS: Record<BrainstormMode, string> = {
  plot_twist: `你是一个网文创意助手。根据以下项目信息，提供 3-5 个情节走向建议。
每个建议包含：情节点名称、具体描述（50-100字）、适用章节位置、预期效果。
建议要有新意但符合作品已有设定，不要推翻已有剧情。`,

  scene_idea: `你是一个网文场景创意助手。根据以下项目信息，提供 3-5 个具体的场景/桥段创意。
每个创意包含：场景名称、具体描写提示（50-100字）、可以插入的位置、配套的情绪氛围。
适合当前类型（玄幻/都市/言情等）的经典桥段 + 带新意的变体。`,

  character_dev: `你是一个角色发展创意助手。根据以下项目信息和角色状态，提供 3-5 个角色发展建议。
每个建议包含：涉及角色、发展方向、具体情节示例（50-100字）、为什么适合该角色。
考虑角色的当前状态、动机、未解伏笔。`,

  world_expand: `你是一个世界观扩展助手。根据以下世界观设定，提供 3-5 个世界观扩展方向。
每个方向包含：扩展主题、具体内容（50-100字）、与现有设定的衔接方式、可挖掘的剧情潜力。
不要与已有设定矛盾。`,
}

export interface BrainstormResult {
  title: string
  content: string
}

export async function runBrainstorm(
  request: BrainstormRequest,
): Promise<BrainstormResult[]> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) throw new Error('未配置 AI Provider')

  // Build context
  const contextParts: string[] = []

  // Project metadata
  try {
    const metaRaw = await readProjectFile(request.projectId, '', 'project.json')
    const meta = JSON.parse(metaRaw)
    contextParts.push(`项目名称：${meta.name || ''}\n类型：${meta.genre || ''}\n简介：${meta.description || ''}`)
  } catch { /* ignore */ }

  // Recent chapters (last 3)
  try {
    const chapters = await listChapters(request.projectId)
    const recent = [...chapters].sort((a, b) => b.order - a.order).slice(0, 3)
    const summaries: string[] = ['## 最近章节']
    for (const ch of recent) {
      const html = await getChapterContent(request.projectId, ch.volume, ch.id)
      const text = htmlToPlainText(html)
      summaries.push(`第${ch.order}章：${text.slice(0, 200)}`)
    }
    contextParts.push(summaries.join('\n'))
  } catch { /* ignore */ }

  // Character states (abbreviated)
  try {
    const cognitionRaw = await readProjectFile(request.projectId, 'memory', 'character-states.json')
    const cognition = JSON.parse(cognitionRaw)
    const charLines: string[] = ['## 角色状态']
    for (const c of cognition.characters || []) {
      charLines.push(`${c.character}：知道[${(c.knows || []).slice(0, 3).join(', ')}]，不知道[${(c.doesNotKnow || []).slice(0, 3).join(', ')}]`)
    }
    contextParts.push(charLines.join('\n'))
  } catch { /* ignore */ }

  // Unresolved foreshadowing
  try {
    const foreshadowRaw = await readProjectFile(request.projectId, 'memory', 'foreshadows.json')
    const store = JSON.parse(foreshadowRaw)
    const pending = (store.entries || []).filter((e: any) => e.status !== 'resolved' && e.status !== 'abandoned')
    if (pending.length > 0) {
      contextParts.push(`## 未解伏笔\n${pending.slice(0, 5).map((f: any) => `- ${f.name}：${f.description}`).join('\n')}`)
    }
  } catch { /* ignore */ }

  const modeLabel: Record<BrainstormMode, string> = {
    plot_twist: '情节走向',
    scene_idea: '场景创意',
    character_dev: '角色发展',
    world_expand: '世界观扩展',
  }

  const systemPrompt = MODE_PROMPTS[request.mode]
  const userMessage = contextParts.join('\n\n') || '（暂无项目数据）'

  const response = await fetch(`${provider.base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify({
      model: provider.models.analysis,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`Brainstorm API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const rawContent = data.choices?.[0]?.message?.content ?? ''

  // Split by numbered items
  const results: BrainstormResult[] = []
  const blocks = rawContent.split(/(?=\d+[\.、])/).filter((b) => b.trim().length > 20)
  for (const block of blocks) {
    const firstLine = block.trim().split('\n')[0] || ''
    results.push({
      title: firstLine.slice(0, 60),
      content: block.trim(),
    })
  }

  if (results.length === 0) {
    results.push({
      title: modeLabel[request.mode],
      content: rawContent,
    })
  }

  return results
}
