# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## [LRN-20260722-002] correction

**Logged**: 2026-07-22T00:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Chapter-flow navigation must carry over the established volume, chapter, and segment controls instead of offering search alone.

### Details
Adding a text search to the timeline did not solve navigation in a long volume such as 300 chapters. The writing module already establishes the expected interaction contract: select a volume, jump to a chapter, and organize the list in configurable 25/50/100 chapter segments.

### Suggested Action
Reuse the project-scoped chapter segment preference in the ChapterFlow panel, group its virtual timeline into collapsible segments, and expand and scroll to the selected segment when navigating by chapter.

### Metadata
- Source: user_feedback
- Related Files: src/components/ChapterFlowPanel.tsx, src/components/ChapterFlowPanel.css, src/components/ProjectView.tsx
- Tags: chapter-flow, navigation, virtual-list, segment
- Pattern-Key: frontend.chapter-flow-navigation
- Recurrence-Count: 1
- First-Seen: 2026-07-22
- Last-Seen: 2026-07-22

### Resolution
- **Resolved**: 2026-07-22T00:00:00+08:00
- **Notes**: Reused the writing module's project-scoped segment setting, added volume and chapter jumps, and grouped the virtual timeline into collapsible 25/50/100 chapter sections.

---

## [LRN-20260722-001] correction

**Logged**: 2026-07-22T00:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Light review findings must preserve actionable source locations and collapse repeated matches by rule.

### Details
Displaying one issue per repeated match makes threshold-style rules such as excessive ellipses noisy, while displaying only the rule label loses the text location needed to fix it. A single grouped issue should include every matching line, character offset, and context snippet.

### Suggested Action
Carry precise offsets from the scanner, group matches by rule label, and render all grouped locations beneath the single issue.

### Metadata
- Source: user_feedback
- Related Files: src/services/bannedWords.ts, src/services/reviewLightCheck.ts, src/components/ReviewPanel.tsx
- Tags: review, diagnostics, source-location
- Pattern-Key: frontend.review-location
- Recurrence-Count: 2
- First-Seen: 2026-07-22
- Last-Seen: 2026-07-22
- See Also: same task follow-up — editor has no visible line numbers

### Resolution
- **Resolved**: 2026-07-22T00:00:00+08:00
- **Notes**: Grouped repeated light-check matches, preserved precise offsets, and rendered source contexts without exposing editor-incompatible line or character coordinates.

---

## [LRN-20260721-004] correction

**Logged**: 2026-07-21T00:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
When restoring a direct UI action, preserve its state-transition behavior as well as its icon and target action.

### Details
Restoring the version-history icon with an unconditional open handler lost its original toggle behavior. Clicking the same chapter's history icon must close an open history pane; clicking another chapter's icon must open that chapter's history.

### Suggested Action
For restored interactions, compare both rendered controls and state updates against the known-good implementation.

### Metadata
- Source: user_feedback
- Related Files: src/components/ChapterManager.tsx
- Tags: behavior, toggle, ui-regression
- Pattern-Key: frontend.behavior-regression
- Recurrence-Count: 1
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T00:00:00+08:00
- **Notes**: Restored toggle semantics while retaining direct per-chapter history access.

---

## [LRN-20260721-003] correction

**Logged**: 2026-07-21T00:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Do not change adjacent UI behavior that the user did not request, even when touching the same component.

### Details
The user requested shared chapter segment sizing only. The writing chapter row must retain its four direct action icons; unrelated consolidation into an overflow menu is outside scope and must be restored independently.

### Suggested Action
Before editing a component, compare the requested behavior against the diff and preserve every unrelated interaction and visual affordance.

### Metadata
- Source: user_feedback
- Related Files: src/components/ChapterManager.tsx
- Tags: scope, ui-regression, preserve-behavior
- Pattern-Key: frontend.scope-overreach
- Recurrence-Count: 1
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T00:00:00+08:00
- **Notes**: Restoring the original four direct chapter action icons without changing the shared segment-size feature.

---

## [LRN-20260721-002] correction

**Logged**: 2026-07-21T15:04:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Volume and chapter names are optional display metadata, not prerequisites for creating writing positions.

### Details
The initial implementation required both names and displayed unnamed placeholders. The product contract is position-first: users may create `卷N / 第M章` without custom names and may add or clear custom names later.

