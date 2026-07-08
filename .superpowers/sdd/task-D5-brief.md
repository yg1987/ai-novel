### Task D5: Wire SearchPanel + StatisticsPanel into ProjectView

**Files:**
- Modify: `src/components/ProjectView.tsx`

- [ ] **Step 1: Add imports and tabs**

```tsx
// Add imports at top
import SearchPanel from './SearchPanel'
import StatisticsPanel from './StatisticsPanel'

// Update type - add 'search' | 'stats'
type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats'

// Add tab buttons after the foreshadow tab button (around line 39-40)
<button className={`tab-btn${tab === 'search' ? ' active' : ''}`} onClick={() => { setTab('search') }}>🔎 搜索</button>
<button className={`tab-btn${tab === 'stats' ? ' active' : ''}`} onClick={() => { setTab('stats') }}>📊 统计</button>

// Add tab content after the foreshadow tab content (around line 49)
{tab === 'search' && <SearchPanel projectId={project.id} />}
{tab === 'stats' && <StatisticsPanel projectId={project.id} targetWords={project.target_words} />}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors
