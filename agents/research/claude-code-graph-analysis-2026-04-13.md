# Claude Code 源码深度分析 + 知识图谱
**研究日期**: 2026-04-13
**图谱规模**: 131 节点 · 167 边 · 16 社区
**数据来源**: `/Users/huahaha/WorkSpace/something/src/claude-code-leaked-main/source code/`

---

## 一、核心架构发现（源码级验证）

### 1. Coordinator 模式 — 是哲学，不是功能

Claude Code 的 Coordinator 不是"一个功能"，而是一套**行为哲学**：

```
Coordinatror 的职责：
1. 理解问题（不立即委派）
2. 综合研究结果（必须自己消化，不说"基于你的发现"）
3. 写出精确的实施规格（文件名+行号+改动内容）
4. 决定用 Continue 还是 Spawn Fresh
```

**Continue vs Spawn Fresh 决策表**（源码 coordinatorMode.ts Section 5）：

| 情境 | 机制 | 原因 |
|------|------|------|
| 研究过的文件 ≈ 要改的文件 | **Continue** | Worker 已有上下文 + 清晰计划 |
| 研究广 / 实现窄 | **Spawn Fresh** | 避免探索噪声污染 |
| 纠正失败 / 延续近期工作 | **Continue** | Worker 有错误上下文 |
| 验证另一个 Worker 刚写的代码 | **Spawn Fresh** | 验证者应用全新视角 |
| 第一次方向完全错误 | **Spawn Fresh** | 错误路径会锚定重试 |
| 完全无关的新任务 | **Spawn Fresh** | 无可复用上下文 |

**关键教训**：没有"默认重试"——失败后由 Coordinator 决策下一步，不是算法。

---

### 2. Memory System — 是约束系统，不是存储系统

Claude Code 的 4 类记忆不是"存什么"，而是**明确排除什么**：

**禁止存入记忆**（WHAT_NOT_TO_SAVE_SECTION）：
- ❌ 代码模式、架构、文件路径（可从代码推导）
- ❌ Git 历史（`git log` 更权威）
- ❌ 调试方案（修复在代码里）
- ❌ CLAUDE.md 已有的内容
- ❌ 临时状态、进行中的工作

**Memory Drift 机制**（源码验证）：
- 超过 1 天的记忆需**在使用前验证**
- 记忆是"某时间点的快照"，不是当前状态
- 引用记忆中的文件/函数 → **必须先 grep 验证存在**

**feedback 类记忆的 Why+How 模式**：
```markdown
## 规则
集成测试必须使用真实数据库，不能 mock。

**Why:** 上个季度因为 mock 测试通过但生产迁移失败，导致了一次事故。

**How to apply:**
- 所有集成测试连接真实测试数据库
- E2E 测试使用独立的数据库实例
```

---

### 3. Task 系统 — outputFile 持久化

7 种 TaskType：
- `b` local_bash / `a` local_agent / `r` remote_agent
- `t` in_process_teammate / `w` local_workflow
- `m` monitor_mcp / `d` dream

每个 Task 有独立 `outputFile`（`~/.claude/tasks/{sessionId}/{id}`），**重启后可恢复输出**。

ProgressTracker 追踪：input_tokens（最新值）+ output_tokens（累加）+ tool_use_count + recent_activities。

---

### 4. Permission 3 层级联

```
Hook 检查（毫秒级，本地）
    ↓ 失败则
Classifier 检查（慢，推理，仅 bash）
    ↓ 失败则  
User Dialog（用户交互）
```

Coordinator Worker 和 Swarm Worker 有**不同的 Permission Handler**（`coordinatorHandler.ts` vs `swarmWorkerHandler.ts`）。

---

### 5. 两层验证机制

```python
# Layer 1: Worker 自验证
"implementation worker: run tests + typecheck, then commit"

# Layer 2: 独立验证 Worker  
"verification worker: prove it works, don't rubber-stamp"
```

---

## 二、跨系统桥接（Claude Code → OpenClaw）

