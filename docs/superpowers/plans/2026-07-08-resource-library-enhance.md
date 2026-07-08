# 素材库增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute tasks inline step-by-step. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance resource library with 3 features: (1) search integration — resources appear in hybrid search results; (2) AI features — category suggestion + AI expansion; (3) editor side panel — browse resources and insert at cursor while writing.

**Architecture:** Three independent task groups. Search integration requires both Rust (extend keyword search to workspace-level `resources/`) and frontend (extend SearchSource type + add resource chunk+embed pipeline). AI features reuse existing `rewriteService` pattern. Editor side panel uses `forwardRef` pattern to expose editor insertion API.

**Tech Stack:** Rust (Tauri commands extension), TypeScript 6, TipTap (editor selection/insertion API)

**Design Reference:** `docs/superpowers/specs/2026-07-08-v04-quality-assurance-design.md` §六 Phase 2/3

## Global Constraints

- No `as any`, `@ts-ignore`, or `@ts-expect-error`
- TypeScript strict mode
- New panels follow AGENTS.md `panel-layout` CSS convention
- Rust commands follow snake_case naming, TypeScript API wrappers use camelCase
- `resources/` directory is workspace-level (sibling of `projects/`), NOT project-level
- Every change must pass `npx tsc --noEmit` and `cd src-tauri && cargo check`

---

### Task 1: Rust — Add Resource Keyword Search

**Files:**
- Modify: `src-tauri/src/commands/search.rs` (add `search_resources` function)
- Modify: `src-tauri/src/lib.rs` (register new command)

**Problem:** Current `search_project_files` iterates over a hardcoded 6-tuple of project-level subdirs. `resources/` is at workspace level, so it needs a separate search function.

- [ ] **Step 1: Add `search_resources` command to search.rs**

Append to `src-tauri/src/commands/search.rs`:

```rust
fn resource_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))
        .map(|d| d.join("resources"))
}

#[tauri::command]
pub fn search_resource_files(
    app_handle: tauri::AppHandle,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let query_lower = query.to_lowercase();
    let max = max_results.unwrap_or(10);
    let dir = resource_dir(&app_handle)?;
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();

    // Iterate over categories (subdirs), then files
    if let Ok(categories) = fs::read_dir(&dir) {
        for cat_entry in categories.flatten() {
            let cat_path = cat_entry.path();
            if !cat_path.is_dir() { continue; }
            let category = cat_path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .filter(|n| !n.starts_with('.'))
                .unwrap_or_default();
            if category.is_empty() { continue; }

            if let Ok(entries) = fs::read_dir(&cat_path) {
                for entry in entries.flatten() {
                    if results.len() >= max { break; }
                    let path = entry.path();
                    if path.is_dir() || path.file_name().map_or(true, |n| n.to_string_lossy().starts_with('.')) {
                        continue;
                    }
                    if let Ok(content) = fs::read_to_string(&path) {
                        let score = score_match(&content, &query_lower);
                        if score > 0.0 {
                            let rel_path = format!("resources/{}/{}", category,
                                path.file_name().map_or(String::new(), |n| n.to_string_lossy().to_string()));
                            results.push(SearchResult {
                                path: rel_path,
                                filename: path.file_name().map_or(String::new(), |n| n.to_string_lossy().to_string()),
                                snippet: extract_snippet(&content, &query_lower, 120),
                                score,
                                source: "resources".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(max);
    Ok(results)
}
```

- [ ] **Step 2: Register in lib.rs**

In `src-tauri/src/lib.rs`, add to `invoke_handler!`:
```rust
commands::search::search_resource_files,
```

- [ ] **Step 3: Verify Rust compile**