### Suggested Action
Keep creation validation limited to position and overwrite safety. Persist only non-empty custom names and derive default labels from `ChapterRef` and chapter order.

### Metadata
- Source: user_feedback
- Related Files: src/services/chapterCatalog.ts, src/components/ChapterManager.tsx, src/components/OutlinePanel.tsx
- Tags: chapter-navigation, optional-metadata, defaults
- Pattern-Key: frontend.optional-display-name
- Recurrence-Count: 1
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T15:04:00+08:00
- **Notes**: Made writing names optional across direct creation and outline-to-writing flows; empty values now fall back to position labels.

---

## [LRN-20260717-005] correction

**Logged**: 2026-07-17T17:20:00+08:00
**Priority**: high
**Status**: resolved
**Area**: docs

### Summary
Do not describe a partially implemented phase as complete or imply that its planned scope has been delivered.

### Details
After implementing and validating the initial TXT/EPUB document-import slice, the completion summary called it "Phase 3 core" without explicitly stating that major planned work remained. The user challenged whether the full phase was done. The correct report must separate implemented items from the phase plan's remaining requirements.

### Suggested Action
For phased work, state the exact delivered subset, name unfinished acceptance criteria, and label the phase as in progress until every confirmed item is implemented and verified.

### Metadata
- Source: user_feedback
- Related Files: doc/素材库分阶段改造计划.md
- Tags: scope, reporting, phase-3
- Pattern-Key: docs.phase-status-ambiguity
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

---

## [LRN-20260720-001] correction

**Logged**: 2026-07-20T00:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: tests

### Summary
Do not make a complete release build a functional-phase completion gate unless the user or plan explicitly requires packaging verification.

### Details
After the phase 3 implementation, development compilation, tests, lint checks and UI audits had passed, an additional `cargo build --release` was started. The user clarified that the current priority is feature implementation and complete packaging should be deferred.

### Suggested Action
Match verification depth to the requested milestone: use functional tests and development builds for feature phases, and reserve release compilation, installer generation and signing for an explicit packaging milestone.

### Metadata
- Source: user_feedback
- Related Files: doc/素材库分阶段改造计划.md
- Tags: scope, verification, release-build
- Pattern-Key: tests.scope-overreach
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

---

## [LRN-20260717-004] best_practice

**Logged**: 2026-07-17T16:25:00+08:00
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Do not turn a non-core file-format integration into a custom compatibility project when maintained dependencies fail representative samples.

### Details
The MOBI probe compared `mobi 0.8.0` and `iepub 1.3.6` on public Unicode, CP1252, PalmDOC, Huff/CDIC, NCX, and DRM samples. Both libraries handled some files, but each had production-blocking gaps including record-boundary decoding loss, missing structure APIs, strict malformed-HTML failures, unsupported compression, or panics. The FFI alternative required a separately maintained C library and Windows distribution chain. The user clarified that the product's main job is novel writing, not MOBI parser compatibility.

### Suggested Action
For optional import formats, define a representative-sample acceptance gate first. Use a mature dependency when it passes; otherwise document the evidence, reject the format clearly, and revisit only when a substantially better maintained solution exists.

### Metadata
- Source: user_feedback
- Related Files: doc/素材库分阶段改造计划.md
- Tags: dependencies, mobi, product-scope, technical-spike
- Pattern-Key: deps.compatibility-gap
- Recurrence-Count: 1
- First-Seen: 2026-07-17
- Last-Seen: 2026-07-17

---

## [LRN-20260717-003] correction

**Logged**: 2026-07-17T16:10:00+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
An explicit request to update the changelog and submit to GitHub authorizes the routine edit, stage, commit, and push workflow.

### Details
The user clarified that repeatedly requesting confirmation for these normal, explicitly requested repository actions creates unnecessary friction. Normal project reads, edits, writes, builds, and checks should run directly; only genuinely destructive, out-of-scope, or externally consequential actions should interrupt for authorization. Platform permission prompts may still appear when required by the sandbox, but the agent should not add separate conversational authorization requests or treat each Git step as a new decision.

### Suggested Action
For a direct request to record changes and submit to GitHub, update the requested document, stage only relevant files, commit, and push to the configured branch. Report only genuine blockers, such as missing credentials, a rejected push, or ambiguous target branch.

