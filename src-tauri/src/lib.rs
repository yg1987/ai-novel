use serde::{Deserialize, Serialize};
use tauri::Manager;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;
use uuid::Uuid;

mod commands;

// ─── Data types ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    pub genre: String,
    pub description: String,
    pub status: String,
    pub target_words: u32,
    pub created_at: String,
    pub updated_at: String,
}

// ─── Workspace path helpers ────────────────────────────────

fn workspace_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))
}

fn projects_index_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(workspace_dir(app_handle)?.join("projects.json"))
}

fn project_dir(app_handle: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(workspace_dir(app_handle)?.join("projects").join(id))
}

fn timestamp() -> String {
    let d = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", d.as_secs())
}

// ─── Projects index I/O ───────────────────────────────────

fn load_index(app_handle: &tauri::AppHandle) -> Result<Vec<ProjectMeta>, String> {
    let path = projects_index_path(app_handle)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read index: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse index: {e}"))
}

fn save_index(app_handle: &tauri::AppHandle, projects: &[ProjectMeta]) -> Result<(), String> {
    let path = projects_index_path(app_handle)?;
    let content =
        serde_json::to_string_pretty(projects).map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&path, &content).map_err(|e| format!("Failed to write index: {e}"))
}

// ─── Project skeleton ─────────────────────────────────────

fn create_project_skeleton(dir: &PathBuf, meta: &ProjectMeta) -> Result<(), String> {
    let dirs = [
        "characters",
        "worldview",
        "outline",
        "outline/细纲",
        "chapters",
        "chapters/.history",
        "notes",
        "memory",
        "memory/snapshots",
        "tracks",
        "tracks/review-reports",
    ];
    for d in &dirs {
        fs::create_dir_all(dir.join(d))
            .map_err(|e| format!("Failed to create dir {d}: {e}"))?;
    }

    let meta_json =
        serde_json::to_string_pretty(meta).map_err(|e| format!("Failed to serialize meta: {e}"))?;
    fs::write(dir.join("project.json"), &meta_json)
        .map_err(|e| format!("Failed to write project.json: {e}"))?;

    fs::write(dir.join("style.md"), "# 文风设定\n\n")
        .map_err(|e| format!("Failed to write style.md: {e}"))?;

    Ok(())
}

// ─── Tauri commands ───────────────────────────────────────

#[tauri::command]
fn create_project(
    app_handle: tauri::AppHandle,
    name: String,
    genre: String,
    description: String,
    target_words: u32,
) -> Result<ProjectMeta, String> {
    let now = timestamp();
    let meta = ProjectMeta {
        id: Uuid::new_v4().to_string(),
        name,
        genre,
        description,
        status: String::from("连载中"),
        target_words,
        created_at: now.clone(),
        updated_at: now,
    };

    let dir = project_dir(&app_handle, &meta.id)?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create project dir: {e}"))?;

    create_project_skeleton(&dir, &meta)?;

    let mut projects = load_index(&app_handle)?;
    projects.push(meta.clone());
    save_index(&app_handle, &projects)?;

    Ok(meta)
}

#[tauri::command]
fn list_projects(app_handle: tauri::AppHandle) -> Result<Vec<ProjectMeta>, String> {
    load_index(&app_handle)
}

#[tauri::command]
fn get_project(app_handle: tauri::AppHandle, project_id: String) -> Result<ProjectMeta, String> {
    let projects = load_index(&app_handle)?;
    projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| String::from("Project not found"))
}

#[tauri::command]
fn update_project(
    app_handle: tauri::AppHandle,
    project_id: String,
    name: Option<String>,
    genre: Option<String>,
    description: Option<String>,
    status: Option<String>,
    target_words: Option<u32>,
) -> Result<ProjectMeta, String> {
    let mut projects = load_index(&app_handle)?;
    let meta = projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| String::from("Project not found"))?;

    if let Some(v) = name {
        meta.name = v;
    }
    if let Some(v) = genre {
        meta.genre = v;
    }
    if let Some(v) = description {
        meta.description = v;
    }
    if let Some(v) = status {
        meta.status = v;
    }
    if let Some(v) = target_words {
        meta.target_words = v;
    }
    meta.updated_at = timestamp();

    let result = meta.clone();
    save_index(&app_handle, &projects)?;

    let dir = project_dir(&app_handle, &project_id)?;
    let meta_json =
        serde_json::to_string_pretty(&result).map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(dir.join("project.json"), &meta_json)
        .map_err(|e| format!("Failed to write project.json: {e}"))?;

    Ok(result)
}

#[tauri::command]
fn delete_project(app_handle: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let dir = project_dir(&app_handle, &project_id)?;

    let mut projects = load_index(&app_handle)?;
    projects.retain(|p| p.id != project_id);
    save_index(&app_handle, &projects)?;

    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Failed to delete project dir: {e}"))?;
    }

    Ok(())
}

// ─── Chapter I/O ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterMeta {
    pub id: String,
    pub title: String,
    pub order: u32,
}

