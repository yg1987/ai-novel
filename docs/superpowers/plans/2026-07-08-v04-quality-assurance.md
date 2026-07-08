# v0.4 质量保障系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build chapter version history, rewrite/expand, consistency review, review panel, and resource library — 5 modules across Rust backend and React frontend.

**Architecture:** Three independent Phase A modules (version history, rewrite, light review+panel) run in parallel with no cross-dependencies. Phase B adds deep AI review and resource library. Phase C adds diff view and AI-enhanced features. All new Rust commands follow existing `read_project_file` / `write_project_file` patterns.

**Tech Stack:** Tauri 2 (Rust) + React 19 + TypeScript 6 + TipTap

## Global Constraints

- All data local-first, file-based, no external database
- No `as any`, `@ts-ignore`, or `@ts-expect-error` allowed
- TypeScript strict mode, all new types in `src/types/`
- New panels follow AGENTS.md `panel-layout` CSS convention (`.panel-layout` / `.panel-sidebar` / `.panel-editor`)
- Rust commands follow snake_case naming for Tauri IPC, TypeScript API wrappers use camelCase
- Every new file must have clean `lsp_diagnostics` before commit
- Incremental delivery: Phase A first (working, testable), then Phase B, then Phase C

---

## File Structure

```
src-tauri/src/
├── commands/
│   ├── mod.rs               ← ADD mod version; mod resource
│   ├── version.rs            ← NEW: version history commands
│   └── resource.rs           ← NEW: workspace-level resource commands
├── lib.rs                    ← MODIFY: register new commands

src/
├── types/
│   ├── novel.ts              ← MODIFY: add ReviewReport, ReviewIssue types
│   └── review.ts             ← NEW: review-specific types
├── api/
│   └── tauri.ts              ← MODIFY: add version + resource + review API bindings
├── services/
│   ├── rewriteService.ts     ← NEW: rewrite/expand AI calls
│   ├── reviewService.ts      ← NEW: review orchestration
│   ├── reviewLightCheck.ts   ← NEW: rule engine
│   └── resources.ts          ← NEW: resource CRUD API
├── components/
│   ├── VersionHistoryPanel.tsx  ← NEW
│   ├── VersionDiffViewer.tsx    ← NEW
│   ├── RewritePreview.tsx       ← NEW
│   ├── ReviewPanel.tsx          ← NEW
│   ├── ReviewReportCard.tsx     ← NEW
│   ├── ResourcePanel.tsx        ← NEW
│   ├── Editor.tsx               ← MODIFY: rewrite toolbar + save hook
│   ├── ChapterManager.tsx       ← MODIFY: version history entry
│   └── ProjectView.tsx          ← MODIFY: add review + resource tabs
```

---

## Phase A — Core Modules (parallel)

### Task A1: Rust Version History Commands

**Files:**
- Create: `src-tauri/src/commands/version.rs`
- Modify: `src-tauri/src/commands/mod.rs` (add `pub mod version;`)
- Modify: `src-tauri/src/lib.rs` (register commands)

**Interfaces:**
- Consumes: `project_dir()` from `lib.rs`, `workspace_dir()` from `lib.rs`
- Produces: 5 Tauri commands + `VersionMeta` struct

- [ ] **Step 1: Create VersionMeta struct and path helpers**

Write `src-tauri/src/commands/version.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionMeta {
    pub version: u32,
    pub created_at: String,
    pub word_count: u32,
    pub char_count: u32,
    pub source: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VersionIndex {
    versions: Vec<VersionMeta>,
    max_versions: u32,
}

fn history_dir(project_dir: &PathBuf, chapter_id: &str) -> PathBuf {
    project_dir.join("chapters").join(".history").join(chapter_id)
}

fn index_path(project_dir: &PathBuf, chapter_id: &str) -> PathBuf {
    history_dir(project_dir, chapter_id).join("_index.json")
}

fn version_file_path(project_dir: &PathBuf, chapter_id: &str, version: u32) -> PathBuf {
    history_dir(project_dir, chapter_id).join(format!("v{}.md", version))
}

fn count_chars(text: &str) -> u32 {
    text.chars().count() as u32
}

fn count_words(text: &str) -> u32 {
    let chinese = text.chars().filter(|c| c >= &'\u{4e00}' && c <= &'\u{9fff}').count() as u32;
    let english = text.split_whitespace().filter(|w| w.chars().any(|c| c.is_ascii_alphabetic())).count() as u32;
    chinese + english
}

fn load_index(path: &PathBuf) -> VersionIndex {
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(idx) = serde_json::from_str::<VersionIndex>(&content) {
                return idx;
            }
        }
    }
    VersionIndex { versions: vec![], max_versions: 20 }
}

fn save_index(path: &PathBuf, index: &VersionIndex) -> Result<(), String> {
    let content = serde_json::to_string_pretty(index).map_err(|e| format!("Serialize error: {}", e))?;
    fs::write(path, &content).map_err(|e| format!("Write error: {}", e))
}
```

- [ ] **Step 2: Implement list_chapter_versions command**

Append to `version.rs`:

```rust
use tauri::Manager;

#[tauri::command]
pub fn list_chapter_versions(
    app_handle: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
) -> Result<Vec<VersionMeta>, String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let idx_path = index_path(&dir, &chapter_id);
    let index = load_index(&idx_path);
    let mut versions = index.versions;
    versions.sort_by(|a, b| b.version.cmp(&a.version)); // newest first
    Ok(versions)
}
```

- [ ] **Step 3: Implement get_chapter_version command**

```rust
#[tauri::command]
pub fn get_chapter_version(
    app_handle: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
    version: u32,
) -> Result<String, String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let file_path = version_file_path(&dir, &chapter_id, version);
    if !file_path.exists() {
        return Err(format!("Version {} not found", version));
    }
    fs::read_to_string(&file_path).map_err(|e| format!("Read error: {}", e))
}
```

- [ ] **Step 4: Implement restore_chapter_version command**

```rust
#[tauri::command]
pub fn restore_chapter_version(
    app_handle: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
    version: u32,
) -> Result<(), String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let file_path = version_file_path(&dir, &chapter_id, version);
    if !file_path.exists() {
        return Err(format!("Version {} not found", version));
    }
    let content = fs::read_to_string(&file_path).map_err(|e| format!("Read error: {}", e))?;

    // Backup current content first
    let chapter_path = dir.join("chapters").join(format!("{}.md", chapter_id));
    if chapter_path.exists() {
        let current = fs::read_to_string(&chapter_path).map_err(|e| format!("Read error: {}", e))?;
        if !current.trim().is_empty() {
            let idx_path = index_path(&dir, &chapter_id);
            let mut index = load_index(&idx_path);
            let next_ver = index.versions.iter().map(|v| v.version).max().unwrap_or(0) + 1;
            let backup_path = version_file_path(&dir, &chapter_id, next_ver);
            fs::create_dir_all(backup_path.parent().unwrap()).map_err(|e| format!("Dir error: {}", e))?;
            fs::write(&backup_path, &current).map_err(|e| format!("Write error: {}", e))?;
            index.versions.push(VersionMeta {
                version: next_ver,
                created_at: crate::timestamp(),
                word_count: count_words(&current),
                char_count: count_chars(&current),
                source: "restore".to_string(),
                label: format!("恢复前 (v{})", version),
            });
            save_index(&idx_path, &index)?;
        }
    }

    // Write restored content
    fs::write(&chapter_path, &content).map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}
```

- [ ] **Step 5: Implement delete_chapter_version and rename_chapter_version**

