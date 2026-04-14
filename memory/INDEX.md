# Memory Index

OpenClaw 记忆系统主索引。

## 系统架构

```
记忆系统（4 层）
├── Layer 1: Native Memory
│   └── MEMORY.md / agents/ / skills/memory/
├── Layer 2: Working Memory
│   └── types/ (typed memory - Claude Code 风格)
├── Layer 3: Session Context
│   └── compaction-plus (9 段结构化摘要)
└── Layer 4: Long-term Memory
    └── memory-core (.dreams/ 向量)
```

## 4 类记忆（types/）

| 类型 | 目录 | 说明 | 示例 |
|------|------|------|------|
| user | `types/user/` | 用户偏好、背景 | "用户是 Python 专家" |
| feedback | `types/feedback/` | 纠正、确认 | "不要 mock 数据库" |
| project | `types/project/` | 项目状态、目标 | "周四开始 merge freeze" |
| reference | `types/reference/` | 外部系统指针 | "Linear 项目 INGEST" |

## 统计

| 类型 | 数量 | 最新更新 |
|------|------|----------|
| user | 1 | 2026-04-10 |
| feedback | 1 | 2026-04-10 |
| project | 1 | 2026-04-10 |
| reference | 0 | - |

**总计：3 条记忆**

## 触发机制

| 触发方式 | 说明 |
|----------|------|
| Cron | 每 30 分钟自动检查 |
| 手动 | `@prime 提取记忆` |

## 召回机制

| 命令 | 说明 |
|------|------|
| `@prime 召回记忆 {关键词}` | 搜索相关记忆 |
| `@prime 记忆统计` | 查看统计 |
| `@prime 搜索记忆 {关键词}` | 全文搜索 |

## 文件位置

```
memory/
├── INDEX.md              ← 本文件
├── TYPES.md             ← 类型规范
├── types/
│   ├── user/
│   │   ├── INDEX.md
│   │   └── *.md
│   ├── feedback/
│   │   ├── INDEX.md
│   │   └── *.md
│   ├── project/
│   │   ├── INDEX.md
│   │   └── *.md
│   └── reference/
│       ├── INDEX.md
│       └── *.md
└── skills/
    └── memory-extractor/
        ├── SKILL.md
        ├── extract.ts
        └── recall.ts
```

---

_Last updated: 2026-04-10_
