# v0.4 质量保障系统 — 设计文档

> 基于以下开源项目分析：character-arc · MuMuAINovel · oh-story-claudecode
> 技术栈：Tauri 2 + React 19 + TypeScript 6 + TipTap + Rust (LanceDB)

---

## 一、整体架构

### 五个模块及依赖关系

```
模块 1: 章节版本历史  ← 独立，无外部依赖
模块 2: 局部改写/扩写 ← 独立，依赖编辑器 selection API
模块 3: 自动一致性审查 ← 依赖角色/认知/伏笔/时间线/世界观数据（v0.2+v0.3）
模块 4: 审查报告面板   ← 依赖模块 3 的输出
模块 5: 素材库基础版   ← 独立，app 级跨项目资源
```

**独立性分析：** 模块 1/2/5 互相独立，可并行开发。模块 4 需等模块 3 完成后集成 UI。(更新：模块 3/4 设计为可独立验证，模块 4 在模块 3 接口就绪后即可开始)

### 增量原则

每个模块都遵循「先有能用版，再迭代完善」的策略：
- 版本历史：先自动快照 + 列表 + 回退，版本标记/diff 后续加
- 改写扩写：先选中→改写→确认，强度选择/保留选项后续加
- 一致性审查：先轻量检查（规则引擎），AI 深度审查后续加
- 审查面板：先问题列表 + 定位，AI 修复按钮后续加
- 素材库：先增删改查 + 分类，搜索/AI 辅助后续加

### 技术约束

- 所有数据本地优先，文件存储，无外部数据库
- 新组件按 AGENTS.md `panel-layout` CSS 约定
- 禁止 `as any`、`@ts-ignore`、`@ts-expect-error`
- TypeScript strict 模式，新类型放 `src/types/`

---

## 二、模块 1：章节版本历史

### 2.1 设计

每次保存章节内容时，自动将**修改前的版本**备份到 `.history/` 目录。用户可查看历史版本列表、对比差异、回退到任意版本、给版本命名标记或删除指定版本。

### 2.2 存储结构

```
chapters/
├── ch001.md              # 当前版本
├── .history/
│   ├── ch001/
│   │   ├── _index.json   # 版本元数据索引
│   │   ├── v1.md         # 首次保存内容
│   │   ├── v2.md         # 第二次保存内容
│   │   └── ...
│   └── ch002/
│       ├── _index.json
│       ├── v1.md
│       └── ...
```

### 2.3 `_index.json` 格式

```json
{
  "versions": [
    {
      "version": 1,
      "created_at": "2026-07-08T14:30:00",
      "word_count": 1240,
      "char_count": 1520,
      "source": "auto_save",
      "label": ""
    },
    {
      "version": 2,
      "created_at": "2026-07-08T15:10:00",
      "word_count": 1350,
      "char_count": 1680,
      "source": "manual_save",
      "label": "AI生成初版"
    }
  ],
  "max_versions": 20
}
```

`source` 枚举：`auto_save` | `manual_save` | `ai_generated` | `restore` | `rewrite`

### 2.4 Rust 层

在 `save_chapter_content` 中增加预处理步骤：

```
save_chapter_content(project_id, chapter_id, new_content):
  1. 读取 chapters/{chapter_id}.md 当前内容（如果存在）
  2. 如果新内容 == 当前内容 → 跳过（无变化不备份）
  3. 如果当前内容存在且不为空：
     a. 确保 chapters/.history/{chapter_id}/ 目录存在
     b. 读取 _index.json，获取下一个版本号
     c. 将当前内容写入 .history/{chapter_id}/v{n}.md
     d. 更新 _index.json
  4. 写入新内容到 chapters/{chapter_id}.md
  5. 如果版本数超过 max_versions，删除最旧版本
```

**新增 Tauri commands：**

| Command | 参数 | 返回 |
|---|---|---|
| `list_chapter_versions` | project_id, chapter_id | `Vec<VersionMeta>` |
| `get_chapter_version` | project_id, chapter_id, version | `String` (content) |
| `restore_chapter_version` | project_id, chapter_id, version | `()` (覆盖当前 + 创建新版本) |
| `delete_chapter_version` | project_id, chapter_id, version | `()` |
| `rename_chapter_version` | project_id, chapter_id, version, label | `()` |

