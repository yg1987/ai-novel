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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CleanupState {
    schema_version: u32,
    cleaned_project_ids: Vec<String>,
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

fn state() -> &'static Mutex<MaterialState> {
    MATERIAL_STATE.get_or_init(|| Mutex::new(MaterialState::default()))
}

fn lock_state() -> Result<std::sync::MutexGuard<'static, MaterialState>, String> {
    state()
        .lock()
        .map_err(|_| "Material library state lock is poisoned".to_string())
}

fn materials_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
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

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn validate_uuid(value: &str, field: &str) -> Result<(), String> {
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

fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
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
            },
        )?;
    }
    Ok(())
}

fn normalize_search_text(item: &MaterialItem) -> String {
    format!(
        "{}\n{}\n{}\n{}\n{}",
        item.title,
        item.content,
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
    state.root = Some(root.to_path_buf());
    state.items = items;
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
        content_preview: item.content.chars().take(180).collect(),
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
    for text in [&item.summary, &item.content, &item.source_name] {
        let lower = text.to_lowercase();
        if let Some(byte_pos) = lower.find(query) {
            let char_pos = lower[..byte_pos].chars().count();
            let start = char_pos.saturating_sub(40);
            return text.chars().skip(start).take(140).collect();
        }
    }
    item.content.chars().take(140).collect()
}

fn save_item(root: &Path, item: &MaterialItem) -> Result<(), String> {
    atomic_write_json(&item_path(root, &item.id), item)
}

#[tauri::command]
pub async fn initialize_material_library(
    app_handle: tauri::AppHandle,
) -> Result<LegacyCleanupSummary, String> {
    let root = materials_dir(&app_handle)?;
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

fn delete_material_usage(root: &Path, material_id: &str) -> Result<(), String> {
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
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete material usage {}: {e}", path.display()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_material(app_handle: tauri::AppHandle, material_id: String) -> Result<(), String> {
    validate_uuid(&material_id, "material id")?;
    let root = materials_dir(&app_handle)?;
    let mut material_state = lock_state()?;
    ensure_loaded(&mut material_state, &root)?;
    if !material_state.items.contains_key(&material_id) {
        return Err("素材不存在或已被删除".to_string());
    }
    delete_material_usage(&root, &material_id)?;
    fs::remove_file(item_path(&root, &material_id)).map_err(|e| format!("删除素材失败: {e}"))?;
    material_state.items.remove(&material_id);
    Ok(())
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
}
