use chrono::{SecondsFormat, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const INBOX_SYSTEM_KEY: &str = "inbox";
const LEGACY_RESOURCE_PREFIX: &str = "resources/";
const MAX_PAGE_SIZE: usize = 100;
const MAX_IMAGE_ATTACHMENT_BYTES: u64 = 10 * 1024 * 1024;
const MAX_MARKDOWN_IMPORT_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MaterialContentFormat {
    PlainText,
    Markdown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MaterialScope {
    Global,
    Projects,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MaterialSourceType {
    Original,
    Book,
    Web,
    File,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialItem {
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub kind_id: String,
    pub content: String,
    pub content_format: MaterialContentFormat,
    pub summary: String,
    pub source_type: MaterialSourceType,
    pub source_name: String,
    pub source_url: String,
    pub category_id: String,
    pub tags: Vec<String>,
    pub scope: MaterialScope,
    pub project_ids: Vec<String>,
    pub favorite: bool,
    pub attachment_ids: Vec<String>,
    #[serde(default)]
    pub source_document_id: Option<String>,
    #[serde(default)]
    pub source_section_id: Option<String>,
    #[serde(default)]
    pub source_locator: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialKindDefinition {
    pub id: String,
    pub name: String,
    pub order: i32,
    pub preset_key: Option<String>,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialCategory {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub order: i32,
    pub system_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMaterialInput {
    pub title: String,
    pub kind_id: String,
    pub content: String,
    pub content_format: Option<MaterialContentFormat>,
    pub summary: Option<String>,
    pub source_type: Option<MaterialSourceType>,
    pub source_name: Option<String>,
    pub source_url: Option<String>,
    pub category_id: String,
    pub tags: Option<Vec<String>>,
    pub scope: MaterialScope,
    pub project_ids: Vec<String>,
    pub favorite: Option<bool>,
    pub source_document_id: Option<String>,
    pub source_section_id: Option<String>,
    pub source_locator: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMaterialPatch {
    pub title: Option<String>,
    pub kind_id: Option<String>,
    pub content: Option<String>,
    pub content_format: Option<MaterialContentFormat>,
    pub summary: Option<String>,
    pub source_type: Option<MaterialSourceType>,
    pub source_name: Option<String>,
    pub source_url: Option<String>,
    pub category_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub scope: Option<MaterialScope>,
    pub project_ids: Option<Vec<String>>,
    pub favorite: Option<bool>,
    pub source_document_id: Option<String>,
    pub source_section_id: Option<String>,
    pub source_locator: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MaterialFilter {
    pub query: Option<String>,
    pub kind_id: Option<String>,
    pub category_id: Option<String>,
    pub tag: Option<String>,
    pub favorite: Option<bool>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSummary {
    pub id: String,
    pub title: String,
    pub kind_id: String,
    pub category_id: String,
    pub summary: String,
    pub content_preview: String,
    pub source_name: String,
    pub tags: Vec<String>,
    pub scope: MaterialScope,
    pub project_ids: Vec<String>,
    pub favorite: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialPage {
    pub items: Vec<MaterialSummary>,
    pub page: usize,
    pub page_size: usize,
    pub total_items: usize,
    pub total_pages: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSearchResult {
    pub material_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialUsage {
    pub id: String,
    pub material_id: String,
    pub action: String,
    pub project_id: String,
    pub volume: String,
    pub chapter_id: String,
    pub chapter_title: String,
    pub excerpt: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialImageAttachment {
    pub id: String,
    pub material_id: String,
    pub original_name: String,
    pub mime_type: String,
    pub size: u64,
    pub relative_path: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialImageAttachmentContent {
    pub attachment: MaterialImageAttachment,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownMaterialImportPreview {
    pub title: String,
    pub source_name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCleanupResult {
    pub cleanup_pending: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMaterialUsageInput {
    pub material_id: String,
    pub action: String,
    pub project_id: String,
    pub volume: String,
    pub chapter_id: String,
    pub chapter_title: String,
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CleanupState {
    schema_version: u32,
    #[serde(default)]
    cleaned_project_ids: Vec<String>,
    #[serde(default)]
    pending_file_cleanups: Vec<PendingFileCleanup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingFileCleanup {
    id: String,
    reason: String,
    relative_paths: Vec<String>,
    created_at: String,
    last_error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LegacyCleanupSummary {
    pub cleaned_projects: usize,
    pub skipped_projects: usize,
}

#[derive(Clone)]
struct IndexedMaterial {
    item: MaterialItem,
    search_text: String,
}

#[derive(Default)]
struct MaterialState {
    root: Option<PathBuf>,
    items: HashMap<String, IndexedMaterial>,
}

static MATERIAL_STATE: OnceLock<Mutex<MaterialState>> = OnceLock::new();
static CLEANUP_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn state() -> &'static Mutex<MaterialState> {
    MATERIAL_STATE.get_or_init(|| Mutex::new(MaterialState::default()))
}

fn lock_state() -> Result<std::sync::MutexGuard<'static, MaterialState>, String> {
    state()
        .lock()
        .map_err(|_| "Material library state lock is poisoned".to_string())
}

fn lock_cleanup() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    CLEANUP_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Material cleanup state lock is poisoned".to_string())
}

pub(crate) fn materials_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))
        .map(|dir| dir.join("materials"))
}

fn items_dir(root: &Path) -> PathBuf {
    root.join("items")
}

fn usage_dir(root: &Path) -> PathBuf {
    root.join("usage")
}

fn config_dir(root: &Path) -> PathBuf {
    root.join("config")
}

fn categories_path(root: &Path) -> PathBuf {
    config_dir(root).join("categories.json")
}

fn kinds_path(root: &Path) -> PathBuf {
    config_dir(root).join("kinds.json")
}

fn cleanup_path(root: &Path) -> PathBuf {
    config_dir(root).join("cleanup-state.json")
}

fn item_path(root: &Path, material_id: &str) -> PathBuf {
    items_dir(root).join(format!("{material_id}.json"))
}

fn image_attachment_path(
    root: &Path,
    material_id: &str,
    attachment_id: &str,
    extension: &str,
) -> PathBuf {
    root.join("attachments")
        .join("materials")
        .join(material_id)
        .join(format!("{attachment_id}.{extension}"))
}

fn image_attachment_metadata_path(root: &Path, material_id: &str, attachment_id: &str) -> PathBuf {
    root.join("attachments")
        .join("materials")
        .join(material_id)
        .join(format!("{attachment_id}.json"))
}

fn image_attachment_dir(root: &Path, material_id: &str) -> PathBuf {
    root.join("attachments").join("materials").join(material_id)
}

pub(crate) fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(crate) fn validate_uuid(value: &str, field: &str) -> Result<(), String> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| format!("{field} must be a valid UUID"))
}

fn recovery_path(path: &Path) -> PathBuf {
    path.with_extension(format!(
        "{}.bak",
        path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("json")
    ))
}

fn recover_atomic_file(path: &Path) -> Result<(), String> {
    let backup = recovery_path(path);
    if path.exists() {
        if backup.exists() {
            fs::remove_file(&backup)
                .map_err(|e| format!("Failed to remove stale backup {}: {e}", backup.display()))?;
        }
    } else if backup.exists() {
        fs::rename(&backup, path)
            .map_err(|e| format!("Failed to recover {}: {e}", path.display()))?;
    }
    Ok(())
}

fn recover_atomic_directory(dir: &Path) -> Result<(), String> {
    for entry in fs::read_dir(dir)
        .map_err(|e| format!("Failed to scan {} for recovery: {e}", dir.display()))?
    {
        let path = entry
            .map_err(|e| format!("Failed to read recovery entry in {}: {e}", dir.display()))?
            .path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with('.') && name.ends_with(".material.tmp") {
            fs::remove_file(&path).map_err(|e| {
                format!(
                    "Failed to remove stale temporary file {}: {e}",
                    path.display()
                )
            })?;
            continue;
        }
        if let Some(original_name) = name.strip_suffix(".bak") {
            if original_name.ends_with(".json") {
                recover_atomic_file(&dir.join(original_name))?;
            }
        }
    }
    Ok(())
}

pub(crate) fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid material path: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;

    recover_atomic_file(path)?;
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|e| format!("Failed to serialize {}: {e}", path.display()))?;
    let temp = parent.join(format!(".{}.{}.tmp", Uuid::new_v4(), "material"));
    let mut file = File::create(&temp)
        .map_err(|e| format!("Failed to create temporary file {}: {e}", temp.display()))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("Failed to persist temporary file {}: {e}", temp.display()))?;
    drop(file);

    let backup = recovery_path(path);
    if path.exists() {
        if backup.exists() {
            fs::remove_file(&backup)
                .map_err(|e| format!("Failed to clear backup {}: {e}", backup.display()))?;
        }
        fs::rename(path, &backup)
            .map_err(|e| format!("Failed to prepare replacement {}: {e}", path.display()))?;
    }

    if let Err(error) = fs::rename(&temp, path) {
        if backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temp);
        return Err(format!("Failed to replace {}: {error}", path.display()));
    }

    if backup.exists() {
        fs::remove_file(&backup)
            .map_err(|e| format!("Failed to remove backup {}: {e}", backup.display()))?;
    }
    Ok(())
}

fn cleanup_relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| format!("Cleanup path escapes material storage: {}", path.display()))?;
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(format!("Invalid material cleanup path: {}", path.display()));
    }
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn remove_cleanup_path(root: &Path, relative_path: &str) -> Result<(), String> {
    let relative = Path::new(relative_path);
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(format!("Invalid pending cleanup path: {relative_path}"));
    }
    let path = root.join(relative);
    if !path.exists() {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(&path).map_err(|error| {
        format!(
            "Failed to inspect cleanup target {}: {error}",
            path.display()
        )
    })?;
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        fs::remove_dir_all(&path)
            .map_err(|error| format!("Failed to remove directory {}: {error}", path.display()))
    } else {
        fs::remove_file(&path)
            .map_err(|error| format!("Failed to remove file {}: {error}", path.display()))
    }
}

fn retry_pending_file_cleanups_locked(root: &Path) -> Result<usize, String> {
    let path = cleanup_path(root);
    let mut cleanup: CleanupState = read_json(&path)?;
    let mut remaining = Vec::new();
    for mut pending in cleanup.pending_file_cleanups.drain(..) {
        let errors = pending
            .relative_paths
            .iter()
            .filter_map(|relative_path| remove_cleanup_path(root, relative_path).err())
            .collect::<Vec<_>>();
        if !errors.is_empty() {
            pending.last_error = errors.join("; ");
            remaining.push(pending);
        }
    }
    cleanup.pending_file_cleanups = remaining;
    let remaining_count = cleanup.pending_file_cleanups.len();
    atomic_write_json(&path, &cleanup)?;
    Ok(remaining_count)
}

pub(crate) fn retry_pending_file_cleanups(root: &Path) -> Result<usize, String> {
    ensure_structure(root)?;
    let _cleanup_guard = lock_cleanup()?;
    retry_pending_file_cleanups_locked(root)
}

pub(crate) fn queue_file_cleanup(
    root: &Path,
    reason: &str,
    paths: Vec<PathBuf>,
) -> Result<FileCleanupResult, String> {
    ensure_structure(root)?;
    let _cleanup_guard = lock_cleanup()?;
    let mut cleanup: CleanupState = read_json(&cleanup_path(root))?;
    let cleanup_id = Uuid::new_v4().to_string();
    let mut relative_paths = Vec::new();
    for path in paths {
        let relative = cleanup_relative_path(root, &path)?;
        if !relative_paths.contains(&relative) {
            relative_paths.push(relative);
        }
    }
    cleanup.pending_file_cleanups.push(PendingFileCleanup {
        id: cleanup_id.clone(),
        reason: reason.to_string(),
        relative_paths,
        created_at: now_iso(),
        last_error: String::new(),
    });
    atomic_write_json(&cleanup_path(root), &cleanup)?;
    retry_pending_file_cleanups_locked(root)?;
    let cleanup: CleanupState = read_json(&cleanup_path(root))?;
    Ok(FileCleanupResult {
        cleanup_pending: cleanup
            .pending_file_cleanups
            .iter()
            .any(|pending| pending.id == cleanup_id),
    })
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    recover_atomic_file(path)?;
    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

fn preset_kinds() -> Vec<MaterialKindDefinition> {
    [
        ("inspiration", "灵感片段"),
        ("plot", "情节桥段"),
        ("character", "人物参考"),
        ("scene", "场景参考"),
        ("dialogue", "对话表达"),
        ("knowledge", "知识资料"),
        ("other", "其他"),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, (key, name))| MaterialKindDefinition {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        order: index as i32,
        preset_key: Some(key.to_string()),
        archived: false,
    })
    .collect()
}

fn default_categories() -> Vec<MaterialCategory> {
    vec![MaterialCategory {
        id: Uuid::new_v4().to_string(),
        name: "收件箱".to_string(),
        parent_id: None,
        order: 0,
        system_key: Some(INBOX_SYSTEM_KEY.to_string()),
    }]
}

fn ensure_structure(root: &Path) -> Result<(), String> {
    for dir in [
        items_dir(root),
        root.join("attachments"),
        usage_dir(root),
        config_dir(root),
    ] {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    }

    let category_file = categories_path(root);
    if !category_file.exists() && !recovery_path(&category_file).exists() {
        atomic_write_json(&category_file, &default_categories())?;
    }
    let kind_file = kinds_path(root);
    if !kind_file.exists() && !recovery_path(&kind_file).exists() {
        atomic_write_json(&kind_file, &preset_kinds())?;
    }
    let cleanup_file = cleanup_path(root);
    if !cleanup_file.exists() && !recovery_path(&cleanup_file).exists() {
        atomic_write_json(
            &cleanup_file,
            &CleanupState {
                schema_version: SCHEMA_VERSION,
                cleaned_project_ids: Vec::new(),
                pending_file_cleanups: Vec::new(),
            },
        )?;
    }
    Ok(())
}

fn markdown_inline_to_text(value: &str) -> String {
    let characters = value.chars().collect::<Vec<_>>();
    let mut output = String::new();
    let mut index = 0;
    while index < characters.len() {
        if characters[index] == '\\' && index + 1 < characters.len() {
            output.push(characters[index + 1]);
            index += 2;
            continue;
        }
        let image = characters[index] == '!' && characters.get(index + 1) == Some(&'[');
        if characters[index] == '[' || image {
            let label_start = index + usize::from(image) + 1;
            if let Some(label_end_offset) = characters[label_start..]
                .iter()
                .position(|character| *character == ']')
            {
                let label_end = label_start + label_end_offset;
                if characters.get(label_end + 1) == Some(&'(') {
                    if let Some(target_end_offset) = characters[label_end + 2..]
                        .iter()
                        .position(|character| *character == ')')
                    {
                        output.extend(characters[label_start..label_end].iter());
                        index = label_end + 2 + target_end_offset + 1;
                        continue;
                    }
                }
            }
        }
        if matches!(characters[index], '*' | '_' | '~' | '`') {
            index += 1;
            continue;
        }
        output.push(characters[index]);
        index += 1;
    }
    output
}

fn markdown_to_plain_text(markdown: &str) -> String {
    let mut in_fence = false;
    markdown
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim_start();
            if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
                in_fence = !in_fence;
                return None;
            }
            let mut content = trimmed;
            if !in_fence {
                content = content.trim_start_matches('#').trim_start();
                content = content.trim_start_matches('>').trim_start();
                if content.starts_with("- ")
                    || content.starts_with("* ")
                    || content.starts_with("+ ")
                {
                    content = &content[2..];
                } else if let Some(marker_end) = content.find(". ") {
                    if marker_end > 0
                        && content[..marker_end]
                            .chars()
                            .all(|character| character.is_ascii_digit())
                    {
                        content = &content[marker_end + 2..];
                    }
                }
            }
            Some(markdown_inline_to_text(content).trim_end().to_string())
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn material_plain_text_content(item: &MaterialItem) -> String {
    match item.content_format {
        MaterialContentFormat::PlainText => item.content.clone(),
        MaterialContentFormat::Markdown => markdown_to_plain_text(&item.content),
    }
}

fn normalize_search_text(item: &MaterialItem) -> String {
    let content = material_plain_text_content(item);
    format!(
        "{}\n{}\n{}\n{}\n{}",
        item.title,
        content,
        item.summary,
        item.source_name,
        item.tags.join(" ")
    )
    .to_lowercase()
}

fn ensure_loaded<'a>(state: &'a mut MaterialState, root: &Path) -> Result<(), String> {
    if state.root.as_deref() == Some(root) {
        return Ok(());
    }
    ensure_structure(root)?;
    retry_pending_file_cleanups(root)?;
    recover_atomic_directory(&items_dir(root))?;
    let mut items = HashMap::new();
    for entry in
        fs::read_dir(items_dir(root)).map_err(|e| format!("Failed to read material items: {e}"))?
    {
        let entry = entry.map_err(|e| format!("Failed to read material item entry: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let item: MaterialItem = read_json(&path)?;
        validate_uuid(&item.id, "material id")?;
        items.insert(
            item.id.clone(),
            IndexedMaterial {
                search_text: normalize_search_text(&item),
                item,
            },
        );
    }
    reconcile_image_attachments(root, &items)?;
    state.root = Some(root.to_path_buf());
    state.items = items;
    Ok(())
}

fn reconcile_image_attachments(
    root: &Path,
    items: &HashMap<String, IndexedMaterial>,
) -> Result<(), String> {
    let attachments_root = root.join("attachments").join("materials");
    fs::create_dir_all(&attachments_root)
        .map_err(|error| format!("Failed to create image attachment root: {error}"))?;
    let mut orphan_paths = Vec::new();
    for entry in fs::read_dir(&attachments_root)
        .map_err(|error| format!("Failed to scan image attachments: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("Failed to read image attachment entry: {error}"))?;
        let path = entry.path();
        let material_id = entry.file_name().to_string_lossy().to_string();
        let Some(indexed) = items.get(&material_id) else {
            orphan_paths.push(path);
            continue;
        };
        if !path.is_dir() {
            orphan_paths.push(path);
            continue;
        }
        let referenced = indexed
            .item
            .attachment_ids
            .iter()
            .cloned()
            .collect::<HashSet<_>>();
        for attachment_entry in fs::read_dir(&path)
            .map_err(|error| format!("Failed to scan material image directory: {error}"))?
        {
            let attachment_entry = attachment_entry
                .map_err(|error| format!("Failed to read material image entry: {error}"))?;
            let attachment_path = attachment_entry.path();
            let file_name = attachment_entry.file_name().to_string_lossy().to_string();
            let stem = attachment_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if file_name.starts_with('.') || !referenced.contains(stem) {
                orphan_paths.push(attachment_path);
            }
        }
        for attachment_id in referenced {
            validate_uuid(&attachment_id, "attachment id")?;
            let metadata_path = image_attachment_metadata_path(root, &material_id, &attachment_id);
            if !metadata_path.is_file() {
                return Err(format!(
                    "素材“{}”的图片附件元数据缺失，请检查存储或恢复备份",
                    indexed.item.title
                ));
            }
            let attachment: MaterialImageAttachment = read_json(&metadata_path)?;
            if attachment.id != attachment_id || attachment.material_id != material_id {
                return Err(format!(
                    "素材“{}”的图片附件元数据不一致",
                    indexed.item.title
                ));
            }
            let image_path = resolve_image_attachment_path(root, &attachment)?;
            if !image_path.is_file() {
                return Err(format!(
                    "素材“{}”的图片附件文件缺失: {}",
                    indexed.item.title, attachment.original_name
                ));
            }
        }
    }
    if !orphan_paths.is_empty() {
        queue_file_cleanup(root, "orphan_material_image", orphan_paths)?;
    }
    Ok(())
}

fn load_categories(root: &Path) -> Result<Vec<MaterialCategory>, String> {
    read_json(&categories_path(root))
}

fn load_kinds(root: &Path) -> Result<Vec<MaterialKindDefinition>, String> {
    read_json(&kinds_path(root))
}

fn inbox_id(categories: &[MaterialCategory]) -> Result<String, String> {
    categories
        .iter()
        .find(|category| category.system_key.as_deref() == Some(INBOX_SYSTEM_KEY))
        .map(|category| category.id.clone())
        .ok_or_else(|| "Material categories must contain the inbox".to_string())
}

fn sanitize_tags(tags: Vec<String>) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    let mut clean = Vec::new();
    for tag in tags {
        let value = tag.trim().to_string();
        if value.is_empty() || !seen.insert(value.to_lowercase()) {
            continue;
        }
        if value.chars().count() > 50 {
            return Err("Material tags cannot exceed 50 characters".to_string());
        }
        clean.push(value);
    }
    if clean.len() > 50 {
        return Err("A material cannot have more than 50 tags".to_string());
    }
    Ok(clean)
}

fn validate_material(
    item: &mut MaterialItem,
    categories: &[MaterialCategory],
    kinds: &[MaterialKindDefinition],
) -> Result<(), String> {
    item.title = item.title.trim().to_string();
    if item.title.is_empty() {
        return Err("素材标题不能为空".to_string());
    }
    if item.title.chars().count() > 200 {
        return Err("素材标题不能超过 200 个字符".to_string());
    }
    validate_uuid(&item.id, "material id")?;
    validate_uuid(&item.kind_id, "kind id")?;
    validate_uuid(&item.category_id, "category id")?;
    if !kinds.iter().any(|kind| kind.id == item.kind_id) {
        return Err("选择的素材类型不存在".to_string());
    }
    if !categories
        .iter()
        .any(|category| category.id == item.category_id)
    {
        return Err("选择的素材分类不存在".to_string());
    }
    if let Some(document_id) = &item.source_document_id {
        validate_uuid(document_id, "source document id")?;
    }
    if let Some(section_id) = &item.source_section_id {
        validate_uuid(section_id, "source section id")?;
    }
    item.tags = sanitize_tags(std::mem::take(&mut item.tags))?;
    match item.scope {
        MaterialScope::Global => item.project_ids.clear(),
        MaterialScope::Projects => {
            if item.project_ids.is_empty() {
                return Err("项目素材至少要关联一个项目".to_string());
            }
            let mut unique = HashSet::new();
            item.project_ids.retain(|id| unique.insert(id.clone()));
            for project_id in &item.project_ids {
                validate_uuid(project_id, "project id")?;
            }
        }
    }
    item.schema_version = SCHEMA_VERSION;
    Ok(())
}

fn validate_categories(categories: &[MaterialCategory]) -> Result<(), String> {
    if categories.is_empty() {
        return Err("素材分类不能为空".to_string());
    }
    let ids: HashSet<&str> = categories
        .iter()
        .map(|category| category.id.as_str())
        .collect();
    if ids.len() != categories.len() {
        return Err("素材分类 ID 不能重复".to_string());
    }
    let inboxes: Vec<&MaterialCategory> = categories
        .iter()
        .filter(|category| category.system_key.as_deref() == Some(INBOX_SYSTEM_KEY))
        .collect();
    if inboxes.len() != 1 || inboxes[0].parent_id.is_some() {
        return Err("必须保留唯一的一级收件箱分类".to_string());
    }
    for category in categories {
        validate_uuid(&category.id, "category id")?;
        if category.name.trim().is_empty() {
            return Err("素材分类名称不能为空".to_string());
        }
        if let Some(parent_id) = &category.parent_id {
            validate_uuid(parent_id, "parent category id")?;
            let parent = categories
                .iter()
                .find(|candidate| candidate.id == *parent_id)
                .ok_or_else(|| "素材分类的父级不存在".to_string())?;
            if parent.parent_id.is_some() || parent.id == category.id {
                return Err("素材分类最多支持两级".to_string());
            }
        }
        if category.system_key.is_some() && category.system_key.as_deref() != Some(INBOX_SYSTEM_KEY)
        {
            return Err("未知的系统素材分类".to_string());
        }
    }
    Ok(())
}

fn validate_kinds(kinds: &[MaterialKindDefinition]) -> Result<(), String> {
    if kinds.is_empty() {
        return Err("素材类型不能为空".to_string());
    }
    if kinds.iter().all(|kind| kind.archived) {
        return Err("至少保留一个可用于新建素材的类型".to_string());
    }
    let mut ids = HashSet::new();
    let mut preset_keys = HashSet::new();
    for kind in kinds {
        validate_uuid(&kind.id, "kind id")?;
        if !ids.insert(kind.id.as_str()) {
            return Err("素材类型 ID 不能重复".to_string());
        }
        if kind.name.trim().is_empty() {
            return Err("素材类型名称不能为空".to_string());
        }
        if let Some(key) = &kind.preset_key {
            if !preset_keys.insert(key.as_str()) {
                return Err("素材预设类型不能重复".to_string());
            }
        }
    }
    Ok(())
}

fn summary(item: &MaterialItem) -> MaterialSummary {
    MaterialSummary {
        id: item.id.clone(),
        title: item.title.clone(),
        kind_id: item.kind_id.clone(),
        category_id: item.category_id.clone(),
        summary: item.summary.clone(),
        content_preview: material_plain_text_content(item)
            .chars()
            .take(180)
            .collect(),
        source_name: item.source_name.clone(),
        tags: item.tags.clone(),
        scope: item.scope.clone(),
        project_ids: item.project_ids.clone(),
        favorite: item.favorite,
        updated_at: item.updated_at.clone(),
    }
}

fn category_filter_ids(filter_id: &str, categories: &[MaterialCategory]) -> HashSet<String> {
    let mut ids = HashSet::from([filter_id.to_string()]);
    ids.extend(
        categories
            .iter()
            .filter(|category| category.parent_id.as_deref() == Some(filter_id))
            .map(|category| category.id.clone()),
    );
    ids
}

fn matches_filter(
    indexed: &IndexedMaterial,
    filter: &MaterialFilter,
    category_ids: Option<&HashSet<String>>,
) -> bool {
    let item = &indexed.item;
    if let Some(query) = filter
        .query
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
    {
        let tokens: Vec<String> = query
            .to_lowercase()
            .split_whitespace()
            .map(str::to_string)
            .collect();
        if !tokens
            .iter()
            .all(|token| indexed.search_text.contains(token))
        {
            return false;
        }
    }
    if filter
        .kind_id
        .as_ref()
        .is_some_and(|id| item.kind_id != *id)
    {
        return false;
    }
    if category_ids.is_some_and(|ids| !ids.contains(&item.category_id)) {
        return false;
    }
    if let Some(tag) = filter.tag.as_deref() {
        if !item
            .tags
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(tag))
        {
            return false;
        }
    }
    if filter
        .favorite
        .is_some_and(|favorite| item.favorite != favorite)
    {
        return false;
    }
    if let Some(project_id) = filter.project_id.as_deref() {
        if item.scope != MaterialScope::Global
            && !item.project_ids.iter().any(|id| id == project_id)
        {
            return false;
        }
    }
    true
}

fn filtered_items<'a>(
    items: &'a HashMap<String, IndexedMaterial>,
    filter: &MaterialFilter,
    categories: &[MaterialCategory],
) -> Vec<&'a IndexedMaterial> {
    let category_ids = filter
        .category_id
        .as_deref()
        .map(|id| category_filter_ids(id, categories));
    let mut matches: Vec<&IndexedMaterial> = items
        .values()
        .filter(|indexed| matches_filter(indexed, filter, category_ids.as_ref()))
        .collect();
    matches.sort_by(|a, b| {
        b.item
            .updated_at
            .cmp(&a.item.updated_at)
            .then_with(|| a.item.title.cmp(&b.item.title))
    });
    matches
}

fn match_score(item: &MaterialItem, query: &str) -> f64 {
    let query = query.to_lowercase();
    let count = |text: &str| text.to_lowercase().matches(&query).count() as f64;
    count(&item.title) * 20.0
        + item.tags.iter().map(|tag| count(tag) * 10.0).sum::<f64>()
        + count(&item.summary) * 5.0
        + count(&item.source_name) * 3.0
        + count(&item.content)
}

fn material_snippet(item: &MaterialItem, query: &str) -> String {
    let plain_content = material_plain_text_content(item);
    for text in [&item.summary, &plain_content, &item.source_name] {
        let lower = text.to_lowercase();
        if let Some(byte_pos) = lower.find(query) {
            let char_pos = lower[..byte_pos].chars().count();
            let start = char_pos.saturating_sub(40);
            return text.chars().skip(start).take(140).collect();
        }
    }
    plain_content.chars().take(140).collect()
}

fn save_item(root: &Path, item: &MaterialItem) -> Result<(), String> {
    atomic_write_json(&item_path(root, &item.id), item)
}

fn usage_path(root: &Path, usage_id: &str) -> PathBuf {
    usage_dir(root).join(format!("{usage_id}.json"))
}

#[tauri::command]
pub async fn initialize_material_library(
    app_handle: tauri::AppHandle,
) -> Result<LegacyCleanupSummary, String> {
    let root = materials_dir(&app_handle)?;
    ensure_structure(&root)?;
    retry_pending_file_cleanups(&root)?;
    {
        let mut material_state = lock_state()?;
        ensure_loaded(&mut material_state, &root)?;
    }

    let mut cleanup: CleanupState = read_json(&cleanup_path(&root))?;
    let cleaned: HashSet<String> = cleanup.cleaned_project_ids.iter().cloned().collect();
    let projects = crate::load_index(&app_handle)?;
    let mut summary = LegacyCleanupSummary::default();

    for project in projects {
        if cleaned.contains(&project.id) {
            summary.skipped_projects += 1;
            continue;
        }
        super::vectorstore::delete_page_prefix(&app_handle, &project.id, LEGACY_RESOURCE_PREFIX)
            .await?;
        cleanup.cleaned_project_ids.push(project.id);
        atomic_write_json(&cleanup_path(&root), &cleanup)?;
        summary.cleaned_projects += 1;
    }
    Ok(summary)
}

#[tauri::command]
pub fn list_materials(
    app_handle: tauri::AppHandle,
    filter: MaterialFilter,
    page: usize,
    page_size: usize,
) -> Result<MaterialPage, String> {
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    let categories = load_categories(&root)?;
    let matches = filtered_items(&material_state.items, &filter, &categories);
    let total_items = matches.len();
    let page_size = page_size.clamp(1, MAX_PAGE_SIZE);
    let total_pages = total_items.div_ceil(page_size);
    let page = page.max(1).min(total_pages.max(1));
    let start = (page - 1) * page_size;
    let items = matches
        .into_iter()
        .skip(start)
        .take(page_size)
        .map(|indexed| summary(&indexed.item))
        .collect();
    Ok(MaterialPage {
        items,
        page,
        page_size,
        total_items,
        total_pages,
    })
}

#[tauri::command]
pub fn get_material(
    app_handle: tauri::AppHandle,
    material_id: String,
) -> Result<MaterialItem, String> {
    validate_uuid(&material_id, "material id")?;
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    material_state
        .items
        .get(&material_id)
        .map(|indexed| indexed.item.clone())
        .ok_or_else(|| "素材不存在或已被删除".to_string())
}

#[tauri::command]
pub fn get_material_plain_text(
    app_handle: tauri::AppHandle,
    material_id: String,
) -> Result<String, String> {
    let item = get_material(app_handle, material_id)?;
    Ok(material_plain_text_content(&item))
}

#[tauri::command]
pub fn create_material(
    app_handle: tauri::AppHandle,
    input: CreateMaterialInput,
) -> Result<MaterialItem, String> {
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    let categories = load_categories(&root)?;
    let kinds = load_kinds(&root)?;
    let now = now_iso();
    let mut item = MaterialItem {
        schema_version: SCHEMA_VERSION,
        id: Uuid::new_v4().to_string(),
        title: input.title,
        kind_id: input.kind_id,
        content: input.content,
        content_format: input
            .content_format
            .unwrap_or(MaterialContentFormat::PlainText),
        summary: input.summary.unwrap_or_default(),
        source_type: input.source_type.unwrap_or(MaterialSourceType::Original),
        source_name: input.source_name.unwrap_or_default(),
        source_url: input.source_url.unwrap_or_default(),
        category_id: input.category_id,
        tags: input.tags.unwrap_or_default(),
        scope: input.scope,
        project_ids: input.project_ids,
        favorite: input.favorite.unwrap_or(false),
        attachment_ids: Vec::new(),
        source_document_id: input.source_document_id,
        source_section_id: input.source_section_id,
        source_locator: input.source_locator,
        created_at: now.clone(),
        updated_at: now,
    };
    validate_material(&mut item, &categories, &kinds)?;
    save_item(&root, &item)?;
    material_state.items.insert(
        item.id.clone(),
        IndexedMaterial {
            search_text: normalize_search_text(&item),
            item: item.clone(),
        },
    );
    Ok(item)
}

#[tauri::command]
pub fn update_material(
    app_handle: tauri::AppHandle,
    material_id: String,
    patch: UpdateMaterialPatch,
) -> Result<MaterialItem, String> {
    validate_uuid(&material_id, "material id")?;
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    let categories = load_categories(&root)?;
    let kinds = load_kinds(&root)?;
    let mut item = material_state
        .items
        .get(&material_id)
        .map(|indexed| indexed.item.clone())
        .ok_or_else(|| "素材不存在或已被删除".to_string())?;

    if let Some(value) = patch.title {
        item.title = value;
    }
    if let Some(value) = patch.kind_id {
        item.kind_id = value;
    }
    if let Some(value) = patch.content {
        item.content = value;
    }
    if let Some(value) = patch.content_format {
        item.content_format = value;
    }
    if let Some(value) = patch.summary {
        item.summary = value;
    }
    if let Some(value) = patch.source_type {
        item.source_type = value;
    }
    if let Some(value) = patch.source_name {
        item.source_name = value;
    }
    if let Some(value) = patch.source_url {
        item.source_url = value;
    }
    if let Some(value) = patch.category_id {
        item.category_id = value;
    }
    if let Some(value) = patch.tags {
        item.tags = value;
    }
    if let Some(value) = patch.scope {
        item.scope = value;
    }
    if let Some(value) = patch.project_ids {
        item.project_ids = value;
    }
    if let Some(value) = patch.favorite {
        item.favorite = value;
    }
    if let Some(value) = patch.source_document_id {
        item.source_document_id = Some(value);
    }
    if let Some(value) = patch.source_section_id {
        item.source_section_id = Some(value);
    }
    if let Some(value) = patch.source_locator {
        item.source_locator = Some(value);
    }
    item.updated_at = now_iso();

    validate_material(&mut item, &categories, &kinds)?;
    save_item(&root, &item)?;
    material_state.items.insert(
        item.id.clone(),
        IndexedMaterial {
            search_text: normalize_search_text(&item),
            item: item.clone(),
        },
    );
    Ok(item)
}

fn material_usage_paths(root: &Path, material_id: &str) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();
    for entry in
        fs::read_dir(usage_dir(root)).map_err(|e| format!("Failed to read material usage: {e}"))?
    {
        let path = entry
            .map_err(|e| format!("Failed to read material usage entry: {e}"))?
            .path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let value: serde_json::Value = read_json(&path)?;
        if value.get("materialId").and_then(|id| id.as_str()) == Some(material_id) {
            paths.push(path);
        }
    }
    Ok(paths)
}

#[tauri::command]
pub fn delete_material(
    app_handle: tauri::AppHandle,
    material_id: String,
) -> Result<FileCleanupResult, String> {
    validate_uuid(&material_id, "material id")?;
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    if !material_state.items.contains_key(&material_id) {
        return Err("素材不存在或已被删除".to_string());
    }
    let mut cleanup_paths = material_usage_paths(&root, &material_id)?;
    cleanup_paths.push(image_attachment_dir(&root, &material_id));
    cleanup_paths.push(item_path(&root, &material_id));
    let result = queue_file_cleanup(&root, "delete_material", cleanup_paths)?;
    material_state.items.remove(&material_id);
    Ok(result)
}

fn markdown_import_preview(source_path: &str) -> Result<MarkdownMaterialImportPreview, String> {
    let path = Path::new(source_path);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "md" | "markdown") {
        return Err("仅支持 .md 和 .markdown 文件".to_string());
    }
    let metadata = fs::metadata(path).map_err(|error| format!("读取 Markdown 失败: {error}"))?;
    if !metadata.is_file() {
        return Err("选择的 Markdown 路径不是文件".to_string());
    }
    if metadata.len() > MAX_MARKDOWN_IMPORT_BYTES {
        return Err("Markdown 文件超过 5MB 限制".to_string());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取 Markdown 失败: {error}"))?;
    let content =
        String::from_utf8(bytes).map_err(|_| "Markdown 文件必须使用 UTF-8 编码".to_string())?;
    if content.trim().is_empty() {
        return Err("Markdown 文件为空，未创建素材".to_string());
    }
    let source_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Markdown 文件名无效".to_string())?
        .to_string();
    let title = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("未命名 Markdown")
        .to_string();
    Ok(MarkdownMaterialImportPreview {
        title,
        source_name,
        content,
    })
}

#[tauri::command]
pub fn preview_markdown_material_import(
    source_path: String,
) -> Result<MarkdownMaterialImportPreview, String> {
    markdown_import_preview(&source_path)
}

fn is_structurally_valid_png(bytes: &[u8]) -> bool {
    if bytes.len() < 33 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return false;
    }
    let mut offset = 8;
    let mut saw_header = false;
    while offset + 12 <= bytes.len() {
        let length = u32::from_be_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ]) as usize;
        let chunk_end = offset.saturating_add(12).saturating_add(length);
        if chunk_end > bytes.len() {
            return false;
        }
        let chunk_type = &bytes[offset + 4..offset + 8];
        if !saw_header {
            if chunk_type != b"IHDR" || length != 13 {
                return false;
            }
            let width = u32::from_be_bytes([
                bytes[offset + 8],
                bytes[offset + 9],
                bytes[offset + 10],
                bytes[offset + 11],
            ]);
            let height = u32::from_be_bytes([
                bytes[offset + 12],
                bytes[offset + 13],
                bytes[offset + 14],
                bytes[offset + 15],
            ]);
            if width == 0 || height == 0 {
                return false;
            }
            saw_header = true;
        }
        if chunk_type == b"IEND" {
            return saw_header && length == 0 && chunk_end == bytes.len();
        }
        offset = chunk_end;
    }
    false
}

