# Task A1 Report: Rust Version History Commands

## Status: DONE

## What Was Implemented

### 1. Created `src-tauri/src/commands/version.rs`
A new Rust module providing chapter version history management with the following components:

- **`VersionMeta` struct** (public): Metadata for each version backup — version number, creation timestamp, word count, char count, source (auto_save/restore/manual), and user-editable label.
- **`VersionIndex` struct** (public): Holds the list of versions and `max_versions` cap (default 20).
- **Path helpers**: `history_dir`, `index_path`, `version_file_path` — centralize path construction under `chapters/.history/<chapter_id>/`.
- **Word/char counters**: `count_words` (Chinese characters + English words) and `count_chars`.
- **Index I/O**: `load_index` and `save_index` for `_index.json` persistence.
- **`load_index_for_save`** (public): Cross-module helper exposed for `lib.rs` to call during auto-backup.

### 2. Five Tauri Commands

| Command | Purpose |
|---------|---------|
| `list_chapter_versions` | Returns all versions sorted newest-first |
| `get_chapter_version` | Reads content of a specific version file |
| `restore_chapter_version` | Restores a version, auto-backing-up current content first |
| `delete_chapter_version` | Deletes a version (prevents deleting the last one) |
| `rename_chapter_version` | Updates the label of a version |

### 3. Auto-Backup in `save_chapter_content`

Modified `src-tauri/src/lib.rs` so that every chapter save now:
1. Reads existing content before overwriting.
2. If existing content is non-empty and different from new content:
   - Creates `.history/<chapter_id>/` directory.
   - Writes backup as `v{N}.md`.
   - Computes word/char counts and pushes `VersionMeta` to index.
   - Prunes oldest versions when exceeding `max_versions` (default 20).
   - Writes updated `_index.json`.
3. Then writes the new chapter content.

### 4. Module Registration

- `src-tauri/src/commands/mod.rs`: Added `pub mod version;` and `pub mod resource;` (placeholder for Task B1).
- `src-tauri/src/lib.rs`: Registered all 5 version commands in `generate_handler![]`.

## Build Results

```
cargo build
   Compiling ai-novel v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 51.15s
```

**Result:** Clean compilation, zero warnings, zero errors.

> Note: Initial build required downloading `protoc` (protobuf compiler) because `lancedb` dependency's build script needs it. This is a pre-existing environment requirement, not related to this task's changes. Once `PROTOC` env var was set, the build succeeded.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `src-tauri/src/commands/version.rs` | Created | 170 |
| `src-tauri/src/commands/resource.rs` | Created (placeholder) | 1 |
| `src-tauri/src/commands/mod.rs` | Modified | +2 |
| `src-tauri/src/lib.rs` | Modified | +64, −6 |

## Self-Review Findings

### Issues Found and Fixed During Implementation

1. **Missing `resource.rs` placeholder**: The plan instructed adding `pub mod resource;` to `mod.rs`, but `resource.rs` did not exist. This caused `E0583: file not found for module resource`. **Fixed** by creating an empty `resource.rs` with a placeholder comment.

2. **Unused import `tauri::Manager`**: The plan's Step 2 included `use tauri::Manager;` but none of the version commands use `Manager` (they use `AppHandle` directly). This caused a compiler warning. **Fixed** by removing the unused import.

### Code Quality Observations

- **No warnings**: After the two fixes above, `cargo build` produces zero warnings.
- **Consistent error handling**: All commands use `map_err(|e| format!("...: {}", e))` pattern, consistent with existing codebase style.
- **Cross-module access clean**: `load_index_for_save` provides a thin public wrapper so `lib.rs` doesn't need to know `VersionIndex` internals.
- **Pruning logic safe**: Oldest version removal uses `let _ = fs::remove_file(...)` to avoid failing if the file is already gone.

## Concerns

- **LSP diagnostics unavailable**: `rust-analyzer.exe` is not installed in the toolchain, so `lsp_diagnostics` could not run. However, `cargo build` succeeded with no warnings, which is a stronger signal of correctness.
- **No runtime tests**: The project has no Rust test suite. Verification was limited to compilation. Frontend integration testing will be needed when the UI commands are wired up.

## Commits

- `c5d39af` — feat(version): add chapter version history Rust commands with auto-backup
