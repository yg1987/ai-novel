import { loadProviderConfig } from '../api/tauri'
import type { ProviderEntry } from '../types/provider'

export interface StreamCallbacks {
  onToken: (text: string) => void
  onDone: () => void
  onError: (error: string) => void
}

let activeAbortController: AbortController | null = null

export function stopGeneration(): void {
  activeAbortController?.abort()
  activeAbortController = null
}

export function isGenerating(): boolean {
  return activeAbortController !== null
}

export async function generateChapter(
  systemPrompt: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  // Stop any existing generation
  stopGeneration()

  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) {
    callbacks.onError('未配置 AI Provider')
    return
  }

  const controller = new AbortController()
  activeAbortController = controller

  try {
    await streamFromProvider(provider, systemPrompt, controller, callbacks)
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      // Generation was intentionally stopped
      callbacks.onDone()
      return
    }
    callbacks.onError(String(e))
  } finally {
    activeAbortController = null
  }
}

async function streamFromProvider(
  provider: ProviderEntry,
  systemPrompt: string,
  controller: AbortController,
  callbacks: StreamCallbacks,
): Promise<void> {
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
        { role: 'user', content: '请开始写作本章内容。' },
      ],
      stream: true,
      temperature: 0.8,
      max_tokens: 16384,
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
        if (data === '[DONE]') {
          callbacks.onDone()
          return
        }

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            callbacks.onToken(content)
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  callbacks.onDone()
}
