# AI 改写/扩写/润色功能补充计划

> 创建日期：2026-07-10
> 状态：规划中，待执行

---

## 一、背景

文档 `doc/新手起步建议.md` 提到"选中不满意的段落 → 右键 AI 改写此段"，但实际软件中：
1. 写作编辑器的 `✏️ 改写` 按钮在工具栏最右边且仅选中文字时闪现，用户找不到
2. 大纲、世界观、角色编辑器有 AI 生成但没有任何选中后改写入口
3. 素材库有扩写/润色但作用于整篇内容
4. 伏笔面板没有 AI 辅助，描述不可编辑
5. 没有任何地方有右键菜单

---

## 二、各编辑器现状

| 组件 | 编辑器类型 | 已有 AI 按钮 | 选中后改写入口 |
|------|-----------|-------------|--------------|
| Editor（写作） | TipTap 富文本 | ✨ 生成（整章） | ✅ 有 `✏️ 改写` 按钮，但条件渲染且位置隐蔽 |
| OutlinePanel（大纲） | textarea | ✨ AI 辅助（整篇生成） | ❌ 无 |
| WorldviewPanel（世界观） | textarea | ✨ AI 辅助（整段生成） | ❌ 无 |
| CharacterPanel（角色） | textarea | ✨ AI 辅助（整卡生成） | ❌ 无 |
| ResourcePanel（素材库） | textarea+pre | 📝 扩写 / ✨ 润色（整篇） | ❌ 无选区版 |
| ForeshadowPanel（伏笔） | 纯展示 div | ❌ 零 AI | ❌ 不可编辑 |
| NotesPanel（备注） | 纯展示 div | ❌ 零 AI | ❌ 不可编辑 |
| ReviewPanel（审查） | 卡片列表 | ✅ AI 诊断 | N/A（语义不同） |
| BrainstormPanel（灵感） | 纯展示 p | ✅ 生成创意 | ❌ 结果不可编辑 |

---

## 三、功能说明

三个模式的语义区别：

| 模式 | 行为 | 长度变化 | 典型场景 |
|------|------|---------|---------|
| 改写 | 保持内容不变，换一种更好的说法 | 基本不变 | 句子读着不顺、节奏不好 |
| 扩写 | 补充细节描写、感官、心理活动 | 变长 1.5-2x | 写得不够细、场景太单薄 |
| 润色 | 最小改动，只修正语法语病 | 几乎不变 | 错别字、"的得地"混用 |

---

## 四、执行计划

### 第 1 阶段：工具栏按钮（预计改动 5-7 个文件）

#### 目标

在所有有编辑器的面板上，工具栏区域增加 `✏️ 改写` `📝 扩写` `✨ 润色` 三个按钮。

按钮行为：
- 有选中文字时 → 对选中部分进行改写/扩写/润色
- 没有选中文字时 → 按钮灰掉不可点击（但可见），提示"请先选中文字"

#### 4.1 编辑器具体改动

##### 4.1.1 Editor.tsx（写作编辑器）

**现状**：第 199-202 行的 `✏️ 改写` 按钮在 toolbar-spacer 之后，条件渲染（选中文字才出现）。

**改动**：
1. 移除 `editor.state.selection.from !== editor.state.selection.to` 条件渲染
2. 改为 `✏️ 改写` `📝 扩写` `✨ 润色` 三个并排按钮，无选中时置灰
3. 位置保持在工具栏末尾（spacer 之后，生成/保存按钮之前）
4. 各按钮调用 `handleRewrite(mode: RewriteMode)` 而非当前单一 `handleRewrite`
5. RewriteService 的 `rewriteText` 已支持三种模式，无需改动

**涉及代码**：
- `Editor.tsx`：修改第 199-202 行
- `rewriteService.ts`：确认已有 `rewrite/expand/polish` 三种模式（已验证）

##### 4.1.2 OutlinePanel.tsx（大纲编辑器）

**现状**：第 530-540 行有一个 `textarea`，第 441-448 行有 `✨ AI 辅助` 按钮。

**改动**：
1. 在编辑模式下的工具栏添加 `✏️ 改写` `📝 扩写` `✨ 润色` 三个按钮
2. 添加 `textareaRef = useRef<HTMLTextAreaElement>(null)`，绑定到 textarea
3. 实现 `handleRewrite(mode)`：
   - 通过 `textareaRef.current.selectionStart/selectionEnd` 获取选区
   - 获取 `beforeText`（选区前 200 字）和 `afterText`（选区后 200 字）
   - 调用 `rewriteService.rewriteText()`（与 Editor 共用）
   - 接受时拼接：`content.slice(0, start) + newText + content.slice(end)`