**VersionMeta 结构：**
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionMeta {
    pub version: u32,
    pub created_at: String,
    pub word_count: u32,
    pub char_count: u32,
    pub source: String,
    pub label: String,
}
```

### 2.5 前端组件

**VersionHistoryPanel** — 在 ChapterManager 侧栏底部或作为独立面板：
- 版本列表，按时间倒序
- 每项显示：版本号、时间、字数、来源图标、标签
- 操作：回退到此版本、编辑标签、删除

**VersionDiffViewer** — 对比两个版本：
- 纯文本 diff（strip HTML 后比较）
- 增删高亮（绿色新增、红色删除）
- 统计：增减行数、字数变化

### 2.6 可行性验证

| 风险点 | 评估 | 对策 |
|---|---|---|
| 每次保存都备份，IO 压力 | 低 — 章节文件通常 <10KB，备份是纯文件复制 | 内容无变化时不备份 |
| 版本爆满 | 低 — 默认 20 上限，自动淘汰最旧 | `max_versions` 可配置 |
| diff 在 HTML 上噪声大 | 中 — HTML tag diff 不可读 | strip HTML 后比较纯文本 |
| 恢复版本时丢失未保存编辑 | 低 — 恢复前先提示用户保存当前内容 | 恢复操作前自动保存当前内容 |

### 2.7 增量路线

- **Phase 1（核心）：** 自动快照 + 版本列表 + 恢复到任意版本
- **Phase 2（增强）：** 版本标记/重命名 + 删除指定版本
- **Phase 3（高级）：** diff 对比视图

---

## 三、模块 2：局部改写/扩写

### 3.1 设计

用户在编辑器中选中一段文字后，通过浮动工具栏触发 AI 改写或扩写，结果以建议形式显示，用户确认后才替换原文。

### 3.2 交互流程

```
1. 用户在 Editor 中选中一段文字
2. 弹出浮动工具栏（位置：选中区域上方居中）
   ┌─────────────────────────┐
   │ ✨ 改写  📝 扩写  🎨 润色 │
   └─────────────────────────┘
3. 用户点击「改写」
4. 系统获取选中文本 + 前后文各 200 字
5. 调用 AI（使用 writing 模型，streaming 输出到预览面板）
6. 右侧浮动面板显示 AI 建议 → 用户可边看 streaming 边决定
7. 用户操作：
   - 「接受」→ 选中文本被替换，触发自动保存
   - 「拒绝」→ 关闭面板，原文不变
   - 「重新生成」→ 重新调 AI
```

### 3.3 AI Prompt 设计

```
系统: 你是一个网文编辑助手。根据用户要求改写/扩写指定段落。

改写模式:
  保持风格一致，不改变情节推进，修正表达问题。
  输出只包含改写后的段落，不添加解释。

扩写模式:
  在原意基础上扩展细节描写，字数扩展到原长的 1.5-2 倍。
  保持叙事节奏，不改变情节走向。

润色模式:
  轻微调整措辞，修正语法和表达，保持原意不变。
  尽可能少改动。

用户消息:
  上下文（前200字）：
  ---
  {前文}
  ---
  选中文本：
  ---
  {选中文本}
  ---
  上下文（后200字）：
  ---
  {后文}
  ---
  请{改写/扩写/润色}选中文本。
```

### 3.4 涉及改动

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/services/rewriteService.ts` | 新建 | 改写/扩写/润色 API 封装，接受文本+模式+上下文 |
| `src/components/RewritePreview.tsx` | 新建 | 预览面板，streaming 显示 + 接受/拒绝按钮 |
| `src/components/Editor.tsx` | 修改 | 加 selection 监听 + 浮动工具栏 |

### 3.5 可行性验证

| 风险点 | 评估 | 对策 |
|---|---|---|
| TipTap selection API 获取选中文本 | 低 — `editor.state.doc.textBetween()` 直接可用 | 已验证可通过 `selection.from`/`to` 获取 |
| 浮动工具栏定位 | 低 — TipTap 有 `coordsAtPos()` 获取选中区域坐标 | 用 React Portal + absolute 定位 |
| AI 改写破坏了上下文衔接 | 中 — 仅给 200 字上下文可能不够 | 改写 prompt 强调"保持风格一致"，必要时增加上下文量 |
| 改写结果 streaming 到预览面板 | 低 — 复用现有 `generateChapter` 的 stream 模式 | 新开非中断的 stream，不影响编辑器 |

### 3.6 增量路线

