# Vite 构建体积提示后续优化

> 创建日期：2026-07-16
> 状态：待后续处理

## 一、当前提示

`npm run build` 可以正常通过，但 Vite 会提示两类 warning：

1. `src/services/reviewService.ts` 同时被动态导入和静态导入，动态导入无法拆成独立 chunk。
2. 主 JS chunk 超过 500 kB，目前 `dist/assets/index-*.js` 约 1.5 MB。

这些不是编译错误，不影响当前功能运行。

## 二、原因判断

### 2.1 reviewService 动态导入无效

相关文件：

- `src/services/savePipeline.ts`
- `src/components/ReviewPanel.tsx`
- `src/services/statsService.ts`
- `src/services/reviewService.ts`

原因：

- `savePipeline.ts` 顶部已经静态导入 `runAndSaveLightCheck`。
- `savePipeline.ts` 内部又对 `reviewService` 做了动态 `import('./reviewService')` 来加载 `runDeepReview`。
- `ReviewPanel.tsx` 静态导入 `runAndSaveLightCheck`、`runDeepReview`、`loadChapterReviews`。
- `statsService.ts` 静态导入 `loadChapterReviews`。

因此 `reviewService.ts` 已经进入主依赖图，动态导入不会再拆包。

### 2.2 主 chunk 过大

相关文件：

- `src/components/ProjectView.tsx`
- `vite.config.ts`

原因：

`ProjectView.tsx` 静态导入了几乎所有 Tab 组件：

- 写作
- 角色
- 世界观
- 大纲
- 备注
- 伏笔
- 搜索
- 统计
- 审查
- 素材
- 灵感
- 关系图
- 热门
- 章节图

这些 Tab 又带入较重依赖：

- 写作编辑器：`@tiptap/*`
- 关系图：`sigma`、`graphology`、`graphology-layout-forceatlas2`
- 统计：`recharts`
- 章节图：`d3-force`

因为都是静态 import，即使用户只打开默认写作 Tab，其他 Tab 的代码也会被打入主包。

## 三、后续处理建议

### 方案 A：只消除 reviewService warning

把 `savePipeline.ts` 中的动态 `import('./reviewService')` 改为普通静态调用。

优点：

- 改动最小。
- 可以消除 `INEFFECTIVE_DYNAMIC_IMPORT` warning。

缺点：

- 不会减少主包体积。

### 方案 B：Tab 级懒加载

在 `ProjectView.tsx` 中用 `React.lazy` / `Suspense` 懒加载非首屏 Tab，优先处理重模块：

1. `RelationshipGraph`
2. `StatisticsPanel`
3. `ReviewPanel`
4. `ResourcePanel`
5. `TrendingPanel`
6. `ChapterGraph`

优点：

- 真正减少首屏主 chunk。
- 改动范围主要集中在 `ProjectView.tsx`。

缺点：

- 需要处理 Tab 切换时的 loading 状态。
- 要确认导航回调和初始参数仍正常传递。

### 方案 C：拆分 reviewService

把 `reviewService.ts` 拆成更细服务：

- 轻量审查保存：例如 `reviewLightStorage.ts`
- 深度 AI 审查：例如 `reviewDeepService.ts`
- 审查报告读取聚合：例如 `reviewReportStorage.ts`

优点：

- 可以让深度审查逻辑真正按需加载。
- 服务职责更清晰。

缺点：

- 改动面比方案 A/B 大。
- 需要回归审查面板、保存后检查、统计面板。

## 四、推荐顺序

1. 先做方案 B：Tab 级懒加载，优先降低主 JS chunk。
2. 再做方案 C：拆分 `reviewService`，让深度审查真正按需加载。
3. 如果短期只想清掉 warning，可以临时做方案 A，但这只是治标。

当前建议：后续作为独立优化任务处理，不和关系图功能修复混在一起。
