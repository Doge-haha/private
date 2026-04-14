# Claude Code vs OpenClaw 深度对比研究
**研究日期**: 2026-04-13（15:13 初稿 → 15:36 基于源码纠错）
**研究员**: @research

---

## ⚠️ 重要更正：之前研究的关键错误

| 错误观点 | 正确结论 |
|---|---|
| "Claude Code 有自动重试" | **根本不做机械重试**，靠 Coordinator 判断决定下一步 |
| "retry 参数：默认3次" | 无此机制，纯算法决策 |
| "rules.md 是单文件" | 实际是 **`.claude/rules/` 目录**，按目录层级自动加载 |
| "Task 状态存 JSON" | 每个 task 有独立 **outputFile** 持久化，重启可恢复 |

---

## 研究一：Tool 失败处理机制（纠错版）

### Claude Code 实际行为

**不做自动重试**。这是设计哲学，不是缺陷。

失败后的处理由 **Coordinator** 决策：

```
失败后选择：
├── Spawn fresh    — 错误上下文已污染，开新 agent
├── Continue       — 错误有参考价值，修复后继续
└── Report        — 无法恢复，告知用户
```

判断规则（源码注释）：
| 场景 | 决策 | 原因 |
|---|---|---|
| 研究探索广泛，实现范围窄 | **Spawn fresh** | 带探索噪声的上下文不适合实现 |
| 验证其他 worker 刚写的代码 | **Spawn fresh** | 验证者应该用全新视角 |
| 纠正失败或延续近期工作 | **Continue** | Worker 有完整错误上下文 |
| 第一次实现方向完全错误 | **Spawn fresh** | 错误路径会污染重试，清爽开局 |
| 完全无关的新任务 | **Spawn fresh** | 无可复用上下文 |

### Hooks 系统中的 retry 机制

唯一有 retry 的地方：`PermissionDenied` hook：

```typescript
// hooks.ts
{
  hookEventName: 'PermissionDenied',
  retry: z.boolean().optional(),  // 用户拒绝后可选择 retry
}
```

### OpenClaw 可借鉴

**不要抄自动重试**（这是错误方向）。应该抄的是：

1. **在 AGENTS.md 的 Coordinator 决策树里加入"失败后决策"判断**
2. **实现 `PermissionDenied` 的 retry 机制**（拒绝后允许重试）
3. **工具失败时提供诊断提示**，而不是简单报错

---

## 研究二：项目级配置系统（rules/ 层级架构）

### Claude Code 实际行为

**按目录层级自动加载 `.claude/rules/` 下的 .md 文件**：

```
项目目录结构：
/
├── .claude/
│   └── rules/           ← 项目级规则
│       ├── auth.md
│       └── api.md
├── src/
│   ├── .claude/
│   │   └── rules/      ← src 子目录级规则
│   │       └── legacy.md
│   └── ...
└── CLAUDE.md           ← 项目说明（也自动加载）
```

加载逻辑（claudemd.ts）：
- 从 CWD 向上遍历到根目录，每层 `.claude/rules/*.md` 都加载
- 支持 **conditional rules**（基于 glob pattern 匹配才加载）
- 最终拼接成 `claudeMd` 注入 context

### CLAUDE.md 和 rules 的区别

| 文件 | 作用 | 加载方式 |
|---|---|---|
| `CLAUDE.md` | 项目说明、架构概述 | 每层目录自动加载 |
| `.claude/rules/*.md` | 垂直规则（按文件主题分类） | 每层目录按需加载 |
| `conditional rules` | 带 glob 条件判断 | 仅当文件路径匹配才加载 |

### 记忆类型（源码级验证）

Claude Code 源码中的 **4 类记忆**定义（memoryTypes.ts）：

```typescript
MEMORY_TYPES = ['user', 'feedback', 'project', 'reference']

// 每类记忆的格式规范：
// user:       用户角色/偏好
// feedback:   纠正+确认（必须含 Why + How to apply）
// project:    项目状态（相对日期→绝对日期）
// reference:  外部系统指针
```

**这和我们刚实现的 typed memory 完全一致**，说明方向对了。

### OpenClaw 可借鉴

1. **实现 `.claude/rules/` 加载机制**（按目录层级，追加到 system prompt）
2. **Conditional rules**：支持 glob pattern 条件匹配
3. **CLAUDE.md 兼容**：直接读取追加

