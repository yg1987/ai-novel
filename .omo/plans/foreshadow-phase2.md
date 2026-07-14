# 伏笔模块完善 — 阶段二：AI 上下文智能分级

## TL;DR

> **Quick Summary**: 将当前扁平化的 AI 伏笔上下文注入替换为四级分桶分类系统（critical/upcoming/active/background），同时补齐阶段一遗漏的 clues 编辑、角色下拉选择器、双向导航和 config 驱动紧迫度。
>
> **Deliverables**:
> - `src/services/foreshadowContext.ts` — classifyForeshadows 四级分类 + prompt 格式化
> - `src/contextEngine/sources.ts` — foreshadowDS 接入新分类
> - `src/components/ForeshadowPanel.tsx` — clues 编辑 UI + 角色下拉选择器 + config 紧迫度 + 4 级 CSS
> - `src/components/CharacterPanel.tsx` — view 模式关联伏笔列表
> - `src/components/ProjectView.tsx` — 角色→伏笔反向导航
> - `src/style.css` — 4 级紧迫度样式
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves (1 + 4)
> **Critical Path**: Task 1 → Task 2 (sources.ts) + Task 3 (ForeshadowPanel)

---

## Context

### Original Request
用户要求启动伏笔模块完善计划（`doc/伏笔模块完善计划.md`）的阶段二。阶段一已完成并修复了基础可用性问题（章节 ID 标识、手动 CRUD、数据模型重写）。

### Interview Summary
**Key Discussions**:
- 阶段一已超额完成多项阶段二规格内的 UI（角色 chip、角色分组 AI 注入、targetChapterId/resolutionPlan 字段），实际阶段二范围缩小
- 用户确认 3 项补充：clues 表单编辑、config 驱动紧迫度、角色选择器改为下拉
- 测试策略：Tests after（无现有测试框架，不在此阶段搭建）
- 所有改动限于前端 TypeScript + CSS，不涉及 Rust 后端

**Research Findings** (4 个并行 explore agent):
- `ForeshadowPanel.tsx:52-67` getUrgency 仍硬编码 15/30 章阈值
- `sources.ts:47-109` foreshadowDS 已实现角色分组注入但使用扁平格式
- `ForeshadowPanel.tsx:69-79` FormData 中 clues 字段缺失
- `CharacterPanel.tsx:554-566` 关联伏笔仅在编辑模式可见
- `ForeshadowConfig` schema 足够：dormantThreshold(20), upcomingWindow(10) 可直接用于四级分类
- `project.json` 无测试依赖，无 vitest/jest

### Metis Review
**Identified Gaps** (addressed):
- ForeshadowConfig schema 疑虑：已验证字段足够，无需新增
- CSS 文件遗漏：已加入改动范围（6 个文件）
- 测试框架缺失：明确排除于阶段二范围
- getUrgency 替换策略：用 classifyForeshadows lookup 替代整个函数，非打补丁

---

## Work Objectives

### Core Objective
将伏笔 AI 上下文从「全部未解伏笔平铺注入」升级为「按紧迫度四级分桶 + 角色关联分组的智能注入」，同时在 ForeshadowPanel 中补齐 clues 编辑、角色下拉和 config 紧迫度。

### Concrete Deliverables
- `src/services/foreshadowContext.ts` 新建，导出 classifyForeshadows / classifiedForeshadowsToText / ForeshadowUrgency 类型
- `src/contextEngine/sources.ts` foreshadowDS.load() 从 flat 格式改为四级分桶输出
- `src/components/ForeshadowPanel.tsx` 新增 clues 编辑 UI、角色下拉选择器、getUrgency → classify lookup、4 级紧迫度 CSS
- `src/components/CharacterPanel.tsx` view 模式（非编辑）显示关联伏笔列表
- `src/components/ProjectView.tsx` 新增 navigateForeshadowId 状态 + 反向导航回调
- `src/style.css` 新增 .urgency-critical / .urgency-upcoming / .urgency-active / .urgency-background

