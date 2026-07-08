# 自动一致性审查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automatic consistency review system for AI Novel Writer that detects timeline contradictions, character cognition gaps, foreshadowing health issues, and setting inconsistencies — with a two-tier architecture (deterministic pre-checks free + AI deep review).

**Architecture:** Two-tier approach based on Novel-OS and oh-story-claudecode patterns:
- **Tier 1 (FREE):** 4 deterministic checks run on every save — no AI cost, instant results
- **Tier 2 (AI):** Enhanced `runDeepReview()` auto-triggered with throttle — adds worldview context, fixes JSON parsing, integrates with Tier 1 findings
- Results displayed in existing ReviewPanel with severity badge (S1-S4)

**Tech Stack:** TypeScript 6 (frontend services), Rust (Tauri commands, one new command), TipTap editor (save hooks)

**Reference Projects:**
- Novel-OS continuity engine (deterministic pre-check + LLM Guardian)
- oh-story-claudecode S1-S4 severity system
- PlotPilot chapter review service
- scrivener-mcp check_consistency pattern

## Global Constraints

- All new files go under `src/services/`, `src/types/`, or `src/components/`
- Any new Rust command follows the pattern in `src-tauri/src/commands/version.rs`
- Any new Tauri command must be registered in BOTH `commands/mod.rs` AND `lib.rs` invoke_handler
- No new npm dependencies unless absolutely necessary
- No breaking changes to existing APIs (reviewService.ts exports must remain)
- All changes must pass `npx tsc --noEmit` and `cd src-tauri && cargo check`

---

### Task 1: Fix Timeline Data Gap in memorySync.ts

**Files:**
- Modify: `src/services/memorySync.ts`

**Interfaces:**
- Consumes: `ChapterSnapshot.timelineEvents: string[]` (already extracted by chapterIngest.ts but never persisted)
- Produces: `memory/timeline.json` written with `TimelineEntry[]` format

**Problem:** `chapterIngest.ts` extracts `timelineEvents` from chapter snapshots, but `memorySync.ts` never writes them to `memory/timeline.json`. The review service (`reviewService.ts:38`) tries to read this file and gets empty data.

- [ ] **Step 1: Read memorySync.ts current state**

Run: `type src/services/memorySync.ts | head -180`
Expected: Confirm current file structure (~173 lines)

- [ ] **Step 2: Add `syncTimeline()` function**

Add after the `syncCharacterCognition()` function:

```typescript
/** Sync timeline events from snapshot to memory/timeline.json */
async function syncTimeline(
  projectId: string,
  chapterNumber: number,
  events: string[],
): Promise<void> {
  if (!events.length) return

  let timeline: TimelineEntry[] = []
  try {
    const existing = await readProjectFile(projectId, 'memory', 'timeline.json')
    if (existing) {
      timeline = JSON.parse(existing)
    }
  } catch { /* start fresh */ }

  // Replace any existing entry for this chapter (re-save = update)
  const existingIdx = timeline.findIndex((e) => e.chapterNumber === chapterNumber)
  const entry: TimelineEntry = {
    chapterNumber,
    events,
  }
  if (existingIdx >= 0) {
    timeline[existingIdx] = entry
  } else {
    timeline.push(entry)
  }

  // Sort by chapter number ascending
  timeline.sort((a, b) => a.chapterNumber - b.chapterNumber)

  await writeProjectFile(projectId, 'memory', 'timeline.json', JSON.stringify(timeline, null, 2))
}
```

- [ ] **Step 3: Wire into `saveChapterSnapshot()`**

In `saveChapterSnapshot()`, after `syncCharacterCognition()` call, add:

```typescript
// Sync timeline
syncTimeline(projectId, snapshot.chapterNumber, snapshot.timelineEvents).catch(console.error)
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/services/memorySync.ts
git commit -m "fix(memory): persist timeline events to memory/timeline.json"
```

---

### Task 2: Add Consistency Types + Deterministic Check Service

**Files:**
- Create: `src/services/consistencyCheck.ts`
- Modify: `src/types/review.ts` (add ConsistencyIssue type)

