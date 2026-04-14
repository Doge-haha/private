---
name: memory-extraction-task
version: 1.0.0
description: 记忆提取任务 - 供 cron 调用，在隔离 session 中执行
---

# Memory Extraction Task 🧠

## 任务说明

此任务在独立的 session 中执行，从当前会话中提取关键信息到 typed memory 系统。

## 执行前提

检查是否满足提取条件：
1. Token 增长 ≥ 4000
2. Tool Call ≥ 8 次
3. 距离上次提取 ≥ 30 分钟
4. 最后一条消息无 tool_call（Safe Point）

## 提取流程

### 1. 读取上下文
- 读取最近 N 条消息
- 读取现有记忆文件

### 2. 判断提取
如果满足条件，执行提取。

### 3. 4 类记忆判断

**user:**
- 用户角色、偏好、知识
- 示例："我是数据科学家"

**feedback:**
- 用户纠正或确认
- 必须包含 Why + How to apply
- 示例："不要 mock 数据库"

**project:**
- 项目状态、目标、截止
- 示例："周四开始 merge freeze"

**reference:**
- 外部系统指针
- 示例："Linear 项目 INGEST"

## 输出

更新 memory/types/{type}/YYYY-MM-DD-{slug}.md
更新对应 INDEX.md

## Freshness 检查

读取记忆时检查 mtime，超过 1 天附加警告。

---

## 当前会话消息

{placeholder_for_messages}

---

## 现有记忆文件

{placeholder_for_existing_memories}
