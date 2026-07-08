# Task B2 Report: Markdown-Aware Text Chunker

**Status:** DONE

## Commits

- `fde1779` feat(search): add Markdown-aware text chunker

## Files Created

- `src/services/textChunker.ts` (113 lines)

## Exports

| Export | Type |
|---|---|
| `Chunk` | Interface |
| `ChunkOptions` | Interface |
| `chunkMarkdown()` | Function |

## Implementation Summary

- **`Chunk` interface**: `chunkId`, `pageId`, `chunkIndex`, `headingPath`, `content`
- **`ChunkOptions`**: `maxChunkChars` (default 1500), `overlapChars` (default 50)
- **`chunkMarkdown(content, pageId, options?)`**:
  - Strips YAML frontmatter (`---...---`)
  - Splits by Markdown headings (`#` - `######`)
  - Maintains heading path breadcrumbs (e.g. `"Chapter 1 > Scene 2"`)
  - Paragraph-based overflow splitting with configurable overlap
  - Generates `chunkId` as `{pageId}#{index}`

## Verification

- `npx tsc --noEmit` — clean (no errors)

## Concerns

None.
