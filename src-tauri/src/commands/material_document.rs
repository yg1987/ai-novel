use super::material::{
    atomic_write_json, materials_dir, now_iso, queue_file_cleanup, retry_pending_file_cleanups,
    validate_uuid, FileCleanupResult, MaterialScope,
};
use encoding_rs::{GBK, UTF_16BE, UTF_16LE};
use html5ever::{parse_document, tendril::TendrilSink};
use markup5ever_rcdom::{Handle, NodeData, RcDom};
use quick_xml::{
    escape::unescape,
    events::{BytesStart, Event},
    Reader,
};
use reqwest::{blocking::Client, header::CONTENT_TYPE, redirect::Policy};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use url::Url;
use uuid::Uuid;
use zip::ZipArchive;

const DOCUMENT_SCHEMA_VERSION: u32 = 1;
const MAX_DOCUMENT_BYTES: usize = 25 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_ARCHIVE_ENTRY_BYTES: u64 = 4 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES: u64 = 100 * 1024 * 1024;
const MAX_SEARCH_RESULTS: usize = 100;
const MAX_WEB_RESPONSE_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MaterialDocumentFormat {
    Txt,
    Epub,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialAttachment {
    pub id: String,
    pub owner_type: String,
    pub owner_id: String,
    pub original_name: String,
    pub stored_name: String,
    pub mime_type: String,
    pub size: usize,
    pub relative_path: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocument {
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub author: String,
    pub format: MaterialDocumentFormat,
    pub attachment_id: String,
    pub scope: MaterialScope,
    pub project_ids: Vec<String>,
    pub section_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentSection {
    pub id: String,
    pub document_id: String,
    pub order: usize,
    pub title: String,
    pub relative_path: String,
    pub character_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentSectionPreview {
    pub order: usize,
    pub title: String,
    pub character_count: usize,
    pub content_preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentImportPreview {
    pub file_name: String,
    pub format: MaterialDocumentFormat,
    pub title: String,
    pub author: String,
    pub detected_encoding: Option<String>,
    pub sections: Vec<MaterialDocumentSectionPreview>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TxtImportMode {
    DetectedSections,
    Single,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxtSectionEdit {
    pub order: usize,
    pub title: String,
    pub merge_with_previous: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentImportOptions {
    pub title: Option<String>,
    pub author: Option<String>,
    pub txt_mode: Option<TxtImportMode>,
    #[serde(default)]
    pub txt_section_edits: Vec<TxtSectionEdit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentSummary {
    pub id: String,
    pub title: String,
    pub author: String,
    pub format: MaterialDocumentFormat,
    pub scope: MaterialScope,
    pub project_ids: Vec<String>,
    pub section_count: usize,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentPage {
    pub items: Vec<MaterialDocumentSummary>,
    pub page: usize,
    pub page_size: usize,
    pub total_items: usize,
    pub total_pages: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentDetail {
    pub document: MaterialDocument,
    pub sections: Vec<MaterialDocumentSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentSectionContent {
    pub document: MaterialDocument,
    pub section: MaterialDocumentSection,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentSearchResult {
    pub document_id: String,
    pub section_id: String,
    pub document_title: String,
    pub section_title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDocumentSourceStatus {
    pub document_exists: bool,
    pub section_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebMaterialPreview {
    pub title: String,
    pub source_name: String,
    pub source_url: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaterialDocumentRecord {
    document: MaterialDocument,
    sections: Vec<MaterialDocumentSection>,
}

#[derive(Clone)]
struct IndexedMaterialDocument {
    record: MaterialDocumentRecord,
    section_search_text: HashMap<String, String>,
}

#[derive(Default)]
struct MaterialDocumentState {
    root: Option<PathBuf>,
    documents: HashMap<String, IndexedMaterialDocument>,
}

static MATERIAL_DOCUMENT_STATE: OnceLock<Mutex<MaterialDocumentState>> = OnceLock::new();

#[derive(Debug, Clone)]
struct SourceFile {
    name: String,
    extension: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
struct ParsedSection {
    title: String,
    content: String,
}

#[derive(Debug, Clone)]
struct ParsedDocument {
    format: MaterialDocumentFormat,
    title: String,
    author: String,
    sections: Vec<ParsedSection>,
    detected_encoding: Option<String>,
    raw_text: Option<String>,
}

#[derive(Debug, Clone)]
struct DecodedTxt {
    content: String,
    encoding: String,
}

#[derive(Debug, Clone)]
struct ManifestItem {
    href: String,
    media_type: String,
}

#[derive(Debug, Default)]
struct OpfPackage {
    title: String,
    author: String,
    manifest: HashMap<String, ManifestItem>,
    spine: Vec<String>,
    nav_href: Option<String>,
    ncx_href: Option<String>,
}

fn document_state() -> &'static Mutex<MaterialDocumentState> {
    MATERIAL_DOCUMENT_STATE.get_or_init(|| Mutex::new(MaterialDocumentState::default()))
}

fn lock_document_state() -> Result<std::sync::MutexGuard<'static, MaterialDocumentState>, String> {
    document_state()
        .lock()
        .map_err(|_| "Material document state lock is poisoned".to_string())
}

fn documents_root(root: &Path) -> PathBuf {
    root.join("documents")
}

fn document_items_dir(root: &Path) -> PathBuf {
    documents_root(root).join("items")
}

fn document_sections_dir(root: &Path, document_id: &str) -> PathBuf {
    documents_root(root).join("sections").join(document_id)
}

fn document_item_path(root: &Path, document_id: &str) -> PathBuf {
    document_items_dir(root).join(format!("{document_id}.json"))
}

fn attachment_items_dir(root: &Path) -> PathBuf {
    root.join("attachments").join("items")
}

fn attachment_metadata_path(root: &Path, attachment_id: &str) -> PathBuf {
    attachment_items_dir(root).join(format!("{attachment_id}.json"))
}

fn attachment_dir(root: &Path, document_id: &str) -> PathBuf {
    root.join("attachments").join("documents").join(document_id)
}

fn section_relative_path(document_id: &str, section_id: &str) -> String {
    format!("documents/sections/{document_id}/{section_id}.txt")
}

fn section_path(root: &Path, document_id: &str, section_id: &str) -> PathBuf {
    document_sections_dir(root, document_id).join(format!("{section_id}.txt"))
}

fn initialize_document_structure(root: &Path) -> Result<(), String> {
    for directory in [
        document_items_dir(root),
        documents_root(root).join("sections"),
        attachment_items_dir(root),
        root.join("attachments").join("documents"),
    ] {
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Failed to create {}: {error}", directory.display()))?;
    }
    Ok(())
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn validate_document_record(record: &MaterialDocumentRecord) -> Result<(), String> {
    validate_uuid(&record.document.id, "document id")?;
    validate_uuid(&record.document.attachment_id, "attachment id")?;
    if record.document.section_ids.len() != record.sections.len() {
        return Err("Document section metadata is inconsistent".to_string());
    }
    for section in &record.sections {
        validate_uuid(&section.id, "section id")?;
        if section.document_id != record.document.id {
            return Err("Document section belongs to a different document".to_string());
        }
        if section.relative_path != section_relative_path(&record.document.id, &section.id) {
            return Err("Document section path is invalid".to_string());
        }
    }
    Ok(())
}

fn ensure_document_state<'a>(
    state: &'a mut MaterialDocumentState,
    root: &Path,
) -> Result<(), String> {
    if state.root.as_deref() == Some(root) {
        return Ok(());
    }
    initialize_document_structure(root)?;
    retry_pending_file_cleanups(root)?;
    let mut documents = HashMap::new();
    for entry in fs::read_dir(document_items_dir(root))
        .map_err(|error| format!("Failed to read document records: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("Failed to read document record entry: {error}"))?
            .path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }
        let record: MaterialDocumentRecord = read_json(&path)?;
        validate_document_record(&record)?;
        let mut section_search_text = HashMap::new();
        for section in &record.sections {
            let text = fs::read_to_string(section_path(root, &record.document.id, &section.id))
                .map_err(|error| format!("Failed to read section {}: {error}", section.id))?;
            section_search_text.insert(section.id.clone(), text.to_lowercase());
        }
        documents.insert(
            record.document.id.clone(),
            IndexedMaterialDocument {
                record,
                section_search_text,
            },
        );
    }
    state.root = Some(root.to_path_buf());
    state.documents = documents;
    Ok(())
}

fn validate_scope(scope: &MaterialScope, project_ids: &[String]) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    let mut clean = Vec::new();
    for project_id in project_ids {
        validate_uuid(project_id, "project id")?;
        if seen.insert(project_id.clone()) {
            clean.push(project_id.clone());
        }
    }
    match scope {
        MaterialScope::Global if !clean.is_empty() => {
            Err("Global documents cannot be assigned to projects".to_string())
        }
        MaterialScope::Projects if clean.is_empty() => {
            Err("Project documents must be assigned to at least one project".to_string())
        }
        _ => Ok(clean),
    }
}

fn visible_to_project(document: &MaterialDocument, project_id: Option<&str>) -> bool {
    match project_id {
        None => true,
        Some(project_id) => {
            document.scope == MaterialScope::Global
                || document.project_ids.iter().any(|id| id == project_id)
        }
    }
}

fn source_file(source_path: &str) -> Result<SourceFile, String> {
    let path = Path::new(source_path);
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Document file name is invalid".to_string())?
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(extension.as_str(), "txt" | "epub") {
        return Err(format!(
            "Unsupported document format '.{extension}'. Supported formats: TXT, EPUB. MOBI, AZW, AZW3 and KFX are not supported."
        ));
    }
    let metadata =
        fs::metadata(path).map_err(|error| format!("Failed to inspect source file: {error}"))?;
    if !metadata.is_file() {
        return Err("The selected document source is not a file".to_string());
    }
    if metadata.len() as usize > MAX_DOCUMENT_BYTES {
        return Err(format!(
            "Document exceeds the {} MB import limit",
            MAX_DOCUMENT_BYTES / 1024 / 1024
        ));
    }
    let bytes = fs::read(path).map_err(|error| format!("Failed to read source file: {error}"))?;
    if bytes.is_empty() {
        return Err("Cannot import an empty document".to_string());
    }
    Ok(SourceFile {
        name,
        extension,
        bytes,
    })
}

fn decode_txt(bytes: &[u8]) -> Result<DecodedTxt, String> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8(bytes[3..].to_vec())
            .map(|content| DecodedTxt {
                content,
                encoding: "UTF-8 BOM".to_string(),
            })
            .map_err(|_| "TXT file is not valid UTF-8".to_string());
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (text, _, had_errors) = UTF_16LE.decode(&bytes[2..]);
        return (!had_errors)
            .then(|| DecodedTxt {
                content: text.into_owned(),
                encoding: "UTF-16LE".to_string(),
            })
            .ok_or_else(|| "TXT file has invalid UTF-16LE content".to_string());
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (text, _, had_errors) = UTF_16BE.decode(&bytes[2..]);
        return (!had_errors)
            .then(|| DecodedTxt {
                content: text.into_owned(),
                encoding: "UTF-16BE".to_string(),
            })
            .ok_or_else(|| "TXT file has invalid UTF-16BE content".to_string());
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(DecodedTxt {
            content: text.to_string(),
            encoding: "UTF-8".to_string(),
        });
    }
    let (text, _, had_errors) = GBK.decode(bytes);
    (!had_errors)
        .then(|| DecodedTxt {
            content: text.into_owned(),
            encoding: "GB18030 / GBK".to_string(),
        })
        .ok_or_else(|| "TXT file is not valid UTF-8, UTF-16, or GB18030/GBK".to_string())
}

fn normalize_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_txt_heading(value: &str) -> bool {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 80 {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    if lower.starts_with("chapter ") || lower.starts_with("chapter\t") {
        return true;
    }
    if !value.starts_with('第') {
        return false;
    }
    let ordinal = value
        .chars()
        .skip(1)
        .take_while(|character| {
            character.is_ascii_digit()
                || matches!(
                    character,
                    '零' | '〇'
                        | '一'
                        | '二'
                        | '三'
                        | '四'
                        | '五'
                        | '六'
                        | '七'
                        | '八'
                        | '九'
                        | '十'
                        | '百'
                        | '千'
                        | '万'
                        | '两'
                )
        })
        .collect::<String>();
    if ordinal.is_empty() {
        return false;
    }
    let suffix_index = 1 + ordinal.chars().count();
    matches!(
        value.chars().nth(suffix_index),
        Some('章' | '节' | '回' | '卷' | '部' | '篇')
    )
}

fn split_txt_sections(content: &str) -> Vec<ParsedSection> {
    let mut sections = Vec::new();
    let mut title = "全文".to_string();
    let mut body = String::new();
    for line in content.lines() {
        if is_txt_heading(line) {
            if !normalize_text(&body).is_empty() {
                sections.push(ParsedSection {
                    title,
                    content: body.trim().to_string(),
                });
                body.clear();
            }
            title = line.trim().to_string();
        } else {
            body.push_str(line);
            body.push('\n');
        }
    }
    if !normalize_text(&body).is_empty() {
        sections.push(ParsedSection {
            title,
            content: body.trim().to_string(),
        });
    }
    sections
}

fn archive_member_path(path: &str) -> Result<(), String> {
    if path.is_empty() || path.contains('\\') || path.starts_with('/') {
        return Err("EPUB contains an invalid archive path".to_string());
    }
    for component in Path::new(path).components() {
        if !matches!(component, Component::Normal(_)) {
            return Err("EPUB contains an unsafe archive path".to_string());
        }
    }
    Ok(())
}

fn resolve_archive_path(base_file: &str, href: &str) -> Result<String, String> {
    let href = href
        .split('#')
        .next()
        .unwrap_or_default()
        .split('?')
        .next()
        .unwrap_or_default();
    if href.is_empty() || href.contains(':') || href.contains('\\') || href.starts_with('/') {
        return Err("EPUB contains an unsafe referenced path".to_string());
    }
    let mut parts = base_file.split('/').collect::<Vec<_>>();
    parts.pop();
    for part in href.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if parts.pop().is_none() {
                    return Err("EPUB referenced path escapes the archive".to_string());
                }
            }
            value => parts.push(value),
        }
    }
    let resolved = parts.join("/");
    archive_member_path(&resolved)?;
    Ok(resolved)
}

fn validate_archive<R: Read + std::io::Seek>(archive: &mut ZipArchive<R>) -> Result<(), String> {
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("EPUB has too many archive entries".to_string());
    }
    let mut total = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to inspect EPUB archive: {error}"))?;
        archive_member_path(entry.name())?;
        if entry.size() > MAX_ARCHIVE_ENTRY_BYTES {
            return Err("EPUB contains an entry that exceeds the import limit".to_string());
        }
        total = total.saturating_add(entry.size());
        if total > MAX_ARCHIVE_UNCOMPRESSED_BYTES {
            return Err("EPUB expands beyond the import limit".to_string());
        }
    }
    Ok(())
}

fn archive_file<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    path: &str,
) -> Result<Vec<u8>, String> {
    archive_member_path(path)?;
    let mut entry = archive
        .by_name(path)
        .map_err(|_| format!("EPUB is missing required file '{path}'"))?;
    if entry.size() > MAX_ARCHIVE_ENTRY_BYTES {
        return Err("EPUB contains an entry that exceeds the import limit".to_string());
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Failed to read EPUB entry '{path}': {error}"))?;
    Ok(bytes)
}

fn xml_local_name(value: &[u8]) -> String {
    String::from_utf8_lossy(value)
        .rsplit(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn xml_text(value: &[u8]) -> Result<String, String> {
    let raw = String::from_utf8_lossy(value);
    unescape(&raw)
        .map(|value| value.into_owned())
        .map_err(|error| format!("Invalid XML text: {error}"))
}

fn attribute_value(event: &BytesStart<'_>, expected: &str) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("Invalid XML attribute: {error}"))?;
        if xml_local_name(attribute.key.as_ref()) == expected {
            return xml_text(attribute.value.as_ref()).map(Some);
        }
    }
    Ok(None)
}

fn parse_container(bytes: &[u8]) -> Result<String, String> {
    let mut reader = Reader::from_reader(Cursor::new(bytes));
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event))
                if xml_local_name(event.name().as_ref()) == "rootfile" =>
            {
                return attribute_value(&event, "full-path")?
                    .ok_or_else(|| "EPUB container does not declare an OPF package".to_string());
            }
            Ok(Event::Eof) => return Err("EPUB container has no OPF package".to_string()),
            Err(error) => return Err(format!("Failed to parse EPUB container: {error}")),
            _ => {}
        }
        buffer.clear();
    }
}

fn parse_opf(bytes: &[u8]) -> Result<OpfPackage, String> {
    let mut reader = Reader::from_reader(Cursor::new(bytes));
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut package = OpfPackage::default();
    let mut capture: Option<&str> = None;
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => {
                let name = xml_local_name(event.name().as_ref());
                match name.as_str() {
                    "title" => capture = Some("title"),
                    "creator" => capture = Some("creator"),
                    "item" => {
                        let id = attribute_value(&event, "id")?.unwrap_or_default();
                        let href = attribute_value(&event, "href")?.unwrap_or_default();
                        let media_type = attribute_value(&event, "media-type")?.unwrap_or_default();
                        let properties = attribute_value(&event, "properties")?.unwrap_or_default();
                        if !id.is_empty() && !href.is_empty() {
                            if properties.split_whitespace().any(|value| value == "nav") {
                                package.nav_href = Some(href.clone());
                            }
                            if media_type == "application/x-dtbncx+xml" {
                                package.ncx_href = Some(href.clone());
                            }
                            package
                                .manifest
                                .insert(id, ManifestItem { href, media_type });
                        }
                    }
                    "itemref" => {
                        if let Some(idref) = attribute_value(&event, "idref")? {
                            package.spine.push(idref);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(event)) => {
                let name = xml_local_name(event.name().as_ref());
                if name == "item" {
                    let id = attribute_value(&event, "id")?.unwrap_or_default();
                    let href = attribute_value(&event, "href")?.unwrap_or_default();
                    let media_type = attribute_value(&event, "media-type")?.unwrap_or_default();
                    let properties = attribute_value(&event, "properties")?.unwrap_or_default();
                    if !id.is_empty() && !href.is_empty() {
                        if properties.split_whitespace().any(|value| value == "nav") {
                            package.nav_href = Some(href.clone());
                        }
                        if media_type == "application/x-dtbncx+xml" {
                            package.ncx_href = Some(href.clone());
                        }
                        package
                            .manifest
                            .insert(id, ManifestItem { href, media_type });
                    }
                } else if name == "itemref" {
                    if let Some(idref) = attribute_value(&event, "idref")? {
                        package.spine.push(idref);
                    }
                }
            }
            Ok(Event::Text(event)) => {
                if let Some(field) = capture {
                    let value = xml_text(event.as_ref())?;
                    match field {
                        "title" if package.title.is_empty() => {
                            package.title = normalize_text(&value)
                        }
                        "creator" if package.author.is_empty() => {
                            package.author = normalize_text(&value)
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::CData(event)) => {
                if let Some(field) = capture {
                    let value = xml_text(event.as_ref())?;
                    match field {
                        "title" if package.title.is_empty() => {
                            package.title = normalize_text(&value)
                        }
                        "creator" if package.author.is_empty() => {
                            package.author = normalize_text(&value)
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::End(event)) => {
                let name = xml_local_name(event.name().as_ref());
                if matches!(name.as_str(), "title" | "creator") {
                    capture = None;
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Failed to parse EPUB package: {error}")),
            _ => {}
        }
        buffer.clear();
    }
    if package.spine.is_empty() {
        return Err("EPUB package has no spine reading order".to_string());
    }
    Ok(package)
}

fn parse_nav_titles(bytes: &[u8], nav_path: &str) -> Result<HashMap<String, String>, String> {
    let mut reader = Reader::from_reader(Cursor::new(bytes));
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut href: Option<String> = None;
    let mut label = String::new();
    let mut titles = HashMap::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) if xml_local_name(event.name().as_ref()) == "a" => {
                href = attribute_value(&event, "href")?;
                label.clear();
            }
            Ok(Event::Text(event)) if href.is_some() => {
                label.push_str(&xml_text(event.as_ref())?);
                label.push(' ');
            }
            Ok(Event::CData(event)) if href.is_some() => {
                label.push_str(&xml_text(event.as_ref())?);
                label.push(' ');
            }
            Ok(Event::End(event)) if xml_local_name(event.name().as_ref()) == "a" => {
                if let Some(href) = href.take() {
                    let title = normalize_text(&label);
                    if !title.is_empty() {
                        let resolved = resolve_archive_path(nav_path, &href)?;
                        titles.entry(resolved).or_insert(title);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Failed to parse EPUB navigation: {error}")),
            _ => {}
        }
        buffer.clear();
    }
    Ok(titles)
}

fn parse_ncx_titles(bytes: &[u8], ncx_path: &str) -> Result<HashMap<String, String>, String> {
    let mut reader = Reader::from_reader(Cursor::new(bytes));
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut capturing_label = false;
    let mut label = String::new();
    let mut titles = HashMap::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => match xml_local_name(event.name().as_ref()).as_str() {
                "text" => {
                    capturing_label = true;
                    label.clear();
                }
                "content" => {
                    if let Some(source) = attribute_value(&event, "src")? {
                        let title = normalize_text(&label);
                        if !title.is_empty() {
                            let resolved = resolve_archive_path(ncx_path, &source)?;
                            titles.entry(resolved).or_insert(title);
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Empty(event)) if xml_local_name(event.name().as_ref()) == "content" => {
                if let Some(source) = attribute_value(&event, "src")? {
                    let title = normalize_text(&label);
                    if !title.is_empty() {
                        let resolved = resolve_archive_path(ncx_path, &source)?;
                        titles.entry(resolved).or_insert(title);
                    }
                }
            }
            Ok(Event::Text(event)) if capturing_label => {
                label.push_str(&xml_text(event.as_ref())?);
                label.push(' ');
            }
            Ok(Event::CData(event)) if capturing_label => {
                label.push_str(&xml_text(event.as_ref())?);
                label.push(' ');
            }
            Ok(Event::End(event)) if xml_local_name(event.name().as_ref()) == "text" => {
                capturing_label = false;
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Failed to parse EPUB NCX: {error}")),
            _ => {}
        }
        buffer.clear();
    }
    Ok(titles)
}

fn element_name(handle: &Handle) -> Option<String> {
    match &handle.data {
        NodeData::Element { name, .. } => Some(name.local.as_ref().to_ascii_lowercase()),
        _ => None,
    }
}

fn append_xhtml_text(handle: &Handle, output: &mut String) {
    let name = element_name(handle);
    if matches!(name.as_deref(), Some("script" | "style" | "head")) {
        return;
    }
    let is_block = matches!(
        name.as_deref(),
        Some("p" | "div" | "li" | "br" | "tr" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6")
    );
    if is_block && !output.is_empty() {
        output.push('\n');
    }
    if let NodeData::Text { contents } = &handle.data {
        output.push_str(&contents.borrow());
    }
    for child in handle.children.borrow().iter() {
        append_xhtml_text(child, output);
    }
    if is_block {
        output.push('\n');
    }
}

fn collect_node_text(handle: &Handle, output: &mut String) {
    if let NodeData::Text { contents } = &handle.data {
        output.push_str(&contents.borrow());
        output.push(' ');
    }
    for child in handle.children.borrow().iter() {
        collect_node_text(child, output);
    }
}

fn first_heading(handle: &Handle) -> Option<String> {
    if matches!(
        element_name(handle).as_deref(),
        Some("h1" | "h2" | "h3" | "h4" | "h5" | "h6")
    ) {
        let mut text = String::new();
        collect_node_text(handle, &mut text);
        let text = normalize_text(&text);
        if !text.is_empty() {
            return Some(text);
        }
    }
    for child in handle.children.borrow().iter() {
        if let Some(title) = first_heading(child) {
            return Some(title);
        }
    }
    None
}

fn xhtml_to_text(bytes: &[u8]) -> Result<(String, Option<String>), String> {
    let input = String::from_utf8_lossy(bytes);
    let dom = parse_document(RcDom::default(), Default::default()).one(input.as_ref());
    let title = first_heading(&dom.document);
    let mut text = String::new();
    append_xhtml_text(&dom.document, &mut text);
    let text = text
        .lines()
        .map(normalize_text)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if text.is_empty() {
        return Err("EPUB chapter has no readable text".to_string());
    }
    Ok((text, title))
}

fn find_first_element(handle: &Handle, names: &[&str]) -> Option<Handle> {
    if element_name(handle)
        .as_deref()
        .is_some_and(|name| names.contains(&name))
    {
        return Some(handle.clone());
    }
    handle
        .children
        .borrow()
        .iter()
        .find_map(|child| find_first_element(child, names))
}

fn append_web_text(handle: &Handle, output: &mut String) {
    let name = element_name(handle);
    if matches!(
        name.as_deref(),
        Some(
            "script"
                | "style"
                | "head"
                | "nav"
                | "header"
                | "footer"
                | "aside"
                | "form"
                | "noscript"
                | "svg"
        )
    ) {
        return;
    }
    let is_block = matches!(
        name.as_deref(),
        Some(
            "p" | "div"
                | "li"
                | "br"
                | "tr"
                | "section"
                | "article"
                | "h1"
                | "h2"
                | "h3"
                | "h4"
                | "h5"
                | "h6"
        )
    );
    if is_block && !output.is_empty() {
        output.push('\n');
    }
    if let NodeData::Text { contents } = &handle.data {
        output.push_str(&contents.borrow());
    }
    for child in handle.children.borrow().iter() {
        append_web_text(child, output);
    }
    if is_block {
        output.push('\n');
    }
}

fn html_to_main_text(bytes: &[u8]) -> Result<(String, Option<String>), String> {
    let input = String::from_utf8_lossy(bytes);
    let dom = parse_document(RcDom::default(), Default::default()).one(input.as_ref());
    let root = find_first_element(&dom.document, &["article"])
        .or_else(|| find_first_element(&dom.document, &["main"]))
        .or_else(|| find_first_element(&dom.document, &["body"]))
        .unwrap_or_else(|| dom.document.clone());
    let title = first_heading(&root).or_else(|| first_heading(&dom.document));
    let mut text = String::new();
    append_web_text(&root, &mut text);
    let text = text
        .lines()
        .map(normalize_text)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if text.is_empty() {
        return Err("网页没有可保存的正文，未创建素材".to_string());
    }
    Ok((text, title))
}

#[tauri::command]
pub fn preview_web_material(source_url: String) -> Result<WebMaterialPreview, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(Policy::limited(5))
        .build()
        .map_err(|error| format!("无法创建网页请求: {error}"))?;
    preview_web_material_with_client(source_url, &client)
}

fn preview_web_material_with_client(
    source_url: String,
    client: &Client,
) -> Result<WebMaterialPreview, String> {
    let url = Url::parse(source_url.trim()).map_err(|_| "网页地址无效".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("仅支持 http 和 https 网页地址".to_string());
    }
    let source_name = url.host_str().unwrap_or("网页来源").to_string();
    let mut response = client
        .get(url)
        .send()
        .map_err(|error| format!("网页请求失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("网页请求失败，状态码 {}", response.status()));
    }
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !content_type.starts_with("text/html") && !content_type.starts_with("text/plain") {
        return Err("网页响应不是 HTML 或纯文本，未创建素材".to_string());
    }
    if response
        .content_length()
        .is_some_and(|size| size as usize > MAX_WEB_RESPONSE_BYTES)
    {
        return Err("网页响应超过 5MB 限制，未创建素材".to_string());
    }
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take((MAX_WEB_RESPONSE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("读取网页响应失败: {error}"))?;
    if bytes.len() > MAX_WEB_RESPONSE_BYTES {
        return Err("网页响应超过 5MB 限制，未创建素材".to_string());
    }
    let (content, heading) = if content_type.starts_with("text/html") {
        html_to_main_text(&bytes)?
    } else {
        (String::from_utf8_lossy(&bytes).trim().to_string(), None)
    };
    if content.is_empty() {
        return Err("网页没有可保存的正文，未创建素材".to_string());
    }
    Ok(WebMaterialPreview {
        title: heading.unwrap_or_else(|| source_name.clone()),
        source_name,
        source_url,
        content,
    })
}

fn parse_epub(source: &SourceFile) -> Result<ParsedDocument, String> {
    let mut archive = ZipArchive::new(Cursor::new(source.bytes.as_slice()))
        .map_err(|error| format!("Failed to open EPUB archive: {error}"))?;
    validate_archive(&mut archive)?;
    if archive.by_name("META-INF/encryption.xml").is_ok() {
        return Err("Encrypted or DRM-protected EPUB files are not supported".to_string());
    }
    let opf_path = parse_container(&archive_file(&mut archive, "META-INF/container.xml")?)?;
    archive_member_path(&opf_path)?;
    let package = parse_opf(&archive_file(&mut archive, &opf_path)?)?;
    let mut nav_titles = match package.nav_href.as_deref() {
        Some(href) => {
            let nav_path = resolve_archive_path(&opf_path, href)?;
            parse_nav_titles(&archive_file(&mut archive, &nav_path)?, &nav_path)?
        }
        None => HashMap::new(),
    };
    if nav_titles.is_empty() {
        if let Some(href) = package.ncx_href.as_deref() {
            let ncx_path = resolve_archive_path(&opf_path, href)?;
            nav_titles = parse_ncx_titles(&archive_file(&mut archive, &ncx_path)?, &ncx_path)?;
        }
    }
    let mut sections = Vec::new();
    for (order, idref) in package.spine.iter().enumerate() {
        let item = package
            .manifest
            .get(idref)
            .ok_or_else(|| "EPUB spine references a missing manifest item".to_string())?;
        if !item.media_type.contains("html")
            && !item.href.ends_with(".xhtml")
            && !item.href.ends_with(".html")
        {
            continue;
        }
        let content_path = resolve_archive_path(&opf_path, &item.href)?;
        let chapter_bytes = archive_file(&mut archive, &content_path)?;
        let Ok((content, heading)) = xhtml_to_text(&chapter_bytes) else {
            continue;
        };
        sections.push(ParsedSection {
            title: nav_titles
                .get(&content_path)
                .cloned()
                .or(heading)
                .unwrap_or_else(|| format!("Section {}", order + 1)),
            content,
        });
    }
    if sections.is_empty() {
        return Err("EPUB spine has no readable XHTML content".to_string());
    }
    let fallback = Path::new(&source.name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled document");
    Ok(ParsedDocument {
        format: MaterialDocumentFormat::Epub,
        title: if package.title.is_empty() {
            fallback.to_string()
        } else {
            package.title
        },
        author: package.author,
        sections,
        detected_encoding: None,
        raw_text: None,
    })
}

fn parse_source(source: &SourceFile) -> Result<ParsedDocument, String> {
    match source.extension.as_str() {
        "txt" => {
            let decoded = decode_txt(&source.bytes)?;
            let sections = split_txt_sections(&decoded.content);
            if sections.is_empty() {
                return Err("TXT file has no readable content".to_string());
            }
            let title = Path::new(&source.name)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Untitled document")
                .to_string();
            Ok(ParsedDocument {
                format: MaterialDocumentFormat::Txt,
                title,
                author: String::new(),
                sections,
                detected_encoding: Some(decoded.encoding),
                raw_text: Some(decoded.content),
            })
        }
        "epub" => parse_epub(source),
        _ => Err("Unsupported document format".to_string()),
    }
}

fn preview(source: &SourceFile, parsed: &ParsedDocument) -> MaterialDocumentImportPreview {
    MaterialDocumentImportPreview {
        file_name: source.name.clone(),
        format: parsed.format.clone(),
        title: parsed.title.clone(),
        author: parsed.author.clone(),
        detected_encoding: parsed.detected_encoding.clone(),
        sections: parsed
            .sections
            .iter()
            .enumerate()
            .map(|(order, section)| MaterialDocumentSectionPreview {
                order,
                title: section.title.clone(),
                character_count: section.content.chars().count(),
                content_preview: section.content.chars().take(120).collect(),
            })
            .collect(),
    }
}

fn apply_import_options(
    mut parsed: ParsedDocument,
    options: MaterialDocumentImportOptions,
) -> Result<ParsedDocument, String> {
    if let Some(title) = options.title {
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 200 {
            return Err("Document title must contain 1 to 200 characters".to_string());
        }
        parsed.title = title.to_string();
    }
    if let Some(author) = options.author {
        if author.chars().count() > 200 {
            return Err("Document author cannot exceed 200 characters".to_string());
        }
        parsed.author = author.trim().to_string();
    }
    if parsed.format != MaterialDocumentFormat::Txt {
        if options.txt_mode.is_some() || !options.txt_section_edits.is_empty() {
            return Err("TXT import options cannot be applied to an EPUB".to_string());
        }
        return Ok(parsed);
    }

    match options.txt_mode.unwrap_or(TxtImportMode::DetectedSections) {
        TxtImportMode::Single => {
            let content = parsed
                .raw_text
                .as_deref()
                .map(str::trim)
                .filter(|content| !content.is_empty())
                .ok_or_else(|| "TXT file has no readable content".to_string())?;
            parsed.sections = vec![ParsedSection {
                title: "全文".to_string(),
                content: content.to_string(),
            }];
        }
        TxtImportMode::DetectedSections => {
            if options.txt_section_edits.is_empty() {
                return Ok(parsed);
            }
            if options.txt_section_edits.len() != parsed.sections.len() {
                return Err("TXT chapter adjustments no longer match the preview".to_string());
            }
            let mut adjusted: Vec<ParsedSection> = Vec::new();
            for (expected_order, (section, edit)) in parsed
                .sections
                .into_iter()
                .zip(options.txt_section_edits)
                .enumerate()
            {
                if edit.order != expected_order {
                    return Err("TXT chapter adjustments are out of order".to_string());
                }
                let title = edit.title.trim();
                if title.is_empty() || title.chars().count() > 200 {
                    return Err("TXT chapter titles must contain 1 to 200 characters".to_string());
                }
                if edit.merge_with_previous {
                    let previous = adjusted
                        .last_mut()
                        .ok_or_else(|| "The first TXT section cannot merge backward".to_string())?;
                    previous.content.push_str("\n\n");
                    previous.content.push_str(title);
                    previous.content.push('\n');
                    previous.content.push_str(&section.content);
                } else {
                    adjusted.push(ParsedSection {
                        title: title.to_string(),
                        content: section.content,
                    });
                }
            }
            parsed.sections = adjusted;
        }
    }
    if parsed.sections.is_empty() {
        return Err("Document has no sections after applying import options".to_string());
    }
    Ok(parsed)
}

fn atomic_write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid document path: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    let temp = parent.join(format!(".{}.document.tmp", Uuid::new_v4()));
    let mut file = File::create(&temp)
        .map_err(|error| format!("Failed to create temporary document file: {error}"))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Failed to persist temporary document file: {error}"))?;
    drop(file);
    fs::rename(&temp, path).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("Failed to commit document file {}: {error}", path.display())
    })
}

fn write_attachment(
    root: &Path,
    document_id: &str,
    attachment_id: &str,
    source: &SourceFile,
) -> Result<MaterialAttachment, String> {
    let stored_name = format!("{attachment_id}.{}", source.extension);
    let relative_path = format!("attachments/documents/{document_id}/{stored_name}");
    let path = attachment_dir(root, document_id).join(&stored_name);
    atomic_write_bytes(&path, &source.bytes)?;
    Ok(MaterialAttachment {
        id: attachment_id.to_string(),
        owner_type: "document".to_string(),
        owner_id: document_id.to_string(),
        original_name: source.name.clone(),
        stored_name,
        mime_type: match source.extension.as_str() {
            "txt" => "text/plain",
            "epub" => "application/epub+zip",
            _ => "application/octet-stream",
        }
        .to_string(),
        size: source.bytes.len(),
        relative_path,
        created_at: now_iso(),
    })
}

fn rollback_import(
    root: &Path,
    document_id: &str,
    attachment_id: &str,
) -> Result<FileCleanupResult, String> {
    queue_file_cleanup(
        root,
        "rollback_material_document_import",
        vec![
            document_item_path(root, document_id),
            attachment_metadata_path(root, attachment_id),
            document_sections_dir(root, document_id),
            attachment_dir(root, document_id),
        ],
    )
}

fn to_summary(document: &MaterialDocument) -> MaterialDocumentSummary {
    MaterialDocumentSummary {
        id: document.id.clone(),
        title: document.title.clone(),
        author: document.author.clone(),
        format: document.format.clone(),
        scope: document.scope.clone(),
        project_ids: document.project_ids.clone(),
        section_count: document.section_ids.len(),
        updated_at: document.updated_at.clone(),
    }
}

fn search_snippet(content: &str, query: &str) -> String {
    let lower = content.to_lowercase();
    let Some(byte_index) = lower.find(query) else {
        return content.chars().take(140).collect();
    };
    let character_index = lower[..byte_index].chars().count();
    let start = character_index.saturating_sub(40);
    content.chars().skip(start).take(160).collect()
}

#[tauri::command]
pub fn preview_material_document_import(
    source_path: String,
) -> Result<MaterialDocumentImportPreview, String> {
    let source = source_file(&source_path)?;
    let parsed = parse_source(&source)?;
    Ok(preview(&source, &parsed))
}

#[tauri::command]
pub fn import_material_document(
    app_handle: tauri::AppHandle,
    source_path: String,
    scope: MaterialScope,
    project_ids: Vec<String>,
    options: Option<MaterialDocumentImportOptions>,
) -> Result<MaterialDocument, String> {
    let source = source_file(&source_path)?;
    let parsed = apply_import_options(parse_source(&source)?, options.unwrap_or_default())?;
    let project_ids = validate_scope(&scope, &project_ids)?;
    let root = materials_dir(&app_handle)?;
    let mut state = lock_document_state()?;
    ensure_document_state(&mut state, &root)?;

    let document_id = Uuid::new_v4().to_string();
    let attachment_id = Uuid::new_v4().to_string();
    let now = now_iso();
    let sections = parsed
        .sections
        .iter()
        .enumerate()
        .map(|(order, section)| {
            let id = Uuid::new_v4().to_string();
            MaterialDocumentSection {
                relative_path: section_relative_path(&document_id, &id),
                id,
                document_id: document_id.clone(),
                order,
                title: section.title.trim().to_string(),
                character_count: section.content.chars().count(),
            }
        })
        .collect::<Vec<_>>();
    let document = MaterialDocument {
        schema_version: DOCUMENT_SCHEMA_VERSION,
        id: document_id.clone(),
        title: parsed.title.trim().to_string(),
        author: parsed.author.trim().to_string(),
        format: parsed.format.clone(),
        attachment_id: attachment_id.clone(),
        scope,
        project_ids,
        section_ids: sections.iter().map(|section| section.id.clone()).collect(),
        created_at: now.clone(),
        updated_at: now,
    };
    if document.title.is_empty() {
        return Err("Document title cannot be empty".to_string());
    }
    let record = MaterialDocumentRecord {
        document: document.clone(),
        sections: sections.clone(),
    };
    let result = (|| {
        let attachment = write_attachment(&root, &document_id, &attachment_id, &source)?;
        for (section, parsed_section) in sections.iter().zip(&parsed.sections) {
            atomic_write_bytes(
                &section_path(&root, &document_id, &section.id),
                parsed_section.content.as_bytes(),
            )?;
        }
        atomic_write_json(
            &attachment_metadata_path(&root, &attachment_id),
            &attachment,
        )?;
        atomic_write_json(&document_item_path(&root, &document_id), &record)?;
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        return Err(match rollback_import(&root, &document_id, &attachment_id) {
            Ok(result) if result.cleanup_pending => {
                format!("{error}; import remnants were queued for cleanup retry")
            }
            Ok(_) => error,
            Err(cleanup_error) => {
                format!("{error}; failed to record import rollback: {cleanup_error}")
            }
        });
    }
    state.documents.insert(
        document_id,
        IndexedMaterialDocument {
            section_search_text: parsed
                .sections
                .iter()
                .zip(&sections)
                .map(|(parsed_section, section)| {
                    (section.id.clone(), parsed_section.content.to_lowercase())
                })
                .collect(),
            record,
        },
    );
    Ok(document)
}

#[tauri::command]
pub fn list_material_documents(
    app_handle: tauri::AppHandle,
    project_id: Option<String>,
    page: usize,
    page_size: usize,
) -> Result<MaterialDocumentPage, String> {
    if let Some(project_id) = project_id.as_deref() {
        validate_uuid(project_id, "project id")?;
    }
    let root = materials_dir(&app_handle)?;
    let mut state = lock_document_state()?;
    ensure_document_state(&mut state, &root)?;
    let page = page.max(1);
    let page_size = page_size.clamp(1, MAX_SEARCH_RESULTS);
    let mut documents = state
        .documents
        .values()
        .filter(|indexed| visible_to_project(&indexed.record.document, project_id.as_deref()))
        .map(|indexed| to_summary(&indexed.record.document))
        .collect::<Vec<_>>();
    documents.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    let total_items = documents.len();
    let total_pages = total_items.div_ceil(page_size).max(1);
    let start = (page - 1).saturating_mul(page_size);
    let items = documents.into_iter().skip(start).take(page_size).collect();
    Ok(MaterialDocumentPage {
        items,
        page,
        page_size,
        total_items,
        total_pages,
    })
}

#[tauri::command]
pub fn get_material_document(
    app_handle: tauri::AppHandle,
    document_id: String,
) -> Result<MaterialDocumentDetail, String> {
    validate_uuid(&document_id, "document id")?;
    let root = materials_dir(&app_handle)?;
    let mut state = lock_document_state()?;
    ensure_document_state(&mut state, &root)?;
    state
        .documents
        .get(&document_id)
        .map(|indexed| MaterialDocumentDetail {
            document: indexed.record.document.clone(),
            sections: indexed.record.sections.clone(),
        })
        .ok_or_else(|| "Document not found".to_string())
}

#[tauri::command]
pub fn get_material_document_source_status(
    app_handle: tauri::AppHandle,
    document_id: String,
    section_id: Option<String>,
) -> Result<MaterialDocumentSourceStatus, String> {
    validate_uuid(&document_id, "document id")?;
    if let Some(section_id) = section_id.as_deref() {
        validate_uuid(section_id, "section id")?;
    }
    let root = materials_dir(&app_handle)?;
    let mut state = lock_document_state()?;
    ensure_document_state(&mut state, &root)?;
    let Some(indexed) = state.documents.get(&document_id) else {
        return Ok(MaterialDocumentSourceStatus {
            document_exists: false,
            section_exists: false,
        });
    };
    Ok(MaterialDocumentSourceStatus {
        document_exists: true,
        section_exists: section_id.is_none_or(|section_id| {
            indexed
                .record
                .sections
                .iter()
                .any(|section| section.id == section_id)
        }),
    })
}

#[tauri::command]
pub fn read_material_document_section(
    app_handle: tauri::AppHandle,
    document_id: String,
    section_id: String,
) -> Result<MaterialDocumentSectionContent, String> {
    validate_uuid(&document_id, "document id")?;
    validate_uuid(&section_id, "section id")?;
    let root = materials_dir(&app_handle)?;
    let mut state = lock_document_state()?;
    ensure_document_state(&mut state, &root)?;
    let indexed = state
        .documents
        .get(&document_id)
        .ok_or_else(|| "Document not found".to_string())?;
    let section = indexed
        .record
        .sections
        .iter()
        .find(|section| section.id == section_id)
        .cloned()
        .ok_or_else(|| "Document section not found".to_string())?;
    let content = fs::read_to_string(section_path(&root, &document_id, &section_id))
        .map_err(|error| format!("Failed to read document section: {error}"))?;
    Ok(MaterialDocumentSectionContent {
        document: indexed.record.document.clone(),
        section,
        content,
    })
}

#[tauri::command]
pub fn search_material_document_sections(
    app_handle: tauri::AppHandle,
    query: String,
    project_id: Option<String>,
    limit: usize,
) -> Result<Vec<MaterialDocumentSearchResult>, String> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if let Some(project_id) = project_id.as_deref() {
        validate_uuid(project_id, "project id")?;
    }
    let root = materials_dir(&app_handle)?;
    let mut state = lock_document_state()?;
    ensure_document_state(&mut state, &root)?;
    let mut results = Vec::new();
    for indexed in state.documents.values() {
        if !visible_to_project(&indexed.record.document, project_id.as_deref()) {
            continue;
        }
        for section in &indexed.record.sections {
            let Some(search_text) = indexed.section_search_text.get(&section.id) else {
                continue;
            };
            let occurrences = search_text.matches(&query).count();
            if occurrences == 0 {
                continue;
            }
            let content = fs::read_to_string(section_path(
                &root,
                &indexed.record.document.id,
                &section.id,
            ))
            .map_err(|error| format!("Failed to read section for search: {error}"))?;
            results.push(MaterialDocumentSearchResult {
                document_id: indexed.record.document.id.clone(),
                section_id: section.id.clone(),
                document_title: indexed.record.document.title.clone(),
                section_title: section.title.clone(),
                snippet: search_snippet(&content, &query),
                score: occurrences as f64,
            });
        }
    }
    results.sort_by(|left, right| right.score.total_cmp(&left.score));
    results.truncate(limit.clamp(1, MAX_SEARCH_RESULTS));
    Ok(results)
}

#[tauri::command]
pub fn delete_material_document(
    app_handle: tauri::AppHandle,
    document_id: String,
) -> Result<FileCleanupResult, String> {
    validate_uuid(&document_id, "document id")?;
    let root = materials_dir(&app_handle)?;
    let mut state = lock_document_state()?;
    ensure_document_state(&mut state, &root)?;
    delete_material_document_from_state(&root, &mut state, &document_id)
}

fn delete_material_document_from_state(
    root: &Path,
    state: &mut MaterialDocumentState,
    document_id: &str,
) -> Result<FileCleanupResult, String> {
    let indexed = state
        .documents
        .get(document_id)
        .cloned()
        .ok_or_else(|| "Document not found".to_string())?;
    let result = queue_file_cleanup(
        root,
        "delete_material_document",
        vec![
            document_item_path(root, document_id),
            attachment_metadata_path(root, &indexed.record.document.attachment_id),
            document_sections_dir(root, document_id),
            attachment_dir(root, document_id),
        ],
    )?;
    state.documents.remove(document_id);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;
    use std::time::Duration;

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!("ai-novel-document-test-{}", Uuid::new_v4()))
    }

    fn build_epub(entries: &[(&str, &str)]) -> SourceFile {
        let cursor = Cursor::new(Vec::new());
        let mut archive = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default();
        for (name, content) in entries {
            archive.start_file(*name, options).unwrap();
            archive.write_all(content.as_bytes()).unwrap();
        }
        SourceFile {
            name: "fixture.epub".to_string(),
            extension: "epub".to_string(),
            bytes: archive.finish().unwrap().into_inner(),
        }
    }

    fn serve_once(response: Vec<u8>, delay: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request);
            if !delay.is_zero() {
                thread::sleep(delay);
            }
            let _ = stream.write_all(&response);
        });
        format!("http://{address}")
    }

    #[test]
    fn detects_txt_chapters_and_keeps_intro() {
        let sections = split_txt_sections("序章\n雨落。\n\n第一章\n出发。\n\n第二章\n归来。");
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].title, "全文");
        assert_eq!(sections[1].title, "第一章");
    }

    #[test]
    fn extracts_xhtml_text_without_markup() {
        let (text, title) = xhtml_to_text(b"<html><body><h1>One</h1><p>Hello <em>world</em>.</p><script>bad()</script></body></html>").unwrap();
        assert_eq!(title.as_deref(), Some("One"));
        assert!(text.contains("Hello world."));
        assert!(!text.contains("bad()"));
    }

    #[test]
    fn rejects_archive_path_traversal() {
        assert!(archive_member_path("OPS/../secret").is_err());
        assert!(resolve_archive_path("OPS/package.opf", "../../secret").is_err());
    }

    fn sample_epub() -> SourceFile {
        let cursor = Cursor::new(Vec::new());
        let mut archive = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default();
        for (name, content) in [
            (
                "META-INF/container.xml",
                r#"<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>"#,
            ),
            (
                "OPS/book.opf",
                r#"<?xml version="1.0"?><package><metadata><dc:title xmlns:dc="urn:dc">测试书</dc:title><dc:creator xmlns:dc="urn:dc">作者</dc:creator></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="text/two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>"#,
            ),
            (
                "OPS/nav.xhtml",
                r#"<html><body><nav><a href="text/one.xhtml">第一章</a><a href="text/two.xhtml">第二章</a></nav></body></html>"#,
            ),
            (
                "OPS/text/one.xhtml",
                "<html><body><h1>错误标题</h1><p>第一章正文。</p></body></html>",
            ),
            (
                "OPS/text/two.xhtml",
                "<html><body><h1>第二章</h1><p>第二章正文。</p></body></html>",
            ),
        ] {
            archive.start_file(name, options).unwrap();
            archive.write_all(content.as_bytes()).unwrap();
        }
        SourceFile {
            name: "sample.epub".to_string(),
            extension: "epub".to_string(),
            bytes: archive.finish().unwrap().into_inner(),
        }
    }

    #[test]
    fn parses_epub_metadata_navigation_and_spine() {
        let parsed = parse_epub(&sample_epub()).unwrap();
        assert_eq!(parsed.title, "测试书");
        assert_eq!(parsed.author, "作者");
        assert_eq!(parsed.sections.len(), 2);
        assert_eq!(parsed.sections[0].title, "第一章");
        assert!(parsed.sections[0].content.contains("第一章正文"));
        assert_eq!(parsed.sections[1].title, "第二章");
    }

    #[test]
    fn decodes_utf16_txt_and_rejects_invalid_epub() {
        let utf16 = [0xFF, 0xFE, 0x2C, 0x7B, 0x00, 0x4E];
        let decoded = decode_txt(&utf16).unwrap();
        assert_eq!(decoded.content, "第一");
        assert_eq!(decoded.encoding, "UTF-16LE");
        let broken = SourceFile {
            name: "broken.epub".to_string(),
            extension: "epub".to_string(),
            bytes: b"not a zip".to_vec(),
        };
        assert!(parse_epub(&broken).is_err());
    }

    #[test]
    fn txt_preview_reports_gb18030_and_supports_adjusted_or_single_import() {
        let decoded = decode_txt(&[0x95, 0x34, 0xb2, 0x35]).unwrap();
        assert_eq!(decoded.content, "𠮷");
        assert_eq!(decoded.encoding, "GB18030 / GBK");

        let source = SourceFile {
            name: "novel.txt".to_string(),
            extension: "txt".to_string(),
            bytes: "序言\n第一章 起点\n正文一\n第二章 归途\n正文二"
                .as_bytes()
                .to_vec(),
        };
        let parsed = parse_source(&source).unwrap();
        assert_eq!(parsed.sections.len(), 3);
        assert_eq!(parsed.detected_encoding.as_deref(), Some("UTF-8"));
        let adjusted = apply_import_options(
            parsed.clone(),
            MaterialDocumentImportOptions {
                txt_mode: Some(TxtImportMode::DetectedSections),
                txt_section_edits: vec![
                    TxtSectionEdit {
                        order: 0,
                        title: "前言".to_string(),
                        merge_with_previous: false,
                    },
                    TxtSectionEdit {
                        order: 1,
                        title: "第一章".to_string(),
                        merge_with_previous: false,
                    },
                    TxtSectionEdit {
                        order: 2,
                        title: "第二章".to_string(),
                        merge_with_previous: true,
                    },
                ],
                ..MaterialDocumentImportOptions::default()
            },
        )
        .unwrap();
        assert_eq!(adjusted.sections.len(), 2);
        assert!(adjusted.sections[1].content.contains("第二章\n正文二"));

        let single = apply_import_options(
            parsed,
            MaterialDocumentImportOptions {
                txt_mode: Some(TxtImportMode::Single),
                ..MaterialDocumentImportOptions::default()
            },
        )
        .unwrap();
        assert_eq!(single.sections.len(), 1);
        assert!(single.sections[0].content.contains("第二章 归途"));
    }

    #[test]
    fn source_file_rejects_unsupported_empty_and_oversized_documents() {
        let root = test_root();
        fs::create_dir_all(&root).unwrap();
        for extension in ["mobi", "azw", "azw3", "kfx"] {
            let path = root.join(format!("book.{extension}"));
            fs::write(&path, b"unsupported").unwrap();
            let error = source_file(path.to_str().unwrap()).unwrap_err();
            assert!(error.contains("not supported"));
        }
        let empty = root.join("empty.txt");
        fs::write(&empty, []).unwrap();
        assert!(source_file(empty.to_str().unwrap()).is_err());
        let oversized = root.join("oversized.txt");
        File::create(&oversized)
            .unwrap()
            .set_len(MAX_DOCUMENT_BYTES as u64 + 1)
            .unwrap();
        assert!(source_file(oversized.to_str().unwrap()).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn epub_supports_ncx_nested_paths_empty_spine_and_malformed_html() {
        let source = build_epub(&[
            (
                "META-INF/container.xml",
                r#"<container><rootfiles><rootfile full-path="OPS/package/book.opf"/></rootfiles></container>"#,
            ),
            (
                "OPS/package/book.opf",
                r#"<package><metadata><dc:title xmlns:dc="urn:dc">NCX Book</dc:title></metadata><manifest><item id="ncx" href="../toc/book.ncx" media-type="application/x-dtbncx+xml"/><item id="empty" href="text/empty.xhtml" media-type="application/xhtml+xml"/><item id="one" href="text/one.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="empty"/><itemref idref="one"/></spine></package>"#,
            ),
            (
                "OPS/toc/book.ncx",
                r#"<ncx><navMap><navPoint><navLabel><text>目录标题</text></navLabel><content src="../package/text/one.xhtml#start"/></navPoint></navMap></ncx>"#,
            ),
            ("OPS/package/text/empty.xhtml", "<html><body></body></html>"),
            (
                "OPS/package/text/one.xhtml",
                "<html><body><h1>破损但可恢复<p>正文 & 未闭合标签</body></html>",
            ),
        ]);
        let parsed = parse_epub(&source).unwrap();
        assert_eq!(parsed.sections.len(), 1);
        assert_eq!(parsed.sections[0].title, "目录标题");
        assert!(parsed.sections[0].content.contains("正文"));
    }

    #[test]
    fn epub_rejects_encryption_and_oversized_entries() {
        let encrypted = build_epub(&[
            (
                "META-INF/container.xml",
                r#"<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>"#,
            ),
            ("META-INF/encryption.xml", "<encryption/>"),
            (
                "book.opf",
                r#"<package><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/></spine></package>"#,
            ),
            ("one.xhtml", "<html><body>text</body></html>"),
        ]);
        assert!(parse_epub(&encrypted).unwrap_err().contains("Encrypted"));

        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        writer
            .start_file("large.xhtml", zip::write::SimpleFileOptions::default())
            .unwrap();
        writer
            .write_all(&vec![b'x'; MAX_ARCHIVE_ENTRY_BYTES as usize + 1])
            .unwrap();
        let bytes = writer.finish().unwrap().into_inner();
        let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
        assert!(validate_archive(&mut archive)
            .unwrap_err()
            .contains("entry"));
    }

    #[test]
    fn webpage_extraction_prefers_article_and_enforces_response_contract() {
        let html = b"<html><body><nav>ignore nav</nav><article><h1>Article</h1><p>Main text</p></article><footer>ignore footer</footer></body></html>";
        let mut response = b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: ".to_vec();
        response.extend_from_slice(html.len().to_string().as_bytes());
        response.extend_from_slice(b"\r\n\r\n");
        response.extend_from_slice(html);
        let client = Client::builder()
            .redirect(Policy::limited(5))
            .build()
            .unwrap();
        let preview =
            preview_web_material_with_client(serve_once(response, Duration::ZERO), &client)
                .unwrap();
        assert_eq!(preview.title, "Article");
        assert!(preview.content.contains("Main text"));
        assert!(!preview.content.contains("ignore"));

        let wrong_type = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".to_vec();
        assert!(
            preview_web_material_with_client(serve_once(wrong_type, Duration::ZERO), &client)
                .is_err()
        );
        let too_large = format!("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", MAX_WEB_RESPONSE_BYTES + 1).into_bytes();
        assert!(
            preview_web_material_with_client(serve_once(too_large, Duration::ZERO), &client)
                .is_err()
        );
        let empty = b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec();
        assert!(
            preview_web_material_with_client(serve_once(empty, Duration::ZERO), &client).is_err()
        );
        assert!(preview_web_material_with_client("file:///tmp/a".to_string(), &client).is_err());
    }

    #[test]
    fn webpage_enforces_streaming_limit_redirect_limit_and_timeout() {
        let mut streaming =
            b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n".to_vec();
        streaming.extend(std::iter::repeat_n(b'x', MAX_WEB_RESPONSE_BYTES + 1));
        let client = Client::builder()
            .redirect(Policy::limited(5))
            .build()
            .unwrap();
        assert!(
            preview_web_material_with_client(serve_once(streaming, Duration::ZERO), &client)
                .is_err()
        );

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        thread::spawn(move || {
            for _ in 0..6 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0_u8; 1024];
                let _ = stream.read(&mut request);
                let response = format!("HTTP/1.1 302 Found\r\nLocation: http://{address}/next\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                let _ = stream.write_all(response.as_bytes());
            }
        });
        assert!(
            preview_web_material_with_client(format!("http://{address}/start"), &client).is_err()
        );

        let timeout_client = Client::builder()
            .timeout(Duration::from_millis(40))
            .redirect(Policy::limited(5))
            .build()
            .unwrap();
        let slow = b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 4\r\nConnection: close\r\n\r\nslow".to_vec();
        assert!(preview_web_material_with_client(
            serve_once(slow, Duration::from_millis(150)),
            &timeout_client
        )
        .is_err());
    }

    #[test]
    fn cold_document_index_rebuilds_and_reports_corrupt_sections() {
        let root = test_root();
        initialize_document_structure(&root).unwrap();
        let document_id = Uuid::new_v4().to_string();
        let section_id = Uuid::new_v4().to_string();
        let attachment_id = Uuid::new_v4().to_string();
        let section = MaterialDocumentSection {
            id: section_id.clone(),
            document_id: document_id.clone(),
            order: 0,
            title: "Chapter".to_string(),
            relative_path: section_relative_path(&document_id, &section_id),
            character_count: 7,
        };
        let document = MaterialDocument {
            schema_version: DOCUMENT_SCHEMA_VERSION,
            id: document_id.clone(),
            title: "Book".to_string(),
            author: String::new(),
            format: MaterialDocumentFormat::Txt,
            attachment_id,
            scope: MaterialScope::Global,
            project_ids: Vec::new(),
            section_ids: vec![section_id.clone()],
            created_at: now_iso(),
            updated_at: now_iso(),
        };
        atomic_write_bytes(&section_path(&root, &document_id, &section_id), b"keyword").unwrap();
        atomic_write_json(
            &document_item_path(&root, &document_id),
            &MaterialDocumentRecord {
                document,
                sections: vec![section],
            },
        )
        .unwrap();
        let mut state = MaterialDocumentState::default();
        ensure_document_state(&mut state, &root).unwrap();
        assert_eq!(state.documents.len(), 1);
        assert!(state.documents[&document_id].section_search_text[&section_id].contains("keyword"));

        fs::remove_file(section_path(&root, &document_id, &section_id)).unwrap();
        let mut rebuilt = MaterialDocumentState::default();
        assert!(ensure_document_state(&mut rebuilt, &root).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn parses_real_world_accessible_epub_fixture() {
        let source = SourceFile {
            name: "accessible_epub_3.epub".to_string(),
            extension: "epub".to_string(),
            bytes: include_bytes!("../../tests/fixtures/accessible_epub_3.epub").to_vec(),
        };
        let parsed = parse_epub(&source).unwrap();
        assert!(!parsed.title.trim().is_empty());
        assert!(parsed.sections.len() > 1);
        assert!(
            parsed
                .sections
                .iter()
                .map(|section| section.content.chars().count())
                .sum::<usize>()
                > 1000
        );
    }

    #[test]
    fn document_delete_removes_warm_and_cold_search_index_sources() {
        let root = test_root();
        initialize_document_structure(&root).unwrap();
        let document_id = Uuid::new_v4().to_string();
        let section_id = Uuid::new_v4().to_string();
        let attachment_id = Uuid::new_v4().to_string();
        let section = MaterialDocumentSection {
            id: section_id.clone(),
            document_id: document_id.clone(),
            order: 0,
            title: "Searchable".to_string(),
            relative_path: section_relative_path(&document_id, &section_id),
            character_count: 14,
        };
        let document = MaterialDocument {
            schema_version: DOCUMENT_SCHEMA_VERSION,
            id: document_id.clone(),
            title: "Delete me".to_string(),
            author: String::new(),
            format: MaterialDocumentFormat::Txt,
            attachment_id,
            scope: MaterialScope::Global,
            project_ids: Vec::new(),
            section_ids: vec![section_id.clone()],
            created_at: now_iso(),
            updated_at: now_iso(),
        };
        atomic_write_bytes(
            &section_path(&root, &document_id, &section_id),
            b"unique keyword",
        )
        .unwrap();
        atomic_write_json(
            &document_item_path(&root, &document_id),
            &MaterialDocumentRecord {
                document,
                sections: vec![section],
            },
        )
        .unwrap();
        let mut state = MaterialDocumentState::default();
        ensure_document_state(&mut state, &root).unwrap();
        assert!(
            state.documents[&document_id].section_search_text[&section_id]
                .contains("unique keyword")
        );

        let result = delete_material_document_from_state(&root, &mut state, &document_id).unwrap();
        assert!(!result.cleanup_pending);
        assert!(!state.documents.contains_key(&document_id));
        assert!(!document_item_path(&root, &document_id).exists());
        assert!(!document_sections_dir(&root, &document_id).exists());

        let mut rebuilt = MaterialDocumentState::default();
        ensure_document_state(&mut rebuilt, &root).unwrap();
        assert!(rebuilt.documents.is_empty());
        let _ = fs::remove_dir_all(root);
    }
}
