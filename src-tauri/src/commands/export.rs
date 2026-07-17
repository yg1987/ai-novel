use epub_builder::{EpubBuilder, EpubContent, ZipLibrary};
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

/// Collect chapter info: (order, title, plain text content)
fn collect_chapters(project_dir: &PathBuf) -> Result<Vec<(u32, String, String)>, String> {
    let chapters_dir = project_dir.join("chapters");
    if !chapters_dir.exists() {
        return Ok(vec![]);
    }

    let mut chapters: Vec<(u32, String, String)> = Vec::new();

    // Walk volume subdirectories (chapters/{volume}/ch*.md)
    let entries =
        fs::read_dir(&chapters_dir).map_err(|e| format!("Failed to read chapters dir: {e}"))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden dirs and non-dirs
        if name.starts_with('.') {
            continue;
        }
        let vol_dir = chapters_dir.join(&name);
        if !vol_dir.is_dir() {
            continue;
        }

        let vol_entries =
            fs::read_dir(&vol_dir).map_err(|e| format!("Failed to read volume dir {name}: {e}"))?;

        for ve in vol_entries.flatten() {
            let fname = ve.file_name().to_string_lossy().to_string();
            if !fname.starts_with("ch") || !fname.ends_with(".md") {
                continue;
            }
            let id = fname.trim_end_matches(".md").to_string();
            let order = id
                .strip_prefix("ch")
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);

            let content = fs::read_to_string(ve.path())
                .map_err(|e| format!("Failed to read {fname}: {e}"))?;

            // Strip HTML tags to get plain text for EPUB
            let body = content.replace('<', "").replace('>', "\n");

            let title = format!("第{order}章");
            chapters.push((order, title, body));
        }
    }

    chapters.sort_by_key(|(order, _, _)| *order);
    Ok(chapters)
}

#[tauri::command]
pub fn export_project_epub(
    app_handle: tauri::AppHandle,
    project_id: String,
    output_path: String,
) -> Result<String, String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let chapters = collect_chapters(&dir)?;

    // Read project metadata for title
    let project_name = {
        let meta_path = dir.join("project.json");
        if meta_path.exists() {
            if let Ok(content) = fs::read_to_string(&meta_path) {
                if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
                    meta.get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Untitled")
                        .to_string()
                } else {
                    "Untitled".to_string()
                }
            } else {
                "Untitled".to_string()
            }
        } else {
            "Untitled".to_string()
        }
    };

    let zip = ZipLibrary::new().map_err(|e| format!("Zip init error: {e}"))?;
    let mut builder = EpubBuilder::new(zip).map_err(|e| format!("Epub init error: {e}"))?;

    builder
        .metadata("title", &project_name)
        .map_err(|e| format!("Metadata error: {e}"))?;

    // Add each chapter
    for (order, title, body) in &chapters {
        let html = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>{title}</title></head>
<body>
<h1>{title}</h1>
<p>{body}</p>
</body>
</html>"#,
            title = title,
            body = body.replace('\n', "</p>\n<p>"),
        );
        builder
            .add_content(
                EpubContent::new(format!("chapter_{order}.xhtml"), html.as_bytes())
                    .title(title.clone()),
            )
            .map_err(|e| format!("Add content error: {e}"))?;
    }

    // Generate EPUB into memory buffer
    let mut buf = Cursor::new(Vec::new());
    builder
        .generate(&mut buf)
        .map_err(|e| format!("Epub generate error: {e}"))?;
    let epub_data = buf.into_inner();

    // Write to output path
    fs::write(&output_path, &epub_data).map_err(|e| format!("Write epub error: {e}"))?;

    Ok(output_path)
}
