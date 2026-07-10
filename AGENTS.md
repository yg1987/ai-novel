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

### 左右二分栏布局 — 完整高度传递链

适用于写作 / 角色 / 世界观 / 大纲 / 搜索 等所有「左侧列表 + 右侧内容」的 Tab 面板。

**高度传递链（关键，缺一环就崩）：**

```
.app-layout (height: 100vh, flex column)
  │
  ├─ .app-header (flex-shrink: 0)
  │
  ├─ .app-main                  ← ★ 必须有 display: flex; flex-direction: column
  │   (flex: 1, flex column, overflow: hidden)
  │   │
  │   └─ .project-view          ← 必须用 flex: 1 撑满父容器
  │       (flex: 1, flex column, overflow: hidden)
  │       │
  │       ├─ .project-view-header (flex-shrink: 0)
  │       ├─ .project-info-bar  (flex-shrink: 0)
  │       ├─ .project-tabs      (flex-shrink: 0)
  │       │
  │       └─ .project-tab-content  ← 真正的"视口"
  │           (flex: 1, flex column, overflow: hidden)
  │           │
  │           └─ 各 panel 根容器   ← flex: 1 填满可用空间
  │               (flex: 1)
  │               │
  │               ├─ .panel-sidebar / .chapter-sidebar  ← 背景色 + border-right 延伸到底
  │               │   (width: 220px, flex column, flex-shrink: 0)
  │               │
  │               └─ .panel-editor / .chapter-editor-area
  │                   (flex: 1, overflow: hidden)
  │
  └─ ...
```

**核心原则：严禁硬编码高度。**

不得使用 `height: calc(100vh - Npx)`。高度通过 flex 链从 `.app-layout` → `.app-main` → `.project-view` → `.project-tab-content` 逐层传递，各 panel 根容器用 `flex: 1` 拿到实际可用高度。

---

**CSS 模板（完整链路）：**

```css
/* ─── 关键修复：app-main 必须 flex 才能传递高度 */
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── 项目视图：flex: 1 撑满 app-main */
.project-view {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Tab 内容视口 */
.project-tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── 各 panel 根容器：flex: 1 填满 project-tab-content */
.panel-layout {
  display: flex;
  flex: 1;
}

.chapter-manager {
  display: flex;
  flex: 1;
}

/* 不需要左右分栏的 panel 同理 */
.notes-panel,
.foreshadow-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
}

/* ─── 左侧侧栏：背景色 + border-right 自动延伸到底 */
.panel-sidebar,
.chapter-sidebar {
  width: 220px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

/* ─── 右侧内容区：自适应剩余宽度 */
.panel-editor,
.chapter-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

**规则：**

1. **`.app-main` 必须有 `display: flex; flex-direction: column`** — 这是整条链路的咽喉，缺了它所有子元素的 `flex: 1` 都不生效。
2. **所有 panel 根容器用 `flex: 1`，严禁 `height: calc(100vh - Npx)`** — 高度从父容器逐层继承，不依赖视口硬编码。
3. **左侧栏必须 `flex-shrink: 0`** — 防止宽度被右侧内容区挤压。
4. **左侧栏用 `flex-direction: column`** — 让内部 header / list / footer 垂直排列。
5. **右侧内容区用 `flex: 1; overflow: hidden`** — 自适应剩余宽度，内容不溢出。
6. **分割线用 `border-right` 而非额外元素。**

### 需要 banner（顶部提示条）的特殊情况

有些 panel 需要在左右分栏之上放一条提示 banner（如 WorldviewPanel 的品类变更提示），此时根容器用 `flex-direction: column`：

```css
.panel-column-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
}
```

banner 放在外层，下面的 sidebar + editor 包在一个 `display: flex; flex: 1; min-height: 0` 的容器里。

```jsx
<div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
  {banner && <Banner />}
  <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
    <div className="panel-sidebar">...</div>
    <div className="panel-editor">...</div>
  </div>
</div>
```

### 参考实现

| Tab | 根容器 class | 侧栏 | 内容区 |
|---|---|---|---|
| 写作 | `.chapter-manager` | `.chapter-sidebar` | `.chapter-editor-area` |
| 角色 | `.panel-layout` | `.panel-sidebar` | `.panel-editor` |
| 世界观 | 外层 column wrapper + 内层 row | `.panel-sidebar` | `.panel-editor` |
| 大纲 | `.panel-layout` | `.panel-sidebar` | `.panel-editor` |
| 搜索 | `.panel-layout` | `.panel-sidebar` | `.panel-editor` |

## 设计原则

### 新手友好 + 老手可控（Preset + Customize）

所有功能模块必须遵循两层设计：

**第一层 — 预设（Preset）**：新手拿到就能用，有合理的默认值，走完完整流程不需要任何配置。
- 默认配置要覆盖主流使用场景
- 预设要可「一键恢复」到初始状态
- 预设本身是「参考基线」，不是「枷锁」

**第二层 — 用户可改（Customizable）**：老手可以按自己的习惯修改每一个细节。
- 名称、分类、结构层级全部可改
- 增删改操作在 UI 上有直接入口
- 改动只影响当前项目，不污染全局
- 尊重用户的选择，不改动用户没动过的部分

**判断标准**：每次设计新功能时问自己两个问题：
1. "新手第一次打开这个功能，不读文档能不能完成核心操作？"
2. "老手想按自己的方式调整，有没有入口让他改？"

**反面教材**：世界观改造前——"力量体系"和"境界划分"写死在代码里，选都市品类也跳不出来，新手看到不相关的栏目困惑，老手想改也改不了。改造后——按品类给预设，所有名称和结构用户可改，两全其美。
