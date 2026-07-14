# 伏笔模块完善 — 阶段三：健康度审计

## TL;DR

> **Quick Summary**: 新增伏笔健康度评分面板 + ⚙ 阈值配置，同时修复 consistencyCheck 和 reviewService 中遗留的「从章节 ID 抠数字」旧模式，增强一致性审查和章节关系图。
>
> **Deliverables**:
> - `foreshadowHealth.ts` — 健康度评分函数
> - `ForeshadowPanel.tsx` — 健康度卡片 + ⚙ 配置面板
> - `consistencyCheck.ts` — 签名重构 + 3 项增强检查
> - `chapterGraphService.ts` — 首次推进边区分
> - `reviewRules.ts` — 新增密度字段
> - `ReviewPanel.tsx` + `savePipeline.ts` + `reviewService.ts` — 清理旧模式
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 6

---

## Context

### Original Request
伏笔模块完善计划阶段三，新增健康度审计功能。详见 `doc/伏笔模块完善计划.md` §三。阶段一、二已完成。

### Interview Summary
- consistencyCheck 签名 `currentChapter: number` → `currentChapterId: string`（调用方传的 number 本身就是错的）
- 无 `targetChapterId` 的伏笔在 overdue 检查中跳过
- 两套配置独立：`ConsistencyThresholds` 管审查，`ForeshadowConfig` 管 UI
- ⚙ 配置面板 inline 展开，改阈值即时生效
- `checkResolutionDelay` 阈值 = 3 章；健康度卡片放 stats 和 filters 之间
- 代码审计：7 处 `replace('ch', '')` 残留，4 处在阶段三修复，3 处推迟到 follow-up

---

## Work Objectives

### Core Objective
将伏笔模块从「可操作的管理工具」升级为「可量化评估的质量面板」。

### Concrete Deliverables
- `src/services/foreshadowHealth.ts` **新建**
- `src/components/ForeshadowPanel.tsx` 健康度卡片 + ⚙ 配置面板
- `src/services/consistencyCheck.ts` 签名重构 + 新增 2 检查
- `src/services/chapterGraphService.ts` 首次推进边
- `src/services/reviewRules.ts` 新增密度字段
- `src/components/ReviewPanel.tsx`、`src/services/savePipeline.ts`、`src/services/reviewService.ts` 清理旧模式
- `src/types/review.ts` `ConsistencyCheckType` 新增 2 个 type

### Must Have
- `calcForeshadowHealth()` 评分公式：100 - critical×10 - background×3 - density_penalty
- 健康度卡片展示评分、回收率条、四级统计、密度
- consistencyCheck 参数改为 `currentChapterId: string`
- 所有新增伏笔检查项标 S4
- chapterGraphService 首次推进边 `type: 'foreshadow-first'`

### Must NOT Have
- 不改 `ForeshadowConfig` 或 `ForeshadowEntry` 类型
- 不改 `contextEngine/` 或 `ChapterManager.tsx`（推迟到 follow-up）
- 不用 `height: calc(100vh - Npx)`
- 不新增 npm 依赖或测试框架
- 不用 Modal 做配置面板

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **QA**: Agent-executed scenarios ONLY

---

## Execution Strategy

```
Wave 1 (foundation):
├── Task 1: foreshadowHealth.ts 新建 [quick]
└── Task 2: reviewRules.ts 新增密度字段 [quick]

Wave 2 (core logic, MAX PARALLEL):
├── Task 3: consistencyCheck.ts 签名重构 + 增强 [deep]
├── Task 4: chapterGraphService.ts 首次推进边 [quick]
└── Task 5: reviewService.ts 清理抠数字 [quick]

Wave 3 (UI + caller fixes):
├── Task 6: ForeshadowPanel.tsx 健康度卡片 + 配置面板 [visual-engineering]
├── Task 7: ReviewPanel.tsx 修复 caller [quick]
└── Task 8: savePipeline.ts 修复 caller [quick]

Wave FINAL: F1-F4 parallel reviews
```

Dependencies: 1→6, 2→3, 3→7,8

---

## TODOs

- [ ] 1. 新建 `src/services/foreshadowHealth.ts` — 健康度评分函数

  **What to do**:
  - 实现 `calcForeshadowHealth(entries, currentChapterId, chapters, config): number`
  - 评分公式：`score = 100 - critical×10 - background×3 - density_penalty`，clamp [0, 100]
  - 复用 `classifyForeshadows(entries, currentChapterId, chapters, config)` 做四级分桶
  - `density_penalty = Math.round((density - config.densityWarningThreshold) * 100)` 仅当超过阈值
  - `density = unresolved.length / Math.max(1, currentOrder)`
  - 导出 `getHealthLabel(score)` → ≥90"优秀"/≥70"良好"/≥50"一般"/<50"欠佳"
  - 导出 `calcForeshadowDensity(entries, currentChapterId, chapters)` 供面板用
  - currentChapterId 为 null 或无 unresolved 条目时返回 100

  **Must NOT do**: 不引入依赖、不调 I/O、不改现有类型

  **Agent**: `quick` | **Wave**: 1 | **Blocks**: Task 6

  **Refs**: `foreshadowContext.ts:24-80` classifyForeshadows, `novel.ts:31-68` types

  **QA Scenarios**:
  ```
  Scenario: perfect score — 无未解伏笔 → 返回 100
  Scenario: critical penalty — 3条critical → 100-30=70
  Scenario: density penalty — density=0.6, threshold=0.3 → penalty=30
  ```
  **Evidence**: task-1-perfect-score.txt, task-1-critical-penalty.txt, task-1-density-penalty.txt
  **Commit**: `feat(foreshadow): add health scoring function`

- [ ] 2. 修改 `src/services/reviewRules.ts` — ConsistencyThresholds 新增密度字段

  **What to do**:
  - `ConsistencyThresholds` 新增 `densityWarningThreshold?: number`（默认 0.3）、`densityLowThreshold?: number`（默认 0.05）
  - `getDefaultReviewRules()` 的 consistency 对象中加入默认值
  - 字段可选保证向后兼容

  **Agent**: `quick` | **Wave**: 1 | **Blocks**: Task 3

  **Refs**: `reviewRules.ts:25-36` 接口, `reviewRules.ts:99-105` 默认值

  **QA**: type check — `getDefaultReviewRules().consistency.densityWarningThreshold === 0.3`
  **Evidence**: task-2-density-fields.txt
  **Commit**: 与 Task 1 同组 — `feat(foreshadow): add health scoring + density thresholds`

- [ ] 3. 重构 `src/services/consistencyCheck.ts` — 签名改造 + 增强检查

  **What to do**:

  **3a. 签名改造**：
  - `runConsistencyChecks` 参数 `currentChapter: number` → `currentChapterId: string`
  - 内部新增 `const chapters = await listChapters(projectId)`
  - 新增 `getOrder(chapterId, chapters)` helper

  **3b. checkDormantForeshadow**：删除所有 `Number(xxx.replace('ch', ''))`，改用 `getOrder`
  
  **3c. checkOverdueForeshadow**：优先用 `entry.targetChapterId` → `getOrder`；无 target 则跳过；severity 全部 S4

  **3d. 新增 checkResolutionDelay**：已回收伏笔，`resolvedOrder - targetOrder > 3` → S4；给 `ConsistencyCheckType` 新增 `'resolution_delay'`

  **3e. 新增 checkForeshadowDensity**：用 `densityWarningThreshold`/`densityLowThreshold` 判断，全部 S4；给 `ConsistencyCheckType` 新增 `'foreshadow_density'`

  **Must NOT do**: 不改 checkAbsentCharacter / checkTimelineOrder

  **Agent**: `deep` | **Wave**: 2 | **Blocked By**: Task 2 | **Blocks**: Task 7, 8

  **Refs**: `consistencyCheck.ts` 全文, `review.ts:73-78` ConsistencyCheckType

  **QA Scenarios**:
  ```
  overdue 用 targetChapterId 而非 plantedChapterId
  无 targetChapterId → 跳过
  resolution delay 检测（target=50, resolved=55 → delay=5）
  density 警告（6条/10章=0.6 > 0.3 → S4）
  ```
  **Evidence**: task-3-*.txt (4 files)
  **Commit**: `refactor(consistency): use chapterId instead of extracted numbers, add delay/density checks`

- [ ] 4. 增强 `src/services/chapterGraphService.ts` — 首次推进边

  **What to do**:
  - `ChapterEdge.type` 新增 `'foreshadow-first'`
  - 对每个 entry，按 timestamp 排序 clues，最早一条 → `type: 'foreshadow-first'`，其余 → `type: 'foreshadow'`
  - 边 label 含 clue 描述：`` `推进: ${name} — ${clue.description.slice(0, 20)}` ``
  - `ChapterGraph.tsx` 的 `EDGE_COLORS` 新增 `foreshadow-first: '#95a5a6'`

  **Agent**: `quick` | **Wave**: 2

  **QA**: 最早 clue 边 type='foreshadow-first'；label 含截断描述
  **Evidence**: task-4-first-push-edge.txt, task-4-edge-label.txt
  **Commit**: 与 Task 5 同组 — `feat(foreshadow): enhance chapter graph first-push edges, fix reviewService ordering`

- [ ] 5. 修复 `src/services/reviewService.ts` — 清理抠数字

  **What to do**:
  - line 274 `chapterIdToLabel`：`parseInt(m[0], 10)` → 用 `chapters.find(c => c.id === chapterId)?.title ?? chapterId`
  - lines 349-350 排序：`parseInt(…match(/\d+/))` → `chapters.find(c => c.id === a.chapterId)?.order ?? 0`
  - 需要确认调用方能否传入 chapters 列表

  **Agent**: `quick` | **Wave**: 2

  **QA**: chapterIdToLabel("ch005", chapters) where ch005.title="第8章 转折" → "第8章 转折"
  **Evidence**: task-5-label-fix.txt
  **Commit**: 与 Task 4 同组

