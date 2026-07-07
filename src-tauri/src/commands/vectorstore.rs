use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

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

fn vectordb_path(app_handle: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
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

    let db_path = vectordb_path(&app_handle, &project_id)?;
    std::fs::create_dir_all(&db_path)
        .map_err(|e| format!("Failed to create vector db dir: {e}"))?;

    // Group by page_id, store each page as a JSON file
    let mut page_map: std::collections::HashMap<String, Vec<&ChunkUpsertInput>> =
        std::collections::HashMap::new();
    for chunk in &chunks {
        page_map.entry(chunk.page_id.clone()).or_default().push(chunk);
    }

    for (page_id, page_chunks) in &page_map {
        let file_path = db_path.join(format!("{}.json", page_id));

        // Merge with existing chunks: read old, replace by chunk_id, write all
        let mut merged: Vec<ChunkUpsertInput> = if file_path.exists() {
            let existing = std::fs::read_to_string(&file_path)
                .map_err(|e| format!("Failed to read: {e}"))?;
            serde_json::from_str(&existing).unwrap_or_default()
        } else {
            Vec::new()
        };

        for new_chunk in page_chunks.iter() {
            if let Some(pos) = merged.iter().position(|c| c.chunk_id == new_chunk.chunk_id) {
                merged[pos] = (*new_chunk).clone();
            } else {
                merged.push((*new_chunk).clone());
            }
        }

        // Also add any chunks that are new (not in existing)
        // (already handled by the else branch above)

        let json = serde_json::to_string_pretty(&merged)
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
    let db_path = vectordb_path(&app_handle, &project_id)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }

    let mut results: Vec<ChunkSearchResult> = Vec::new();

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