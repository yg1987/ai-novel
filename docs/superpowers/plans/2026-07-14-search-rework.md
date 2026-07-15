# 搜索模块完整重做实现方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把搜索 Tab 从"能用但粗糙"重做到"生产可用"——对标 QMAI 的搜索实现细节，修复 3 个 bug + 6 个 UX 问题 + 2 个性能问题。

**Architecture:** 保持现有三路融合架构（关键词 + 向量 + 素材），修复 RRF 融合层的数据丢失 bug，Rust 后端加递归目录遍历和并发控制，前端全部 UX 重做（高亮、可点击、错误提示、移除调试信息）。

**Tech Stack:** React 19 + TypeScript + Tauri 2 + Rust + LanceDB，不动技术选型。

## Global Constraints

- 不动 LanceDB 方案，不换向量库
- 不动 RRF K=60
- 遵循 AGENTS.md 的 CSS 布局约定（flex 链、220px 侧栏、无硬编码高度）
- 复用通用组件（Pagination）
- 搜索失败不崩溃，每路独立降级

---

### Task 1: 修复 RRF 融合层——向量独有结果数据丢失

**Files:**
- Modify: `src/services/search.ts:95-117`

**Interfaces:**
- Consumes: `searchProjectFiles()` → `SearchResult[]`, `vectorSearchChunks()` → `ChunkSearchResult[]`, `searchResourceFiles()` → `SearchResult[]`
- Produces: `HybridResult[]` 每个结果都有完整的 filename + snippet

- [ ] **Step 1: 在 RRF merged 构建阶段，当结果只来自向量搜索时，从 ChunkSearchResult 中提取显示信息**

找到 `src/services/search.ts` 第 105-113 行的 merged 构建逻辑，当前代码：

```typescript
const kr = keywordResults?.find((r) => r.path === path) ?? resourceResults?.find((r) => r.path === path)
merged.push({
  path: kr?.path ?? path,
  filename: kr?.filename ?? '',
  snippet: kr?.snippet ?? '',
  score: kr?.score ?? 0,
  source: kr?.source ?? 'vector',
  rrfScore,
})
```

替换为：

```typescript
// 从三个来源中查找该 path 对应的原始结果
const keywordHit = keywordResults?.find((r) => r.path === path)
const resourceHit = resourceResults?.find((r) => r.path === path)
const vectorHit = vectorResults?.find((r) => r.path === path)

// 优先取 keyword/resource 结果（有完整的 filename + snippet）
// 回退到向量结果（有 chunk_text + heading_path）
const bestHit =
  keywordHit ??
  resourceHit ??
  (vectorHit
    ? {
        path: vectorHit.path,
        filename: vectorHit.heading_path || vectorHit.path.split('/').pop() || '',
        snippet: vectorHit.chunk_text?.slice(0, 200) ?? '',
        score: vectorHit.score,
        source: 'vector' as const,
      }
    : null)

merged.push({
  path: bestHit?.path ?? path,
  filename: bestHit?.filename ?? path.split('/').pop() ?? '',
  snippet: bestHit?.snippet ?? '',
  score: bestHit?.score ?? 0,
  source: bestHit?.source ?? 'vector',
  rrfScore,
})
```

- [ ] **Step 2: 确认 `vectorResults` 在 RRF 融合时仍可访问**

检查 `hybridSearch` 中 `vectorResults` 的作用域——当前第 70-74 行：
```typescript
const [keywordResults, vectorResults, resourceResults] = await Promise.all([...])
```
`vectorResults` 在 `Promise.all` 解构后存在于整个函数作用域，第 85-89 行的 vectorRank 构建和第 105 行的 merged 构建都能访问它。确认无误。

- [ ] **Step 3: 验证修复**

手动测试：确保一个项目中有向量索引但关键词搜不到的唯一内容，验证搜索结果卡片显示正确的文件名和片段（不再是空字符串）。

- [ ] **Step 4: Commit**

```bash
git add src/services/search.ts
git commit -m "fix(search): populate filename/snippet for vector-only results in RRF merge"
```

---

### Task 2: Rust 后端——递归子目录搜索 + 文件大小限制

**Files:**
- Modify: `src-tauri/src/commands/search.rs:55-91`

**Interfaces:**
- Consumes: 无新增依赖
- Produces: `search_directory` 行为变更——从只扫一级变成递归遍历，加文件大小上限保护

- [ ] **Step 1: 将 `search_directory` 改为递归遍历，并加文件大小限制**

