# 世界观上下文注入 — 为 AI 角色/大纲/世界观生成添加世界观参考

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 角色、大纲、世界观三个面板的 AI 生成在构建上下文时，先读取世界观条目注入 Prompt，实现 fallback 链：世界观 + 书名 + 类别 + 简介 → 书名 + 类别 + 简介 → 书名 + 类别。

**Architecture:** 创建一个共享的 `buildAIContext()` 工具函数，从 `worldview/*.md` 读取条目作为上下文；三个面板各自删除内联的 `project.json` 读取逻辑，统一调用此函数。Worldview 面板 AI 生成也从只读 `project.json` 升级为读所有现有的世界观条目，提供更完整上下文。

**Tech Stack:** TypeScript, React, Tauri File API

**参考实现:** `reviewService.ts:42-55` — 已有的世界观读取模式（读 `worldview/*.md`，取前 5 个文件，每文件前 800 字符）

## Global Constraints

- 不改动 `project.json` 的结构和字段
- 不改动 `worldview/` 目录的结构和文件名
- 不改动已有的 `reviewService` 代码，仅复用其读取模式
- 不改动非 AI 生成功能（手动输入、编辑、删除等）
- `listProjectFiles` / `readProjectFile` 签名：`(projectId: string, subdir: string, filename?: string)`

---

### Task 1: 创建共享上下文工具 `src/services/aiContext.ts`

**Files:**
- Create: `src/services/aiContext.ts`
- Reference: `src/services/reviewService.ts:42-55`（世界观读取模式）
- Reference: `src/api/tauri.ts`（`listProjectFiles`, `readProjectFile` 签名）

**Interfaces:**
- Produces: `buildAIContext(projectId: string): Promise<string>` — 返回组装好的上下文字符串（空值时返回空字符串）

- [ ] **Step 1: 创建 `src/services/aiContext.ts`**

```typescript
// src/services/aiContext.ts
// 构建 AI 生成用的上下文，按 fallback 链注入世界观设定
import { readProjectFile, listProjectFiles } from '../api/tauri'

export async function buildAIContext(projectId: string): Promise<string> {
  // 1. 读取项目元数据
  let name = ''
  let genre = ''
  let description = ''
  try {
    const metaRaw = await readProjectFile(projectId, '', 'project.json')
    const meta = JSON.parse(metaRaw) as { name?: string; genre?: string; description?: string }
    name = meta.name ?? ''
    genre = meta.genre ?? ''
    description = meta.description ?? ''
  } catch { /* ignore */ }

  // 2. 读取世界观条目（best effort）
  let worldviewText = ''
  try {
    const worldviewFiles = await listProjectFiles(projectId, 'worldview')
    const snippets: string[] = []
    for (const f of worldviewFiles.slice(0, 5)) {
      const content = await readProjectFile(projectId, 'worldview', f.name).catch(() => '')
      if (content) {
        const text = content.replace(/^---[\s\S]*?---\n?/, '').replace(/<[^>]*>/g, '').trim()
        if (text) snippets.push(`【${f.name.replace(/\.md$/i, '')}】\n${text.slice(0, 800)}`)
      }
    }
    if (snippets.length > 0) worldviewText = snippets.join('\n\n')
  } catch { /* worldview directory or file may not exist */ }

  // 3. 按 fallback 链组装上下文
  //    世界观有 → 注入世界观；没有 → 跳过
  //    简介有 → 注入简介；没有 → 跳过
  //    至少保证有书名 + 类别
  const parts: string[] = []
  if (worldviewText) parts.push(`世界观设定：\n${worldviewText}`)
  if (name) parts.push(`小说名称：${name}`)
  if (genre) parts.push(`类型：${genre}`)
  if (description) parts.push(`简介：${description}`)

  return parts.join('\n')
}
```

- [ ] **Step 2: 确认文件创建成功**

Run: `Test-Path -LiteralPath "src/services/aiContext.ts"`
Expected: `True`

---

### Task 2: 改造 CharacterPanel.tsx — 使用 `buildAIContext`

**Files:**
- Modify: `src/components/CharacterPanel.tsx` — `handleAICreate` 方法（第 185-248 行）

**Interfaces:**
- Consumes: `buildAIContext(projectId)` from `src/services/aiContext.ts`
- 注入世界观上下文到 system prompt 的 `projectInfo` 变量，构成 `projectInfo` 的显示层

- [ ] **Step 1: 在文件顶部添加 import**

在现有的 import 块中增加：
```typescript
import { buildAIContext } from '../services/aiContext'
```

