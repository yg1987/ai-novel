import { chunkMarkdown } from './textChunker'
import { embedChunks } from './embeddings'
import { readResourceFile, vectorUpsertChunks } from '../api/tauri'

/**
 * Chunk, embed, and index a resource file into the vector store
 * so it can be found by hybrid search.
 */
export async function indexResourceFile(
  projectId: string,
  category: string,
  filename: string,
): Promise<void> {
  const content = await readResourceFile(category, filename)
  const pageId = `resources/${category}/${filename}`
  const chunks = chunkMarkdown(content, pageId, { maxChunkChars: 1500 })
  if (chunks.length === 0) return

  const results = await embedChunks(chunks)
  if (!results) return

  await vectorUpsertChunks(projectId, results.map((r) => ({
    chunk_id: r.chunk.chunkId,
    page_id: r.chunk.pageId,
    chunk_index: r.chunk.chunkIndex,
    heading_path: r.chunk.headingPath,
    chunk_text: r.chunk.content,
    embedding: Array.from(r.embedding),
  })))
}
