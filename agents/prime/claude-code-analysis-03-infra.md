# Claude Code 基础设施模块深度分析

> 分析日期：2026-04-09 | 源码版本：leaked main

---

## 1. Bridge — IDE 桥接层

**规模**：~20 文件，~12,675 行（核心文件 bridgeMain.ts 3001 行，replBridge.ts 2408 行，remoteBridgeCore.ts 1010 行）

### 模块职责
CLI 与 IDE/远程端之间的双向通信层。支持三种模式：
- **Local REPL Bridge**：本地终端会话
- **Remote Bridge (Env-based)**：通过 Environments API 的 poll/dispatch 模式
- **Remote Bridge V2 (Env-less)**：直接 session-ingress 层，去掉 Environments 中间层

### 关键实现
| 组件 | 作用 |
|------|------|
| `bridgeApi.ts` | HTTP API 客户端，基于 axios，含 OAuth 401 自动刷新、路径遍历防护 (`SAFE_ID_PATTERN`)、Trusted Device Token |
| `remoteBridgeCore.ts` | V2 核心流程：POST /sessions → POST /sessions/{id}/bridge → SSE+CCRClient，JWT 定时刷新 |
| `sessionRunner.ts` | 子进程管理器，spawn CLI 子进程，管理权限请求转发、stderr 收集 |
| `replBridgeTransport.ts` | SSE + CCR v2 协议的双向传输层 |
| `flushGate.ts` | 消息批量冲刷门控，防止高频消息淹没 |
| `jwtUtils.ts` | JWT 生命周期管理 + 定时刷新调度器 |
| `trustedDevice.ts` | 可信设备令牌管理（ELEVATED 安全层级） |

### 设计模式
- **分层协议栈**：Transport → Core → API，每层可独立替换（Env-based vs Env-less）
- **Token 刷新调度器**：主动式刷新，在过期前重新获取 JWT
- **FlushGate（批量门控）**：收集消息批量发送，减少网络开销
- **Fatal vs Retryable 错误分离**：`BridgeFatalError` 类区分不可恢复错误

### 可借鉴的点
1. **Env-less V2 架构**：去掉中间调度层，直接 OAuth→worker_jwt 交换，简化了架构。OpenClaw 的 Remote Control 可参考此模式
2. **FlushGate 模式**：消息批量发送门控，适合高频 Agent 事件流场景
3. **路径遍历防护**：所有 server-provided ID 都经过 `validateBridgeId()` 校验，值得学习
4. **子进程会话模型**：`SessionRunner` 的权限请求转发机制（child→bridge→server→user approve/deny）

---

## 2. Plugins — 插件系统

**规模**：2 文件（`builtinPlugins.ts` + `bundled/index.ts`），框架性代码

### 模块职责
管理可由用户启停的内置插件。与 bundled skills 的区别：
- 插件出现在 `/plugin` UI 中，用户可 toggle
- 一个插件可包含多个组件（skills、hooks、MCP servers）
- ID 格式：`{name}@builtin` vs `{name}@{marketplace}`

### 关键实现
- `Map<string, BuiltinPluginDefinition>` 注册表
- `isAvailable()` → `defaultEnabled` → 用户设置覆盖，三级可用性判断
- `getBuiltinPlugins()` 返回 `{ enabled, disabled }` 分组

### 设计模式
- **注册表模式**：模块级 `Map` + `registerBuiltinPlugin()` 工厂
- **三级可用性**：代码级 `isAvailable()` → 默认 `defaultEnabled` → 用户持久化设置

### 可借鉴的点
1. **插件 vs 技能的分层**：Plugin 是容器（可含多个 skill/hook/MCP），Skill 是单一能力。OpenClaw 的 skill 系统可参考此分层
2. **市场化的 ID 命名**：`name@marketplace` 格式天然支持多来源

---

## 3. Skills — 技能系统

**规模**：~20 文件（bundled 目录 15+ 技能，加载器 + MCP 适配器）