fn is_structurally_valid_jpeg(bytes: &[u8]) -> bool {
    if bytes.len() < 12 || !bytes.starts_with(&[0xff, 0xd8]) || !bytes.ends_with(&[0xff, 0xd9]) {
        return false;
    }
    let mut offset = 2;
    let mut saw_dimensions = false;
    while offset + 1 < bytes.len() - 2 {
        if bytes[offset] != 0xff {
            offset += 1;
            continue;
        }
        while offset < bytes.len() && bytes[offset] == 0xff {
            offset += 1;
        }
        if offset >= bytes.len() {
            return false;
        }
        let marker = bytes[offset];
        offset += 1;
        if marker == 0xda {
            return saw_dimensions;
        }
        if matches!(marker, 0x01 | 0xd0..=0xd9) {
            continue;
        }
        if offset + 2 > bytes.len() {
            return false;
        }
        let length = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        if length < 2 || offset + length > bytes.len() {
            return false;
        }
        if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
            if length < 7 {
                return false;
            }
            let height = u16::from_be_bytes([bytes[offset + 3], bytes[offset + 4]]);
            let width = u16::from_be_bytes([bytes[offset + 5], bytes[offset + 6]]);
            if width == 0 || height == 0 {
                return false;
            }
            saw_dimensions = true;
        }
        offset += length;
    }
    false
}

