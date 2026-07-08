# Task A2: Version History Frontend

## File Structure

**Files:**
- Modify: src/types/review.ts (add VersionMeta type)
- Modify: src/api/tauri.ts (add version API bindings)
- Create: src/components/VersionHistoryPanel.tsx
- Create: src/components/VersionDiffViewer.tsx
- Modify: src/components/ChapterManager.tsx (add version history button/entry)
- Modify: src/style.css (add version + diff CSS)

**Interfaces:**
- Consumes: These new Tauri invoke functions registered in Task A1: list_chapter_versions, get_chapter_version, restore_chapter_version, delete_chapter_version, rename_chapter_version
- Produces: VersionHistoryPanel component, VersionDiffViewer component

## Steps

1. Add VersionMeta type to src/types/review.ts
2. Add API bindings to src/api/tauri.ts: listChapterVersions, getChapterVersion, restoreChapterVersion, deleteChapterVersion, renameChapterVersion
3. Create VersionHistoryPanel.tsx: sidebar with version list + preview pane, CRUD operations
4. Create VersionDiffViewer.tsx: LCS-based diff algorithm, unified/split view
5. Integrate into ChapterManager.tsx: add history button, conditional render
6. Add CSS for version panel and diff viewer
7. LSP diagnostics
8. Commit: feat(version): add version history panel and diff viewer UI

## Exact Code Reference

See plan file docs/superpowers/plans/2026-07-08-v04-quality-assurance.md lines 375-815 for complete code.
