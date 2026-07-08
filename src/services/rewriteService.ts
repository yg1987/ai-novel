import { loadProviderConfig } from '../api/tauri'

export type RewriteMode = 'rewrite' | 'expand' | 'polish'

export interface RewriteRequest {
  selectedText: string
  beforeText: string   // 200 chars before selection
  afterText: string    // 200 chars after selection
  mode: RewriteMode
  styleContext?: string // optional style guide
}

export interface StreamCallbacks {
  onToken: (text: string) => void
  onDone: () => void
  onError: (error: string) => void
}

const MODE_PROMPTS: Record<RewriteMode, string> = {
  rewrite: '请改写以下段落。保持叙事风格一致，不改变情节推进和核心信息。修正表达问题。只输出改写后的段落。',
  expand: '请扩写以下段落。在原意基础上增加细节描写（环境、神态、动作、心理），字数扩展到原长的1.5-2倍。保持叙事节奏。只输出扩写后的段落。',
  polish: '请轻微润色以下段落。修正语法和表达问题，保持原意不变，尽可能少改动。只输出润色后的段落。',
}

let activeAbortController: AbortController | null = null

export function stopRewrite(): void {
  activeAbortController?.abort()
  activeAbortController = null
}

export async function rewriteText(
  request: RewriteRequest,
  callbacks: StreamCallbacks,
): Promise<void> {
  stopRewrite()

  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) {
    callbacks.onError('未配置 AI Provider')
    return
  }

  const controller = new AbortController()
  activeAbortController = controller

  const systemPrompt = `你是一个网文编辑助手。${MODE_PROMPTS[request.mode]}`
  const userMessage = [
    request.beforeText ? `【上文】\n${request.beforeText}\n---\n` : '',
    `【选中文本】\n${request.selectedText}\n---\n`,
    request.afterText ? `【下文】\n${request.afterText}\n---\n` : '',
    request.styleContext ? `【风格参考】\n${request.styleContext}` : '',
  ].filter(Boolean).join('\n')

  try {
    const response = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify({
        model: provider.models.writing,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      throw new Error(`API error ${String(response.status)}: ${text}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Response body is not readable')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') { callbacks.onDone(); return }
          try {
            const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
            const content = parsed.choices?.[0]?.delta?.content
            if (content) callbacks.onToken(content)
          } catch { /* skip malformed */ }
        }
      }
      callbacks.onDone()
    } finally {
      reader.releaseLock()
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') { callbacks.onDone(); return }
    callbacks.onError(String(e))
  } finally {
    activeAbortController = null
  }
}
