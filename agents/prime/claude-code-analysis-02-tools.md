# Claude Code 架构分析 - 02 工具、命令与协调系统

> 分析基于泄露源码，路径：`source code/tools/`、`source code/commands/`、`source code/coordinator/`、`source code/assistant/`

---

## 一、完整工具清单（40 个工具）

### 核心文件操作（5）
| 工具名 | 职责 |
|--------|------|
| `Read` (FileReadTool) | 读取本地文件，支持图片/PDF，带行号偏移和限制 |
| `Write` (FileWriteTool) | 写入/覆盖文件，要求先 Read 已有文件 |
| `Edit` (FileEditTool) | 精确 diff 编辑已有文件（基于 old_string/new_string 替换） |
| `Glob` (GlobTool) | 基于 glob 模式快速匹配文件路径，按 mtime 排序 |
| `Grep` (GrepTool) | 基于 ripgrep 的正则搜索，支持文件类型过滤和多行匹配 |

### Shell 执行（2）
| 工具名 | 职责 |
|--------|------|
| `Bash` (BashTool) | 执行 shell 命令，含安全检查、沙盒、超时、权限管理 |
| `PowerShell` (PowerShellTool) | Windows PowerShell 命令执行，含对应的安全/权限体系 |

### Agent/任务协调（8）
| 工具名 | 职责 |
|--------|------|
| `Agent` (AgentTool) | **核心工具**：生成子 Agent（worker/verification/Explore/Plan 等），含完整生命周期管理 |
| `SendMessage` (SendMessageTool) | 向已运行的 Agent 发送后续消息，实现持续协作 |
| `TaskCreate` | 创建后台任务 |
| `TaskGet` | 获取任务状态 |
| `TaskList` | 列出所有任务 |
| `TaskOutput` | 获取任务输出 |
| `TaskStop` | 停止运行中的任务 |
| `TaskUpdate` | 更新任务状态/描述 |

### 团队协作（2）
| 工具名 | 职责 |
|--------|------|
| `TeamCreate` | 创建 in-process 队友（共享进程的 Agent 实例） |
| `TeamDelete` | 删除队友 |

### 规划与模式切换（4）
| 工具名 | 职责 |
|--------|------|
| `EnterPlanMode` | 进入规划模式（只读探索，不执行修改） |
| `ExitPlanMode` | 退出规划模式，提交计划进入实施 |
| `EnterWorktree` | 进入 git worktree 隔离工作模式 |
| `ExitWorktree` | 退出 worktree 模式 |

### LSP 与 Notebook（2）
| 工具名 | 职责 |
|--------|------|
| `LSP` | 与 LSP 服务器交互：定义跳转、引用查找、hover、调用层级等 |
| `NotebookEdit` | 编辑 Jupyter Notebook 单元格内容 |

### MCP（Model Context Protocol）（3）
| 工具名 | 职责 |
|--------|------|
| `MCPTool` | 动态调用 MCP 服务器提供的工具（passthrough schema） |
| `McpAuthTool` | MCP 服务器 OAuth 认证 |
| `ListMcpResources` | 列出 MCP 服务器提供的资源 |
| `ReadMcpResource` | 读取 MCP 资源内容 |

### Web（2）
| 工具名 | 职责 |
|--------|------|
| `WebFetch` | 抓取 URL 内容，HTML→Markdown，用小模型提取信息 |
| `WebSearch` | 网络搜索（Anthropic 内置），返回搜索结果块 |

### 用户交互（2）
| 工具名 | 职责 |
|--------|------|
| `AskUserQuestion` | 向用户提出多选题，支持预览内容和选项描述 |
| `SendUserMessage` / `Brief` | 向用户发送消息（KAIROS 模式下替代纯文本输出） |

### 配置与管理（5）
| 工具名 | 职责 |
|--------|------|
| `Config` | 获取/设置 Claude Code 配置 |
| `Skill` | 调用已安装的技能（Skill） |
| `ToolSearch` | 延迟加载工具的搜索与激活（减少初始 prompt token） |
| `ScheduleCron` | Cron 定时任务管理（create/delete/list），集成 claude.ai API |
| `RemoteTrigger` | 管理远程触发器（通过 claude.ai CCR API） |

### 辅助工具（5）
| 工具名 | 职责 |
|--------|------|
| `TodoWrite` | 管理任务清单（创建/更新/完成状态），复杂任务进度追踪 |
| `REPL` | REPL 模式下的虚拟工具集（包装 Bash/Edit/Read 等原语） |
| `Sleep` | 延时等待 |
| `SyntheticOutput` | 结构化输出（StructuredOutput），强制 JSON schema 约束的响应 |
| `TestingPermission` | 测试用权限控制工具 |

---

## 二、工具统一接口模式（Tool.ts）

### 核心类型：`Tool<Input, Output, Progress>`