#[tauri::command]
fn list_chapters(app_handle: tauri::AppHandle, project_id: String) -> Result<Vec<ChapterMeta>, String> {
    let dir = project_dir(&app_handle, &project_id)?.join("chapters");
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut chapters: Vec<ChapterMeta> = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read chapters dir: {e}"))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip .history dir, match ch*.md
        if name.starts_with("ch") && name.ends_with(".md") {
            let id = name.trim_end_matches(".md").to_string();
            // Extract order: ch001 -> 1
            let order = id.strip_prefix("ch")
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);
            chapters.push(ChapterMeta {
                id,
                title: format!("第{}章", order),
                order,
            });
        }
    }

    chapters.sort_by_key(|c| c.order);
    Ok(chapters)
}

#[tauri::command]
fn get_chapter_content(
    app_handle: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
) -> Result<String, String> {
    let path = project_dir(&app_handle, &project_id)?
        .join("chapters")
        .join(format!("{chapter_id}.md"));

    if !path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&path).map_err(|e| format!("Failed to read chapter: {e}"))
}

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
                fs::write(&backup_path, &current).map_err(|e| format!("Failed to write backup: {e}"))?;
                index.versions.push(commands::version::VersionMeta {
                    version: next_ver,
                    created_at: timestamp(),
                    word_count: commands::version::count_words(&current),
                    char_count: commands::version::count_chars(&current),
                    source: "auto_save".to_string(),
                    label: String::new(),
                });
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

#[tauri::command]
fn get_chapter_outline(
    app_handle: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
) -> Result<String, String> {
    let path = project_dir(&app_handle, &project_id)?
        .join("outline")
        .join("细纲")
        .join(format!("{chapter_id}.md"));

    if !path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&path).map_err(|e| format!("Failed to read outline: {e}"))
}

// ─── Provider config I/O ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderModelConfig {
    pub writing: String,
    pub analysis: String,
    pub review: String,
    pub embedding: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderEntry {
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub models: ProviderModelConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub providers: Vec<ProviderEntry>,
    pub active_profile: String,
}

fn provider_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(workspace_dir(app_handle)?.join("provider-config.json"))
}

#[tauri::command]
fn load_provider_config(app_handle: tauri::AppHandle) -> Result<ProviderConfig, String> {
    let path = provider_config_path(&app_handle)?;
    if !path.exists() {
        // Return default config
        return Ok(ProviderConfig {
            providers: vec![ProviderEntry {
                name: "OpenAI".into(),
                base_url: "https://api.openai.com/v1".into(),
                api_key: String::new(),
                models: ProviderModelConfig {
                    writing: "gpt-4o".into(),
                    analysis: "gpt-4o-mini".into(),
                    review: "gpt-4o-mini".into(),
                    embedding: "text-embedding-3-small".into(),
                },
            }],
            active_profile: "OpenAI".into(),
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {e}"))
}

#[tauri::command]
fn save_provider_config(app_handle: tauri::AppHandle, config: ProviderConfig) -> Result<(), String> {
    let path = provider_config_path(&app_handle)?;
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(&path, &content).map_err(|e| format!("Failed to write config: {e}"))?;
    Ok(())
}

// ─── Generic project file I/O ──────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
}

fn project_subdir(app_handle: &tauri::AppHandle, project_id: &str, subdir: &str) -> Result<PathBuf, String> {
    Ok(project_dir(app_handle, project_id)?.join(subdir))
}

#[tauri::command]
fn list_project_files(
    app_handle: tauri::AppHandle,
    project_id: String,
    subdir: String,
) -> Result<Vec<FileEntry>, String> {
    let dir = project_subdir(&app_handle, &project_id, &subdir)?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut files: Vec<FileEntry> = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read dir: {e}"))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden files/folders
        if name.starts_with('.') { continue; }
        files.push(FileEntry { name });
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

#[tauri::command]
fn read_project_file(
    app_handle: tauri::AppHandle,
    project_id: String,
    subdir: String,
    filename: String,
) -> Result<String, String> {
    let path = project_subdir(&app_handle, &project_id, &subdir)?.join(&filename);
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
}

#[tauri::command]
fn write_project_file(
    app_handle: tauri::AppHandle,
    project_id: String,
    subdir: String,
    filename: String,
    content: String,
) -> Result<(), String> {
    let dir = project_subdir(&app_handle, &project_id, &subdir)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;
    let path = dir.join(&filename);
    fs::write(&path, &content).map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(())
}

#[tauri::command]
fn delete_project_file(
    app_handle: tauri::AppHandle,
    project_id: String,
    subdir: String,
    filename: String,
) -> Result<(), String> {
    let path = project_subdir(&app_handle, &project_id, &subdir)?.join(&filename);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {e}"))?;
    }
    Ok(())
}

// ─── App entry ────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            create_project,
            list_projects,
            get_project,
            update_project,
            delete_project,
            list_chapters,
            get_chapter_content,
            save_chapter_content,
            load_provider_config,
            save_provider_config,
            get_chapter_outline,
            list_project_files,
            read_project_file,
            write_project_file,
            delete_project_file,
            commands::search::search_project_files,
            commands::vectorstore::vector_upsert_chunks,
            commands::vectorstore::vector_search_chunks,
            commands::stats::append_stat_event,
            commands::stats::compute_daily_stats,
            commands::version::list_chapter_versions,
            commands::version::get_chapter_version,
            commands::version::restore_chapter_version,
            commands::version::delete_chapter_version,
            commands::version::rename_chapter_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
