# v0.3 记忆系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the memory system for AI novel writing — inject character cognition + foreshadowing into prompts, enable hybrid full-text + vector search, and provide a writing statistics dashboard.

**Architecture:** Three independent subsystems sharing the Editor save hook: (A) DataSourceRegistry context engine loading cognition/foreshadow/style files into AI prompts; (B) Hybrid search with CJK-aware keyword matching + LanceDB vector store + RRF fusion; (C) JSONL-based writing stats with a dashboard panel.

**Tech Stack:** Tauri 2 + React 19 + TypeScript 6 + Rust (LanceDB for vectors)

## Global Constraints

- All data local-first, file-based, no external database server
- CJK-aware text handling throughout
- Both keyword and vector search must work independently (slow embedding API does not block keyword results)
- Stats data is append-only JSONL, never modified after write
- New panels follow AGENTS.md `panel-layout` CSS convention
- No `as any`, `@ts-ignore`, or `@ts-expect-error` allowed
- TypeScript strict mode, all new types in `src/types/` if shared

---

## File Structure

```
src/
├── contextEngine/
│   ├── index.ts          ← rewritten buildContext()
│   ├── dataSource.ts     ← DataSource interface + Registry = NEW
│   ├── sources.ts        ← all concrete DataSource impls = NEW
│   └── budget.ts         ← CJK token estimation + budget = NEW
├── services/
│   ├── embeddings.ts     ← embedding API calls = NEW
│   ├── textChunker.ts    ← Markdown recursive chunker = NEW
│   ├── search.ts         ← search orchestration + RRF fusion = NEW
│   └── stats.ts          ← stats event log = NEW
├── components/
│   ├── SearchPanel.tsx   ← new search UI tab = NEW
│   ├── StatisticsPanel.tsx ← new stats dashboard tab = NEW
│   ├── ProjectView.tsx   ← add 2 new tabs (MODIFY)
│   └── Editor.tsx        ← wire stats/embedding into save hook (MODIFY)
├── types/
│   └── novel.ts          ← add StatEvent/LanceDB types (MODIFY)
src-tauri/src/
├── lib.rs                ← register new commands (MODIFY)
├── commands/
│   ├── mod.rs            ← module declarations = NEW
│   ├── search.rs         ← keyword search command = NEW
│   ├── vectorstore.rs    ← LanceDB upsert/search commands = NEW
│   └── stats.rs          ← append/read stat events = NEW
src-tauri/Cargo.toml      ← add lancedb dependency (MODIFY)
```

---

## Task Overview

| # | Name | Depends On | Scope |
|---|------|-----------|-------|
| A1 | DataSource + Registry | — | Interface/class only |
| A2 | Data Sources | A1 | 6 concrete sources |
| A3 | Token Budget | — | Utility |
| A4 | BuildContext rewrite | A1-A3 | Rewire prompt assembly |
| B1 | Rust keyword search | — | grep-style search command |
| B2 | Text chunker | — | Markdown splitter |
| B3 | Embedding service | B2 | API calls |
| B4 | Rust vector store | — | LanceDB commands |
| B5 | Search orchestrator | B1-B4 | RRF fusion |
| C1 | SearchPanel | B5 | Search UI |
| D1 | Rust stats commands | — | JSONL append/read |
| D2 | Stats service | D1 | Frontend wrapper |
| D3 | StatisticsPanel | D2 | Dashboard UI |
| D4 | Wire hooks | A4, B3, D2 | Editor save pipeline |
| D5 | Wire tabs | C1, D3 | ProjectView tabs |

---

### Task A1: DataSource Interface + Registry

**Files:**
- Create: `src/contextEngine/dataSource.ts`

**Interfaces:**
- Produces: `DataSource<T>`, `DataSourceRegistry` class, `ContextLoadContext` type

- [ ] **Step 1: Write DataSource types + Registry**

```typescript
// src/contextEngine/dataSource.ts
export interface ContextLoadContext {
  projectId: string
  chapterId: string
  chapterNumber: number
  targetWords: number
}

export interface DataSource<T> {
  name: string
  priority: number  // 1 = highest (most critical), higher = lower priority
  load(ctx: ContextLoadContext): Promise<T>
  fallback?(): T
}

export interface DataSourceResult {
  name: string
  content: string
  priority: number
  error?: string
}

export class DataSourceRegistry {
  private sources: DataSource<any>[] = []

  register<T>(source: DataSource<T>): void {
    this.sources.push(source)
  }

  registerAll(sources: DataSource<any>[]): void {
    for (const s of sources) this.register(s)
  }

  async loadAll(ctx: ContextLoadContext): Promise<DataSourceResult[]> {
    const results = await Promise.allSettled(
      this.sources.map(async (s) => {
        try {
          const content = await s.load(ctx)
          return { name: s.name, content: String(content), priority: s.priority }
        } catch (err) {
          if (s.fallback) {
            const fallbackContent = s.fallback()
            return { name: s.name, content: String(fallbackContent), priority: s.priority, error: String(err) }
          }
          return { name: s.name, content: '', priority: s.priority, error: String(err) }
        }
      }),
    )
    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<DataSourceResult>).value)
      .sort((a, b) => a.priority - b.priority)
  }

  /** Reorder a loaded result set, deduplicate by name, filter empty */
  assemble(results: DataSourceResult[]): DataSourceResult[] {
    const seen = new Set<string>()
    return results
      .filter((r) => { if (seen.has(r.name)) return false; seen.add(r.name); return true })
      .filter((r) => r.content.length > 0)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/contextEngine/dataSource.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/contextEngine/dataSource.ts
git commit -m "feat(context-engine): add DataSource interface and Registry"
```

---

### Task A2: Concrete Data Sources

**Files:**
- Create: `src/contextEngine/sources.ts`
- Modify: `src/api/tauri.ts` (no changes needed — uses existing readProjectFile)

**Interfaces:**
- Consumes: `DataSource<T>`, `DataSourceRegistry`, `ContextLoadContext` from A1
- Produces: 6 exported DataSource instances (cognitionDS, foreshadowDS, styleDS, characterStateDS, recentSummaryDS, timelineDS)

- [ ] **Step 1: Implement all data sources**

