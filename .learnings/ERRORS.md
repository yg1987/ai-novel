# Errors

Command failures and integration errors.

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
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

### Resolution
- **Resolved**: 2026-07-17T17:15:08+08:00
- **Notes**: Retried with a correctly quoted child-shell command.

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
