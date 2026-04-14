# Claude Code 核心引擎架构分析

> 分析基于泄露源码，文件版本来自 AnukarOP 仓库。

---

## 1. QueryEngine — Agent Loop 完整流程

### 1.1 核心类结构

`QueryEngine` 是 Claude Code 的会话引擎，**每个对话一个实例**，管理跨 turn 的状态（消息历史、文件缓存、用量统计）。

```
QueryEngine
├── config: QueryEngineConfig     // 不可变配置（工具、权限、模型等）
├── mutableMessages: Message[]    // 可变消息历史
├── abortController               // 中断控制
├── totalUsage                    // 累计 token 用量
├── readFileState: FileStateCache // 文件读取缓存
└── permissionDenials[]           // 权限拒绝记录
```

### 1.2 submitMessage() Agent Loop 流程

```
用户输入 (prompt)
    │
    ▼
┌─────────────────────────────────┐
│  1. 初始化                      │
│  - setCwd(cwd)                  │
│  - 解析模型 & thinking 配置      │
│  - fetchSystemPromptParts()     │
│    → defaultSystemPrompt         │
│    → userContext (CLAUDE.md等)   │
│    → systemContext (Git状态等)   │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│  2. processUserInput()          │
│  - 处理斜杠命令 (/compact等)     │
│  - 返回 messages + shouldQuery  │
│  - 如果 shouldQuery=false,       │
│    直接 yield 结果并 return      │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│  3. 记录 Transcript             │
│  - recordTranscript(messages)   │
│  - bare mode: fire-and-forget   │
│  - 否则: await 阻塞写入          │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│  4. yield SystemInit 消息        │
│  (工具列表、MCP、模型、权限等)    │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│  5. for await (query({...}))    │  ← 核心循环
│  ┌───────────────────────────┐  │
│  │ query() 调用 Claude API   │  │
│  │ → 流式返回 assistant 消息  │  │
│  │ → 如果含 tool_use block:  │  │
│  │   a. canUseTool() 权限检查 │  │
│  │   b. tool.call() 执行工具  │  │
│  │   c. 结果作为 user 消息    │  │
│  │      送回 API (下一轮)     │  │
│  │ → 重复直到 end_turn       │  │
│  └───────────────────────────┘  │
│  每条消息类型处理:                │
│  - assistant → push + yield      │
│  - user → turnCount++, yield     │
│  - progress → push + yield       │
│  - stream_event → 用量统计       │
│  - attachment → 结构化输出等     │
│  - system → compact/snip 边界    │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│  6. 结果处理                    │
│  - 预算超限检查                  │
│  - 结构化输出重试限制            │
│  - isResultSuccessful() 判断    │
│  - yield result (success/error) │
└─────────────────────────────────┘
```

### 1.3 关键设计点

| 机制 | 说明 |
|------|------|
| **双消息数组** | `mutableMessages`（可变，跨 turn）和 `messages`（快照，单次 query）分离 |
| **权限包装** | `wrappedCanUseTool` 在 `canUseTool` 外层追踪 permission denials |
| **Transcript 持久化** | 用户消息进入循环前就写入，防止进程崩溃丢失 |
| **流式 yield** | `submitMessage` 是 `AsyncGenerator<SDKMessage>`，调用方实时消费 |
| **Compact/Snip** | 长对话压缩机制，splice 删除历史消息释放内存 |
| **Budget 控制** | `maxTurns`、`maxBudgetUsd`、结构化输出重试次数三重限制 |

### 1.4 ask() — 一次性便捷包装

`ask()` 是 `QueryEngine` 的函数式包装，创建引擎实例、执行单次 `submitMessage`，然后将 `readFileState` 写回调用方。REPL 模式复用引擎实例，SDK/CLI 模式通过 `ask()` 一次性使用。

---

## 2. Tool 接口设计

### 2.1 类型参数

```typescript
Tool<Input extends AnyObject, Output, P extends ToolProgressData>
```

- `Input`: Zod schema，定义工具参数（`z.infer<Input>` 获得类型安全输入）
- `Output`: 工具返回数据类型
- `P`: 进度事件类型（用于 UI 渲染）

### 2.2 核心方法

| 方法 | 用途 | 说明 |
|------|------|------|
| `call()` | **执行工具** | 接收参数、上下文、权限函数、父消息、进度回调 |
| `description()` | 生成描述 | 返回给模型的工具说明 |
| `prompt()` | 系统提示 | 告诉模型如何使用此工具 |
| `checkPermissions()` | 权限检查 | 返回 `PermissionResult` |
| `validateInput()` | 输入验证 | 返回 `{result: true/false, message}` |
| `mapToolResultToToolResultBlockParam()` | 结果序列化 | 将 Output 转为 API 格式 |

### 2.3 行为标记方法

```typescript
isEnabled(): boolean              // 工具是否可用
isReadOnly(input): boolean        // 是否只读（影响并发策略）
isConcurrencySafe(input): boolean // 是否可并发执行
isDestructive(input): boolean     // 是否破坏性操作
interruptBehavior(): 'cancel' | 'block'  // 用户中断时的行为
isOpenWorld?(input): boolean      // 是否开放世界（如 Bash/Web）
shouldDefer?: boolean             // 是否延迟加载（ToolSearch 机制）
alwaysLoad?: boolean              // 是否始终在首轮加载
```