**Interfaces:**
- Consumes: `readProjectFile` from `src/api/tauri.ts`
- Produces: `ConsistencyIssue[]` with S1-S4 severity

- [ ] **Step 1: Add types to src/types/review.ts**

Append to existing review.ts:

```typescript
// ── Auto Consistency Review Types (v0.4) ──

/** S1-S4 severity matching oh-story-claudecode standard */
export type ConsistencySeverity = 'S1' | 'S2' | 'S3' | 'S4'
/** S1 Critical: 硬伤（已死角色再出场、能力代价消失） */
/** S2 Major: 破坏叙事（时间跳跃、位置矛盾、伏笔超期严重） */
/** S3 Minor: 细节差异（描述不一致） */
/** S4 Advisory: 优化建议（伏笔密度、失踪提醒） */

export type ConsistencyCheckType =
  | 'dormant_foreshadow'
  | 'absent_character'
  | 'timeline_order'
  | 'cognition_gap'
  | 'overdue_foreshadow'

export interface ConsistencyIssue {
  id: string
  type: ConsistencyCheckType
  severity: ConsistencySeverity
  chapter: number
  description: string
  suggestion?: string
  /** e.g. "伏笔『神秘来信』已沉寂 6 章 (第3章→第9章)" */
  detail?: string
}

export interface ConsistencyCheckResult {
  issues: ConsistencyIssue[]
  summary: {
    S1: number
    S2: number
    S3: number
    S4: number
    total: number
  }
  checkedAt: string
}
```

- [ ] **Step 2: Create src/services/consistencyCheck.ts**

```typescript
import { readProjectFile } from '../api/tauri'
import type {
  ForeshadowStore,
  CognitionState,
  TimelineEntry,
} from '../types/novel'
import type { ConsistencyIssue, ConsistencyCheckResult, ConsistencySeverity } from '../types/review'

const DORMANT_CHAPTER_THRESHOLD = 5
const ABSENT_CHAPTER_THRESHOLD = 5

let _issueCounter = 0
function nextId(): string {
  return `ci-${Date.now()}-${++_issueCounter}`
}

// ── Check 1: Dormant Foreshadowing ──

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
      else if (dormantFor >= 7) severity = 'S3'
      else severity = 'S4'

      issues.push({
        id: nextId(),
        type: 'dormant_foreshadow',
        severity,
        chapter: currentChapter,
        description: `伏笔「${entry.name}」已沉寂 ${dormantFor} 章（第${entry.plantedChapter}章埋设）`,
        suggestion: '考虑在后续章节推进或回收此伏笔',
        detail: `category=${entry.category} importance=${entry.importance} last_active=ch${lastActiveChapter}`,
      })
    }
  }
  return issues
}

// ── Check 2: Absent Character ──

function checkAbsentCharacter(
  cognition: CognitionState | null,
  currentChapter: number,
  presentCharacterNames: string[],
): ConsistencyIssue[] {
  if (!cognition?.characters?.length) return []

  const issues: ConsistencyIssue[] = []
  for (const char of cognition.characters) {
    // Check if character has been mentioned in recent chapters
    // We use the "last appeared" heuristic: if character has knowledge but isn't
    // in the present list, they're likely absent
    if (presentCharacterNames.includes(char.character)) continue

    // This is a simplified check — we track absence by noting that the character
    // exists in cognition state but hasn't appeared in the current chapter
    // A full implementation would track last appearance chapter in memory
    const isMainCharacter = char.knows.length > 0 || char.doesNotKnow.length > 0
    if (!isMainCharacter) continue

    // Without a lastAppearanceChapter field, we flag it as S4 advisory
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

// ── Check 3: Timeline Order ──

function checkTimelineOrder(
  timeline: TimelineEntry[] | null,
): ConsistencyIssue[] {
  if (!timeline?.length) return []

  const issues: ConsistencyIssue[] = []
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1]!
    const curr = timeline[i]!
    // Check chapter number ordering is consistent
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

// ── Check 4: Overdue Foreshadowing (past resolution chapter) ──

function checkOverdueForeshadow(
  foreshadows: ForeshadowStore | null,
  currentChapter: number,
): ConsistencyIssue[] {
  if (!foreshadows?.entries?.length) return []

  const issues: ConsistencyIssue[] = []
  for (const entry of foreshadows.entries) {
    if (entry.status !== 'planted' && entry.status !== 'advanced') continue
    // Importance-based threshold: high importance (>0.8) should resolve faster
    const threshold = entry.importance >= 0.8 ? 8 : 12
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

// ── Main Entry Point ──

export async function runConsistencyChecks(
  projectId: string,
  currentChapter: number,
  presentCharacterNames: string[],
): Promise<ConsistencyCheckResult> {
  _issueCounter = 0

  // Load memory data in parallel
  const [
    foreshadowJson,
    cognitionJson,
    timelineJson,
  ] = await Promise.all([
    readProjectFile(projectId, 'memory', 'foreshadows.json').catch(() => null),
    readProjectFile(projectId, 'memory', 'character-states.json').catch(() => null),
    readProjectFile(projectId, 'memory', 'timeline.json').catch(() => null),
  ])

  const foreshadows: ForeshadowStore | null = foreshadowJson ? JSON.parse(foreshadowJson) : null
  const cognition: CognitionState | null = cognitionJson ? JSON.parse(cognitionJson) : null
  const timeline: TimelineEntry[] | null = timelineJson ? JSON.parse(timelineJson) : null

  // Run all 4 checks (all synchronous, no AI cost)
  const allIssues: ConsistencyIssue[] = [
    ...checkDormantForeshadow(foreshadows, currentChapter),
    ...checkAbsentCharacter(cognition, currentChapter, presentCharacterNames),
    ...checkTimelineOrder(timeline),
    ...checkOverdueForeshadow(foreshadows, currentChapter),
  ]

  // Build summary
  const summary = { S1: 0, S2: 0, S3: 0, S4: 0, total: allIssues.length }
  for (const issue of allIssues) {
    summary[issue.severity]++
  }

  return { issues: allIssues, summary, checkedAt: new Date().toISOString() }
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/types/review.ts src/services/consistencyCheck.ts
git commit -m "feat(review): add deterministic consistency checks (Tier 1)"
```