### Definition of Done
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npm run build` 成功
- [ ] `lsp_diagnostics` 全部 6 个修改文件零 error
- [ ] AI 续写时上下文注入显示四级分桶格式
- [ ] 伏笔面板紧迫度跟随当前章节实时更新，使用 config 阈值
- [ ] Clues 可在新增/编辑表单中添加、删除
- [ ] 角色选择器为下拉多选，选中项显示 chip
- [ ] 角色面板查看模式显示关联伏笔列表，点击跳转到伏笔面板
- [ ] 伏笔面板角色 chip 点击跳转到角色面板

### Must Have
- classifyForeshadows() 四级判定规则严格按计划实现
- foreshadowDS 输出保持现有角色分组能力，叠加四级分桶
- 所有 6 个文件 TypeScript 编译零错误
- 角色→伏笔、伏笔→角色双向导航可工作

### Must NOT Have (Guardrails)
- **绝不新增 ForeshadowEntry 或 ForeshadowConfig 字段** — 现有 schema 足够
- **绝不修改 foreshadowStorage.ts 或 contextEngine/index.ts** — 已确认无需改动
- **绝不引入组件库或测试框架** — 纯手写 UI + agent QA
- **绝不重构 ForeshadowPanel 整体结构** — 外科手术式改动
- **绝不删除现有角色分组逻辑** — 保留 sources.ts 中按出场角色分组的代码，在其之上叠加分桶
- **绝不添加"view mode"系统到 CharacterPanel** — 仅在现有结构上加关联伏笔 section
- **绝不硬编码阈值** — 所有阈值从 ForeshadowConfig 读取
- **绝不使用 `height: calc(100vh - Npx)`** — 遵循 AGENTS.md 的 flex 链布局

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None (Tests after — no framework in project)
- **Framework**: N/A
- **QA**: Agent-executed scenarios ONLY (bash + Playwright for UI)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright — navigate, interact, assert DOM, screenshot
- **CLI/API**: Bash — curl / tauri command / tsc --noEmit
- **Library/Module**: Bash — import in bun/node REPL, call function, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: foreshadowContext.ts 新建 — classifyForeshadows + classifiedForeshadowsToText [quick]

Wave 2 (After Wave 1 — MAX PARALLEL, 4 concurrent):
├── Task 2: sources.ts foreshadowDS 集成 (depends: Task 1) [quick]
├── Task 3: ForeshadowPanel.tsx 紧迫度 + clues + 下拉 + CSS (depends: Task 1) [visual-engineering]
├── Task 4: CharacterPanel.tsx view 模式关联伏笔 [quick]
└── Task 5: ProjectView.tsx 双向导航 [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 (largest UI task)
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

- **1**: — → 2, 3
- **2**: 1 → —
- **3**: 1 → —
- **4**: — → —
- **5**: — → —
- **F1–F4**: ALL → user okay

### Agent Dispatch Summary

- **Wave 1**: 1 — Task 1 → `quick`
- **Wave 2**: 4 — Task 2 → `quick`, Task 3 → `visual-engineering`, Task 4 → `quick`, Task 5 → `quick`
- **Wave FINAL**: 4 — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**
> **FORMAT**: Task labels MUST use bare numbers.

- [ ] 1. 新建 `src/services/foreshadowContext.ts` — 四级分桶分类引擎

  **What to do**:
  - 创建 `src/services/foreshadowContext.ts`
  - 定义 `ForeshadowUrgency = 'critical' | 'upcoming' | 'active' | 'background'` 类型
  - 实现 `classifyForeshadows(entries: ForeshadowEntry[], currentChapterId: string | null, chapters: ChapterMeta[], config: ForeshadowConfig): Record<ForeshadowUrgency, ForeshadowEntry[]>`
    - **critical**: `targetChapterId` 存在 且 `getChapterOrder(targetChapterId) ≤ getChapterOrder(currentChapterId)` → 该回收/已超期
    - **upcoming**: `targetChapterId` 存在 且 `1 ≤ order_diff ≤ config.upcomingWindow` → 近期需铺垫
    - **active**: `status === 'advanced'` 且 `clues.length > 0`，最近一条 clue 的章节 order 距离当前 ≤ `config.dormantThreshold`
    - **background**: 其余所有未解伏笔（status ≠ resolved/abandoned）
  - 辅助函数：`getClueChapterOrder(clue: ForeshadowClue, chapters: ChapterMeta[]): number` → 从 clue.chapterId 查 chapters 获取 order
  - 辅助函数：`isClueRecent(clue: ForeshadowClue, currentOrder: number, chapters: ChapterMeta[], dormantThreshold: number): boolean`
  - 实现 `classifiedForeshadowsToText(classified: Record<ForeshadowUrgency, ForeshadowEntry[]>, currentChars?: string[]): string`
    - 生成四级分桶 markdown 输出，每级包含标题行 + 条目列表
    - 🔴 必须处理 / 🟡 近期铺垫 / 🔵 进行中 / ⚪ 已埋设
    - 如果传入 `currentChars`，追加「👤 本章出场角色关联的伏笔」section
    - 空级不输出
  - 如 `currentChapterId` 为 null，所有条目归入 `background`
  - 使用现有的 `getChapterOrder` 模式（`chapters.find(c => c.id === chapterId)?.order ?? 0`）

  **Must NOT do**:
  - 不引入新的 npm 依赖
  - 不调用任何 async I/O 函数（纯函数，接收所有数据作为参数）
  - 不修改现有类型定义文件
  - 不硬编码阈值数字

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 纯 TypeScript 纯函数模块，逻辑清晰、范围精确，无 UI 工作
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（独立执行，无可并行任务）
  - **Blocks**: Task 2（sources.ts）, Task 3（ForeshadowPanel）
  - **Blocked By**: None（可以立即开始）

  **References**:

  **Pattern References**:
  - `src/components/ForeshadowPanel.tsx:41-50` — `getChapterOrder()` / `getChapterLabel()` 辅助函数模式（通过 chapters 数组查找章节信息）

  **API/Type References**:
  - `src/types/novel.ts:25-29` — `ForeshadowClue` 接口（chapterId, description, timestamp）
  - `src/types/novel.ts:31-47` — `ForeshadowEntry` 完整字段
  - `src/types/novel.ts:56-61` — `ForeshadowConfig` 接口（dormantThreshold, upcomingWindow, densityWarningThreshold, densityLowThreshold）
  - `src/types/novel.ts:63-68` — `DEFAULT_FORESHADOW_CONFIG` 常量
  - `src/types/chapter.ts:1-6` — `ChapterMeta` 接口（id, title, order, volume）

  **Existing code to replace/parallel**:
  - `src/contextEngine/sources.ts:24-30` — `foreshadowToText()` 函数（新模块将提供替代方案）
  - `src/contextEngine/sources.ts:72-104` — `foreshadowDS.load()` 中的角色分组逻辑（新模块需与其共存）

  **WHY Each Reference Matters**:
  - `getChapterOrder` — 分类引擎需要将 chapterId 映射到 order number，复用此模式
  - `ForeshadowEntry` / `ForeshadowConfig` — 函数签名和判定规则的完整数据契约
  - `foreshadowToText` — 理解当前输出格式以设计更丰富的替代方案
  - `foreshadowDS.load()` 角色分组 — 确保新分类系统与此现有行为兼容

  **Acceptance Criteria**:

  **If TDD (tests enabled)**: N/A（无测试框架）

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: critical classification — target chapter has passed
    Tool: Bash (bun repl)
    Preconditions: TypeScript 编译通过
    Steps:
      1. 在 bun repl 中导入 classifyForeshadows
      2. 构造测试数据：1 条伏笔 targetChapterId="ch005"，currentChapterId="ch008"
      3. chapters 包含 ch005(order:5), ch008(order:8)
      4. 调用 classifyForeshadows(entries, "ch008", chapters, DEFAULT_FORESHADOW_CONFIG)
    Expected Result: 该伏笔出现在 critical 数组中（target order 5 ≤ current order 8）
    Failure Indicators: 伏笔不在 critical 数组或抛出异常
    Evidence: .omo/evidence/task-1-critical-classification.txt

  Scenario: upcoming classification — target is within upcomingWindow
    Tool: Bash (bun repl)
    Preconditions: 同上
    Steps:
      1. 构造数据：伏笔 targetChapterId="ch012"，currentChapterId="ch008"
      2. chapters: ch008(order:8), ch012(order:12)，order_diff=4，upcomingWindow=10
      3. 调用 classifyForeshadows
    Expected Result: 伏笔在 upcoming 数组中（4 ≤ 10）
    Evidence: .omo/evidence/task-1-upcoming-classification.txt

  Scenario: active classification — recently advanced foreshadow
    Tool: Bash (bun repl)
    Preconditions: 同上
    Steps:
      1. 构造数据：伏笔 status="advanced"，clues 最近一条 chapterId="ch007"
      2. chapters: ch007(order:7), ch008(order:8)，距离=1，dormantThreshold=20
      3. 无 targetChapterId
      4. 调用 classifyForeshadows
    Expected Result: 伏笔在 active 数组中（1 ≤ 20）
    Evidence: .omo/evidence/task-1-active-classification.txt

  Scenario: background classification — stale foreshadow with no target
    Tool: Bash (bun repl)
    Preconditions: 同上
    Steps:
      1. 构造数据：伏笔 status="planted"，无 targetChapterId，无 clues
      2. 调用 classifyForeshadows
    Expected Result: 伏笔在 background 数组中
    Evidence: .omo/evidence/task-1-background-classification.txt

  Scenario: empty input — no unresolved foreshadows
    Tool: Bash (bun repl)
    Preconditions: 同上
    Steps:
      1. 传入空的 entries 数组
      2. 调用 classifyForeshadows 和 classifiedForeshadowsToText
    Expected Result: classifyForeshadows 返回四个空数组；classifiedForeshadowsToText 返回空字符串
    Evidence: .omo/evidence/task-1-empty-input.txt

  Scenario: null currentChapterId — all background
    Tool: Bash (bun repl)
    Preconditions: 同上
    Steps:
      1. 构造数据：伏笔有 targetChapterId="ch005"，但 currentChapterId=null
      2. 调用 classifyForeshadows
    Expected Result: 所有伏笔在 background 数组中
    Evidence: .omo/evidence/task-1-null-chapter.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-critical-classification.txt
  - [ ] task-1-upcoming-classification.txt
  - [ ] task-1-active-classification.txt
  - [ ] task-1-background-classification.txt
  - [ ] task-1-empty-input.txt
  - [ ] task-1-null-chapter.txt

  **Commit**: YES
  - Message: `feat(foreshadow): add four-level urgency classification engine`
  - Files: `src/services/foreshadowContext.ts`

- [ ] 2. 改造 `src/contextEngine/sources.ts` — foreshadowDS 接入四级分桶

  **What to do**:
  - 在 sources.ts 顶部新增 import：
    - `import { classifyForeshadows, classifiedForeshadowsToText } from '../services/foreshadowContext'`
    - `import { loadForeshadowConfig } from '../services/foreshadowStorage'`
    - `import { listChapters } from '../api/tauri'`
  - 修改 `foreshadowDS.load()` 函数（lines 47-109）：
    1. 保留现有的 `loadForeshadows(ctx.projectId)` 调用（line 52）
    2. 保留现有的 snapshot 角色加载逻辑（lines 60-69）→ 获取 `currentChars`
    3. 新增：`const chapters = await listChapters(ctx.projectId)` → 获取章节顺序信息
    4. 新增：`const config = await loadForeshadowConfig(ctx.projectId)` → 获取阈值配置
    5. 过滤未解伏笔（保留现有逻辑：status !== resolved/abandoned）
    6. 调用 `classifyForeshadows(unresolved, ctx.chapterId, chapters, config)` → 获得四级分桶
    7. 调用 `classifiedForeshadowsToText(classified, currentChars)` → 生成 markdown
    8. 返回生成的文本（空字符串表示无需注入）
  - 保留 `foreshadowToText()` 函数不动（它仍是纯函数，可能在其他上下文有用）
  - `foreshadowDS.name` 和 `foreshadowDS.priority: 5` 保持不变

  **Must NOT do**:
  - 不修改 ContextLoadContext 接口
  - 不删除 foreshadowToText 函数
  - 不修改其他 DataSource
  - 不改变 foreshadowDS 的 name / priority

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 仅修改一个函数的内部逻辑，范围精确，接入已完成的分类模块
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 Task 3, 4, 5 并行）
  - **Blocks**: None
  - **Blocked By**: Task 1（依赖 classifyForeshadows 类型和函数）

  **References**:

  **Pattern References**:
  - `src/contextEngine/sources.ts:47-109` — 当前 `foreshadowDS.load()` 完整实现（保留结构，替换内部逻辑）
  - `src/contextEngine/sources.ts:14-22` — `cognitionToText()` 辅助函数模式（同级 markdown 生成器参考）

  **API/Type References**:
  - `src/contextEngine/dataSource.ts:2-15` — `ContextLoadContext` 和 `DataSource<T>` 接口
  - `src/services/foreshadowStorage.ts` — `loadForeshadows(projectId)` 和 `loadForeshadowConfig(projectId)` 签名
  - `src/api/tauri.ts:32` — `listChapters(projectId): Promise<ChapterMeta[]>`

  **Test References**: N/A

  **WHY Each Reference Matters**:
  - `foreshadowDS.load()` 当前实现 — 这是要被修改的代码，必须理解现有结构和角色分组逻辑
  - `DataSource<T>` — 确保 load() 返回类型和签名不变
  - `listChapters` — 分类引擎需要章节顺序信息进行判定

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: foreshadowDS returns classified output with character grouping
    Tool: Bash (bun repl)
    Preconditions: Task 1 完成，foreshadowContext.ts 可用
    Steps:
      1. 导入 foreshadowDS 并调用 load() 方法
      2. ctx: projectId="test", chapterId="ch005", chapterNumber=5, targetWords=3000
      3. 确保 foreshadows.json 包含多条不同状态的伏笔
      4. 检查返回的文本内容
    Expected Result: 返回字符串包含 🔴/🟡/🔵/⚪ 四级标记，出场角色关联的伏笔在 👤 section 中
    Failure Indicators: 返回空字符串（数据正常情况下）、仍然是旧格式（[已埋设]/[推进中]）
    Evidence: .omo/evidence/task-2-classified-output.txt

  Scenario: empty foreshadows — returns empty string
    Tool: Bash (bun repl)
    Preconditions: foreshadows.json 为空或全部已回收/废弃
    Steps:
      1. 调用 foreshadowDS.load(ctx)
    Expected Result: 返回空字符串（''），不影响 prompt 组装
    Evidence: .omo/evidence/task-2-empty-output.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-classified-output.txt
  - [ ] task-2-empty-output.txt

  **Commit**: YES（与 Task 3 同组提交）
  - Message: `feat(foreshadow): integrate four-level classification into context engine and panel`
  - Files: `src/contextEngine/sources.ts`

- [ ] 3. 修改 `src/components/ForeshadowPanel.tsx` + `src/style.css` — 紧迫度 + clues 编辑 + 角色下拉

  **What to do**:

  **3a. 紧迫度改为 classifyForeshadows 驱动**:
  - 新增 import：`import { classifyForeshadows, type ForeshadowUrgency } from '../services/foreshadowContext'` 和 `import { loadForeshadowConfig } from '../services/foreshadowStorage'`
  - 新增 state：`const [foreshadowConfig, setForeshadowConfig] = useState(DEFAULT_FORESHADOW_CONFIG)`
  - 在 `refresh()` 中加载 config：`const config = await loadForeshadowConfig(projectId); setForeshadowConfig(config)`
  - 新增函数：`getForeshadowUrgency(entry: ForeshadowEntry, classified: Record<ForeshadowUrgency, ForeshadowEntry[]>): ForeshadowUrgency` → 在分桶结果中查找该伏笔属于哪个级别
  - 在渲染循环中（line ~326）：调用 `classifyForeshadows(filtered, currentChapterId, chapters, foreshadowConfig)` 得到分桶结果，每个 card 用 `getForeshadowUrgency` 确定级别
  - 移除旧的 `getUrgency` 函数（lines 52-67）
  - Card 的 urgency badge 改用新四级标签：`🔴 必须回收` / `🟡 即将到期` / `🔵 推进中` / `⚪ 已埋设`

  **3b. Clues 编辑 UI**:
  - 在 `FormData` 接口中新增 `clues: ForeshadowClue[]` 字段
  - 在 `openEdit` 时初始化：`clues: entry.clues`；`openCreate` 时初始化：`clues: []`
  - 在 `handleSave` 中：写入 `clues: form.clues`（替换当前的 `clues: []` 或 `clues: entry.clues`）
  - 在表单 advanced 区域新增「推进轨迹」子区域（在角色多选下方）：
    - 标题：「📋 推进轨迹」
    - 已有 clue 列表：每行显示章节下拉 + `<input>` 描述 + `[删除]` 按钮
    - `[+ 添加推进记录]` 按钮 → 在 clues 数组末尾追加 `{ chapterId: '', description: '', timestamp: new Date().toISOString() }`
    - 删除操作：从 `form.clues` 中移除对应索引项
  - Clues 时间线在 card 上的展示保留不变（lines 370-382），仅改为从 `form.clues` 读取

  **3c. 角色选择器改为下拉多选**:
  - 替换当前的 checkbox 列表（lines 484-502）为下拉多选
  - 下拉按钮：显示 `已选 {N} 个角色`，点击展开/收起下拉面板
  - 下拉面板：最大高度 200px，overflow-y: auto，每行一个 checkbox
  - 选中的角色在面板下方显示为 chip（可点击删除）
  - 无角色时：显示「暂无角色记录，请在角色面板中创建」
  - 使用 `selectedChars` 变量追踪已选，`availableChars` 为全量角色列表
  - 保留 `toggleCharacter` 逻辑，适配新 UI

  **3d. 新增 highlightId prop**:
  - Props 新增 `highlightId?: string | null`
  - 当 `highlightId` 变化时，滚动到对应伏笔卡片并添加高亮 CSS class
  - 3 秒后自动移除高亮

  **3e. CSS (src/style.css)**:
  - 新增 4 个紧迫度 class：`.urgency-critical`（红色边框/背景）、`.urgency-upcoming`（黄色）、`.urgency-active`（蓝色）、`.urgency-background`（灰色）
  - 新增角色下拉面板样式：`.character-dropdown`、`.character-dropdown-panel`、`.character-chip`
  - 新增 clues 编辑样式：`.clues-editor`、`.clue-row`
  - 替换旧 `.urgency-critical`/`.urgency-warning`/`.urgency-normal` class 引用

  **Must NOT do**:
  - 不改变 card 的整体布局结构
  - 不修改 modal 的基本结构
  - 不改动 status 流转逻辑（推进/回收/废弃/重开按钮）
  - 不使用第三方 UI 库
  - 不修改 Pagination 组件

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 密集修改——紧迫度 badge、clues 编辑表单、角色下拉多选、CSS 样式、高亮 prop。涉及 JavaScript 交互逻辑 + CSS 视效
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**: `frontend-design`（仅修改现有 UI 组件，非全新设计）

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 Task 2, 4, 5 并行）
  - **Blocks**: None
  - **Blocked By**: Task 1（依赖 classifyForeshadows 类型）

  **References**:

  **Pattern References**:
  - `src/components/ForeshadowPanel.tsx:41-67` — 要替换的 getUrgency/getChapterOrder 函数
  - `src/components/ForeshadowPanel.tsx:69-79` — 要扩展的 FormData 接口
  - `src/components/ForeshadowPanel.tsx:123-136` — refresh() 中加载 chapters/characterNames 的模式（新增 config 加载）
  - `src/components/ForeshadowPanel.tsx:252-259` — toggleCharacter 逻辑（保留，适配新下拉 UI）
  - `src/components/ForeshadowPanel.tsx:353-366` — 现有角色 chip 渲染（参考其样式和点击行为）
  - `src/components/ForeshadowPanel.tsx:370-382` — 现有 clues 时间线展示（只读，保留）
  - `src/components/ForeshadowPanel.tsx:424-516` — 现有 modal 表单结构（在此框架内添加 clues editor）
  - `src/components/ForeshadowPanel.tsx:484-502` — 要替换的 checkbox 角色选择器

  **API/Type References**:
  - `src/services/foreshadowStorage.ts` — `loadForeshadowConfig(projectId)` 签名
  - `src/types/novel.ts:25-29` — `ForeshadowClue` 接口
  - `src/types/novel.ts:56-68` — `ForeshadowConfig` + `DEFAULT_FORESHADOW_CONFIG`

  **CSS References**:
  - `src/style.css` — 当前 `.foreshadow-*` 相关样式（查找以理解命名约定和设计 token）
  - AGENTS.md 布局约定 — flex 链、overflow 规则

  **WHY Each Reference Matters**:
  - getUrgency — 理解要替换的旧逻辑及其在 card 渲染中的使用位置
  - FormData + refresh + modal 结构 — 需要在这些现有代码中嵌入新功能，使用相同的模式
  - toggleCharacter — 保留其核心逻辑（数组操作），只换 UI
  - style.css foreshadow 样式 — 理解现有 class 命名约定和视觉 token

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: urgency badge shows four-level classification
    Tool: Playwright
    Preconditions: 应用中存在多条伏笔（不同状态和 targetChapterId）
    Steps:
      1. 导航到伏笔面板
      2. 选择一个靠后的章节作为当前章节
      3. 观察各伏笔卡片的紧迫度 badge
    Expected Result: 卡片显示 🔴/🟡/🔵/⚪ 四级标记，规则与 classifyForeshadows 一致
    Failure Indicators: 仍显示旧的 [已过N章未回收] 标签；紧迫度不跟随章节切换更新
    Evidence: .omo/evidence/task-3-urgency-badge.png

  Scenario: clues editor — add and delete clues in form
    Tool: Playwright
    Preconditions: 打开伏笔编辑表单的 advanced 区域
    Steps:
      1. 点击 [+ 添加推进记录]
      2. 选择章节，输入描述"在第 5 章通过对话暗示"
      3. 再次点击 [+ 添加推进记录]，添加第二条 clue
      4. 点击第二条 clue 的 [删除] 按钮
    Expected Result: 第一条 clue 保留在列表中，第二条被移除；保存后 card 上的时间线更新
    Failure Indicators: clue 添加失败；删除后列表未更新；保存后 card 时间线不显示新 clue
    Evidence: .omo/evidence/task-3-clues-editor.png

  Scenario: character dropdown — select and display chips
    Tool: Playwright
    Preconditions: 项目中有 ≥3 个角色
    Steps:
      1. 打开新增伏笔表单
      2. 点击角色选择下拉按钮
      3. 勾选 2 个角色
      4. 关闭下拉面板
    Expected Result: 下拉按钮显示"已选 2 个角色"；选中角色显示为 chip（可点击 × 删除）
    Failure Indicators: 仍是旧的 checkbox 列表；chip 不显示；删除无效
    Evidence: .omo/evidence/task-3-character-dropdown.png

  Scenario: highlightId prop — scroll and highlight on navigate
    Tool: Playwright
    Preconditions: 伏笔面板中有一批伏笔
    Steps:
      1. 通过 navigation 传入 highlightId（从 CharacterPanel 跳转过来）
      2. 观察目标卡片是否滚动到可见区域
      3. 观察高亮效果是否在 3 秒后消失
    Expected Result: 目标卡片滚动至视口中央，短暂高亮后恢复
    Failure Indicators: 不滚动、不亮、亮着不灭
    Evidence: .omo/evidence/task-3-highlight-navigation.png
  ```

  **Evidence to Capture**:
  - [ ] task-3-urgency-badge.png
  - [ ] task-3-clues-editor.png
  - [ ] task-3-character-dropdown.png
  - [ ] task-3-highlight-navigation.png

  **Commit**: YES（与 Task 2 同组提交）
  - Message: `feat(foreshadow): integrate four-level classification into context engine and panel`
  - Files: `src/components/ForeshadowPanel.tsx`, `src/style.css`

