# 模型调配策略 (Model Allocation Strategy)

## 背景

GLM-5.1 是智谱 API，有用量限制和更高的单次成本。MiniMax 性价比更高、响应更快。

## 模型定位

| 模型 | 场景 | 特点 |
|------|------|------|
| `zai/glm-5.1` | 复杂推理、架构设计、多步骤规划、战略决策 | 逻辑强、指令遵循好、成本高 |
| `minimax/MiniMax-M2.7` | 中等复杂度任务、研究分析、深度搜索 | 平衡 |
| `minimax/MiniMax-M2.7-highspeed` | 快速响应、简单问答、监控、后台任务 | 极速、便宜 |

## 默认配置

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "minimax/MiniMax-M2.7-highspeed"
      }
    }
  }
}
```

## 模型切换规则

### 主脑 (@prime) 任务分配

| 任务类型 | 使用模型 | 原因 |
|----------|----------|------|
| 复杂多步骤规划、架构设计 | GLM-5.1 | 推理能力强 |
| 模糊意图理解、决策判断 | GLM-5.1 | 指令遵循更好 |
| 快速问答、配置查询、状态检查 | MiniMax-M2.7-highspeed | 响应快 |
| 普通任务委派（@dev/@research/@sentinel） | MiniMax-M2.7-highspeed | 节省 GLM 额度 |
| 子 agent 任务（subagent spawn） | MiniMax-M2.7-highspeed | 默认不指定 model |

### 按需显式调用 GLM-5.1

在委派 prompt 中指定 model：

```json
{
  "model": "zai/glm-5.1"
}
```

以下场景**必须使用 GLM-5.1**：
1. 架构设计（新建系统、模块划分）
2. 复杂代码审查（PR 评估、多文件 refactor）
3. 战略规划（OKR 制定、业务分析）
4. 涉及多轮推理的调试（错误定位 + 修复方案）

以下场景**禁止使用 GLM-5.1**（强制高速模型）：
1. 心跳巡检（HEARTBEAT）
2. 简单问答
3. 状态查询（读文件、看配置）
4. 单文件修改（< 20 行）
5. Cron 自动化任务

## 额度和成本监控

- `session_status` 显示当前模型用量
- 每天 17:00 @sentinel 晨/晚间简报包含用量摘要
- GLM-5.1 额度低于 20% 时，自动降级所有非必须任务到 MiniMax

## 子 agent 模型覆盖

Spawn 子 agent 时不指定 model（使用默认高速模型）：

```typescript
sessions_spawn({
  task: "...",
  // 不写 model，默认用 MiniMax-M2.7-highspeed
})
```

只有当子任务明确是复杂推理时，才覆盖：

```typescript
sessions_spawn({
  task: "...",
  model: "zai/glm-5.1",  // 复杂推理任务
})
```

## 文件

- 配置：`~/.openclaw/openclaw.json`
- 本策略：`~/.openclaw/workspace/MODEL_STRATEGY.md`