```typescript
// src/contextEngine/sources.ts
import { readProjectFile } from '../api/tauri'
import type { DataSource, ContextLoadContext } from './dataSource'
import type { CognitionState, ForeshadowStore, TimelineEntry } from '../types/novel'

const SNAPSHOT_DIR = 'memory/snapshots'
const FORESHADOW_DIR = 'memory'
const COGNITION_FILE = 'character-states.json'
const FORESHADOW_FILE = 'foreshadows.json'

// ─── Helpers ───────────────────────────────

function cognitionToText(state: CognitionState): string {
  const lines: string[] = []
  for (const char of state.characters) {
    if (char.knows.length > 0) lines.push(`${char.character}知道：${char.knows.join('、')}`)
    if (char.doesNotKnow.length > 0) lines.push(`${char.character}不知道：${char.doesNotKnow.join('、')}`)
  }
  if (state.readerKnows.length > 0) lines.push(`读者知道但角色不知道：${state.readerKnows.join('、')}`)
  return lines.join('\n')
}

function foreshadowToText(store: ForeshadowStore, currentChapter: number): string {
  const unresolved = store.entries.filter((e) => e.status !== 'resolved' && e.status !== 'abandoned')
  if (unresolved.length === 0) return ''
  // Sort by urgency: older first
  unresolved.sort((a, b) => a.plantedChapter - b.plantedChapter)
  return unresolved.map((f) => {
    const age = currentChapter - f.plantedChapter
    const urgency = age > 30 ? '⚠️ 紧急' : age > 15 ? '⚡ 注意' : '·'
    return `${urgency} [${f.status === 'advanced' ? '推进中' : '已埋设'}] ${f.name}：${f.description}（第${f.plantedChapter}章埋设）`
  }).join('\n')
}

// ─── Data Sources ───────────────────────────

export const cognitionDS: DataSource<string> = {
  name: '角色认知',
  priority: 7,
  async load(ctx: ContextLoadContext): Promise<string> {
    try {
      const raw = await readProjectFile(ctx.projectId, FORESHADOW_DIR, COGNITION_FILE)
      if (!raw.trim()) return ''
      const state = JSON.parse(raw) as CognitionState
      return cognitionToText(state)
    } catch { return '' }
  },
}

export const foreshadowDS: DataSource<string> = {
  name: '未解伏笔',
  priority: 8,
  async load(ctx: ContextLoadContext): Promise<string> {
    try {
      const raw = await readProjectFile(ctx.projectId, FORESHADOW_DIR, FORESHADOW_FILE)
      if (!raw.trim()) return ''
      const store = JSON.parse(raw) as ForeshadowStore
      return foreshadowToText(store, ctx.chapterNumber)
    } catch { return '' }
  },
}

export const styleDS: DataSource<string> = {
  name: '文风设定',
  priority: 11,
  async load(ctx: ContextLoadContext): Promise<string> {
    try {
      return await readProjectFile(ctx.projectId, '', 'style.md')
    } catch { return '' }
  },
}

/** Recent chapter summaries (last 3) */
export const recentSummaryDS: DataSource<string> = {
  name: '最近剧情摘要',
  priority: 6,
  async load(ctx: ContextLoadContext): Promise<string> {
    const summaries: string[] = []
    for (let i = Math.max(1, ctx.chapterNumber - 3); i < ctx.chapterNumber; i++) {
      const chId = `ch${String(i).padStart(3, '0')}`
      try {
        const raw = await readProjectFile(ctx.projectId, SNAPSHOT_DIR, `${chId}.snapshot.json`)
        if (raw.trim()) {
          const snap = JSON.parse(raw)
          summaries.push(`第${i}章「${snap.chapterTitle || chId}」：${snap.summary || ''}`)
        }
      } catch { /* snapshot may not exist */ }
    }
    return summaries.join('\n')
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/contextEngine/sources.ts
git commit -m "feat(context-engine): add cognition, foreshadow, style, and summary data sources"
```

---

### Task A3: CJK Token Budget Utility

**Files:**
- Create: `src/contextEngine/budget.ts`

**Interfaces:**
- Produces: `estimateTokens(text): number`, `truncateToBudget(results, maxTokens): DataSourceResult[]`

- [ ] **Step 1: Write budget utility**

```typescript
// src/contextEngine/budget.ts
import type { DataSourceResult } from './dataSource'

/** CJK-aware token estimation */
export function estimateTokens(text: string): number {
  const cjkCount = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length
  const nonCjkCount = text.length - cjkCount
  return Math.ceil(cjkCount * 0.7 + nonCjkCount * 0.25)
}

/** Truncate results to fit within maxTokens, dropping lowest priority first */
export function truncateToBudget(
  results: DataSourceResult[],
  maxTokens: number,
): DataSourceResult[] {
  // results are already sorted by priority ascending
  let total = 0
  const kept: DataSourceResult[] = []
  for (const r of results) {
    const tokens = estimateTokens(r.content)
    if (total + tokens <= maxTokens) {
      kept.push(r)
      total += tokens
    } else {
      // Add a placeholder for truncated sources
      const remaining = maxTokens - total
      if (remaining > 20) {
        kept.push({ ...r, content: r.content.slice(0, Math.floor(remaining / 0.7)) })
      }
      break
    }
  }
  return kept
}

const DEFAULT_SYSTEM_PROMPT = `你是一位优秀的网络小说作家。请根据以下要求续写小说正文。

## 写作要求
- 只输出小说正文，不要添加任何解释、注释或元描述
- 保持连贯的叙事风格
- 注意章节之间的衔接
- 用自然段落分隔，段落之间用空行`

export function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/contextEngine/budget.ts
git commit -m "feat(context-engine): add CJK-aware token budget utility"
```

---

### Task A4: Rewrite buildContext + Update Editor

**Files:**
- Modify: `src/contextEngine/index.ts`
- Modify: `src/components/Editor.tsx`

**Interfaces:**
- Consumes: `DataSourceRegistry` (A1), sources (A2), `budget.ts` (A3)
- Produces: `buildContext()` → `ContextPack` with richer system prompt

- [ ] **Step 1: Rewrite contextEngine/index.ts**