Run: `cd src-tauri && cargo check`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/search.rs src-tauri/src/lib.rs
git commit -m "feat(resource): add workspace-level resource keyword search command"
```

---

### Task 2: Frontend — Search Integration + Resource Chunk Pipeline

**Files:**
- Modify: `src/services/search.ts` (add `'resources'` to SearchSource, add resource search to hybridSearch)
- Modify: `src/components/SearchPanel.tsx` (add resources to SOURCE_LABELS + source list)
- Modify: `src/api/tauri.ts` (add `searchResourceFiles` API binding)

- [ ] **Step 1: Add API binding to tauri.ts**

Append to `src/api/tauri.ts`:
```typescript
export async function searchResourceFiles(query: string, maxResults?: number): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_resource_files', { query, maxResults: maxResults ?? 10 })
}
```

- [ ] **Step 2: Extend SearchSource in search.ts**

```typescript
export type SearchSource = 'characters' | 'worldview' | 'chapters' | 'notes' | 'outline' | 'memory' | 'resources'
```

- [ ] **Step 3: Add resource search to hybridSearch**

In `hybridSearch()`, after the `keywordPromise` and `vectorPromise`, add a third parallel branch for resources:

```typescript
// 3. Resource search (workspace-level keyword)
const resourcePromise = searchResourceFiles(query, topK).catch(() => [])
```

In the RRF fusion section, change from 2-rank to 3-rank:
```typescript
const rankMap = new Map<string, { keywordRank: number | null; vectorRank: number | null; resourceRank: number | null }>()

// ... existing keyword + vector rank mapping ...

// Resource ranks
resourceResults?.forEach((r, i) => {
  const key = r.path
  if (!rankMap.has(key)) rankMap.set(key, { keywordRank: null, vectorRank: null, resourceRank: null })
  rankMap.get(key)!.resourceRank = i + 1
})

// Compute RRF score with 3 rankings
for (const [path, ranks] of rankMap) {
  let rrfScore = 0
  if (ranks.keywordRank !== null) rrfScore += 1 / (RRF_K + ranks.keywordRank)
  if (ranks.vectorRank !== null) rrfScore += 1 / (RRF_K + ranks.vectorRank)
  if (ranks.resourceRank !== null) rrfScore += 1 / (RRF_K + ranks.resourceRank)
  // ...
}
```

- [ ] **Step 4: Update SearchPanel.tsx**

Add to `SOURCE_LABELS`:
```typescript
const SOURCE_LABELS: Record<string, string> = {
  // ... existing ...
  memory: '记忆',
  resources: '素材',
}
```

Add `'resources'` to the source list array:
```typescript
{['all', 'characters', 'worldview', 'chapters', 'notes', 'outline', 'memory', 'resources'].map((s) => ( ... ))}
```

- [ ] **Step 5: Add resource chunk+embed for vector search**

Create `src/services/resourceIndexer.ts` with function to chunk and embed a resource file:

```typescript
import { chunkMarkdown } from './textChunker'
import { embedChunks } from './embeddings'
import { readResourceFile, vectorUpsertChunks } from '../api/tauri'

export async function indexResourceFile(
  projectId: string,
  category: string,
  filename: string,
): Promise<void> {
  const content = await readResourceFile(category, filename)
  const pageId = `resources/${category}/${filename}`
  const chunks = chunkMarkdown(content, pageId, { maxChunkChars: 1500 })
  if (chunks.length === 0) return
  const results = await embedChunks(chunks)
  if (!results) return
  await vectorUpsertChunks(projectId, results.map((r) => ({
    chunk_id: r.chunk.chunkId,
    page_id: r.chunk.pageId,
    chunk_index: r.chunk.chunkIndex,
    heading_path: r.chunk.headingPath,
    chunk_text: r.chunk.content,
    embedding: Array.from(r.embedding),
  })))
}
```

- [ ] **Step 6: Wire indexing into ResourcePanel save flow**

In `ResourcePanel.tsx`, import the indexer and call it after successful file save:

```typescript
import { indexResourceFile } from '../services/resourceIndexer'

// In handleSave, after write success:
if (selectedCategory && selectedFile) {
  await writeResourceFile(selectedCategory, selectedFile, editContent)
  // Index for search
  indexResourceFile(projectId, selectedCategory, selectedFile).catch(console.error)
  // ...
}
```

Note: `projectId` needs to be added to ResourcePanel props since the indexer is currently project-scoped. Add `projectId: string` to ResourcePanel's Props interface.

- [ ] **Step 7: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/services/search.ts src/services/resourceIndexer.ts src/components/SearchPanel.tsx src/api/tauri.ts
git commit -m "feat(resource): integrate resources into hybrid search + add chunk-index pipeline"
```

---

### Task 3: AI Classification Suggestion + AI Expansion

**Files:**
- Create: `src/services/resourceAI.ts`
- Modify: `src/components/ResourcePanel.tsx` (add AI buttons)

- [ ] **Step 1: Create src/services/resourceAI.ts**

```typescript
import { loadProviderConfig } from '../api/tauri'

export interface ClassificationResult {
  suggested_category: string
  tags: string[]
}

/** AI-suggest category and tags for resource content. Non-streaming. */
export async function suggestCategory(content: string): Promise<ClassificationResult | null> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) return null

  const text = content.replace(/<[^>]*>/g, '').trim().slice(0, 2000)

  const response = await fetch(`${provider.base_url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.api_key}` },
    body: JSON.stringify({
      model: provider.models.analysis,
      messages: [
        { role: 'system', content: '你是一个写作素材分类助手。分析以下素材内容，建议分类（描写库/灵感簿/知识笔记/摘抄/角色设定/世界观架构）和标签。只输出JSON。' },
        { role: 'user', content: `素材内容：\n${text}\n\n输出JSON格式：{"suggested_category": "...", "tags": ["tag1", "tag2"]}` },
      ],
      temperature: 0.3,
      max_tokens: 256,
    }),
  })

  if (!response.ok) return null

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? ''
  try {
    // Try direct parse or extract from code block
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
    return JSON.parse(jsonStr) as ClassificationResult
  } catch {
    return null
  }
}

/** AI expand/polish resource content. Streaming, reuses rewriteService pattern. */
export async function expandResource(
  content: string,
  mode: 'expand' | 'polish',
  onToken: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) { onError('未配置 AI Provider'); return }

  const modePrompt = mode === 'expand'
    ? '请扩写以下素材。在原文基础上增加细节、例子和深度，扩展到原长的 1.5-2 倍。保持原有风格。只输出扩写后的内容。'
    : '请润色以下素材。修正表达问题，优化措辞，保持原意不变。只输出润色后的内容。'

  const controller = new AbortController()

  try {
    const response = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.api_key}` },
      body: JSON.stringify({
        model: provider.models.writing,
        messages: [
          { role: 'system', content: `你是一个写作素材编辑助手。${modePrompt}` },
          { role: 'user', content: `素材内容：\n${content}` },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })

    if (!response.ok) { onError(`API error ${response.status}`); return }

    const reader = response.body?.getReader()
    if (!reader) { onError('Response body not readable'); return }

    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t || !t.startsWith('data: ')) continue
        const d = t.slice(6)
        if (d === '[DONE]') { onDone(); return }
        try {
          const parsed = JSON.parse(d) as { choices?: Array<{ delta?: { content?: string } }> }
          const c = parsed.choices?.[0]?.delta?.content
          if (c) onToken(c)
        } catch { /* skip */ }
      }
    }
    onDone()
  } catch (e) {
    if ((e as Error).name === 'AbortError') { onDone(); return }
    onError(String(e))
  }
}
```

- [ ] **Step 2: Add AI buttons to ResourcePanel.tsx**

Add imports:
```typescript
import { suggestCategory, expandResource } from '../services/resourceAI'
```

Add state:
```typescript
const [aiSuggesting, setAiSuggesting] = useState(false)
const [aiSuggestion, setAiSuggestion] = useState<{ category: string; tags: string[] } | null>(null)
const [aiExpanding, setAiExpanding] = useState(false)
const [aiExpandedText, setAiExpandedText] = useState('')
```

Add AI suggestion button in the file editor header area (when viewing, not editing):
```tsx
{!editing && fileContent && (
  <button
    className="btn-secondary"
    onClick={async () => {
      setAiSuggesting(true)
      setAiSuggestion(null)
      const result = await suggestCategory(fileContent)
      if (result) setAiSuggestion(result)
      setAiSuggesting(false)
    }}
    disabled={aiSuggesting}
    style={{ fontSize: '0.8rem' }}
  >
    {aiSuggesting ? '分析中…' : '🏷 AI 分类建议'}
  </button>
)}
```

Add expand/polish buttons in the editing toolbar:
```tsx
{editing && editContent && (
  <>
    <button
      className="btn-secondary"
      onClick={() => {
        setAiExpanding(true)
        setAiExpandedText('')
        expandResource(
          editContent, 'expand',
          (t) => setAiExpandedText((p) => p + t),
          () => setAiExpanding(false),
          (e) => { console.error(e); setAiExpanding(false) },
        )
      }}
      disabled={aiExpanding}
      style={{ fontSize: '0.8rem' }}
    >
      {aiExpanding ? '扩写中…' : '📝 AI 扩写'}
    </button>
    <button
      className="btn-secondary"
      onClick={() => {
        setAiExpanding(true)
        setAiExpandedText('')
        expandResource(
          editContent, 'polish',
          (t) => setAiExpandedText((p) => p + t),
          () => setAiExpanding(false),
          (e) => { console.error(e); setAiExpanding(false) },
        )
      }}
      disabled={aiExpanding}
      style={{ fontSize: '0.8rem' }}
    >
      {aiExpanding ? '润色中…' : '✨ AI 润色'}
    </button>
  </>
)}
```

Show AI expansion result:
```tsx
{aiExpandedText && (
  <div style={{ padding: 16, borderTop: '1px solid var(--border)', background: '#f0f8ff' }}>
    <h5 style={{ marginBottom: 8 }}>AI 建议</h5>
    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.7 }}>{aiExpandedText}</pre>
    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
      <button className="btn-primary" onClick={() => { setEditContent(aiExpandedText); setAiExpandedText('') }}>
        ✓ 接受
      </button>
      <button className="btn-text" onClick={() => setAiExpandedText('')}>✕ 拒绝</button>
    </div>
  </div>
)}
```

Show AI classification suggestion:
```tsx
{aiSuggestion && (
  <div className="error-bar" style={{ background: '#f0f8ff', border: '1px solid #b8d4fe', margin: '8px 0' }}>
    建议分类：<strong>{aiSuggestion.category}</strong>
    ，标签：{aiSuggestion.tags.map((t) => <code key={t} style={{ margin: '0 2px' }}>{t}</code>).join(' ')}
    <button className="btn-text" onClick={() => setAiSuggestion(null)}>✕</button>
  </div>
)}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/services/resourceAI.ts src/components/ResourcePanel.tsx
git commit -m "feat(resource): add AI category suggestion and expand/polish"
```

---

### Task 4: Editor Side Panel — Browse Resources and Insert at Cursor

**Files:**
- Modify: `src/components/Editor.tsx` (add forwardRef + expose insertAtCursor)
- Create: `src/components/MaterialSidebar.tsx` (compact resource browser sidebar)
- Modify: `src/components/ChapterManager.tsx` (add sidebar alongside editor)
- Modify: `src/style.css` (add material-sidebar styles)

- [ ] **Step 1: Expose editor insertion API via forwardRef**

In `src/components/Editor.tsx`, wrap with `forwardRef` and expose `insertAtCursor`:

```tsx
import { forwardRef, useImperativeHandle } from 'react'

