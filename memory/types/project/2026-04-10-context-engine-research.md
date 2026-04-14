---
name: project-context-engine-research
description: OpenClaw 上下文压缩/装配技术研究，包含 compaction-plus 和 context-gear 两个核心插件
type: project
created: 2026-04-10T14:00:00Z
updated: 2026-04-10T14:00:00Z
---

## 研究目标

为 OpenClaw 实现更智能的上下文管理，参考 Claude Code 的记忆和压缩机制。

## 核心技术成果

### 1. compaction-plus（增强压缩插件）

**功能：**
- 9 段结构化摘要（Claude Code 风格）
- 局部压缩（Partial Compaction）— 保留早期摘要，只压缩新内容
- 熔断保护（Circuit Breaker）— 连续失败时自动降级

**源码位置：** `/Users/huahaha/.openclaw/extensions/compaction-plus/`

**技术实现：**
- `summarizer.js` — 构建结构化摘要 prompt
- `partial.js` — 分割消息 + 合并历史摘要
- `circuit-breaker.js` — 熔断器实现

**配置选项：**
- `circuitBreakerThreshold`: 连续失败次数阈值（默认 3）
- `circuitBreakerResetMs`: 冷却时间（默认 60000ms）

---

### 2. context-gear（选择性上下文装配引擎）

**功能：**
- 相关性评分 — 消息与当前任务的相关度
- Token 预算管理 — 预算内选择最相关的内容
- 桥接摘要 — 连接历史摘要和当前上下文
- transcript 重写 — 压缩后安全重写 transcript

**源码位置：** `/Users/huahaha/.openclaw/extensions/context-gear/`

**核心逻辑（engine.js）：**
```
bootstrap → 从会话文件恢复历史消息
ingest → 滚动记录消息
assemble → 相关性评分 + Token 预算选择 + 桥接摘要
maintain → transcript 安全重写
afterTurn → 超预算时主动触发压缩
```

---

## 为什么需要这两个插件

| 问题 | 解决方案 |
|------|----------|
| 长对话上下文膨胀 | compaction-plus 局部压缩 |
| 压缩破坏历史摘要 | partial compaction 保留早期摘要 |
| 压缩失败导致循环 | circuit breaker 自动降级 |
| 无关内容占用 token | context-gear 相关性评分 |
| token 预算不足 | 预算管理 + 选择性装配 |

## Why

用户追求"无限会话"能力，需要智能的上下文管理而不是简单的截断。

## How to apply

- context-gear 作为 context engine 插件运行
- compaction-plus 作为 compaction provider 运行
- 两者可协同工作：context-gear 选择内容 → compaction-plus 压缩