```rust
#[tauri::command]
pub fn delete_chapter_version(
    app_handle: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
    version: u32,
) -> Result<(), String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let idx_path = index_path(&dir, &chapter_id);
    let mut index = load_index(&idx_path);

    // Can't delete last remaining version
    if index.versions.len() <= 1 {
        return Err("Cannot delete the last version".to_string());
    }

    index.versions.retain(|v| v.version != version);
    save_index(&idx_path, &index)?;

    // Delete the version file
    let file_path = version_file_path(&dir, &chapter_id, version);
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| format!("Delete error: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_chapter_version(
    app_handle: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
    version: u32,
    label: String,
) -> Result<(), String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let idx_path = index_path(&dir, &chapter_id);
    let mut index = load_index(&idx_path);

    if let Some(v) = index.versions.iter_mut().find(|v| v.version == version) {
        v.label = label;
    }
    save_index(&idx_path, &index)
}
```

- [ ] **Step 6: Modify save_chapter_content to auto-backup**

In `src-tauri/src/lib.rs`, modify `save_chapter_content` to backup before writing:

```rust
#[tauri::command]
fn save_chapter_content(
    app_handle: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
    content: String,
) -> Result<(), String> {
    let dir = project_dir(&app_handle, &project_id)?;
    let chapter_path = dir.join("chapters").join(format!("{chapter_id}.md"));
    fs::create_dir_all(chapter_path.parent().unwrap())
        .map_err(|e| format!("Failed to create dir: {e}"))?;

    // Backup existing content before overwriting
    if chapter_path.exists() {
        if let Ok(current) = fs::read_to_string(&chapter_path) {
            let current_trimmed = current.trim();
            let new_trimmed = content.trim();
            if !current_trimmed.is_empty() && current_trimmed != new_trimmed {
                let idx_path = dir.join("chapters/.history").join(&chapter_id).join("_index.json");
                let idx_dir = idx_path.parent().unwrap();
                fs::create_dir_all(idx_dir).map_err(|e| format!("Failed to create history dir: {e}"))?;

                let mut index = commands::version::load_index_for_save(&idx_path);
                let next_ver = index.versions.iter().map(|v| v.version).max().unwrap_or(0) + 1;
                let backup_path = idx_dir.join(format!("v{next_ver}.md"));
                let stripped = current.replace(|c: char| c.is_ascii_control() && c != '\n', "");

                fs::write(&backup_path, &stripped).map_err(|e| format!("Failed to write backup: {e}"))?;
                index.versions.push(commands::version::VersionMeta {
                    version: next_ver,
                    created_at: timestamp(),
                    word_count: 0, // will compute from stripped
                    char_count: stripped.chars().count() as u32,
                    source: "auto_save".to_string(),
                    label: String::new(),
                });
                // Update word counts
                if let Some(v) = index.versions.last_mut() {
                    let chinese = stripped.chars().filter(|c| *c >= '\u{4e00}' && *c <= '\u{9fff}').count() as u32;
                    let english = stripped.split_whitespace()
                        .filter(|w| w.chars().any(|c| c.is_ascii_alphabetic())).count() as u32;
                    v.word_count = chinese + english;
                }
                // Prune old versions
                while index.versions.len() > index.max_versions as usize {
                    let oldest = index.versions.remove(0);
                    let old_path = idx_dir.join(format!("v{}.md", oldest.version));
                    if old_path.exists() {
                        let _ = fs::remove_file(&old_path);
                    }
                }
                let idx_json = serde_json::to_string_pretty(&index)
                    .map_err(|e| format!("Serialize error: {e}"))?;
                fs::write(&idx_path, &idx_json)
                    .map_err(|e| format!("Failed to write index: {e}"))?;
            }
        }
    }

    fs::write(&chapter_path, &content).map_err(|e| format!("Failed to write chapter: {e}"))?;
    Ok(())
}
```

Also add this helper function to `commands/version.rs`:

```rust
/// Load version index from path (for cross-module access from lib.rs)
pub fn load_index_for_save(path: &std::path::PathBuf) -> VersionIndex {
    load_index(path)
}
```

- [ ] **Step 7: Register commands in mod.rs and lib.rs**

In `src-tauri/src/commands/mod.rs`:
```rust
pub mod search;
pub mod stats;
pub mod vectorstore;
pub mod version;   // ADD
pub mod resource;  // ADD (placeholder for Task B1)
```

In `src-tauri/src/lib.rs`, add to `generate_handler![]`:
```rust
commands::version::list_chapter_versions,
commands::version::get_chapter_version,
commands::version::restore_chapter_version,
commands::version::delete_chapter_version,
commands::version::rename_chapter_version,
```

- [ ] **Step 8: Build and verify**

Run: `cd src-tauri && cargo build` — expect clean compilation.
Run: `lsp_diagnostics` on `src-tauri/src/commands/version.rs` and `src-tauri/src/lib.rs` — expect no errors.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/commands/version.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(version): add chapter version history Rust commands with auto-backup"
```

---

### Task A2: Frontend Version History API + Panel

**Files:**
- Modify: `src/api/tauri.ts` (add version API bindings)
- Create: `src/types/review.ts` (add VersionMeta type here alongside review types)
- Create: `src/components/VersionHistoryPanel.tsx`
- Create: `src/components/VersionDiffViewer.tsx`
- Modify: `src/components/ChapterManager.tsx` (add version history entry point)
- Create: `src/types/review.ts`

- [ ] **Step 1: Add VersionMeta type to `src/types/review.ts`**

```typescript
// ─── Version History ─────────────────────────────

export interface VersionMeta {
  version: number
  created_at: string
  word_count: number
  char_count: number
  source: 'auto_save' | 'manual_save' | 'ai_generated' | 'restore' | 'rewrite'
  label: string
}

export interface VersionIndex {
  versions: VersionMeta[]
  max_versions: number
}
```

- [ ] **Step 2: Add version API bindings to `src/api/tauri.ts`**

```typescript
import type { VersionMeta } from '../types/review'

export async function listChapterVersions(projectId: string, chapterId: string): Promise<VersionMeta[]> {
  return invoke<VersionMeta[]>('list_chapter_versions', { projectId, chapterId })
}

export async function getChapterVersion(projectId: string, chapterId: string, version: number): Promise<string> {
  return invoke<string>('get_chapter_version', { projectId, chapterId, version })
}

export async function restoreChapterVersion(projectId: string, chapterId: string, version: number): Promise<void> {
  return invoke<void>('restore_chapter_version', { projectId, chapterId, version })
}

export async function deleteChapterVersion(projectId: string, chapterId: string, version: number): Promise<void> {
  return invoke<void>('delete_chapter_version', { projectId, chapterId, version })
}

export async function renameChapterVersion(projectId: string, chapterId: string, version: number, label: string): Promise<void> {
  return invoke<void>('rename_chapter_version', { projectId, chapterId, version, label })
}
```

- [ ] **Step 3: Create VersionHistoryPanel component**

```tsx
// src/components/VersionHistoryPanel.tsx
import { useState, useEffect } from 'react'
import type { VersionMeta } from '../types/review'
import { listChapterVersions, getChapterVersion, restoreChapterVersion, deleteChapterVersion, renameChapterVersion } from '../api/tauri'

interface Props {
  projectId: string
  chapterId: string | null
  onRestore?: () => void // callback after restore
}

