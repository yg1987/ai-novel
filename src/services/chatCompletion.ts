import { isRecord } from '../utils/unknown'

function textFromContent(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value.flatMap((part) => {
    if (typeof part === 'string') return [part]
    if (!isRecord(part)) return []
    if (typeof part.text === 'string') return [part.text]
    if (isRecord(part.text) && typeof part.text.value === 'string') return [part.text.value]
    if (typeof part.content === 'string') return [part.content]
    return []
  }).join('').trim()
}

/** Extracts final assistant text from OpenAI-compatible and Responses-style payloads. */
export function extractAssistantText(payload: unknown): string {
  if (!isRecord(payload)) throw new Error('AI 返回了无法识别的响应结构')
  const outputText = textFromContent(payload.output_text)
  if (outputText) return outputText

  const choice = Array.isArray(payload.choices) && isRecord(payload.choices[0]) ? payload.choices[0] : null
  if (!choice) throw new Error('AI 响应中没有可用的候选结果')
  const message = isRecord(choice.message) ? choice.message : null
  const content = textFromContent(message?.content ?? choice.text)
  if (content) return content

  const reasoning = textFromContent(message?.reasoning_content ?? message?.reasoning)
  if (reasoning) throw new Error('AI 仅返回了思考内容，未返回可采纳的正文；请检查模型是否支持标准聊天完成输出')
  const finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : ''
  throw new Error(finishReason ? `AI 未返回正文（结束原因：${finishReason}）` : 'AI 未返回可采纳的正文')
}