4. 无选中时按钮置灰

**涉及代码**：
- `OutlinePanel.tsx`：新增 ref、state、handler，修改工具栏
- 复用 `RewritePreview.tsx` 或直接替换内容（与 Editor 共用组件）

##### 4.1.3 WorldviewPanel.tsx（世界观编辑器）

**现状**：支持两种编辑模式——
- **自由格式**（重要地点、全局时间线）：单个 textarea，内容在 `content` state（第 444-450 行）
- **子字段**（世界背景、势力列表、力量体系）：每个字段独立的 textarea，内容在 `subValues[key]`（第 481-486 行）

**改动**：
1. 每个 textarea 增加独立的改写/扩写/润色按钮
2. 每个 textarea 绑定一个 `useRef<HTMLTextAreaElement>`
3. 子字段模式下，改写后拼接回 `setSubValues(prev => ({...prev, [key]: ...}))`
4. 自由格式模式下，拼接回 `setContent()`

**涉及代码**：`WorldviewPanel.tsx`

##### 4.1.4 CharacterPanel.tsx（角色编辑器）

**现状**：第 393-399 行单个 textarea，内容在 `content` state。

**改动**：与 OutlinePanel 类似，在编辑模式的工具栏加三个按钮。

**涉及代码**：`CharacterPanel.tsx`

##### 4.1.5 ResourcePanel.tsx（素材库）

**现状**：第 257-294 行已有"📝 扩写"和"✨ 润色"按钮，但作用于整篇 `editContent`，且使用 `resourceAI.expandResource` 而非 `rewriteService`。

**改动**：
1. 改为选区模式（有选中改选中，无选中整篇）
2. 接入 `rewriteService`（与其它面板统一）
3. 增加 `✏️ 改写` 按钮

**涉及代码**：`ResourcePanel.tsx`

##### 4.1.6 ForeshadowPanel.tsx / NotesPanel（可选）

**改动**：
1. 先将 description/content 改为可编辑（textarea）
2. 再添加三个改写按钮

#### 4.2 三层架构

```
<RewriteButtons>            → 共享 UI 组件（按钮 + 置灰逻辑）
rewriteUtils.ts             → 纯工具函数（选区获取 + 结果拼接）
RewritePreview              → 已有组件（AI 结果预览弹窗，不变）
```

各层职责清晰、可独立修改。

#### 4.3 共享组件：`<RewriteButtons>`

新建 `src/components/RewriteButtons.tsx`：

```tsx
interface Props {
  /** 改写按钮是否可用（有选中文字时 true） */
  enabled: boolean
  /** loading 状态 */
  loading?: boolean
  /** 回调 */
  onRewrite: () => void
  onExpand: () => void
  onPolish: () => void
}
```

- 三个按钮并排：`✏️ 改写` `📝 扩写` `✨ 润色`
- `enabled=false` 时按钮置灰，`title` 提示"请先选中文字"
- `loading=true` 时禁用按钮，显示"生成中…"
- 无多余逻辑，各面板自行决定如何获取选区和拼接结果

#### 4.4 共享工具函数：`rewriteUtils.ts`

保持之前的工具函数设计，纯函数无依赖。



#### 4.5 阶段一涉及文件清单

| 文件 | 改动类型 | 预计行数 |
|------|---------|---------|
| `src/services/rewriteUtils.ts` | 新建 | ~40 行 |
| `src/components/RewriteButtons.tsx` | 新建 | ~50 行 |
| `src/components/Editor.tsx` | 修改 | ~20 行 |
| `src/components/OutlinePanel.tsx` | 修改 | ~60 行 |
| `src/components/WorldviewPanel.tsx` | 修改 | ~80 行 |
| `src/components/CharacterPanel.tsx` | 修改 | ~50 行 |
| `src/components/ResourcePanel.tsx` | 修改 | ~30 行 |
| `src/style.css` | 修改 | ~40 行（按钮样式） |

---

### 第 2 阶段：右键菜单（预计新增 1 个组件，改动 2-3 个文件）

#### 目标

在任何可编辑的区域，选中文字后右键弹出菜单，包含"AI 改写 / AI 扩写 / AI 润色"三个选项。

#### 实现方案

**新建 `src/components/SelectionContextMenu.tsx`**

