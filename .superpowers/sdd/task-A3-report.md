# Task A3 Report: Rewrite Service + Preview Panel

## Status: DONE

## What was done

### Created: `src/services/rewriteService.ts`
- `RewriteMode` type: `'rewrite' | 'expand' | 'polish'`
- `RewriteRequest` interface with `selectedText`, `beforeText`, `afterText`, `mode`, optional `styleContext`
- `StreamCallbacks` interface matching the existing `aiProvider.ts` pattern
- `MODE_PROMPTS` mapping with Chinese prompts for each mode
- `rewriteText()` — SSE streaming fetch using `loadProviderConfig()`, context injection (200 chars before/after), streaming with `AbortController`
- `stopRewrite()` — abort the active rewrite request
- Follows same pattern as `aiProvider.ts` (`generateChapter`/`stopGeneration`)

### Created: `src/components/RewritePreview.tsx`
- Mode selector tabs: 改写 / 扩写 / 润色
- Side-by-side compare view: original (left) vs AI suggestion (right)
- Streaming output display with blinking cursor animation during generation
- Error state display
- Action buttons: Generate → Stop (during) → Accept / Regenerate (when done)
- Calls `rewriteText()` on generate, `stopRewrite()` on stop

### Modified: `src/components/Editor.tsx`
- Added `rewriteState` state to track selection for rewrite
- `handleRewrite()` — extracts selected text + 200-char context before/after, opens preview
- `handleRewriteAccept()` — replaces selection with AI result, triggers save
- Rewrite button in toolbar: only visible when text is selected via `editor.state.selection.from !== editor.state.selection.to`
- `RewritePreview` overlay rendered when `rewriteState` is not null

### Modified: `src/style.css`
- `.rewrite-overlay` — fixed full-screen backdrop with z-index 1000
- `.rewrite-panel` — centered card, 80vw/80vh max, flex column
- `.rewrite-compare` / `.rewrite-column` — side-by-side flex layout with border-right divider
- `.rewrite-column-header` / `.rewrite-column-content` — header + scrollable content area
- `.rewrite-streaming` / `.rewrite-cursor` — streaming indicator styles with blink animation
- `.rewrite-error` — error text colored with `--danger`
- `.rewrite-actions` — bottom action bar with flex-end alignment
- Uses existing CSS variables (`--bg-card`, `--border`, `--radius`, `--shadow-lg`, etc.)

## Test results

- `npx tsc --noEmit` → **PASS** (no output = no errors)
- LSP diagnostics: TypeScript language server not available in this environment

## Commits

```
43f2837 feat(rewrite): wire rewrite into editor and add styles
333b52a feat(rewrite): add rewrite service and preview component
```

2 atomic commits following SEMANTIC style (matching repo convention):
1. Service + component (foundation)
2. Integration + styles (uses foundation)

## Concerns

- LSP diagnostics unavailable in this environment; relied on `npx tsc --noEmit` which passed
- No dedicated tests for the rewrite service or component (follows existing pattern in the project)
