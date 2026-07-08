# Task B5 Report: Search Orchestrator + RRF Fusion

## Status: DONE_WITH_CONCERNS

## Summary

Created `src/services/search.ts` implementing the hybrid search orchestrator that combines keyword search (B1 `searchProjectFiles`) and vector search (B3 `embedText` + B4 `vectorSearchChunks`) with Reciprocal Rank Fusion (RRF, K=60).

## Commits

- `237be66` feat(search): add hybrid search orchestrator with RRF fusion

## Files

- **Created:** `src/services/search.ts` (105 lines)

## Verification

- `npx tsc --noEmit` — **PASS** (no errors, no output)

## Deviation from Brief

One minimal deviation was required to satisfy the project's `noUnusedLocals: true` TypeScript config:

- **`tokenizeQuery` exported.** The brief defines `tokenizeQuery` as a private (non-exported) function, but never calls it within `search.ts`. Under `noUnusedLocals`, this triggers TS6133 ("declared but never read"). Fix: added `export` keyword to make it part of the module's public API. This preserves the brief's intent — `tokenizeQuery` is a CJK-aware keyword-expansion utility designed for reuse by callers — while satisfying the compiler. No logic changed.

## Test Summary

No tests written — the brief does not specify tests, and the task is a pure orchestrator composing already-tested B1/B3/B4 primitives. Runtime verification requires a Tauri backend with indexed vector data, which is outside the scope of this unit.

## Concerns

1. **`tokenizeQuery` is exported but unused within the module.** It's available for external callers but no caller currently uses it. If a future task wires it into `hybridSearch` (e.g., for query expansion before keyword search), the export can be removed. For now it's dead code that compiles only because it's exported.

2. **Vector search failure is silently swallowed.** The `catch { return null }` block in the vector search path means embedding API failures, vector store errors, or network issues are invisible to the caller — `hybridSearch` will degrade to keyword-only results with no signal. This matches the brief exactly, but a future task may want to surface telemetry or a partial-failure flag.

3. **`source` field defaults to `'vector'` for vector-only hits.** When a result appears only in vector results (no keyword match), `source` is set to the string literal `'vector'`, which is not a member of the `SearchSource` union type. This is consistent with the brief but means `HybridResult.source` (inherited from `SearchResult` as `string`) can hold a value outside the `SearchSource` enum. No type error because `SearchResult.source` is typed as `string`, not `SearchSource`.

4. **`score` for vector-only hits defaults to `0`.** The RRF score (`rrfScore`) is the meaningful ranking signal, but the inherited `score` field is zero for vector-only results, which could confuse consumers that sort by `score` instead of `rrfScore`.

## Report File Path

`D:\opencode_work\ai_novel\.superpowers\sdd\task-B5-report.md`