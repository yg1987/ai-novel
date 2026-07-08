use lancedb::connect;
use lancedb::query::{ExecutableQuery, QueryBase};
use arrow_array::{
    ArrayRef, Float32Array, RecordBatch, StringArray, UInt32Array,
    FixedSizeListArray,
};
use arrow_schema::{DataType, Field, Schema};
use futures::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
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

const TABLE_NAME: &str = "vectors";

fn lancedb_uri(app_handle: &tauri::AppHandle, project_id: &str) -> Result<String, String> {
    let workspace = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let path = workspace.join("projects").join(project_id).join(".lancedb");
    Ok(path.to_string_lossy().replace('\\', "/"))
}

fn make_schema(dim: i32) -> Arc<Schema> {
    Arc::new(Schema::new(vec![
        Field::new("chunk_id", DataType::Utf8, false),
        Field::new("page_id", DataType::Utf8, false),
        Field::new("chunk_index", DataType::UInt32, false),
        Field::new("heading_path", DataType::Utf8, false),
        Field::new("chunk_text", DataType::Utf8, false),
        Field::new(
            "vector",
            DataType::FixedSizeList(
                Arc::new(Field::new("item", DataType::Float32, true)),
                dim,
            ),
            false,
        ),
    ]))
}

fn validate_page_id(page_id: &str) -> Result<(), String> {
    if page_id.contains('\'') || page_id.contains('"') || page_id.contains(';') {
        return Err(format!(
            "Invalid page_id (contains special chars): {page_id}"
        ));
    }
    Ok(())
}

/// Build a RecordBatch from upsert chunks with the given schema.
fn build_batch(chunks: &[ChunkUpsertInput], schema: Arc<Schema>) -> Result<RecordBatch, String> {
    let dim = match schema.column_with_name("vector") {
        Some((_, field)) => match field.data_type() {
            DataType::FixedSizeList(_, d) => *d,
            _ => return Err("vector column is not FixedSizeList".into()),
        },
        None => return Err("schema missing vector column".into()),
    };

    let num_rows = chunks.len();
    let mut chunk_ids = Vec::with_capacity(num_rows);
    let mut page_ids = Vec::with_capacity(num_rows);
    let mut chunk_indices = Vec::with_capacity(num_rows);
    let mut heading_paths = Vec::with_capacity(num_rows);
    let mut chunk_texts = Vec::with_capacity(num_rows);
    let mut flat_vectors = Vec::<f32>::with_capacity(num_rows * dim as usize);

    for chunk in chunks {
        if chunk.embedding.len() as i32 != dim {
            return Err(format!(
                "Embedding dimension mismatch: expected {dim}, got {}",
                chunk.embedding.len()
            ));
        }
        chunk_ids.push(chunk.chunk_id.clone());
        page_ids.push(chunk.page_id.clone());
        chunk_indices.push(chunk.chunk_index);
        heading_paths.push(chunk.heading_path.clone());
        chunk_texts.push(chunk.chunk_text.clone());
        flat_vectors.extend_from_slice(&chunk.embedding);
    }

    let columns: Vec<ArrayRef> = vec![
        Arc::new(StringArray::from(chunk_ids)),
        Arc::new(StringArray::from(page_ids)),
        Arc::new(UInt32Array::from(chunk_indices)),
        Arc::new(StringArray::from(heading_paths)),
        Arc::new(StringArray::from(chunk_texts)),
        Arc::new(
            FixedSizeListArray::new(
                Arc::new(Field::new("item", DataType::Float32, true)),
                dim,
                Arc::new(Float32Array::from(flat_vectors)),
                None,
            ),
        ),
    ];

    RecordBatch::try_new(schema, columns).map_err(|e| format!("Failed to create RecordBatch: {e}"))
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

    let dim = chunks[0].embedding.len() as i32;
    let uri = lancedb_uri(&app_handle, &project_id)?;
    let db = connect(&uri)
        .execute()
        .await
        .map_err(|e| format!("Failed to connect to LanceDB: {e}"))?;

    // Delete existing chunks for affected pages
    let mut page_ids: Vec<&str> = chunks.iter().map(|c| c.page_id.as_str()).collect();
    page_ids.sort();
    page_ids.dedup();

    let schema = make_schema(dim);
    let batch = build_batch(&chunks, schema.clone())?;

    let table_names = db
        .table_names()
        .execute()
        .await
        .map_err(|e| format!("Failed to list tables: {e}"))?;

    if table_names.iter().any(|n| n == TABLE_NAME) {
        let table = db
            .open_table(TABLE_NAME)
            .execute()
            .await
            .map_err(|e| format!("Failed to open table: {e}"))?;

        for pid in &page_ids {
            validate_page_id(pid)?;
            let filter = format!("page_id = '{pid}'");
            let _ = table.delete(&filter).await;
        }

        table
            .add(vec![batch])
            .execute()
            .await
            .map_err(|e| format!("Failed to add chunks: {e}"))?;
    } else {
        // Table doesn't exist yet — create with the first batch
        db.create_table(TABLE_NAME, batch)
            .execute()
            .await
            .map_err(|e| format!("Failed to create table: {e}"))?;
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
    if query_embedding.is_empty() {
        return Ok(vec![]);
    }

    let uri = lancedb_uri(&app_handle, &project_id)?;
    let db = match connect(&uri).execute().await {
        Ok(d) => d,
        Err(_) => return Ok(vec![]),
    };

    let table = match db.open_table(TABLE_NAME).execute().await {
        Ok(t) => t,
        Err(_) => return Ok(vec![]), // Table doesn't exist yet
    };

    let query = table
        .vector_search(query_embedding.as_slice())
        .map_err(|e| format!("Search query error: {e}"))?;

    let mut stream = query
        .limit(top_k)
        .execute()
        .await
        .map_err(|e| format!("Search error: {e}"))?;

    let mut out: Vec<ChunkSearchResult> = Vec::new();

    while let Some(batch) = stream
        .try_next()
        .await
        .map_err(|e| format!("Stream error: {e}"))?
    {
        let chunk_ids = batch
            .column_by_name("chunk_id")
            .and_then(|c| c.as_any().downcast_ref::<StringArray>())
            .ok_or("Missing chunk_id column")?;
        let page_ids = batch
            .column_by_name("page_id")
            .and_then(|c| c.as_any().downcast_ref::<StringArray>())
            .ok_or("Missing page_id column")?;
        let chunk_indices = batch
            .column_by_name("chunk_index")
            .and_then(|c| c.as_any().downcast_ref::<UInt32Array>())
            .ok_or("Missing chunk_index column")?;
        let chunk_texts = batch
            .column_by_name("chunk_text")
            .and_then(|c| c.as_any().downcast_ref::<StringArray>())
            .ok_or("Missing chunk_text column")?;
        let heading_paths = batch
            .column_by_name("heading_path")
            .and_then(|c| c.as_any().downcast_ref::<StringArray>())
            .ok_or("Missing heading_path column")?;
        let distances = batch
            .column_by_name("_distance")
            .and_then(|c| c.as_any().downcast_ref::<Float32Array>())
            .ok_or("Missing _distance column")?;

        for i in 0..batch.num_rows() {
            let distance = distances.value(i);
            out.push(ChunkSearchResult {
                chunk_id: chunk_ids.value(i).to_string(),
                page_id: page_ids.value(i).to_string(),
                chunk_index: chunk_indices.value(i),
                chunk_text: chunk_texts.value(i).to_string(),
                heading_path: heading_paths.value(i).to_string(),
                score: 1.0 / (1.0 + distance),
            });
        }
    }

    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(out.into_iter().take(top_k).collect())
}
