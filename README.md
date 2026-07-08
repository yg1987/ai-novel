# AI Novel Writer

> 🧪 个人练手项目，使用 [OpenCode](https://github.com/opencode-ai/opencode) + DeepSeek 开发，主要目的是熟悉 AI 辅助编程的工作流。代码质量仅供参考。

AI 辅助网文写作桌面工具。Tauri 2 + React + TypeScript + TipTap，本地优先，支持多 AI Provider。

> 参考项目：[character-arc](https://github.com/uu201/character-arc) · [QMAI](https://github.com/Mochocyang/QMAI) · [oh-story-claudecode](https://github.com/worldwonderer/oh-story-claudecode) · [MuMuAINovel](https://github.com/xiamuceer-j/MuMuAINovel)

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2 (Rust) |
| 前端 | React 19 + TypeScript 6 + Vite 8 |
| 编辑器 | TipTap (ProseMirror) |
| AI 协议 | OpenAI 兼容（SSE 流式） |
| 存储 | 文件系统（Markdown + JSON） |

## 功能状态

### ✅ v0.1 — 核心写作循环

- [x] 书架管理（多项目 + 分组/状态标签）
- [x] 项目管理（创建/打开/保存/删除）
- [x] TipTap 富文本编辑器 + 自动保存
- [x] AI 流式生成正文（SSE）+ 中断/继续
- [x] AI Provider 配置面板（多 Provider 切换）
- [x] 上下文引擎（章节目标 + 上一章结尾注入）

### ✅ v0.2 — 设定管理

- [x] 角色 CRUD + 角色卡编辑
- [x] 世界观条目管理（世界背景/势力/地点/力量体系/时间线）
- [x] 三层大纲系统（总纲 + 分卷 + 章节细纲）
- [x] 注释/批注系统（备注 + TODO）

### ✅ 记忆系统（v0.3）

- [x] Chapter Ingest — 保存后 AI 自动提取结构化快照
- [x] 伏笔追踪面板 — 状态机 + 紧迫度排序
- [x] 角色认知系统 — 知道/不知道/读者知道
- [x] 上下文引擎完整版 — DataSourceRegistry 架构 + 角色认知 + 伏笔 + 文风注入 prompt
- [x] 关键词 + 向量混合搜索 — CJK 分词 + RRF 融合 + LanceDB ANN
- [x] 写作统计看板 — JSONL 事件日志 + 日更/趋势/伏笔债评分

### 🚧 质量保障（v0.4）

- [x] AI 禁用词检测（基于 oh-story 词表，25+ 模式，1-5 星毒级）
- [x] 自动一致性审查（时间线/角色认知/伏笔/设定自洽，Tier 1 确定性规则 + Tier 2 AI 深度审查）
- [x] 局部改写/扩写
- [x] 章节版本历史
- [x] 审查报告面板
- [x] 素材库基础版（CRUD + 分类文件夹）

### 📋 规划中（v0.5+）

- 关系图谱可视化 · 章节关系图 · 灵感/脑暴模式 · 专注模式
- 发布格式适配 · 数据导出（TXT/Markdown/epub）
- 项目存档/导入 · 全局搜索 · 写作风格管理
- 素材库完整版 · 热门题材参考

## 快速开始

```bash
# 依赖
npm install

# 开发模式
npm run tauri:dev

# 生产构建
npm run tauri:build
```

首次启动后，点击右上角 **⚙ AI 配置** 填入 API 地址和 Key 即可使用 AI 功能。

## 数据存储

所有数据为本地文件，不依赖数据库。工作空间结构：

```
ai-novel-workspace/
├── projects.json          # 书架索引
├── resources/             # 素材库
└── projects/
    └── <project-id>/
        ├── project.json   # 项目元数据
        ├── .lancedb/      # 向量索引（LanceDB ANN 嵌入式向量库，自动管理）
        ├── characters/    # 角色文件
        ├── worldview/     # 世界观设定
        ├── outline/       # 大纲
        ├── chapters/      # 章节正文
        ├── notes/         # 笔记
        ├── memory/        # AI 记忆（snapshots/foreshadows/cognition/timeline）
        ├── stats/         # 写作统计事件日志
        └── tracks/        # 追踪信息（review-reports）
```

## 架构

```
┌──────────────────────────────────────────────────┐
│                  Tauri Shell                       │
│  ┌────────────────────────────────────────┐      │
│  │    Frontend (React + TypeScript)       │      │
│  │                                         │      │
│  │  ┌──────┐ ┌──────┐ ┌───────┐ ┌──────┐ │      │
│  │  │编辑器│ │项目  │ │角色/  │ │伏笔/ │ │      │
│  │  │TipTap│ │管理  │ │大纲   │ │统计  │ │      │
│  │  └──────┘ └──────┘ └───────┘ └──────┘ │      │
│  │                                         │      │
│  │  ┌──────────────────────────────┐      │      │
│  │  │    AI Orchestration Layer    │      │      │
│  │  │ DataSourceRegistry           │      │      │
│  │  │  ├─ cognitionDS  ─────────── │      │      │
│  │  │  ├─ foreshadowDS ─────────── │      │      │
│  │  │  ├─ searchDS ←──│───┬────── │      │      │
│  │  │  └─ 其他 7 个 DS ───│─────── │      │      │
│  │  │ Ingest │ Review │ Stats     │      │      │
│  │  └──────────────────────────────┘      │      │
│  │     │ HTTP (OpenAI)    │ Embedding API│      │
│  └────────────────────────────────────────┘      │
│          │ Tauri Commands                         │
│  ┌───────▼────────────────────────────┐          │
│  │      Rust Backend                  │          │
│  │  文件 I/O │ LanceDB ANN 向量检索    │          │
│  │  项目版本管理                       │          │
│  └────────────────────────────────────┘          │
└──────────────────────────────────────────────────┘
```

## 环境要求

- Node.js 22.12+ 
- Rust 1.70+（MSVC toolchain）
- Visual Studio 2022 Build Tools（含 C++ 工作负载）
- Windows 10+（WebView2 运行时）
