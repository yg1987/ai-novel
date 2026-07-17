# Errors

Command failures and integration errors.

---

## [ERR-20260717-005] risk-lint-baseline-mismatch

**Logged**: 2026-07-17T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
The first risk-lint gate run exceeded its warning cap because of one stale ESLint suppression.

### Error
```
ESLint found too many warnings (maximum: 16).
17 problems (0 errors, 17 warnings)
```

### Context
- The 16 reviewed `set-state-in-effect` warnings matched the expected baseline.
- `Editor.tsx` contained an unused `react-hooks/exhaustive-deps` disable directive after its dependencies had been fixed.

### Suggested Fix
Remove stale suppressions instead of increasing the warning baseline.

### Metadata
- Reproducible: yes
- Related Files: eslint.risk.config.js, src/components/Editor.tsx
- Pattern-Key: config.baseline-mismatch
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T00:00:00+08:00
- **Notes**: Removed the unused directive; the risk gate passes with exactly 16 reviewed warnings.

---

## [ERR-20260717-001] powershell-rg-glob

**Logged**: 2026-07-17T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
An `rg` command used a Unix-style path wildcard under PowerShell and failed with Windows error 123; the non-zero result also aborted its parallel tool batch.

### Error
```
rg: src/components/*.css: 文件名、目录名或卷标语法不正确。 (os error 123)
```

### Context
- Attempted to search `src/style.css src/components/*.css` from PowerShell.
- A later no-match `rg` (exit code 1) also showed that fallible searches should not share a composed batch when their output is optional.
- On 2026-07-17, `codegraph explore` was called without its required query argument inside a parallel batch; the resulting exit code 1 aborted that batch too.
- During the material-library refactor, an optional no-match `rg` residue scan was again placed in a required parallel batch and caused the batch to report exit code 1.
- While diagnosing the ESLint baseline, `codegraph files` was called with an unsupported `--depth` option; the command returned `unknown option '--depth'` and aborted its parallel batch.
- While checking one Rust source file directly, `rustfmt --check` defaulted to Rust 2015 and rejected `async fn`; standalone rustfmt does not infer the Cargo package edition, so pass `--edition 2021` for this project.
- During Rust format governance, an optional `rg --files` search for line-ending config returned 1 on no matches and again aborted a required parallel result batch; optional probes must be caught independently even when prior learnings were reviewed.
- During the ESLint risk-remediation pass, an optional declaration search and then an assumed third-party declaration path were included in required parallel read batches. Both returned exit code 1 and invalidated otherwise successful reads.
- While adding the ESLint quality gate, probing optional `.github` and `scripts` directories with `rg --files` was again included in a required read batch and invalidated that batch.

### Suggested Fix
Use `rg --glob "*.css" <pattern> src` on Windows, and run optional no-match searches separately from required reads.

### Metadata
- Reproducible: yes
- Related Files: none
- Pattern-Key: shell.nonzero-exit
- Recurrence-Count: 10
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17
- Promoted: AGENTS.md

### Resolution
- **Resolved**: 2026-07-17T00:00:00+08:00
- **Notes**: Checked `codegraph --help`, confirmed `explore <query...>` is required, and reran it with an explicit query. Keep optional or usage-uncertain commands out of required parallel batches, and wrap optional no-match probes individually. For scoped Rust checks, `rustfmt --edition 2021 --check <file>` succeeds.

---

## [ERR-20260717-002] cargo-fmt-missing

**Logged**: 2026-07-17T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
Rust formatting verification is unavailable because neither installed Rust toolchain includes rustfmt.

### Error
```
error: 'cargo-fmt.exe' is not installed for the toolchain 'stable-x86_64-pc-windows-msvc'.
help: run `rustup component add rustfmt` to install it
```

### Context
- `cargo fmt --check` was run after the material-library backend implementation.
- Both installed stable toolchains contain cargo, rustc, and rust-std, but not rustfmt.

### Suggested Fix
Install rustfmt with explicit user approval, then run `cargo fmt --check` again.

### Metadata
- Reproducible: yes
- Related Files: src-tauri/src/commands/material.rs
- Pattern-Key: deps.missing-component
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T00:00:00+08:00
- **Notes**: Installed the official rustfmt component for stable-x86_64-pc-windows-msvc. `cargo fmt --version` and the scoped material.rs format check now pass.

---

## [ERR-20260717-003] typescript-syntax-error

**Logged**: 2026-07-17T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: frontend

### Summary
A newly added runtime type guard omitted the closing parenthesis on an `Array.every` call.

### Error
```
src/services/foreshadowStorage.ts(81,1): error TS1005: ',' expected.
src/components/relationship-graph/ForceGraphView.tsx: Sigma render `type` fields conflicted with domain node and relationship `type` fields after removing `any`.
```

### Context
- `npm exec tsc -- --noEmit` was run immediately after the first unsafe-data boundary patch.
- The syntax error was confined to `isForeshadowInspiration` and detected before broader edits continued.
- The next scoped check revealed a separate type-model collision at the Sigma boundary; it had previously been hidden by `any`.

### Suggested Fix
Keep the scoped TypeScript check directly after each patch that adds non-trivial type guards.

### Metadata
- Reproducible: yes
- Related Files: src/services/foreshadowStorage.ts
- Pattern-Key: build.type-error
- Recurrence-Count: 2
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T00:00:00+08:00
- **Notes**: Added the missing closing parenthesis and modeled Sigma attributes by replacing the domain `type` field while preserving it as `graphNodeType` / `relationType`.

---

## [ERR-20260717-004] apply-patch-context-mismatch

**Logged**: 2026-07-17T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
Six multi-file patches were atomically rejected because one uncertain file context did not match.

### Error
```
apply_patch verification failed: Failed to find expected lines
```

### Context
- A Promise-remediation patch spanned many components with slightly different button props.
- A later patch mixed known Version History changes with an unverified Chapter Graph catch callback.
- Four Hooks patches repeated the pattern by combining verified edits with uncertain Toast, Review Panel, or Search contexts.
- In every case no partial changes were applied.

### Suggested Fix
Keep broad mechanical edits in small verified groups and isolate any file whose exact context has not been read.

### Metadata
- Reproducible: yes
- Related Files: src/components/ReviewRulesEditor.tsx, src/components/ChapterGraph.tsx
- Pattern-Key: fs.context-mismatch
- Recurrence-Count: 6
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T00:00:00+08:00
- **Notes**: Split the edits into smaller patches, read exact contexts, and applied them successfully.

---
