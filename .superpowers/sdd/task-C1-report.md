# Task C1 Report — SearchPanel Component

## Status: DONE

## Deliverable
- **File:** `src/components/SearchPanel.tsx` (97 lines)
- **Pattern:** Left sidebar (source filter + vector toggle) + right content area (search input + results list)

## Verification
- `npx tsc --noEmit` — **clean** (no errors)

## Commit
```
34f6f83 feat(ui): add SearchPanel component with hybrid search
```

## Component Details
- **State:** query, results, searching, includeVector (checkbox), sourceFilter (sidebar selection)
- **Search:** calls `hybridSearch()` from B5 with optional source filter and vector toggle
- **Results:** renders RRF-scored results using existing CSS classes (`foreshadow-item`, `note-type-badge`, etc.)
- **Source filter** sidebar: all | characters | worldview | chapters | notes | outline | memory
- **Enter key** triggers search; button disabled while searching or with empty query

## Dependencies
- `hybridSearch`, `SearchSource` from `../services/search`
- `SearchResult` from `../api/tauri`
- CSS classes from `src/style.css` (panel-layout, panel-sidebar, foreshadow-item, etc.)

## Concerns
- State type uses `SearchResult & { rrfScore: number }` rather than importing `HybridResult` — functionally equivalent but slightly redundant; `HybridResult` could be imported instead for clarity.
- LF→CRLF warning on commit is cosmetic (Windows git config).
