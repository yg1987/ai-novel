# Task A4 Report — Rewrite buildContext + Update Editor

## What I Implemented

### 1. `src/contextEngine/index.ts` — Full rewrite
Replaced the basic `buildContext` (outline + previous ending only) with the DataSourceRegistry-based version:
- Imports `DataSourceRegistry`, the 4 concrete sources (`cognitionDS`, `foreshadowDS`, `styleDS`, `recentSummaryDS`), and budget utilities (`estimateTokens`, `truncateToBudget`, `getDefaultSystemPrompt`)
- `ContextPack` interface now includes `sources: string[]` (names of loaded sources)
- New `buildContext` flow:
  1. Load outline + previous chapter ending directly (always needed)
  2. Register 4 sources with `DataSourceRegistry`, call `loadAll` + `assemble`
  3. Budget allocation: outline gets 25%, previous ending gets 15% (of remaining), sources get the rest via `truncateToBudget` (drops lowest priority first)
  4. Assemble final prompt: base prompt → outline → previous ending → fitted sources → word count requirement
- `MAX_PROMPT_TOKENS = 4096` cap

### 2. `src/components/Editor.tsx` — AI generation timing
- Added `const generateStartTime = useRef(0)` near other refs
- Set `generateStartTime.current = Date.now()` in `handleGenerate` before the API call
- In `onDone` callback: compute `const elapsed = Date.now() - generateStartTime.current` with a `void elapsed` placeholder (stats logging comes in a later task)

## Test Results

- `npx tsc --noEmit` — **PASS**, no errors, no warnings

## Files Changed

- `src/contextEngine/index.ts` (rewritten, 59 → 91 lines)
- `src/components/Editor.tsx` (3 edits: ref declaration, start time set, onDone timing)

## Concerns

- The `void elapsed` in `onDone` is a placeholder — the actual stats logging will be wired in a later task (per brief comment "elapsed will be passed to stats logging later"). TypeScript `noUnusedLocals` would have flagged it otherwise; `void elapsed` suppresses that cleanly.
- `outlineActual` and `endingActual` are computed but not directly used to truncate `outline`/`previousEnding` content — they're only subtracted from `promptBudget`. This matches the brief's exact code. If outline exceeds its 25% allocation, the full outline still gets injected (only the source budget shrinks). This is per-spec but worth noting for future tightening.
- The `sources` field in `ContextPack` reports `assembled` (all non-empty sources) not `fitted` (sources that actually made it into the prompt after budget truncation). Per the brief's exact code.

## Commit

- `514a91b` feat(context-engine): rewrite buildContext with DataSourceRegistry pattern