```tsx
// 通用选中文字右键菜单组件
interface Props {
  x: number
  y: number
  onRewrite: () => void
  onExpand: () => void
  onPolish: () => void
  onClose: () => void
}
```

**使用方式**：
- `Editor.tsx`：使用 TipTap 的 `editorProps.handleDOMEvents.contextMenu`
- `OutlinePanel.tsx` / `WorldviewPanel.tsx` / 其他 textarea：绑定 `onContextMenu` 事件
- 取出选中文字后，调用与第 1 阶段相同的 `rewriteService.rewriteText()`

**关闭方式**：
- 点击菜单外部区域
- 按 Escape 键
- 选择了菜单项后

#### 关键交互细节

1. **菜单定位**：出现在鼠标位置 (`clientX, clientY`)
2. **菜单样式**：小型浮层（100-120px 宽），点选后关闭
3. **选中文字获取**：TipTap 用 `editor.state.selection`，textarea 用 `selectionStart/End`
4. **禁用态**：无选中文字时不显示菜单（系统右键菜单正常弹出）

#### 阶段二涉及文件清单

| 文件 | 改动类型 | 预计行数 |
|------|---------|---------|
| `src/components/SelectionContextMenu.tsx` | 新建 | ~80 行 |
| `src/components/Editor.tsx` | 修改 | ~10 行 |
| `src/components/OutlinePanel.tsx` | 修改 | ~10 行 |
| `src/components/WorldviewPanel.tsx` | 修改 | ~10 行 |
| `src/components/CharacterPanel.tsx` | 修改 | ~10 行 |
| `src/components/ResourcePanel.tsx` | 修改 | ~10 行 |
| `src/style.css` | 修改 | ~50 行 |

---

## 五、关键技术决策

### 5.1 选区 API

| 编辑器类型 | 选区获取方式 |
|-----------|------------|
| TipTap（Editor.tsx） | `editor.state.selection.from/to` + `editor.state.doc.textBetween()` |
| textarea（其他面板） | `textareaRef.current.selectionStart/selectionEnd` |

### 5.2 上下文获取

统一取选中文字前后各 200 字符，传给 `rewriteService.rewriteText()`：

```typescript
{
  selectedText: "...",  // 选中文字
  beforeText: "...",    // 前 200 字
  afterText: "...",     // 后 200 字
  mode: 'rewrite' | 'expand' | 'polish'
}
```

### 5.3 改写结果处理

| 编辑器 | 接受后替换方式 |
|--------|--------------|
| Editor（TipTap） | `editor.chain().deleteRange({from,to}).insertContent(newText).run()` |
| textarea 面板 | `content.slice(0, start) + newText + content.slice(end)` |

### 5.4 AI 服务层复用

`rewriteService.ts` 已支持三种模式，无需修改。所有面板共用同一套 AI 调用逻辑。

---

## 六、执行顺序

```
第 1 期：rewriteUtils.ts 共享工具
  ↓
第 2 期：Editor.tsx 工具栏改造（3 个按钮常驻显示，有选中时激活）
  ↓
第 3 期：OutlinePanel.tsx 加改写按钮
  ↓
第 4 期：WorldviewPanel.tsx 加改写按钮
  ↓
第 5 期：CharacterPanel.tsx 加改写按钮
  ↓
第 6 期：ResourcePanel.tsx 改造为选区模式
  ↓
第 7 期：ForeshadowPanel.tsx / NotesPanel 改为可编辑 + 加改写按钮（可选）
  ↓
第 8 期：SelectionContextMenu 组件 + 在各面板集成右键菜单
```

各部分独立，可按任意顺序分期执行。

---

## 七、边界情况

1. **空选区**：按钮置灰，显示 tooltip "请先选中文字"
2. **选中文字过长**（>2000 字）：截断后传给 AI
3. **AI 调用失败**：显示错误提示，不影响编辑器内容
4. **改写结果为空**：不替换，提示"AI 未生成有效结果"
5. **编辑器处于只读模式**：隐藏改写按钮
6. **正在生成中**：禁用按钮，显示 loading 状态

---

## 八、完成标准

1. 所有编辑器（写作/大纲/世界观/角色/素材库）工具栏有 3 个按钮：✏️ 改写 / 📝 扩写 / ✨ 润色
2. 选中文字后按钮可用，点击后调用 AI 改写选中部分
3. 改写结果可接受/拒绝
4. 无选中文字时按钮置灰
5. 右键菜单在选中文字后弹出，功能与工具栏按钮一致
6. 所有功能与现有 AI Provider 配置兼容