fn is_structurally_valid_webp(bytes: &[u8]) -> bool {
    if bytes.len() < 30
        || !bytes.starts_with(b"RIFF")
        || &bytes[8..12] != b"WEBP"
        || u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize + 8 != bytes.len()
    {
        return false;
    }
    let chunk_size = u32::from_le_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]) as usize;
    if 20 + chunk_size > bytes.len() {
        return false;
    }
    match &bytes[12..16] {
        b"VP8X" => chunk_size >= 10,
        b"VP8L" => chunk_size >= 5 && bytes[20] == 0x2f,
        b"VP8 " => {
            chunk_size >= 10
                && &bytes[23..26] == b"\x9d\x01\x2a"
                && u16::from_le_bytes([bytes[26], bytes[27]]) & 0x3fff != 0
                && u16::from_le_bytes([bytes[28], bytes[29]]) & 0x3fff != 0
        }
        _ => false,
    }
}

fn validated_image_mime(bytes: &[u8], extension: &str) -> Result<&'static str, String> {
    let detected = if is_structurally_valid_jpeg(bytes) {
        ("jpeg", "image/jpeg")
    } else if is_structurally_valid_png(bytes) {
        ("png", "image/png")
    } else if is_structurally_valid_webp(bytes) {
        ("webp", "image/webp")
    } else {
        return Err("图片内容损坏或不是有效的 JPG、PNG、WebP 文件".to_string());
    };
    let extension_matches = match detected.0 {
        "jpeg" => matches!(extension, "jpg" | "jpeg"),
        value => extension == value,
    };
    if !extension_matches {
        return Err("图片扩展名与实际格式不一致".to_string());
    }
    Ok(detected.1)
}