### 模块职责
技能注册、加载和分发。支持两种来源：
- **Bundled Skills**：编译时内嵌，`registerBundledSkill()` 注册
- **Disk-based Skills**：从文件系统加载（commands/、skills/ 目录下的 .md 文件）

### 关键实现
| 组件 | 作用 |
|------|------|
| `bundledSkills.ts` | 注册表 + `BundledSkillDefinition` 类型定义（name, description, whenToUse, allowedTools, model, files 等） |
| `loadSkillsDir.ts` | 从磁盘加载 markdown 技能文件，解析 frontmatter，支持参数替换、shell 执行 |
| `mcpSkillBuilders.ts` | **写一次性注册表**（write-once registry），解决循环依赖 |
| `bundled/` 目录 | 15+ 内置技能：debug, verify, batch, loop, schedule, skillify 等 |

### 设计模式
- **Write-once Registry**（`mcpSkillBuilders`）：解决循环依赖的经典手法。leaf 模块只存引用，两个互相依赖的模块通过它间接通信
- **Feature Flag Gating**：`feature('KAIROS')`, `feature('AGENT_TRIGGERS')` 控制技能注册
- **Lazy require**：条件技能用 `require()` 延迟加载，避免不需要的模块被打包
- **Markdown-as-Skill**：磁盘技能用 markdown + frontmatter 定义，含 shell 命令执行能力

### 可借鉴的点
1. **Write-once Registry 解循环依赖**：当两个模块互相需要对方的功能时，抽取 leaf 节点存引用
2. **BundledSkillDefinition 设计**：`whenToUse`, `allowedTools`, `files` 等字段定义了技能的完整元数据模型
3. **Markdown + Frontmatter 作为技能格式**：用户可读、可编辑、可版本控制

---

## 4. Hooks — React Hooks 系统

**规模**：~50 个 hooks，总计 ~10,336 行

### 模块职责
React（Ink）UI 层的所有自定义 hooks，覆盖：
- 输入处理（useTextInput 531 行, useVimInput 318 行, usePasteHandler 287 行）
- 语音（useVoice 1146 行）
- 会话管理（useRemoteSession, useSSHSession, useInboxPoller 971 行）
- 任务/Agent（useTasksV2, useSwarmInitialization, useSwarmPermissionPoller）
- 搜索（useHistorySearch, useSearchInput, useVirtualScroll 723 行）
- 队列处理（useQueueProcessor）

### 关键实现
- `useQueueProcessor`：**统一命令队列**，优先级 `now > next > later`，用 `useSyncExternalStore` 订阅队列状态
- `useSwarmInitialization`：处理 agent 恢复（从 transcript 提取 teamName/agentName）和新鲜 spawn 两种路径
- `useVirtualScroll`：虚拟滚动，处理大量消息的高性能渲染
- `useVoice`：1146 行，完整的语音输入系统

### 设计模式
- **useSyncExternalStore**：所有外部状态都通过此 hook 接入 React，避免 Ink 上下文传播延迟
- **QueryGuard 模式**：查询锁，确保同一时间只有一个活跃查询，防止并发冲突
- **优先级队列**：命令队列的三级优先级设计

### 可借鉴的点
1. **useSyncExternalStore 替代 Context**：解决 Ink 中 Context 传播延迟导致的通知丢失问题
2. **QueryGuard**：查询互斥锁模式，适合所有需要串行化异步操作的场景
3. **虚拟滚动实现**：终端 UI 下处理大量内容的参考

---

## 5. Cost Tracker — 成本追踪

**规模**：325 行

### 模块职责
追踪每次 API 调用的 token 使用和 USD 成本，汇总会话级统计。

### 关键实现
- 依赖 `bootstrap/state` 中的全局计数器（getTotalInputTokens, getTotalOutputTokens 等）
- `calculateUSDCost()` 按模型计算费用
- `reportApiUsage()`: 每次 API 调用后更新计数器 + 发送 analytics
- `printCostSummary()`: 输出会话摘要（token 数、成本、耗时、缓存命中率）

### 设计模式
- **全局计数器 + 增量更新**：模块级状态，`addToTotalCostState()` 增量写入