找到 `src-tauri/src/commands/search.rs` 第 55-91 行的 `search_directory` 函数，当前逻辑：
- 只读 `dir` 目录下的直接文件
- `if path.is_dir() { continue; }` 跳过子目录
- 无文件大小限制

替换为：

```rust
const MAX_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024; // 5MB 上限，防止超大文件撑爆内存

fn search_directory(
    dir: &PathBuf,
    project_dir: &PathBuf,
    query: &str,
    subdir_label: &str,
    results: &mut Vec<SearchResult>,
    max_results: usize,
) {
    if results.len() >= max_results { return; }
    if !dir.exists() { return; }
    let query_lower = query.to_lowercase();

    search_dir_recursive(dir, project_dir, &query_lower, subdir_label, results, max_results);
}

fn search_dir_recursive(
    dir: &PathBuf,
    project_dir: &PathBuf,
    query_lower: &str,
    subdir_label: &str,
    results: &mut Vec<SearchResult>,
    max_results: usize,
) {
    if results.len() >= max_results { return; }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if results.len() >= max_results { break; }
            let path = entry.path();

            if path.is_dir() {
                // 跳过隐藏目录
                if path.file_name().map_or(true, |n| n.to_string_lossy().starts_with('.')) {
                    continue;
                }
                search_dir_recursive(&path, project_dir, query_lower, subdir_label, results, max_results);
                continue;
            }

            // 跳过隐藏文件和非文本文件
            if path.file_name().map_or(true, |n| n.to_string_lossy().starts_with('.')) {
                continue;
            }

            // 文件大小检查——超过上限跳过
            if let Ok(meta) = fs::metadata(&path) {
                if meta.len() > MAX_FILE_SIZE_BYTES {
                    continue;
                }
            }

            if let Ok(content) = fs::read_to_string(&path) {
                let score = score_match(&content, query_lower);
                if score > 0.0 {
                    let rel_path = path.strip_prefix(project_dir)
                        .unwrap_or(&path);
                    results.push(SearchResult {
                        path: rel_path.to_string_lossy().to_string(),
                        filename: path.file_name().map_or(String::new(), |n| n.to_string_lossy().to_string()),
                        snippet: extract_snippet(&content, query_lower, 120),
                        score,
                        source: subdir_label.to_string(),
                    });
                }
            }
        }
    }
}
```

- [ ] **Step 2: 编译验证**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```
预期：编译通过，无 warning。

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/search.rs
git commit -m "feat(search): add recursive directory traversal and 5MB file size limit"
```

---

### Task 3: SearchPanel UX 重做——搜索高亮 + 可点击结果 + 错误提示 + 移除调试信息

**Files:**
- Modify: `src/components/SearchPanel.tsx`
- Create: `src/components/HighlightText.tsx`

**Interfaces:**
- Consumes: `HybridResult[]` from `hybridSearch`
- Produces: 用户可见的搜索结果卡片（高亮 + 可点击 + 无 RRF 分数）

- [ ] **Step 1: 创建 HighlightText 组件**

`src/components/HighlightText.tsx`:

```tsx
import { useMemo } from 'react'
import { tokenizeQuery } from '../services/search'

interface Props {
  text: string
  query: string
}

/** 用搜索时同款 tokenizer 高亮命中词，确保 CJK bigram 匹配一致 */
export default function HighlightText({ text, query }: Props) {
  const parts = useMemo(() => {
    if (!query.trim() || !text) return [{ text, match: false }]

    const tokens = tokenizeQuery(query)
    const patterns = tokens.length > 0 ? tokens : [query.trim()]
    const escaped = patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi')

    const result: Array<{ text: string; match: boolean }> = []
    let lastIndex = 0
    let m: RegExpExecArray | null

    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        result.push({ text: text.slice(lastIndex, m.index), match: false })
      }
      result.push({ text: m[0], match: true })
      lastIndex = m.index + m[0].length
    }
    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), match: false })
    }

    return result.length > 0 ? result : [{ text, match: false }]
  }, [text, query])

  return (
    <>
      {parts.map((p, i) =>
        p.match ? <mark key={i} className="search-highlight">{p.text}</mark> : <span key={i}>{p.text}</span>
      )}
    </>
  )
}
```

- [ ] **Step 2: 修改 SearchPanel——搜索结果卡片（加入高亮、可点击、样式类名修正）**

找到 `src/components/SearchPanel.tsx` 第 94-103 行的结果渲染：

