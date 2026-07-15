# 搜索模块设计文档 — v1.0

> **场景：写作中查设定** — 用户写到一半需要快速查找角色/设定/章节内容，搜完继续写。

---

## 一、核心体验

### 交互流程

```
正在写作 → 点搜索 Tab → 输入关键词 → 回车 → 浏览结果 → 点击跳转 → 回写作继续
```

- 主要交互：回车搜索。备选：点击"搜索"按钮。
- 可选增强（默认关闭）：输入停顿 300ms 自动搜索。
- 搜索结果**不显示内部排序分数**（RRF score 等调试信息），用户不需要看到。

### 搜索范围选择（左侧侧栏）

```
全部       ← 默认选中，搜所有来源
角色       ← 只搜 characters/
世界观     ← 只搜 worldview/
章节       ← 只搜 chapters/
备注       ← 只搜 notes/
大纲       ← 只搜 outline/
记忆       ← 只搜 memory/
素材       ← 只搜 workspace/resources/
```

- 点击来源筛选 sidebar item 后，**三种搜索路径（关键词 + 向量 + 素材）全部遵循过滤条件**，不再出现选了"世界观"但结果里混入"角色"的问题。
- 侧边栏底部保留"向量搜索"复选框，默认勾选。
- 侧边栏宽度 220px（与项目其他 panel 一致，不用 200px）。

---

## 二、搜索结果

### 卡片结构

```
┌────────────────────────────────────────────────────┐
│ [来源标签]  文件名(命中词高亮)                       │ ← header
│                                                    │
│ …命中词前后的上下文片段，最多三行…                    │ ← snippet（命中词高亮）
│                                                    │
│ characters/林修崖.md                                │ ← 灰色路径
└────────────────────────────────────────────────────┘
```

- 每条结果一张卡片，hover 变色，可点击。
- 卡片使用专用 CSS class（`search-result-item`），不再复用 `foreshadow-item`。
- 命中词高亮：用与搜索同款的 CJK 分词 tokenizer（`tokenizeQuery`）对文件名和 snippet 做高亮匹配，保证大词元（bigram）命中一致。

### 状态展示

| 条件 | 展示内容 |
|------|---------|
| 还没搜过 | 灰色文字「输入关键词开始搜索」 |
| 搜了，有结果 | 结果卡片列表 + 分页 |
| 搜了，无结果 | 「未找到匹配"xxx"的结果」 |

- **没有错误横幅**。文件读取异常、embedding API 失败一律只写 `console.error`，不打扰用户。Embedding 配置问题在 AI 配置页解决。

### 分页

- 复用现有通用组件 `<Pagination>`。
- 每页默认 15 条，可切换 15 / 30 / 50。
- 翻页时列表区滚回顶部，使用 `useRef`（不用 `document.querySelector`）。

---

## 三、搜索算法（不变）

维持现有三路融合架构：

```
用户输入 query
  → CJK 分词（tokenizeQuery: 标点切分 + 停用词过滤 + bigram 扩展）
    → 关键词搜索（Tauri 命令 → Rust 文件系统遍历 + 子串匹配 + 计数评分）
    → 向量搜索（embedText → embedding API → LanceDB ANN → 距离转相似度）
    → 素材搜索（Tauri 命令 → 工作区 resources/ 文件系统遍历）
  → RRF 融合（K=60，三路 rank → 加权求和 → 排序 → 截断 topK）
  → 返回给 UI
```

### 来源过滤的正确行为（核心修正）

| 用户选择 | 关键词搜索 | 向量搜索 | 素材搜索 |
|---------|-----------|---------|---------|
| 全部 | 所有目录 | 所有 chunk | 所有素材 |
| 角色 | `characters/` 目录 | `page_id` 前缀 `characters/` | **跳过** |
| 世界观 | `worldview/` 目录 | `page_id` 前缀 `worldview/` | **跳过** |
| 章节 | `chapters/` 目录 | `page_id` 前缀 `chapters/` | **跳过** |
| 备注 | `notes/` 目录 | `page_id` 前缀 `notes/` | **跳过** |
| 大纲 | `outline/` 目录 | `page_id` 前缀 `outline/` | **跳过** |
| 记忆 | `memory/` 目录 | `page_id` 前缀 `memory/` | **跳过** |
| 素材 | **跳过** | `page_id` 前缀 `resources/` | 所有素材 |

