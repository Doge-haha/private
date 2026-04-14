---
name: memory-extractor
version: 1.0.0
description: Claude Code 风格记忆提取器 - 双阈值触发 + Safe Point 检测 + Fork 隔离执行
---

# Memory Extractor 🧠

基于 Claude Code Session Memory 的智能记忆提取系统。

## 功能

1. **双阈值触发** - Token 增长或 Tool Call 次数触发提取
2. **Safe Point 检测** - 在自然对话断点提取，不打断工具执行
3. **Fork 隔离执行** - 隔离子 agent 提取，不污染主会话
4. **4 类分类** - user / feedback / project / reference
5. **Freshness 警告** - 超过 1 天的记忆自动警告
6. **智能召回** - 根据查询自动检索相关记忆
7. **场景触发** - 关键词匹配自动召回

## 场景触发关键词

| 场景 | 关键词 | 召回类型 |
|------|--------|----------|
| 记忆系统 | 记忆、memory、typed、提取、召回 | user + project |
| 项目 | 项目、任务、进度、当前、进行中 | project |
| 用户偏好 | 我喜欢、我习惯、我希望 | user |
| 反馈 | 不要、应该、纠正、确认 | feedback |
| 外部系统 | Linear、Jira、GitHub、飞书 | reference |
| 技术选型 | 方案、对比、选型、Claude Code | user |
| 知识图谱 | 知识图谱、graphify、图谱、graph.html | user |

## 使用方式

### 手动触发提取
```
@prime 提取记忆
```

### 召回相关记忆
```
@prime 召回记忆 {关键词}
@prime 记忆统计
@prime 搜索记忆 {关键词}
```

## 召回输出格式

```
<relevant-memories>
[user] 记忆名称
描述
> ⚠️ 此记忆已创建 N 天，可能过时。
---
完整内容...
</relevant-memories>
```

## 配置

```yaml
memory:
  extract:
    tokenThreshold: 4000      # 上下文增长阈值
    toolCallThreshold: 8       # 工具调用次数阈值
    maxAgeHours: 24          # 最长提取间隔
  
  freshness:
    warnAfterDays: 1          # 超过此天数警告
```

## 4 类记忆

| 类型 | 目录 | 说明 |
|------|------|------|
| user | memory/types/user/ | 用户偏好、背景 |
| feedback | memory/types/feedback/ | 纠正和确认（需 Why + How） |
| project | memory/types/project/ | 项目状态、目标 |
| reference | memory/types/reference/ | 外部系统指针 |

---

## 内部实现

详见同目录下的实现文件。