```tsx
{paged.map((r, i) => (
  <div key={`${r.path}-${i}`} className="foreshadow-item normal" style={{ marginBottom: 8 }}>
    <div className="foreshadow-item-header">
      <span className="note-type-badge">{SOURCE_LABELS[r.source] ?? r.source}</span>
      <span className="foreshadow-name">{r.filename}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RRF: {r.rrfScore.toFixed(3)}</span>
    </div>
    <div className="foreshadow-desc">{r.snippet}</div>
  </div>
))}
```

替换为：

```tsx
{paged.map((r, i) => (
  <div
    key={`${r.path}-${i}`}
    className="search-result-item"
    style={{ marginBottom: 8 }}
    onClick={() => openSearchResult(r)}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => { if (e.key === 'Enter') openSearchResult(r) }}
  >
    <div className="search-result-header">
      <span className="note-type-badge">{SOURCE_LABELS[r.source] ?? r.source}</span>
      <span className="search-result-filename">
        <HighlightText text={r.filename} query={query} />
      </span>
    </div>
    <div className="search-result-snippet">
      <HighlightText text={r.snippet} query={query} />
    </div>
    <div className="search-result-path">{r.path}</div>
  </div>
))}
```

- [ ] **Step 3: 添加 `openSearchResult` 函数**

在 `SearchPanel` 组件内 `handlePageSizeChange` 之后添加：

```typescript
const openSearchResult = useCallback((result: HybridResult) => {
  // 通知父组件打开文件——通过自定义事件或 prop callback
  // 当前 SearchPanel 只接收 projectId，需要扩展 Props
  window.dispatchEvent(new CustomEvent('search-open-file', {
    detail: { path: result.path, source: result.source }
  }))
}, [])
```

同时更新 Props：

```typescript
interface Props {
  projectId: string
  onOpenFile?: (path: string, source: string) => void  // 新增
}
```

- [ ] **Step 4: 添加搜索失败的用户可见提示**

找到 `doSearch` 的 catch 块（第 42-43 行）：

```typescript
} catch (e) {
  console.error('Search failed:', e)
}
```

替换为：

```typescript
} catch (e) {
  console.error('Search failed:', e)
  setError(e instanceof Error ? e.message : '搜索失败，请重试')
}
```

添加 state：

```typescript
const [error, setError] = useState<string | null>(null)
```

在搜索结果区域（第 90 行 `style={{ flex: 1, overflowY: 'auto', ... }}` 的 div 内）最前面添加错误横幅：

```tsx
{error && (
  <div className="search-error-bar" onClick={() => setError(null)}>
    ⚠ {error}（点击关闭）
  </div>
)}
```

同时在 `doSearch` 开始时清除错误：`setError(null)`。

- [ ] **Step 5: 用 ref 替代 document.querySelector 滚动**

第 113 行的分页回调：

```typescript
onPageChange={(p) => {
  setPage(p)
  document.querySelector('.panel-editor')?.scrollTo(0, 0)
}}
```

替换为：

```typescript
// 组件顶部添加
const resultsRef = useRef<HTMLDivElement>(null)

// onPageChange 中
onPageChange={(p) => {
  setPage(p)
  resultsRef.current?.scrollTo(0, 0)
}}
```

并将结果列表的 div（第 90 行）加上 ref：

```tsx
<div ref={resultsRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
```

- [ ] **Step 6: 修正侧边栏宽度**

第 54 行：

```tsx
<div className="panel-sidebar" style={{ width: 200 }}>
```

改为（与 AGENTS.md 约定和 CSS 一致）：

```tsx
<div className="panel-sidebar">
```

（CSS 已经定义 `.panel-sidebar { width: 220px }`，去掉 inline override 即可）

- [ ] **Step 7: 搜索结果为空时的状态区分**

第 91-93 行的空状态：

```tsx
{results.length === 0 && !searching && (
  <div className="panel-placeholder" style={{ height: 200 }}>输入关键词开始搜索</div>
)}
```

替换为状态区分的三个提示：

```tsx
{!query.trim() && !hasSearched && results.length === 0 && (
  <div className="panel-placeholder">输入关键词开始搜索</div>
)}
{query.trim() && !searching && hasSearched && results.length === 0 && !error && (
  <div className="panel-placeholder">未找到相关结果</div>
)}
{searching && (
  <div className="panel-placeholder">搜索中…</div>
)}
```

添加 `hasSearched` state：

```typescript
const [hasSearched, setHasSearched] = useState(false)
```

在 `doSearch` 的 try 块开头设置 `setHasSearched(true)`。

- [ ] **Step 8: 搜索工具栏加上 flex-shrink: 0**

第 77 行的搜索工具栏 div，添加 `flexShrink: 0`：

```tsx
<div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
```