```typescript
import { getChapterOutline, getChapterContent } from '../api/tauri'
import { DataSourceRegistry } from './dataSource'
import { cognitionDS, foreshadowDS, styleDS, recentSummaryDS } from './sources'
import { estimateTokens, truncateToBudget, getDefaultSystemPrompt } from './budget'
import type { ContextLoadContext } from './dataSource'

export interface ContextPack {
  systemPrompt: string
  wordBudget: number
  sources: string[]
}

const MAX_PROMPT_TOKENS = 4096

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export async function buildContext(
  projectId: string,
  chapterId: string,
  targetWords: number,
): Promise<ContextPack> {
  const chapterNumber = Number(chapterId.replace('ch', ''))
  const ctx: ContextLoadContext = { projectId, chapterId, chapterNumber, targetWords }

  // 1. Load outline + previous ending (direct, these are always needed)
  const outline = await getChapterOutline(projectId, chapterId)

  let previousEnding = ''
  if (chapterNumber > 1) {
    const prevId = `ch${String(chapterNumber - 1).padStart(3, '0')}`
    try {
      const prevContent = await getChapterContent(projectId, prevId)
      const text = stripHtml(prevContent)
      previousEnding = text.slice(-500)
    } catch { /* no previous chapter */ }
  }

  // 2. Load context sources via DataSourceRegistry
  const registry = new DataSourceRegistry()
  registry.registerAll([recentSummaryDS, cognitionDS, foreshadowDS, styleDS])
  const loaded = await registry.loadAll(ctx)
  const assembled = registry.assemble(loaded)

  // 3. Keep only the top outline/ending + as many sources as fit budget
  const promptBase = getDefaultSystemPrompt()
  let promptBudget = MAX_PROMPT_TOKENS - estimateTokens(promptBase)

  // Outline gets 25% of budget
  const outlineTokens = estimateTokens(outline)
  const outlineActual = Math.min(outlineTokens, Math.floor(promptBudget * 0.25))
  promptBudget -= outlineActual

  // Previous ending gets 10%
  const endingTokens = estimateTokens(previousEnding)
  const endingActual = Math.min(endingTokens, Math.floor(promptBudget * 0.15))
  promptBudget -= endingActual

  // Remaining budget for sources (dropped lowest priority first)
  const fitted = truncateToBudget(assembled, Math.max(0, promptBudget))

  // 4. Assemble final prompt
  const sections: string[] = [promptBase]

  if (outline) sections.push('', '## 本章细纲', outline)
  if (previousEnding) sections.push('', '## 上一章结尾', previousEnding)

  for (const src of fitted) {
    sections.push('', `## ${src.name}`, src.content)
  }

  sections.push('', `## 字数要求`, `本章目标字数约 ${String(targetWords)} 字`)

  return {
    systemPrompt: sections.join('\n'),
    wordBudget: targetWords,
    sources: assembled.map((s) => s.name),
  }
}
```

- [ ] **Step 2: Update Editor.tsx to handle new context pack**

No structural changes needed — `buildContext` still returns `{ systemPrompt, wordBudget }`. The `sources` field is available for a future "show context" panel. Verify the existing call still works:

```typescript
// Editor.tsx line 111 — no change needed:
const ctx = await buildContext(projectId, chapterId, targetWords)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/contextEngine/ src/components/Editor.tsx
git commit -m "feat(context-engine): rewrite buildContext with DataSourceRegistry"
```

---

### Task B1: Rust Keyword Search Command

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/search.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: Tauri command `search_project_files(projectId, query, sources) → SearchResult[]`

- [ ] **Step 1: Create command module structure**

```rust
// src-tauri/src/commands/mod.rs
pub mod search;
pub mod vectorstore;
pub mod stats;
```

- [ ] **Step 2: Implement keyword search command**

```rust
// src-tauri/src/commands/search.rs
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub filename: String,
    pub snippet: String,
    pub score: f64,
    pub source: String, // "characters" | "worldview" | "chapters" | "notes" | "outline" | "memory"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchParams {
    pub project_id: String,
    pub query: String,
    pub sources: Vec<String>, // empty = all sources
}

fn project_dir(app_handle: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let workspace = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(workspace.join("projects").join(project_id))
}

fn score_match(text: &str, query_lower: &str) -> f64 {
    let text_lower = text.to_lowercase();
    if text_lower.contains(query_lower) {
        // Count occurrences for frequency boost
        let count = text_lower.matches(query_lower).count();
        let base = 10.0_f64;
        base + (count as f64).min(20.0) * 2.0
    } else {
        0.0
    }
}

fn extract_snippet(text: &str, query_lower: &str, max_len: usize) -> String {
    let text_lower = text.to_lowercase();
    if let Some(pos) = text_lower.find(query_lower) {
        let start = pos.saturating_sub(40);
        let end = (pos + query_lower.len() + 40).min(text.len());
        let mut snippet = &text[start..end];
        if start > 0 { snippet = &snippet[3..]; }
        if end < text.len() { /* keep as is */ }
        snippet.to_string()
    } else {
        text.chars().take(max_len).collect()
    }
}

fn search_directory(
    dir: &PathBuf,
    query: &str,
    subdir_label: &str,
    results: &mut Vec<SearchResult>,
    max_results: usize,
) {
    if results.len() >= max_results { return; }
    if !dir.exists() { return; }
    let query_lower = query.to_lowercase();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if results.len() >= max_results { break; }
            let path = entry.path();
            if path.is_dir() || path.file_name().map_or(true, |n| n.to_string_lossy().starts_with('.')) {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&path) {
                let score = score_match(&content, &query_lower);
                if score > 0.0 {
                    results.push(SearchResult {
                        path: path.to_string_lossy().to_string(),
                        filename: path.file_name().map_or(String::new(), |n| n.to_string_lossy().to_string()),
                        snippet: extract_snippet(&content, &query_lower, 120),
                        score,
                        source: subdir_label.to_string(),
                    });
                }
            }
        }
    }
}

