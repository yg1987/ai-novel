use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

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

    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&file_path)
        .map_err(|e| format!("Failed to open stats file: {e}"))?;
    file.write_all(format!("{}\n", line).as_bytes())
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
            if path.extension().map_or(true, |e| e != "jsonl") {
                continue;
            }
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
                        if let Some(c) = event.char_count {
                            stats.char_count += c;
                        }
                        if let Some(w) = event.word_count {
                            stats.word_count += w;
                        }
                        if event.event_type == "ai_generated" {
                            stats.ai_generations += 1;
                        }
                        if event.event_type == "session_start" {
                            stats.sessions += 1;
                        }
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