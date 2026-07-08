# 素材库基础版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the basic resource/material library for AI Novel Writer — workspace-level cross-project material management with CRUD operations and category-folders.

**Architecture:** Workspace-level file operations (parallel to existing project-level commands), with a new `ResourcePanel` React component following the `panel-layout` CSS convention. Phase 1 covers only the core CRUD + category folders (design doc §六 Phase 1).

**Tech Stack:** Rust (Tauri commands), TypeScript 6 (React component + API bindings), CSS (panel-layout)

**Design Reference:** `docs/superpowers/specs/2026-07-08-v04-quality-assurance-design.md` §六

## Global Constraints

- All data local-first, file-based, no external database
- No `as any`, `@ts-ignore`, or `@ts-expect-error` allowed
- TypeScript strict mode, all new types in `src/types/`
- New panels follow AGENTS.md `panel-layout` CSS convention
- Rust commands follow snake_case naming for Tauri IPC, TypeScript API wrappers use camelCase
- Every new file must have clean `lsp_diagnostics` before commit
- `resource.rs` already exists as placeholder in `commands/mod.rs` — replace its content, do NOT delete the file

---

### Task 1: Rust Resource Commands

**Files:**
- Modify: `src-tauri/src/commands/resource.rs` (replace placeholder)
- Modify: `src-tauri/src/lib.rs` (register commands in invoke_handler)

**Interfaces:**
- Consumes: `workspace_dir()` from `lib.rs`
- Produces: 5 Tauri commands + reuse existing `FileEntry` struct from `lib.rs`

- [ ] **Step 1: Replace resource.rs placeholder with implementation**

Write full content to `src-tauri/src/commands/resource.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn resource_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::workspace_dir(app_handle)?.join("resources"))
}

#[tauri::command]
pub fn list_resource_categories(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = resource_dir(&app_handle)?;
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut categories: Vec<String> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name() {
                    let name_str = name.to_string_lossy().to_string();
                    if !name_str.starts_with('.') {
                        categories.push(name_str);
                    }
                }
            }
        }
    }
    categories.sort();
    Ok(categories)
}

#[tauri::command]
pub fn list_resource_files(
    app_handle: tauri::AppHandle,
    category: String,
) -> Result<Vec<crate::FileEntry>, String> {
    let dir = resource_dir(&app_handle)?.join(&category);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut files: Vec<crate::FileEntry> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name() {
                    let name_str = name.to_string_lossy().to_string();
                    if !name_str.starts_with('.') {
                        files.push(crate::FileEntry { name: name_str });
                    }
                }
            }
        }
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

#[tauri::command]
pub fn read_resource_file(
    app_handle: tauri::AppHandle,
    category: String,
    filename: String,
) -> Result<String, String> {
    let file_path = resource_dir(&app_handle)?.join(&category).join(&filename);
    if !file_path.exists() {
        return Err(format!("File not found: {}/{}", category, filename));
    }
    fs::read_to_string(&file_path).map_err(|e| format!("Read error: {}", e))
}

#[tauri::command]
pub fn write_resource_file(
    app_handle: tauri::AppHandle,
    category: String,
    filename: String,
    content: String,
) -> Result<(), String> {
    let dir = resource_dir(&app_handle)?.join(&category);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    fs::write(&dir.join(&filename), &content).map_err(|e| format!("Write error: {}", e))
}

#[tauri::command]
pub fn delete_resource_file(
    app_handle: tauri::AppHandle,
    category: String,
    filename: String,
) -> Result<(), String> {
    let file_path = resource_dir(&app_handle)?.join(&category).join(&filename);
    if !file_path.exists() {
        return Err(format!("File not found: {}/{}", category, filename));
    }
    fs::remove_file(&file_path).map_err(|e| format!("Delete error: {}", e))

    // Remove category dir if empty after deletion
    if let Some(parent) = file_path.parent() {
        if let Ok(mut entries) = fs::read_dir(parent) {
            if entries.next().is_none() {
                let _ = fs::remove_dir(parent);
            }
        }
    }

    Ok(())
}
```

- [ ] **Step 2: Register in lib.rs invoke_handler**

In `src-tauri/src/lib.rs`, add to `invoke_handler!` macro (before the closing `])`):

```rust
commands::resource::list_resource_categories,
commands::resource::list_resource_files,
commands::resource::read_resource_file,
commands::resource::write_resource_file,
commands::resource::delete_resource_file,
```

- [ ] **Step 3: Verify Rust compile**

