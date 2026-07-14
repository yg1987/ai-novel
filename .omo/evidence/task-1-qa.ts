// QA test for foreshadowContext.ts — Task 1
import {
  classifyForeshadows,
  classifiedForeshadowsToText,
  type ForeshadowUrgency,
} from '../../src/services/foreshadowContext'
import { DEFAULT_FORESHADOW_CONFIG, type ForeshadowEntry } from '../../src/types/novel'
import type { ChapterMeta } from '../../src/types/chapter'

const chapters: ChapterMeta[] = [
  { id: 'ch005', title: '第5章', order: 5, volume: 'vol1' },
  { id: 'ch007', title: '第7章', order: 7, volume: 'vol1' },
  { id: 'ch008', title: '第8章', order: 8, volume: 'vol1' },
  { id: 'ch012', title: '第12章', order: 12, volume: 'vol1' },
  { id: 'ch015', title: '第15章', order: 15, volume: 'vol1' },
]

const now = '2026-07-14T12:00'

function makeEntry(overrides: Partial<ForeshadowEntry>): ForeshadowEntry {
  return {
    id: 'test-1',
    name: '测试伏笔',
    description: '测试描述',
    status: 'planted',
    category: 'mystery',
    importance: 0.6,
    plantedChapterId: 'ch005',
    clues: [],
    relatedCharacters: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

let pass = 0
let fail = 0

function assert(label: string, condition: boolean) {
  if (condition) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ FAIL: ${label}`) }
}

// Scenario 1: Critical — target chapter has passed
console.log('\nScenario 1: Critical classification')
const e1 = makeEntry({ targetChapterId: 'ch005' })
const r1 = classifyForeshadows([e1], 'ch008', chapters, DEFAULT_FORESHADOW_CONFIG)
assert('entry in critical', r1.critical.length === 1)
assert('entry NOT in upcoming', r1.upcoming.length === 0)
assert('entry NOT in active', r1.active.length === 0)
assert('entry NOT in background', r1.background.length === 0)

// Scenario 2: Upcoming — target within window
console.log('\nScenario 2: Upcoming classification')
const e2 = makeEntry({ targetChapterId: 'ch012' })
const r2 = classifyForeshadows([e2], 'ch008', chapters, DEFAULT_FORESHADOW_CONFIG)
assert('entry NOT in critical', r2.critical.length === 0)
assert('entry in upcoming', r2.upcoming.length === 1)
assert('entry NOT in active', r2.active.length === 0)
assert('entry NOT in background', r2.background.length === 0)

// Scenario 3: Active — recently advanced foreshadow
console.log('\nScenario 3: Active classification')
const e3 = makeEntry({
  status: 'advanced',
  targetChapterId: undefined,
  clues: [{ chapterId: 'ch007', description: 'found clue', timestamp: now }],
})
const r3 = classifyForeshadows([e3], 'ch008', chapters, DEFAULT_FORESHADOW_CONFIG)
assert('entry NOT in critical', r3.critical.length === 0)
assert('entry NOT in upcoming', r3.upcoming.length === 0)
assert('entry in active', r3.active.length === 1)
assert('entry NOT in background', r3.background.length === 0)

// Scenario 4: Background — stale foreshadow with no target
console.log('\nScenario 4: Background classification')
const e4 = makeEntry({ status: 'planted', targetChapterId: undefined, clues: [] })
const r4 = classifyForeshadows([e4], 'ch008', chapters, DEFAULT_FORESHADOW_CONFIG)
assert('entry NOT in critical', r4.critical.length === 0)
assert('entry NOT in upcoming', r4.upcoming.length === 0)
assert('entry NOT in active', r4.active.length === 0)
assert('entry in background', r4.background.length === 1)

// Scenario 5: Empty input
console.log('\nScenario 5: Empty input')
const r5 = classifyForeshadows([], 'ch008', chapters, DEFAULT_FORESHADOW_CONFIG)
assert('critical empty', r5.critical.length === 0)
assert('upcoming empty', r5.upcoming.length === 0)
assert('active empty', r5.active.length === 0)
assert('background empty', r5.background.length === 0)
const text5 = classifiedForeshadowsToText(r5, chapters, 'ch008')
assert('text is empty', text5 === '')

// Scenario 6: Null currentChapterId
console.log('\nScenario 6: Null currentChapterId')
const e6 = makeEntry({ targetChapterId: 'ch005' })
const r6 = classifyForeshadows([e6], null, chapters, DEFAULT_FORESHADOW_CONFIG)
assert('all in background when no chapter', r6.background.length === 1 && r6.critical.length === 0)

// Scenario 7: Text formatter with all levels
console.log('\nScenario 7: Text formatter output')
const r7 = classifyForeshadows([e1, e2, e3, e4], 'ch008', chapters, DEFAULT_FORESHADOW_CONFIG)
const text7 = classifiedForeshadowsToText(r7, chapters, 'ch008')
assert('contains critical marker', text7.includes('🔴'))
assert('contains upcoming marker', text7.includes('🟡'))
assert('contains active marker', text7.includes('🔵'))
assert('contains background marker', text7.includes('⚪'))
assert('contains超期', text7.includes('已超期'))

// Scenario 8: Character section
console.log('\nScenario 8: Character section')
const e8 = makeEntry({ name: '角色伏笔', relatedCharacters: ['林烬'] })
const r8 = classifyForeshadows([e8], 'ch008', chapters, DEFAULT_FORESHADOW_CONFIG)
const text8 = classifiedForeshadowsToText(r8, chapters, 'ch008', ['林烬'])
assert('contains character section', text8.includes('👤'))
assert('contains character name', text8.includes('林烬'))

// Scenario 9: Upcoming far target still checks active
console.log('\nScenario 9: Advanced + far target → active (not upcoming)')
const e9 = makeEntry({
  status: 'advanced',
  targetChapterId: 'ch015',  // far away: order 15, current 8, diff=7 > upcomingWindow(10)? No, 7 ≤ 10
  clues: [{ chapterId: 'ch007', description: 'found', timestamp: now }],
})
const r9 = classifyForeshadows([e9], 'ch008', chapters, DEFAULT_FORESHADOW_CONFIG)
assert('should be upcoming (7 ≤ 10)', r9.upcoming.length === 1)

// Scenario 10: Advanced with far target beyond upcomingWindow
console.log('\nScenario 10: Advanced + very far target + recent activity → active')
const e10 = makeEntry({
  status: 'advanced',
  targetChapterId: 'ch015',
  clues: [{ chapterId: 'ch007', description: 'found', timestamp: now }],
})
// Use config with upcomingWindow=5 so ch015 (diff=7) is beyond window
const narrowConfig = { ...DEFAULT_FORESHADOW_CONFIG, upcomingWindow: 5 }
const r10 = classifyForeshadows([e10], 'ch008', chapters, narrowConfig)
assert('NOT in upcoming (7 > 5)', r10.upcoming.length === 0)
assert('in active (recent activity)', r10.active.length === 1)

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