- [ ] 4. 修改 `src/components/CharacterPanel.tsx` — view 模式显示关联伏笔

  **What to do**:
  - 新增 prop：`onNavigateToForeshadow?: (id: string) => void`
  - 将 `char-foreshadows` 块（lines 554-566）从编辑分支（`{editing ? (`）内移到外面
  - 在编辑模式和查看模式（preview 分支）都渲染关联伏笔列表
  - 每个关联伏笔条目变为可点击 chip（或带链接的列表项），点击调用 `onNavigateToForeshadow(f.id)`
  - 查看模式下（`!editing`）：显示在 `.panel-preview` 下方，作为独立 section
  - 考虑简化版：查看模式下只显示伏笔数量 + 名称列表（不重复编辑模式的完整 UI）
  - CSS class：`char-foreshadows`（已有）适配两种模式

  **Must NOT do**:
  - 不引入"view mode"系统（不存在就加 section，不创建模式框架）
  - 不修改 CharacterPanel 的核心编辑/查看逻辑
  - 不修改 `relatedForeshadows` 的数据加载逻辑（lines 187-197 已在加载）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 将已有的 UI 块从编辑模式移到两种模式下都可访问，范围精确
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 Task 2, 3, 5 并行）
  - **Blocks**: None
  - **Blocked By**: None（不依赖 Task 1-3）

  **References**:

  **Pattern References**:
  - `src/components/CharacterPanel.tsx:536-586` — 编辑/查看模式分支，理解当前 `char-foreshadows` 的位置
  - `src/components/CharacterPanel.tsx:554-566` — 要移出的 `char-foreshadows` 块
  - `src/components/CharacterPanel.tsx:187-197` — `relatedForeshadows` 数据加载逻辑
  - `src/components/ForeshadowPanel.tsx:353-366` — 伏笔面板中的角色 chip（点击跳转模式，作为反向参考）

  **API/Type References**:
  - `src/components/CharacterPanel.tsx:13-16` — Props 接口（需新增 onNavigateToForeshadow）

  **CSS References**:
  - `src/style.css` — `.char-foreshadows` 已有样式

  **WHY Each Reference Matters**:
  - 编辑/查看分支 — 理解 props 结构和 placement 约束
  - `char-foreshadows` 块 — 这是要移动的代码
  - `relatedForeshadows` loader — 确认数据已可用
  - ForeshadowPanel character chip — 反向参考：角色 chip 点击跳转到角色面板，现在做伏笔 chip 点击跳转到伏笔面板

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: related foreshadows visible in view mode
    Tool: Playwright
    Preconditions: 某个角色有关联伏笔（在伏笔面板中设置了 relatedCharacters 包含该角色）
    Steps:
      1. 打开角色面板
      2. 选择一个有关联伏笔的角色
      3. 确保处于查看模式（非编辑模式）
      4. 滚动到面板底部
    Expected Result: 看到"关联伏笔"section，列出了所有关联伏笔的名称和状态
    Failure Indicators: 查看模式下不显示关联伏笔；切换编辑模式后才出现
    Evidence: .omo/evidence/task-4-view-mode-foreshadows.png

  Scenario: click related foreshadow navigates to foreshadow panel
    Tool: Playwright
    Preconditions: 角色有关联伏笔，click handler 已接线到 ProjectView
    Steps:
      1. 在角色面板查看模式中点击一个关联伏笔
      2. 观察 tab 切换和伏笔面板变化
    Expected Result: tab 切换到伏笔面板，目标伏笔被高亮或滚动到
    Failure Indicators: 点击无反应；tab 不切换；目标伏笔未定位
    Evidence: .omo/evidence/task-4-navigate-to-foreshadow.png
  ```

  **Evidence to Capture**:
  - [ ] task-4-view-mode-foreshadows.png
  - [ ] task-4-navigate-to-foreshadow.png

  **Commit**: YES（与 Task 5 同组提交）
  - Message: `feat(foreshadow): add character-foreshadow bidirectional navigation`
  - Files: `src/components/CharacterPanel.tsx`

- [ ] 5. 修改 `src/components/ProjectView.tsx` — 双向导航接线

  **What to do**:
  - 新增 state：`const [navigateForeshadowId, setNavigateForeshadowId] = useState<string | null>(null)`
  - 新增回调：`const handleNavigateToForeshadow = (id: string) => { setNavigateForeshadowId(id); setTab('foreshadow') }`
  - 修改 ForeshadowPanel 的渲染（line ~106）：
    - 新增 prop：`highlightId={navigateForeshadowId}`
    - 保留 `currentChapterId` 和 `onNavigateToCharacter` props
  - 修改 CharacterPanel 的渲染（line ~102）：
    - 新增 prop：`onNavigateToForeshadow={handleNavigateToForeshadow}`
    - 保留 `projectId` 和 `initialCharacter` props
  - 在 ForeshadowPanel 内部：highlightId 变化后高亮 3 秒，然后调用 setNavigateForeshadowId(null) 清除（通过 useEffect 或 ForeshadowPanel 内部处理）

  **Must NOT do**:
  - 不新增全局状态或 context provider
  - 不修改其他 tab 的渲染逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 加一个 state + 一个回调 + 两个 prop，纯接线任务
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 Task 2, 3, 4 并行）
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/components/ProjectView.tsx:33-34` — `currentChapterId` 和 `navigateCharacter` state 模式（照抄）
  - `src/components/ProjectView.tsx:46-49` — `handleNavigateToCharacter` 回调模式（照抄）
  - `src/components/ProjectView.tsx:101-102` — ChapterManager 和 CharacterPanel 的 onSelect 回调（参考接线方式）
  - `src/components/ProjectView.tsx:105-108` — ForeshadowPanel 渲染（新增 prop 的位置）
  - `src/components/ProjectView.tsx:102` — CharacterPanel 渲染（新增 prop 的位置）

  **API/Type References**:
  - `src/components/ForeshadowPanel.tsx:16-20` — Props 接口确认（确认新增 highlightId 和现有 props）

  **WHY Each Reference Matters**:
  - navigateCharacter 模式 — 完全相同的模式，直接复制 → 改变量名
  - ForeshadowPanel Props — 确认需要新增哪些，以及现有 props 的名称和类型

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: character panel → foreshadow panel navigation works
    Tool: Playwright
    Preconditions: 角色有关联伏笔，CharacterPanel 有 onNavigateToForeshadow prop
    Steps:
      1. 在角色面板中点击一个关联伏笔
      2. 观察 tab 是否切换到伏笔面板
      3. 观察目标伏笔是否被定位
    Expected Result: Tab 切换到"伏笔"；目标卡片在视野内
    Failure Indicators: Tab 不切换；切换了但没有定位卡片
    Evidence: .omo/evidence/task-5-bidirectional-nav.png

  Scenario: foreshadow panel → character panel navigation still works
    Tool: Playwright
    Preconditions: 伏笔有关联角色，ForeshadowPanel 有角色 chip
    Steps:
      1. 在伏笔面板中点击角色 chip
      2. 观察 tab 是否切换到角色面板
    Expected Result: Tab 切换到"角色"；目标角色被选中
    Failure Indicators: 单向导航被破坏
    Evidence: .omo/evidence/task-5-reverse-nav.png

  Scenario: navigation clears highlight after timeout
    Tool: Playwright
    Preconditions: 已从角色面板跳转到伏笔面板
    Steps:
      1. 观察高亮效果
      2. 等待 4 秒
      3. 再次检查目标卡片
    Expected Result: 高亮在 3 秒后消失
    Failure Indicators: 高亮永久不消失
    Evidence: .omo/evidence/task-5-highlight-clear.png
  ```

  **Evidence to Capture**:
  - [ ] task-5-bidirectional-nav.png
  - [ ] task-5-reverse-nav.png
  - [ ] task-5-highlight-clear.png

  **Commit**: YES（与 Task 4 同组提交）
  - Message: `feat(foreshadow): add character-foreshadow bidirectional navigation`
  - Files: `src/components/ProjectView.tsx`

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `npm run build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | TypeScript [N errors] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration: classifyForeshadows → sources.ts → AI context output; ForeshadowPanel urgency display matches classification; bidirectional nav works both directions; clues editor saves and displays correctly. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `feat(foreshadow): add four-level classification engine` — foreshadowContext.ts
- **2–3**: `feat(foreshadow): integrate classification into context engine and panel` — sources.ts, ForeshadowPanel.tsx, style.css
- **4–5**: `feat(foreshadow): add character-foreshadow bidirectional navigation` — CharacterPanel.tsx, ProjectView.tsx

---

## Success Criteria

### Verification Commands
```bash
npx tsc --noEmit           # Expected: zero errors
npm run build              # Expected: build succeeds
lsp_diagnostics src/services/foreshadowContext.ts  # Expected: zero errors
lsp_diagnostics src/contextEngine/sources.ts       # Expected: zero errors
lsp_diagnostics src/components/ForeshadowPanel.tsx # Expected: zero errors
lsp_diagnostics src/components/CharacterPanel.tsx  # Expected: zero errors
lsp_diagnostics src/components/ProjectView.tsx     # Expected: zero errors
```

### Final Checklist
- [ ] classifyForeshadows() 四级判定正确
- [ ] foreshadowDS 输出四级分桶格式
- [ ] ForeshadowPanel 紧迫度使用 config 阈值
- [ ] Clues 可在表单中增删
- [ ] 角色选择器为下拉多选
- [ ] CharacterPanel view 模式显示关联伏笔
- [ ] 双向导航可工作
- [ ] 所有 "Must NOT Have" 未违反
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npm run build` 成功
