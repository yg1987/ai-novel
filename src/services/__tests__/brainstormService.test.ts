import { describe, expect, it } from 'vitest'
import { brainstormOutputTokenBudget, extractBrainstormResponseContent } from '../brainstormService'

describe('extractBrainstormResponseContent', () => {
  it('reads standard and segmented OpenAI-compatible message content', () => {
    expect(extractBrainstormResponseContent({
      choices: [{ message: { content: '{"ideas":[]}' } }],
    })).toBe('{"ideas":[]}')

    expect(extractBrainstormResponseContent({
      choices: [{ message: { content: [{ type: 'text', text: '{"ideas":' }, { type: 'text', text: '[]}' }] } }],
    })).toBe('{"ideas":\n[]}')
  })

  it('falls back to legacy choice text and output_text', () => {
    expect(extractBrainstormResponseContent({ choices: [{ text: '{"ideas":[]}' }] })).toBe('{"ideas":[]}')
    expect(extractBrainstormResponseContent({ output_text: '{"ideas":[]}' })).toBe('{"ideas":[]}')
  })

  it('reads structured message content and tool arguments', () => {
    expect(extractBrainstormResponseContent({
      choices: [{ message: { content: { summary: '', ideas: [] } } }],
    })).toBe('{"summary":"","ideas":[]}')
    expect(extractBrainstormResponseContent({
      choices: [{ message: { content: '', tool_calls: [{ function: { arguments: '{"ideas":[]}' } }] } }],
    })).toBe('{"ideas":[]}')
  })

  it('scales output budget for detailed multi-idea responses', () => {
    expect(brainstormOutputTokenBudget(3)).toBe(4096)
    expect(brainstormOutputTokenBudget(6)).toBe(6144)
  })
})