fn resolve_image_attachment_path(
    root: &Path,
    attachment: &MaterialImageAttachment,
) -> Result<PathBuf, String> {
    validate_uuid(&attachment.id, "attachment id")?;
    validate_uuid(&attachment.material_id, "material id")?;
    let relative = Path::new(&attachment.relative_path);
    if relative
        .components()
        .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err("图片附件路径无效".to_string());
    }
    let extension = relative
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "图片附件扩展名无效".to_string())?;
    let expected = image_attachment_path(root, &attachment.material_id, &attachment.id, extension);
    let actual = root.join(relative);
    if actual != expected {
        return Err("图片附件路径与元数据不一致".to_string());
    }
    Ok(actual)
}

#[tauri::command]
pub fn attach_material_image(
    app_handle: tauri::AppHandle,
    material_id: String,
    source_path: String,
) -> Result<MaterialImageAttachment, String> {
    validate_uuid(&material_id, "material id")?;
    let source = Path::new(&source_path);
    let metadata = fs::metadata(source).map_err(|e| format!("读取图片失败: {e}"))?;
    if !metadata.is_file() || metadata.len() > MAX_IMAGE_ATTACHMENT_BYTES {
        return Err("图片无效或超过 10MB 限制".to_string());
    }
    let bytes = fs::read(source).map_err(|e| format!("读取图片失败: {e}"))?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_IMAGE_ATTACHMENT_BYTES {
        return Err("图片无效或超过 10MB 限制".to_string());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "jpg" | "jpeg" | "png" | "webp" => {}
        _ => return Err("仅支持 JPG、PNG 和 WebP 图片".to_string()),
    }
    let mime_type = validated_image_mime(&bytes, &extension)?;
    let original_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "图片文件名无效".to_string())?
        .to_string();
    let root = materials_dir(&app_handle)?;
    let mut state = lock_state()?;
    ensure_loaded(&mut state, &root)?;
    let mut item = state
        .items
        .get(&material_id)
        .map(|indexed| indexed.item.clone())
        .ok_or_else(|| "素材不存在或已被删除".to_string())?;
    let attachment_id = Uuid::new_v4().to_string();
    let destination = image_attachment_path(&root, &material_id, &attachment_id, &extension);
    let parent = destination
        .parent()
        .ok_or_else(|| "图片附件路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("创建图片目录失败: {e}"))?;
    let temporary = parent.join(format!(".{attachment_id}.image.tmp"));
    let mut file = File::create(&temporary).map_err(|e| format!("创建图片临时文件失败: {e}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("写入图片临时文件失败: {e}"))?;
    drop(file);
    let attachment = MaterialImageAttachment {
        id: attachment_id.clone(),
        material_id: material_id.clone(),
        original_name,
        mime_type: mime_type.to_string(),
        size: bytes.len() as u64,
        relative_path: destination
            .strip_prefix(&root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/"),
        created_at: now_iso(),
    };
    let metadata_path = image_attachment_metadata_path(&root, &material_id, &attachment_id);
    if let Err(error) = atomic_write_json(&metadata_path, &attachment) {
        let _ = queue_file_cleanup(&root, "rollback_material_image", vec![temporary]);
        return Err(error);
    }
    if let Err(error) = fs::rename(&temporary, &destination) {
        let _ = queue_file_cleanup(
            &root,
            "rollback_material_image",
            vec![temporary, metadata_path],
        );
        return Err(format!("提交图片附件失败: {error}"));
    }
    item.attachment_ids.push(attachment_id.clone());
    item.updated_at = now_iso();
    if let Err(error) = save_item(&root, &item) {
        let cleanup = queue_file_cleanup(
            &root,
            "rollback_material_image",
            vec![destination, metadata_path],
        );
        return Err(match cleanup {
            Ok(result) if result.cleanup_pending => {
                format!("保存素材附件引用失败，残留文件已加入重试清理: {error}")
            }
            Ok(_) => format!("保存素材附件引用失败，附件已回滚: {error}"),
            Err(cleanup_error) => {
                format!("保存素材附件引用失败，且无法登记残留清理: {error}; {cleanup_error}")
            }
        });
    }
    state.items.insert(
        material_id.clone(),
        IndexedMaterial {
            search_text: normalize_search_text(&item),
            item,
        },
    );
    Ok(attachment)
}

#[tauri::command]
pub fn list_material_image_attachments(
    app_handle: tauri::AppHandle,
    material_id: String,
) -> Result<Vec<MaterialImageAttachment>, String> {
    validate_uuid(&material_id, "material id")?;
    let root = materials_dir(&app_handle)?;
    let mut state = lock_state()?;
    ensure_loaded(&mut state, &root)?;
    let item = state
        .items
        .get(&material_id)
        .map(|indexed| &indexed.item)
        .ok_or_else(|| "素材不存在或已被删除".to_string())?;
    item.attachment_ids
        .iter()
        .map(|attachment_id| {
            validate_uuid(attachment_id, "attachment id")?;
            let attachment: MaterialImageAttachment = read_json(&image_attachment_metadata_path(
                &root,
                &material_id,
                attachment_id,
            ))?;
            if attachment.id != *attachment_id || attachment.material_id != material_id {
                return Err("图片附件元数据与素材引用不一致".to_string());
            }
            let path = resolve_image_attachment_path(&root, &attachment)?;
            if !path.is_file() {
                return Err(format!("图片附件文件缺失: {}", attachment.original_name));
            }
            Ok(attachment)
        })
        .collect()
}

#[tauri::command]
pub fn read_material_image_attachment(
    app_handle: tauri::AppHandle,
    material_id: String,
    attachment_id: String,
) -> Result<MaterialImageAttachmentContent, String> {
    validate_uuid(&material_id, "material id")?;
    validate_uuid(&attachment_id, "attachment id")?;
    let attachments = list_material_image_attachments(app_handle.clone(), material_id)?;
    let attachment = attachments
        .into_iter()
        .find(|attachment| attachment.id == attachment_id)
        .ok_or_else(|| "图片附件不存在或不属于该素材".to_string())?;
    let root = materials_dir(&app_handle)?;
    let path = resolve_image_attachment_path(&root, &attachment)?;
    let bytes = fs::read(&path).map_err(|error| format!("读取图片附件失败: {error}"))?;
    if bytes.len() as u64 != attachment.size {
        return Err("图片附件大小与元数据不一致".to_string());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let mime_type = validated_image_mime(&bytes, extension)?;
    if mime_type != attachment.mime_type {
        return Err("图片附件格式与元数据不一致".to_string());
    }
    Ok(MaterialImageAttachmentContent { attachment, bytes })
}

#[tauri::command]
pub fn create_material_with_image(
    app_handle: tauri::AppHandle,
    input: CreateMaterialInput,
    source_path: String,
) -> Result<MaterialItem, String> {
    let material = create_material(app_handle.clone(), input)?;
    match attach_material_image(app_handle.clone(), material.id.clone(), source_path) {
        Ok(_) => get_material(app_handle, material.id),
        Err(error) => match delete_material(app_handle, material.id) {
            Ok(result) if result.cleanup_pending => Err(format!(
                "图片导入失败，素材记录已撤销，残留文件已加入重试清理: {error}"
            )),
            Ok(_) => Err(format!("图片导入失败，未创建素材: {error}")),
            Err(rollback_error) => Err(format!(
                "图片导入失败，且撤销素材记录失败: {error}; {rollback_error}"
            )),
        },
    }
}

#[tauri::command]
pub fn create_material_usage(
    app_handle: tauri::AppHandle,
    input: CreateMaterialUsageInput,
) -> Result<MaterialUsage, String> {
    validate_uuid(&input.material_id, "material id")?;
    validate_uuid(&input.project_id, "project id")?;
    if input.volume.trim().is_empty()
        || input.chapter_id.trim().is_empty()
        || input.chapter_title.trim().is_empty()
    {
        return Err("素材使用记录必须关联完整章节信息".to_string());
    }
    if input.action != "insert" && input.action != "ai_context" {
        return Err("未知的素材使用动作".to_string());
    }
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    if !material_state.items.contains_key(&input.material_id) {
        return Err("素材不存在或已被删除".to_string());
    }
    let usage = MaterialUsage {
        id: Uuid::new_v4().to_string(),
        material_id: input.material_id,
        action: input.action,
        project_id: input.project_id,
        volume: input.volume,
        chapter_id: input.chapter_id,
        chapter_title: input.chapter_title,
        excerpt: input.excerpt,
        created_at: now_iso(),
    };
    atomic_write_json(&usage_path(&root, &usage.id), &usage)?;
    Ok(usage)
}

#[tauri::command]
pub fn list_material_usages(
    app_handle: tauri::AppHandle,
    material_id: String,
) -> Result<Vec<MaterialUsage>, String> {
    validate_uuid(&material_id, "material id")?;
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    if !material_state.items.contains_key(&material_id) {
        return Err("素材不存在或已被删除".to_string());
    }
    let mut usages = Vec::new();
    for entry in
        fs::read_dir(usage_dir(&root)).map_err(|e| format!("Failed to read material usage: {e}"))?
    {
        let path = entry
            .map_err(|e| format!("Failed to read material usage entry: {e}"))?
            .path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let usage: MaterialUsage = read_json(&path)?;
        if usage.material_id == material_id {
            usages.push(usage);
        }
    }
    usages.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(usages)
}

#[tauri::command]
pub fn list_material_categories(
    app_handle: tauri::AppHandle,
) -> Result<Vec<MaterialCategory>, String> {
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    load_categories(&root)
}

#[tauri::command]
pub fn save_material_categories(
    app_handle: tauri::AppHandle,
    categories: Vec<MaterialCategory>,
) -> Result<(), String> {
    validate_categories(&categories)?;
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    let valid_ids: HashSet<&str> = categories
        .iter()
        .map(|category| category.id.as_str())
        .collect();
    let inbox = inbox_id(&categories)?;
    let mut changed = Vec::new();
    for indexed in material_state.items.values() {
        if !valid_ids.contains(indexed.item.category_id.as_str()) {
            let mut item = indexed.item.clone();
            item.category_id = inbox.clone();
            item.updated_at = now_iso();
            save_item(&root, &item)?;
            changed.push(item);
        }
    }
    atomic_write_json(&categories_path(&root), &categories)?;
    for item in changed {
        material_state.items.insert(
            item.id.clone(),
            IndexedMaterial {
                search_text: normalize_search_text(&item),
                item,
            },
        );
    }
    Ok(())
}

#[tauri::command]
pub fn list_material_kinds(
    app_handle: tauri::AppHandle,
) -> Result<Vec<MaterialKindDefinition>, String> {
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    load_kinds(&root)
}

#[tauri::command]
pub fn save_material_kinds(
    app_handle: tauri::AppHandle,
    kinds: Vec<MaterialKindDefinition>,
) -> Result<(), String> {
    validate_kinds(&kinds)?;
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    let ids: HashSet<&str> = kinds.iter().map(|kind| kind.id.as_str()).collect();
    if material_state
        .items
        .values()
        .any(|indexed| !ids.contains(indexed.item.kind_id.as_str()))
    {
        return Err("仍有素材使用被删除的类型，请改为归档或先移动素材".to_string());
    }
    atomic_write_json(&kinds_path(&root), &kinds)
}

#[tauri::command]
pub fn restore_material_kind_presets(
    app_handle: tauri::AppHandle,
) -> Result<Vec<MaterialKindDefinition>, String> {
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    let mut kinds = load_kinds(&root)?;
    for mut preset in preset_kinds() {
        if let Some(existing) = kinds
            .iter_mut()
            .find(|kind| kind.preset_key == preset.preset_key)
        {
            existing.archived = false;
        } else {
            preset.order = kinds.iter().map(|kind| kind.order).max().unwrap_or(-1) + 1;
            kinds.push(preset);
        }
    }
    validate_kinds(&kinds)?;
    atomic_write_json(&kinds_path(&root), &kinds)?;
    Ok(kinds)
}

#[tauri::command]
pub fn search_materials(
    app_handle: tauri::AppHandle,
    query: String,
    mut filter: MaterialFilter,
    limit: usize,
) -> Result<Vec<MaterialSearchResult>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    filter.query = Some(query.clone());
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    let categories = load_categories(&root)?;
    let mut results: Vec<MaterialSearchResult> =
        filtered_items(&material_state.items, &filter, &categories)
            .into_iter()
            .map(|indexed| MaterialSearchResult {
                material_id: indexed.item.id.clone(),
                title: indexed.item.title.clone(),
                snippet: material_snippet(&indexed.item, &query.to_lowercase()),
                score: match_score(&indexed.item, &query),
            })
            .collect();
    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.title.cmp(&b.title))
    });
    results.truncate(limit.clamp(1, 100));
    Ok(results)
}

