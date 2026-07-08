# Task D2 — Frontend Stats Service

## Status: ✅ Complete

## Deliverables

- [x] `src/services/stats.ts` created
- [x] `npx tsc --noEmit` — zero errors
- [x] Committed as `feat(stats): add frontend stats service`

## Service API

| Function | Event Type | Details |
|---|---|---|
| `logChapterSaved(projectId, chapter, content)` | `chapter_saved` | Strips HTML tags, counts chars/words via `estimateWordCount`, sends to Rust backend |
| `logAIGenerated(projectId, chapter, durationMs, outputTokens?)` | `ai_generated` | Logs AI generation timing and optional token count |
| `logSessionStart(projectId)` | `session_start` | Simple timestamped session-start marker |

## Internal

- `estimateWordCount(text)` — counts CJK characters + English words separately, sums them
- All functions fire-and-forget (`.catch(console.error)`)

## Backend Contract

Depends on `appendStatEvent` Rust command via `src/api/tauri.ts`. The Rust side was implemented in D1.
