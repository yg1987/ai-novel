# Errors

Command failures and integration errors.

---

## [ERR-20260722-001] git-index-write

**Logged**: 2026-07-22T09:55:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Git staging and commit could not proceed because the sandbox cannot write the repository index.

### Error
```
fatal: Unable to create 'D:/opencode_work/ai_novel/.git/index.lock': Permission denied
```

### Context
- `git add` was attempted for the nine files changed in this conversation after tests and build checks passed.
- The working tree is readable and source files are writable, but `.git` is read-only to the current sandbox user.
- No files were staged and no commit or push was created.

### Suggested Fix
Run the same `git add`, `git commit`, and `git push` commands from an environment with write permission to `.git`, after reviewing the same nine target paths.

### Metadata
- Reproducible: yes
- Related Files: .git/index
- Pattern-Key: vcs.index-write-permission
- Recurrence-Count: 1
- First-Seen: 2026-07-22
- Last-Seen: 2026-07-22

---

## [ERR-20260722-001] git-log

**Logged**: 2026-07-22T00:00:00+08:00
**Priority**: low
**Status**: pending
**Area**: vcs

### Summary
`git log` was blocked by Git's dubious-ownership safety check.

### Error
```text
fatal: detected dubious ownership in repository at 'D:/opencode_work/ai_novel'
```

### Context
- Attempted a read-only history check for the Trending tab files.
- The current sandbox user differs from the repository owner.

### Suggested Fix
Use an approved Git safe-directory configuration only when history inspection is required; source analysis does not depend on it.

### Metadata
- Reproducible: yes
- Related Files: src/components/TrendingPanel.tsx, src/services/trendingService.ts
- Pattern-Key: vcs.fatal-error
- Recurrence-Count: 1
- First-Seen: 2026-07-22
- Last-Seen: 2026-07-22

---

## [ERR-20260721-002] request_user_input

**Logged**: 2026-07-21T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
Attempted to call a Plan-mode-only user-input tool while operating in Default mode.

### Error
```text
request_user_input is unavailable in Default mode
```

### Context
- The call was accidental during implementation planning.
- No user input, file, or application state was changed.

### Suggested Fix
Check the active collaboration mode before invoking mode-specific tools; use a normal final clarification only when necessary in Default mode.

### Metadata
- Reproducible: yes
- Related Files: AGENTS.md
- Pattern-Key: config.mode-specific-tool
- Recurrence-Count: 3
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T00:00:00+08:00
- **Notes**: Recorded the mode constraint and resumed without the unavailable tool.

---

## [ERR-20260721-001] npm_test

**Logged**: 2026-07-21T12:14:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
Changing a shared display helper for the new chapter tree broke existing display contracts.

### Error
```
chapterDisplay.test.ts expected the existing volume display label, but received a newly expanded raw-position label.
```

### Context
- The writing and review UIs need full volume/chapter addresses.
- `chapterNumberLabel()` is a shared helper with established consumers and tests.

### Suggested Fix
Keep full addresses in the new tree-specific UI and preserve shared display-helper output unless all consumers are intentionally migrated.

### Metadata
- Reproducible: yes
- Related Files: src/services/chapterDisplay.ts
- Pattern-Key: test.regression
- Recurrence-Count: 1
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T12:14:00+08:00
- **Notes**: Restored the existing `chapterNumberLabel()` contract; writing and review retain explicit full-position labels locally.

---

## [ERR-20260720-008] optional-probe-parallel-batch

**Logged**: 2026-07-20T17:25:54+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
An optional dependency probe that legitimately returned no matches was run in the same parallel script as required line-number reads, so its nonzero exit obscured the required output.

### Error
```
Script error: Exit code: 1
```

### Context
- The batch combined a required `rg` read with an optional virtual-list dependency search.
- The project instructions explicitly require optional probes to be isolated.

### Suggested Fix
Run required reads first and execute optional no-match probes in a separate tool call with their exit code handled independently.

### Metadata
- Reproducible: yes
- Related Files: AGENTS.md
- Pattern-Key: shell.nonzero-exit
- Recurrence-Count: 2
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-20T17:25:54+08:00
- **Notes**: Split the required line-number read from the optional dependency probe before retrying.

---

## [ERR-20260720-008] optional-probe-batched-with-required-checks

**Logged**: 2026-07-20T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: docs

### Summary
An optional `rg` no-match probe was batched with required document checks, so its expected exit code 1 hid the other verification results.

