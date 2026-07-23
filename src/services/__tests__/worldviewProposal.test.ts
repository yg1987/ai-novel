import { describe, expect, it } from 'vitest'
import { parseWorldviewProposalResponse, worldviewProposalPrompt } from '../worldviewProposal'

const allowedTargets = [
  { sectionKey: 'world', fieldKey: 'rules' },
  { sectionKey: 'timeline' },
]

describe('parseWorldviewProposalResponse', () => {
  it('parses fenced JSON and filters proposals that target unknown fields', () => {
    const raw = `\n\`\`\`json
    {"schemaVersion":1,"mode":"fill_empty","summary":"补充核心规则","usedSources":[{"type":"project","label":"项目简介"}],"proposals":[
      {"target":{"sectionKey":"world","fieldKey":"rules"},"action":"fill_empty","content":"魔法需要媒介。","rationale":"补足限制","dependsOn":[],"conflicts":[]},
      {"target":{"sectionKey":"world","fieldKey":"unknown"},"action":"fill_empty","content":"不应写入","rationale":"无效目标","dependsOn":[],"conflicts":[]}
    ],"questions":[{"question":"媒介是否消耗？","whyNeeded":"决定规则代价","suggestedTarget":{"sectionKey":"world","fieldKey":"rules"}}]}
    \`\`\`
    `

    const result = parseWorldviewProposalResponse(raw, allowedTargets)
    expect(result.response.proposals).toHaveLength(1)
    expect(result.response.proposals[0]?.target).toEqual({ sectionKey: 'world', fieldKey: 'rules' })
    expect(result.response.questions[0]?.suggestedTarget).toEqual({ sectionKey: 'world', fieldKey: 'rules' })
    expect(result.ignored).toHaveLength(1)
  })

  it('repairs a response with surrounding commentary and keeps replacement conflicts', () => {
    const raw = `这里是提案：{"schemaVersion":1,"mode":"expand","summary":"时间线","usedSources":[],"proposals":[{"target":{"sectionKey":"timeline"},"action":"suggest_replace","content":"纪元二年：封印松动。","rationale":"补全转折","dependsOn":["world.rules"],"conflicts":[{"existingExcerpt":"纪元二年无事","explanation":"与新事件冲突"}]}],"questions":[]}`
    const result = parseWorldviewProposalResponse(raw, allowedTargets)
    expect(result.response.proposals[0]?.action).toBe('suggest_replace')
    expect(result.response.proposals[0]?.conflicts).toHaveLength(1)
  })

  it('rejects a response without any valid, locatable proposal', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      mode: 'fill_empty',
      summary: '无有效目标',
      usedSources: [],
      proposals: [{ target: { sectionKey: 'missing' }, action: 'fill_empty', content: 'x', rationale: 'x', dependsOn: [], conflicts: [] }],
      questions: [],
    })
    expect(() => parseWorldviewProposalResponse(raw, allowedTargets)).toThrow('有效提案')
  })

  it('accepts the minimal proposal shape when optional protocol fields are omitted', () => {
    const result = parseWorldviewProposalResponse(JSON.stringify({
      proposals: [{ target: { sectionKey: 'timeline' }, action: 'fill_empty', content: '纪元二年：封印松动。' }],
    }), allowedTargets)
    expect(result.response.summary).toContain('已生成')
    expect(result.response.proposals[0]?.dependsOn).toEqual([])
    expect(result.response.proposals[0]?.conflicts).toEqual([])
  })
})

describe('worldviewProposalPrompt', () => {
  it('restricts model output to the allowed targets and protocol', () => {
    const prompt = worldviewProposalPrompt(allowedTargets)
    expect(prompt).toContain('world/rules')
    expect(prompt).toContain('timeline')
    expect(prompt).toContain('suggest_replace')
  })
})
