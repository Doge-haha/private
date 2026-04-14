# DECISIONS.md — 决策日志

_仅追加写入，不删除历史记录。_

## 2026-04-14

### D009: Compaction Plus 插件扫尾
- **决策**：Compaction Plus 插件以 local plugin 形式加载，配置 `plugins.allow` 正式信任
- **原因**：插件功能完整（9段摘要+CircuitBreaker+PartialCompaction），实测 auto-compaction 成功触发
- **影响**：Compaction Plus 正式纳入生产，context overflow 可自动恢复
- **变更**：新增 `plugins.allow` 字段，纳入 compaction-plus/context-gear/memory-injector/session-task-persistence

### D010: Cron 晨间简报时间修正
- **决策**：晨间简报 Cron 从 `0 9 * * *`（09:30）修正为 `0 10 * * *`（10:00）
- **原因**：留出 Mac 开机缓冲时间，与 DECISIONS.md 记录一致
- **变更**：HEARTBEAT.md + AGENTS.md 同步更新为 10:00

### D011: 晚间总结 4ms 空跑问题修复
- **决策**：晚间总结 Cron job 触发方式从 `systemEvent` 改为 `agentTurn` + `isolated` session
- **原因**：`systemEvent` 方式 session 未正确收到 payload，导致 4ms 空跑
- **影响**：晚间总结 17:00 将正常输出进度汇报

### D012: 持续监控 Cron 建立
- **决策**：建立每2小时一次的持续监控 cron job（偶数小时：10:00、12:00、14:00...）
- **内容**：GitHub Trending 扫描 + OpenClaw/Claude/MCP/AI Agent 关键词监控
- **规则**：静默优先，无重大异动不打扰主人

### D014: Implicit Fork（完整上下文继承）
- **决策**：子 agent 通过 `inheritContext` 参数自动继承父级对话历史
- **原因**：当前 `sessions_spawn` 只传递 task 文本 + 元数据，子 agent 对父级对话完全无知，导致重复探索、理解偏差
- **参考**：Claude Code `forkSubagent.ts` 的 `renderedSystemPrompt` 机制
- **OpenClaw 现状分析**：
  - `spawnSubagentDirect()` 在 `pi-embedded-CNTNdlGw.js:13825` 是 spawn 入口
  - `buildSubagentSystemPrompt()` 在 `11775` 构建 extraSystemPrompt（纯结构化元数据，无对话历史）
  - 最终通过 `callSubagentGateway({ method: "agent", params: { extraSystemPrompt } })` 发送给子 session
  - `SessionsSpawnToolSchema` 是工具参数 schema（支持 `lightContext` 但无 `inheritContext`）
- **实现方案**：
  1. **Schema 扩展**：在 `SessionsSpawnToolSchema` 添加 `inheritContext: Type.Optional(Type.Boolean({ default: true, description: "When true, injects recent parent conversation history into the subagent's system prompt" }))`
  2. **上下文提取**：在 `spawnSubagentDirect` 中，spawn 前从当前 session 读取最近 N 条对话历史（通过 sessionManager/readSessionMessages）
  3. **注入方式**：将历史摘要追加到 `childSystemPrompt` 的末尾，作为 `## Parent Context` 区块
  4. **Token 预算**：上限 4000 chars（约 1000 tokens），超出时从最旧的消息开始截断
  5. **兼容性**：默认 `inheritContext: true`（新行为），显式 `false` 禁用（旧行为）
  6. **独立运行**：上下文注入后子 agent 独立运行，不依赖父 session 状态
- **产出文件**：
  - `workspace/skills/implicit-fork/SPEC.md` — 完整技术规格
  - `workspace/skills/implicit-fork/patch-guide.md` — OpenClaw 源码修改指南
- **风险**：修改 dist 文件在 npm update 后丢失，需通过 plugin 或 hook 机制实现
- **决策人**：@dev

## 2026-04-13

### D007: 两层验证机制
- **决策**：实施 Layer1（Worker 自验）+ Layer2（独立验证）的双层验证体系
- **原因**：避免实现者自我确认盲区，验证者必须独立视角
- **规则**：verification taskType 强制 spawn_fresh；Layer2 失败 → needs_changes 或 rejected

### D008: Continue/Spawn 决策引擎
- **决策**：实现加权评分决策引擎（文件重叠×0.4 + 概念重叠×0.3 + 工具重叠×0.2 + 消息重叠×0.1）
- **原因**：统一委派决策标准，减少随意性
- **实现**：`skills/continue-spawn-decision/decide.py` + `decision.ts`