- **Phase 1（核心）：** 选中→改写→预览→接受/拒绝
- **Phase 2（增强）：** 扩写 + 润色模式加入
- **Phase 3（高级）：** PreserveElementsConfig（保留对话/情节/角色性格选项）
- **Phase 4（高级）：** 改写强度选择（轻微/中等/大幅）

---

## 四、模块 3：自动一致性审查

### 4.1 整体架构

双层架构（参考 character-arc 的 `light-check` + `chapter-audit` / `story-deep-audit`）：

```
保存章节
   ↓
[轻量检查] ─── 规则引擎，纯本地，不调 AI
   ├── 角色名检查     characters/ 目录
   ├── 禁用词检查     bannedWords.ts（已有）
   └── 地点名称检查   worldview/locations.md
   ↓
 保存结果到 review-reports/light/{chapterId}.json
   ↓
用户点击「完整审查」
   ↓
[深度 AI 审查] ─── 调用 AI analysis/review 模型
   ├── 时间线一致性
   ├── 角色认知越界
   ├── 伏笔健康度
   └── 设定自洽
   ↓
 保存结果到 review-reports/full/{chapterId}_{timestamp}.json
```

### 4.2 轻量检查（Light Check）

纯 TypeScript，无 AI 调用，保存时自动触发。

**检查规则：**

| 规则 | 实现 | 数据来源 |
|---|---|---|
| 角色名一致性 | 扫描纯文本，提取所有 `characters/` 目录角色名,匹配正文中出现的中文名 | `readProjectFile(projectId, 'characters', name)` 遍历 |
| 地点名一致性 | 扫描正文，匹配 `worldview` 中 locations 条目 | `readProjectFile(projectId, 'worldview', 'locations.md')` |
| 禁用词检查 | 已有 `bannedWords.ts` | 正则匹配 |

**轻量检查结果格式：**
```typescript
interface LightCheckResult {
  passed: boolean
  checks: {
    name: string
    passed: boolean
    issues: Array<{
      type: string
      severity: 'error' | 'warning'
      message: string
      line?: number
    }>
  }[]
}
```

**存储位置：** `tracks/review-reports/light/{chapterId}.json`

### 4.3 深度 AI 审查（Deep Check）

用户手动触发，调用 AI 进行多维分析。

**审查 prompt 设计（参照 MuMuAINovel `PlotAnalyzer` 的 JSON 结构）：**

```
你是一个小说一致性审查专家。分析以下章节内容，
从 4 个维度检查问题，只输出 JSON。

## 当前章节正文
{chapter_text}

## 角色认知状态
{character_cognition}

## 未解伏笔
{foreshadow_list}

## 故事时间线
{timeline}

## 世界观设定
{worldview_rules}

## 角色状态
{character_states}

## 输出格式
{
  "overall_score": 0-10,
  "dimensions": [
    {
      "name": "timeline",
      "score": 0-10,
      "issues": [
        {
          "severity": "error" | "warning" | "hint",
          "desc": "问题描述",
          "location": { "line": 行号, "offset": 偏移 } | null
        }
      ]
    }
  ],
  "suggestions": ["建议列表"]
}
```

**4 个审查维度：**

| 维度 | 检查内容 | 数据来源 |
|---|---|---|
| `timeline` | 时间顺序是否矛盾、跳跃是否合理 | `memory/timeline.json` + 章节内容 |
| `character_cognition` | 角色是否知道不应知道的信息 | `memory/character-states.json` |
| `foreshadow_health` | 未解伏笔是否过久未回收 | `memory/foreshadows.json` |
| `setting_consistency` | 世界观规则是否被违反 | `worldview/` 各项设定 |

