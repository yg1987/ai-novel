# Task P1-1 Report: Relationship Data Model + Store

## What Was Implemented

### 1. Type additions (`src/types/novel.ts`)
Appended the v0.5 Relationship Graph types at the end of the existing file:
- `GraphNode` — character node with id, label, group, appearance stats, tags
- `RelationType` — union type: `'ally' | 'rival' | 'family' | 'mentor' | 'enemy' | 'friend' | 'love' | 'ambiguous'`
- `RelationshipLink` — edge between two characters with type, strength, mention stats, optional description
- `RelationshipGraph` — container with `nodes` + `links` arrays

All existing types in `novel.ts` were preserved unchanged.

### 2. Store service (`src/services/relationshipStore.ts`)
Created the relationship store with:
- `loadRelationshipGraph(projectId: string): Promise<RelationshipGraph>` — main public API
- `parseRelationshipChange(raw: string)` — parses `"林烬 → 盟友 → 苏婉"` format
- `mapRelationType(type: string)` — maps Chinese relation descriptors to `RelationType`

Data pipeline:
1. Lists character `.md` files from `characters/` to seed node set
2. Loads all `memory/snapshots/*.snapshot.json`, parses as `ChapterSnapshot[]`
3. Builds `GraphNode` map with appearance tracking from `snap.characters`
4. Parses `relationshipChanges` to build/update `RelationshipLink` map (strength increments by 0.15 per mention, capped at 1.0)
5. Infers co-occurrence links for characters in same chapter with no explicit relationship (type `'ambiguous'`, strength 0.1)

## Testing & Verification

### TypeScript strict check
```bash
$ npx tsc --noEmit
(no output)
```
Result: **clean pass** — zero errors, zero warnings.

### Self-review findings
- The brief included an unused constant `COGNITION_FILE = 'character-states.json'`. TypeScript strict mode flagged it as `TS6133` (declared but never read). Removed it to keep the build clean. The constant can be reintroduced when P1-2 or a future task actually consumes `character-states.json`.
- No `as any`, `@ts-ignore`, or `@ts-expect-error` used.
- All imports resolve correctly (`../api/tauri`, `../types/novel`).

## Files Changed

| File | Action | Lines |
|---|---|---|
| `src/types/novel.ts` | Modified (append) | +37 |
| `src/services/relationshipStore.ts` | Created | +119 |

## Commit

```
cddbcc5 feat(graph): add relationship data model and store service
```

## Issues / Concerns

None. The implementation is clean, type-safe, and ready for P1-2 (graph visualization) to import `loadRelationshipGraph` and the `RelationshipGraph` types.
