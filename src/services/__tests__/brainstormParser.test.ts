import { describe, expect, it } from 'vitest'
import { parseBrainstormResponse } from '../brainstormParser'
import type { BrainstormRequest } from '../../types/brainstorm'

const request: BrainstormRequest = {
  projectId: 'project-1',
  mode: 'plot_twist',
  problem: '',
  scope: { type: 'whole_project' },
  relatedCharacters: [],
  creativityLevel: 'balanced',
  desiredTone: '',
  mustKeep: [],
  avoid: [],
  resultCount: 3,
  enabledContextSources: [],
}

const allowed = [
  { type: 'character' as const, entityId: 'lin-ye', label: '林烬' },
  { type: 'chapter' as const, entityId: 'vol1:ch001', volume: 'vol1', chapterId: 'ch001', label: '第一卷 · 第 1 章《初醒》' },
]

describe('parseBrainstormResponse', () => {
  it('creates application ids and verifies only known entities', () => {
    const response = parseBrainstormResponse(JSON.stringify({
      summary: '以身份伏笔推动后续。',
      ideas: [{
        title: '宴会试探',
        summary: '通过称谓错误推进身份伏笔。',
        developmentSteps: ['进入宴会', '旧臣失言'],
        suggestedLocation: { chapterLabel: '第一卷 · 第 1 章《初醒》', positionNote: '大战后的休整段落' },
        whyItFits: '可以让节奏回落而不丢失悬念。',
        connections: [
          { type: 'character', label: '林烬', reason: '承担反应视角' },
          { type: 'character', label: '不存在的人', reason: '不应获得跳转能力' },
        ],
        risks: ['需确认旧臣是否已出场'],
        hooks: ['身份伏笔'],
      }],
    }), request, allowed)

    expect(response.ideas[0]?.id).toBeTruthy()
    expect(response.ideas[0]?.suggestedLocation).toMatchObject({ volume: 'vol1', chapterId: 'ch001', verified: true })
    expect(response.ideas[0]?.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '林烬', entityId: 'lin-ye', verified: true }),
      expect.objectContaining({ label: '不存在的人', verified: false }),
    ]))
  })

  it('accepts a JSON code fence but rejects incomplete results', () => {
    const wrapped = '```json\n{"summary":"","ideas":[{"title":"x","summary":"y","developmentSteps":[],"suggestedLocation":{"chapterLabel":"","positionNote":""},"whyItFits":"z","connections":[],"risks":[],"hooks":[]}]}\n```'
    expect(parseBrainstormResponse(wrapped, request, allowed).ideas).toHaveLength(1)
    expect(() => parseBrainstormResponse('{"ideas":[{}]}', request, allowed)).toThrow('不完整')
  })

  it('extracts JSON when a compatible provider adds surrounding text', () => {
    const raw = '以下是建议：\n{"summary":"","ideas":[{"title":"x","summary":"y","developmentSteps":[],"suggestedLocation":{"chapterLabel":"","positionNote":""},"whyItFits":"z","connections":[],"risks":[],"hooks":[]}]}\n请查收。'
    expect(parseBrainstormResponse(raw, request, allowed).ideas).toHaveLength(1)
  })

  it('repairs common provider JSON defects without inventing missing ideas', () => {
    const idea = '{title:"x",summary:"y",developmentSteps:[],suggestedLocation:{chapterLabel:"",positionNote:""},whyItFits:"z",connections:[],risks:[],hooks:[],}'
    expect(parseBrainstormResponse(`{summary:"",ideas:[${idea}],}`, request, allowed).ideas).toHaveLength(1)
    expect(parseBrainstormResponse(`{"summary":"","ideas":[${idea}]`, request, allowed).ideas).toHaveLength(1)
  })

  it('accepts double-encoded JSON and a top-level ideas array', () => {
    const idea = {
      title: 'x', summary: 'y', developmentSteps: [],
      suggestedLocation: { chapterLabel: '', positionNote: '' },
      whyItFits: 'z', connections: [], risks: [], hooks: [],
    }
    const objectJson = JSON.stringify({ summary: '', ideas: [idea] })
    expect(parseBrainstormResponse(JSON.stringify(objectJson), request, allowed).ideas).toHaveLength(1)
    expect(parseBrainstormResponse(JSON.stringify([idea]), request, allowed).ideas).toHaveLength(1)
  })

  it('records source idea ids on a derived result', () => {
    const derivedRequest: BrainstormRequest = {
      ...request,
      derivation: {
        operation: 'deepen',
        parentSessionId: 'session-1',
        parentIdeaIds: ['idea-1'],
        feedback: '',
      },
    }
    const raw = JSON.stringify({
      summary: '',
      ideas: [{
        title: '深化宴会试探',
        summary: '让旧臣的称谓错误引出更直接的冲突。',
        developmentSteps: [],
        suggestedLocation: { chapterLabel: '', positionNote: '' },
        whyItFits: '承接来源建议。',
        connections: [],
        risks: [],
        hooks: [],
      }],
    })

    expect(parseBrainstormResponse(raw, derivedRequest, allowed).ideas[0]?.parentIdeaIds).toEqual(['idea-1'])
  })
})