### 4.4 涉及改动

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/services/reviewService.ts` | 新建 | 审查编排：触发轻量/深度检查、存取报告 |
| `src/services/reviewLightCheck.ts` | 新建 | 轻量规则引擎实现 |
| `src/types/review.ts` | 新建 | LightCheckResult, DeepCheckResult, ReviewIssue |
| `src/api/tauri.ts` | 修改 | 加 read_resource_file 等命令（用于读角色/世界观文件） |
| `src/services/chapterIngest.ts` | 无改动 | 直接复用其 AI 调用模式 |

### 4.5 可行性验证

| 风险点 | 评估 | 对策 |
|---|---|---|
| 轻量检查需要读取所有角色文件 | 低 — 角色文件数量通常 <50，全量读取在本地文件系统是毫秒级 | 缓存角色名列表到内存，变化时刷新 |
| AI 审查准确性 | 中 — 位置定位可能不准 | 先输出问题描述，让用户可定位到编辑器 |
| AI 审查耗时 | 中 — 分析模型通常 5-15s | 30s 超时 + 加载状态 UI，不影响编辑器操作 |
| 世界观设定规则提取 | 中 — markdown 格式的非结构化数据 | prompt 中直接传入 markdown 原文让 AI 自行理解 |

### 4.6 增量路线

- **Phase 1（核心）：** 轻量检查（角色名+地点名+禁用词），保存时自动触发
- **Phase 2（增强）：** 深度 AI 审查（4 维度），手动触发
- **Phase 3（高级）：** 问题一键定位到编辑器 + AI 自动修复

---

## 五、模块 4：审查报告面板

### 5.1 设计

在 ProjectView 新增「审查」tab，展示一致性审查的结果。

### 5.2 UI 布局

遵循 AGENTS.md 的 `panel-layout` 约定：

```
┌─ sidebar (220px) ────────┬─────────── content ─────────────────┐
│ 报告列表                    │  综合评分卡片                      │
│  [第3章 审查]  ← 当前      │  [8.2/10] 时间线 ○ 角色认知 ○      │
│  [第2章 审查]              │  伏笔 △ 设定自洽 ○                 │
│  [第1章 审查]              │                                    │
│                            │  问题列表（按严重度排序）            │
│                            │  🔴 设定冲突 (error)               │
│                            │     "御剑术需要金丹期..."          │
│                            │     [AI 修复] [定位到编辑器]       │
│                            │  🟡 伏笔过期 (warning)             │
│                            │     "刘长老身份已过20章未回收"     │
│                            │     [标记已处理]                   │
│                            │  🟢 时间线 (passed)                │
│                            │     — 一致                        │
└────────────────────────────┴────────────────────────────────────┘
```

### 5.3 交互

| 操作 | 行为 |
|---|---|
| 点击问题列表项 | 展开显示详情（描述 + 位置 + AI 建议） |
| 「定位到编辑器」 | 切换 writing tab + 滚动到问题附近位置 |
| 「AI 修复」 | 调用 rewriteService 修复问题段落 |
| 「标记已处理」 | 问题标记为 `resolved`，移入已处理列表 |

### 5.4 数据流

```
ReviewPanel mount
  → 读取 tracks/review-reports/light/ + full/ 目录
  → 合并展示
  → 用户操作更新报告状态（标记已处理）

定位到编辑器：
  ReviewPanel → parent callback (ProjectView)
    → setTab('writing') + 传递 chapterId + 位置
    → Editor 组件接收 props 或 event 跳转
```

### 5.5 涉及改动

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/components/ReviewPanel.tsx` | 新建 | 审查面板主组件 |
| `src/components/ReviewReportCard.tsx` | 新建 | 单次报告卡片 |

### 5.6 可行性验证

| 风险点 | 评估 | 对策 |
|---|---|---|
| 跨 tab 定位编辑器 | 中 — ReviewPanel 和 Editor 在不同 tab | 通过 ProjectView 的 state callback：setTab + 传参 |
| 报告文件遍历 | 低 — 已有 `list_project_files` 命令 | 扩展支持 `tracks/review-reports/light/` + `full/` 子目录 |

---

## 六、模块 5：素材库

### 6.1 设计

应用级跨项目素材管理系统。用户可管理写作素材（描写/灵感/笔记/摘抄），按分类组织，支持 AI 辅助分类和扩展。

### 6.2 存储结构

```
ai-novel-workspace/
└── resources/
    ├── _index.json              # 素材全文索引
    │   {
    │     "entries": [
    │       {
    │         "id": "res_001",
    │         "category": "描写库",
    │         "filename": "自然环境.md",
    │         "title": "自然环境",
    │         "tags": ["风景", "山林"],
    │         "created_at": "2026-07-08T10:00:00"
    │       }
    │     ]
    │   }
    ├── 描写库/
    │   ├── 自然环境.md
    │   └── 战斗场面.md
    ├── 灵感簿/
    │   └── 穿越系统设定.md
    ├── 知识笔记/
    │   └── 修真体系参考.md
    └── 摘抄/
        └── 金句.md
```

### 6.3 Rust 层

新增 workspace 级的文件操作命令，与 project 内文件操作对称：