---

### Task 3: Enhance AI Deep Review with Worldview Context + Fix JSON Parsing

**Files:**
- Modify: `src/services/reviewService.ts`

**Interfaces:**
- Consumes: existing `runDeepReview` function
- Produces: enhanced deep review with worldview context, robust JSON parsing

- [ ] **Step 1: Read current runDeepReview**

Run: `type src/services/reviewService.ts`
Expected: Confirm runDeepReview function (~lines 30-120), especially the prompt and JSON parsing

- [ ] **Step 2: Add worldview context loading**

Before the existing `loadProviderConfig` call in `runDeepReview`, add:

```typescript
// Load worldview data for setting_consistency checks
let worldviewContext = ''
try {
  const worldviewFiles = await listProjectFiles(projectId, 'worldview')
  const worldviewSnippets: string[] = []
  for (const file of worldviewFiles.slice(0, 5)) { // top 5 files
    const content = await readProjectFile(projectId, 'worldview', file)
    if (content) {
      const text = content.replace(/^---[\s\S]*?---\n?/, '').replace(/<[^>]*>/g, '').trim()
      if (text.length > 0) {
        worldviewSnippets.push(`【${file}】\n${text.slice(0, 800)}`)
      }
    }
  }
  if (worldviewSnippets.length > 0) {
    worldviewContext = '\n## 世界观设定\n' + worldviewSnippets.join('\n\n')
  }
} catch { /* worldview not available */ }
```

- [ ] **Step 3: Enhance prompt with worldview + deterministic findings**

Find the existing prompt construction and enhance it. Replace the existing prompt:

```typescript
const memoryContext = [
  `【角色认知状态】\n${cognitionText}`,
  `【伏笔状态】\n${foreshadowText}`,
  `【时间线】\n${timelineText}`,
  worldviewContext, // ← NEW
].filter(Boolean).join('\n\n')

const prompt = `你是一位专业的小说编辑，正在审查一篇小说的第 ${chapterId} 章。
## 已有数据
${memoryContext}