---

## 研究三：Task 后台任务系统

### Claude Code 实际行为

**7 种 TaskType**（有 ID 前缀）：

```typescript
TaskType = {
  local_bash:         'b'   // 本地 shell
  local_agent:        'a'   // 本地 agent
  remote_agent:       'r'   // 远程 agent
  in_process_teammate: 't'  // 进程内 teammate
  local_workflow:     'w'   // 本地工作流
  monitor_mcp:        'm'   // MCP 监控
  dream:              'd'   // 梦境任务
}

TaskStatus = {
  pending,    // 等待执行
  running,    // 执行中
  completed,  // 成功完成
  failed,    // 执行失败
  killed,    // 被停止
}
```

**关键机制：outputFile 持久化**

```typescript
// 每个 task 有独立输出文件
outputFile: getTaskOutputPath(id)  // ~/.claude/tasks/{sessionId}/{id}
outputOffset: number               // 支持追加读取
```

task 输出持久化意味着：**重启后可以恢复输出，继续执行**。

### 完整 Task 工具集

```
TaskCreateTool   — 创建任务
TaskListTool     — 列出任务
TaskGetTool      — 获取单个任务
TaskOutputTool   — 读取任务输出（支持 offset 追加）
TaskStopTool     — 停止任务
TaskUpdateTool   — 更新任务状态
```

### blockedBy 的真实状态

源码中 `blockedBy: []` 字段存在，但注释显示可能是历史遗留或部分实现。实际 coordinator 的依赖判断可能是通过任务状态和上下文隐式处理的。

### OpenClaw 可借鉴

1. **直接实现完整 Task 工具集**：task_create / task_list / task_output / task_stop / task_update
2. **outputFile 持久化**：每个任务输出写入 SQLite 或文件，支持断点续读
3. **TaskType 映射**：local_agent → sessions_spawn，monitor_mcp → cron 监控

---

## 综合对比总结（纠错版）

| 特性 | Claude Code | OpenClaw | 可实现性 |
|---|---|---|---|
| Tool 自动重试 | ❌ 不做 | ❌ | ~~已废弃~~ |
| Coordinator 失败决策 | ✅ Continue vs Spawn | ❌ | ⭐⭐⭐ 容易 |
| PermissionDenied retry | ✅ Hook 机制 | ❌ | ⭐⭐ 容易 |
| .claude/rules/ 层级加载 | ✅ | ❌ | ⭐⭐⭐ 容易 |
| Conditional rules（glob） | ✅ | ❌ | ⭐⭐ 中等 |
| 记忆 4 类（Why+How） | ✅ 源码级验证 | ✅ 刚实现 | ⭐ 完成 |
| Task 持久化 outputFile | ✅ | ❌ | ⭐⭐⭐ 容易 |
| 完整 Task 工具集 | ✅ | ❌ | ⭐⭐⭐ 容易 |
| Task Type/Status 系统 | ✅ 7类型/5状态 | ❌ | ⭐⭐⭐ 容易 |

---

## 更新后的建议优先级

### 高优先级（容易做，收益大）
1. **Coordinator 失败决策树** — AGENTS.md 里加 continue vs spawn 判断规则
2. **Task 持久化任务队列** — task_create/list/output/stop/update 工具，SQLite 存储
3. **`.claude/rules/` 加载** — workspace 下按目录层级加载 rules/*.md

### 中优先级
4. **PermissionDenied retry hook** — 工具拒绝后允许重试
5. **Conditional rules** — glob pattern 条件匹配规则

### 低优先级
6. **blockedBy 依赖图** — 源码中未完全实现，可简化设计

---

## 数据来源

**源码路径**：`/Users/huahaha/WorkSpace/something/src/claude-code-leaked-main/source code/`

关键文件：
- `utils/claudemd.ts` — rules/ 和 memory 加载核心逻辑
- `memdir/memoryTypes.ts` — 4类记忆的官方定义
- `types/hooks.ts` — Hook 系统的 retry 定义
- `tools/TaskCreateTool/` — Task 工具实现
- `Task.ts` — Task type/status 定义
- `coordinator/coordinatorMode.ts` — continue vs spawn 决策表