export interface EditorHandle {
  insertAtCursor: (text: string) => void
}

const Editor = forwardRef<EditorHandle, Props>(({ projectId, chapterId, initialContent, targetWords = 1200, onContentChange, chapterNumber = 1 }, ref) => {
  // ... existing code ...

  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      if (!editor) return
      editor.commands.focus()
      editor.commands.insertContentAt(editor.state.selection.from, text)
    },
  }))

  // ... rest of existing code ...
})

export default Editor
```

Update the Props interface to add `projectId` if not already there (it is).

- [ ] **Step 2: Update ChapterManager.tsx to import ref'd Editor**

Change import from:
```tsx
import Editor from './Editor'
```
To:
```tsx
import Editor, { type EditorHandle } from './Editor'
```

Add ref:
```tsx
const editorRef = useRef<EditorHandle>(null)
```

Pass ref to Editor:
```tsx
<Editor ref={editorRef} ... />
```

- [ ] **Step 3: Create MaterialSidebar.tsx**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { listResourceCategories, listResourceFiles, readResourceFile } from '../api/tauri'
import type { FileEntry } from '../api/tauri'

interface Props {
  onInsert: (text: string) => void
}

export default function MaterialSidebar({ onInsert }: Props) {
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState('')

  useEffect(() => { listResourceCategories().then(setCategories).catch(console.error) }, [])

  useEffect(() => {
    if (selectedCategory) {
      listResourceFiles(selectedCategory).then((fs) => setFiles(fs.filter((f) => f.name !== '.gitkeep'))).catch(console.error)
      setSelectedFile(null)
      setPreviewText('')
    }
  }, [selectedCategory])

  const handleSelectFile = useCallback(async (filename: string) => {
    if (!selectedCategory) return
    setSelectedFile(filename)
    try {
      const content = await readResourceFile(selectedCategory, filename)
      setPreviewText(content.slice(0, 300))
    } catch { setPreviewText('') }
  }, [selectedCategory])

  return (
    <div className="material-sidebar">
      <div className="material-sidebar-header">
        <h4>素材库</h4>
      </div>

      {/* Category selector */}
      <select
        className="material-category-select"
        value={selectedCategory ?? ''}
        onChange={(e) => setSelectedCategory(e.target.value || null)}
      >
        <option value="">选择分类…</option>
        {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
      </select>

      {/* File list */}
      <div className="material-file-list">
        {files.map((f) => (
          <div
            key={f.name}
            className={`material-file-item${selectedFile === f.name ? ' active' : ''}`}
            onClick={() => handleSelectFile(f.name)}
          >
            {f.name.replace(/\.md$/i, '')}
          </div>
        ))}
        {selectedCategory && files.length === 0 && (
          <p className="material-empty">该分类暂无素材</p>
        )}
      </div>

      {/* Preview + insert */}
      {selectedFile && (
        <div className="material-preview">
          <div className="material-preview-header">
            <span className="material-filename">{selectedFile}</span>
            <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '2px 8px' }} onClick={() => onInsert(previewText)}>
              插入
            </button>
          </div>
          <pre className="material-preview-content">{previewText}</pre>
        </div>
      )}
      {!selectedCategory && (
        <p className="material-empty" style={{ padding: 16 }}>选择分类后浏览素材，点击「插入」添加到编辑器光标位置</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire into ChapterManager.tsx**

In ChapterManager, replace the simple `<Editor>` wrapper with a flex container:

```tsx
import MaterialSidebar from './MaterialSidebar'
import { useState } from 'react'