### Error
```
Parallel verification batch exited with code 1 because the optional search found no matches.
```

### Context
- The optional search checked that no unresolved planning words remained.
- Required line-count, fence-balance, header, and status checks were in the same batch.
- Project instructions require optional probes to run separately.

### Suggested Fix
Run probes that may legitimately return no matches in isolated commands, then run required verification commands independently.

### Metadata
- Reproducible: yes
- Related Files: doc/审查模块改进计划.md
- Pattern-Key: shell.optional-probe-batch
- Recurrence-Count: 2
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-20T00:00:00+08:00
- **Notes**: Isolated the optional search and reran the required checks separately. Recurrences on 2026-07-21 included batching a mistyped optional path and a non-expanded wildcard path with required reads; subsequent path probes are isolated.

---

## [ERR-20260720-008] brainstorm-provider-invalid-json

**Logged**: 2026-07-20T15:40:09+08:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
Brainstorm generation completed at the Provider but the returned content could not be parsed as strict JSON.

### Error
```
AI 返回的内容不是有效 JSON，请重试
```

### Context
- The parser already handles JSON code fences and simple surrounding prose.
- The request capped output at 2048 tokens despite requiring 3-6 detailed ideas, so truncation is a likely cause.
- Compatible Providers may also return repairable JSON such as trailing commas or incomplete closing delimiters.
- The first repair test exposed a candidate-order bug for top-level arrays; sorting extracted structures by their source position fixed it, and the targeted parser suite then passed 10/10 tests.

### Suggested Fix
Scale the output budget with result count, parse exact JSON first, then use a maintained JSON repair library before rejecting the response. Add fixtures for fenced, truncated, trailing-comma, and double-encoded responses.

### Metadata
- Reproducible: unknown
- Related Files: src/services/brainstormParser.ts, src/services/brainstormService.ts
- Pattern-Key: api.schema-mismatch
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

### Resolution
- **Resolved**: 2026-07-20T15:55:00+08:00
- **Notes**: Increased the output budget from a fixed 2048 to 4096-6144 tokens, added maintained `jsonrepair` parsing, and covered truncated, trailing-comma, double-encoded, top-level-array, structured-content and tool-call responses. Full suite passes 24/24 tests.

---

## [ERR-20260717-005] plugin-hook-path-mismatch

**Logged**: 2026-07-17T17:04:24+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
The installed Ponytail plugin did not contain the assumed `hooks/hooks.json` path.

### Error
```
Cannot find path '...\\ponytail\\4.8.4\\hooks\\hooks.json' because it does not exist.
```

### Context
- The path was inferred from the repository README while confirming Codex lifecycle hook names.
- Plugin cache layout can differ from a source checkout.

### Suggested Fix
Locate the installed manifest or use the Codex hook view before assuming a source-tree path.

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md
- Pattern-Key: fs.no-such-file
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T17:04:24+08:00
- **Notes**: Continued by locating the installed plugin's actual manifest files.

---

## [ERR-20260717-011] combined-verification-timeout

**Logged**: 2026-07-17T17:05:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
A combined Rust-test and frontend-lint execution reached the 120-second command limit before either result could be reported independently.

### Error
```
command timed out after 124085 milliseconds
```

### Context
- The first Phase 3 test run compiled the Tauri test target while `npm run lint:risk` ran in parallel.
- The composed command produced no per-command completion result before the shared timeout.

### Suggested Fix
Run the Rust test and the frontend risk-lint gate as separate commands with their own time budgets.

### Metadata
- Reproducible: unknown
- Related Files: src-tauri/src/commands/material_document.rs, src/components/MaterialDocumentWorkspace.tsx
- Pattern-Key: tests.combined-timeout
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T17:12:00+08:00
- **Notes**: `npm run lint:risk`, `cargo test material_document`, `cargo check`, and `npm run check` all completed successfully when run independently.

---

## [ERR-20260717-009] context7-schannel-credentials

**Logged**: 2026-07-17T16:30:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
The sandboxed Context7 HTTPS query failed before reaching the documentation API because Windows Schannel could not acquire credentials.

### Error
```
curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)
```

### Context
- Read-only query attempted: `context7.com/api/v2/libs/search` for `html5ever` parser API documentation.
- The user explicitly authorized Context7 queries as ordinary read-only operations.
- The isolated `html5ever` probe also could not download its declared dependency while running inside the sandbox; Cargo reported the same `SEC_E_NO_CREDENTIALS` Schannel error before compilation.

