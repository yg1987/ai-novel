use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub filename: String,
    pub snippet: String,
    pub score: f64,
    pub source: String,
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
        let raw_start = pos.saturating_sub(40);
        let raw_end = (pos + query_lower.len() + 40).min(text.len());
        // Clamp to valid char boundaries to avoid panicking on CJK multi-byte text
        let start = text[..raw_start].char_indices().next_back().map_or(0, |(i, _)| i);
        let end = text[raw_end..].char_indices().next().map_or(text.len(), |(i, _)| raw_end + i);
        text[start..end].to_string()
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

    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(max);

    Ok(results)
}