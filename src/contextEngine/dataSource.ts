// src/contextEngine/dataSource.ts
export interface ContextLoadContext {
  projectId: string
  volume: string
  chapterId: string
  chapterNumber: number
  targetWords: number
}

export interface DataSource<T> {
  name: string
  priority: number  // 1 = highest (most critical), higher = lower priority
  load(ctx: ContextLoadContext): Promise<T>
  fallback?(): T
}

export interface DataSourceResult {
  name: string
  content: string
  priority: number
  error?: string
}

export class DataSourceRegistry {
  private sources: DataSource<unknown>[] = []

  register(source: DataSource<unknown>): void {
    this.sources.push(source)
  }

  registerAll(sources: DataSource<unknown>[]): void {
    for (const s of sources) this.register(s)
  }

  async loadAll(ctx: ContextLoadContext): Promise<DataSourceResult[]> {
    const results = await Promise.allSettled(
      this.sources.map(async (s) => {
        try {
          const content = await s.load(ctx)
          return { name: s.name, content: String(content), priority: s.priority }
        } catch (err) {
          if (s.fallback) {
            try {
              const fallbackContent = s.fallback()
              return { name: s.name, content: String(fallbackContent), priority: s.priority, error: String(err) }
            } catch (fallbackErr) {
              return { name: s.name, content: '', priority: s.priority, error: String(fallbackErr) }
            }
          }
          return { name: s.name, content: '', priority: s.priority, error: String(err) }
        }
      }),
    )
    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<DataSourceResult>).value)
      // Note: filter above narrows to fulfilled; `as` cast is safe here
      .sort((a, b) => a.priority - b.priority)
  }

  /** Deduplicate by name, filter out empty results */
  assemble(results: DataSourceResult[]): DataSourceResult[] {
    const seen = new Set<string>()
    return results
      .filter((r) => { if (seen.has(r.name)) return false; seen.add(r.name); return true })
      .filter((r) => r.content.length > 0)
  }
}