- [ ] 6. 修改 `src/components/ForeshadowPanel.tsx` — 健康度卡片 + ⚙ 配置面板

  **What to do**:

  **6a. 健康度卡片**（`foreshadow-stats` 和 `foreshadow-filters` 之间）：
  - import `calcForeshadowHealth`, `calcForeshadowDensity`
  - 评分行：`📊 伏笔健康度 {score}/100` + 标签
  - 回收率条：`总数/已回收/活跃` + 进度条
  - 四级统计（复用 classifyForeshadows）
  - 密度行：`{N}条活跃/{M}章 = {d}/章 ✅/⚠️`
  - 空数据时隐藏

  **6b. ⚙ 配置面板**（stats 右侧加 ⚙ 按钮）：
  - state: `showConfig`, `configForm`（初始值 = foreshadowConfig）
  - Inline 展开在健康度卡片下方
  - 4 个 `<input type="number">`：dormantThreshold(20)、upcomingWindow(10)、densityWarningThreshold(0.3)、densityLowThreshold(0.05)
  - 按钮：`[保存]` → saveForeshadowConfig + setForeshadowConfig + 关闭
  - `[取消]` → 恢复原值 + 关闭
  - `[恢复默认]` → setConfigForm(DEFAULT_FORESHADOW_CONFIG)

  **Must NOT do**: 不用 Modal、不破坏现有结构、不用 calc()

  **Agent**: `visual-engineering` | **Wave**: 3 | **Blocked By**: Task 1

  **QA Scenarios**:
  ```
  健康度卡片渲染（有数据）
  健康度卡片隐藏（无数据）
  配置面板保存（阈值持久化）
  配置面板取消（修改丢弃）
  ```
  **Evidence**: task-6-*.png (4 files)
  **Commit**: `feat(foreshadow): add health dashboard + config panel`

- [ ] 7. 修复 `src/components/ReviewPanel.tsx` — 传 chapterId

  **What to do**:
  - 删除 line 165 `const chapterNum = parseInt(expandedChapter!.replace(/\D/g, ''), 10) || 1`
  - line 167 `runConsistencyChecks(projectId, chapterNum, ...)` → `runConsistencyChecks(projectId, expandedChapter!, ...)`

  **Agent**: `quick` | **Wave**: 3 | **Blocked By**: Task 3

  **QA**: tsc --noEmit 零错误
  **Evidence**: task-7-caller-fix.txt
  **Commit**: 与 Task 8 同组 — `fix(consistency): pass chapterId to consistencyCheck`

- [ ] 8. 修复 `src/services/savePipeline.ts` — 传 chapterId

  **What to do**:
  - line 178 `runConsistencyChecks(projectId, input.chapterNumber, ...)` → `runConsistencyChecks(projectId, input.chapterId, ...)`

  **Agent**: `quick` | **Wave**: 3 | **Blocked By**: Task 3

  **QA**: tsc --noEmit 零错误
  **Evidence**: task-8-caller-fix.txt
  **Commit**: 与 Task 7 同组

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read plan end-to-end. Verify each Must Have exists, each Must NOT Have absent. Check evidence files.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `npm run build`. Check for `as any`, empty catches, `console.log`, unused imports, AI slop.
  Output: `Build [PASS/FAIL] | TypeScript [N errors] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Execute EVERY QA scenario from EVERY task. Cross-task: health card ← calcForeshadowHealth, consistencyCheck ← new signature.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify 1:1 — everything in spec built, nothing beyond spec. Check Must NOT do. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | VERDICT`

---

## Commit Strategy

- **1–2**: `feat(foreshadow): add health scoring + density thresholds` — foreshadowHealth.ts, reviewRules.ts
- **3**: `refactor(consistency): use chapterId instead of extracted numbers, add delay/density checks` — consistencyCheck.ts, types/review.ts
- **4–5**: `feat(foreshadow): enhance chapter graph first-push edges, fix reviewService ordering` — chapterGraphService.ts, ChapterGraph.tsx, reviewService.ts
- **6**: `feat(foreshadow): add health dashboard + config panel` — ForeshadowPanel.tsx, style.css
- **7–8**: `fix(consistency): pass chapterId to consistencyCheck` — ReviewPanel.tsx, savePipeline.ts

---

## Success Criteria

### Verification Commands
```bash
npx tsc --noEmit    # Expected: zero errors
npm run build       # Expected: build succeeds
```

### Final Checklist
- [ ] 健康度面板显示评分和关键指标
- [ ] ⚙ 配置面板可修改 4 个阈值并即时生效
- [ ] 一致性审查使用 targetChapterId 精准判定
- [ ] 章节关系图显示首次推进灰色虚线
- [ ] 旧模式 `replace('ch', '')` 在阶段三涉及文件清零
- [ ] `npx tsc --noEmit` 零错误，`npm run build` 成功
