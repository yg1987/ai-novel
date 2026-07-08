### Task B2: Markdown-Aware Text Chunker

**Files:**
- Create: `src/services/textChunker.ts`

**Interfaces:**
- Produces: `Chunk` type with `chunkId`, `pageId`, `chunkIndex`, `headingPath`, `content`
- Exports: `chunkMarkdown(content, pageId, options): Chunk[]`

- [ ] **Step 1: Write text chunker**

```typescript
// src/services/textChunker.ts
export interface Chunk {
  chunkId: string
  pageId: string
  chunkIndex: number
  headingPath: string
  content: string
}

export interface ChunkOptions {
  maxChunkChars?: number
  overlapChars?: number
}

export function chunkMarkdown(
  content: string,
  pageId: string,
  options: ChunkOptions = {},
): Chunk[] {
  const maxChunkChars = options.maxChunkChars ?? 1500
  const overlapChars = options.overlapChars ?? 50

  // Strip YAML frontmatter
  const body = content.replace(/^---[\s\S]*?---\n?/, '').trim()

  // Split by headings
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const sections: { level: number; title: string; content: string }[] = []

  let lastIndex = 0
  let lastLevel = 0
  let lastTitle = ''

  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      sections.push({
        level: lastLevel,
        title: lastTitle,
        content: body.slice(lastIndex, match.index).trim(),
      })
    }
    lastLevel = match[1]!.length
    lastTitle = match[2]!.trim()
    lastIndex = match.index
  }
  // Last section
  if (lastIndex < body.length) {
    sections.push({
      level: lastLevel,
      title: lastTitle,
      content: body.slice(lastIndex).trim(),
    })
  }

  // Build heading path breadcrumbs and chunk
  const chunks: Chunk[] = []
  let chunkIndex = 0
  const headingStack: string[] = []

  for (const section of sections) {
    // Update heading path
    while (headingStack.length >= section.level && headingStack.length > 0) {
      headingStack.pop()
    }
    if (section.title) {
      headingStack.push(section.title)
    }
    const headingPath = headingStack.join(' > ')

    // Split section content into chunks if too long
    const text = section.content
    if (text.length <= maxChunkChars) {
      if (text.length > 0) {
        chunks.push({
          chunkId: `${pageId}#${chunkIndex}`,
          pageId,
          chunkIndex: chunkIndex++,
          headingPath,
          content: text,
        })
      }
    } else {
      const paragraphs = text.split(/\n\n+/)
      let buffer = ''
      for (const para of paragraphs) {
        if (buffer.length + para.length > maxChunkChars && buffer.length > 0) {
          chunks.push({
            chunkId: `${pageId}#${chunkIndex}`,
            pageId,
            chunkIndex: chunkIndex++,
            headingPath,
            content: buffer.trim(),
          })
          buffer = buffer.slice(-overlapChars) + '\n\n' + para
        } else {
          buffer += (buffer ? '\n\n' : '') + para
        }
      }
      if (buffer.trim().length > 0) {
        chunks.push({
          chunkId: `${pageId}#${chunkIndex}`,
          pageId,
          chunkIndex: chunkIndex++,
          headingPath,
          content: buffer.trim(),
        })
      }
    }
  }

  return chunks
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors
