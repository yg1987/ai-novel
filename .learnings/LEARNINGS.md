# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

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

### Suggested Action
Run routine checks directly when possible. Avoid changing to new npm subcommands unless necessary; prefer already-approved commands such as `npm exec tsc -- --noEmit`, `npm run build`, and established codegraph commands.

### Metadata
- Source: user_feedback
- Related Files: package.json, package-lock.json
- Tags: permissions, npm, codegraph, workflow
- Pattern-Key: config.confirmation-friction
- Recurrence-Count: 1
- First-Seen: 2026-07-16
- Last-Seen: 2026-07-16

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
