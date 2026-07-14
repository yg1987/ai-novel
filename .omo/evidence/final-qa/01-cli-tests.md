# CLI QA Evidence — Task 1

## Test 1: QA Script (`npx tsx .omo/evidence/task-1-qa.ts`)

```
Scenario 1: Critical classification
  ✓ entry in critical
  ✓ entry NOT in upcoming
  ✓ entry NOT in active
  ✓ entry NOT in background

Scenario 2: Upcoming classification
  ✓ entry NOT in critical
  ✓ entry in upcoming
  ✓ entry NOT in active
  ✓ entry NOT in background

Scenario 3: Active classification
  ✓ entry NOT in critical
  ✓ entry NOT in upcoming
  ✓ entry in active
  ✓ entry NOT in background

Scenario 4: Background classification
  ✓ entry NOT in critical
  ✓ entry NOT in upcoming
  ✓ entry NOT in active
  ✓ entry in background

Scenario 5: Empty input
  ✓ critical empty
  ✓ upcoming empty
  ✓ active empty
  ✓ background empty
  ✓ text is empty

Scenario 6: Null currentChapterId
  ✓ all in background when no chapter

Scenario 7: Text formatter output
  ✓ contains critical marker
  ✓ contains upcoming marker
  ✓ contains active marker
  ✓ contains background marker
  ✓ contains超期

Scenario 8: Character section
  ✓ contains character section
  ✓ contains character name

Scenario 9: Advanced + far target → active (not upcoming)
  ✓ should be upcoming (7 ≤ 10)

Scenario 10: Advanced + very far target + recent activity → active
  ✓ NOT in upcoming (7 > 5)
  ✓ in active (recent activity)

=== Results: 32 passed, 0 failed ===
```

**Result: 32/32 PASS**

## Test 2: TypeScript Compilation (`npx tsc --noEmit`)

```
(no output — zero errors)
```

**Result: 0 errors PASS**

## Summary

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| QA Script | 32/32 pass | 32 passed, 0 failed | ✅ PASS |
| tsc --noEmit | 0 errors | 0 errors | ✅ PASS |