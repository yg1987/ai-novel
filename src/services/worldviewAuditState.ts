import { readProjectFile, writeProjectFile } from '../api/tauri'
import { isRecord } from '../utils/unknown'
import type { WorldviewAuditEvidence, WorldviewAuditFinding, WorldviewAuditParseResult } from './worldviewAudit'

const DIR = 'worldview'
const STATE_FILE = '_worldview_issue_state.json'
const AUDIT_RESULT_FILE = '_worldview_audit_result.json'

export type WorldviewIssueStatus = 'open' | 'accepted' | 'fixed' | 'ignored' | 'known_exception'

export interface WorldviewIssueState {
  fingerprint: string
  status: WorldviewIssueStatus
  updatedAt: string
}

interface IssueStore { schemaVersion: 1; issues: WorldviewIssueState[] }
interface AuditResultStore { schemaVersion: 1; updatedAt: string; result: WorldviewAuditParseResult }

function hash(value: string): string {
  let result = 2_166_136_261
  for (const character of value) {
    result ^= character.charCodeAt(0)
    result = Math.imul(result, 16_777_619)
  }
  return (result >>> 0).toString(16)
}

export function fingerprintWorldviewAuditFinding(finding: WorldviewAuditFinding): string {
  const evidence = finding.evidence.map((item) => `${item.type}|${item.id}|${item.excerpt}`).sort().join('\n')
  return `issue_${hash(`${finding.title}\n${finding.risk}\n${evidence}`)}`
}

function parseState(value: unknown): WorldviewIssueState | null {
  if (!isRecord(value) || typeof value.fingerprint !== 'string' || typeof value.updatedAt !== 'string') return null
  if (!['open', 'accepted', 'fixed', 'ignored', 'known_exception'].includes(String(value.status))) return null
  return { fingerprint: value.fingerprint, status: value.status as WorldviewIssueStatus, updatedAt: value.updatedAt }
}

function parseAuditEvidence(value: unknown): WorldviewAuditEvidence | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string' || typeof value.excerpt !== 'string') return null
  if (!['rule', 'worldview', 'character', 'outline', 'foreshadow', 'chapter'].includes(String(value.type))) return null
  return { type: value.type as WorldviewAuditEvidence['type'], id: value.id, label: value.label, excerpt: value.excerpt }
}

function parseAuditFinding(value: unknown): WorldviewAuditFinding | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.risk !== 'string' || typeof value.suggestedRevision !== 'string' || !Array.isArray(value.evidence)) return null
  if (!['blocker', 'warning', 'info'].includes(String(value.severity))) return null
  const evidence = value.evidence.map(parseAuditEvidence)
  if (evidence.some((item) => item === null)) return null
  return {
    id: value.id,
    severity: value.severity as WorldviewAuditFinding['severity'],
    title: value.title,
    risk: value.risk,
    suggestedRevision: value.suggestedRevision,
    evidence: evidence as WorldviewAuditEvidence[],
  }
}

function parseAuditResult(value: unknown): WorldviewAuditParseResult | null {
  if (!isRecord(value) || !isRecord(value.response) || value.response.schemaVersion !== 1 || typeof value.response.summary !== 'string' || !Array.isArray(value.response.findings) || !Array.isArray(value.ignored)) return null
  if (!value.ignored.every((item) => typeof item === 'string')) return null
  const findings = value.response.findings.map(parseAuditFinding)
  if (findings.some((item) => item === null)) return null
  return {
    response: { schemaVersion: 1, summary: value.response.summary, findings: findings as WorldviewAuditFinding[] },
    ignored: value.ignored,
  }
}

export async function loadWorldviewIssueStates(projectId: string): Promise<Record<string, WorldviewIssueState>> {
  let raw: string
  try { raw = await readProjectFile(projectId, DIR, STATE_FILE) } catch { return {} }
  if (!raw.trim()) return {}
  let parsed: unknown
  try { parsed = JSON.parse(raw) as unknown } catch { throw new Error('世界观问题状态数据不是有效的 JSON') }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.issues)) throw new Error('世界观问题状态数据版本或结构不受支持')
  const states = parsed.issues.map(parseState)
  if (states.some((item) => item === null)) throw new Error('世界观问题状态包含无效条目')
  return Object.fromEntries((states as WorldviewIssueState[]).map((item) => [item.fingerprint, item]))
}

export async function updateWorldviewIssueStatus(projectId: string, fingerprint: string, status: WorldviewIssueStatus): Promise<WorldviewIssueState> {
  const states = await loadWorldviewIssueStates(projectId)
  const next: WorldviewIssueState = { fingerprint, status, updatedAt: new Date().toISOString() }
  await writeProjectFile(projectId, DIR, STATE_FILE, JSON.stringify({ schemaVersion: 1, issues: [...Object.values(states).filter((item) => item.fingerprint !== fingerprint), next] } satisfies IssueStore, null, 2))
  return next
}

export async function loadWorldviewAuditResult(projectId: string): Promise<WorldviewAuditParseResult | null> {
  let raw: string
  try { raw = await readProjectFile(projectId, DIR, AUDIT_RESULT_FILE) } catch { return null }
  if (!raw.trim()) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) as unknown } catch { throw new Error('已保存的一致性检查结果无法读取') }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || typeof parsed.updatedAt !== 'string') throw new Error('已保存的一致性检查结果格式不受支持')
  const result = parseAuditResult(parsed.result)
  if (!result) throw new Error('已保存的一致性检查结果格式不受支持')
  return result
}

export async function saveWorldviewAuditResult(projectId: string, result: WorldviewAuditParseResult): Promise<void> {
  const store: AuditResultStore = { schemaVersion: 1, updatedAt: new Date().toISOString(), result }
  await writeProjectFile(projectId, DIR, AUDIT_RESULT_FILE, JSON.stringify(store, null, 2))
}
