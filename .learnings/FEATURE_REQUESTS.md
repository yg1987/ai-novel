# Feature Requests

Capabilities requested by the user.

---

## [FEAT-20260721-001] chapter-draft-completion

**Logged**: 2026-07-21T00:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Requested Capability
Improve the default AI chapter-generation prompt so it completes every outline scene in order while meeting the expected generation length.

### User Context
The generated chapter should be at least the configured expected word count, may exceed it by roughly 200–300 Chinese characters, and must not omit outline scenes merely to end early.

### Complexity Estimate
medium

### Suggested Implementation
Inspect the prompt construction and generation pipeline; strengthen the default prompt and, if needed, add output-length and outline-completion checks rather than relying on prompt wording alone.

### Metadata
- Frequency: first_time
- Related Features: chapter-ai-generation
- Pattern-Key: frontend.chapter-draft-completion

### Resolution
- **Resolved**: 2026-07-21T00:00:00+08:00
- **Notes**: Unified the editable and runtime default prompts, restored volume-aware outline loading with old-path compatibility, and added a completion-only second pass that either confirms completion or continues missing scenes without inserting analysis.

---
