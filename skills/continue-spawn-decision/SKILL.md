# Continue/Spawn Decision Engine

基于 Claude Code Coordinator 模式的上下文重叠分析器。决定是继续使用当前 agent 还是开新 agent。

## 核心决策表

| 情境 | 决策 | 原因 |
|------|------|------|
| 研究过的文件 ≈ 要改的文件 | **Continue** | 上下文高度重叠 |
| 研究广 / 实现窄 | **Spawn Fresh** | 探索噪声会污染实现 |
| 纠正失败 / 延续近期工作 | **Continue** | Worker 有错误上下文 |
| 验证另一个 Worker 刚写的代码 | **Spawn Fresh** | 验证者必须独立视角 |
| 第一次方向完全错误 | **Spawn Fresh** | 错误路径会锚定重试 |
| 完全无关的新任务 | **Spawn Fresh** | 无可复用上下文 |
| verification 类型任务 | **Spawn Fresh** | 必须强制独立验证 |

## 评分权重

```
weightedScore = 文件重叠×0.4 + 概念重叠×0.3 + 工具重叠×0.2 + 消息重叠×0.1
```

## 决策阈值

- `weightedScore >= 0.6` → `continue`
- `weightedScore <= 0.3` → `spawn_fresh`
- `0.3 < weightedScore < 0.6` → 由 taskType 决定

## taskType 特殊规则

- `research` → 即使分数低也倾向 spawn（研究噪声）
- `implementation` → 分数高倾向 continue
- `verification` → **强制 spawn_fresh**（独立验证原则）
- `simple` → 直接 spawn_fresh（无需上下文）

## 使用方式

```typescript
import { analyzeContextOverlap, shouldContinueVsSpawn, buildDecisionRationale } from './decision'

// 抓取当前 agent 上下文快照
const currentContext = await captureContextSnapshot(agentSession)

// 分析新任务的上下文重叠
const newTask = {
  taskDescription: "修复 src/auth/validate.ts 的空指针",
  taskType: "implementation",
  targetFiles: ["src/auth/validate.ts", "src/auth/types.ts"]
}

const overlap = analyzeContextOverlap(currentContext, newTask)
const decision = shouldContinueVsSpawn(overlap, newTask.taskType)
const rationale = buildDecisionRationale(decision, currentContext, newTask)

console.log(`决策: ${decision.recommendation}`)
console.log(`理由: ${rationale}`)
// continue → spawn Continue 消息给现有 agent
// spawn_fresh → sessions_spawn 新 agent
```

## 触发场景

当 @dev 或 @research 完成一个阶段后，需要决定下一步时调用。

## 调用方式

### 快速调用（推荐）

```bash
python3 skills/continue-spawn-decision/decide.py \
  "修 validate.ts 的 JWT 逻辑" \
  --type implementation \
  --files src/auth/validate.ts src/auth/types.ts \
  --current-files src/auth/validate.ts src/auth/types.ts \
  --current-concepts authentication JWT session \
  --session current-session-id
```

**输出示例**：
```
[Session: agent-xxx]
[Task: 修 validate.ts 的 JWT 逻辑]

[DECISION] CONTINUE
  置信度: 50%
  决策理由: 文件重叠50%≥50%，同一文件的上下文有复用价值

  重叠度分析:
    文件重叠: 50% (权重40%)
    概念重叠: 30% (权重30%)
    工具重叠: 10% (权重20%)
    消息重叠: 5% (权重10%)
    加权总分: 27%

  → sessions_send(现有session, 任务)
```

### 快速模式（只显示决策）
```bash
python3 skills/continue-spawn-decision/decide.py "修 validate.ts 的空指针" -t implementation --files src/auth/validate.ts --current-files src/auth/validate.ts -q
```
输出：`CONTINUE | 文件重叠50%≥50%，同一文件的上下文有复用价值`

### JSON 模式（程序调用）
```bash
python3 skills/continue-spawn-decision/decide.py "任务描述" -t implementation --files file.ts --json
```

### Python 模块调用
```python
from skills.continue-spawn-decision.decide import analyze_context_overlap, decide_action

o = analyze_context_overlap(current_files, current_concepts, new_files, new_concepts, desc)
r = decide_action(o, task_type, return_dict=True)
print(r['recommendation'], r['action'])
```

## 依赖

- 当前 session 的 recently_read_files（从消息历史提取）
- 当前 session 的 recently_written_files（从消息历史提取）
- 当前 session 讨论的概念（从消息内容提取）
- 新任务的 taskType 和 targetFiles