### Metadata
- Source: user_feedback
- Related Files: doc/变更记录.md, .learnings/LEARNINGS.md
- Tags: git, changelog, permissions, workflow
- Pattern-Key: config.confirmation-friction
- Recurrence-Count: 4
- First-Seen: 2026-07-16
- Last-Seen: 2026-07-22

---

## [LRN-20260716-002] correction

**Logged**: 2026-07-16T14:20:00+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
For this user, routine diagnostic/build commands should not repeatedly interrupt with confirmation prompts.

### Details
The user clarified that the issue is not executing commands such as npm or codegraph, but repeatedly asking for confirmation for routine low-risk checks. In a read-only sandbox, tool escalation prompts may still be required by the platform for write-producing commands, but the agent should minimize new command variants and use already-approved prefixes where possible.

On 2026-07-20, an approved PowerShell `Get-Content` command still prompted again when the path, flags, quoting, line range, or surrounding pipeline changed. Managed approvals match the beginning of each parsed command segment literally; approval of one complete `$l=Get-Content ...; $l[...]` form does not authorize arbitrary `Get-Content` variants.

The user reiterated that normal repository reads, edits, and focused verification should proceed without separate conversational authorization. When a platform prompt is unavoidable, keep the command narrowly scoped and continue the requested work after approval rather than treating the prompt as a new product decision.

### Suggested Action
Run routine checks directly when possible. Avoid changing to new npm subcommands unless necessary; prefer already-approved commands such as `npm exec tsc -- --noEmit`, `npm run build`, and established codegraph commands.

### Metadata
- Source: user_feedback
- Related Files: package.json, package-lock.json
- Tags: permissions, npm, codegraph, workflow
- Pattern-Key: config.confirmation-friction
- Recurrence-Count: 3
- First-Seen: 2026-07-16
- Last-Seen: 2026-07-20

---

## [LRN-20260716-001] correction

**Logged**: 2026-07-16T13:50:58.3555116+08:00
**Priority**: medium
**Status**: pending
**Area**: config

### Summary
`codegraph` may be available as a local CLI even when it is not exposed as a dedicated tool in the current session.

### Details
In this workspace, `.codegraph/codegraph.db` exists and `codegraph status` runs successfully. The earlier conclusion that codegraph was unavailable was too strong; the correct distinction is between session tool exposure and local CLI availability.

### Suggested Action
When a user says codegraph is installed, verify with `codegraph status` before claiming it is unavailable.

### Metadata
- Source: user_feedback
- Related Files: .claude/settings.local.json, .claude/hookify.codegraph-first.local.md, .codegraph/codegraph.db
- Tags: codegraph, cli, tool-availability
- Pattern-Key: config.tool-availability
- Recurrence-Count: 1
- First-Seen: 2026-07-16
- Last-Seen: 2026-07-16

---

## [LRN-20260720-004] correction

**Logged**: 2026-07-20T13:10:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Large project selectors must not expose every chapter or use ambiguous native multi-select controls.

### Details
Manual testing found that the brainstorm panel rendered all selected-chapter options in the advanced area, which does not scale to projects with hundreds of chapters. Its related-character control also looked like an unclear single-choice selector despite supporting multiple values.

### Suggested Action
Keep a compact range summary in the main panel. Put range, characters and constraints in a Modal; make multi-select explicit with checkboxes, and paginate searchable chapter lists with the shared Pagination component.

### Metadata
- Source: user_feedback
- Related Files: src/components/BrainstormPanel.tsx, src/components/BrainstormPanel.css
- Tags: brainstorm, selector, pagination, usability
- Pattern-Key: frontend.large-selector-usability
- Recurrence-Count: 3
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

### Recurrence
The first correction added shared components, but the character selector still displayed a single-page pagination bar and the settings layout remained disordered. Component reuse must be verified by final placement and workflow behavior, not imports alone.

The second correction added previous/next pagination, but did not validate the selector against a 3,000-chapter project. Large selectors need volume filters, configurable page size, direct page jumps, and a selected-only review mode; merely rendering Pagination is not sufficient.

### Resolution
- **Resolved**: 2026-07-20T15:55:00+08:00
- **Notes**: Added volume filtering, 20/50/100 page sizes, direct page jumps and selected-only review to the shared-pagination chapter selector. Verified 3,000 chapters, 150 pages, page 25 navigation, cross-page selection and narrow layout with Playwright.

