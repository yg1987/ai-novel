import { describe, expect, it } from 'vitest'
import { extractBrainstormResponseContent } from '../brainstormService'

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
})