| Command | 参数 | 返回 |
|---|---|---|
| `list_resource_categories` | — | `Vec<String>` |
| `list_resource_files` | category | `Vec<FileEntry>` |
| `read_resource_file` | category, filename | `String` (content) |
| `write_resource_file` | category, filename, content | `()` |
| `delete_resource_file` | category, filename | `()` |

### 6.4 AI 辅助功能

**AI 分类建议**（贴入素材后自动建议）：
```
Prompt: 分析以下素材内容，建议分类（描写库/灵感簿/知识笔记/摘抄）和标签。
素材：{content}
输出 JSON: { "suggested_category": "...", "tags": ["tag1", "tag2"] }
```

**AI 扩展**（选中素材后「AI 补全」）：
- 复用 `rewriteService` 的扩写模式

### 6.5 前端组件

| 组件 | 说明 |
|---|---|
| `ResourcePanel.tsx` | 素材库 tab 面板，分类树 + 素材列表 + 编辑器 |
| Editor 侧边面板 | 写作时可打开的素材抽屉 |
| `ResourceInlineInsert` | 点击素材 → 插入到编辑器光标位置 |

### 6.6 可行性验证

| 风险点 | 评估 | 对策 |
|---|---|---|
| Rust 需要新 workspace 级命令 | 低 — `project_dir` 的函数模式已有，类似实现 `resource_dir` | 新增 `resource_dir()` 指向 `resources/` |
| 分类管理的文件遍历 | 低 — 一级子目录即分类，文件即条目 | 使用 `fs::read_dir` 遍历 |

### 6.7 增量路线

- **Phase 1（核心）：** 增删改查 + 分类文件夹
- **Phase 2（搜索）：** 复用现有搜索系统（关键词+语义）索引 `resources/` 目录
- **Phase 3（AI）：** AI 分类建议 + AI 扩展 + 写作时侧边面板

---

## 七、文件变更总清单

### 新建文件（12 个）

```
src-tauri/src/commands/version.rs       # 版本历史 Rust commands
src/services/rewriteService.ts          # 改写/扩写/润色
src/services/reviewService.ts           # 审查编排
src/services/reviewLightCheck.ts        # 轻量规则引擎
src/services/resources.ts               # 素材库 API
src/types/review.ts                     # 审查类型定义
src/components/VersionHistoryPanel.tsx   # 版本历史 UI
src/components/VersionDiffViewer.tsx     # diff 对比 UI
src/components/RewritePreview.tsx        # 改写预览面板
src/components/ReviewPanel.tsx           # 审查面板
src/components/ReviewReportCard.tsx      # 审查报告卡片
src/components/ResourcePanel.tsx         # 素材库面板
```

### 修改文件（6 个）

```
src-tauri/src/lib.rs                    # 注册新 commands（version + resource）
src-tauri/src/commands/mod.rs           # 加 mod version
src-tauri/src/main.rs                   # 确保 resources/ 目录创建
src/components/Editor.tsx               # 改写浮动工具栏 + 素材侧边面板
src/components/ProjectView.tsx          # 加「审查」「素材」2 个 tab
src/components/ChapterManager.tsx       # 版本历史入口
```

### 需要加 TypeScript API 绑定的文件

`src/api/tauri.ts` 需新增以下 API 函数（与新增 Rust command 一一对应）：

```typescript
// 版本历史
export async function listChapterVersions(projectId: string, chapterId: string): Promise<VersionMeta[]>
export async function getChapterVersion(projectId: string, chapterId: string, version: number): Promise<string>
export async function restoreChapterVersion(projectId: string, chapterId: string, version: number): Promise<void>
export async function deleteChapterVersion(projectId: string, chapterId: string, version: number): Promise<void>
export async function renameChapterVersion(projectId: string, chapterId: string, version: number, label: string): Promise<void>

// 素材库（workspace 级，不需要 projectId）
export async function listResourceCategories(): Promise<string[]>
export async function listResourceFiles(category: string): Promise<FileEntry[]>
export async function readResourceFile(category: string, filename: string): Promise<string>
export async function writeResourceFile(category: string, filename: string, content: string): Promise<void>
export async function deleteResourceFile(category: string, filename: string): Promise<void>

// 审查报告
export async function listReviewReports(projectId: string, type: 'light' | 'full'): Promise<ReviewReportMeta[]>
export async function getReviewReport(projectId: string, type: 'light' | 'full', filename: string): Promise<string>
```

### 不需要改动的文件

