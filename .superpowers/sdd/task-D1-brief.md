### Task D1: Rust Stats Commands

**Files:**
- Create: `src-tauri/src/commands/stats.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src/api/tauri.ts`

- [ ] **Step 1: Add chrono to Cargo.toml**

```toml
chrono = { version = "0.4", features = [] }
```

- [ ] **Step 2: Implement stats commands**

```rust
// src-tauri/src/commands/stats.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatEvent {
    pub timestamp: String,
    pub event_type: String,
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

    // Read all JSONL files and aggregate by date
    let mut date_map: std::collections::HashMap<String, DailyStats> =
        std::collections::HashMap::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(true, |e| e != "jsonl") { continue; }
            if let Ok(content) = fs::read_to_string(&path) {
                for line in content.lines() {
                    if let Ok(event) = serde_json::from_str::<StatEvent>(line) {
                        let date = event.timestamp[..10].to_string();
                        let stats = date_map.entry(date.clone()).or_insert(DailyStats {
                            date: date.clone(),
                            char_count: 0,
                            word_count: 0,
                            ai_generations: 0,
                            sessions: 0,
                        });
                        if let Some(c) = event.char_count { stats.char_count += c; }
                        if let Some(w) = event.word_count { stats.word_count += w; }
                        if event.event_type == "ai_generated" { stats.ai_generations += 1; }
                        if event.event_type == "session_start" { stats.sessions += 1; }
                    }
                }
            }
        }
    }

    let mut result: Vec<DailyStats> = date_map.into_values().collect();
    result.sort_by(|a, b| a.date.cmp(&b.date));
    // Keep only the last `days` entries
    let start = result.len().saturating_sub(days as usize);
    Ok(result[start..].to_vec())
}
```

- [ ] **Step 3: Register in mod.rs**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub mod stats;
```

- [ ] **Step 4: Register in lib.rs**

Add to `invoke_handler!`:
```rust
commands::stats::append_stat_event,
commands::stats::compute_daily_stats,
```

- [ ] **Step 5: Add API bindings**

Add to `src/api/tauri.ts`:
```typescript
export interface StatEvent {
  timestamp: string
  event_type: string
  chapter?: number
  char_count?: number
  word_count?: number
  duration_ms?: number
  prompt_tokens?: number
  output_tokens?: number
}

export interface DailyStats {
  date: string
  char_count: number
  word_count: number
  ai_generations: number
  sessions: number
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
```

- [ ] **Step 6: Verify compile**

Run: `cd src-tauri && cargo check`
Then: `npx tsc --noEmit`
Expected: Both pass
