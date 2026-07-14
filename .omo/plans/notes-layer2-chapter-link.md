# 备注模块第二层：章节关联

> 创建日期：2026-07-14
> 状态：规划中
> 前置条件：第一层已完成（拆文件、question 类型、textarea、过滤器重构、分页）

---

## TL;DR

> **核心目标**：让备注从孤立碎片变成「写第 N 章时能看到关于第 N 章的所有备注」，跨 Tab 可跳转。
>
> **关键改动**：
> - NotesPanel 新增 chapterRef 下拉选择
> - ProjectView 新增跨 Tab 导航回调（目前 NotesPanel 只收 projectId，无法触发跳转）
> - ChapterManager 侧栏底部展示当前章关联备注
> - 章节列表徽标显示待办数量

---

## 背景与关键约束

### 技术事实（已通过代码审查确认）

1. **章节存储结构**：`chapters/{卷名}/{chapterId}.md`，两层嵌套。`listProjectFiles` 只能列出一层目录（返回卷名），**不能用它获取章节列表**。正确 API 是 `listChapters(projectId)`，返回 `ChapterMeta[] { id, title, order, volume }`。

2. **NotesPanel 当前 props**：只有 `{ projectId }`。没有 `setTab`，没有章节导航能力。要实现"点击备注标签跳转到章节"，必须**在 ProjectView 中新增回调 prop 并向下传递**。

3. **ChapterManager 当前 props**：`{ projectId, projectName, onNavigateToReview? }`。它独立管理自己的 `activeChapterId` 和 `chapters` 列表，与 NotesPanel 零交互。

4. **ProjectView 是唯一 tab 状态持有者**：`const [tab, setTab] = useState<Tab>('writing')`。导航模式已有一条先例——`handleNavigateToReview(chapterId)`。

---

## 改动方案

### 2.1 chapterRef 字段可用化

#### 2.1.1 NotesPanel 侧：添加章节关联下拉

**在 NotesPanel 的添加区域**增加一个可选章节下拉框（放在 type 下拉旁边）：

```tsx
// 新增 state
const [chapterList, setChapterList] = useState<ChapterMeta[]>([])
const [newChapterRef, setNewChapterRef] = useState('')

// 加载章节列表
useEffect(() => {
  listChapters(projectId).then(setChapterList).catch(console.error)
}, [projectId])

// 添加备注时写入 chapterRef
const entry: NoteEntry = {
  ...
  chapterRef: newChapterRef,  // 格式：空字符串表示"项目级"
}
```

**下拉框按卷分组**：

```tsx
<select value={newChapterRef} onChange={(e) => setNewChapterRef(e.target.value)}>
  <option value="">项目级（不关联章节）</option>
  {/* 按 volume 分组 */}
  {Object.entries(groupByVolume(chapterList)).map(([vol, chs]) => (
    <optgroup key={vol} label={vol}>
      {chs.map((ch) => (
        <option key={ch.id} value={`${ch.volume}/${ch.id}`}>
          {ch.title}
        </option>
      ))}
    </optgroup>
  ))}
</select>
```

**chapterRef 编码格式**：`"{volume}/{chapterId}"`（如 `"卷1/ch001"`）。空字符串表示项目级。这个格式唯一确定一个章节（volume + id），且能从字符串中解析出两部分。

#### 2.1.2 备注卡片上显示章节标签

每条关联了章节的备注，在 header 区域显示章节名称标签：

```tsx
{note.chapterRef && (
  <span
    className="note-chapter-tag"
    onClick={() => onNavigateToChapter?.(note.chapterRef)}
    title="点击跳转到该章节"
  >
    📖 {resolveChapterName(note.chapterRef, chapterList)}
  </span>
)}
```

**章节名称解析**：`chapterRef` 存的是 `"卷1/ch001"`，渲染时从已加载的 `chapterList` 中查找对应 `ChapterMeta.title`。如果找不到，降级显示 `chapterRef` 原始字符串。

#### 2.1.3 ProjectView 侧：新增导航回调

参照已有的 `handleNavigateToReview` 模式：

```tsx
// ProjectView.tsx 新增
const [navigateChapterId, setNavigateChapterId] = useState<string | null>(null)

const handleNavigateToChapter = (chapterRef: string) => {
  // chapterRef 格式: "卷1/ch001"
  setNavigateChapterId(chapterRef)
  setTab('writing')
}

// 传给 NotesPanel
{tab === 'notes' && (
  <NotesPanel
    projectId={project.id}
    onNavigateToChapter={handleNavigateToChapter}
  />
)}
```

**ChapterManager 如何响应**：ChapterManager 内部管理自己的 `activeChapterId`。跳转过来时它默认显示第一个章节。如果需要精确跳转到指定章节，需要 ChapterManager 接收一个 `initialChapterRef?: string` prop，并在 `useEffect` 中自动选中。这个改动成本较高（涉及 ChapterManager 内部状态初始化逻辑），**建议第一期简化处理：跳转到写作 Tab 即可，用户手动选章节**。后续可增强为精确跳转。

#### 2.1.4 ChapterManager 侧：侧栏底部显示本章备注

在 ChapterManager 章节列表的底部（`.chapter-sidebar-footer` 区域内或紧邻其下），新增「本章备注」区块：