### 2.4 权限模型

```
Tool.checkPermissions()
    ↓
PermissionResult = {
  behavior: 'allow' | 'deny'
  updatedInput?: {...}  // 权限系统可修改输入
}
```

`ToolPermissionContext` 包含完整的权限状态：
- `mode`: 权限模式（default/plan/auto/bypass）
- `alwaysAllowRules` / `alwaysDenyRules` / `alwaysAskRules`: 分层规则
- `additionalWorkingDirectories`: 额外允许的工作目录
- `shouldAvoidPermissionPrompts`: 后台 Agent 跳过 UI 提示

### 2.5 buildTool() 工厂

```typescript
function buildTool<D extends AnyToolDef>(def: D): BuiltTool<D>
```

默认值策略（**fail-closed**）：
- `isEnabled` → `true`
- `isConcurrencySafe` → `false`（默认不可并发）
- `isReadOnly` → `false`（默认视为写操作）
- `isDestructive` → `false`
- `checkPermissions` → `{ behavior: 'allow' }`（委托通用权限系统）
- `toAutoClassifierInput` → `''`（跳过自动分类器）

### 2.6 UI 渲染方法

Tool 接口包含丰富的 React 渲染方法：
- `renderToolUseMessage()` — 工具调用展示
- `renderToolResultMessage()` — 结果展示
- `renderToolUseProgressMessage()` — 进度展示
- `renderGroupedToolUse()` — 并发工具分组展示
- `extractSearchText()` — 搜索索引文本

---

## 3. 上下文构建 (context.ts)

### 3.1 系统上下文 (`getSystemContext`)

**memoize 缓存**，对话期间不变。

```typescript
{
  gitStatus?: string    // Git 快照
  cacheBreaker?: string // 仅内部调试
}
```

`getGitStatus()` 并行执行 5 个 Git 命令：
- `getBranch()` — 当前分支
- `getDefaultBranch()` — 主分支
- `git status --short` — 文件状态（截断至 2KB）
- `git log --oneline -n 5` — 最近提交
- `git config user.name` — 用户名

### 3.2 用户上下文 (`getUserContext`)

**memoize 缓存**，对话期间不变。

```typescript
{
  claudeMd?: string      // CLAUDE.md 内容
  currentDate: string    // 当前日期
}
```

`claudeMd` 来源：`getClaudeMds()` 从工作目录向上查找所有 `CLAUDE.md` 文件并合并。可通过以下方式禁用：
- `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`
- `--bare` 模式（除非指定了 `--add-dir`）

### 3.3 上下文注入位置

在 `QueryEngine.submitMessage()` 中：

```
fetchSystemPromptParts({tools, model, mcpClients})
    ↓
{defaultSystemPrompt, userContext, systemContext}
    ↓
最终 systemPrompt = [
  customSystemPrompt ?? defaultSystemPrompt,
  memoryMechanicsPrompt?,
  appendSystemPrompt?
]
```

注入优先级：`customSystemPrompt` > `defaultSystemPrompt` > `memoryMechanicsPrompt` > `appendSystemPrompt`

---

## 4. 流式查询机制 (query.ts 调用)

`query()` 函数是底层 API 调用层，被 `QueryEngine` 通过 `for await` 消费：

```
query({messages, systemPrompt, userContext, systemContext, ...})
    ↓
Claude API (streaming)
    ↓ yield
├── stream_event (message_start / content_block_start/stop / message_delta / message_stop)
├── assistant (每个 content_block 完成时)
├── progress (工具执行进度)
├── user (tool_result 消息)
├── attachment (结构化输出、max_turns_reached 等)
├── system (compact_boundary、api_error)
└── tool_use_summary
```

**用量追踪**：`stream_event` 中的 `message_start` 和 `message_delta` 分别提供初始和增量 usage，`message_stop` 时累加到 `totalUsage`。

**流式输出**：`includePartialMessages` 选项控制是否向 SDK 消费者暴露原始流事件，用于实时 UI 更新。

---

## 5. 架构总结

```
main.tsx (入口)
  ├── 初始化: MDM/Keychain 并行预读
  ├── Commander CLI 解析
  ├── 权限/模型/配置初始化
  └── launchRepl() / ask()
        │
        ▼
QueryEngine (会话引擎)
  ├── fetchSystemPromptParts() → 系统提示构建
  ├── processUserInput()       → 斜杠命令处理
  └── query()                  → API 循环
        ├── stream_event       → 用量统计
        ├── assistant          → 模型输出
        ├── canUseTool()       → 权限检查
        ├── tool.call()        → 工具执行
        └── tool_result → user → 下一轮

Tool (工具接口)
  ├── Zod Schema 输入验证
  ├── checkPermissions() 权限控制
  ├── call() 执行
  └── React 渲染方法

context.ts (上下文)
  ├── getSystemContext() → Git 状态
  ├── getUserContext()   → CLAUDE.md + 日期
  └── memoize 缓存
```

**核心设计哲学**：
1. **Agent Loop = AsyncGenerator**：流式架构，生产者（query）和消费者（QueryEngine/REPL）解耦
2. **权限 fail-closed**：工具默认不可并发、非只读，安全优先
3. **对话状态持久化**：Transcript 在 API 调用前就写入，支持崩溃恢复
4. **渐进式压缩**：Compact/Snip 机制控制长对话内存占用