// Add state
const [showMaterial, setShowMaterial] = useState(false)

// In the editor area, replace existing <Editor ... /> with:
<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    {showVersionHistory ? (
      <VersionHistoryPanel ... />
    ) : (
      <Editor ref={editorRef} ... />
    )}
  </div>
  {showMaterial && (
    <MaterialSidebar onInsert={(text) => editorRef.current?.insertAtCursor(text)} />
  )}
</div>

// Add a toggle button to the chapter sidebar header:
<button className="btn-small" onClick={() => setShowMaterial(!showMaterial)} title="素材库">
  📦
</button>
```

- [ ] **Step 5: Add CSS to style.css**

```css
/* ─── Material Sidebar (写作时侧边面板) ─────────── */
.material-sidebar {
  width: 260px;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}
.material-sidebar-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}
.material-category-select {
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 0.82rem;
  outline: none;
}
.material-file-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.material-file-item {
  padding: 6px 12px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.1s;
}
.material-file-item:hover { background: var(--bg-card); }
.material-file-item.active { background: var(--accent); color: #fff; }
.material-empty {
  font-size: 0.8rem;
  color: var(--text-muted);
  padding: 12px;
}
.material-preview {
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  max-height: 200px;
}
.material-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-card);
  font-size: 0.8rem;
}
.material-filename {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}
.material-preview-content {
  padding: 8px 12px;
  font-size: 0.8rem;
  white-space: pre-wrap;
  overflow-y: auto;
  flex: 1;
  line-height: 1.5;
  color: var(--text-secondary);
}
```

- [ ] **Step 6: Verify compile**

Run: `npx tsc --noEmit`
Then: `cd src-tauri && cargo check`
Expected: Both clean

- [ ] **Step 7: Commit**

```bash
git add src/components/Editor.tsx src/components/MaterialSidebar.tsx src/components/ChapterManager.tsx src/style.css
git commit -m "feat(editor): add material sidebar with insert-at-cursor for resources"
```

---

### Post-Implementation Verification

- [ ] **Full compile check**

Run: `cd src-tauri && cargo check 2>&1`
Then: `npx tsc --noEmit`
Expected: Both clean

- [ ] **Git log review**

Run: `git log --oneline -6`
Expected: 4 clean commits

- [ ] **Update README**

In README.md, update v0.4 checklist if not already:
```markdown
- [x] 素材库基础版（CRUD + 分类文件夹）
- [x] 素材库搜索集成（关键词+语义搜索）
- [x] 素材库 AI 辅助（分类建议 + 扩写/润色）
- [x] 编辑器侧边素材面板（行内插入）
```