### Suggested Fix
Retry the same read-only query with the approved external-network execution path and keep this network probe isolated from repository analysis commands.

### Metadata
- Reproducible: unknown
- Related Files: none
- Pattern-Key: net.tls-credentials
- Recurrence-Count: 2
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T16:40:00+08:00
- **Notes**: The approved external-network path completed both Context7 calls and the isolated Cargo probe; the parser compiled and extracted text successfully.

---

## [ERR-20260717-010] cargo-info-registry-override

**Logged**: 2026-07-17T16:36:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
Cargo metadata lookup requires an explicit crates.io registry because the local Cargo configuration replaces it with a non-remote USTC source.

### Error
```
error: crates-io is replaced with non-remote-registry source registry `ustc`;
include `--registry crates-io` to use crates.io
```

### Context
- Attempted `cargo info html5ever` and `cargo info markup5ever_rcdom` before the isolated dependency probe.

### Suggested Fix
Use `cargo info <crate> --registry crates-io` for dependency metadata queries in this workspace.

### Metadata
- Reproducible: yes
- Related Files: none
- Pattern-Key: config.registry-override
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T16:36:00+08:00
- **Notes**: Cargo supplied the exact explicit-registry remedy; subsequent lookups use it.

---

## [ERR-20260717-008] temp-cleanup-permission

**Logged**: 2026-07-17T16:25:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
The sandbox allowed an escalated download to `D:\tmp` but denied creating an extraction directory and later deleting the downloaded file without escalation.

### Error
```
Access to the path 'D:\tmp\iepub-3252.zip' is denied.
```

### Context
- A public MOBI test archive was downloaded to `D:\tmp` during the dependency probe.
- Workspace-local probe directories could be created and removed normally; only the external temporary path required escalation for cleanup.

### Suggested Fix
Keep future probe inputs and build artifacts under a verified workspace-local temporary directory, or use an approved external-temp command consistently for both creation and cleanup.

### Metadata
- Reproducible: yes
- Related Files: none
- Pattern-Key: fs.permission-denied
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T16:25:00+08:00
- **Notes**: Removed the remaining archive with an explicitly escalated, exact-path `Remove-Item` command.

---

## [ERR-20260717-007] optional-path-batch-failure

**Logged**: 2026-07-17T15:15:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
An assumed optional source path invalidated a batch of required code reads.

### Error
```
Cannot find path 'src\\contextEngine\\sources\\index.ts' because it does not exist.
```

### Context
- The context source index path had not been confirmed before being included with required reads.
- The repository convention requires optional probes to be isolated.

### Suggested Fix
List or confirm optional paths separately before batching required reads.

### Metadata
- Reproducible: yes
- Related Files: src/contextEngine
- See Also: ERR-20260717-001
- Pattern-Key: shell.nonzero-exit
- Recurrence-Count: 11
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T15:15:00+08:00
- **Notes**: Kept the failed probe separate and resumed only after confirming the directory contents.

---

## [ERR-20260717-006] ripgrep-launch-failure

**Logged**: 2026-07-17T14:48:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
The WinGet `rg.exe` link could not be launched in the Windows sandbox.

### Error
```
Program 'rg.exe' failed to run: no application is associated with the specified file.
```

### Context
- The resolved command path was `C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Links\rg.exe`.
- CodeGraph analysis had already completed successfully; this was only a supplemental text search.

### Suggested Fix
Use PowerShell `Select-String` for supplemental searches in this sandbox, or repair the WinGet executable link outside the task.

### Metadata
- Reproducible: yes
- Related Files: none
- Pattern-Key: shell.command-not-found
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T14:48:00+08:00
- **Notes**: Switched supplemental repository searches to PowerShell without changing the system installation.

---

## [ERR-20260717-005] git-dubious-ownership

**Logged**: 2026-07-17T14:45:39+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
Git refused a read-only status check because the sandbox user does not own the repository.

### Error
```
fatal: detected dubious ownership in repository at 'D:/opencode_work/ai_novel'
```

### Context
- `git status --short` ran under `CodexSandboxOffline` while the repository is owned by `BUILTIN/Administrators`.
- The failed optional Git probe shared a parallel batch with required reads, so the batch result was discarded.

### Suggested Fix
Run repository-scoped Git commands with `git -c safe.directory=D:/opencode_work/ai_novel ...` and keep optional probes isolated from required reads.

