### Task D4: Wire Stats Events into Editor Save Hook

**Files:**
- Modify: `src/components/Editor.tsx`

- [ ] **Step 1: Add stats logging to Editor save handler**

Add import at top:
```typescript
import { logChapterSaved, logAIGenerated, logSessionStart } from '../services/stats'
```

In `handleSaveNow` (around line 98-103), add after save:
```typescript
.then(() => {
  logChapterSaved(projectId, chapterNumber, html)
})
```

In `handleGenerate`, the `generateStartTime` ref and timing are already added in Task A4. Update the `onDone` callback to actually use the elapsed time:

```typescript
onDone: () => {
  setGenerating(false)
  const elapsed = Date.now() - generateStartTime.current
  logAIGenerated(projectId, chapterNumber, elapsed)
  handleSaveNow()
},
```

Add a `logSessionStart` call on component mount:
```typescript
useEffect(() => {
  logSessionStart(projectId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [projectId])
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors
