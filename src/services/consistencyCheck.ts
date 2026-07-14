import { readProjectFile } from '../api/tauri'
import { loadForeshadows } from './foreshadowStorage'
import type { ForeshadowEntry, CognitionState, TimelineEntry } from '../types/novel'
import type { ConsistencyIssue, ConsistencyCheckResult, ConsistencySeverity } from '../types/review'
import type { ConsistencyThresholds } from './reviewRules'
import { getDefaultReviewRules } from './reviewRules'

// Default thresholds (used as fallback when no custom rules provided)
const DEFAULT_THRESHOLDS: ConsistencyThresholds = getDefaultReviewRules().consistency

let _issueCounter = 0
function nextId(): string {
  return `ci-${Date.now()}-${++_issueCounter}`
}

// ─── Check 1: Dormant Foreshadowing ───────────────

function checkDormantForeshadow(
  foreshadows: ForeshadowEntry[],
  currentChapter: number,
  t: ConsistencyThresholds,
): ConsistencyIssue[] {
  if (!foreshadows.length) return []

  const issues: ConsistencyIssue[] = []
  for (const entry of foreshadows) {
    if (entry.status !== 'planted' && entry.status !== 'advanced') continue

    // Get last activity from clues or planted chapter
    const lastActiveChapter = entry.clues?.length
      ? Math.max(...entry.clues.map((c) => Number(c.chapterId.replace('ch', ''))))
      : Number(entry.plantedChapterId.replace('ch', ''))
    const dormantFor = currentChapter - lastActiveChapter

    if (dormantFor >= t.dormantForeshadowWarn) {
      let severity: ConsistencySeverity
      if (dormantFor >= t.dormantForeshadowCritical) severity = 'S2'
      else if (dormantFor >= t.dormantForeshadowAlert) severity = 'S3'
      else severity = 'S4'

      issues.push({
        id: nextId(),
        type: 'dormant_foreshadow',
        severity,
        chapter: currentChapter,
        description: `伏笔「${entry.name}」已沉寂 ${dormantFor} 章（${entry.plantedChapterId}埋设）`,
        suggestion: dormantFor >= t.dormantForeshadowCritical ? '需尽快推进或回收此伏笔' : '考虑在后续章节推进此伏笔',
        detail: `category=${entry.category} importance=${entry.importance} last_active=${entry.plantedChapterId}`,
      })
    }
  }
  return issues
}

// ─── Check 2: Absent Character ────────────────────

function checkAbsentCharacter(
  cognition: CognitionState | null,
  currentChapter: number,
  presentCharacterNames: string[],
): ConsistencyIssue[] {
  if (!cognition?.characters?.length) return []

  const issues: ConsistencyIssue[] = []
  for (const char of cognition.characters) {
    const isMainCharacter = char.knows.length > 0 || char.doesNotKnow.length > 0
    if (!isMainCharacter) continue
    if (presentCharacterNames.includes(char.character)) continue

    issues.push({
      id: nextId(),
      type: 'absent_character',
      severity: 'S4',
      chapter: currentChapter,
      description: `角色「${char.character}」在本章未出现`,
      suggestion: '主要角色长期未出场可能导致读者遗忘',
    })
  }
  return issues
}

// ─── Check 3: Timeline Order ──────────────────────

function checkTimelineOrder(
  timeline: TimelineEntry[] | null,
): ConsistencyIssue[] {
  if (!timeline?.length) return []

  const issues: ConsistencyIssue[] = []
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1]!
    const curr = timeline[i]!
    if (curr.chapterNumber <= prev.chapterNumber) {
      issues.push({
        id: nextId(),
        type: 'timeline_order',
        severity: 'S2',
        chapter: curr.chapterNumber,
        description: `时间线章节序号冲突：第${prev.chapterNumber}章 → 第${curr.chapterNumber}章`,
        suggestion: '检查章节编号是否正确',
      })
    }
  }
  return issues
}

// ─── Check 4: Overdue Foreshadowing ───────────────

function checkOverdueForeshadow(
  foreshadows: ForeshadowEntry[],
  currentChapter: number,
  t: ConsistencyThresholds,
): ConsistencyIssue[] {
  if (!foreshadows.length) return []

  const issues: ConsistencyIssue[] = []
  for (const entry of foreshadows) {
    if (entry.status !== 'planted' && entry.status !== 'advanced') continue

    const plantedNum = Number(entry.plantedChapterId.replace('ch', ''))
    const threshold = entry.importance >= 0.8 ? t.overdueHighImportance : t.overdueDefault
    const dormantFor = currentChapter - plantedNum
    if (dormantFor > threshold) {
      issues.push({
        id: nextId(),
        type: 'overdue_foreshadow',
        severity: 'S2',
        chapter: currentChapter,
        description: `高优先级伏笔「${entry.name}」已超 ${dormantFor} 章未回收（埋设于${entry.plantedChapterId}）`,
        suggestion: '考虑在接下来 1-2 章内推动或回收此伏笔',
      })
    }
  }
  return issues
}

// ─── Main Entry Point ─────────────────────────────

export async function runConsistencyChecks(
  projectId: string,
  currentChapter: number,
  presentCharacterNames: string[],
  thresholds?: Partial<ConsistencyThresholds>,
): Promise<ConsistencyCheckResult> {
  const t: ConsistencyThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
  _issueCounter = 0

  const [foreshadowStore, cognitionJson, timelineJson] = await Promise.all([
    loadForeshadows(projectId).catch(() => ({ entries: [], updatedAt: '' })),
    readProjectFile(projectId, 'memory', 'character-states.json').catch(() => null),
    readProjectFile(projectId, 'memory', 'timeline.json').catch(() => null),
  ])

  const cognition: CognitionState | null = cognitionJson ? JSON.parse(cognitionJson) as CognitionState : null
  const timeline: TimelineEntry[] | null = timelineJson ? JSON.parse(timelineJson) as TimelineEntry[] : null

  // Run all 4 checks (deterministic, no AI cost)
  const allIssues: ConsistencyIssue[] = [
    ...checkDormantForeshadow(foreshadowStore.entries, currentChapter, t),
    ...checkAbsentCharacter(cognition, currentChapter, presentCharacterNames),
    ...checkTimelineOrder(timeline),
    ...checkOverdueForeshadow(foreshadowStore.entries, currentChapter, t),
  ]

  const summary = { S1: 0, S2: 0, S3: 0, S4: 0, total: allIssues.length }
  for (const issue of allIssues) {
    if (issue.severity === 'S1') summary.S1++
    else if (issue.severity === 'S2') summary.S2++
    else if (issue.severity === 'S3') summary.S3++
    else if (issue.severity === 'S4') summary.S4++
  }

  return { issues: allIssues, summary, checkedAt: new Date().toISOString() }
}