### Metadata
- Reproducible: yes
- Related Files: .git
- Pattern-Key: vcs.fatal-error
- Recurrence-Count: 2
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T14:45:39+08:00
- **Notes**: Adopted a per-command safe-directory override without changing global Git configuration.

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
- While reviewing the brainstorm planning document, optional `rg` consistency probes were batched with the required `git diff --check` gate; the expected whitespace failure made the composed batch hide the probe results. Run content probes and pass/fail gates separately.
- While tightening the same planning document, one `apply_patch` spanned several distant sections and failed context verification. Split unrelated document edits into small patches anchored to exact local text.
- While recording confirmed brainstorm-plan decisions, a newly edited metadata line retained Markdown hard-break spaces and failed `git diff --check`. Do not add trailing spaces to newly inserted blockquote metadata lines.
- A later batch combined the required working-tree whitespace check with `git diff --cached --check`; the staged new-file snapshot intentionally lagged behind the revised working tree and failed on old metadata spaces. Inspect staged and unstaged states separately, and never restage user state just to satisfy a review check.

### Suggested Fix
Use `rg --glob "*.css" <pattern> src` on Windows, and run optional no-match searches separately from required reads.

### Metadata
- Reproducible: yes
- Related Files: none
- Pattern-Key: shell.nonzero-exit
- Recurrence-Count: 15
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-20
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
- The first Phase 3 Cargo check also caught two Rust match arms that incorrectly bound `quick_xml::BytesText` and `BytesCData` as one shared variable type.
- The first focused parser test then caught an existing `MaterialItem` test fixture missing the three newly added optional document-source fields.

### Suggested Fix
Keep the scoped TypeScript check directly after each patch that adds non-trivial type guards.

### Metadata
- Reproducible: yes
- Related Files: src/services/foreshadowStorage.ts
- Pattern-Key: build.type-error
- Recurrence-Count: 4
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
- A material-library CSS patch assumed a selector that was not present instead of locating an exact insertion point first.
- A document-workspace patch assumed the type-import ordering from a truncated symbol view and was rejected.
- A Markdown normalization patch grouped several valid function edits with one stale snippet context, rejecting the whole group.
- A document deletion test append used the pre-rustfmt ending of the preceding fixture assertion.
- In every case no partial changes were applied.

### Suggested Fix
Keep broad mechanical edits in small verified groups and isolate any file whose exact context has not been read.

### Metadata
- Reproducible: yes
- Related Files: src/components/ReviewRulesEditor.tsx, src/components/ChapterGraph.tsx, src/components/ResourcePanel.css, src/components/MaterialDocumentWorkspace.tsx, src-tauri/src/commands/material_document.rs
- Pattern-Key: fs.context-mismatch
- Recurrence-Count: 10
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-20

### Resolution
- **Resolved**: 2026-07-17T00:00:00+08:00
- **Notes**: Split the edits into smaller patches, read exact contexts, and applied them successfully.

---

## [ERR-20260717-006] codex-home-unset-quoting

**Logged**: 2026-07-17T17:15:08+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
Incorrect PowerShell quoting left `CODEX_HOME` set while attempting to target the standard user-level Codex configuration.

### Error
```
Error: marketplace 'ponytail' is already added from a different source; remove it before adding this source
```

### Context
- The command used escaped double quotes inside a PowerShell invocation of `cmd.exe`.
- It continued to target the Orca runtime home instead of `C:\\Users\\Administrator\\.codex`.

### Suggested Fix
Pass the `cmd.exe /c` body as a PowerShell single-quoted string when unsetting `CODEX_HOME`.

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md
- Pattern-Key: shell.quoting-error
- Recurrence-Count: 2
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-17T17:15:08+08:00
- **Notes**: Retried with a correctly quoted child-shell command. Recurrence on 2026-07-21 was caused by escaped quotes in a PowerShell `rg` pattern; use a single-quoted pattern when no interpolation is required.

---

## [ERR-20260717-007] plugin-list-filter-no-match

**Logged**: 2026-07-17T17:20:03+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
Filtering `codex plugin list` through `findstr` produced no match despite a successful user-level Ponytail installation.

### Error
```
Exit code: 1
```

### Context
- The installation command reported the plugin root under `C:\\Users\\Administrator\\.codex`.
- Direct inspection of `C:\\Users\\Administrator\\.codex\\config.toml` confirmed both marketplace and plugin entries.