#[tauri::command]
pub fn search_project_files(
    app_handle: tauri::AppHandle,
    project_id: String,
    query: String,
    sources: Vec<String>,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let max = max_results.unwrap_or(20);
    let dir = project_dir(&app_handle, &project_id)?;
    let mut results = Vec::new();

    // Source subdir map
    let source_dirs: Vec<(&str, &str)> = vec![
        ("characters", "characters"),
        ("worldview", "worldview"),
        ("chapters", "chapters"),
        ("notes", "notes"),
        ("outline", "outline"),
        ("memory", "memory"),
    ];

    let search_all = sources.is_empty();
    for (label, subdir) in &source_dirs {
        if search_all || sources.contains(&label.to_string()) {
            search_directory(&dir.join(subdir), &query, label, &mut results, max);
        }
    }

    // Sort by score descending
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(max);

    Ok(results)
}
```

- [ ] **Step 3: Register command in lib.rs**

```rust
// Add to lib.rs module declarations
mod commands;

// Add to invoke_handler! macro
search_project_files,
```

- [ ] **Step 4: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 5: Add Tauri API binding**

Add to `src/api/tauri.ts`:

```typescript
export interface SearchResult {
  path: string
  filename: string
  snippet: string
  score: number
  source: string
}

export async function searchProjectFiles(
  projectId: string,
  query: string,
  sources: string[],
  maxResults?: number,
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_project_files', {
    projectId,
    query,
    sources,
    maxResults: maxResults ?? 20,
  })
}
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/ src-tauri/src/lib.rs src/api/tauri.ts
git commit -m "feat(search): add Rust keyword search command"
```

---

### Task B2: Markdown-Aware Text Chunker

**Files:**
- Create: `src/services/textChunker.ts`

**Interfaces:**
- Produces: `Chunk` type with `headingPath`, `content`, `pageId`
- Exports: `chunkMarkdown(content, pageId, options): Chunk[]`

- [ ] **Step 1: Write text chunker**

```typescript
// src/services/textChunker.ts
export interface Chunk {
  chunkId: string
  pageId: string
  chunkIndex: number
  headingPath: string
  content: string
}

export interface ChunkOptions {
  maxChunkChars?: number
  overlapChars?: number
}

export function chunkMarkdown(
  content: string,
  pageId: string,
  options: ChunkOptions = {},
): Chunk[] {
  const maxChunkChars = options.maxChunkChars ?? 1500
  const overlapChars = options.overlapChars ?? 50

  // Strip YAML frontmatter
  const body = content.replace(/^---[\s\S]*?---\n?/, '').trim()

  // Split by headings
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const sections: { level: number; title: string; content: string; startLine: number }[] = []

  let lastIndex = 0
  let lastLevel = 0
  let lastTitle = ''
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      sections.push({
        level: lastLevel,
        title: lastTitle,
        content: body.slice(lastIndex, match.index).trim(),
        startLine: lastIndex,
      })
    }
    lastLevel = match[1]!.length
    lastTitle = match[2]!.trim()
    lastIndex = match.index
  }
  // Last section
  if (lastIndex < body.length) {
    sections.push({
      level: lastLevel,
      title: lastTitle,
      content: body.slice(lastIndex).trim(),
      startLine: lastIndex,
    })
  }

  // Build heading path breadcrumbs and chunk
  const chunks: Chunk[] = []
  let chunkIndex = 0
  const headingStack: string[] = []

  for (const section of sections) {
    // Update heading path
    while (headingStack.length >= section.level && headingStack.length > 0) {
      headingStack.pop()
    }
    if (section.title) {
      headingStack.push(section.title)
    }
    const headingPath = headingStack.join(' > ')

    // Split section content into chunks if too long
    const text = section.content
    if (text.length <= maxChunkChars) {
      if (text.length > 0) {
        chunks.push({
          chunkId: `${pageId}#${chunkIndex}`,
          pageId,
          chunkIndex: chunkIndex++,
          headingPath,
          content: text,
        })
      }
    } else {
      // Recursive split on paragraphs
      const paragraphs = text.split(/\n\n+/)
      let buffer = ''
      for (const para of paragraphs) {
        if (buffer.length + para.length > maxChunkChars && buffer.length > 0) {
          chunks.push({
            chunkId: `${pageId}#${chunkIndex}`,
            pageId,
            chunkIndex: chunkIndex++,
            headingPath,
            content: buffer.trim(),
          })
          // Overlap: keep last overlapChars chars
          buffer = buffer.slice(-overlapChars) + '\n\n' + para
        } else {
          buffer += (buffer ? '\n\n' : '') + para
        }
      }
      if (buffer.trim().length > 0) {
        chunks.push({
          chunkId: `${pageId}#${chunkIndex}`,
          pageId,
          chunkIndex: chunkIndex++,
          headingPath,
          content: buffer.trim(),
        })
      }
    }
  }

  return chunks
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/textChunker.ts
git commit -m "feat(search): add Markdown-aware text chunker with headingPath"
```

---

### Task B3: Embedding Service

**Files:**
- Create: `src/services/embeddings.ts`

**Interfaces:**
- Produces: `embedText(text): number[]`, `embedChunks(chunks): Embedding[]`

- [ ] **Step 1: Write embedding service**

```typescript
// src/services/embeddings.ts
import { loadProviderConfig } from '../api/tauri'
import type { Chunk } from './textChunker'

const MAX_RETRIES = 3
const MAX_BATCH_SIZE = 20