## 2026-04-10

### D006: Gateway 内置 CLI 优先原则
- **决策**：Task 持久化优先使用 Gateway 内置 `openclaw tasks` CLI，不重复造轮子
- **原因**：Gateway 内置 task 系统通过 RPC 提供，比插件 CLI 更可靠
- **实现**：polling-service 基于 runs.sqlite，直接调用内置 task 系统

## 2026-04-10

### D005: Task 持久化 Polling 方案
- **决策**：采用 Polling > Hook 的 Task 持久化接入方案
- **原因**：Hook 体系在某些场景下是死定义；Polling 直接扫 sqlite 更可靠
- **实现**：polling-service 每 30s 扫描 runs.sqlite，hooks 做生命周期补充

### D004: 记忆系统升级方案
- **决策**：采用 Claude Code 风格的 typed memory 方案，跳过 memory-lancedb-pro
- **原因**：memory-lancedb-pro 曾导致 OpenClaw 崩溃；typed memory 更稳定且功能完整
- **方案**：
  - Phase 1: 4 类分类（user/feedback/project/reference）+ frontmatter 规范 ✅
  - Phase 2: Cron 触发自动提取（每 30 分钟）+ 隔离 session 执行
  - Phase 3: 后续优化（lossless-claw 等）
- **决策人**：主人

## 2026-04-09

### D003: 巡检时间设定
- **决策**：晨间简报 10:00，晚间总结 17:00，持续监控每 2h
- **决策人**：主人
- **变更**：2026-04-13，09:30 → 10:00（留出 Mac 开机缓冲时间）
- **变更**：2026-04-14，晚间总结改为 agentTurn 隔离 session（解决 4ms 空跑问题）

### D001: 理事会多 Agent 架构选型
- **决策**：采用 Session 级路由方案，主脑作为默认 agent 接收所有消息，通过 `sessions_spawn` 委派子 agent
- **原因**：OpenClaw 原生支持 session 级模型切换，无需额外基础设施
- **影响**：所有 agent 通过子 session 运行，结果回传主脑汇总
- **决策人**：主人

### D002: Agent 模型分配
- **决策**：Prime + Dev 使用 GLM-5.1，Research + Sentinel 使用 MiniMax
- **原因**：GLM 擅长逻辑推理和代码，MiniMax 擅长长文本和快速摘要
- **决策人**：主人

## 2026-04-08

### D000: 默认模型切换为 GLM-5.1
- **决策**：将默认模型从 MiniMax 切换为 zai/glm-5.1
- **原因**：主人获得智谱 coding 套餐 API
- **决策人**：主人

## 2026-04-14

### D013: Agent 专属 MCP servers 引入
- **决策**：每个子 agent 可声明独立的 MCP server 配置，通过 AGENTS.md 委派模板注入到 task 参数
- **原因**：参考 Claude Code per-agent MCP frontmatter；OpenClaw 所有 agent 共享全局 MCP，无法隔离
- **为什么 hook 注入不行**：`before_agent_start` / `subagent_spawning` 的返回值无法跨子 agent 生效；`registerTool` 注册的工具仅对本 session 有效
- **最终方案**：
  - **配置**：`config/agents/<agentId>.mcp.json` 声明每个 agent 的 MCP servers
  - **注入**：AGENTS.md 委派模板的 `### MCP Servers` 区块，主脑在委派时动态填充
  - **使用**：子 agent 通过 `mcporter call <server>.<tool>` 直接调用
  - **命名隔离**：server 名加 `agentId__` 前缀避免碰撞（如 `dev__filesystem`）
- **产出文件**：
  - `config/agents/dev.mcp.json` — dev agent 示例配置
  - `config/agents/research.mcp.json` — research agent 示例配置
- **插件保留**：`agent-mcp-servers` 插件已简化，仅做配置加载和生命周期日志
- **状态**：✅ 完成（依赖 AGENTS.md 委派模板，D014 共享同一注入机制）

### D014: Implicit Fork（完整上下文继承）
- **决策**：sessions_spawn 时，子 agent 默认继承父级完整对话上下文（最近 N 条消息 + 系统提示词）
- **原因**：参考 Claude Code forkSubagent.ts；当前 sessions_spawn 是"空白 slate"，上下文需手动重建
- **方案**：
  - 在 sessions_spawn 前，将当前会话的对话历史注入子 session 的 system prompt 或首条 user message
  - 上下文长度通过 token 预算控制（保留最近 X 条，截断超长部分）
  - 显式 `inheritContext: false` 可禁用此行为
- **状态**：设计阶段
