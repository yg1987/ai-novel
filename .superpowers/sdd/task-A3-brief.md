# Task A3: Rewrite Service + Preview Panel

## File Structure

**Files:**
- Create: src/services/rewriteService.ts
- Create: src/components/RewritePreview.tsx
- Modify: src/components/Editor.tsx (add selection toolbar entry)
- Modify: src/style.css (add rewrite panel styles)

**Interfaces:**
- Consumes: loadProviderConfig from src/api/tauri.ts
- Produces: ewriteText(request, callbacks) — streaming AI call for rewrite/expand/polish
- Produces: stopRewrite() — abort controller
- Produces: RewritePreview component — modal with compare view

## Steps

1. Create rewriteService.ts with RewriteMode type, RewriteRequest interface, StreamCallbacks, MODE_PROMPTS, rewriteText() function, stopRewrite()
2. Create RewritePreview.tsx component: mode selector (rewrite/expand/polish), side-by-side compare, streaming output, accept/reject/regenerate buttons
3. Add rewrite button to Editor.tsx toolbar (only visible when text is selected), wire to handleRewrite/handleRewriteAccept
4. Add CSS for rewrite-overlay, rewrite-panel, rewrite-compare, rewrite-column
5. LSP diagnostics
6. Commit: feat(rewrite): add AI rewrite/expand/polish with preview-and-confirm

## Exact Code Reference

See plan file docs/superpowers/plans/2026-07-08-v04-quality-assurance.md lines 820-1000 for complete code.