Run: `cd src-tauri && cargo check`
Expected: Clean, no errors/warnings

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/resource.rs src-tauri/src/lib.rs
git commit -m "feat(resource): add Rust resource library CRUD commands"
```

---

### Task 2: TypeScript API Bindings

**Files:**
- Modify: `src/api/tauri.ts`

**Interfaces:**
- Consumes: Rust commands from Task 1
- Produces: 5 async API functions in `src/api/tauri.ts`

- [ ] **Step 1: Add resource API functions to src/api/tauri.ts**

Append to `src/api/tauri.ts`:

```typescript
// ─── Resource Library ────────────────────────────

export async function listResourceCategories(): Promise<string[]> {
  return invoke<string[]>('list_resource_categories')
}

export async function listResourceFiles(category: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('list_resource_files', { category })
}

export async function readResourceFile(category: string, filename: string): Promise<string> {
  return invoke<string>('read_resource_file', { category, filename })
}

export async function writeResourceFile(category: string, filename: string, content: string): Promise<void> {
  return invoke<void>('write_resource_file', { category, filename, content })
}

export async function deleteResourceFile(category: string, filename: string): Promise<void> {
  return invoke<void>('delete_resource_file', { category, filename })
}
```

- [ ] **Step 2: Verify TypeScript compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/api/tauri.ts
git commit -m "feat(resource): add TypeScript API bindings for resource library"
```

---

### Task 3: ResourcePanel Component

**Files:**
- Create: `src/components/ResourcePanel.tsx`

**Interfaces:**
- Consumes: 5 API functions from Task 2
- Produces: ResourcePanel React component with layout per `panel-layout` convention

- [ ] **Step 1: Create ResourcePanel.tsx**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { listResourceCategories, listResourceFiles, readResourceFile, writeResourceFile, deleteResourceFile } from '../api/tauri'
import type { FileEntry } from '../api/tauri'

