---
name: user-knowledge-graph-auto-open
description: 用户偏好：提到"知识图谱"时自动打开 graph.html
type: user
created: 2026-04-13T08:30:00Z
updated: 2026-04-13T08:30:00Z
---

## 内容

用户要求：当对话中提到"知识图谱"、"graphify"或相关词语时，**自动**执行：

```bash
open /Users/huahaha/.openclaw/workspace/graphify-out/graph.html
```

不需要用户额外确认，作为默认行为。

**Why:** 用户频繁使用知识图谱，希望零摩擦访问。

**How to apply:**
- 触发词：知识图谱、graphify、图谱、graph.html
- 行动：立即执行 `open` 命令打开 HTML
- 无需询问，直接执行
