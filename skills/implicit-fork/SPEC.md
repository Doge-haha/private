# Implicit Fork — 技术规格

## 目标
`sessions_spawn` 时，子 agent 自动继承父级最近的对话历史，消除上下文空白问题。

## OpenClaw 源码分析

### 关键文件
- `dist/pi-embedded-CNTNdlGw.js`
  - `spawnSubagentDirect()` (line 13825) — spawn 主入口
  - `buildSubagentSystemPrompt()` (line 11775) — 构建 extraSystemPrompt
  - `SessionsSpawnToolSchema` (line 14297) — 工具参数 schema
  - `createSessionsSpawnTool()` (line 14328) — 工具注册

### 当前数据流
```
agent 调用 sessions_spawn(task, agentId, ...)
  → createSessionsSpawnTool.execute()
    → spawnSubagentDirect({ task, agentId, ... })
      → buildSubagentSystemPrompt({ task, requesterSessionKey, ... })
        → 返回纯结构化文本（Subagent Context + Rules + Session Context）
      → callSubagentGateway({ method: "agent", extraSystemPrompt: childSystemPrompt })
        → 子 session 收到 extraSystemPrompt，无任何父级对话历史
```

### 缺失环节
- `buildSubagentSystemPrompt()` 不知道父级对话内容
- `spawnSubagentDirect()` 有 `requesterSessionKey` 但未读取父级消息历史
- `callSubagentGateway` 的 `extraSystemPrompt` 是唯一的上下文注入点

## 实现方案

### 方案 A：Plugin Hook（推荐，不修改源码）

利用 OpenClaw 的 `subagent_spawned` hook 注入上下文：

```typescript
// plugins/implicit-fork/index.ts
export default {
  name: 'implicit-fork',
  hooks: {
    async subagent_spawned(ctx) {
      // 1. 从父 session 读取最近消息历史
      // 2. 通过 sessions.send 向子 session 发送上下文
    }
  }
}
```

**问题**：`subagent_spawned` hook 触发时子 agent 可能已开始运行，存在竞态。

### 方案 B：修改 buildSubagentSystemPrompt（直接修改 dist）

在 `spawnSubagentDirect` 中，spawn 前提取父级历史并注入 `childSystemPrompt`。

**修改点**：

1. **SessionsSpawnToolSchema** 添加参数：
```typescript
inheritContext: Type.Optional(Type.Boolean({ description: "Inject parent conversation history" }))
```

2. **spawnSubagentDirect** 添加上下文提取逻辑：
```typescript
// 在 childSystemPrompt 构建后，spawn 前
if (params.inheritContext !== false) {
  const parentHistory = await extractParentContext(requesterSessionKey, {
    maxChars: 4000,
    maxMessages: 20
  });
  if (parentHistory) {
    childSystemPrompt += `\n\n## Parent Context\n${parentHistory}`;
  }
}
```

3. **extractParentContext** 新函数：
```typescript
async function extractParentContext(sessionKey: string, opts: { maxChars: number, maxMessages: number }) {
  // 从 session file 读取最近 N 条 assistant/user 消息
  // 摘要格式：[role] message_text (截断到 maxChars)
  // 跳过 tool_result 和 tool_call 的冗余内容
}
```

### 方案 C：利用现有 sessions_send + 消息前缀（最小侵入）

不改源码，在主脑的委派 prompt 模板中手动注入上下文：

```
sessions_spawn({
  task: "...\n\n## Inherited Context\n{摘要}",
  agentId: "dev"
})
```

**这是最务实的方案**，零代码修改，立即可用。

## 推荐：方案 C 作为即时方案 + 方案 A 作为长期方案

### 即时方案（方案 C）

在 AGENTS.md 的委派模板中，主脑在 task 字段自动注入上下文摘要：

```markdown
### 委派时注入上下文

主脑在每次委派时，自动将以下内容拼入 task 参数：

1. 当前会话最近 5 轮对话的摘要（每轮 1-2 句）
2. 已读取的关键文件列表和核心发现
3. 当前正在处理的文件和代码位置

格式：
\`\`\`
{原始 task}

## Inherited Context
- 最近对话：{摘要}
- 已读文件：{文件列表}
- 当前焦点：{文件:行号}
\`\`\`
```

### 长期方案（方案 A/B）

通过 OpenClaw plugin 或 PR 实现自动上下文继承。

## Token 预算
- 上下文摘要上限：4000 chars（约 1000 tokens）
- 超出截断策略：保留最近消息，截断最旧的
- 显式禁用：`inheritContext: false` 或 task 中不包含 `## Inherited Context`

## 验证标准
1. 子 agent 收到 task 后能理解父级的探索发现，不重复读取相同文件
2. 上下文继承不影响子 agent 的独立运行能力
3. 禁用开关正常工作
4. 不破坏现有 sessions_spawn 兼容性
