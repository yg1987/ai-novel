### Task B4: Rust Vector Store (LanceDB)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/commands/vectorstore.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/api/tauri.ts`

- [ ] **Step 1: Add dependencies to Cargo.toml**

```toml
# Add to [dependencies] in src-tauri/Cargo.toml
serde_json = "1"   # already present, just confirm
```

No new Rust crate needed — vector embeddings are stored as per-page JSON files. LanceDB integration deferred. The vector store uses simple JSON files + cosine similarity in Rust.

- [ ] **Step 2: Implement vector store commands**

```rust
// src-tauri/src/commands/vectorstore.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

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
        let json = serde_json::to_string_pretty(page_chunks)
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
```

- [ ] **Step 3: Register in mod.rs**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub mod vectorstore;
```

- [ ] **Step 4: Register in lib.rs**

Add to `invoke_handler!` macro:
```rust
commands::vectorstore::vector_upsert_chunks,
commands::vectorstore::vector_search_chunks,
```

- [ ] **Step 5: Add Tauri API bindings**

Add to `src/api/tauri.ts`:
```typescript
export interface ChunkUpsertInput {
  chunk_id: string
  page_id: string
  chunk_index: number
  heading_path: string
  chunk_text: string
  embedding: number[]
}

export interface ChunkSearchResult {
  chunk_id: string
  page_id: string
  chunk_index: number
  chunk_text: string
  heading_path: string
  score: number
}

export async function vectorUpsertChunks(
  projectId: string,
  chunks: ChunkUpsertInput[],
): Promise<void> {
  return invoke('vector_upsert_chunks', { projectId, chunks })
}

export async function vectorSearchChunks(
  projectId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<ChunkSearchResult[]> {
  return invoke<ChunkSearchResult[]>('vector_search_chunks', {
    projectId,
    queryEmbedding,
    topK,
  })
}
```

- [ ] **Step 6: Verify Rust + TypeScript compile**

Run: `cd src-tauri && cargo check`
Then: `npx tsc --noEmit`
Expected: Both pass clean