```tsx
// 在 ChapterManager 中新增
const [chapterNotes, setChapterNotes] = useState<NoteEntry[]>([])

// 当 activeChapterId 变化时，加载关联到当前章的备注
useEffect(() => {
  if (!activeChapterId || !activeVolume) {
    setChapterNotes([])
    return
  }
  const ref = `${activeVolume}/${activeChapterId}`
  loadNotesByChapterRef(projectId, ref).then(setChapterNotes).catch(console.error)
}, [activeChapterId, activeVolume, projectId])
```

**loadNotesByChapterRef 实现**：从 `notes/` 目录加载所有备注，过滤 `chapterRef === ref` 的条目。可以复用 NotesPanel 的 `loadAllNotes` 逻辑（抽取为共享工具函数，见下文 2.3）。

**展示格式**：每条备注显示前 40 个字符 + 类型图标，点击跳转到备注 Tab 的对应条目。

---

### 2.2 按章节分组视图

在 NotesPanel 的过滤栏增加视图切换按钮：

```
[📋 时间线] [📂 按章节]
```

**按章节视图**逻辑：
- 调用 `groupNotesByChapter(notes, chapterList)`
- 未关联章节的备注 → 分组「📌 项目级」
- 已关联的 → 按 `(volume, chapterTitle)` 分组
- 每组标题可点击折叠/展开，折叠状态用 `useState<Set<string>>` 维持（会话内有效，不持久化）
- 每个分组内仍按时间倒序排列
- 分页仍然生效（每页 20 条，跨分组连续计数）

---

### 2.3 待办状态在章节列表中可见

**数据共享方案选择**：ChapterManager 和 NotesPanel 都需要的备注数据，最简单的方案是**各自加载**——两者都调用 `loadAllNotes`，各自做过滤。备注文件很少（几十个 JSON），重复加载的性能开销可忽略。避免状态提升的复杂性。

**实现步骤**：

1. 把 `loadAllNotes` 从 NotesPanel.tsx 抽取到 `src/services/notesStorage.ts`（共享工具模块）：

```ts
// src/services/notesStorage.ts
export async function loadAllNotes(projectId: string): Promise<NoteEntry[]> { ... }
export function getNotesForChapter(notes: NoteEntry[], chapterRef: string): NoteEntry[] { ... }
export function countPendingTodos(notes: NoteEntry[], chapterRef: string): number { ... }
```

2. NotesPanel 和 ChapterManager 都引入 `loadAllNotes`。

3. 在 ChapterManager 的章节列表中渲染徽标：

```tsx
// 章节列表项
<div className="chapter-item">
  <span>{chapter.title}</span>
  {pendingCount > 0 && (
    <span className="chapter-todo-badge" title={`${pendingCount} 条待办`}>
      🟡 {pendingCount}
    </span>
  )}
</div>
```

4. 徽标只统计 `<chapterRef>` 关联到当前章 + `type='todo'` + `done=false` 的条目。

---

### 改动文件汇总

| 文件 | 改动 |
|---|---|
| `src/services/notesStorage.ts` | **新建**，抽取 `loadAllNotes`、`getNotesForChapter`、`countPendingTodos` |
| `src/components/NotesPanel.tsx` | 引入 notesStorage；新增章节下拉、chapterRef 标签、onNavigateToChapter prop；新增按章节分组视图；filter/pagination 调整适配分组 |
| `src/components/ProjectView.tsx` | 新增 `handleNavigateToChapter`，传给 NotesPanel |
| `src/components/ChapterManager.tsx` | 侧栏底部「本章备注」区块；章节列表待办徽标 |
| `src/style.css` | 章节标签 `.note-chapter-tag`、徽标 `.chapter-todo-badge`、分组视图样式、折叠样式 |

---

### 执行顺序（依赖关系）

```
Step 1: src/services/notesStorage.ts          ← 无依赖，先建共享模块
  ↓
Step 2: src/components/NotesPanel.tsx         ← 依赖 notesStorage + ProjectView 新增的 prop
Step 3: src/components/ProjectView.tsx        ← 与 Step 2 并行（只加一个回调函数）
  ↓
Step 4: src/components/ChapterManager.tsx     ← 依赖 notesStorage + 已有 activeChapterId
Step 5: src/style.css                         ← 依赖所有组件改动就位
```

Step 2 和 Step 3 可并行，Step 4 可与 Step 2+3 并行。

---

### 注意事项

1. **chapterRef 编码格式**：统一使用 `"{volume}/{chapterId}"`，空字符串 = 项目级。不要用 `""` 之外的 magic string 表示项目级。

2. **chapterRef 向后兼容**：第一层实现中所有备注的 `chapterRef` 都是空字符串，迁移不需要任何操作。

3. **ChapterManager 的 activeVolume**：当前 ChapterManager 内部管理 `activeVolume` state，`loadNotesByChapterRef` 需要同时知道 volume 和 chapterId。确认该 state 可直接读取。

4. **性能**：`loadAllNotes` 每次调用会 `listProjectFiles` + 逐个文件 `readProjectFile`。两个组件各自调用时产生双重 I/O。可以在首次实现后再加内存缓存（simple in-memory cache with TTL），当前阶段先不加——备注数量通常不超过 100 条，双重加载影响极小。

5. **与第三层的关系**：第二层完成后，`notesStorage.ts` 也可被 `notesDS.ts`（第三层 AI 上下文注入）复用，不需要重构。
