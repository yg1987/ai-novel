use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

use crate::commands::version;

// ─── StatEvent ───────────────────────────────────────────

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
    /// None = old events (word_count = total chapter words, skip on aggregation)
    /// Some(1) = delta semantic (word_count = new words since last save)
    pub event_version: Option<u32>,
}

fn stats_dir(app_handle: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let workspace = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(workspace.join("projects").join(project_id).join("stats"))
}

fn project_dir(app_handle: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let workspace = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(workspace.join("projects").join(project_id))
}

fn current_month_file(dir: &PathBuf) -> PathBuf {
    let now = chrono::Local::now();
    dir.join(format!("{}.jsonl", now.format("%Y-%m")))
}

// Strip HTML tags for counting plain text.
fn strip_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
        } else if !in_tag {
            result.push(c);
        }
    }
    result
}

// ─── append_stat_event ───────────────────────────────────

#[tauri::command]
pub fn append_stat_event(
    app_handle: tauri::AppHandle,
    project_id: String,
    event: StatEvent,
) -> Result<(), String> {
    let dir = stats_dir(&app_handle, &project_id)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create stats dir: {e}"))?;

    let file_path = current_month_file(&dir);
    let line =
        serde_json::to_string(&event).map_err(|e| format!("Failed to serialize event: {e}"))?;

    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&file_path)
        .map_err(|e| format!("Failed to open stats file: {e}"))?;
    file.write_all(format!("{}\n", line).as_bytes())
        .map_err(|e| format!("Failed to append event: {e}"))?;

    Ok(())
}

// ─── DailyStats (extended) ───────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub char_count: u32,
    pub word_count: u32,
    pub ai_generations: u32,
    pub sessions: u32,
    pub ai_tokens: u64,
    pub duration_ms: u64,
    pub session_duration_ms: u64,
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

    let mut date_map: HashMap<String, DailyStats> = HashMap::new();

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
                            ai_tokens: 0,
                            duration_ms: 0,
                            session_duration_ms: 0,
                        });
                        if let Some(c) = event.char_count {
                            stats.char_count += c;
                        }
                        // Only aggregate word_count for new-format events (delta semantic)
                        if let Some(ver) = event.event_version {
                            if ver >= 1 {
                                if let Some(w) = event.word_count {
                                    stats.word_count += w;
                                }
                            }
                        }
                        if let Some(t) = event.output_tokens {
                            stats.ai_tokens += t as u64;
                        }
                        if event.event_type == "ai_generated" {
                            stats.ai_generations += 1;
                            if let Some(d) = event.duration_ms {
                                stats.duration_ms += d;
                            }
                        }
                        if event.event_type == "session_start" {
                            stats.sessions += 1;
                        }
                        if event.event_type == "session_end" {
                            if let Some(d) = event.duration_ms {
                                stats.session_duration_ms += d;
                            }
                        }
                    }
                }
            }
        }
    }

    let mut result: Vec<DailyStats> = date_map.into_values().collect();
    result.sort_by(|a, b| a.date.cmp(&b.date));
    let start = result.len().saturating_sub(days as usize);
    Ok(result[start..].to_vec())
}

// ─── ChapterWordCount (file snapshot) ─────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterWordCount {
    pub chapter_id: String,
    pub title: String,
    pub volume: String,
    pub order: u32,
    pub word_count: u32,
    pub char_count: u32,
}

#[tauri::command]
pub fn compute_chapter_word_counts(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<ChapterWordCount>, String> {
    let dir = project_dir(&app_handle, &project_id)?.join("chapters");
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut results: Vec<ChapterWordCount> = Vec::new();

    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read chapters dir: {e}"))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let vol_dir = dir.join(&name);
        if !vol_dir.is_dir() {
            continue;
        }

        if let Ok(vol_entries) = fs::read_dir(&vol_dir) {
            for ve in vol_entries.flatten() {
                let fname = ve.file_name().to_string_lossy().to_string();
                if fname.starts_with("ch") && fname.ends_with(".md") {
                    let chapter_id = fname.trim_end_matches(".md").to_string();
                    let order = chapter_id
                        .strip_prefix("ch")
                        .and_then(|s| s.parse::<u32>().ok())
                        .unwrap_or(0);

                    let content = fs::read_to_string(&ve.path()).unwrap_or_default();
                    let plain = strip_html(&content);

                    results.push(ChapterWordCount {
                        chapter_id,
                        title: format!("第{}章", order),
                        volume: name.clone(),
                        order,
                        word_count: version::count_words(&plain),
                        char_count: version::count_chars(&plain),
                    });
                }
            }
        }
    }

    results.sort_by_key(|c| (c.volume.clone(), c.order));
    Ok(results)
}

