# Task 输出持久化设计
**日期**: 2026-04-13
**目标**: 为 OpenClaw 实现类 Claude Code 的 task outputFile 持久化
**参考**: Claude Code `tasks/LocalAgentTask/LocalAgentTask.tsx` + `tasks/types.ts`

---

## 一、Claude Code 机制分析

### 1.1 Task 数据结构

```typescript
// 每个 Task 有独立 ID 和输出文件
outputFile: getTaskOutputPath(id)  // ~/.claude/tasks/{sessionId}/{id}
outputOffset: number               // 支持追加读取

// Task 状态机
TaskStatus = {
  pending,    // 等待执行
  running,    // 执行中
  completed,  // 成功完成
  failed,     // 执行失败
  killed,     // 被停止
}

// 7 种 TaskType
TaskType = {
  local_bash:         'b'
  local_agent:        'a'
  remote_agent:       'r'
  in_process_teammate: 't'
  local_workflow:     'w'
  monitor_mcp:        'm'
  dream:              'd'
}
```

### 1.2 ProgressTracker 持久化

```typescript
interface ProgressTracker {
  toolUseCount: number
  latestInputTokens: number    // API 累计值
  cumulativeOutputTokens: number // 每 turn 累加
  recentActivities: ToolActivity[] // 最近 5 个工具调用
}

interface ToolActivity {
  toolName: string
  input: Record<string, unknown>
  activityDescription?: string  // 预计算："Reading src/foo.ts"
  isSearch?: boolean
  isRead?: boolean
}
```

### 1.3 关键实现函数

```typescript
// 获取 task 输出路径
getTaskOutputPath(id: string): string

// 初始化输出（支持 symlink）
initTaskOutputAsSymlink(id: string, targetPath: string): void

// 驱逐旧输出（LRU）
evictTaskOutput(id: string): void

// 注册 task
registerTask(id: string, state: TaskState): void

// 更新 task 状态
updateTaskState(id: string, state: TaskState): void
```

---

## 二、OpenClaw 适配设计

### 2.1 设计原则

1. **轻量化**: 不复制 Claude Code 的完整 task 系统，聚焦输出持久化
2. **兼容性**: 利用现有的 `sessions_*` API，不另起架构
3. **可演进**: 先实现核心功能，后续逐步对齐 Claude Code 完整功能

### 2.2 数据结构

```typescript
// OpenClaw Session Task 状态
interface SessionTask {
  id: string                    // UUID
  parentSessionId: string       // 父 session ID
  childSessionId: string        // 子 agent session ID
  status: 'pending' | 'running' | 'completed' | 'failed' | 'killed'
  taskType: 'local_agent' | 'research' | 'verification' | 'simple'
  description: string
  createdAt: number             // timestamp
  startedAt?: number
  completedAt?: number
  
  // 输出相关
  outputFile: string            // 输出文件路径
  outputOffset: number          // 追加读取偏移
  outputSize: number           // 当前输出大小
  
  // Progress Tracker
  progress: {
    toolUseCount: number
    latestInputTokens: number
    cumulativeOutputTokens: number
    recentActivities: ToolActivity[]
  }
  
  // 错误信息（如果 failed）
  error?: {
    message: string
    stack?: string
  }
}

interface ToolActivity {
  toolName: string
  input: Record<string, unknown>
  activityDescription: string
  isSearch: boolean
  isRead: boolean
}
```

### 2.3 核心函数签名

```typescript
// 获取 task 输出路径
function getSessionTaskOutputPath(taskId: string): string {
  // 路径: ~/.openclaw/tasks/{parentSessionId}/{taskId}.log
}

// 初始化 task 输出文件
async function initSessionTaskOutput(taskId: string): Promise<string> {
  const dir = path.join(getOpenClawTasksDir(), parentSessionId)
  const file = path.join(dir, `${taskId}.log`)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(file, '', 'utf-8')
  return file
}

// 追加写入 task 输出
async function appendTaskOutput(
  taskId: string,
  chunk: string,
  offset: number
): Promise<{ newOffset: number; size: number }> {
  // 如果超过 MAX_OUTPUT_SIZE (100KB)，截断
}

// 读取 task 输出（支持 offset 追加读取）
async function readTaskOutput(
  taskId: string,
  offset?: number,
  limit?: number
): Promise<{ content: string; newOffset: number; truncated: boolean }> {
  // offset: 从哪里开始读（追加读取支持）
  // limit: 最大读取字节数
  // truncated: 是否被截断
}

// 更新 task 状态
async function updateSessionTaskState(
  taskId: string,
  updates: Partial<SessionTask>
): Promise<void>

// 注册新 task
async function registerSessionTask(
  parentSessionId: string,
  childSessionId: string,
  description: string,
  taskType: SessionTask['taskType']
): Promise<SessionTask>

// LRU 驱逐旧 task 输出
async function evictOldTaskOutputs(maxAgeHours: number = 24): Promise<number>
```

