import { loadProviderConfig } from '../api/tauri'
import { buildBrainstormContext, buildBrainstormUserInstructions } from './brainstormContext'
import { parseBrainstormResponse } from './brainstormParser'
import type { BrainstormGenerationResult, BrainstormIdea, BrainstormMode, BrainstormRequest } from '../types/brainstorm'
import { asNumber, asString, isRecord } from '../utils/unknown'

export type { BrainstormMode, BrainstormRequest } from '../types/brainstorm'

const REQUEST_TIMEOUT_MS = 60_000

const MODE_PROMPTS: Record<BrainstormMode, string> = {
  plot_twist: '围绕因果、悬念与节奏，给出接下来可发展的情节方向。',
  scene_idea: '给出能实际写入章节的具体场景和桥段，不要只给泛泛剧情。',
  character_dev: '围绕角色动机、认知与关系变化提出发展方案，不要虚构未提供的角色事实。',
  world_expand: '在已有世界观的基础上补全设定，并说明它可以服务的剧情冲突。',
}

function buildSystemPrompt(mode: BrainstormMode, resultCount: number): string {
  return `你是小说创作中的灵感助手。${MODE_PROMPTS[mode]}
所有建议都是候选，必须尊重已提供的项目事实；不确定的连接请明确写入风险。
只返回合法 JSON，不要 Markdown 代码围栏，不要输出解释文字。
返回格式：
{
  "summary": "本轮建议的总体取向",
  "ideas": [{
    "title": "简短标题",
    "summary": "核心方向",
    "developmentSteps": ["步骤 1", "步骤 2"],
    "suggestedLocation": { "chapterLabel": "可引用的章节标签或空字符串", "positionNote": "推荐插入位置" },
    "whyItFits": "与当前项目的连接依据",
    "connections": [{ "type": "character|worldview|outline|foreshadow|chapter", "label": "已提供实体标签", "reason": "连接原因" }],
    "risks": ["潜在冲突或需要确认的事实"],
    "hooks": ["可利用的悬念、人物或设定"]
  }]
}
严格返回 ${resultCount} 条建议。`
}

function joinAbortSignals(signal: AbortSignal | undefined): { controller: AbortController; dispose: () => void } {
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  if (signal?.aborted) {
    controller.abort()
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true })
  }
  return {
    controller,
    dispose: () => signal?.removeEventListener('abort', abortFromCaller),
  }
}

function parseUsage(data: unknown): { inputTokens?: number; outputTokens?: number } {
  if (!isRecord(data) || !isRecord(data.usage)) return {}
  const inputTokens = asNumber(data.usage.prompt_tokens, 0)
  const outputTokens = asNumber(data.usage.completion_tokens, 0)
  return {
    inputTokens: inputTokens > 0 ? inputTokens : undefined,
    outputTokens: outputTokens > 0 ? outputTokens : undefined,
  }
}

function contentText(value: unknown): string {
  const direct = asString(value).trim()
  if (direct) return direct
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join('\n')
  if (!isRecord(value)) return ''
  const text = asString(value.text).trim()
  if (text) return text
  if (isRecord(value.text)) {
    const nested = asString(value.text.value).trim()
    if (nested) return nested
  }
  return asString(value.content).trim()
}

export function extractBrainstormResponseContent(data: unknown): string {
  if (!isRecord(data)) return ''
  if (Array.isArray(data.choices)) {
    const firstChoice: unknown = data.choices[0]
    if (isRecord(firstChoice)) {
      if (isRecord(firstChoice.message)) {
        const messageContent = contentText(firstChoice.message.content)
        if (messageContent) return messageContent
      }
      const legacyContent = contentText(firstChoice.text)
      if (legacyContent) return legacyContent
    }
  }
  return contentText(data.output_text)
}

function providerFailureMessage(status: number): string {
  if (status === 401 || status === 403) return 'AI 服务认证失败，请检查 API Key 和模型权限'
  if (status === 429) return 'AI 服务当前请求过多，请稍后重试'
  if (status >= 500) return 'AI 服务暂时不可用，请稍后重试'
  return `AI 服务未能完成本次请求（HTTP ${status}），请检查模型配置后重试`
}

function formatParentIdeas(ideas: BrainstormIdea[]): string {
  if (ideas.length === 0) return ''
  return ideas.map((idea, index) => [
    `## 来源建议 ${index + 1}：${idea.title}`,
    `核心方向：${idea.summary}`,
    `展开方式：${idea.developmentSteps.join('；')}`,
    `适配依据：${idea.whyItFits}`,
    `风险：${idea.risks.join('；')}`,
  ].join('\n')).join('\n\n')
}

export async function runBrainstorm(
  request: BrainstormRequest,
  parentIdeas: BrainstormIdea[] = [],
): Promise<BrainstormGenerationResult> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((item) => item.name === config.active_profile)
  if (!provider) throw new Error('未配置 AI Provider')
  if (!provider.base_url.trim()) throw new Error('未配置 AI Provider 地址，请在 AI 配置中设置')
  if (!provider.api_key.trim()) throw new Error('未配置 AI Provider API Key，请在 AI 配置中设置')
  if (!provider.models.analysis.trim()) throw new Error('未配置分析模型，请在 AI 配置中设置')

  const context = await buildBrainstormContext(request)
  const allowedLabels = context.allowedEntities.map((entity) => `- ${entity.type}: ${entity.label}`).join('\n') || '（没有可验证实体）'
  const userMessage = [
    '# 作者目标',
    buildBrainstormUserInstructions(request),
    '',
    '# 项目上下文',
    context.text || '（暂无可用项目上下文）',
    '',
    '# 可引用实体',
    allowedLabels,
    parentIdeas.length > 0 ? '# 来源建议（请在此基础上推演，不要覆盖原建议）' : '',
    formatParentIdeas(parentIdeas),
  ].join('\n')

  const { controller, dispose } = joinAbortSignals(request.signal)
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const startedAt = performance.now()

  let response: Response
  try {
    const baseUrl = provider.base_url.replace(/\/+$/, '')
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify({
        model: provider.models.analysis,
        messages: [
          { role: 'system', content: buildSystemPrompt(request.mode, request.resultCount) },
          { role: 'user', content: userMessage },
        ],
        temperature: request.creativityLevel === 'safe' ? 0.45 : request.creativityLevel === 'bold' ? 1 : 0.75,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })
  } catch {
    if (timedOut) throw new Error('生成灵感超时，请稍后重试')
    if (controller.signal.aborted) throw new Error('已取消灵感生成')
    throw new Error('无法连接 AI 服务，请检查网络和服务地址后重试')
  } finally {
    window.clearTimeout(timeoutId)
    dispose()
  }

  if (!response.ok) {
    await response.text()
    throw new Error(providerFailureMessage(response.status))
  }

  let data: unknown
  try {
    data = await response.json() as unknown
  } catch {
    throw new Error('AI 服务返回了无法识别的数据，请重试')
  }
  const rawContent = extractBrainstormResponseContent(data)
  if (!rawContent) throw new Error('AI 服务未返回可用的建议内容，请确认分析模型支持聊天补全和 JSON 输出')
  const responseData = parseBrainstormResponse(rawContent, request, context.allowedEntities)
  const usage = parseUsage(data)
  return {
    response: responseData,
    contextManifest: context.manifest,
    contextWarnings: context.warnings,
    generation: {
      promptVersion: 1,
      providerName: provider.name,
      model: provider.models.analysis,
      durationMs: Math.round(performance.now() - startedAt),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  }
}