pub(crate) fn detach_project(
    app_handle: &tauri::AppHandle,
    project_id: &str,
) -> Result<(), String> {
    validate_uuid(project_id, "project id")?;
    let root = materials_dir(app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    let mut changed = Vec::new();
    for indexed in material_state.items.values() {
        if indexed.item.scope == MaterialScope::Projects
            && indexed.item.project_ids.iter().any(|id| id == project_id)
        {
            let mut item = indexed.item.clone();
            item.project_ids.retain(|id| id != project_id);
            if item.project_ids.is_empty() {
                item.scope = MaterialScope::Global;
            }
            item.updated_at = now_iso();
            save_item(&root, &item)?;
            changed.push(item);
        }
    }
    for item in changed {
        material_state.items.insert(
            item.id.clone(),
            IndexedMaterial {
                search_text: normalize_search_text(&item),
                item,
            },
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!("ai-novel-material-test-{}", Uuid::new_v4()))
    }

    fn sample_item(index: usize, category_id: &str, kind_id: &str) -> MaterialItem {
        MaterialItem {
            schema_version: SCHEMA_VERSION,
            id: Uuid::new_v4().to_string(),
            title: format!("素材 {index}"),
            kind_id: kind_id.to_string(),
            content: format!("{}关键内容{index}", "测试正文".repeat(715)),
            content_format: MaterialContentFormat::PlainText,
            summary: "摘要".to_string(),
            source_type: MaterialSourceType::Original,
            source_name: "测试来源".to_string(),
            source_url: String::new(),
            category_id: category_id.to_string(),
            tags: vec!["测试".to_string()],
            scope: MaterialScope::Global,
            project_ids: Vec::new(),
            favorite: index % 2 == 0,
            attachment_ids: Vec::new(),
            source_document_id: None,
            source_section_id: None,
            source_locator: None,
            created_at: now_iso(),
            updated_at: now_iso(),
        }
    }

    #[test]
    fn atomic_write_replaces_and_recovers_json() {
        let root = test_root();
        fs::create_dir_all(&root).unwrap();
        let path = root.join("value.json");
        atomic_write_json(&path, &vec!["first"]).unwrap();
        atomic_write_json(&path, &vec!["second"]).unwrap();
        let value: Vec<String> = read_json(&path).unwrap();
        assert_eq!(value, vec!["second"]);

        let backup = recovery_path(&path);
        fs::rename(&path, &backup).unwrap();
        let recovered: Vec<String> = read_json(&path).unwrap();
        assert_eq!(recovered, vec!["second"]);
        assert!(path.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn index_load_recovers_interrupted_item_replacement() {
        let root = test_root();
        ensure_structure(&root).unwrap();
        let category = default_categories().remove(0);
        let kind = preset_kinds().remove(0);
        let item = sample_item(1, &category.id, &kind.id);
        save_item(&root, &item).unwrap();
        let path = item_path(&root, &item.id);
        fs::rename(&path, recovery_path(&path)).unwrap();

        let mut material_state = MaterialState::default();
        ensure_loaded(&mut material_state, &root).unwrap();
        assert!(material_state.items.contains_key(&item.id));
        assert!(path.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn categories_allow_two_levels_and_require_inbox() {
        let parent = MaterialCategory {
            id: Uuid::new_v4().to_string(),
            name: "父级".to_string(),
            parent_id: None,
            order: 1,
            system_key: None,
        };
        let child = MaterialCategory {
            id: Uuid::new_v4().to_string(),
            name: "子级".to_string(),
            parent_id: Some(parent.id.clone()),
            order: 0,
            system_key: None,
        };
        let mut categories = default_categories();
        categories.extend([parent.clone(), child.clone()]);
        assert!(validate_categories(&categories).is_ok());

        categories.push(MaterialCategory {
            id: Uuid::new_v4().to_string(),
            name: "第三级".to_string(),
            parent_id: Some(child.id),
            order: 0,
            system_key: None,
        });
        assert!(validate_categories(&categories).is_err());
    }

    #[test]
    fn project_filter_keeps_global_and_linked_materials() {
        let category = default_categories().remove(0);
        let kind = preset_kinds().remove(0);
        let project_id = Uuid::new_v4().to_string();
        let mut global = sample_item(1, &category.id, &kind.id);
        global.scope = MaterialScope::Global;
        let mut linked = sample_item(2, &category.id, &kind.id);
        linked.scope = MaterialScope::Projects;
        linked.project_ids = vec![project_id.clone()];
        let mut other = sample_item(3, &category.id, &kind.id);
        other.scope = MaterialScope::Projects;
        other.project_ids = vec![Uuid::new_v4().to_string()];
        let items = [global, linked, other]
            .into_iter()
            .map(|item| {
                (
                    item.id.clone(),
                    IndexedMaterial {
                        search_text: normalize_search_text(&item),
                        item,
                    },
                )
            })
            .collect();
        let filter = MaterialFilter {
            project_id: Some(project_id),
            ..MaterialFilter::default()
        };
        assert_eq!(filtered_items(&items, &filter, &[category]).len(), 2);
    }

    #[test]
    fn thousand_item_keyword_queries_meet_warm_budget() {
        let category = default_categories().remove(0);
        let kind = preset_kinds().remove(0);
        let items: HashMap<String, IndexedMaterial> = (0..1000)
            .map(|index| sample_item(index, &category.id, &kind.id))
            .map(|item| {
                (
                    item.id.clone(),
                    IndexedMaterial {
                        search_text: normalize_search_text(&item),
                        item,
                    },
                )
            })
            .collect();
        let filter = MaterialFilter {
            query: Some("关键内容999".to_string()),
            ..MaterialFilter::default()
        };
        let mut durations = Vec::new();
        for _ in 0..10 {
            let started = Instant::now();
            let result = filtered_items(&items, &filter, std::slice::from_ref(&category));
            durations.push(started.elapsed());
            assert_eq!(result.len(), 1);
        }
        let max = durations.into_iter().max().unwrap_or(Duration::ZERO);
        eprintln!("1000 materials warm keyword query max: {max:?}");
        assert!(max < Duration::from_millis(500));
    }

    #[test]
    fn cold_material_index_meets_thousand_item_budget() {
        let root = test_root();
        ensure_structure(&root).unwrap();
        let category = default_categories().remove(0);
        let kind = preset_kinds().remove(0);
        for index in 0..1000 {
            let item = sample_item(index, &category.id, &kind.id);
            let bytes = serde_json::to_vec_pretty(&item).unwrap();
            fs::write(item_path(&root, &item.id), bytes).unwrap();
        }

        let mut material_state = MaterialState::default();
        let started = Instant::now();
        ensure_loaded(&mut material_state, &root).unwrap();
        let elapsed = started.elapsed();
        eprintln!("1000 materials cold index load: {elapsed:?}");
        assert_eq!(material_state.items.len(), 1000);
        assert!(elapsed < Duration::from_secs(2));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn markdown_content_uses_one_plain_text_projection() {
        let category = default_categories().remove(0);
        let kind = preset_kinds().remove(0);
        let mut item = sample_item(1, &category.id, &kind.id);
        item.content_format = MaterialContentFormat::Markdown;
        item.content =
            "# 标题\n\n- **重点** [资料](https://example.com)\n\n```txt\n代码内容\n```".to_string();
        let plain = material_plain_text_content(&item);
        assert_eq!(plain, "标题\n\n重点 资料\n\n代码内容");
        assert!(normalize_search_text(&item).contains("代码内容"));
        assert!(!summary(&item).content_preview.contains("**"));
    }

    fn minimal_png() -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        bytes.extend_from_slice(&13_u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&1_u32.to_be_bytes());
        bytes.extend_from_slice(&1_u32.to_be_bytes());
        bytes.extend_from_slice(&[8, 2, 0, 0, 0]);
        bytes.extend_from_slice(&[0; 4]);
        bytes.extend_from_slice(&0_u32.to_be_bytes());
        bytes.extend_from_slice(b"IEND");
        bytes.extend_from_slice(&[0; 4]);
        bytes
    }

    fn minimal_jpeg() -> Vec<u8> {
        vec![
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
            0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xff, 0xd9,
        ]
    }

    #[test]
    fn image_validation_rejects_spoofed_and_truncated_files() {
        assert_eq!(
            validated_image_mime(&minimal_png(), "png").unwrap(),
            "image/png"
        );
        assert_eq!(
            validated_image_mime(&minimal_jpeg(), "jpg").unwrap(),
            "image/jpeg"
        );
        assert!(validated_image_mime(&minimal_png(), "jpg").is_err());
        let mut truncated = minimal_png();
        truncated.truncate(20);
        assert!(validated_image_mime(&truncated, "png").is_err());
        assert!(validated_image_mime(b"not an image", "webp").is_err());
    }

    #[test]
    fn cleanup_queue_is_idempotent_and_persisted() {
        let root = test_root();
        ensure_structure(&root).unwrap();
        let target = root.join("attachments").join("stale.bin");
        fs::write(&target, b"stale").unwrap();
        let result = queue_file_cleanup(&root, "test_cleanup", vec![target.clone()]).unwrap();
        assert!(!result.cleanup_pending);
        assert!(!target.exists());
        assert_eq!(retry_pending_file_cleanups(&root).unwrap(), 0);
        let state: CleanupState = read_json(&cleanup_path(&root)).unwrap();
        assert!(state.pending_file_cleanups.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn startup_reconciliation_removes_unreferenced_image_directories() {
        let root = test_root();
        ensure_structure(&root).unwrap();
        let orphan = image_attachment_dir(&root, &Uuid::new_v4().to_string());
        fs::create_dir_all(&orphan).unwrap();
        fs::write(orphan.join("orphan.png"), minimal_png()).unwrap();
        reconcile_image_attachments(&root, &HashMap::new()).unwrap();
        assert!(!orphan.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn markdown_import_enforces_extension_encoding_content_and_size() {
        let root = test_root();
        fs::create_dir_all(&root).unwrap();
        let valid = root.join("notes.md");
        fs::write(&valid, "# 标题\n正文").unwrap();
        let preview = markdown_import_preview(valid.to_str().unwrap()).unwrap();
        assert_eq!(preview.title, "notes");
        assert_eq!(preview.source_name, "notes.md");
        assert!(preview.content.contains("正文"));

        let empty = root.join("empty.markdown");
        fs::write(&empty, "   ").unwrap();
        assert!(markdown_import_preview(empty.to_str().unwrap()).is_err());
        let invalid_utf8 = root.join("invalid.md");
        fs::write(&invalid_utf8, [0xff, 0xfe, 0xfd]).unwrap();
        assert!(markdown_import_preview(invalid_utf8.to_str().unwrap()).is_err());
        let wrong_extension = root.join("notes.txt");
        fs::write(&wrong_extension, "text").unwrap();
        assert!(markdown_import_preview(wrong_extension.to_str().unwrap()).is_err());
        let oversized = root.join("oversized.md");
        File::create(&oversized)
            .unwrap()
            .set_len(MAX_MARKDOWN_IMPORT_BYTES + 1)
            .unwrap();
        assert!(markdown_import_preview(oversized.to_str().unwrap()).is_err());
        let missing = root.join("missing.md");
        assert!(markdown_import_preview(missing.to_str().unwrap()).is_err());
        let _ = fs::remove_dir_all(root);
    }
}
