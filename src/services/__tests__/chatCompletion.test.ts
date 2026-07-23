import { describe, expect, it } from 'vitest'
import { extractAssistantText } from '../chatCompletion'

describe('extractAssistantText', () => {
  it('reads normal string and content-part responses', () => {
    expect(extractAssistantText({ choices: [{ message: { content: '正文' } }] })).toBe('正文')
    expect(extractAssistantText({ choices: [{ message: { content: [{ type: 'text', text: '分段' }, { type: 'text', text: '正文' }] } }] })).toBe('分段正文')
  })

  it('explains reasoning-only and empty responses', () => {
    expect(() => extractAssistantText({ choices: [{ message: { reasoning_content: '思考' } }] })).toThrow('仅返回了思考内容')
    expect(() => extractAssistantText({ choices: [{ finish_reason: 'length', message: { content: null } }] })).toThrow('结束原因：length')
  })
})
