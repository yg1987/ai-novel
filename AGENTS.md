# AI Novel Writer — 项目约定

## 执行纪律

### 不得擅自走 fallback

当计划/方案中同时指定了**主方案（primary）**和**备选方案（fallback）**时：

1. **必须先尝试主方案。** 不得以"估计不行""可能有问题"为由跳过主方案直接走 fallback。必须实际执行主方案的步骤（添加依赖、编译、运行），拿到明确的失败证据。
2. **失败后必须汇报。** 如果主方案确实失败，向用户展示失败证据（编译错误日志、运行时错误等），说明原因，让用户决定是修问题还是走 fallback。
3. **不得替用户决策。** Fallback 不是默认路径。任何时候走 fallback 都必须经过用户确认。

### 不得私自偏离已确认方案

用户确认过的方案/计划，执行时必须严格遵循。如果执行中发现方案有问题或不可行，必须：

1. 暂停执行
2. 向用户说明具体问题
3. 提出修正方案
4. 等用户确认后再继续

> **教训：** 本项目 v0.3 的向量搜索，用户选了 Phase B（LanceDB），计划也写了加 `lancedb` crate，但执行时直接用了 JSON fallback，从未尝试添加依赖/编译，也未经用户确认。参考项目 QMAI 在 Windows 上完整实现了 LanceDB 并正常运作，证明不存在技术障碍——纯粹是执行偷懒。

## Layout 约定

### 左右二分栏布局（写作 / 角色 / 世界观 / 大纲）

所有分为「左侧列表 + 右侧内容」的 Tab 面板，统一遵循以下样式：

```
┌──────────────────────────────────────────┐
│  左侧侧栏 (sidebar)    │  右侧内容区    │
│  background: bg-sidebar│  flex: 1       │
│  border-right          │               │
│  flex-shrink: 0        │               │
│  flex-direction: column │               │
└──────────────────────────────────────────┘
```

**CSS 模板：**

```css
/* 父容器：撑满视口高度 */
.panel-layout {
  display: flex;
  height: calc(100vh - 110px);  /* 与写作 tab 保持一致 */
}

/* 左侧侧栏 */
.panel-sidebar {
  width: 220px;                  /* 固定宽度 */
  background: var(--bg-sidebar); /* 通栏背景色 */
  border-right: 1px solid var(--border); /* 右侧分割线 */
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

/* 右侧内容区：自适应填满剩余空间 */
.panel-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

**要点：**
- 父容器必须使用 `height: calc(100vh - 110px)` 而不是 `height: 100%`，否则 `height: 100%` 在 flex 链中不一定能正确计算
- 左侧栏用 `flex-direction: column` 让内部列表项可撑满高度
- 右侧内容区用 `flex: 1` 自适应剩余宽度
- 分割线用 `border-right` 而非额外元素

### 参考实现

- **写作 tab**: `ChapterManager` → `.chapter-manager` / `.chapter-sidebar` / `.chapter-editor-area`
- **角色/世界观/大纲 tab**: `CharacterPanel` / `WorldviewPanel` / `OutlinePanel` → `.panel-layout` / `.panel-sidebar` / `.panel-editor`