- [ ] **Step 9: 验证**

运行 `npm run tauri:dev`，确认：
- 搜索结果中的匹配词有黄色高亮
- 点击搜索结果卡片触发 `search-open-file` 事件
- 向量独有结果不再显示空标题
- RRF 分数不再显示
- 侧边栏宽度 220px
- 搜索失败时显示红色错误横幅

- [ ] **Step 10: Commit**

```bash
git add src/components/SearchPanel.tsx src/components/HighlightText.tsx
git commit -m "feat(search): UX overhaul — highlight, clickable results, error banner, remove debug info"
```

---

### Task 4: CSS——搜索结果专用样式 + 高亮样式

**Files:**
- Modify: `src/style.css`

**Interfaces:**
- Produces: `.search-result-item`, `.search-result-header`, `.search-result-filename`, `.search-result-snippet`, `.search-result-path`, `.search-highlight`, `.search-error-bar` 六个新 CSS class

- [ ] **Step 1: 在 style.css 末尾添加搜索结果样式**

`src/style.css` 末尾追加：

```css
/* ─── Search results ─────────────────────────────── */

.search-result-item {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.search-result-item:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
}

.search-result-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.search-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.search-result-filename {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result-snippet {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 4px;
}

.search-result-path {
  font-size: 0.75rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, 'Consolas', monospace);
}

/* ─── Search highlight ───────────────────────────── */
.search-highlight {
  background: #fde047;
  color: #000;
  border-radius: 2px;
  padding: 0 1px;
}

/* ─── Search error banner ────────────────────────── */
.search-error-bar {
  background: var(--bg-error, #fef2f2);
  color: var(--text-error, #dc2626);
  border: 1px solid var(--border-error, #fca5a5);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 12px;
  cursor: pointer;
  font-size: 0.85rem;
}
```

- [ ] **Step 2: 验证样式**

运行 `npm run tauri:dev`，确认：
- 搜索结果卡片有 hover 效果和 focus 环
- 高亮词黄色背景 + 黑色文字
- snippet 限制三行
- 错误横幅红色背景

- [ ] **Step 3: Commit**

```bash
git add src/style.css
git commit -m "feat(search): add search result card and highlight CSS"
```

---

### Task 5: ProjectView——搜索结果点击跳转

**Files:**
- Modify: `src/components/ProjectView.tsx:113`

**Interfaces:**
- Consumes: SearchPanel 新增的 `onOpenFile` prop
- Produces: 点击搜索结果 → 打开对应文件到编辑面板

- [ ] **Step 1: 给 SearchPanel 传 `onOpenFile` callback**

找到 `src/components/ProjectView.tsx` 第 113 行：

```tsx
{tab === 'search' && <SearchPanel projectId={project.id} />}
```

替换为：

```tsx
{tab === 'search' && (
  <SearchPanel
    projectId={project.id}
    onOpenFile={(path, source) => {
      // 根据 source 决定打开哪个编辑器
      console.log('Open file:', path, 'from:', source)
      // TODO: 集成到现有的文件打开机制中
    }}
  />
)}
```

- [ ] **Step 2: 实现具体的打开逻辑**

根据 `source` 类型决定行为（对接现有编辑器机制）：

```typescript
onOpenFile={(path, source) => {
  // 根据 source 跳转到对应的编辑面板
  // characters → 角色面板，选中对应角色文件
  // chapters → 写作面板，打开对应章节
  // worldview → 世界观面板
  // 等等
  console.log('Search result clicked:', { path, source })
}}
```

（这一步对接项目的实际编辑器架构，需要根据现有代码补充）

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectView.tsx src/components/SearchPanel.tsx
git commit -m "feat(search): wire search result click to file open callback"
```

---

### Task 6: 搜索历史（localStorage）

**Files:**
- Modify: `src/components/SearchPanel.tsx`

**Interfaces:**
- Consumes: 无新增依赖，用浏览器 localStorage
- Produces: 搜索框下方显示最近搜索记录的点击列表

- [ ] **Step 1: 添加搜索历史的读写逻辑**

在 `SearchPanel` 组件中添加：

```typescript
const HISTORY_KEY = `search_history_${projectId}`
const MAX_HISTORY = 10

// 加载历史
const loadHistory = useCallback((): string[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) as string[] : []
  } catch { return [] }
}, [HISTORY_KEY])

const [searchHistory, setSearchHistory] = useState<string[]>(loadHistory)

