import { describe, expect, it } from 'vitest'
import { validateBrainstormRequest } from '../brainstormContext'
import type { BrainstormRequest } from '../../types/brainstorm'

function request(): BrainstormRequest {
  return {
    projectId: 'project-1',
    mode: 'scene_idea',
    problem: '',
    scope: { type: 'whole_project' },
    relatedCharacters: [],
    creativityLevel: 'balanced',
    desiredTone: '',
    mustKeep: [],
    avoid: [],
    resultCount: 4,
    enabledContextSources: [],
  }
}

describe('validateBrainstormRequest', () => {
  it('rejects oversized content input before a provider request', () => {
    const value = request()
    value.problem = 'x'.repeat(1001)
    expect(validateBrainstormRequest(value)).toBe('当前问题最多 1000 个字符')
  })

  it('rejects empty selected chapters and duplicate chapter refs', () => {
    const empty = request()
    empty.scope = { type: 'selected_chapters', chapters: [] }
    expect(validateBrainstormRequest(empty)).toBe('请至少选择一个章节')

    const duplicate = request()
    duplicate.scope = {
      type: 'selected_chapters',
      chapters: [
        { volume: '第一卷', chapterId: 'ch001', chapterTitle: '第一章' },
        { volume: '第一卷', chapterId: 'ch001', chapterTitle: '第一章' },
      ],
    }
    expect(validateBrainstormRequest(duplicate)).toBe('指定章节不能重复')
  })

  it('requires exactly two parent ideas for combination', () => {
    const value = request()
    value.derivation = {
      operation: 'combine',
      parentSessionId: 'session-1',
      parentIdeaIds: ['idea-1'],
      feedback: '',
    }
    expect(validateBrainstormRequest(value)).toBe('组合灵感必须选择两条建议')
  })

  it('requires feedback when redoing an idea', () => {
    const value = request()
    value.derivation = {
      operation: 'redo_with_feedback',
      parentSessionId: 'session-1',
      parentIdeaIds: ['idea-1'],
      feedback: '   ',
    }
    expect(validateBrainstormRequest(value)).toBe('请填写不满意的原因')
  })
})