### Suggested Fix
Verify plugin state through the user config or unfiltered CLI output when console formatting makes text filters unreliable.

### Metadata
- Reproducible: unknown
- Related Files: .learnings/ERRORS.md
- Pattern-Key: shell.filter-no-match
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T17:20:03+08:00
- **Notes**: Confirmed the expected configuration entries directly.

---

## [ERR-20260720-001] cargo-test-contract-update

**Logged**: 2026-07-20T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
Rust tests did not compile after the TXT decoder began returning content and encoding metadata.

### Error
```
binary operation `==` cannot be applied to type `DecodedTxt`
```

### Context
- `cargo test` compiled production code but failed on the stale UTF-16 decoder assertion.
- The assertion still compared the complete return value with a string.

### Suggested Fix
Assert `decoded.content` and `decoded.encoding` independently whenever a parser return contract gains metadata.

### Metadata
- Reproducible: yes
- Related Files: src-tauri/src/commands/material_document.rs
- Pattern-Key: build.type-error
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

### Resolution
- **Resolved**: 2026-07-20T00:00:00+08:00
- **Notes**: Updated the decoder assertions for content and encoding; all 22 Rust tests pass.

---

## [ERR-20260720-002] epub-fixture-download

**Logged**: 2026-07-20T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The first real-world EPUB fixture URL returned an HTML page with a successful HTTP status.

### Error
```
Failed to open EPUB archive: invalid Zip archive: Could not find EOCD
```

### Context
- The downloaded file began with `<!DOCTYPE` instead of the ZIP `PK` signature.
- A raw GitHub retry returned a 14-byte not-found response.

### Suggested Fix
Validate downloaded binary fixture magic and size before wiring it into tests.

### Metadata
- Reproducible: yes
- Related Files: src-tauri/tests/fixtures/README.md
- Pattern-Key: net.invalid-response
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

### Resolution
- **Resolved**: 2026-07-20T00:00:00+08:00
- **Notes**: Replaced the response with the IDPF accessible EPUB 3 release asset and verified its `PK` signature.

---

## [ERR-20260720-003] playwright-ipc-mock

**Logged**: 2026-07-20T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The first material UI check returned `null` for an unrelated background file-read command.

### Error
```
TypeError: Cannot read properties of null (reading 'trim')
```

### Context
- Material layout and screenshot assertions completed before the runtime-error audit failed.
- The mock fallback did not preserve the real `read_project_file -> string` contract.

### Suggested Fix
Mock background IPC calls by return contract, even when they are outside the UI under test.

### Metadata
- Reproducible: yes
- Related Files: scripts/material-phase3-ui-check.mjs
- Pattern-Key: test.mock-contract
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

### Resolution
- **Resolved**: 2026-07-20T00:00:00+08:00
- **Notes**: Added an empty-string `read_project_file` response before rerunning the UI audit.

---

## [ERR-20260720-004] vite-session-expired

**Logged**: 2026-07-20T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The UI audit retried after its time-limited Vite command session had already ended.

### Error
```
page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1420/
```

### Context
- No browser assertion ran during the failed attempt.
- The development server had previously returned HTTP 200 and was restarted successfully.

### Suggested Fix
Probe the development URL immediately before each browser audit when the server runs in a bounded command session.

### Metadata
- Reproducible: yes
- Related Files: scripts/material-phase3-ui-check.mjs
- Pattern-Key: net.connection-refused
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

### Resolution
- **Resolved**: 2026-07-20T00:00:00+08:00
- **Notes**: Restarted Vite, verified HTTP 200, and reran the complete audit successfully.

---

## [ERR-20260720-005] playwright-node-scope

**Logged**: 2026-07-20T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
An image UI assertion referenced mock data that existed only inside the browser initialization closure.

### Error
```
ReferenceError: materialItems is not defined
```

### Context
- The failure was in the Node-side Playwright script, before the image assertion ran.

### Suggested Fix
Keep locator labels used by Node-side steps in Node scope, separate from browser-only mock state.

### Metadata
- Reproducible: yes
- Related Files: scripts/material-phase3-ui-check.mjs
- Pattern-Key: runtime.reference-error
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

### Resolution
- **Resolved**: 2026-07-20T00:00:00+08:00
- **Notes**: Added a Node-side long-title constant; the image audit then passed.

---

## [ERR-20260720-006] cargo-release-timeout

**Logged**: 2026-07-20T00:00:00+08:00
**Priority**: low
**Status**: wont_fix
**Area**: backend