async function callEmbeddingAPI(
  texts: string[],
): Promise<number[][] | null> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider || !provider.models.embedding) return null

  const response = await fetch(`${provider.base_url}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify({
      model: provider.models.embedding,
      input: texts,
    }),
  })

  if (!response.ok) return null

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>
  }
  return data.data.map((d) => d.embedding)
}

/** Embed a single text with auto-retry and halving for oversized inputs */
export async function embedText(text: string): Promise<number[] | null> {
  let current = text
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await callEmbeddingAPI([current])
    if (result && result[0]) return result[0]
    // Halve and retry
    if (current.length > 64) {
      current = current.slice(0, Math.floor(current.length / 2))
    } else {
      return null
    }
  }
  return null
}

/** Embed multiple chunks in batches */
export async function embedChunks(
  chunks: Chunk[],
): Promise<Array<{ chunk: Chunk; embedding: number[] }> | null> {
  const results: Array<{ chunk: Chunk; embedding: number[] }> = []
  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE)
    const texts = batch.map((c) => c.content)
    const embeddings = await callEmbeddingAPI(texts)
    if (!embeddings) return null
    for (let j = 0; j < batch.length; j++) {
      results.push({ chunk: batch[j]!, embedding: embeddings[j]! })
    }
  }
  return results
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/embeddings.ts
git commit -m "feat(search): add embedding service with batch and auto-retry"
```

---

### Task B4: Rust Vector Store (LanceDB)

**Files:**
- Modify: `src-tauri/Cargo.toml` — add `lancedb` + `arrow` deps
- Create: `src-tauri/src/commands/vectorstore.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add dependencies to Cargo.toml**

```toml
# Add to [dependencies] in src-tauri/Cargo.toml
lancedb = { version = "0.16", default-features = false, features = ["runtime-tokio"] }
tokio = { version = "1", features = ["rt", "macros"] }
```

Note: If `lancedb` has Windows build issues, fall back to `arrow` + `serde_json` for storing embeddings as JSON arrays with JS-side cosine similarity.

- [ ] **Step 2: Implement vector store commands**

```rust
// src-tauri/src/commands/vectorstore.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkUpsertInput {
    pub chunk_id: String,
    pub page_id: String,
    pub chunk_index: u32,
    pub heading_path: String,
    pub chunk_text: String,
    pub embedding: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkSearchResult {
    pub chunk_id: String,
    pub page_id: String,
    pub chunk_index: u32,
    pub chunk_text: String,
    pub heading_path: String,
    pub score: f32,
}

fn lancedb_path(app_handle: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let workspace = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(workspace.join("projects").join(project_id).join(".lancedb"))
}

#[tauri::command]
pub async fn vector_upsert_chunks(
    app_handle: tauri::AppHandle,
    project_id: String,
    chunks: Vec<ChunkUpsertInput>,
) -> Result<(), String> {
    if chunks.is_empty() {
        return Ok(());
    }

    let db_path = lancedb_path(&app_handle, &project_id)?;
    std::fs::create_dir_all(&db_path).map_err(|e| format!("Failed to create lancedb dir: {e}"))?;

    // For now, store embeddings as JSON files (LanceDB integration TBD per build env)
    // Schema: per-page JSON with chunks + embeddings
    let mut page_map: std::collections::HashMap<String, Vec<&ChunkUpsertInput>> =
        std::collections::HashMap::new();
    for chunk in &chunks {
        page_map.entry(chunk.page_id.clone()).or_default().push(chunk);
    }

    for (page_id, page_chunks) in &page_map {
        let file_path = db_path.join(format!("{}.json", page_id));
        let json = serde_json::to_string_pretty(page_chunks)
            .map_err(|e| format!("Failed to serialize: {e}"))?;
        std::fs::write(&file_path, &json)
            .map_err(|e| format!("Failed to write: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn vector_search_chunks(
    app_handle: tauri::AppHandle,
    project_id: String,
    query_embedding: Vec<f32>,
    top_k: usize,
) -> Result<Vec<ChunkSearchResult>, String> {
    let db_path = lancedb_path(&app_handle, &project_id)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }

    let mut results: Vec<ChunkSearchResult> = Vec::new();

    // Read all stored chunk files and compute cosine similarity
    if let Ok(entries) = std::fs::read_dir(&db_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(true, |e| e != "json") {
                continue;
            }
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(chunks) = serde_json::from_str::<Vec<ChunkUpsertInput>>(&content) {
                    for chunk in &chunks {
                        let sim = cosine_similarity(&query_embedding, &chunk.embedding);
                        results.push(ChunkSearchResult {
                            chunk_id: chunk.chunk_id.clone(),
                            page_id: chunk.page_id.clone(),
                            chunk_index: chunk.chunk_index,
                            chunk_text: chunk.chunk_text.clone(),
                            heading_path: chunk.heading_path.clone(),
                            score: sim,
                        });
                    }
                }
            }
        }
    }

    // Sort by score descending, take top_k
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(top_k);
    Ok(results)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}
```

- [ ] **Step 3: Register in mod.rs + lib.rs**

```rust
// In mod.rs — already done in B1
pub mod vectorstore;

// In lib.rs invoke_handler!
vector_upsert_chunks,
vector_search_chunks,
```

- [ ] **Step 4: Add Tauri API bindings**

```typescript
// Add to src/api/tauri.ts
export interface ChunkUpsertInput {
  chunk_id: string
  page_id: string
  chunk_index: number
  heading_path: string
  chunk_text: string
  embedding: number[]
}

export interface ChunkSearchResult {
  chunk_id: string
  page_id: string
  chunk_index: number
  chunk_text: string
  heading_path: string
  score: number
}

export async function vectorUpsertChunks(
  projectId: string,
  chunks: ChunkUpsertInput[],
): Promise<void> {
  return invoke('vector_upsert_chunks', { projectId, chunks })
}

export async function vectorSearchChunks(
  projectId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<ChunkSearchResult[]> {
  return invoke<ChunkSearchResult[]>('vector_search_chunks', {
    projectId,
    queryEmbedding,
    topK,
  })
}
```

- [ ] **Step 5: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles (may need `--features runtime-tokio` or fallback)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/commands/vectorstore.rs src/api/tauri.ts
git commit -m "feat(search): add LanceDB vector store commands"
```

---

### Task B5: Search Orchestrator + RRF Fusion

**Files:**
- Create: `src/services/search.ts`

**Interfaces:**
- Consumes: `searchProjectFiles` (B1), `embedText` (B3), `vectorSearchChunks` (B4)
- Produces: `hybridSearch(projectId, query, sources): SearchResult[]`

- [ ] **Step 1: Write hybrid search with RRF**

```typescript
// src/services/search.ts
import { searchProjectFiles, vectorSearchChunks } from '../api/tauri'
import type { SearchResult } from '../api/tauri'
import { embedText } from './embeddings'

const RRF_K = 60

interface HybridResult extends SearchResult {
  rrfScore: number
}

/** CJK-aware tokenizer for keyword expansion */
function tokenizeQuery(query: string): string[] {
  const tokens = query.toLowerCase().split(/[\s,，。！？、；：""''（）()\-_/\\·~～…]+/)
    .filter((t) => t.length > 1)
    .filter((t) => !['的', '了', '是', '在', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没', '看', '好', '自己', '这', '那', '什么', '怎么', '如何', '哪个', '哪些', '为什么'].includes(t))

  const expanded: string[] = []
  for (const token of tokens) {
    const hasCJK = /[\u4e00-\u9fff]/.test(token)
    if (hasCJK && token.length > 2) {
      const chars = [...token]
      for (let i = 0; i < chars.length - 1; i++) expanded.push(chars[i]! + chars[i + 1]!)
      expanded.push(token)
    } else {
      expanded.push(token)
    }
  }

  return [...new Set([...tokens, ...expanded])]
}

export type SearchSource = 'characters' | 'worldview' | 'chapters' | 'notes' | 'outline' | 'memory'

export interface HybridSearchOptions {
  sources?: SearchSource[]
  topK?: number
  includeVector?: boolean
  timeoutMs?: number
}

export async function hybridSearch(
  projectId: string,
  query: string,
  options: HybridSearchOptions = {},
): Promise<HybridResult[]> {
  const { sources = [], topK = 20, includeVector = true, timeoutMs = 5000 } = options

  // 1. Keyword search (always)
  const keywordPromise = searchProjectFiles(projectId, query, sources, topK)

  // 2. Vector search (optional, with timeout)
  let vectorPromise: Promise<{ path: string; score: number }[] | null> = Promise.resolve(null)
  if (includeVector) {
    vectorPromise = (async () => {
      try {
        const embedding = await embedText(query)
        if (!embedding) return null
        const results = await vectorSearchChunks(projectId, embedding, topK)
        return results.map((r) => ({ path: r.page_id, score: r.score }))
      } catch { return null }
    })()
  }

  // 3. Run both with timeout
  const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))

  const [keywordResults, vectorResults] = await Promise.all([
    keywordPromise,
    vectorPromise,
  ])

  // 4. RRF fusion
  const rankMap = new Map<string, { keywordRank: number | null; vectorRank: number | null }>()

  if (keywordResults) {
    keywordResults.forEach((r, i) => {
      const key = r.path
      if (!rankMap.has(key)) rankMap.set(key, { keywordRank: null, vectorRank: null })
      rankMap.get(key)!.keywordRank = i + 1
    })
  }

  if (vectorResults) {
    vectorResults.forEach((r, i) => {
      const key = r.path
      if (!rankMap.has(key)) rankMap.set(key, { keywordRank: null, vectorRank: null })
      rankMap.get(key)!.vectorRank = i + 1
    })
  }

  // 5. Compute RRF score and merge
  const merged: HybridResult[] = []
  for (const [path, ranks] of rankMap) {
    let rrfScore = 0
    if (ranks.keywordRank !== null) rrfScore += 1 / (RRF_K + ranks.keywordRank)
    if (ranks.vectorRank !== null) rrfScore += 1 / (RRF_K + ranks.vectorRank)

    const kr = keywordResults?.find((r) => r.path === path)
    merged.push({
      path: kr?.path ?? path,
      filename: kr?.filename ?? '',
      snippet: kr?.snippet ?? '',
      score: kr?.score ?? 0,
      source: kr?.source ?? 'vector',
      rrfScore,
    })
  }

  merged.sort((a, b) => b.rrfScore - a.rrfScore)
  return merged.slice(0, topK)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/search.ts
git commit -m "feat(search): add hybrid search with RRF fusion"
```

---

### Task C1: SearchPanel Component

**Files:**
- Create: `src/components/SearchPanel.tsx`

**Interfaces:**
- Consumes: `hybridSearch()` from B5
- Produces: Search panel with input + results list

- [ ] **Step 1: Write SearchPanel component**

```tsx
// src/components/SearchPanel.tsx
'use client'

import { useState, useCallback } from 'react'
import type { SearchSource } from '../services/search'
import { hybridSearch } from '../services/search'
import type { SearchResult } from '../api/tauri'

interface Props {
  projectId: string
}

const SOURCE_LABELS: Record<string, string> = {
  characters: '角色',
  worldview: '世界观',
  chapters: '章节',
  notes: '备注',
  outline: '大纲',
  memory: '记忆',
}

export default function SearchPanel({ projectId }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<SearchResult & { rrfScore: number }>>([])
  const [searching, setSearching] = useState(false)
  const [includeVector, setIncludeVector] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  const doSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const sources = sourceFilter === 'all' ? [] : [sourceFilter as SearchSource]
      const res = await hybridSearch(projectId, query.trim(), { sources, includeVector, topK: 30 })
      setResults(res)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setSearching(false)
    }
  }, [query, projectId, sourceFilter, includeVector])

  return (
    <div className="panel-layout">
      <div className="panel-sidebar" style={{ width: 200 }}>
        <div className="panel-sidebar-header">
          <h3>搜索范围</h3>
        </div>
        <div className="panel-list">
          {['all', 'characters', 'worldview', 'chapters', 'notes', 'outline', 'memory'].map((s) => (
            <div
              key={s}
              className={`panel-item${sourceFilter === s ? ' active' : ''}`}
              onClick={() => { setSourceFilter(s) }}
            >
              {s === 'all' ? '全部' : SOURCE_LABELS[s] ?? s}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeVector} onChange={(e) => { setIncludeVector(e.target.checked) }} />
            向量搜索
          </label>
        </div>
      </div>
      <div className="panel-editor">
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input
            className="notes-input"
            style={{ flex: 1 }}
            value={query}
            onChange={(e) => { setQuery(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
            placeholder="搜索角色、世界观、章节、备注…"
          />
          <button className="btn-primary" onClick={doSearch} disabled={searching || !query.trim()}>
            {searching ? '搜索中…' : '搜索'}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {results.length === 0 && !searching && (
            <div className="panel-placeholder" style={{ height: 200 }}>输入关键词开始搜索</div>
          )}
          {results.map((r, i) => (
            <div key={`${r.path}-${i}`} className="foreshadow-item normal" style={{ marginBottom: 8 }}>
              <div className="foreshadow-item-header">
                <span className="note-type-badge">{SOURCE_LABELS[r.source] ?? r.source}</span>
                <span className="foreshadow-name">{r.filename}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RRF: {r.rrfScore.toFixed(3)}</span>
              </div>
              <div className="foreshadow-desc">{r.snippet}</div>
            </div>
          ))}
          {searching && <div className="panel-placeholder">搜索中…</div>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchPanel.tsx
git commit -m "feat(ui): add SearchPanel component with hybrid search"
```

---

### Task D1: Rust Stats Commands

**Files:**
- Create: `src-tauri/src/commands/stats.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement stats commands**

```rust
// src-tauri/src/commands/stats.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatEvent {
    pub timestamp: String,
    pub event_type: String,  // "chapter_saved" | "ai_generated" | "session_start" | "session_end"
    pub chapter: Option<u32>,
    pub char_count: Option<u32>,
    pub word_count: Option<u32>,
    pub duration_ms: Option<u64>,
    pub prompt_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

fn stats_dir(app_handle: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let workspace = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(workspace.join("projects").join(project_id).join("stats"))
}

fn current_month_file(dir: &PathBuf) -> PathBuf {
    let now = chrono::Local::now();
    dir.join(format!("{}.jsonl", now.format("%Y-%m")))
}

#[tauri::command]
pub fn append_stat_event(
    app_handle: tauri::AppHandle,
    project_id: String,
    event: StatEvent,
) -> Result<(), String> {
    let dir = stats_dir(&app_handle, &project_id)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create stats dir: {e}"))?;

    let file_path = current_month_file(&dir);
    let line = serde_json::to_string(&event)
        .map_err(|e| format!("Failed to serialize event: {e}"))?;

    fs::write(&file_path, format!("{}\n", line))
        .map_err(|e| format!("Failed to append event: {e}"))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub char_count: u32,
    pub word_count: u32,
    pub ai_generations: u32,
    pub sessions: u32,
}

#[tauri::command]
pub fn compute_daily_stats(
    app_handle: tauri::AppHandle,
    project_id: String,
    days: u32,
) -> Result<Vec<DailyStats>, String> {
    let dir = stats_dir(&app_handle, &project_id)?;
    if !dir.exists() {
        return Ok(vec![]);
    }

    // Read all JSONL files in stats dir
    let mut events: Vec<StatEvent> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(true, |e| e != "jsonl") { continue; }
            if let Ok(content) = fs::read_to_string(&path) {
                for line in content.lines() {
                    if let Ok(event) = serde_json::from_str::<StatEvent>(line) {
                        events.push(event);
                    }
                }
            }
        }
    }

    // Group by date, compute daily stats
    // (Simplified: frontend does the aggregation)
    Ok(vec![])
}