export default function ResourcePanel() {
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newFilename, setNewFilename] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refreshCategories = useCallback(async () => {
    try {
      const cats = await listResourceCategories()
      setCategories(cats)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => { refreshCategories().catch(console.error) }, [refreshCategories])

  const refreshFiles = useCallback(async (category: string) => {
    try {
      const fs = await listResourceFiles(category)
      setFiles(fs)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    if (selectedCategory) {
      refreshFiles(selectedCategory).catch(console.error)
      setSelectedFile(null)
      setFileContent('')
    }
  }, [selectedCategory, refreshFiles])

  const handleSelectFile = async (filename: string) => {
    if (!selectedCategory) return
    setSelectedFile(filename)
    setEditing(false)
    try {
      const content = await readResourceFile(selectedCategory, filename)
      setFileContent(content)
      setEditContent(content)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleSave = async () => {
    if (!selectedCategory || !selectedFile) return
    setSaving(true)
    try {
      await writeResourceFile(selectedCategory, selectedFile, editContent)
      setFileContent(editContent)
      setEditing(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (filename: string) => {
    if (!selectedCategory) return
    try {
      await deleteResourceFile(selectedCategory, filename)
      if (selectedFile === filename) {
        setSelectedFile(null)
        setFileContent('')
      }
      await refreshFiles(selectedCategory)
      await refreshCategories() // category may be removed if empty
    } catch (e) {
      setError(String(e))
    }
  }

  const handleCreateFile = async () => {
    if (!selectedCategory || !newFilename.trim()) return
    await writeResourceFile(selectedCategory, newFilename.trim(), `# ${newFilename.trim().replace(/\.md$/i, '')}\n\n`)
    setNewFilename('')
    setShowNewFile(false)
    await refreshFiles(selectedCategory)
    setSelectedFile(newFilename.trim())
    setFileContent(`# ${newFilename.trim().replace(/\.md$/i, '')}\n\n`)
    setEditContent(`# ${newFilename.trim().replace(/\.md$/i, '')}\n\n`)
    setEditing(true)
  }

  const handleCreateCategory = async () => {
    if (!newCategory.trim()) return
    // Create a placeholder file to establish the category directory
    await writeResourceFile(newCategory.trim(), '.gitkeep', '')
    setNewCategory('')
    await refreshCategories()
    setSelectedCategory(newCategory.trim())
  }

  return (
    <div className="panel-layout">
      {/* Sidebar: categories + files */}
      <div className="panel-sidebar" style={{ width: 220 }}>
        <div className="panel-sidebar-header">
          <h3>素材分类</h3>
        </div>
        <div className="panel-list">
          {categories.length === 0 && (
            <p className="panel-placeholder" style={{ padding: 12, fontSize: '0.85rem' }}>暂无分类，新建一个</p>
          )}
          {categories.map((cat) => (
            <div
              key={cat}
              className={`panel-item${selectedCategory === cat ? ' active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              className="notes-input"
              style={{ flex: 1, fontSize: '0.8rem' }}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory() }}
              placeholder="新建分类…"
            />
            <button className="btn-text" onClick={handleCreateCategory} disabled={!newCategory.trim()}>+</button>
          </div>
        </div>
      </div>

      {/* Middle: file list */}
      <div className="panel-sidebar" style={{ width: 200, borderRight: '1px solid var(--border)' }}>
        <div className="panel-sidebar-header">
          <h3>素材文件</h3>
          {selectedCategory && (
            <button className="btn-text" onClick={() => setShowNewFile(true)} title="新建素材">+</button>
          )}
        </div>
        <div className="panel-list">
          {!selectedCategory && (
            <p className="panel-placeholder" style={{ padding: 12, fontSize: '0.85rem' }}>先选择一个分类</p>
          )}
          {selectedCategory && files.length === 0 && (
            <p className="panel-placeholder" style={{ padding: 12, fontSize: '0.85rem' }}>暂无素材</p>
          )}
          {files.filter((f) => f.name !== '.gitkeep').map((f) => (
            <div
              key={f.name}
              className={`panel-item${selectedFile === f.name ? ' active' : ''}`}
              onClick={() => handleSelectFile(f.name)}
            >
              <span style={{ flex: 1 }}>{f.name.replace(/\.md$/i, '')}</span>
              <button
                className="btn-text"
                style={{ fontSize: '0.75rem', color: 'var(--danger)', padding: '0 4px' }}
                onClick={(e) => { e.stopPropagation(); handleDelete(f.name) }}
                title="删除"
              >✕</button>
            </div>
          ))}
        </div>
        {showNewFile && (
          <div style={{ padding: '8px', borderTop: '1px solid var(--border)', display: 'flex', gap: 4 }}>
            <input
              className="notes-input"
              style={{ flex: 1, fontSize: '0.8rem' }}
              value={newFilename}
              onChange={(e) => setNewFilename(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFile() }}
              placeholder="文件名.md…"
              autoFocus
            />
            <button className="btn-text" onClick={() => { handleCreateFile(); setShowNewFile(false) }}>✓</button>
            <button className="btn-text" onClick={() => { setShowNewFile(false); setNewFilename('') }}>✕</button>
          </div>
        )}
      </div>

      {/* Right: editor */}
      <div className="panel-editor">
        {error && <div className="error-bar" style={{ margin: 8 }}>{error}<button className="btn-text" onClick={() => setError(null)}>✕</button></div>}
        {selectedFile ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4>{selectedFile}</h4>
              <div style={{ display: 'flex', gap: 8 }}>
                {editing ? (
                  <>
                    <button className="btn-primary" onClick={handleSave} disabled={saving}>
                      {saving ? '保存中…' : '保存'}
                    </button>
                    <button className="btn-text" onClick={() => { setEditing(false); setEditContent(fileContent) }}>取消</button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={() => setEditing(true)}>编辑</button>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {editing ? (
                <textarea
                  style={{
                    width: '100%', height: '100%', border: 'none', resize: 'none',
                    padding: 16, fontSize: '0.9rem', lineHeight: 1.7,
                    fontFamily: 'var(--font-sans)', background: 'transparent',
                  }}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
              ) : (
                <pre style={{ padding: 16, whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.7, fontFamily: 'var(--font-sans)' }}>
                  {fileContent || '(空)'}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <div className="panel-placeholder" style={{ height: 300 }}>
            选择一个素材查看或编辑
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ResourcePanel.tsx
git commit -m "feat(ui): add ResourcePanel component with CRUD editor"
```

---

### Task 4: Wire ResourcePanel into ProjectView

**Files:**
- Modify: `src/components/ProjectView.tsx`

- [ ] **Step 1: Add import and tab**

Add import at top:
```typescript
import ResourcePanel from './ResourcePanel'
```

Extend `Tab` type:
```typescript
type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats' | 'review' | 'resource'
```

Add tab button after the review tab button:
```tsx
<button className={`tab-btn${tab === 'resource' ? ' active' : ''}`} onClick={() => { setTab('resource') }}>📦 素材</button>
```

Add tab content after the review tab content:
```tsx
{tab === 'resource' && <ResourcePanel />}
```

- [ ] **Step 2: Verify TypeScript compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectView.tsx
git commit -m "feat(ui): add resource library tab to project view"
```

---

### Post-Implementation Verification

- [ ] **Full compile check**

Run: `cd src-tauri && cargo check 2>&1`
Then: `npx tsc --noEmit`
Expected: Both clean, zero errors/warnings

- [ ] **Git log review**

Run: `git log --oneline -6`
Expected: 4 clean commits

- [ ] **Update README**

In README.md, update v0.4 checklist:
```markdown
- [x] 素材库基础版（CRUD + 分类文件夹）
```