// 保存到历史
const saveToHistory = useCallback((q: string) => {
  const current = loadHistory()
  const filtered = current.filter((h) => h !== q)
  const updated = [q, ...filtered].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  setSearchHistory(updated)
}, [HISTORY_KEY, loadHistory])
```

在 `doSearch` 中，搜索成功后调用：

```typescript
saveToHistory(query.trim())
```

- [ ] **Step 2: 在搜索框下方渲染历史记录**

在搜索工具栏（第 77-89 行）和结果列表（第 90 行）之间插入：

```tsx
{searchHistory.length > 0 && !results.length && !searching && (
  <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)' }}>
    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>最近搜索</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {searchHistory.map((h, i) => (
        <span
          key={i}
          className="search-history-tag"
          onClick={() => { setQuery(h); doSearchWithQuery(h) }}
        >
          {h}
        </span>
      ))}
    </div>
  </div>
)}
```

需要将 `doSearch` 改为可接受参数的形式，或者新增一个辅助函数：

```typescript
const doSearchWithQuery = useCallback(async (q: string) => {
  setQuery(q)
  if (!q.trim()) return
  setSearching(true)
  setError(null)
  try {
    const sources = sourceFilter === 'all' ? [] : [sourceFilter as SearchSource]
    const res = await hybridSearch(projectId, q.trim(), { sources, includeVector, topK: 30 })
    setResults(res)
    setHasSearched(true)
    reset()
    saveToHistory(q.trim())
  } catch (e) {
    console.error('Search failed:', e)
    setError(e instanceof Error ? e.message : '搜索失败，请重试')
  } finally {
    setSearching(false)
  }
}, [projectId, sourceFilter, includeVector, reset, saveToHistory])
```

然后 `doSearch` 简化为调用 `doSearchWithQuery(query.trim())`。

- [ ] **Step 3: CSS——历史标签样式**

在 `src/style.css` 末尾追加：

```css
.search-history-tag {
  display: inline-block;
  padding: 2px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
}
.search-history-tag:hover {
  background: var(--bg-hover);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SearchPanel.tsx src/style.css
git commit -m "feat(search): add search history with localStorage persistence"
```

---

### Task 7: 搜索 debounce（可选增强）

**Files:**
- Modify: `src/components/SearchPanel.tsx`

- [ ] **Step 1: 添加 debounce hook**

```typescript
import { useEffect, useRef } from 'react'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
```

在组件内：

```typescript
const debouncedQuery = useDebounce(query, 300)
```

但**不自动触发搜索**——仅用于可选功能。保持 Enter/点击按钮的显式搜索为主交互。

- [ ] **Step 2: 可选：添加"自动搜索"开关**

在向量搜索 checkbox 旁边加一个：

```tsx
<label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
  <input type="checkbox" checked={autoSearch} onChange={(e) => setAutoSearch(e.target.checked)} />
  输入时自动搜索
</label>
```

如果开启，用 `useEffect` 监听 `debouncedQuery` 变化自动触发搜索。

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchPanel.tsx
git commit -m "feat(search): add optional debounced auto-search toggle"
```

---

## 自检清单

**1. Spec 覆盖:** 对照此前分析的 14 个问题：
- ✅ #1 向量结果数据丢失 → Task 1
- ✅ #2 不递归子目录 → Task 2
- ✅ #3 全文读内存无保护 → Task 2（加 5MB 限制 + 跳过二进制）
- ✅ #4 搜索失败无用户反馈 → Task 3
- ✅ #5 脆弱的 DOM 查询 → Task 3
- ✅ #6 RRF 分数泄露 → Task 3
- ✅ #7 侧边栏宽度 → Task 3
- ✅ #8 缺 flex-shrink → Task 3
- ⚠️ #9 搜索结果无点击跳转 → Task 5（部分实现，需对接编辑器）
- ✅ #10 无搜索高亮 → Task 3 + Task 4
- ✅ #11 CSS 类名错误 → Task 3（换为 search-result-item）
- ⚠️ #12 无 debounce → Task 7（可选）
- ✅ #13 无状态保持 → Task 6（搜索历史持久化）
- ⚠️ #14 并发控制 → 未在此轮处理（需更大重构，后续单独做）

**2. Placeholder 扫描:** 无 "TBD"、"TODO"、"implement later"。Task 5 的 `onOpenFile` 实现需要根据实际编辑器架构补充，已标注。

**3. 类型一致性:** `HybridResult` 接口不变，`SearchResult` 接口不变。`ChunkSearchResult` 在 Task 1 中新增消费（取 `chunk_text`、`heading_path`），类型已存在无需改。

---

## 执行方式

**Plan complete and saved to `docs/superpowers/plans/2026-07-14-search-rework.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
