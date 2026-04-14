# Memory Types Specification
# 记忆类型规范 - 基于 Claude Code Session Memory

## 概述

本目录采用 4 类记忆分类，与 Claude Code Session Memory 完全兼容。

## 4 类记忆定义

### 1. user（用户）
**用途：** 存储用户角色、偏好、知识背景

**何时保存：**
- 用户透露职业、角色
- 用户表达偏好（编程语言、工具偏好）
- 用户展示知识背景

**示例：**
```yaml
---
name: user-engineering-background
description: 用户是资深 Python 开发者，首次接触 React
type: user
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T12:00:00Z
---

## 内容

用户有 10 年 Python 开发经验，熟悉后端架构。

解释 React 相关概念时，可以对比 Python/Django 的类似概念。
```

---

### 2. feedback（反馈）
**用途：** 用户对工作的纠正或确认，保留决策上下文

**何时保存：**
- 用户纠正方法 ("不要那样做")
- 用户确认方案 ("对，这样做")
- 用户接受不寻常的选择

**必须包含：**
- **Why:** 用户给出的原因（常有过去的教训）
- **How to apply:** 在什么场景下适用

**示例：**
```yaml
---
name: feedback-no-mock-database
description: 测试时不能 mock 数据库，要用真实数据库
type: feedback
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T12:00:00Z
---

## 规则
集成测试必须使用真实数据库，不能 mock。

**Why:** 上个季度因为 mock 测试通过但生产迁移失败，导致了一次事故。

**How to apply:**
- 所有集成测试连接真实测试数据库
- E2E 测试使用独立的数据库实例
- 禁止在测试中使用 mock 替代真实存储
```

---

### 3. project（项目）
**用途：** 项目状态、目标、里程碑、截止日期

**何时保存：**
- 了解谁在做什么、为什么、截止时间
- 相对日期需转换为绝对日期

**示例：**
```yaml
---
name: project-merge-freeze
description: 周四开始 merge freeze，移动团队切分支
type: project
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T12:00:00Z
---

## 事实
Merge freeze 从 2026-04-10（周四）开始。

**Why:** 移动团队需要切 release 分支。

**How to apply:**
- 非关键 PR 在周四前合并
- 标记任何在 freeze 期间需要合并的紧急工作
```

---

### 4. reference（参考）
**用途：** 外部系统指针、资源位置

**何时保存：**
- 了解外部系统及其用途
- 用户提到某个工具、文档、面板

**示例：**
```yaml
---
name: reference-linear-ingest
description: Linear 项目 INGEST 跟踪所有 pipeline bug
type: reference
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T12:00:00Z
---

## 内容
- **系统:** Linear
- **项目:** INGEST
- **用途:** 跟踪所有 pipeline bug
- **位置:** https://linear.app/org/project/INGEST
```

---

## 什么不应该保存

- ❌ 代码模式、架构、文件路径（可从代码推导）
- ❌ Git 历史（`git log` 更权威）
- ❌ 调试方案（修复在代码里）
- ❌ CLAUDE.md 已有的内容
- ❌ 临时状态、进行中的工作

**即使用户要求保存，也要问"哪部分是不显而易见的"**。

---

## Freshness（新鲜度）

超过 1 天的记忆会收到新鲜度警告：

```
⚠️ 此记忆已创建 N 天，可能过时。验证后再使用。
```

---

## 提取触发条件

### 双阈值机制
- **Token 阈值：** 上下文增长 ≥ 4000 tokens
- **Tool Call 阈值：** 自上次提取后工具调用 ≥ 8 次

两者满足其一即触发。

### Safe Point 检测
- 如果最后一条 assistant 消息包含 tool_call，**等待**
- 在自然对话断点（纯文本回复）时提取

### 提取位置
```
memory/types/{type}/YYYY-MM-DD-{slug}.md
```

---

## 提取 Prompt 模板

```
你是记忆提取专家。从当前会话中提取关键信息。

## 4 类记忆定义

1. **user**: 用户角色、偏好、知识
2. **feedback**: 用户的纠正和确认（必须包含 Why + How to apply）
3. **project**: 项目状态、目标、截止日期
4. **reference**: 外部系统指针

## 规则
- 只提取无法从代码/文件推导的信息
- 日期使用 ISO 格式（如"周四" → "2026-04-10"）
- feedback 必须包含 **Why:** 和 **How to apply:**
- 验证与现有记忆是否冲突，冲突时保留更新的

## 输出格式
更新 memory/types/{type}/ 下的文件，遵循 frontmatter 规范。
```

---

_Last updated: 2026-04-10_
