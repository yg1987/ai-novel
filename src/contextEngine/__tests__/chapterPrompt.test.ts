import { describe, expect, it } from 'vitest'
import {
  applyChapterPromptTemplate,
  buildChapterCompletionReviewMessage,
  CHAPTER_COMPLETION_MARKER,
  DEFAULT_CHAPTER_PROMPT,
} from '../chapterPrompt'

describe('chapter generation prompt', () => {
  it('uses the preferred +300 range and the +600 completion ceiling', () => {
    const prompt = applyChapterPromptTemplate(DEFAULT_CHAPTER_PROMPT, '场景甲\n场景乙', 2000, '')

    expect(prompt).toContain('2000 至 2300 字')
    expect(prompt).toContain('可放宽到 2600 字')
    expect(prompt).toContain('编号不是必要前提')
    expect(prompt).not.toContain('{previous_ending_section}')
  })

  it('keeps the previous ending and supports non-numbered outline content', () => {
    const prompt = applyChapterPromptTemplate(DEFAULT_CHAPTER_PROMPT, '主角得知真相，随后与同伴争执。', 2000, '门外传来脚步声。')

    expect(prompt).toContain('主角得知真相，随后与同伴争执。')
    expect(prompt).toContain('【前文结尾】\n门外传来脚步声。')
  })

  it('asks the completion pass to return a marker or prose only', () => {
    const message = buildChapterCompletionReviewMessage('正文片段', 1800, 2000)

    expect(message).toContain(CHAPTER_COMPLETION_MARKER)
    expect(message).toContain('节点可能没有编号')
    expect(message).toContain('2300 字')
    expect(message).toContain('2600 字')
  })
})
