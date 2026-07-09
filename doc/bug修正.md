# Bug 修正记录

## 2026-07-09

### 1. AI Provider 配置 — 获取模型列表

**问题**：AI Provider 配置中的写作模型、分析模型、审查模型、Embedding 四个字段全部需要手动输入模型名，用户需要知道精确的模型 ID 才能填写，体验差。

**改进**：在 API 地址和 Key 下方新增「🔍 获取模型列表」按钮，调用 OpenAI 兼容的 `GET /models`（失败时回退 `/v1/models`）接口拉取可用模型列表。获取成功后：
- 4 个输入框自动变为 `<select>` 下拉选择
- 下拉选项包含所有返回的模型 ID
- 顶部保留当前已填的值（如果不在列表中）
- 底部提供「✏ 手动输入」选项，可随时切回输入框
- 按钮下方显示模型名标签列表（可滚动），方便概览

**涉及文件**：`src/components/ProviderConfig.tsx`、`src/style.css`

---

### 2. 项目列表 — 删除项目

**问题**：前端有 `deleteProject` API 调用，Rust 后端也有 `delete_project` 命令，但项目列表上没有删除入口，创建的项目无法删除。

**改进**：
- 项目卡片 hover 时右侧浮现 ✕ 删除按钮
- 点击后弹出 `window.confirm` 确认：「确定删除项目「xxx」？此操作不可恢复，所有章节和设定将被永久删除。」
- 确认后调用 `deleteProject` 删除索引和整个项目目录
- 如果当前正在查看被删除的项目，自动退回书架视图
- 删除后自动刷新列表

**涉及文件**：`src/components/ProjectList.tsx`、`src/App.tsx`

---

### 3. 项目信息 — 编辑项目元数据

**问题**：创建项目时填写的书名、类型、简介、目标字数在创建后无法修改，没有任何编辑入口。

**改进**：
- 新建 `EditProjectDialog` 组件，复用创建对话框的表单结构
- 项目卡片 hover 时右侧浮现 ✎ 编辑按钮
- 编辑对话框预填当前项目的所有字段
- 支持修改：书名、类型、简介、目标字数
- 调用 `updateProject` 更新索引和磁盘上的 `project.json`
- 保存后自动刷新列表

**涉及文件**：`src/components/EditProjectDialog.tsx`（新建）、`src/App.tsx`

---

### 4. 项目列表 — 状态切换

**问题**：项目创建时固定状态为「连载中」，之后无法修改。`UpdateProjectInput` 和 Rust 后端 `update_project` 虽然支持 `status` 字段，但前端没有入口。

**改进**：
- 编辑对话框中新增「状态」下拉选择（连载中 / 完结 / 搁置）
- 与「类型」字段并排显示在 `.form-row` 布局中
- 状态颜色同步：连载中（橙色）、完结（绿色）、搁置（灰色）

**涉及文件**：`src/components/EditProjectDialog.tsx`、`src/style.css`

---

### 5. 项目列表 — 排序

**问题**：项目列表无序排列，新创建的项目可能出现在任意位置。

**改进**：`ProjectList` 按 `created_at`（Unix 时间戳）降序排列，最新创建的项目始终在最上方。

**涉及文件**：`src/components/ProjectList.tsx`

---

### 6. Rust 编译警告 — 未使用的 import

**问题**：`cargo build` 弹出 3 个 `unused import` 警告：

```
warning: unused import: `flate2::read::GzDecoder`
warning: unused import: `flate2::write::GzEncoder`
warning: unused import: `flate2::Compression`
```

**原因**：`src/commands/archive.rs` 顶部 `use` 导入了三个 `flate2` 项，但函数体内使用的是全路径调用（如 `flate2::write::GzEncoder::new()`），导致 import 未被使用。

**修复**：删除 3 行未使用的 `use` 语句。

**涉及文件**：`src-tauri/src/commands/archive.rs`

---

### 7. 项目内 — 简介展示优化

**问题**：项目简介在 `ProjectView` 顶部与类型、目标字数挤在同一行展示，内容过长时会撑爆布局，不易阅读。

**改进**：
- 将简介从 `.project-info-bar` 移除，独立为 `.project-desc` 单独一行
- CSS 单行截断（`white-space: nowrap` + `text-overflow: ellipsis`）
- 鼠标悬停时通过 `title` 属性查看完整内容
- 创建和编辑对话框的简介输入框增加 `maxLength={200}` 限制，placeholder 改为「一句话简介（限200字）」

**涉及文件**：`src/components/ProjectView.tsx`、`src/components/CreateProjectDialog.tsx`、`src/components/EditProjectDialog.tsx`、`src/style.css`

---

### 8. 删除确认 — window.confirm 改为自定义确认弹窗

**问题**：删除项目时使用 `window.confirm()`，在 Tauri WebView2 环境中可能不生效（用户反馈点击 ✕ 后直接删除，未弹出确认框）。

**改进**：
- 新建 `ConfirmDialog` 组件，与项目其他对话框风格一致
- 删除 ✕ 按钮改为弹出确认弹窗，显示项目名称和不可恢复警告
- 确认按钮使用 `.btn-danger` 红色样式警示
- 增加 `.btn-danger` CSS 样式

**涉及文件**：`src/components/ConfirmDialog.tsx`（新建）、`src/components/ProjectList.tsx`、`src/style.css`

---

### 9. Tab 栏换行 — 窄窗口下 tabs 换行显示

**问题**：写作区共有 14 个功能 tab（写作/角色/世界观/大纲/备注/伏笔/搜索/统计/审查/素材/灵感/关系图/热门/章节图），默认窗口 1200px 宽度下大部分 tab 会折行显示，布局拥挤。

**改进**：
- `.project-tabs` 容器改为 `overflow-x: auto` + `white-space: nowrap`，tab 不换行，溢出时横向滚动
- 底部增加细滚动条指示可滚动（`scrollbar-width: thin`）
- `tab-btn` padding 从 `10px 16px` 缩小至 `10px 12px`，省出更多空间
- 默认窗口大小从 1200×800 调整为 1400×900

**涉及文件**：`src/style.css`、`src-tauri/tauri.conf.json`