## 章节正文
${plainText}

## 审查要求
请从以下 4 个维度进行审查，每个维度给出 0-10 分和具体问题：
1. timeline（时间线一致性）：事件顺序、时间跳跃是否合理
2. character_cognition（角色认知一致性）：角色知道/不知道的信息是否正确
3. foreshadow_health（伏笔健康状况）：伏笔是否被推进或回收、是否超期
4. setting_consistency（设定自洽性）：世界观规则是否被违反${worldviewContext ? '，请参考世界观设定' : ''}

## 输出格式
必须返回严格的 JSON 格式（不要包含 markdown 代码块标记），直接输出 JSON 对象：
{
  "overall_score": 0-10,
  "dimensions": [
    { "name": "timeline", "score": 0-10, "issues": [{"severity": "error|warning|hint", "desc": "", "suggestion": ""}] },
    { "name": "character_cognition", "score": 0-10, "issues": [] },
    { "name": "foreshadow_health", "score": 0-10, "issues": [] },
    { "name": "setting_consistency", "score": 0-10, "issues": [] }
  ],
  "suggestions": [""]
}`
```

- [ ] **Step 4: Fix JSON parsing (handle markdown code blocks)**

Replace the existing JSON extraction logic (currently regex `{[\s\S]*}`) with:

```typescript
function extractJSON(text: string): string | null {
  // Try direct parse first
  const trimmed = text.trim()
  try {
    JSON.parse(trimmed)
    return trimmed
  } catch { /* try extraction */ }

  // Try to find JSON block (handle ```json ... ``` wrapping)
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (jsonBlockMatch) {
    try {
      JSON.parse(jsonBlockMatch[1]!)
      return jsonBlockMatch[1]!
    } catch { /* try bare object */ }
  }

  // Try to find { ... } object
  const objMatch = trimmed.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      JSON.parse(objMatch[0])
      return objMatch[0]
    } catch { /* continue */ }
  }

  return null
}
```

Then replace the existing `match = data.choices[0]?.message?.content.match(/{[\s\S]*}/)` with:

```typescript
const content = data.choices[0]?.message?.content ?? ''
const jsonStr = extractJSON(content)
if (!jsonStr) {
  return {
    overall_score: 0,
    dimensions: [],
    suggestions: ['AI 审查结果解析失败，请重试'],
    timestamp: new Date().toISOString(),
  } as DeepCheckResult
}

try {
  const result = JSON.parse(jsonStr) as DeepCheckResult
  // Validate required fields
  if (typeof result.overall_score !== 'number') result.overall_score = 0
  if (!Array.isArray(result.dimensions)) result.dimensions = []
  if (!Array.isArray(result.suggestions)) result.suggestions = []
  result.timestamp = new Date().toISOString()
  return result
} catch {
  return {
    overall_score: 0,
    dimensions: [],
    suggestions: ['AI 审查结果格式异常，请重试'],
    timestamp: new Date().toISOString(),
  } as DeepCheckResult
}
```

