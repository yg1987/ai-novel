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
    fs::remove_file(&file_path).map_err(|e| format!("Delete error: {}", e))?;

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