- [ ] **Step 2: 替换 `handleAICreate` 中的 projectInfo 构建逻辑**

将（第 194-200 行）：
```typescript
      // Read project info
      let projectInfo = ''
      try {
        const metaRaw = await readProjectFile(projectId, '', 'project.json')
        const meta = JSON.parse(metaRaw) as { name?: string; genre?: string; description?: string }
        projectInfo = `小说名称：${meta.name ?? ''}\n类型：${meta.genre ?? ''}\n简介：${meta.description ?? ''}`
      } catch { /* ignore */ }
```

替换为：
```typescript
      // Read project info + worldview context
      let projectInfo = await buildAIContext(projectId)
```

- [ ] **Step 3: 同理替换「提示词编辑」按钮中的 projectInfo 构建**

第 352-358 行（inline 读取 project.json 来构建提示词预览），将：
```typescript
                      let info = ''
                      try {
                        const metaRaw = await readProjectFile(projectId, '', 'project.json')
                        const meta = JSON.parse(metaRaw) as { name?: string; genre?: string; description?: string }
                        info = `小说名称：${meta.name ?? ''}\n类型：${meta.genre ?? ''}\n简介：${meta.description ?? ''}`
                      } catch { /* ignore */ }
```

替换为：
```typescript
                      let info = await buildAIContext(projectId)
```

- [ ] **Step 4: 检查是否可以移除不再需要的 import**

注意：`readProjectFile` 在文件的其他地方是否还在使用？
- 如果只有被替换的这两处用到 → 确认后可以移出 import（但要检查其他地方）
- 检查 `CharacterPanel.tsx` 中 `readProjectFile` 的其他使用位置：

Run: `grep --include="*.tsx" -n "readProjectFile" src/components/CharacterPanel.tsx`
Expected: 输出显示 `readProjectFile` 还在第 136 行的 `useEffect` 中使用（加载角色文件内容），因此 import 保留。

---

### Task 3: 改造 OutlinePanel.tsx — 使用 `buildAIContext`

**Files:**
- Modify: `src/components/OutlinePanel.tsx` — `handleAIGenerate` 方法（第 314-361 行）

**Interfaces:**
- Consumes: `buildAIContext(projectId)` from `src/services/aiContext.ts`

- [ ] **Step 1: 添加 import**

在现有 import 块中增加：
```typescript
import { buildAIContext } from '../services/aiContext'
```

- [ ] **Step 2: 替换 `handleAIGenerate` 中的 context 构建逻辑**

将（第 323-328 行）：
```typescript
      let context = ''
      try {
        const metaRaw = await readProjectFile(projectId, '', 'project.json')
        const meta = JSON.parse(metaRaw) as { name?: string; genre?: string; description?: string }
        context = `小说名称：${meta.name ?? ''}\n类型：${meta.genre ?? ''}\n简介：${meta.description ?? ''}`
      } catch { /* ignore */ }
```

替换为：
```typescript
      let context = await buildAIContext(projectId)
```

---

### Task 4: 改造 WorldviewPanel.tsx — 使用 `buildAIContext`

**Files:**
- Modify: `src/components/WorldviewPanel.tsx` — `generateWithAI` 方法（第 365-436 行）

**Interfaces:**
- Consumes: `buildAIContext(projectId)` from `src/services/aiContext.ts`

- [ ] **Step 1: 添加 import**

在现有 import 块中增加：
```typescript
import { buildAIContext } from '../services/aiContext'
```

- [ ] **Step 2: 替换 `generateWithAI` 中的 context 构建逻辑**

将（第 376-381 行）：
```typescript
      let context = ''
      try {
        const metaRaw = await readProjectFile(projectId, '', 'project.json')
        const meta = JSON.parse(metaRaw) as { name?: string; genre?: string; description?: string }
        context = `小说名称：${meta.name ?? ''}\n类型：${meta.genre ?? ''}\n简介：${meta.description ?? ''}`
      } catch { /* ignore */ }
```

替换为：
```typescript
      let context = await buildAIContext(projectId)
```

---

### Task 5: LSP 诊断验证

- [ ] **Step 1: 运行 LSP 诊断**

Run: `lsp_diagnostics` 检查所有修改过的文件
Expected: 零 error / warning（允许 pre-existing 的 warning）

- [ ] **Step 2: 运行 TypeScript 编译检查**

Run: `npx tsc --noEmit` (if user approves — per CLAUDE.md rule, must ask first if LSP installed)
Expected: 零 error