### Summary
An optional Windows release verification exceeded the initial command time budget after all phase 3 functional checks had passed.

### Error
```
cargo build --release timed out after 124 seconds without a compiler error.
```

### Context
- The command was an extra packaging-oriented verification, not required to implement phase 3 functionality.
- A longer retry reached the linker without an error but was stopped after the user clarified that complete packaging is currently out of scope.

### Suggested Fix
Run the release build with a packaging-appropriate time budget only when preparing a complete distributable build.

### Metadata
- Reproducible: unknown
- Related Files: src-tauri/Cargo.toml, src-tauri/Cargo.lock
- Pattern-Key: build.timeout
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

### Resolution
- **Resolved**: 2026-07-20T00:00:00+08:00
- **Notes**: Deferred release and installer verification to the future packaging stage by user direction.

---

## [ERR-20260720-007] git-diff-trailing-whitespace

**Logged**: 2026-07-20T14:35:00+08:00
**Priority**: low
**Status**: promoted
**Area**: frontend

### Summary
The staged brainstorm context source contained one trailing whitespace character.

### Error
```
src/services/brainstormContext.ts:149: trailing whitespace.
```

### Context
- Detected by `git diff --cached --check` before commit.
- Recurred in Markdown metadata that used line-ending double spaces; detected by `git diff --check` during the review-plan rewrite.
- Recurred again while updating the writing-module plan metadata with the same Markdown hard-break style.

### Suggested Fix
Remove whitespace-only suffixes before staging code changes.

### Metadata
- Reproducible: yes
- Related Files: src/services/brainstormContext.ts, doc/审查模块改进计划.md, doc/写作模块改进计划.md, AGENTS.md
- Pattern-Key: fs.trailing-whitespace
- Recurrence-Count: 3
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20
- Promoted: AGENTS.md

### Resolution
- **Resolved**: 2026-07-20T14:35:00+08:00
- **Notes**: Removed all observed occurrences, replaced Markdown hard breaks with explicit `<br>`, and promoted a scoped `git diff --check` rule to the project instructions.

---

## [ERR-20260721-001] apply_patch

**Logged**: 2026-07-21T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: docs

### Summary
A multi-hunk documentation patch was rejected because one expected acceptance-test line differed from the current file.

### Error
```text
apply_patch verification failed: Failed to find expected lines
```

### Context
- The rejected patch targeted `doc/大纲模块改进计划.md`.
- No partial write occurred; the update was retried as smaller, exact hunks after reading the target range.

### Suggested Fix
For broad documentation edits, verify each target block immediately before patching and split unrelated hunks so one changed line cannot reject the entire update.

### Metadata
- Reproducible: yes
- Related Files: doc/大纲模块改进计划.md
- Pattern-Key: docs.patch-context
- Recurrence-Count: 1
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T00:00:00+08:00
- **Notes**: Re-read the exact target range and applied the changes in smaller verified patches.

---

## [ERR-20260721-002] cargo-check

**Logged**: 2026-07-21T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: backend

### Summary
Rust validation was initially invoked from the repository root instead of the Tauri crate directory.

### Error
```text
error: could not find `Cargo.toml` in `D:\opencode_work\ai_novel` or any parent directory
```

### Context
- Command: `cargo check` from the workspace root.
- The Rust crate is located at `src-tauri/`.

### Suggested Fix
Run Rust build commands with `src-tauri` as the working directory.

### Metadata
- Reproducible: yes
- Related Files: src-tauri/Cargo.toml
- Pattern-Key: build.wrong-workdir
- Recurrence-Count: 1
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T00:00:00+08:00
- **Notes**: Re-ran `cargo check` in `src-tauri`; it passed.

---

## [ERR-20260721-003] cargo-fmt

**Logged**: 2026-07-21T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: backend

### Summary
The Rust formatter found a newly added method chain that did not match the repository's formatting style.

### Error
```text
Diff in src-tauri/src/lib.rs: project.join("outline").join("细纲")
```

### Context
- Detected by `cargo fmt --check` after adding volume-aware outline lookup.

### Suggested Fix
Run Rust formatting checks after editing Tauri commands and apply the formatter's minimal output.

### Metadata
- Reproducible: yes
- Related Files: src-tauri/src/lib.rs
- Pattern-Key: build.rust-format
- Recurrence-Count: 1
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T00:00:00+08:00
- **Notes**: Applied the single-line formatter output and rechecked.

---
