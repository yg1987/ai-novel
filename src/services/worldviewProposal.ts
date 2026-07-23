import { jsonrepair } from 'jsonrepair'
import { isRecord } from '../utils/unknown'

export type WorldviewProposalAction = 'fill_empty' | 'suggest_append' | 'suggest_replace'

export interface WorldviewProposalTarget {
  sectionKey: string
  fieldKey?: string
}

export interface WorldviewProposal {
  target: WorldviewProposalTarget
  action: WorldviewProposalAction
  content: string
  rationale: string
  dependsOn: string[]
  conflicts: Array<{ existingExcerpt: string; explanation: string }>
}

export interface WorldviewProposalResponse {
  schemaVersion: 1
  mode: 'bootstrap' | 'fill_empty' | 'expand' | 'review_update'
  summary: string
  usedSources: Array<{ type: string; label: string }>
  proposals: WorldviewProposal[]
  questions: Array<{
    question: string
    suggestedTarget?: WorldviewProposalTarget
    whyNeeded: string
  }>
}

export interface WorldviewProposalParseResult {
  response: WorldviewProposalResponse
  ignored: string[]
}

interface AllowedTarget {
  sectionKey: string
  fieldKey?: string
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null
  return value as string[]
}

function parseTarget(value: unknown): WorldviewProposalTarget | null {
  if (!isRecord(value) || typeof value.sectionKey !== 'string' || !value.sectionKey.trim()) return null
  if (value.fieldKey !== undefined && (typeof value.fieldKey !== 'string' || !value.fieldKey.trim())) return null
  return {
    sectionKey: value.sectionKey.trim(),
    ...(typeof value.fieldKey === 'string' ? { fieldKey: value.fieldKey.trim() } : {}),
  }
}

function targetKey(target: WorldviewProposalTarget): string {
  return `${target.sectionKey}\u0000${target.fieldKey ?? ''}`
}

function isAllowedTarget(target: WorldviewProposalTarget, allowedTargets: AllowedTarget[]): boolean {
  return allowedTargets.some((allowed) => targetKey(allowed) === targetKey(target))
}

function parseConflicts(value: unknown): WorldviewProposal['conflicts'] | null {
  if (!Array.isArray(value)) return null
  const conflicts: WorldviewProposal['conflicts'] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.existingExcerpt !== 'string' || typeof item.explanation !== 'string') return null
    conflicts.push({ existingExcerpt: item.existingExcerpt, explanation: item.explanation })
  }
  return conflicts
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]
  const source = (fenced ?? raw).trim()
  if (!source) throw new Error('AI 未返回提案内容')
  try {
    return JSON.parse(source) as unknown
  } catch {
    const start = source.indexOf('{')
    const end = source.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('AI 草案格式无法识别')
    return JSON.parse(jsonrepair(source.slice(start, end + 1))) as unknown
  }
}

function parseProposal(value: unknown, allowedTargets: AllowedTarget[]): WorldviewProposal | null {
  if (!isRecord(value)) return null
  const target = parseTarget(value.target)
  const action = value.action
  const content = stringValue(value.content)
  const rationale = stringValue(value.rationale) ?? ''
  const dependsOn = value.dependsOn === undefined ? [] : stringArray(value.dependsOn)
  const conflicts = value.conflicts === undefined ? [] : parseConflicts(value.conflicts)
  if (!target || !isAllowedTarget(target, allowedTargets) || !['fill_empty', 'suggest_append', 'suggest_replace'].includes(String(action))) return null
  if (content === null || !content.trim() || dependsOn === null || conflicts === null) return null
  return {
    target,
    action: action as WorldviewProposalAction,
    content: content.trim(),
    rationale: rationale.trim(),
    dependsOn,
    conflicts,
  }
}

export function parseWorldviewProposalResponse(raw: string, allowedTargets: AllowedTarget[]): WorldviewProposalParseResult {
  const parsed = extractJson(raw)
  if (!isRecord(parsed)) throw new Error('AI 草案应返回一个 JSON 对象')
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) throw new Error('AI 草案版本不受支持')
  const mode = ['bootstrap', 'fill_empty', 'expand', 'review_update'].includes(String(parsed.mode)) ? parsed.mode : 'bootstrap'
  const summary = stringValue(parsed.summary) ?? 'AI 已生成可编辑的世界观提案。'
  const usedSourcesValue = parsed.usedSources ?? []
  const proposalsValue = parsed.proposals
  const questionsValue = parsed.questions ?? []
  if (!Array.isArray(proposalsValue)) throw new Error('AI 草案缺少 proposals 数组；请检查所选模型是否能按 JSON 协议输出')
  if (!Array.isArray(usedSourcesValue) || !Array.isArray(questionsValue)) throw new Error('AI 草案的 usedSources 或 questions 必须是数组')

  const usedSources: WorldviewProposalResponse['usedSources'] = []
  for (const source of usedSourcesValue) {
    if (!isRecord(source) || typeof source.type !== 'string' || typeof source.label !== 'string') continue
    usedSources.push({ type: source.type, label: source.label })
  }

  const ignored: string[] = []
  const proposals: WorldviewProposal[] = []
  proposalsValue.forEach((item, index) => {
    const proposal = parseProposal(item, allowedTargets)
    if (proposal) proposals.push(proposal)
    else ignored.push(`提案 ${String(index + 1)} 无法定位或字段无效`)
  })
  if (proposals.length === 0) throw new Error('AI 未返回可定位的有效提案')

  const questions: WorldviewProposalResponse['questions'] = []
  for (const item of questionsValue) {
    if (!isRecord(item) || typeof item.question !== 'string' || typeof item.whyNeeded !== 'string') continue
    const suggestedTarget = item.suggestedTarget === undefined ? undefined : parseTarget(item.suggestedTarget)
    if (item.suggestedTarget !== undefined && (!suggestedTarget || !isAllowedTarget(suggestedTarget, allowedTargets))) continue
    questions.push({ question: item.question, whyNeeded: item.whyNeeded, ...(suggestedTarget ? { suggestedTarget } : {}) })
  }

  return {
    response: {
      schemaVersion: 1,
      mode: mode as WorldviewProposalResponse['mode'],
      summary: summary.trim(),
      usedSources,
      proposals,
      questions,
    },
    ignored,
  }
}

export function worldviewProposalPrompt(allowedTargets: AllowedTarget[], mode: WorldviewProposalResponse['mode'] = 'fill_empty'): string {
  const targets = allowedTargets.map((target) => target.fieldKey ? `${target.sectionKey}/${target.fieldKey}` : target.sectionKey).join(', ')
  return [
    '你是世界观设定助手。只返回一个合法 JSON 对象，不要 Markdown 代码围栏，不要额外解释。',
    `schemaVersion 必须为 1，mode 必须为 "${mode}"。`,
    `只能为以下目标提出提案：${targets || '无'}。不得创建其他栏目或字段。`,
    'proposals 中每项必须包含 target、action、content；可选 rationale、dependsOn、conflicts。action 只能是 fill_empty、suggest_append、suggest_replace。',
    'questions 只记录需要用户决定的问题，不要写入内容。',
    '最小合法示例：{"schemaVersion":1,"mode":"bootstrap","summary":"简述","usedSources":[],"proposals":[{"target":{"sectionKey":"目标栏目键"},"action":"fill_empty","content":"提案正文"}],"questions":[]}',
  ].join('\n')
}