```typescript
// 所有工具必须实现的接口
type Tool<Input, Output, P> = {
  readonly name: string                          // 工具名（全局唯一标识）
  aliases?: string[]                             // 兼容旧名的别名
  searchHint?: string                            // ToolSearch 关键词（3-10词）
  readonly shouldDefer?: boolean                 // 是否延迟加载
  readonly alwaysLoad?: boolean                  // 是否强制首轮加载
  
  // 核心方法
  call(args, context, canUseTool, parentMessage, onProgress): Promise<ToolResult<Output>>
  description(input, options): Promise<string>
  prompt(options): Promise<string>               // 注入到系统提示词的工具说明
  
  // Schema
  readonly inputSchema: Input                    // Zod schema
  outputSchema?: z.ZodType
  readonly inputJSONSchema?: ToolInputJSONSchema // MCP 工具的 JSON Schema
  
  // 能力声明
  isEnabled(): boolean                           // 是否启用（默认 true）
  isReadOnly(input): boolean                     // 是否只读（默认 false）
  isConcurrencySafe(input): boolean              // 是否并发安全（默认 false）
  isDestructive?(input): boolean                 // 是否不可逆操作
  interruptBehavior?(): 'cancel' | 'block'       // 被中断时的行为
  
  // 权限
  checkPermissions(input, context): Promise<PermissionResult>
  validateInput?(input, context): Promise<ValidationResult>
  
  // UI
  userFacingName(input): string                  // 用户可见名
  maxResultSizeChars: number                     // 结果超过此大小则持久化到文件
  
  // Hook 匹配
  preparePermissionMatcher?(input): Promise<(pattern: string) => boolean>
  backfillObservableInput?(input): void           // 观察者前的输入补丁
}
```

### `buildTool()` 工厂函数

```typescript
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: () => false,   // 默认不安全
  isReadOnly: () => false,          // 默认可写
  isDestructive: () => false,
  checkPermissions: (input) => Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',   // 跳过分类器
  userFacingName: () => def.name,
}
```

**设计要点**：
- 所有工具通过 `buildTool(def)` 创建，自动填充默认值
- 零配置启动：最少只需提供 `name`、`call`、`description`、`inputSchema`、`prompt`
- 安全默认：`isConcurrencySafe=false`、`isReadOnly=false`，工具必须显式声明安全属性

### `ToolUseContext` — 工具执行上下文

每个工具调用都会收到一个巨型上下文对象，包含：
- `options.tools` — 当前可用工具集
- `options.mcpClients` — MCP 连接
- `messages` — 当前会话消息
- `abortController` — 中断控制
- `readFileState` — 文件状态缓存
- `getAppState()` / `setAppState()` — 全局状态访问
- `requestPrompt()` — 交互式提示（REPL 模式下可用）

---

## 三、命令系统

### 命令类型（三种）

```typescript
type Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)

// 1. Prompt 命令 — 展开为 prompt 注入
type PromptCommand = {
  type: 'prompt'
  progressMessage: string
  allowedTools?: string[]
  context?: 'inline' | 'fork'     // inline=当前会话展开，fork=子 Agent 执行
  getPromptForCommand(args, context): Promise<ContentBlockParam[]>
}

// 2. Local 命令 — 执行函数式逻辑
type LocalCommand = {
  type: 'local'
  supportsNonInteractive: boolean
  load(): Promise<{ call(args, context): Promise<LocalCommandResult> }>
}

// 3. Local JSX 命令 — 带 React UI 的交互式命令
type LocalJSXCommand = {
  type: 'local-jsx'
  immediate?: boolean  // 立即执行，不排队
  load(): Promise<{ call(onDone, context, args): Promise<ReactNode> }>
}
```

### 命令注册与路由

1. **静态导入**：所有命令在 `commands.ts` 中通过 `import` 静态导入
2. **条件加载**：使用 `feature('FLAG')` 进行死代码消除（DCE），如 KAIROS、VOICE_MODE 等实验性命令
3. **懒加载**：每个命令通过 `load()` 返回模块，首次调用时才加载
4. **`COMMANDS` 列表**：通过 `memoize()` 缓存的完整命令数组
5. **`INTERNAL_ONLY_COMMANDS`**：内部命令列表（不会出现在外部构建中）

### 关键命令概览

| 命令 | 类型 | 职责 |
|------|------|------|
| `/compact` | local | 对话压缩：保留摘要，清除历史 |
| `/commit` | prompt | Git commit：自动分析 diff 生成提交信息 |
| `/commit-push-pr` | prompt | commit + push + 创建 PR |
| `/mcp` | local-jsx | MCP 服务器管理（add/remove/enable/disable） |
| `/doctor` | local-jsx | 安装诊断与验证 |
| `/memory` | local-jsx | 编辑 CLAUDE.md 记忆文件 |
| `/config` | - | 配置管理 |
| `/review` | prompt | 代码审查 |
| `/plan` | prompt | 规划模式 |
| `/status` | - | 当前状态查看 |
| `/resume` | - | 恢复会话 |
| `/session` | - | 会话管理 |
| `/skills` | - | 技能管理 |
| `/agents` | - | Agent 管理 |
| `/init` | - | 项目初始化（CLAUDE.md） |