| Claude Code | OpenClaw | 关系 | 可实现性 |
|-------------|----------|------|---------|
| Coordinator | The Prime | **same_as** | ✅ 已实现 |
| Worker | @dev Agent | inspired_by | ✅ 已实现 |
| AgentTool | sessions_spawn | analogous_to | ✅ 已实现 |
| SendMessageTool | sessions_send | analogous_to | ⚠️ 待实现 |
| 4-Class Memory | 4-Class Memory | **same_as** | ✅ 已实现 |
| Memory Drift | Freshness Warning | **same_as** | ✅ 已实现 |
| Continue vs Spawn | Coordinator 决策树 | realizes | ⚠️ 部分实现 |
| No Auto-Retry | — | design_constraint | ⭐ 待补充 |
| Two-Layer Verify | — | pattern_for | ⭐ 待实现 |
| .claude/rules/ | SOUL.md + AGENTS.md | analogous_to | ⚠️ 概念层 |
| outputFile 持久化 | — | persists | ⭐ 待实现 |
| Permission Hooks | — | — | ⭐ 待实现 |

---

## 三、OpenClaw 缺失能力（优先级排序）

### 🔴 高优先级（对标 Claude Code 差距大）

**1. Continue vs Spawn 决策引擎**
- 现状：AGENTS.md 只有文字描述，无机制
- 行动：在 SOUL.md 或专用模块实现决策函数
- 关键：context overlap 判断（可基于共享文件数、共享概念数）

**2. 无自动重试 → 需失败处理决策**
- 现状：工具失败直接报错
- 行动：参考 Coordinator 模式，失败时给用户/Coordinator 决策选项

**3. Task outputFile 持久化**
- 现状：session 结束则输出丢失
- 行动：每个 session 的关键输出写入 `memory/types/project/` 持久化

### 🟡 中优先级

**4. 两层验证机制**
- Worker 自验证 + 独立验证 Worker
- 当前 OpenClaw 只有自验证（如果有的话）

**5. Permission Hooks 系统**
- 当前：无工具权限过滤机制
- 目标：实现 hooks 链，支持自动化权限判断

**6. .claude/rules/ 层级加载**
- 当前：AGENTS.md 是静态文件
- 目标：支持按目录层级加载不同规则集

### 🟢 低优先级（长期）

**7. Daily Log Mode（KAIROS）** — 长期 session 的 append-only 日志

**8. Search Past Context** — grep session transcript 的能力

---

## 四、已验证一致的实现

以下 Claude Code 特性已在 OpenClaw 正确实现（源码级验证一致）：

✅ **4-Class Memory Taxonomy** — 完全一致（user/feedback/project/reference）  
✅ **Memory Drift / Freshness Warning** — 完全一致  
✅ **Memory Exclusions** — OpenClaw 也有明确排除规则  
✅ **Coordinator Pattern** — OpenClaw 的 The Prime = Claude Code Coordinator  
✅ **Agent 分工**（research/dev/sentinel）— 对应 Claude Code Worker 类型  
✅ **熔断机制（Partial Compaction）** — Claude Code 无此功能，OpenClaw 领先  

---

## 五、Graphify 图谱使用指南

图谱文件：`graphify-out/graph.html`

**最有价值的查询**：

1. **"The Prime 如何通过 memory-extractor 和 compaction-plus 实现持续进化？"**
   → 路径：soul_prime → 4class_memory → memory-extractor → shouldExtractMemory()

2. **"Claude Code 的 Coordinator 和 OpenClaw 的 Prime 有什么本质区别？"**
   → 对比 cc_coordinator 社区 vs soul_prime 社区的边

3. **"compaction-plus 的熔断机制在 Claude Code 有对应实现吗？"**
   → 答案：无。Claude Code 用的是 Continue/Spawn 决策，不是熔断

---

## 六、关键文件索引（源码位置）

| 概念 | 源码文件 |
|------|---------|
| Coordinator 系统提示 | `coordinator/coordinatorMode.ts` |
| 4-Class Memory 定义 | `memdir/memoryTypes.ts` |
| Memory 加载逻辑 | `memdir/memdir.ts` |
| Task Type 定义 | `tasks/types.ts` |
| LocalAgentTask | `tasks/LocalAgentTask/LocalAgentTask.tsx` |
| Permission Handler | `hooks/toolPermission/handlers/coordinatorHandler.ts` |
| Swarm Permission | `hooks/toolPermission/handlers/swarmWorkerHandler.ts` |
| Rules 加载 | `utils/claudemd.ts` |

---

_Last updated: 2026-04-13_
