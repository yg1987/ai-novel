import { jsonrepair } from 'jsonrepair'
import { isRecord } from '../utils/unknown'

export type WorldviewAuditSeverity = 'blocker' | 'warning' | 'info'
export type WorldviewAuditSourceType = 'rule' | 'worldview' | 'character' | 'outline' | 'foreshadow' | 'chapter'

export interface WorldviewAuditSource {
  type: WorldviewAuditSourceType
  id: string
  label: string
}

export interface WorldviewAuditEvidence extends WorldviewAuditSource {
  excerpt: string
}

export interface WorldviewAuditFinding {
  id: string
  severity: WorldviewAuditSeverity
  title: string
  risk: string
  suggestedRevision: string
  evidence: WorldviewAuditEvidence[]
}

export interface WorldviewAuditResponse {
  schemaVersion: 1
  summary: string
  findings: WorldviewAuditFinding[]
}

export interface WorldviewAuditParseResult {
  response: WorldviewAuditResponse
  ignored: string[]
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)?.[1]
  const source = (fenced ?? raw).trim()
  if (!source) throw new Error('AI 未返回审查结果')
  try {
    return JSON.parse(source) as unknown
  } catch {
    const start = source.indexOf('{')
    const end = source.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('AI 审查结果格式无法识别')
    return JSON.parse(jsonrepair(source.slice(start, end + 1))) as unknown
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null
}

function parseEvidence(value: unknown, allowedSources: WorldviewAuditSource[], contextText: string): WorldviewAuditEvidence | null {
  if (!isRecord(value)) return null
  const type = text(value.sourceType)
  const id = text(value.sourceId)
  const excerpt = text(value.excerpt)
  if (!type || !id || !excerpt || !['rule', 'worldview', 'character', 'outline', 'foreshadow', 'chapter'].includes(type)) return null
  const source = allowedSources.find((item) => item.type === type && item.id === id)
  if (!source || !contextText.includes(excerpt)) return null
  return { ...source, excerpt }
}

function parseFinding(value: unknown, index: number, allowedSources: WorldviewAuditSource[], contextText: string): WorldviewAuditFinding | null {
  if (!isRecord(value)) return null
  const title = text(value.title)
  const risk = text(value.risk)
  const suggestedRevision = text(value.suggestedRevision)
  const rawEvidence = value.evidence
  if (!title || !risk || !suggestedRevision || !Array.isArray(rawEvidence)) return null
  const evidence = rawEvidence.map((item) => parseEvidence(item, allowedSources, contextText)).filter((item): item is WorldviewAuditEvidence => item !== null)
  const requestedSeverity = text(value.severity)
  let severity: WorldviewAuditSeverity = requestedSeverity === 'blocker' || requestedSeverity === 'warning' || requestedSeverity === 'info'
    ? requestedSeverity
    : 'info'
  if (evidence.length === 0) severity = 'info'
  else if (severity === 'blocker' && evidence.length < 2) severity = 'warning'
  return { id: `audit_${String(index + 1)}`, severity, title, risk, suggestedRevision, evidence }
}

export function parseWorldviewAuditResponse(raw: string, allowedSources: WorldviewAuditSource[], contextText: string): WorldviewAuditParseResult {
  const parsed = extractJson(raw)
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) throw new Error('AI 审查结果版本不受支持')
  const summary = text(parsed.summary) || 'AI 已完成一致性审查。'
  if (!Array.isArray(parsed.findings)) throw new Error('AI 未返回问题列表，请重新检查')
  const ignored: string[] = []
  const findings: WorldviewAuditFinding[] = []
  parsed.findings.forEach((item, index) => {
    const finding = parseFinding(item, index, allowedSources, contextText)
    if (!finding) {
      ignored.push(`发现 ${String(index + 1)} 字段无效，已忽略`)
      return
    }
    if (finding.evidence.length === 0) ignored.push(`发现 ${String(index + 1)} 缺少可验证证据，已降为信息提示`)
    else if (text(isRecord(item) ? item.severity : undefined) === 'blocker' && finding.severity !== 'blocker') ignored.push(`发现 ${String(index + 1)} 的 blocker 证据不足，已降级`)
    findings.push(finding)
  })
  return { response: { schemaVersion: 1, summary, findings }, ignored }
}

export function worldviewAuditPrompt(allowedSources: WorldviewAuditSource[]): string {
  const sourceList = allowedSources.map((source) => `- ${source.type}/${source.id}：${source.label}`).join('\n') || '（无可用来源）'
  return [
    '你是小说世界观一致性审查助手。只返回一个合法 JSON 对象，不要代码围栏或额外说明。',
    '审查术语、硬规则、时间线、角色状态与未定义名词；不要直接改写任何项目内容。',
    '顶层必须包含 schemaVersion、summary、findings：schemaVersion 必须为 1；summary 是本次审查的简短总结；findings 是问题列表。',
    '每个 findings 项必须含 severity（blocker/warning/info）、title、risk、suggestedRevision、evidence。',
    'evidence 中每项必须含 sourceType、sourceId、excerpt；只能引用下列来源，excerpt 必须逐字来自提供的上下文。',
    '没有有效证据时，severity 只能为 info。blocker 必须同时有至少两项证据，且应包含一条规则与一条冲突内容证据。',
    '如果没有问题，返回 findings 空数组。',
    '允许引用的来源：',
    sourceList,
  ].join('\n')
}
