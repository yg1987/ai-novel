# Task D1 Report: Rust Stats Commands

**Status:** ✅ Complete
**Commit:** `3849327` — feat(stats): add Rust stats commands for writing event logging

## Summary

Implemented two Tauri commands for writing statistics: `append_stat_event` (append-only JSONL event logging) and `compute_daily_stats` (aggregate by date, return last N days).

## Files Changed

| File | Action |
|---|---|
| `src-tauri/Cargo.toml` | Added `chrono = { version = "0.4", features = [] }` |
| `src-tauri/Cargo.lock` | Auto-updated for chrono |
| `src-tauri/src/commands/stats.rs` | **Created** — StatEvent, DailyStats, append_stat_event, compute_daily_stats |
| `src-tauri/src/commands/mod.rs` | Added `pub mod stats;` |
| `src-tauri/src/lib.rs` | Registered `append_stat_event`, `compute_daily_stats` in invoke_handler |
| `src/api/tauri.ts` | Appended StatEvent/DailyStats interfaces + appendStatEvent/computeDailyStats bindings |

## Deviation from Brief

The brief specified `fs::write` in `append_stat_event`, which **overwrites** the file on each call — destroying prior events. This contradicts the brief's own description ("append-only JSONL, never modified after write") and the function name `append_stat_event`.

**Fix applied:** Used `std::fs::OpenOptions::new().append(true).create(true).open(...)` with `file.write_all(...)` to actually append lines to the JSONL file. This preserves all events across multiple calls within the same month file.

## Verification

- **Rust:** `cargo check` — ✅ Finished `dev` profile in 4.29s, no errors/warnings
- **TypeScript:** `npx tsc --noEmit` — ✅ No output (clean)

## Test Summary

No unit tests written (brief did not specify tests; commands are thin I/O wrappers over filesystem). Verification was via compile checks only.

## Concerns

1. **`compute_daily_stats` uses `event.timestamp[..10]`** — assumes ISO date prefix (`YYYY-MM-DD`) at the start of the timestamp string. If a caller passes a timestamp without this format, the slice will panic. The TS interface types `timestamp: string` without enforcing format. Frontend callers must ensure ISO 8601 format.
2. **No file locking** — concurrent `append_stat_event` calls from multiple windows could interleave. Acceptable for a single-user desktop app, but worth noting.
3. **`days` parameter is `u32`** — `saturating_sub` handles the `days > result.len()` case correctly, returning all available days.
4. **Unrelated `src/style.css` change** was left unstaged — not part of this task's scope.

## Report Path

`.superpowers/sdd/task-D1-report.md`