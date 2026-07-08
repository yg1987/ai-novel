# Task A1: Rust Version History Commands

## File Structure

**Files:**
- Create: src-tauri/src/commands/version.rs
- Modify: src-tauri/src/commands/mod.rs (add pub mod version;)
- Modify: src-tauri/src/lib.rs (register commands, modify save_chapter_content)

**Interfaces:**
- Consumes: project_dir() from lib.rs, 	imestamp() from lib.rs
- Produces: 5 Tauri commands + VersionMeta struct (exported)
- Cross-module: load_index_for_save(path) - public helper called from lib.rs

## Steps

1. Create src-tauri/src/commands/version.rs with VersionMeta struct, VersionIndex struct, path helpers (history_dir, index_path, version_file_path), count_words/count_chars, load_index, save_index
2. Add list_chapter_versions command — reads index, returns sorted(version desc)
3. Add get_chapter_version command — reads specific version file
4. Add restore_chapter_version command — backup current, write restored content
5. Add delete_chapter_version — cannot delete last version; rename_chapter_version
6. Add load_index_for_save(path) — public wrapper for lib.rs
7. Modify save_chapter_content in lib.rs: read existing before write; if non-empty and different: create .history dir, write backup, update _index.json, prune old versions
8. Add pub mod version; and pub mod resource; to commands/mod.rs
9. Register 5 commands in generate_handler![] in lib.rs
10. Build: cd src-tauri && cargo build
11. Commit: eat(version): add chapter version history Rust commands with auto-backup

## Exact Code Reference

See plan file at docs/superpowers/plans/2026-07-08-v04-quality-assurance.md lines 53-375 for the complete Rust code to use verbatim.