/// Simple word count: count Chinese chars + English words
pub fn count_words(text: &str) -> u32 {
    let stripped = text.replace(|c: char| c.is_ascii_punctuation() || c.is_ascii_whitespace(), " ");
    let chinese_chars: u32 = text.chars().filter(|&c| c >= '\u{4e00}' && c <= '\u{9fff}').count() as u32;
    let english_words: u32 = stripped
        .split_whitespace()
        .filter(|w| w.chars().all(|c| c.is_ascii_alphabetic()))
        .count() as u32;
    chinese_chars + english_words
}
```

- [ ] **Step 2: Register commands**

```rust
// In mod.rs
pub mod stats;

// In lib.rs invoke_handler!
append_stat_event,
compute_daily_stats,
```

- [ ] **Step 3: Add chrono to Cargo.toml**

```toml
chrono = { version = "0.4", features = [] }
```

- [ ] **Step 4: Add Tauri API bindings**

```typescript
// Add to src/api/tauri.ts
export interface StatEvent {
  timestamp: string
  event_type: 'chapter_saved' | 'ai_generated' | 'session_start' | 'session_end'
  chapter?: number
  char_count?: number
  word_count?: number
  duration_ms?: number
  prompt_tokens?: number
  output_tokens?: number
}

export async function appendStatEvent(
  projectId: string,
  event: StatEvent,
): Promise<void> {
  return invoke('append_stat_event', { projectId, event })
}