- `src/services/aiProvider.ts` — 改写复用其 stream 模式，无需改动
- `src/services/chapterIngest.ts` — 审查复用其 AI 调用模式
- `src/services/bannedWords.ts` — 作为轻量检查的一部分，无需改动

---

## 八、阶段执行计划

### Phase A（核心 3 模块，独立并行）

| 模块 | 估算工时 | 依赖 |
|---|---|---|
| 版本历史 | 3-4 天 | 无 |
| 改写扩写 | 2-3 天 | 无 |
| 轻量审查 + 审查面板 | 2-3 天 | 无 |

**Phase A 完成后即达可用状态。** 三个模块无交叉依赖，可并行开发。

### Phase B（增强功能）

| 模块 | 估算工时 | 依赖 |
|---|---|---|
| 深度 AI 审查 | 2-3 天 | 角色/认知/伏笔/时间线数据（已就位） |
| 素材库基础版 | 2-3 天 | 无 |

### Phase C（高级功能）

| 模块 | 估算工时 | 依赖 |
|---|---|---|
| 版本 diff 视图 | 1-2 天 | 版本历史就绪 |
| AI 审查修复 | 1-2 天 | 深度审查 + 改写就绪 |
| 素材 AI 辅助 | 2-3 天 | 素材库就绪 |

---

## 九、与参考项目的对比

| 特性 | character-arc | MuMuAINovel | 本设计 v0.4 |
|---|---|---|---|
| 版本历史 | `chapter_versions` SQLite，手动+自动双路径 | GenerationHistory 仅记录生成日志 | 文件快照，自动保存时备份，完整 CRUD |
| 改写/扩写 | `chapter-repair` 诊断+修复双模式 | `ChapterRegenerator` + `PlotExpansionService` | 选中→改写→预览→确认，轻量级 |
| 一致性审查 | 双层：light-check（规则）+ chapter-audit（AI）+ story-deep-audit（全项目） | `PlotAnalyzer` JSON 结构化单章分析 | 双层：light-check（规则）+ deep-check（4 维度 AI） |
| 审查面板 | `GlobalAssistantPage`（全局助理）+ v2 audit 模式 | `ChapterAnalysis` + `AnnotatedText`（行内标注） | 审查 tab + 问题列表 + 定位到编辑器 |
| 素材库 | `KnowledgeCenterPanel` 4 象限 + `knowledge_documents` table | `PromptTemplate` + `WritingStyle` + `skills/` 多层 | 分类文件夹 + 搜索 + AI 分类/扩展 |
| 状态跟踪 | SQLite 结构化角色状态表 | ChromaDB 向量记忆 | 已有的 JSON 文件 + 角色认知系统（v0.3） |
| 技术路线 | Electron + Vue + SQLite | FastAPI + React + PostgreSQL | Tauri 2 + React + 文件存储 |

---

## 十、与现有系统的集成点

### Editor 保存钩子（`handleSaveNow`）的扩展

当前 `handleSaveNow` 的流程：
```
保存 → banned check → ingest → log stats → vector index
```

v0.4 扩展为：
```
保存 → 版本历史备份（新）
     → banned check（已有）
     → 轻量检查（新）
     → ingest（已有）
     → log stats（已有）
     → vector index（已有）
```

改写流程为独立路径，不嵌入保存钩子：
```
选中文字 → 调 AI → 预览 → 接受 → 触发保存（进入版本历史）
```

### ProjectView Tab 扩展

当前 8 个 tab：
```
写作 | 角色 | 世界观 | 大纲 | 备注 | 伏笔 | 搜索 | 统计
```

v0.4 扩展为 10 个 tab：
```
写作 | 角色 | 世界观 | 大纲 | 备注 | 伏笔 | 搜索 | 统计 | 审查 | 素材
```

---

## 十一、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 版本历史备份过多文件 | 低 | 磁盘占用 | 最多 20 版本/章，自动淘汰最旧 |
| AI 审查耗时长 | 中 | 用户体验 | streaming 进度 + 异步运行 |
| 改写破坏原文风格 | 低 | 内容质量 | 预览确认机制，用户不确认不修改 |
| 素材库与现有文件命令重复 | 低 | 代码冗余 | 抽像通用文件 I/O 方法 |
| 5 个模块并行开发协调成本 | 中 | 开发效率 | Phase A/B 分阶段，Phase A 模块间无依赖 |

---

> 本文档为设计阶段产物，后续实现中如遇实际情况需调整方案，将在执行前先汇报原因和新方案，经确认后再实施。