### 2.4 OpenClaw Tasks 命令

```bash
# 列出所有 session tasks
openclaw tasks list [--session SESSION_ID] [--status running|completed|failed]

# 查看 task 输出（类似 tail -f）
openclaw tasks output TASK_ID [--follow] [--offset N]

# 停止 task
openclaw tasks stop TASK_ID

# 查看 task 详情
openclaw tasks show TASK_ID
```

### 2.5 截断策略

```typescript
const MAX_OUTPUT_SIZE = 100 * 1024  // 100KB
const MAX_RECENT_ACTIVITIES = 5

async function appendTaskOutput(taskId: string, chunk: string): Promise<void> {
  const file = getSessionTaskOutputPath(taskId)
  const stat = await fs.stat(file)
  
  if (stat.size + chunk.length > MAX_OUTPUT_SIZE) {
    // 读取最后 50KB 作为新内容的头部
    const fd = await fs.open(file, 'r')
    const buffer = Buffer.alloc(50 * 1024)
    await fd.read(buffer, 0, 50 * 1024, stat.size - 50 * 1024)
    const truncated = buffer.toString('utf-8')
    await fd.close()
    
    // 写入截断后的内容 + 新内容
    await fs.writeFile(file, truncated + '\n[...截断...]\n' + chunk)
    
    // 记录截断 offset
    await updateTaskMeta(taskId, { truncatedAt: Date.now(), truncatedOffset: stat.size })
  } else {
    await fs.appendFile(file, chunk)
  }
}
```

---

## 三、与现有架构集成

### 3.1 集成点

| 现有组件 | 集成点 | 改动 |
|---------|--------|------|
| `sessions_spawn` | 启动时创建 SessionTask | 注册 task → 持久化元数据 |
| `sessions_send` | 工具调用时更新 progress | 追加 recentActivities |
| `sessions_history` | session 结束时更新状态 | completed/failed |
| `memory system | 输出写入 memory 目录 | session 完成后提取摘要 |

### 3.2 memory 系统集成

当 session 完成后，将关键输出摘要写入：

```
memory/types/project/
  session-{sessionId}-output.md
```

内容格式：
```markdown
---
name: session-{id}-output
description: {一句话描述任务结果}
type: project
created: {timestamp}
session_id: {id}
status: {completed|failed}
task_type: {type}
---

## 摘要
{final result summary}

## Token 统计
- Input: {latestInputTokens}
- Output: {cumulativeOutputTokens}
- Tool Uses: {toolUseCount}

## 关键活动
{recentActivities 列表}

## 错误（如果有）
{error message}
```

---

## 四、实施优先级

### Phase 1: 核心持久化（高优先级）
1. SessionTask 数据结构定义
2. `getSessionTaskOutputPath()` / `initSessionTaskOutput()`
3. `registerSessionTask()` / `updateSessionTaskState()`
4. `appendTaskOutput()` / `readTaskOutput()`
5. 在 `sessions_spawn` 中集成注册

### Phase 2: CLI 命令（中优先级）
6. `openclaw tasks list` 命令
7. `openclaw tasks output` 命令
8. `openclaw tasks stop` 命令

### Phase 3: 增强功能（低优先级）
9. LRU evictOldTaskOutputs
10. 截断策略实现
11. memory 集成（session 完成后写入摘要）

---

## 五、风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 磁盘空间耗尽 | 低 | 高 | LRU evict + 100KB 截断 |
| 与现有 sessions 系统冲突 | 中 | 中 | 独立 tasks 目录，不修改 sessions 逻辑 |
| task 状态与 session 状态不一致 | 中 | 中 | session 结束时强制同步状态 |

---

## 六、文件清单

| 文件 | 描述 |
|------|------|
| `plugins/session-task-persistence/index.ts` | 插件入口 |
| `plugins/session-task-persistence/task-store.ts` | SessionTask 数据结构 + 存储 |
| `plugins/session-task-persistence/output-manager.ts` | 输出文件读写 + 截断 |
| `plugins/session-task-persistence/cli.ts` | CLI 命令实现 |
| `skills/session-tasks/SKILL.md` | skill 定义（供 agent 调用） |