### 可借鉴的点
1. **缓存 token 分离统计**：区分 Cache Creation / Cache Read tokens，精确计算缓存节省
2. **模型级粒度**：`getUsageForModel()` 按模型分别统计

---

## 6. History — 历史管理

**规模**：466 行

### 模块职责
命令行历史记录管理，支持粘贴内容的外部存储。

### 关键实现
- 文件级锁（`lock()` from `utils/lockfile`）防止并发写入
- `MAX_HISTORY_ITEMS = 100` 限制历史长度
- `pasteStore`：大型粘贴内容（图片/长文本）存储到外部文件，历史只存 hash 引用
- `readLinesReverse()`：逆序读取历史文件，高效查找最近命令
- 注册 cleanup handler（`registerCleanup`）确保进程退出时写入

### 设计模式
- **外部存储 + Hash 引用**：大内容存外部文件，历史记录只存指纹
- **逆序文件读取**：高效读取文件末尾（最新历史）

### 可借鉴的点
1. **粘贴内容去重**：hash 引用机制，避免重复存储相同内容
2. **文件级锁**：跨进程安全写入历史的简单方案

---

## 7. State — 状态管理

**规模**：5 文件，~1001 行

### 模块职责
全局应用状态管理，基于自定义 Store 实现。

### 关键实现
| 文件 | 作用 |
|------|------|
| `store.ts` (36 行) | **极简 Store 实现**：`createStore<T>()` 返回 getState/setState/subscribe，支持 onChange 回调 |
| `AppStateStore.ts` (571 行) | **巨型 AppState 类型定义**：含 messages, tasks, tools, permissions, MCP 连接、speculation 状态等 |
| `selectors.ts` (78 行) | 纯函数选择器，如 `getViewedTeammateTask()`, `getActiveAgentForInput()` |
| `onChangeAppState.ts` | 状态变更副作用处理 |
| `teammateViewHelpers.ts` | Teammate 视图辅助函数 |

### 设计模式
- **类 Redux Store**：但用 immutable update (`setState(updater)`) 而非 action dispatch
- **Discriminated Union State**：`SpeculationState = { status: 'idle' } | { status: 'active', ... }`
- **Selector 模式**：纯函数提取派生状态，保持组件干净
- **ActiveAgentForInput**：联合类型 `{ type: 'leader' } | { type: 'viewed', task } | { type: 'named_agent', task }` 实现输入路由

### 可借鉴的点
1. **36 行 Store 实现**：极简但完整的状态管理，无第三方依赖
2. **Discriminated Union 状态建模**：用 `status` 字段做可辨识联合，TypeScript 类型安全
3. **Selector 纯函数**：状态派生逻辑集中管理

---

## 8. Schemas — 数据验证

**规模**：1 文件 (`hooks.ts`)，224 行

### 模块职责
Hook 相关的 Zod schema 定义，从 settings/types.ts 中提取出来以打破循环依赖。

### 关键实现
- `buildHookSchemas()`: 构建 Bash 命令 hook、用户 prompt hook、MCP hook 等 schema
- `IfConditionSchema`: 权限规则语法（如 `"Bash(git *)"`），用于过滤 hook 触发
- `lazySchema()`: 延迟求值 schema，避免循环引用

### 设计模式
- **Schema 提取打破循环**：将共享 schema 抽到独立模块
- **lazySchema 延迟求值**：Zod schema 的懒加载包装器

### 可借鉴的点
1. **Schema 独立文件策略**：当类型定义造成循环依赖时，提取到共享 leaf 模块

---

## 9. Utils — 工具函数

**规模**：~250+ 文件，总计 ~120,000+ 行（整个 codebase 的一半以上）

### 关键子模块