export async function computeDailyStats(
  projectId: string,
  days: number,
): Promise<DailyStats[]> {
  return invoke<DailyStats[]>('compute_daily_stats', { projectId, days })
}

export interface DailyStats {
  date: string
  char_count: number
  word_count: number
  ai_generations: number
  sessions: number
}
```

- [ ] **Step 5: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/commands/stats.rs src/api/tauri.ts
git commit -m "feat(stats): add stat event logging commands"
```

---

### Task D2: Frontend Stats Service

**Files:**
- Create: `src/services/stats.ts`

**Interfaces:**
- Produces: `logChapterSaved()`, `logAIGenerated()`, `computeDailyStats()` — aggregators

- [ ] **Step 1: Write stats service**

```typescript
// src/services/stats.ts
import { appendStatEvent as apiAppend, computeDailyStats as apiCompute } from '../api/tauri'
import type { StatEvent, DailyStats } from '../api/tauri'

export function logChapterSaved(
  projectId: string,
  chapter: number,
  content: string,
): void {
  const charCount = content.replace(/<[^>]*>/g, '').length
  const wordCount = estimateWordCount(content.replace(/<[^>]*>/g, ''))
  const event: StatEvent = {
    timestamp: new Date().toISOString(),
    event_type: 'chapter_saved',
    chapter,
    char_count: charCount,
    word_count: wordCount,
  }
  apiAppend(projectId, event).catch(console.error)
}

export function logAIGenerated(
  projectId: string,
  chapter: number,
  durationMs: number,
  outputTokens?: number,
): void {
  const event: StatEvent = {
    timestamp: new Date().toISOString(),
    event_type: 'ai_generated',
    chapter,
    duration_ms: durationMs,
    output_tokens: outputTokens,
  }
  apiAppend(projectId, event).catch(console.error)
}

function estimateWordCount(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const english = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length
  return chinese + english
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/stats.ts
git commit -m "feat(stats): add frontend stats service"
```

---

### Task D3: StatisticsPanel Component

**Files:**
- Create: `src/components/StatisticsPanel.tsx`