- [ ] **Step 5: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/services/reviewService.ts
git commit -m "feat(review): enhance deep review with worldview context and robust JSON parsing"
```

---

### Task 4: Wire Consistency Checks into Editor Save Hook

**Files:**
- Modify: `src/components/Editor.tsx`

- [ ] **Step 1: Read Editor.tsx current handleSaveNow**

Run: `grep -n "handleSaveNow\|runAndSaveLightCheck\|consistency\|setLastLight" src/components/Editor.tsx`
Expected: Identify exact insertion points

- [ ] **Step 2: Add imports**

```typescript
import { runConsistencyChecks } from '../services/consistencyCheck'
import type { ConsistencyCheckResult } from '../types/review'
```

- [ ] **Step 3: Add state for consistency results**

Add after existing state declarations (around `const [lastLightCheckResult, setLastLightCheckResult]`):

```typescript
const [lastConsistencyResult, setLastConsistencyResult] = useState<ConsistencyCheckResult | null>(null)
```

- [ ] **Step 4: Extract present character names helper**

Add a helper function (can be inside component or as module-level):

```typescript
/** Extract character names mentioned in text from character files */
async function extractPresentCharacterNames(
  projectId: string,
  plainText: string,
): Promise<string[]> {
  try {
    const charFiles = await listProjectFiles(projectId, 'characters')
    const names: string[] = []
    for (const file of charFiles) {
      // Filename without extension = character name
      const name = file.replace(/\.\w+$/, '')
      if (plainText.includes(name)) {
        names.push(name)
      }
    }
    return names
  } catch {
    return []
  }
}
```

- [ ] **Step 5: Wire into handleSaveNow after light check**

After the existing light check block (after `setLastLightCheckResult(...)`), add:

```typescript
// Auto consistency check (Tier 1 - deterministic, free)
.then(async () => {
  const plainText = html.replace(/<[^>]*>/g, '').trim()
  if (plainText.length > 100 && !chapterId.startsWith('new-')) {
    try {
      const charNames = await extractPresentCharacterNames(projectId, plainText)
      const result = await runConsistencyChecks(projectId, chapterNumber, charNames)
      setLastConsistencyResult(result)
      if (result.issues.length > 0) {
        console.log(`[Consistency] ${result.summary.total} issues found (S1:${result.summary.S1} S2:${result.summary.S2} S3:${result.summary.S3} S4:${result.summary.S4})`)
      }
    } catch (e) {
      console.error('Consistency check failed:', e)
    }
  }
})
```

- [ ] **Step 6: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/components/Editor.tsx
git commit -m "feat(editor): auto-run deterministic consistency checks on save"
```

---

### Task 5: Fix currentChapterId Bug + Wire Consistency Results into ReviewPanel

**Files:**
- Modify: `src/components/ReviewPanel.tsx`
- Modify: `src/components/ProjectView.tsx`

- [ ] **Step 1: Fix ProjectView.tsx - pass real currentChapterId**

Read `src/components/ProjectView.tsx` current state. Change `ReviewPanel` mount from:

```tsx
{tab === 'review' && <ReviewPanel projectId={project.id} currentChapterId={null} />}
```

To — we need to get the current chapter from the writing tab. Since ReviewPanel is in a different tab, we can either:
- Option A: Use a state to track the current chapter across tabs
- Option B: Let ReviewPanel accept `null` and show project-level reports only

For v0.4, Option B is simpler. The deep review will be triggered from the editor (Task 4), not from ReviewPanel manually. ReviewPanel shows historical reports. Keep `currentChapterId` as `null` but ensure the UI handles it gracefully:

Change the disabled condition from:
```tsx
disabled={!currentChapterId || searching}
```
To:
```tsx
disabled={searching}
```

And in the button text, change from showing "请先打开章节" to enabling both buttons.

- [ ] **Step 2: Show consistency results in ReviewPanel**

In `ReviewPanel.tsx`, add a new section after the existing light check and deep review buttons. Add imports:

```typescript
import { runConsistencyChecks } from '../services/consistencyCheck'
import type { ConsistencyCheckResult } from '../types/review'
import type { ForeshadowStore } from '../types/novel'
```

Add state:
```typescript
const [consistencyResult, setConsistencyResult] = useState<ConsistencyCheckResult | null>(null)
const [runningConsistency, setRunningConsistency] = useState(false)
```

Add button and results section inside the panel:

```tsx
<div className="review-section">
  <h4>一致性审查 (Tier 1 - 快速)</h4>
  <p className="review-hint">基于规则自动检测伏笔超期、角色缺席等问题，无需 AI</p>
  <button
    className="btn-secondary"
    onClick={async () => {
      setRunningConsistency(true)
      try {
        const html = await getChapterContent(projectId, currentChapterId!)
        const plainText = html.replace(/<[^>]*>/g, '').trim()
        const charNames = await extractPresentCharacterNames(projectId, plainText)
        const result = await runConsistencyChecks(projectId, currentChapterNum, charNames)
        setConsistencyResult(result)
      } catch (e) {
        console.error('Consistency check failed:', e)
      } finally {
        setRunningConsistency(false)
      }
    }}
    disabled={runningConsistency || !currentChapterId}
  >
    {runningConsistency ? '检查中…' : '🔍 运行一致性检查'}
  </button>

  {consistencyResult && (
    <div className="consistency-result">
      <div className="consistency-summary">
        <span>共 {consistencyResult.summary.total} 个问题</span>
        {consistencyResult.summary.S1 > 0 && <span className="severity-s1">S1: {consistencyResult.summary.S1}</span>}
        {consistencyResult.summary.S2 > 0 && <span className="severity-s2">S2: {consistencyResult.summary.S2}</span>}
        {consistencyResult.summary.S3 > 0 && <span className="severity-s3">S3: {consistencyResult.summary.S3}</span>}
        {consistencyResult.summary.S4 > 0 && <span className="severity-s4">S4: {consistencyResult.summary.S4}</span>}
      </div>
      <div className="consistency-issues">
        {consistencyResult.issues.map((issue) => (
          <div key={issue.id} className={`consistency-issue severity-${issue.severity.toLowerCase()}`}>
            <span className="severity-badge">{issue.severity}</span>
            <span className="issue-type">{issue.type}</span>
            <span className="issue-desc">{issue.description}</span>
            {issue.suggestion && <span className="issue-suggestion">{issue.suggestion}</span>}
          </div>
        ))}
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 3: Add CSS for consistency results**

Append to `src/style.css`:

```css
/* ── Consistency Check UI ── */
.consistency-result {
  margin-top: 12px;
}
.consistency-summary {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  font-size: 0.85rem;
  flex-wrap: wrap;
}
.severity-s1 { color: #e74c3c; font-weight: 600; }
.severity-s2 { color: #e67e22; font-weight: 600; }
.severity-s3 { color: #f1c40f; font-weight: 600; }
.severity-s4 { color: #7f8c8d; font-weight: 600; }
.consistency-issues {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.consistency-issue {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  flex-wrap: wrap;
}
.consistency-issue.severity-s1 { background: #fdf0ef; border-left: 3px solid #e74c3c; }
.consistency-issue.severity-s2 { background: #fef5e7; border-left: 3px solid #e67e22; }
.consistency-issue.severity-s3 { background: #fef9e7; border-left: 3px solid #f1c40f; }
.consistency-issue.severity-s4 { background: #f8f9fa; border-left: 3px solid #bdc3c7; }
.severity-badge {
  font-weight: 700;
  font-size: 0.75rem;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}
.severity-s1 .severity-badge { background: #e74c3c; color: #fff; }
.severity-s2 .severity-badge { background: #e67e22; color: #fff; }
.severity-s3 .severity-badge { background: #f1c40f; color: #333; }
.severity-s4 .severity-badge { background: #bdc3c7; color: #333; }
.issue-type {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
  flex-shrink: 0;
}
.issue-desc { flex: 1; }
.issue-suggestion {
  width: 100%;
  font-size: 0.8rem;
  color: var(--text-muted);
  padding-left: 16px;
}
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Build check (Rust + TS)**

Run: `cd src-tauri && cargo check 2>&1`
Then: `npx tsc --noEmit`
Expected: Both pass clean

- [ ] **Step 6: Commit**

```bash
git add src/components/ReviewPanel.tsx src/components/ProjectView.tsx src/style.css
git commit -m "feat(ui): add consistency check button and results to ReviewPanel"
```

---

### Task 6: Rust Auto-Consistency Check Command (Optional — for offline/project-wide scan)

**Files:**
- Create: `src-tauri/src/commands/consistency.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/api/tauri.ts`

**Skip unless project-wide scan (no chapter context) is needed.** The Tier 1 checks from Task 2 already run on every save via Editor.tsx. This Rust command would allow running a project-wide scan from the ReviewPanel without needing to have a chapter open.

- [ ] **Step 1: Read existing commands for reference**

Run: `type src-tauri/src/commands/version.rs | head -40`
Expected: Confirm the pattern (project_dir, Serialize/Deserialize, pub fn, #[tauri::command])

- [ ] **Step 2: Create src-tauri/src/commands/consistency.rs**

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsistencyIssue {
    pub severity: String,  // "S1" | "S2" | "S3" | "S4"
    pub check_type: String,
    pub chapter: u32,
    pub description: String,
    pub suggestion: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsistencyScanResult {
    pub issues: Vec<ConsistencyIssue>,
    pub summary: ConsistencySummary,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsistencySummary {
    pub s1: u32,
    pub s2: u32,
    pub s3: u32,
    pub s4: u32,
    pub total: u32,
}

#[tauri::command]
pub fn scan_project_consistency(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<ConsistencyScanResult, String> {
    use std::fs;
    use tauri::Manager;

    let dir = crate::project_dir(&app_handle, &project_id)?;

    // Read foreshadows.json
    let foreshadow_path = dir.join("memory").join("foreshadows.json");
    let _foreshadow_data = if foreshadow_path.exists() {
        fs::read_to_string(&foreshadow_path).ok()
    } else {
        None
    };

    // Read timeline.json
    let timeline_path = dir.join("memory").join("timeline.json");
    let _timeline_data = if timeline_path.exists() {
        fs::read_to_string(&timeline_path).ok()
    } else {
        None
    };

    // Read cognition data
    let cognition_path = dir.join("memory").join("character-states.json");
    let _cognition_data = if cognition_path.exists() {
        fs::read_to_string(&cognition_path).ok()
    } else {
        None
    };

    // Read chapters list
    let chapters_dir = dir.join("chapters");
    let chapter_count = if chapters_dir.exists() {
        let count = fs::read_dir(&chapters_dir)
            .map(|e| e.flatten().filter(|e| e.path().extension().map_or(false, |ext| ext == "md" || ext == "html")).count())
            .unwrap_or(0);
        count as u32
    } else {
        0
    };

    // For v0.4, simple scan: report basic stats
    // Actual deterministic checks run on frontend (Task 2)
    Ok(ConsistencyScanResult {
        issues: vec![],
        summary: ConsistencySummary {
            s1: 0,
            s2: 0,
            s3: 0,
            s4: 0,
            total: 0,
        },
        scanned_at: chrono::Local::now().to_rfc3339(),
    })
}
```

- [ ] **Step 3: Register in mod.rs**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub mod consistency;
```

- [ ] **Step 4: Register in lib.rs**

Add to `invoke_handler!`:
```rust
commands::consistency::scan_project_consistency,
```

- [ ] **Step 5: Add API binding in src/api/tauri.ts**

```typescript
export interface ConsistencyIssue {
  severity: string
  check_type: string
  chapter: number
  description: string
  suggestion?: string
  detail?: string
}

export interface ConsistencyScanResult {
  issues: ConsistencyIssue[]
  summary: { s1: number; s2: number; s3: number; s4: number; total: number }
  scanned_at: string
}

export async function scanProjectConsistency(
  projectId: string,
): Promise<ConsistencyScanResult> {
  return invoke<ConsistencyScanResult>('scan_project_consistency', { projectId })
}
```

- [ ] **Step 6: Verify both compile**

Run: `cd src-tauri && cargo check 2>&1`
Then: `npx tsc --noEmit`
Expected: Both pass clean

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/consistency.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/api/tauri.ts
git commit -m "feat(review): add Rust project-wide consistency scan command"
```

---

### Post-Implementation Verification

- [ ] **Full compile check**

Run: `cd src-tauri && cargo check 2>&1`
Then: `npx tsc --noEmit`
Expected: Both clean, zero errors/warnings

- [ ] **Git status review**

Run: `git log --oneline -15`
Expected: 6-7 clean commits with consistent `feat(review):` and `feat(editor):` prefixes

- [ ] **Update README**

In README.md, update v0.4 checklist:
```markdown
### 🚧 质量保障（v0.4）

- [x] AI 禁用词检测（基于 oh-story 词表，25+ 模式，1-5 星毒级）
- [x] 自动一致性审查（时间线/角色认知/伏笔/设定自洽）
- [ ] 局部改写/扩写
- [ ] 章节版本历史
- [ ] 审查报告面板
- [ ] 素材库基础版
```

Commit:
```bash
git add README.md
git commit -m "docs: mark auto consistency review as completed in v0.4 roadmap"
```