| 子模块 | 行数 | 核心功能 |
|--------|------|----------|
| `attachments.ts` | 3999 | 附件处理（图片、PDF 等） |
| `sessionStorage.ts` | 5107 | 会话持久化存储 |
| `messages.ts` | 5514 | 消息处理和渲染 |
| `hooks.ts` | 5024 | Hook 生命周期管理 |
| `auth.ts` | 2004 | 认证流程 |
| `worktree.ts` | 1521 | Git worktree 管理 |
| `claudemd.ts` | 1481 | CLAUDE.md 加载和解析 |
| `ide.ts` | 1496 | IDE 集成 |
| `stats.ts` | 1063 | 使用统计 |
| `Cursor.ts` | 1532 | 终端光标/编辑器（含 Kill Ring） |
| `analyzeContext.ts` | 1384 | 上下文分析 |
| `git.ts` | 928 | Git 操作封装 |
| `toolSearch.ts` | 758 | 工具搜索 |
| `ripgrep.ts` | 681 | ripgrep 封装 |
| `sanitization.ts` | 93 | **Unicode 隐形字符攻击防护** |

### 重点分析

#### `sanitization.ts` — Unicode 安全
- 防御 ASCII Smuggling / Hidden Prompt Injection（HackerOne #3086545）
- NFKC 标准化 + 危险 Unicode 类别移除（Cf/Co/Cn）+ 显式范围清除
- 迭代式清除，最多 10 轮，超限则 crash

#### `Cursor.ts` — 终端编辑器
- 完整的 Emacs 风格输入编辑器
- **Kill Ring**：全局剪切板环，支持 Alt+Y 循环
- Grapheme-aware 光标移动

#### `settings/` — 配置系统
- 多层配置源：project → user → enterprise → MDM → remote managed
- Zod v4 验证 + 人类友好错误信息 + validation tips
- `changeDetector.ts` 检测配置变更
- 缓存层（`settingsCache.ts`）避免重复解析

#### `markdownConfigLoader.ts` — Markdown 配置加载
- 加载 commands/、agents/、skills/ 等目录下的 .md 文件
- 支持 frontmatter 解析
- 目录扫描：项目根 → 用户主目录 → managed drop-in 目录

### 可借鉴的点
1. **Unicode Sanitization**：任何接受用户输入的 AI 系统都必须做。NFKC + 危险类别清除是标准做法
2. **Kill Ring**：终端应用的高级编辑体验参考
3. **多层配置合并**：project < user < enterprise < MDM < remote，每层可覆盖下层
4. **Markdown as Config**：用 markdown + frontmatter 定义技能/命令/Agent，用户友好
5. **slowOperations.ts**：将 JSON parse/stringify 等操作集中管理，便于性能监控

---

## 架构总结

### 核心设计原则

1. **循环依赖管理**：多种手法——write-once registry、schema 提取、lazy dynamic import、类型导入
2. **Feature Flag 驱动**：`feature('KAIROS')` 等 Bun bundle flag 控制功能注册和代码裁剪
3. **极简自定义 Store**：36 行实现类 Redux 状态管理，无第三方依赖
4. **文件即配置**：Markdown + Frontmatter 格式的技能/命令定义
5. **安全第一**：路径遍历防护、Unicode sanitization、文件级锁、trusted device token
6. **协议版本共存**：Bridge 层同时支持 Env-based 和 Env-less，Feature Flag 切换

### 架构图

```
┌─────────────────────────────────────────┐
│              React (Ink) UI              │
│         hooks/ (50+ custom hooks)        │
├─────────────────────────────────────────┤
│          State Management               │
│  store.ts (36L) → AppStateStore.ts      │
│  selectors.ts (pure functions)          │
├──────────┬──────────┬───────────────────┤
│  Skills  │ Plugins  │     Hooks         │
│ (bundled │ (toggle- │ (lifecycle:       │
│  + disk) │  able)   │  pre/post/sample) │
├──────────┴──────────┴───────────────────┤
│            Bridge Layer                  │
│  Transport → Core → API (SSE/CCR v2)    │
├─────────────────────────────────────────┤
│              Utils (~250 files)          │
│  auth | config | git | sanitization | … │
├─────────────────────────────────────────┤
│          Schemas (Zod v4)               │
│  Data validation + type safety          │
└─────────────────────────────────────────┘
```