export default function VersionHistoryPanel({ projectId, chapterId, onRestore }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [renamingVersion, setRenamingVersion] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null)

  useEffect(() => {
    if (!chapterId) return
    setLoading(true)
    listChapterVersions(projectId, chapterId)
      .then(setVersions)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId, chapterId])

  const handlePreview = async (version: number) => {
    if (!chapterId) return
    setSelectedVersion(version)
    try {
      const content = await getChapterVersion(projectId, chapterId, version)
      setPreviewContent(content)
    } catch (e) {
      console.error('Failed to load version:', e)
    }
  }

  const handleRestore = async (version: number) => {
    if (!chapterId) return
    try {
      await restoreChapterVersion(projectId, chapterId, version)
      setConfirmRestore(null)
      onRestore?.()
    } catch (e) {
      console.error('Failed to restore:', e)
    }
  }

  const handleDelete = async (version: number) => {
    if (!chapterId) return
    try {
      await deleteChapterVersion(projectId, chapterId, version)
      setVersions((prev) => prev.filter((v) => v.version !== version))
    } catch (e) {
      console.error('Failed to delete version:', e)
    }
  }

  const handleRename = async (version: number) => {
    if (!chapterId || !renameValue.trim()) return
    try {
      await renameChapterVersion(projectId, chapterId, version, renameValue.trim())
      setVersions((prev) => prev.map((v) => v.version === version ? { ...v, label: renameValue.trim() } : v))
      setRenamingVersion(null)
      setRenameValue('')
    } catch (e) {
      console.error('Failed to rename:', e)
    }
  }

  const sourceLabel = (source: string): string => {
    const map: Record<string, string> = {
      auto_save: '自动保存', manual_save: '手动保存',
      ai_generated: 'AI 生成', restore: '恢复', rewrite: '改写',
    }
    return map[source] ?? source
  }

  if (!chapterId) return <div className="review-empty">请先选择一个章节</div>

  return (
    <div className="version-panel panel-layout">
      <div className="version-sidebar panel-sidebar">
        <div className="version-sidebar-header">
          <h3>版本历史</h3>
          <span className="version-count">{versions.length} 个版本</span>
        </div>
        <div className="version-list">
          {versions.length === 0 && !loading && (
            <p className="review-empty">暂无历史版本</p>
          )}
          {versions.map((v) => (
            <div
              key={v.version}
              className={`version-item${selectedVersion === v.version ? ' active' : ''}`}
              onClick={() => handlePreview(v.version)}
            >
              <div className="version-item-header">
                <span className="version-number">v{v.version}</span>
                <span className="version-source">{sourceLabel(v.source)}</span>
              </div>
              <div className="version-item-meta">
                <span>{v.word_count} 字</span>
                <span>{v.created_at.slice(0, 16).replace('T', ' ')}</span>
              </div>
              {v.label && <div className="version-label">{v.label}</div>}
              <div className="version-actions">
                {renamingVersion === v.version ? (
                  <div className="version-rename-inline">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(v.version); if (e.key === 'Escape') setRenamingVersion(null) }}
                      placeholder="版本标记…"
                      autoFocus
                    />
                    <button className="btn-text" onClick={() => handleRename(v.version)}>✓</button>
                    <button className="btn-text" onClick={() => setRenamingVersion(null)}>✕</button>
                  </div>
                ) : (
                  <button className="btn-text" onClick={(e) => { e.stopPropagation(); setRenamingVersion(v.version); setRenameValue(v.label) }}>
                    标记
                  </button>
                )}
                <button className="btn-text" onClick={(e) => { e.stopPropagation(); setConfirmRestore(v.version) }}>
                  回退
                </button>
                <button
                  className="btn-text"
                  style={{ color: 'var(--danger)' }}
                  onClick={(e) => { e.stopPropagation(); handleDelete(v.version) }}
                  disabled={versions.length <= 1}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="version-preview panel-editor">
        {selectedVersion ? (
          <>
            <div className="version-preview-header">
              <h4>v{selectedVersion} 预览</h4>
              {confirmRestore === selectedVersion ? (
                <div className="version-confirm-restore">
                  <span>确认恢复到 v{selectedVersion}？</span>
                  <button className="btn-primary" onClick={() => handleRestore(selectedVersion)}>确认恢复</button>
                  <button className="btn-text" onClick={() => setConfirmRestore(null)}>取消</button>
                </div>
              ) : null}
            </div>
            <pre className="version-preview-content">{previewContent.replace(/<[^>]*>/g, '').slice(0, 3000)}</pre>
          </>
        ) : (
          <div className="review-empty">
            <p>选择一个版本查看内容</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create VersionDiffViewer component**

```tsx
// src/components/VersionDiffViewer.tsx
import { useState } from 'react'

interface DiffLine {
  type: 'same' | 'added' | 'removed'
  content: string
  oldLine?: number
  newLine?: number
}

interface Props {
  oldText: string
  newText: string
  oldLabel?: string
  newLabel?: string
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.replace(/<[^>]*>/g, '').split('\n')
  const newLines = newText.replace(/<[^>]*>/g, '').split('\n')

  // Simple LCS-based diff (for typical chapter sizes this is sufficient)
  const dp: number[][] = Array.from({ length: oldLines.length + 1 }, () =>
    Array(newLines.length + 1).fill(0)
  )
  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  const result: DiffLine[] = []
  let i = oldLines.length, j = newLines.length
  const reversed: DiffLine[] = []
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      reversed.push({ type: 'same', content: oldLines[i - 1], oldLine: i, newLine: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversed.push({ type: 'added', content: newLines[j - 1], newLine: j })
      j--
    } else {
      reversed.push({ type: 'removed', content: oldLines[i - 1], oldLine: i })
      i--
    }
  }
  return reversed.reverse()
}

export default function VersionDiffViewer({ oldText, newText, oldLabel = '旧版本', newLabel = '新版本' }: Props) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('unified')
  const diffLines = computeDiff(oldText, newText)

  const added = diffLines.filter((l) => l.type === 'added').length
  const removed = diffLines.filter((l) => l.type === 'removed').length

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-header">
        <div className="diff-stats">
          <span className="diff-stat-added">+{added} 行</span>
          <span className="diff-stat-removed">-{removed} 行</span>
        </div>
        <div className="diff-view-mode">
          <button className={`tab-btn${viewMode === 'unified' ? ' active' : ''}`} onClick={() => setViewMode('unified')}>统一视图</button>
          <button className={`tab-btn${viewMode === 'split' ? ' active' : ''}`} onClick={() => setViewMode('split')}>分栏视图</button>
        </div>
      </div>

      <div className="diff-content">
        {diffLines.map((line, idx) => (
          <div key={idx} className={`diff-line diff-${line.type}`}>
            {viewMode === 'unified' ? (
              <>
                <span className="diff-line-num">{line.oldLine ?? ''}</span>
                <span className="diff-line-num">{line.newLine ?? ''}</span>
                <span className={`diff-prefix diff-${line.type}`}>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span className="diff-text">{line.content || ' '}</span>
              </>
            ) : (
              <span className="diff-text">{line.content || ' '}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Integrate version history into ChapterManager**

In `src/components/ChapterManager.tsx`, add a version history button in the sidebar header that opens VersionHistoryPanel as an overlay or replaces the editor area:

```tsx
// Add import
import VersionHistoryPanel from './VersionHistoryPanel'

// Add state
const [showVersionHistory, setShowVersionHistory] = useState(false)

// Add button after the existing "+" button
<button className="btn-small" onClick={() => setShowVersionHistory(true)} title="版本历史">🕐</button>

// Conditional render in editor area
{showVersionHistory ? (
  <VersionHistoryPanel
    projectId={projectId}
    chapterId={activeChapterId}
    onRestore={() => {
      setShowVersionHistory(false)
      // Refresh chapter content
      if (activeChapterId) {
        getChapterContent(projectId, activeChapterId)
          .then((content) => setChapterContent(content))
          .catch(console.error)
      }
    }}
  />
) : (
  // existing editor rendering
)}
```

- [ ] **Step 6: Add CSS for version panel**

Add to `src/style.css`:

```css
/* ─── Version History ──────────────────────────── */
.version-panel { height: 100%; }
.version-sidebar { width: 280px; overflow-y: auto; }
.version-sidebar-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.version-count { font-size: 0.8rem; color: var(--text-muted); }
.version-item {
  padding: 10px 16px; border-bottom: 1px solid var(--border);
  cursor: pointer; transition: background 0.15s;
}
.version-item:hover { background: var(--bg); }
.version-item.active { background: var(--accent); color: #fff; }
.version-item.active .version-source,
.version-item.active .version-item-meta { color: rgba(255,255,255,0.8); }
.version-item-header { display: flex; justify-content: space-between; align-items: center; }
.version-number { font-weight: 600; font-size: 0.85rem; }
.version-source { font-size: 0.75rem; color: var(--text-secondary); }
.version-item-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.version-label {
  font-size: 0.8rem; color: var(--accent); margin-top: 2px;
  font-style: italic;
}
.version-actions {
  display: flex; gap: 8px; margin-top: 6px; font-size: 0.78rem;
}
.version-rename-inline { display: flex; gap: 4px; align-items: center; }
.version-rename-inline input { width: 120px; font-size: 0.78rem; }
.version-preview { display: flex; flex-direction: column; overflow: hidden; }
.version-preview-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.version-confirm-restore { display: flex; gap: 8px; align-items: center; font-size: 0.85rem; }
.version-confirm-restore span { color: var(--danger); }
.version-preview-content {
  flex: 1; overflow-y: auto; padding: 16px;
  white-space: pre-wrap; font-size: 0.9rem; line-height: 1.7;
  font-family: var(--font-sans);
}

/* ─── Diff Viewer ──────────────────────────────── */
.diff-viewer { display: flex; flex-direction: column; height: 100%; }
.diff-viewer-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px; border-bottom: 1px solid var(--border);
  background: var(--bg-card);
}
.diff-stats { display: flex; gap: 12px; font-size: 0.85rem; }
.diff-stat-added { color: #28a745; font-weight: 600; }
.diff-stat-removed { color: #dc3545; font-weight: 600; }
.diff-content { flex: 1; overflow-y: auto; font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 0.82rem; }
.diff-line {
  display: flex; padding: 1px 8px; min-height: 1.5em; line-height: 1.5;
}
.diff-same { background: transparent; }
.diff-added { background: #e6ffed; }
.diff-removed { background: #ffeef0; }
.diff-line-num {
  width: 40px; text-align: right; padding-right: 8px;
  color: var(--text-muted); user-select: none; flex-shrink: 0;
}
.diff-prefix { width: 16px; flex-shrink: 0; font-weight: 700; }
.diff-prefix.diff-added { color: #28a745; }
.diff-prefix.diff-removed { color: #dc3545; }
.diff-text { white-space: pre-wrap; word-break: break-all; }
```

- [ ] **Step 7: LSP diagnostics and commit**

Run: `lsp_diagnostics` on all changed/new files — expect no errors.
Rebuild frontend: `npx tsc --noEmit` — expect clean.

```bash
git add src/types/review.ts src/api/tauri.ts src/components/VersionHistoryPanel.tsx src/components/VersionDiffViewer.tsx src/components/ChapterManager.tsx src/style.css
git commit -m "feat(version): add version history panel and diff viewer UI"
```

---

### Task A3: Rewrite Service + Preview Panel

**Files:**
- Create: `src/services/rewriteService.ts`
- Create: `src/components/RewritePreview.tsx`
- Modify: `src/components/Editor.tsx` (add selection toolbar)

- [ ] **Step 1: Create rewriteService.ts**

```typescript
// src/services/rewriteService.ts
import { loadProviderConfig } from '../api/tauri'

export type RewriteMode = 'rewrite' | 'expand' | 'polish'

export interface RewriteRequest {
  selectedText: string
  beforeText: string   // 200 chars before selection
  afterText: string    // 200 chars after selection
  mode: RewriteMode
  styleContext?: string // optional style guide
}

export interface StreamCallbacks {
  onToken: (text: string) => void
  onDone: () => void
  onError: (error: string) => void
}

const MODE_PROMPTS: Record<RewriteMode, string> = {
  rewrite: '请改写以下段落。保持叙事风格一致，不改变情节推进和核心信息。修正表达问题。只输出改写后的段落。',
  expand: '请扩写以下段落。在原意基础上增加细节描写（环境、神态、动作、心理），字数扩展到原长的1.5-2倍。保持叙事节奏。只输出扩写后的段落。',
  polish: '请轻微润色以下段落。修正语法和表达问题，保持原意不变，尽可能少改动。只输出润色后的段落。',
}

let activeAbortController: AbortController | null = null

export function stopRewrite(): void {
  activeAbortController?.abort()
  activeAbortController = null
}

export async function rewriteText(
  request: RewriteRequest,
  callbacks: StreamCallbacks,
): Promise<void> {
  stopRewrite()

  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) {
    callbacks.onError('未配置 AI Provider')
    return
  }

  const controller = new AbortController()
  activeAbortController = controller

  const systemPrompt = `你是一个网文编辑助手。${MODE_PROMPTS[request.mode]}`
  const userMessage = [
    request.beforeText ? `【上文】\n${request.beforeText}\n---\n` : '',
    `【选中文本】\n${request.selectedText}\n---\n`,
    request.afterText ? `【下文】\n${request.afterText}\n---\n` : '',
    request.styleContext ? `【风格参考】\n${request.styleContext}` : '',
  ].filter(Boolean).join('\n')

  try {
    const response = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify({
        model: provider.models.writing,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      throw new Error(`API error ${String(response.status)}: ${text}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Response body is not readable')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') { callbacks.onDone(); return }
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
          const content = parsed.choices?.[0]?.delta?.content
          if (content) callbacks.onToken(content)
        } catch { /* skip malformed */ }
      }
    }
    callbacks.onDone()
  } catch (e) {
    if ((e as Error).name === 'AbortError') { callbacks.onDone(); return }
    callbacks.onError(String(e))
  } finally {
    activeAbortController = null
  }
}
```

- [ ] **Step 2: Create RewritePreview component**

```tsx
// src/components/RewritePreview.tsx
import { useState, useCallback } from 'react'
import { rewriteText, stopRewrite, type RewriteMode } from '../services/rewriteService'

interface Props {
  selectedText: string
  beforeText: string
  afterText: string
  onAccept: (newText: string) => void
  onReject: () => void
}

export default function RewritePreview({ selectedText, beforeText, afterText, onAccept, onReject }: Props) {
  const [mode, setMode] = useState<RewriteMode>('rewrite')
  const [result, setResult] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    setResult('')
    await rewriteText({ selectedText, beforeText, afterText, mode }, {
      onToken: (text) => setResult((prev) => prev + text),
      onDone: () => setGenerating(false),
      onError: (err) => { setError(err); setGenerating(false) },
    })
  }, [selectedText, beforeText, afterText, mode])

  const handleStop = () => {
    stopRewrite()
    setGenerating(false)
  }

  const modeLabels: Record<RewriteMode, string> = { rewrite: '改写', expand: '扩写', polish: '润色' }

  return (
    <div className="rewrite-overlay">
      <div className="rewrite-panel">
        <div className="rewrite-header">
          <h3>AI {modeLabels[mode]}</h3>
          <div className="rewrite-modes">
            {(Object.entries(modeLabels) as [RewriteMode, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`tab-btn${mode === key ? ' active' : ''}`}
                onClick={() => setMode(key)}
                disabled={generating}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="btn-text" onClick={onReject} disabled={generating}>✕</button>
        </div>

        <div className="rewrite-compare">
          <div className="rewrite-column">
            <div className="rewrite-column-header">原文</div>
            <div className="rewrite-column-content">{selectedText}</div>
          </div>
          <div className="rewrite-column">
            <div className="rewrite-column-header">AI 建议</div>
            <div className="rewrite-column-content">
              {generating && !result && <span className="rewrite-streaming">生成中…</span>}
              {result || (error ? <span className="rewrite-error">{error}</span> : generating ? '' : '')}
              {generating && result && <span className="rewrite-cursor">▊</span>}
            </div>
          </div>
        </div>

        <div className="rewrite-actions">
          {generating ? (
            <button className="toolbar-btn stop-btn" onClick={handleStop}>■ 停止</button>
          ) : result ? (
            <>
              <button className="btn-primary" onClick={() => onAccept(result)}>✓ 接受</button>
              <button className="btn-text" onClick={handleGenerate}>🔄 重新生成</button>
            </>
          ) : (
            <button className="btn-primary" onClick={handleGenerate}>✨ 生成</button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Integrate rewrite into Editor**

In `src/components/Editor.tsx`, add:

```tsx
// Add imports
import { useCallback, useState, useRef } from 'react'
import RewritePreview from './RewritePreview'

// Add state
const [rewriteState, setRewriteState] = useState<{
  selectedText: string
  beforeText: string
  afterText: string
} | null>(null)

// Add selection handler (triggered by a button or keyboard shortcut)
const handleRewrite = useCallback(() => {
  if (!editor) return
  const { from, to } = editor.state.selection
  if (from === to) return // no selection
  const selectedText = editor.state.doc.textBetween(from, to)
  // Get context: 200 chars before and after
  const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size)
  const beforeText = fullText.slice(Math.max(0, from - 200), from)
  const afterText = fullText.slice(to, Math.min(fullText.length, to + 200))
  setRewriteState({ selectedText, beforeText, afterText })
}, [editor])

const handleRewriteAccept = useCallback((newText: string) => {
  if (!editor) return
  const { from, to } = editor.state.selection
  editor.chain().focus().deleteRange({ from, to }).insertContent(newText).run()
  setRewriteState(null)
  // Trigger save
  handleSaveNow()
}, [editor, handleSaveNow])

// Add rewrite button to toolbar (after banned words indicator, before generate button)
{/* Rewrite - only visible when text is selected */}
{editor.state.selection.from !== editor.state.selection.to && (
  <button className="toolbar-btn" onClick={handleRewrite} title="AI 改写/扩写">✏️ 改写</button>
)}

// Add RewritePreview overlay
{rewriteState && (
  <RewritePreview
    selectedText={rewriteState.selectedText}
    beforeText={rewriteState.beforeText}
    afterText={rewriteState.afterText}
    onAccept={handleRewriteAccept}
    onReject={() => setRewriteState(null)}
  />
)}
```

- [ ] **Step 4: Add CSS for rewrite panel**

Add to `src/style.css`:

```css
/* ─── Rewrite Panel ────────────────────────────── */
.rewrite-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
}
.rewrite-panel {
  background: var(--bg-card); border-radius: var(--radius);
  width: 80vw; max-width: 900px; max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-lg); overflow: hidden;
}
.rewrite-header {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.rewrite-header h3 { font-size: 1rem; flex-shrink: 0; }
.rewrite-modes { display: flex; gap: 4px; flex: 1; }
.rewrite-compare { display: flex; flex: 1; overflow: hidden; }
.rewrite-column { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.rewrite-column:first-child { border-right: 1px solid var(--border); }
.rewrite-column-header {
  padding: 8px 12px; font-size: 0.8rem; font-weight: 600;
  color: var(--text-secondary); background: var(--bg); border-bottom: 1px solid var(--border);
}
.rewrite-column-content {
  flex: 1; overflow-y: auto; padding: 12px;
  white-space: pre-wrap; font-size: 0.9rem; line-height: 1.7;
}
.rewrite-streaming { color: var(--text-muted); font-style: italic; }
.rewrite-cursor { animation: blink 1s step-end infinite; color: var(--accent); }
@keyframes blink { 50% { opacity: 0; } }
.rewrite-error { color: var(--danger); }
.rewrite-actions {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 12px 16px; border-top: 1px solid var(--border);
}
```

- [ ] **Step 5: LSP diagnostics and commit**

```bash
git add src/services/rewriteService.ts src/components/RewritePreview.tsx src/components/Editor.tsx src/style.css
git commit -m "feat(rewrite): add AI rewrite/expand/polish with preview-and-confirm"
```

---

### Task A4: Light Check Review + Review Service

**Files:**
- Create: `src/services/reviewLightCheck.ts`
- Create: `src/services/reviewService.ts`
- Modify: `src/types/review.ts` (add review types)

- [ ] **Step 1: Add review types to `src/types/review.ts`**

```typescript
// ─── Review System ───────────────────────────────

export type ReviewSeverity = 'error' | 'warning' | 'hint'
export type ReviewDimension = 'timeline' | 'character_cognition' | 'foreshadow_health' | 'setting_consistency'
export type CheckType = 'banned_words' | 'character_names' | 'location_names'

export interface ReviewIssue {
  severity: ReviewSeverity
  dimension?: ReviewDimension
  desc: string
  location?: { line: number; offset: number } | null
  suggestion?: string
  checkType?: CheckType
}

export interface LightCheckResult {
  passed: boolean
  checks: Array<{
    name: string
    passed: boolean
    issues: ReviewIssue[]
  }>
  timestamp: string
}

export interface DeepCheckResult {
  overall_score: number
  dimensions: Array<{
    name: ReviewDimension
    score: number
    issues: ReviewIssue[]
  }>
  suggestions: string[]
  timestamp: string
}

export interface ReviewReportMeta {
  filename: string
  type: 'light' | 'full'
  timestamp: string
  passed?: boolean
  overall_score?: number
  chapterId: string
}
```

- [ ] **Step 2: Create reviewLightCheck.ts**

```typescript
// src/services/reviewLightCheck.ts
import { listProjectFiles, readProjectFile } from '../api/tauri'
import { checkBannedWords } from './bannedWords'
import type { LightCheckResult, ReviewIssue, CheckType } from '../types/review'

const HTML_TAG_RE = /<[^>]*>/g

function stripHtml(html: string): string {
  return html.replace(HTML_TAG_RE, '').replace(/&nbsp;/g, ' ').trim()
}

/**
 * Extract all character names from character files.
 */
async function loadCharacterNames(projectId: string): Promise<string[]> {
  try {
    const files = await listProjectFiles(projectId, 'characters')
    const names: string[] = []
    for (const f of files) {
      // Character files are named after character names: "林尘.md" → "林尘"
      const name = f.name.replace(/\.md$/i, '')
      if (name) names.push(name)
    }
    return names
  } catch {
    return []
  }
}

/**
 * Lightweight deterministic checks that run on every save.
 * No AI calls, pure rule engine.
 */
export async function runLightCheck(
  projectId: string,
  chapterHtml: string,
): Promise<LightCheckResult> {
  const text = stripHtml(chapterHtml)
  const textLower = text.toLowerCase()

  // Check 1: Banned words
  const bannedResult = checkBannedWords(text)
  const bannedIssues: ReviewIssue[] = bannedResult.matches.map((m) => ({
    severity: m.severity >= 4 ? 'error' : m.severity >= 2 ? 'warning' : 'hint',
    desc: `禁用句式：${m.pattern}`,
    location: { line: m.line, offset: text.indexOf(m.context) },
    suggestion: m.suggestion,
    checkType: 'banned_words' as CheckType,
  }))

  // Check 2: Character name consistency
  const characterNames = await loadCharacterNames(projectId)
  const charIssues: ReviewIssue[] = []
  // No character name check issues by default — this is a "passive" check
  // that reports which characters appeared in this chapter
  const appearedChars = characterNames.filter((name) => text.includes(name))

  // Check 3: Basic text health
  const healthIssues: ReviewIssue[] = []
  if (text.length < 50) {
    healthIssues.push({
      severity: 'hint',
      desc: '章节内容较短（<50字符），建议继续写作',
      checkType: 'character_names',
    })
  }

  const checks = [
    {
      name: '禁用词检查',
      passed: bannedIssues.length === 0,
      issues: bannedIssues,
    },
    {
      name: '角色出场',
      passed: true,
      issues: charIssues,
      meta: { appearedCharacters: appearedChars } as any,
    },
    {
      name: '内容健康度',
      passed: healthIssues.length === 0,
      issues: healthIssues,
    },
  ]

  return {
    passed: checks.every((c) => c.passed),
    checks,
    timestamp: new Date().toISOString(),
  }
}
```

- [ ] **Step 3: Create reviewService.ts**

```typescript
// src/services/reviewService.ts
import { writeProjectFile, readProjectFile, listProjectFiles } from '../api/tauri'
import { runLightCheck } from './reviewLightCheck'
import { loadProviderConfig } from '../api/tauri'
import type { LightCheckResult, DeepCheckResult, ReviewReportMeta, ReviewIssue, ReviewDimension } from '../types/review'

const LIGHT_DIR = 'tracks/review-reports/light'
const FULL_DIR = 'tracks/review-reports/full'

/**
 * Run a light check and save the report.
 * Called automatically on chapter save.
 */
export async function runAndSaveLightCheck(
  projectId: string,
  chapterId: string,
  chapterHtml: string,
): Promise<LightCheckResult> {
  const result = await runLightCheck(projectId, chapterHtml)
  const filename = `${chapterId}.json`
  await writeProjectFile(projectId, LIGHT_DIR, filename, JSON.stringify(result, null, 2))
  return result
}

/**
 * Run a full AI-powered deep review and save the report.
 * Called manually by the user.
 */
export async function runDeepReview(
  projectId: string,
  chapterId: string,
  chapterHtml: string,
): Promise<DeepCheckResult> {
  const text = chapterHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

  // Load context data
  const [cognitionRaw, foreshadowRaw, timelineRaw, styleRaw] = await Promise.all([
    readProjectFile(projectId, 'memory', 'character-states.json').catch(() => ''),
    readProjectFile(projectId, 'memory', 'foreshadows.json').catch(() => ''),
    readProjectFile(projectId, 'memory', 'timeline.json').catch(() => ''),
    readProjectFile(projectId, '', 'style.md').catch(() => ''),
  ])

  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) throw new Error('No AI provider configured')

  const systemPrompt = `你是一个小说一致性审查专家。分析以下章节内容，从4个维度检查问题。

## 审查维度
1. timeline — 时间顺序是否矛盾、跳跃是否合理
2. character_cognition — 角色是否知道不应知道的信息
3. foreshadow_health — 未解伏笔是否过久未回收
4. setting_consistency — 世界观规则是否被违反

只输出JSON，不要解释。`

  const userPrompt = `## 当前章节正文
${text.slice(0, 4000)}

## 角色认知状态
${cognitionRaw.slice(0, 1000) || '（无数据）'}

## 未解伏笔
${foreshadowRaw.slice(0, 1000) || '（无数据）'}

## 时间线
${timelineRaw.slice(0, 500) || '（无数据）'}

## 文风设定
${styleRaw.slice(0, 500) || '（无数据）'}

## 输出JSON格式
{
  "overall_score": 0-10,
  "dimensions": [
    {
      "name": "timeline",
      "score": 0-10,
      "issues": [
        { "severity": "error|warning|hint", "desc": "问题描述", "location": null }
      ]
    }
  ],
  "suggestions": ["建议1"]
}`

  const response = await fetch(`${provider.base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify({
      model: provider.models.review,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`Review API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = data.choices?.[0]?.message?.content ?? ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch?.[0] ?? raw

  let result: DeepCheckResult
  try {
    result = JSON.parse(jsonStr) as DeepCheckResult
  } catch {
    result = {
      overall_score: 0,
      dimensions: [],
      suggestions: ['AI审查解析失败，请重试'],
      timestamp: new Date().toISOString(),
    }
  }
  result.timestamp = new Date().toISOString()

  // Save report
  const filename = `${chapterId}_${Date.now()}.json`
  await writeProjectFile(projectId, FULL_DIR, filename, JSON.stringify(result, null, 2))

  return result
}

/**
 * List all review reports for a project.
 */
export async function listReviewReports(
  projectId: string,
): Promise<ReviewReportMeta[]> {
  const [lightFiles, fullFiles] = await Promise.all([
    listProjectFiles(projectId, LIGHT_DIR).catch(() => []),
    listProjectFiles(projectId, FULL_DIR).catch(() => []),
  ])

  const reports: ReviewReportMeta[] = []

  for (const f of lightFiles) {
    if (!f.name.endsWith('.json')) continue
    const chapterId = f.name.replace('.json', '')
    reports.push({
      filename: f.name,
      type: 'light',
      timestamp: '', // could parse from file content
      chapterId,
    })
  }

  for (const f of fullFiles) {
    if (!f.name.endsWith('.json')) continue
    const chapterId = f.name.split('_')[0] ?? ''
    reports.push({
      filename: f.name,
      type: 'full',
      timestamp: '',
      chapterId,
    })
  }

  return reports
}

/**
 * Load a specific review report.
 */
export async function getReviewReport(
  projectId: string,
  type: 'light' | 'full',
  filename: string,
): Promise<string> {
  const dir = type === 'light' ? LIGHT_DIR : FULL_DIR
  return readProjectFile(projectId, dir, filename)
}
```

- [ ] **Step 4: LSP diagnostics and commit**

```bash
git add src/types/review.ts src/services/reviewLightCheck.ts src/services/reviewService.ts
git commit -m "feat(review): add light check rule engine and review service with deep AI review"
```

---

### Task A5: Review Panel + Report Card Components

**Files:**
- Create: `src/components/ReviewPanel.tsx`
- Create: `src/components/ReviewReportCard.tsx`
- Modify: `src/components/ProjectView.tsx` (add review tab)
- Modify: `src/style.css` (add review panel styles)

- [ ] **Step 1: Create ReviewReportCard component**

```tsx
// src/components/ReviewReportCard.tsx
import type { ReviewIssue } from '../types/review'

interface Props {
  title: string
  score?: number
  passed?: boolean
  issues: ReviewIssue[]
  onLocate?: (issue: ReviewIssue) => void
  onFix?: (issue: ReviewIssue) => void
  onDismiss?: (issue: ReviewIssue) => void
}

function severityLabel(s: string): string {
  const map: Record<string, string> = { error: '错误', warning: '警告', hint: '提示' }
  return map[s] ?? s
}

export default function ReviewReportCard({ title, score, passed, issues, onLocate, onFix, onDismiss }: Props) {
  const sorted = [...issues].sort((a, b) => {
    const order = { error: 0, warning: 1, hint: 2 }
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  })

  return (
    <div className="review-card">
      <div className="review-card-header">
        <h4>{title}</h4>
        {score !== undefined && (
          <div className={`review-score score-${score >= 7 ? 'good' : score >= 4 ? 'mid' : 'bad'}`}>
            {score}/10
          </div>
        )}
        {passed !== undefined && (
          <span className={`review-passed ${passed ? 'passed' : 'failed'}`}>
            {passed ? '✓ 通过' : '✗ 有问题'}
          </span>
        )}
      </div>

      <div className="review-issue-list">
        {sorted.length === 0 && <p className="review-empty">暂无问题</p>}
        {sorted.map((issue, i) => (
          <div key={i} className={`review-issue issue-${issue.severity}`}>
            <div className="review-issue-header">
              <span className={`issue-severity-badge badge-${issue.severity}`}>
                {severityLabel(issue.severity)}
              </span>
              <span className="issue-desc">{issue.desc}</span>
            </div>
            {issue.suggestion && (
              <div className="issue-suggestion">→ {issue.suggestion}</div>
            )}
            <div className="issue-actions">
              {onLocate && issue.location && (
                <button className="btn-text" onClick={() => onLocate(issue)}>📍 定位</button>
              )}
              {onFix && (
                <button className="btn-text" onClick={() => onFix(issue)}>🤖 AI 修复</button>
              )}
              {onDismiss && (
                <button className="btn-text" onClick={() => onDismiss(issue)}>✓ 标记已处理</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ReviewPanel component**

```tsx
// src/components/ReviewPanel.tsx
import { useState, useEffect, useCallback } from 'react'
import type { ReviewReportMeta, LightCheckResult, DeepCheckResult, ReviewIssue } from '../types/review'
import { listReviewReports, getReviewReport, runAndSaveLightCheck, runDeepReview } from '../services/reviewService'
import ReviewReportCard from './ReviewReportCard'

interface Props {
  projectId: string
  currentChapterId: string | null
  chapterHtml?: string
}

export default function ReviewPanel({ projectId, currentChapterId, chapterHtml = '' }: Props) {
  const [reports, setReports] = useState<ReviewReportMeta[]>([])
  const [selectedReport, setSelectedReport] = useState<{ type: 'light' | 'full'; filename: string } | null>(null)
  const [reportContent, setReportContent] = useState<string>('')
  const [runningReview, setRunningReview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const list = await listReviewReports(projectId)
    setReports(list)
  }, [projectId])

  useEffect(() => { refresh().catch(console.error) }, [refresh])

  const handleSelectReport = async (type: 'light' | 'full', filename: string) => {
    setSelectedReport({ type, filename })
    try {
      const content = await getReviewReport(projectId, type, filename)
      setReportContent(content)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleRunLightCheck = async () => {
    if (!currentChapterId || !chapterHtml) return
    setRunningReview(true)
    setError(null)
    try {
      await runAndSaveLightCheck(projectId, currentChapterId, chapterHtml)
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setRunningReview(false)
    }
  }

  const handleRunDeepReview = async () => {
    if (!currentChapterId || !chapterHtml) return
    setRunningReview(true)
    setError(null)
    try {
      await runDeepReview(projectId, currentChapterId, chapterHtml)
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setRunningReview(false)
    }
  }

  let parsedReport: LightCheckResult | DeepCheckResult | null = null
  if (reportContent) {
    try { parsedReport = JSON.parse(reportContent) } catch { /* ignore */ }
  }

  return (
    <div className="review-panel panel-layout">
      <div className="panel-sidebar review-sidebar">
        <div className="review-sidebar-header">
          <h3>审查报告</h3>
        </div>
        <div className="review-actions-panel">
          <button
            className="btn-primary"
            onClick={handleRunLightCheck}
            disabled={runningReview || !currentChapterId}
            style={{ width: '100%', marginBottom: 8 }}
          >
            {runningReview ? '检查中…' : '⚡ 保存时轻量检查'}
          </button>
          <button
            className="btn-primary"
            onClick={handleRunDeepReview}
            disabled={runningReview || !currentChapterId}
            style={{ width: '100%' }}
          >
            {runningReview ? '审查中…' : '🔍 完整 AI 审查'}
          </button>
        </div>
        {error && <div className="error-bar">{error}</div>}
        <div className="review-report-list">
          {reports.length === 0 && <p className="review-empty">暂无审查报告</p>}
          {reports.map((r) => (
            <div
              key={`${r.type}-${r.filename}`}
              className={`review-report-item${
                selectedReport?.filename === r.filename ? ' active' : ''
              }`}
              onClick={() => handleSelectReport(r.type, r.filename)}
            >
              <div className="report-item-header">
                <span className={`report-type-badge type-${r.type}`}>
                  {r.type === 'light' ? '轻量' : '深度'}
                </span>
                <span className="report-chapter">{r.chapterId}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-editor review-content">
        {parsedReport ? (
          <>
            {'checks' in parsedReport ? (
              // Light check result
              (parsedReport as LightCheckResult).checks.map((check, i) => (
                <ReviewReportCard
                  key={i}
                  title={check.name}
                  passed={check.passed}
                  issues={check.issues}
                />
              ))
            ) : (
              // Deep check result
              <>
                <div className="review-overall-score">
                  综合评分：<span className={`score-${(parsedReport as DeepCheckResult).overall_score >= 7 ? 'good' : 'mid'}`}>
                    {(parsedReport as DeepCheckResult).overall_score}/10
                  </span>
                </div>
                {(parsedReport as DeepCheckResult).dimensions.map((d, i) => (
                  <ReviewReportCard
                    key={i}
                    title={d.name}
                    score={d.score}
                    issues={d.issues}
                  />
                ))}
                {(parsedReport as DeepCheckResult).suggestions.length > 0 && (
                  <div className="review-suggestions">
                    <h4>改进建议</h4>
                    <ul>
                      {(parsedReport as DeepCheckResult).suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="review-empty">
            <p>选择左侧报告查看详情，或点击按钮对当前章节运行检查</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add review tab to ProjectView**

In `src/components/ProjectView.tsx`:

```tsx
// Add import
import ReviewPanel from './ReviewPanel'

// Add to Tab type
type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats' | 'review'

// Add tab button (after stats)
<button className={`tab-btn${tab === 'review' ? ' active' : ''}`} onClick={() => setTab('review')}>🔍 审查</button>

// Add tab content
{tab === 'review' && <ReviewPanel projectId={project.id} currentChapterId={null} />}
```

- [ ] **Step 4: Add CSS for review panel**

Add to `src/style.css`:

```css
/* ─── Review Panel ─────────────────────────────── */
.review-panel { height: 100%; }
.review-sidebar { width: 260px; overflow-y: auto; }
.review-sidebar-header {
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.review-actions-panel {
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.review-report-list { overflow-y: auto; flex: 1; }
.review-report-item {
  padding: 10px 16px; cursor: pointer;
  border-bottom: 1px solid var(--border); transition: background 0.15s;
}
.review-report-item:hover { background: var(--bg); }
.review-report-item.active { background: var(--accent); color: #fff; }
.report-item-header { display: flex; align-items: center; gap: 8px; }
.report-type-badge {
  font-size: 0.7rem; padding: 1px 6px; border-radius: 3px;
  font-weight: 600;
}
.type-light { background: #e8f5e9; color: #2e7d32; }
.type-full { background: #e3f2fd; color: #1565c0; }
.review-report-item.active .type-light,
.review-report-item.active .type-full {
  background: rgba(255,255,255,0.2); color: #fff;
}
.review-content {
  overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.review-overall-score {
  font-size: 1.2rem; font-weight: 600; padding: 12px 16px;
  background: var(--bg-card); border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.score-good { color: #28a745; }
.score-mid { color: #e67e22; }
.score-bad { color: #dc3545; }

/* Review Card */
.review-card {
  background: var(--bg-card); border-radius: var(--radius);
  box-shadow: var(--shadow); overflow: hidden;
}
.review-card-header {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.review-card-header h4 { font-size: 0.9rem; flex: 1; }
.review-passed { font-size: 0.8rem; font-weight: 600; }
.review-passed.passed { color: #28a745; }
.review-passed.failed { color: #dc3545; }
.review-issue-list { padding: 8px 0; }
.review-empty {
  padding: 24px; text-align: center; color: var(--text-muted);
  font-size: 0.85rem;
}
.review-issue {
  padding: 10px 16px; border-left: 3px solid transparent;
  margin: 4px 0;
}
.review-issue.issue-error { border-left-color: #dc3545; background: #fff5f5; }
.review-issue.issue-warning { border-left-color: #e67e22; background: #fffaf0; }
.review-issue.issue-hint { border-left-color: #3498db; background: #f0f8ff; }
.review-issue-header { display: flex; align-items: flex-start; gap: 8px; }
.issue-severity-badge {
  font-size: 0.7rem; padding: 1px 6px; border-radius: 3px;
  font-weight: 600; flex-shrink: 0; margin-top: 2px;
}
.badge-error { background: #dc3545; color: #fff; }
.badge-warning { background: #e67e22; color: #fff; }
.badge-hint { background: #3498db; color: #fff; }
.issue-desc { font-size: 0.85rem; flex: 1; }
.issue-suggestion {
  font-size: 0.8rem; color: var(--text-secondary);
  margin: 4px 0 4px 50px;
}
.issue-actions {
  display: flex; gap: 8px; margin: 4px 0 0 50px;
}
.review-suggestions {
  background: var(--bg-card); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 16px;
}
.review-suggestions h4 { font-size: 0.9rem; margin-bottom: 8px; }
.review-suggestions li { font-size: 0.85rem; margin: 4px 0; }
```

- [ ] **Step 5: LSP diagnostics and commit**

```bash
git add src/components/ReviewPanel.tsx src/components/ReviewReportCard.tsx src/components/ProjectView.tsx src/style.css
git commit -m "feat(review): add review panel with report list and AI deep review"
```

---

### Task A6: Editor Save Hook Extension

**Files:**
- Modify: `src/components/Editor.tsx` (integrate light check into save flow)
- Modify: `src/services/reviewService.ts` (export function needed by Editor)

- [ ] **Step 1: Wire light check into Editor save flow**

In `src/components/Editor.tsx`, modify `handleSaveNow` to call light check after save:

```tsx
// Add import
import { runAndSaveLightCheck } from '../services/reviewService'
import { lightCheckResultAtom, setLightCheckResult } from '../stores/reviewStore' // skip — use simple state instead

// Add state
const [lastLightCheckResult, setLastLightCheckResult] = useState<{ passed: boolean; issues: number } | null>(null)

// In handleSaveNow, after existing logChapterSaved(...) call, add:
.then(async () => {
  if (text.trim().length > 50) {
    try {
      const result = await runAndSaveLightCheck(projectId, chapterId, html)
      setLastLightCheckResult({ passed: result.passed, issues: result.checks.reduce((sum, c) => sum + c.issues.length, 0) })
    } catch (e) {
      console.error('Light check failed:', e)
    }
  }
})
```

Add a light check indicator to the toolbar (after banned words indicator):

```tsx
{lastLightCheckResult && (
  <span
    className={`light-check-indicator ${lastLightCheckResult.passed ? 'passed' : 'failed'}`}
    title={`轻量检查：${lastLightCheckResult.passed ? '通过' : `${lastLightCheckResult.issues} 个问题`}`}
  >
    {lastLightCheckResult.passed ? '✓' : '⚠'} 检查
  </span>
)}
```

Add CSS:
```css
.light-check-indicator {
  font-size: 0.75rem; padding: 2px 8px; border-radius: 3px;
  cursor: default;
}
.light-check-indicator.passed { color: #28a745; }
.light-check-indicator.failed { color: #e67e22; }
```

- [ ] **Step 2: LSP diagnostics and commit**

```bash
git add src/components/Editor.tsx src/style.css
git commit -m "feat(editor): wire light check into save hook with toolbar indicator"
```

---

## Phase B — Enhanced Modules

### Task B1: Rust Resource Commands

**Files:**
- Create: `src-tauri/src/commands/resource.rs`
- Modify: `src-tauri/src/commands/mod.rs` (add `pub mod resource;`)
- Modify: `src-tauri/src/lib.rs` (register resource commands)

**Implementation outline:**
- `list_resource_categories()` — list subdirectories of `workspace/resources/`
- `list_resource_files(category)` — list files in `workspace/resources/{category}/`
- `read_resource_file(category, filename)` — read file content
- `write_resource_file(category, filename, content)` — write/create file
- `delete_resource_file(category, filename)` — delete file

All follow the exact same pattern as existing `list_project_files` / `read_project_file` / `write_project_file` / `delete_project_file` but use `workspace_dir().join("resources")` instead of `project_dir()`.

### Task B2: Resource Library Frontend

**Files:**
- Create: `src/services/resources.ts`
- Create: `src/components/ResourcePanel.tsx`
- Modify: `src/components/ProjectView.tsx` (add resource tab)
- Modify: `src/api/tauri.ts` (add resource API bindings)

**Key Component: `ResourcePanel`**
- Left sidebar: category tree (folder list) with create/rename/delete
- Right content: file list for selected category, with CRUD for each file
- Editor area: edit resource file content (Markdown textarea)
- AI classify button: sends content to AI for category/tag suggestions

### Task B3: Deep Review Enhancement

**Files:**
- Modify: `src/services/reviewService.ts` (enhance deep review with better context)
- Modify: `src/components/ReviewPanel.tsx` (add AI fix button wiring)

**Enhancements:**
- Improve deep review prompt with more structured context
- Add retry logic on JSON parse failure
- Add progress indicator for long-running reviews

### Task B4: Editor Resource Sidebar

**Files:**
- Modify: `src/components/Editor.tsx` (add resource side panel)

**Feature:**
- Toggle button in toolbar to show/hide resource panel on the right side
- Panel shows resource files organized by category
- Click a resource to insert its content at cursor position

---

## Phase C — Advanced Features

### Task C1: Version Diff View

**Files:**
- The `VersionDiffViewer` component is already created in Task A2 Step 4
- Enhance it with better diff algorithm (import `diff` npm package if needed)
- Integrate into `VersionHistoryPanel` as a "compare selected" mode

### Task C2: AI Review Fix

**Files:**
- Create: `src/services/reviewRepairService.ts`
- Modify: `src/components/ReviewPanel.tsx` (wire AI fix button)

**Flow:**
```
User clicks "AI 修复" on a review issue
  → Identify the problematic text (from location offset)
  → Call rewriteService.rewriteText() with surrounding context
  → Display the fix in RewritePreview for user confirmation
```

### Task C3: Resource AI Classification

**Files:**
- Modify: `src/services/resources.ts` (add AI classify function)
- Modify: `src/components/ResourcePanel.tsx` (add classify button)

**Flow:**
```
User pastes content and clicks "AI 分类"
  → Call AI with content asking for suggested category + tags
  → Display suggestions → user confirms or adjusts
```

---

## Phase Dependencies

```
Phase A (parallel):
  A1 (Rust version commands) ──┐
  A2 (Version UI) ─────────────┤  (no deps between A1-A6)
  A3 (Rewrite service) ────────┤
  A4 (Light check service) ────┤
  A5 (Review panel) ───────────┤
  A6 (Editor save hook) ───────┘

Phase B:
  B1 (Rust resource commands) ── depends on: nothing
  B2 (Resource UI) ───────────── depends on: B1
  B3 (Deep review enhance) ───── depends on: A4, A5
  B4 (Editor resource sidebar) ─ depends on: B2

Phase C:
  C1 (Version diff) ──────────── depends on: A2
  C2 (AI review fix) ─────────── depends on: A3, A5
  C3 (Resource AI) ───────────── depends on: B2
```

---

## Implementation Order Recommendation

**Phase A — Build in this order for maximum parallelism:**

```
Week 1: A1 + A3 + A4 (Rust + 2 services) — 3 parallel agents
Week 2: A2 + A5 + A6 (3 UI components) — 3 parallel agents
        (A2 depends on A1, A5 depends on A4, A6 depends on A1+A4)
```

**Phase B — Sequential:**
```
B1 → B2 → B3 → B4
```

**Phase C — As time permits:**
```
C1 → C2 → C3
```
