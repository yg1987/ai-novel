import { readProjectFile, writeProjectFile } from '../api/tauri'
import { isRecord } from '../utils/unknown'
import type { WorldviewAuditFinding, WorldviewAuditParseResult } from './worldviewAudit'

const DIR = 'worldview'
const STATE_FILE = '_worldview_issue_state.json'

export type WorldviewIssueStatus = 'open' | 'accepted' | 'fixed' | 'ignored' | 'known_exception'

export interface WorldviewIssueState {
  fingerprint: string
  status: WorldviewIssueStatus
  updatedAt: string
}

interface IssueStore { schemaVersion: 1; issues: WorldviewIssueState[] }

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

export async function saveWorldviewAuditSnapshot(projectId: string, result: WorldviewAuditParseResult): Promise<void> {
  const createdAt = new Date().toISOString()
  await writeProjectFile(projectId, `${DIR}/audits`, `audit_${String(Date.now())}.json`, JSON.stringify({ schemaVersion: 1, createdAt, result }, null, 2))
}