// ─── ProjectStats (word count + chapter parts, Phase A + B) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStats {
    // 字数（文件快照）
    pub total_words: u32,
    pub avg_words_per_chapter: u32,
    pub max_chapter_words: u32,
    pub min_chapter_words: u32,

    // 章卷
    pub total_chapters: u32,
    pub total_volumes: u32,
    pub project_days_elapsed: u32,

    // AI (Phase B)
    pub total_ai_generations: u32,
    pub total_ai_tokens: u64,
    pub avg_ai_duration_ms: u64,
    pub max_ai_duration_ms: u64,

    // 会话 (Phase B)
    pub total_sessions: u32,
    pub total_duration_ms: u64,
    pub total_session_duration_ms: u64,
    pub writing_streak_days: u32,

    // 每日明细
    pub daily_stats: Vec<DailyStats>,
}

#[tauri::command]
pub fn compute_project_stats(
    app_handle: tauri::AppHandle,
    project_id: String,
    days: u32,
) -> Result<ProjectStats, String> {
    // 1. Chapter word counts (file snapshot)
    let chapter_counts = compute_chapter_word_counts(app_handle.clone(), project_id.clone())?;

    let total_chapters = chapter_counts.len() as u32;
    let total_words: u32 = chapter_counts.iter().map(|c| c.word_count).sum();
    let avg_words_per_chapter = if total_chapters > 0 {
        total_words / total_chapters
    } else {
        0
    };
    let max_chapter_words = chapter_counts
        .iter()
        .map(|c| c.word_count)
        .max()
        .unwrap_or(0);
    let min_chapter_words = chapter_counts
        .iter()
        .map(|c| c.word_count)
        .min()
        .unwrap_or(0);

    // 2. Volume count
    let mut volumes: Vec<String> = chapter_counts.iter().map(|c| c.volume.clone()).collect();
    volumes.sort();
    volumes.dedup();
    let total_volumes = volumes.len() as u32;

    // 3. Project age
    let dir = project_dir(&app_handle, &project_id)?;
    let project_path = dir.join("project.json");
    let project_days_elapsed = if project_path.exists() {
        if let Ok(content) = fs::read_to_string(&project_path) {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(created) = meta.get("created_at").and_then(|v| v.as_str()) {
                    if let Ok(parsed) =
                        chrono::NaiveDateTime::parse_from_str(created, "%Y-%m-%dT%H:%M:%S")
                    {
                        let elapsed = chrono::Local::now().naive_local() - parsed;
                        elapsed.num_days().max(0) as u32
                    } else {
                        0
                    }
                } else {
                    0
                }
            } else {
                0
            }
        } else {
            0
        }
    } else {
        0
    };

    // 4. Daily stats (events)
    let daily_stats = compute_daily_stats(app_handle.clone(), project_id.clone(), days)?;

    // 5. AI/session aggregates from daily_stats
    let total_ai_generations: u32 = daily_stats.iter().map(|d| d.ai_generations).sum();
    let total_ai_tokens: u64 = daily_stats.iter().map(|d| d.ai_tokens).sum();
    let total_duration_ms: u64 = daily_stats.iter().map(|d| d.duration_ms).sum();
    let total_session_duration_ms: u64 = daily_stats.iter().map(|d| d.session_duration_ms).sum();
    let total_sessions: u32 = daily_stats.iter().map(|d| d.sessions).sum();
    let avg_ai_duration_ms = if total_ai_generations > 0 {
        total_duration_ms / total_ai_generations as u64
    } else {
        0
    };
    let max_ai_duration_ms = daily_stats.iter().map(|d| d.duration_ms).max().unwrap_or(0);

    // 6. Writing streak (backward: consecutive active days from today)
    let sorted_days = {
        let mut d: Vec<&DailyStats> = daily_stats.iter().collect();
        d.sort_by(|a, b| b.date.cmp(&a.date));
        d
    };
    let writing_streak_days: u32 =
        sorted_days.iter().take_while(|d| d.word_count > 0).count() as u32;

    Ok(ProjectStats {
        total_words,
        avg_words_per_chapter,
        max_chapter_words,
        min_chapter_words,
        total_chapters,
        total_volumes,
        project_days_elapsed,
        total_ai_generations,
        total_ai_tokens,
        avg_ai_duration_ms,
        max_ai_duration_ms,
        total_sessions,
        total_duration_ms,
        total_session_duration_ms,
        writing_streak_days,
        daily_stats,
    })
}