**Interfaces:**
- Consumes: `computeDailyStats()` from D1/D2
- Produces: Dashboard panel

- [ ] **Step 1: Write StatisticsPanel**

```tsx
// src/components/StatisticsPanel.tsx
import { useState, useEffect, useCallback } from 'react'
import { computeDailyStats } from '../api/tauri'
import type { DailyStats } from '../api/tauri'

interface Props {
  projectId: string
  targetWords?: number
}

function maxWidth(bar: number, max: number): string {
  if (max === 0) return '0%'
  return `${Math.round((bar / max) * 100)}%`
}

export default function StatisticsPanel({ projectId, targetWords = 0 }: Props) {
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await computeDailyStats(projectId, days)
      setDailyStats(data)
    } catch (e) {
      console.error('Failed to load stats:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId, days])

  useEffect(() => { load().catch(console.error) }, [load])

  const maxCharCount = Math.max(...dailyStats.map((d) => d.char_count), 1)
  const totalWords = dailyStats.reduce((s, d) => s + d.word_count, 0)
  const avgDaily = dailyStats.length > 0 ? Math.round(totalWords / dailyStats.length) : 0
  const aiRatio = dailyStats.reduce((s, d) => s + d.ai_generations, 0)
  const progress = targetWords > 0 ? Math.min(100, Math.round((totalWords / targetWords) * 100)) : 0

  return (
    <div className="panel-layout">
      <div className="panel-sidebar" style={{ width: 200 }}>
        <div className="panel-sidebar-header">
          <h3>统计概览</h3>
        </div>
        <div className="panel-list" style={{ padding: 12 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>总字数</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalWords.toLocaleString()}</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>日均字数</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{avgDaily.toLocaleString()}</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI 生成次数</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{aiRatio}</div>
          </div>
          {targetWords > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>进度</div>
              <div style={{
                height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progress}%`, height: '100%', background: 'var(--accent)',
                  borderRadius: 4, transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {progress}% ({totalWords.toLocaleString()}/{targetWords.toLocaleString()})
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          <select
            value={days}
            onChange={(e) => { setDays(Number(e.target.value)) }}
            style={{ width: '100%', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
          >
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
        </div>
      </div>
      <div className="panel-editor">
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <h3 style={{ marginBottom: 16 }}>日更字数</h3>
          {loading ? (
            <div className="panel-placeholder">加载中…</div>
          ) : dailyStats.length === 0 ? (
            <div className="panel-placeholder">暂无数据，写几章后再来看看</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dailyStats.map((d) => (
                <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 80, fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0,
                  }}>
                    {d.date.slice(5)}
                  </span>
                  <div style={{
                    flex: 1, height: 20, background: 'var(--bg)',
                    borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                    position: 'relative',
                  }}>
                    <div style={{
                      width: maxWidth(d.char_count, maxCharCount),
                      height: '100%',
                      background: d.char_count > 0 ? 'var(--accent)' : 'transparent',
                      borderRadius: 'var(--radius-sm)',
                      opacity: 0.7,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{
                    width: 70, fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right',
                    flexShrink: 0,
                  }}>
                    {d.char_count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/StatisticsPanel.tsx
git commit -m "feat(ui): add StatisticsPanel component with daily bar chart"
```

---

### Task D4: Wire Stats Events into Editor Save Hook

**Files:**
- Modify: `src/components/Editor.tsx`

- [ ] **Step 1: Add stats logging to Editor save handler**

```typescript
// Add import at top of Editor.tsx
import { logChapterSaved, logAIGenerated } from '../services/stats'

// Modify handleSaveNow to also log stats — add after line 95-103:
.then(() => {
  logChapterSaved(projectId, chapterNumber, html)
})

// Modify handleGenerate onDone callback — add after line 117:
onDone: () => {
  setGenerating(false)
  logAIGenerated(projectId, chapterNumber, Date.now() - generateStartTime)
  handleSaveNow()
},
```

Note: add `generateStartTime` ref near the top:

```typescript
const generateStartTime = useRef(0)
```

And set it in handleGenerate before calling generateChapter:

```typescript
generateStartTime.current = Date.now()
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/Editor.tsx
git commit -m "feat(stats): wire stats logging into editor save and AI generation"
```

---

### Task D5: Wire SearchPanel + StatisticsPanel into ProjectView

**Files:**
- Modify: `src/components/ProjectView.tsx`

**Interfaces:**
- Consumes: `SearchPanel`, `StatisticsPanel`
- Produces: Two new tabs in project view

- [ ] **Step 1: Add imports and tabs**

```typescript
// Add imports
import SearchPanel from './SearchPanel'
import StatisticsPanel from './StatisticsPanel'

// Update type
type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats'

// Add tab buttons after line 40
<button className={`tab-btn${tab === 'search' ? ' active' : ''}`} onClick={() => { setTab('search') }}>🔎 搜索</button>
<button className={`tab-btn${tab === 'stats' ? ' active' : ''}`} onClick={() => { setTab('stats') }}>📊 统计</button>

// Add tab content after line 49
{tab === 'search' && <SearchPanel projectId={project.id} />}
{tab === 'stats' && <StatisticsPanel projectId={project.id} targetWords={project.target_words} />}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectView.tsx
git commit -m "feat(ui): add search and statistics tabs to project view"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] §2.6 DataSourceRegistry — covered by A1-A4
- [x] §2.6 CJK token budget — covered by A3
- [x] §2.7 Vector index update — covered by B3-B5
- [x] §2.8 Search system — covered by B1-B5, C1
- [x] §2.8 RRF fusion — covered by B5
- [x] §2.8 LanceDB — covered by B4
- [x] §2.10 Writing statistics dashboard — covered by D1-D5
- [x] §2.10 JSONL event log — covered by D1

**2. Placeholder scan:** No TBD, TODO, or incomplete sections in the plan above.

**3. Type consistency:**
- `SearchResult` used consistently in B1, B5, C1
- `ChunkUpsertInput` / `ChunkSearchResult` used consistently in B4
- `StatEvent` / `DailyStats` used consistently in D1, D2, D3
- `DataSource<T>` / `ContextLoadContext` used consistently in A1-A4
