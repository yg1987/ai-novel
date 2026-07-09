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
pub struct VersionIndex {
    pub versions: Vec<VersionMeta>,
    pub max_versions: u32,
}

/// chapters/{volume}/.history/{chapter_id}/
fn history_dir(project_dir: &PathBuf, volume: &str, chapter_id: &str) -> PathBuf {
    project_dir.join("chapters").join(volume).join(".history").join(chapter_id)
}

fn index_path(project_dir: &PathBuf, volume: &str, chapter_id: &str) -> PathBuf {
    history_dir(project_dir, volume, chapter_id).join("_index.json")
}

fn version_file_path(project_dir: &PathBuf, volume: &str, chapter_id: &str, version: u32) -> PathBuf {
    history_dir(project_dir, volume, chapter_id).join(format!("v{}.md", version))
}

pub fn count_chars(text: &str) -> u32 {
    text.chars().count() as u32
}

pub fn count_words(text: &str) -> u32 {
    let chinese = text.chars().filter(|c| c >= & '\u{4e00}' && c <= & '\u{9fff}').count() as u32;
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

/// Load version index from path (for cross-module access from lib.rs)
pub fn load_index_for_save(path: &std::path::PathBuf) -> VersionIndex {
    load_index(path)
}

#[tauri::command]
pub fn list_chapter_versions(
    app_handle: tauri::AppHandle,
    project_id: String,
    volume: String,
    chapter_id: String,
) -> Result<Vec<VersionMeta>, String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let idx_path = index_path(&dir, &volume, &chapter_id);
    let index = load_index(&idx_path);
    let mut versions = index.versions;
    versions.sort_by(|a, b| b.version.cmp(&a.version));
    Ok(versions)
}

#[tauri::command]
pub fn get_chapter_version(
    app_handle: tauri::AppHandle,
    project_id: String,
    volume: String,
    chapter_id: String,
    version: u32,
) -> Result<String, String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let file_path = version_file_path(&dir, &volume, &chapter_id, version);
    if !file_path.exists() {
        return Err(format!("Version {} not found", version));
    }
    fs::read_to_string(&file_path).map_err(|e| format!("Read error: {}", e))
}

#[tauri::command]
pub fn restore_chapter_version(
    app_handle: tauri::AppHandle,
    project_id: String,
    volume: String,
    chapter_id: String,
    version: u32,
) -> Result<(), String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let file_path = version_file_path(&dir, &volume, &chapter_id, version);
    if !file_path.exists() {
        return Err(format!("Version {} not found", version));
    }
    let content = fs::read_to_string(&file_path).map_err(|e| format!("Read error: {}", e))?;

    // Backup current content first
    let chapter_path = dir.join("chapters").join(&volume).join(format!("{}.md", chapter_id));
    if chapter_path.exists() {
        let current = fs::read_to_string(&chapter_path).map_err(|e| format!("Read error: {}", e))?;
        if !current.trim().is_empty() {
            let idx_path = index_path(&dir, &volume, &chapter_id);
            let mut index = load_index(&idx_path);
            let next_ver = index.versions.iter().map(|v| v.version).max().unwrap_or(0) + 1;
            let backup_path = version_file_path(&dir, &volume, &chapter_id, next_ver);
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
            while index.versions.len() > index.max_versions as usize {
                let oldest = index.versions.remove(0);
                let old_path = version_file_path(&dir, &volume, &chapter_id, oldest.version);
                if old_path.exists() {
                    let _ = fs::remove_file(&old_path);
                }
            }
            save_index(&idx_path, &index)?;
        }
    }

    fs::write(&chapter_path, &content).map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn delete_chapter_version(
    app_handle: tauri::AppHandle,
    project_id: String,
    volume: String,
    chapter_id: String,
    version: u32,
) -> Result<(), String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let idx_path = index_path(&dir, &volume, &chapter_id);
    let mut index = load_index(&idx_path);

    if index.versions.len() <= 1 {
        return Err("Cannot delete the last version".to_string());
    }

    let file_path = version_file_path(&dir, &volume, &chapter_id, version);
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| format!("Delete error: {}", e))?;
    }

    index.versions.retain(|v| v.version != version);
    save_index(&idx_path, &index)?;

    Ok(())
}

#[tauri::command]
pub fn rename_chapter_version(
    app_handle: tauri::AppHandle,
    project_id: String,
    volume: String,
    chapter_id: String,
    version: u32,
    label: String,
) -> Result<(), String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let idx_path = index_path(&dir, &volume, &chapter_id);
    let mut index = load_index(&idx_path);

    if let Some(v) = index.versions.iter_mut().find(|v| v.version == version) {
        v.label = label;
    }
    save_index(&idx_path, &index)?;
    Ok(())
}