### 命令来源标记
```typescript
loadedFrom?: 'commands_DEPRECATED' | 'skills' | 'plugin' | 'managed' | 'bundled' | 'mcp'
```
命令可来自多个来源：内置、技能目录、插件、MCP 服务器。

---

## 四、Coordinator 模式（多 Agent 协调）

### 启用条件

```typescript
function isCoordinatorMode(): boolean {
  if (feature('COORDINATOR_MODE')) {
    return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
  }
  return false
}
```

### 角色分工

**Coordinator（主协调者）**：
- 不能直接修改文件/执行代码
- 只能使用 4 个工具：`Agent`（生成 worker）、`SendMessage`（继续 worker）、`TaskStop`（停止 worker）、`subscribe_pr_activity`（PR 事件订阅）
- 职责：理解用户意图 → 拆解任务 → 委派给 worker → 综合结果 → 回复用户

**Worker（工作者）**：
- 拥有标准工具集（Bash、Read、Edit、Grep、Glob、MCP 工具等）
- 通过 `subagent_type: 'worker'` 生成
- 自主执行，完成后通过 `<task-notification>` XML 通知 coordinator

### Worker 通信协议

```xml
<task-notification>
  <task-id>{agentId}</task-id>
  <status>completed|failed|killed</status>
  <summary>{人类可读的状态摘要}</summary>
  <result>{Agent 的最终文本响应}</result>
  <usage>
    <total_tokens>N</total_tokens>
    <tool_uses>N</tool_uses>
    <duration_ms>N</duration_ms>
  </usage>
</task-notification>
```

### Scratchpad（共享草稿板）
- Worker 可读写的共享目录，无需权限提示
- 用于跨 worker 的持久化知识共享

### 内置 Agent 类型

```typescript
// AgentTool/builtInAgents.ts
getBuiltInAgents() → [
  Explore,           // 代码库探索
  Plan,              // 规划
  Verification,      // 验证
  GeneralPurpose,    // 通用
  ClaudeCodeGuide,   // 使用指南
  StatusLineSetup,   // 状态栏配置
]
```

### 团队模式（TeamCreate）

区别于 Coordinator 模式的进程级隔离：
- `Agent` → 生成独立子进程 Agent
- `TeamCreate` → 创建 **in-process 队友**（共享进程空间）
- 队友通过 `spawnMultiAgent.ts` 统一生成，后端可检测选择 tmux / in-process

---

## 五、Assistant 模块

### `assistant/sessionHistory.ts`

职责：**远程会话历史管理**（非本地 Agent 助手）。

- 通过 claude.ai API 的 `/v1/sessions/{id}/events` 端点获取会话事件
- OAuth 认证 + 组织 UUID 头
- 分页获取（`HISTORY_PAGE_SIZE = 100`）
- 支持 `fetchLatestEvents` 和 `fetchOlderPage` 两种分页模式

此模块更像是 **Teleport/远程会话** 的基础设施，而非本地 Agent 的"助手"角色。

---

## 六、架构洞察

### 1. 工具延迟加载（ToolSearch）

`shouldDefer` + `ToolSearchTool` 实现了工具的按需加载：
- 初始 prompt 只包含核心工具
- 模型通过 `ToolSearch` 按关键词查找并激活需要的工具
- 大幅减少首轮 token 消耗

### 2. 双层权限体系

- **通用权限**：`PermissionMode`（default/plan/bypass 等）
- **工具级权限**：`checkPermissions()` + `validateInput()` 双重验证
- **Hook 系统**：`preparePermissionMatcher()` 支持细粒度模式匹配（如 `Bash(git *)`）

### 3. 命令即 Prompt

`PromptCommand` 的设计精妙：许多 `/` 命令（如 `/commit`、`/review`）本质上不是代码逻辑，而是动态生成的 prompt 文本。这使得命令可以：
- 获取运行时上下文（git status、diff 等）
- 注入安全规则
- 控制可用工具子集（`allowedTools`）
- 选择执行模式（`inline` / `fork`）

### 4. Feature Flag 驱动架构

`bun:bundle` 的 `feature('FLAG')` 实现编译时死代码消除：
- `COORDINATOR_MODE` — 多 Agent 协调
- `KAIROS` — 主动式 Agent（proactive）
- `VOICE_MODE` — 语音模式
- `BRIDGE_MODE` — 桥接模式
- `DAEMON` — 守护进程模式
- `FORK_SUBAGENT` — 子进程 Agent
- `ULTRAPLAN` — 增强规划

这使同一代码库可以裁剪出不同产品形态。

### 5. 结果持久化策略

`maxResultSizeChars` 机制：当工具输出超过阈值时，自动写入文件并返回文件路径而非完整内容。这解决了大输出场景下的上下文窗口占用问题。
