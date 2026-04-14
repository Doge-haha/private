# 🧠 记忆系统快速参考

## 触发命令

| 命令 | 说明 |
|------|------|
| `@prime 提取记忆` | 手动触发记忆提取 |
| `@prime 召回记忆 {关键词}` | 搜索相关记忆 |
| `@prime 记忆统计` | 查看记忆数量 |
| `@prime 搜索记忆 {关键词}` | 全文搜索 |

## 4 类记忆

```
types/user/        → 用户偏好、背景
types/feedback/    → 纠正和确认（需要 Why + How）
types/project/     → 项目状态、目标、截止
types/reference/   → 外部系统指针
```

## Frontmatter 格式

```yaml
---
name: memory-name
description: 一句话描述
type: {user|feedback|project|reference}
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## 内容
```

## Feedback 特殊格式

```yaml
## 规则
{具体规则}

**Why:** {原因}

**How to apply:** {应用场景}
```

## Freshness 警告

超过 1 天的记忆会自动附加：
```
⚠️ 此记忆已创建 N 天，可能过时。验证后再使用。
```

## 触发条件（自动提取）

- Token 增长 ≥ 4000
- Tool Call ≥ 8 次
- 最后一条是纯文本（无 tool_call）

---

_详见 memory/TYPES.md_
