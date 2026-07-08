import { loadProviderConfig } from '../api/tauri'

export interface ClassificationResult {
  suggested_category: string
  tags: string[]
}

/** AI-suggest category and tags for resource content. Non-streaming. */
export async function suggestCategory(content: string): Promise<ClassificationResult | null> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) return null

  const text = content.replace(/<[^>]*>/g, '').trim().slice(0, 2000)

  const response = await fetch(`${provider.base_url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.api_key}` },
    body: JSON.stringify({
      model: provider.models.analysis,
      messages: [
        { role: 'system', content: '你是一个写作素材分类助手。分析以下素材内容，建议分类（描写库/灵感簿/知识笔记/摘抄/角色设定/世界观架构）和标签。只输出JSON。' },
        { role: 'user', content: `素材内容：\n${text}\n\n输出JSON格式：{"suggested_category": "...", "tags": ["tag1", "tag2"]}` },
      ],
      temperature: 0.3,
      max_tokens: 256,
    }),
  })

  if (!response.ok) return null

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? ''
  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
    return JSON.parse(jsonStr) as ClassificationResult
  } catch {
    return null
  }
}

/** AI expand/polish resource content. Streaming. */
export async function expandResource(
  content: string,
  mode: 'expand' | 'polish',
  onToken: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) { onError('未配置 AI Provider'); return }

  const modePrompt = mode === 'expand'
    ? '请扩写以下素材。在原文基础上增加细节、例子和深度，扩展到原长的 1.5-2 倍。保持原有风格。只输出扩写后的内容。'
    : '请润色以下素材。修正表达问题，优化措辞，保持原意不变。只输出润色后的内容。'

  try {
    const response = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.api_key}` },
      body: JSON.stringify({
        model: provider.models.writing,
        messages: [
          { role: 'system', content: `你是一个写作素材编辑助手。${modePrompt}` },
          { role: 'user', content: `素材内容：\n${content}` },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    })

    if (!response.ok) { onError(`API error ${response.status}`); return }

    const reader = response.body?.getReader()
    if (!reader) { onError('Response body not readable'); return }

    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t || !t.startsWith('data: ')) continue
        const d = t.slice(6)
        if (d === '[DONE]') { onDone(); return }
        try {
          const parsed = JSON.parse(d) as { choices?: Array<{ delta?: { content?: string } }> }
          const c = parsed.choices?.[0]?.delta?.content
          if (c) onToken(c)
        } catch { /* skip */ }
      }
    }
    onDone()
  } catch (e) {
    if ((e as Error).name === 'AbortError') { onDone(); return }
    onError(String(e))
  }
}
