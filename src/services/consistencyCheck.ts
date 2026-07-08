import { readProjectFile } from '../api/tauri'
import type { ForeshadowStore, CognitionState, TimelineEntry } from '../types/novel'
import type { ConsistencyIssue, ConsistencyCheckResult, ConsistencySeverity } from '../types/review'

const DORMANT_CHAPTER_THRESHOLD = 5  // 沉寂超过 5 章 → S4
const DORMANT_CHAPTER_WARN = 8       // 超过 8 章 → S3
const OVERDUE_CHAPTER_HIGH = 8       // 重要性 >= 0.8 的伏笔超过 8 章 → S2
const OVERDUE_CHAPTER_LOW = 12       // 其他伏笔超过 12 章 → S2

let _issueCounter = 0
function nextId(): string {
  return `ci-${Date.now()}-${++_issueCounter}`
}

// ─── Check 1: Dormant Foreshadowing ───────────────

function checkDormantForeshadow(
  foreshadows: ForeshadowStore | null,
  currentChapter: number,
): ConsistencyIssue[] {
  if (!foreshadows?.entries?.length) return []

  const issues: ConsistencyIssue[] = []
  for (const entry of foreshadows.entries) {
    if (entry.status !== 'planted' && entry.status !== 'advanced') continue

    const lastActiveChapter = entry.advancedChapters?.length
      ? Math.max(...entry.advancedChapters, entry.plantedChapter)
      : entry.plantedChapter
    const dormantFor = currentChapter - lastActiveChapter

    if (dormantFor >= DORMANT_CHAPTER_THRESHOLD) {
      let severity: ConsistencySeverity
      if (dormantFor >= 10) severity = 'S2'
      else if (dormantFor >= DORMANT_CHAPTER_WARN) severity = 'S3'
      else severity = 'S4'

      issues.push({
        id: nextId(),
        type: 'dormant_foreshadow',
        severity,
        chapter: currentChapter,
        description: `伏笔「${entry.name}」已沉寂 ${dormantFor} 章（第${entry.plantedChapter}章埋设）`,
        suggestion: dormantFor >= 10 ? '需尽快推进或回收此伏笔' : '考虑在后续章节推进此伏笔',
        detail: `category=${entry.category} importance=${entry.importance} last_active=ch${lastActiveChapter}`,
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
  foreshadows: ForeshadowStore | null,
  currentChapter: number,
): ConsistencyIssue[] {
  if (!foreshadows?.entries?.length) return []

  const issues: ConsistencyIssue[] = []
  for (const entry of foreshadows.entries) {
    if (entry.status !== 'planted' && entry.status !== 'advanced') continue

    const threshold = entry.importance >= 0.8 ? OVERDUE_CHAPTER_HIGH : OVERDUE_CHAPTER_LOW
    const dormantFor = currentChapter - entry.plantedChapter
    if (dormantFor > threshold) {
      issues.push({
        id: nextId(),
        type: 'overdue_foreshadow',
        severity: 'S2',
        chapter: currentChapter,
        description: `高优先级伏笔「${entry.name}」已超 ${dormantFor} 章未回收（埋设于第${entry.plantedChapter}章）`,
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
): Promise<ConsistencyCheckResult> {
  _issueCounter = 0

  const [foreshadowJson, cognitionJson, timelineJson] = await Promise.all([
    readProjectFile(projectId, 'memory', 'foreshadows.json').catch(() => null),
    readProjectFile(projectId, 'memory', 'character-states.json').catch(() => null),
    readProjectFile(projectId, 'memory', 'timeline.json').catch(() => null),
  ])

  const foreshadows: ForeshadowStore | null = foreshadowJson ? JSON.parse(foreshadowJson) as ForeshadowStore : null
  const cognition: CognitionState | null = cognitionJson ? JSON.parse(cognitionJson) as CognitionState : null
  const timeline: TimelineEntry[] | null = timelineJson ? JSON.parse(timelineJson) as TimelineEntry[] : null

  // Run all 4 checks (deterministic, no AI cost)
  const allIssues: ConsistencyIssue[] = [
    ...checkDormantForeshadow(foreshadows, currentChapter),
    ...checkAbsentCharacter(cognition, currentChapter, presentCharacterNames),
    ...checkTimelineOrder(timeline),
    ...checkOverdueForeshadow(foreshadows, currentChapter),
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
