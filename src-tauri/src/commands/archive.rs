use std::fs;

#[tauri::command]
pub fn archive_project(
    app_handle: tauri::AppHandle,
    project_id: String,
    output_path: String,
) -> Result<String, String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let file = fs::File::create(&output_path)
        .map_err(|e| format!("Failed to create archive: {e}"))?;
    let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::best());
    let mut archive = tar::Builder::new(encoder);

    let dir_name = dir.file_name().unwrap().to_string_lossy().to_string();
    archive.append_dir_all(&dir_name, &dir)
        .map_err(|e| format!("Failed to add dir to archive: {e}"))?;

    let encoder = archive.into_inner()
        .map_err(|e| format!("Failed to finalize archive: {e}"))?;
    encoder.finish()
        .map_err(|e| format!("Failed to compress archive: {e}"))?;

    Ok(output_path)
}

#[tauri::command]
pub fn import_project(
    app_handle: tauri::AppHandle,
    archive_path: String,
) -> Result<String, String> {
    let file = fs::File::open(&archive_path)
        .map_err(|e| format!("Failed to open archive: {e}"))?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);

    let workspace = crate::workspace_dir(&app_handle)?;
    let projects_dir = workspace.join("projects");

    archive.unpack(&projects_dir)
        .map_err(|e| format!("Failed to extract archive: {e}"))?;

    // Reload projects index to include the new project
    let mut projects = crate::load_index(&app_handle)?;
    let mut loaded_id: Option<String> = None;
    // Track loose files to clean up (from old flat-archive imports)
    let mut loose_files: Vec<std::path::PathBuf> = Vec::new();

    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if dir_name.starts_with('.') { continue; }

            // Check for project.json inside a subdirectory (correct structure)
            let meta_path = entry.path().join("project.json");
            if meta_path.exists() {
                if let Ok(content) = fs::read_to_string(&meta_path) {
                    if let Ok(meta) = serde_json::from_str::<crate::ProjectMeta>(&content) {
                        if !projects.iter().any(|p| p.id == meta.id) {
                            projects.push(meta.clone());
                        }
                        loaded_id = Some(meta.id);
                    }
                }
            }

            // Collect loose non-project-directory entries (flat-archive leftovers)
            if let Ok(ft) = entry.file_type() {
                let is_loose_dir = ft.is_dir()
                    && dir_name != "projects.json"
                    && !entry.path().join("project.json").exists();
                let is_loose_file = ft.is_file() && dir_name == "project.json";
                if is_loose_dir || is_loose_file {
                    loose_files.push(entry.path());
                }
            }
        }
    }

    // Clean up loose files from old flat-archive imports
    for path in &loose_files {
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
        } else {
            let _ = fs::remove_file(path);
        }
    }

    crate::save_index(&app_handle, &projects)?;
    loaded_id.ok_or_else(|| "未找到有效的项目文件".to_string())
}