---

## [LRN-20260720-005] correction

**Logged**: 2026-07-20T13:45:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
When a shared Modal component is required, its close behavior must be implemented in that component rather than delegated to a workflow-specific button.

### Details
The brainstorm settings dialog reused Modal but initially offered no explicit close control; the user could only use the semantic “完成” action. This missed the established component contract and made reopening settings awkward.

### Suggested Action
For dialogs with an `onRequestClose` callback, the shared Modal supplies a visible close button, backdrop click and Escape handling. Product-specific buttons remain for their workflow meaning only.

### Metadata
- Source: user_feedback
- Related Files: src/components/Modal.tsx, src/components/Modal.css, src/components/BrainstormPanel.tsx
- Tags: modal, accessibility, interaction
- Pattern-Key: frontend.modal-close-contract
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

---

## [LRN-20260720-006] correction

**Logged**: 2026-07-20T14:20:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Configuration modals must use the established cancel-and-confirm footer, with draft edits that cancel can discard.

### Details
The brainstorm conditions dialog had a visible close control but used a single "完成" action while immediately applying edits. This did not match the project's modal convention and made cancellation semantically meaningless.

### Suggested Action
Keep modal input in a local draft. Route close, backdrop, Escape, and the secondary footer button through cancellation; use the primary footer button to apply the draft. Reuse the shared Modal and Pagination components.

### Metadata
- Source: user_feedback
- Related Files: src/components/BrainstormPanel.tsx, src/components/BrainstormPanel.css
- Tags: brainstorm, modal, draft-state, pagination
- Pattern-Key: frontend.modal-action-contract
- Recurrence-Count: 1
- First-Seen: 2026-07-20
- Last-Seen: 2026-07-20

---

## [LRN-20260721-001] correction

**Logged**: 2026-07-21T00:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: docs

### Summary
Chapter-navigation reviews must preserve the product's explicit volume-and-chapter address model instead of inventing ambiguity around a bare global chapter number.

### Details
The review inferred that a query such as “156” needed a cross-volume disambiguation rule. The product model is instead explicitly “卷N → 第M章”; volume and chapter positions are always known in context. It also does not need legacy-data migration because all current data is disposable test data.

### Suggested Action
Before adding edge-case rules to a product plan, distinguish a shorthand used in discussion from an actual UI input contract. For this project, design chapter navigation around explicit volume and chapter positions, and omit legacy migration unless the user restores it as a requirement.

### Metadata
- Source: user_feedback
- Related Files: doc/卷章节目录与大纲关联公共方案.md, doc/写作模块改进计划.md, doc/审查模块改进计划.md, doc/大纲模块改进计划.md
- Tags: chapter-navigation, domain-model, scope
- Pattern-Key: docs.domain-assumption
- Recurrence-Count: 1
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T00:00:00+08:00
- **Notes**: Rewrote the four planning documents around explicit “卷 N / 第 M 章” positions, removed legacy migration scope, and specified that new writing volumes are created together with their first chapter.

---

## [LRN-20260721-002] correction

**Logged**: 2026-07-21T00:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Chapter-generation quality must prioritize completing every outline event and a natural chapter ending over a rigid word-count floor.

### Details
The expected AI word count is a preferred planning range, not permission to omit later outline scenes. The prompt must also handle unnumbered outlines, where a scene may be expressed as a paragraph, an event, or a character action rather than an explicit list item.

### Suggested Action
Use a target-to-+300 preferred range, permit up to +600 only when necessary for complete coverage and natural closure, and perform a silent completion pass that never inserts analysis into the draft.

### Metadata
- Source: user_feedback
- Related Files: src/contextEngine/chapterPrompt.ts, src/contextEngine/index.ts, src/components/Editor.tsx
- Tags: chapter-generation, outline, completion, word-count
- Pattern-Key: frontend.chapter-generation-priority
- Recurrence-Count: 1
- First-Seen: 2026-07-21
- Last-Seen: 2026-07-21

### Resolution
- **Resolved**: 2026-07-21T00:00:00+08:00
- **Notes**: Implemented the shared prompt and completion pass with non-numbered-outline handling.

---