- 关键词搜索已有正确过滤（Rust 侧 `search_project_files` 的 `sources` 参数），**不需要改**。
- 向量搜索目前不过滤——需要加 `page_id` 前缀过滤逻辑。
- 素材搜索目前总是执行——需要加判断，仅在"全部"或"素材"时执行。

### RRF 融合 fix：向量独有结果数据回填

当某条结果只出现在向量搜索结果中（关键词和素材都没命中）时，当前代码会用 `?? ''` 回填空字符串作为文件名和片段。修复为：从向量返回的 `ChunkSearchResult` 中取 `heading_path` 作为文件名、`chunk_text` 作为片段。

---

## 四、Rust 后端修改

### 递归目录遍历

当前 `search_directory` 只扫描一级目录内的直接文件，子目录下的文件被跳过。改为递归遍历所有非隐藏子目录。

### 文件大小上限 + 跳过非文本

- 单个文件超过 5MB 跳过（`MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024`）。
- 隐藏文件（`.` 开头）跳过。

纯文字场景下这些保护不会触发，但防止用户误放二进制文件导致崩溃。

---

## 五、前端样式

### 新增 CSS class

- `.search-result-item` — 结果卡片容器（border +圆角 + hover + focus-visible）
- `.search-result-header` — 卡片头部（flex: 来源标签 + 文件名）
- `.search-result-filename` — 文件名（加粗、单行截断）
- `.search-result-snippet` — 片段（三行截断）
- `.search-result-path` — 路径（等宽字体、灰色）
- `.search-highlight` — 命中高亮（黄色背景 + 黑字）
- `.search-history-tag` — 搜索历史标签（圆角 pill，hover 变色）

新增组件 `HighlightText.tsx`：用 search.ts 同款 tokenizer 高亮命中词，保证 CJK bigram 匹配一致。

---

## 六、搜索历史（可选增强）

- key: `search_history_${projectId}`
- 最多 10 条，按项目隔离
- 搜索框下方 pills 展示，点击直接搜
- 不受 session 影响（localStorage 持久化）

---

## 七、点击跳转

搜索结果卡片点击后，通过 `onOpenFile(path, source)` callback 通知父组件。具体跳转逻辑（打开角色面板/跳转到章节编辑位置）在 ProjectView 层对接现有编辑器架构实现。

---

## 八、不做的事

- **不做错误横幅**：本地搜索理论上不会失败，外部 API 失败静默降级。
- **不做独立搜索窗口**（QMAI 的特色功能）：复杂度高，价值有限。
- **不做图像搜索**：当前素材库没有图片 alt text 索引。
- **不做 LLM rerank**：纯本地搜索不需要。
- **不做并发/async 重构**（Rust 侧）：纯文字 3-5MB 项目顺序遍历 <500ms，够用。
- **不做 debounce 自动搜索**：保持显式搜索（回车/按钮）为主交互，自动搜索留作可选项但不默认开。

---

## 九、文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/services/search.ts` | ① RRF 融合 fix（向量独有结果数据回填）② 来源过滤传递到向量/素材分支 |
| 修改 | `src-tauri/src/commands/search.rs` | ① `search_directory` 改为递归 ② 加 5MB 文件上限 |
| 修改 | `src/components/SearchPanel.tsx` | 全部 UX 重做：高亮、卡片、状态区分、ref 滚动、去掉分数、来源过滤联动 |
| 新增 | `src/components/HighlightText.tsx` | 搜索高亮组件（复用 tokenizer） |
| 修改 | `src/style.css` | 新增搜索卡片 + 高亮 + 历史标签样式 |
| 修改 | `src/components/ProjectView.tsx` | 给 SearchPanel 传 `onOpenFile` callback |
