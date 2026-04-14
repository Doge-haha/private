# 两层验证机制设计
**日期**: 2026-04-13
**目标**: 为 OpenClaw 实现 Claude Code 风格的两层验证机制
**参考**: Claude Code `coordinatorMode.ts` Section 4

---

## 一、Claude Code 机制分析

### 1.1 两层验证流程

```
Layer 1: Worker Self-Verification (实现者自验证)
  ↓ "run tests + typecheck, then commit"
  
Layer 2: Independent Verification Worker (独立验证者)
  ↓ "prove it works, don't rubber-stamp"
  ↓ "Try edge cases and error paths"
```

### 1.2 关键原则

1. **独立视角**: 验证者不能继承实现者的错误上下文
2. **证明可用**: 验证代码存在 ≠ 验证代码能用
3. **调查失败**: 失败时必须调查原因，不能 dismiss
4. **覆盖边缘**: 不仅测 happy path，还要测 edge cases

### 1.3 Claude Code 实现

```typescript
// Coordinator Mode Section 4:
// "What Real Verification Looks Like"

Verification means proving the code works, not confirming it exists.
- Run tests WITH the feature enabled — not just "tests pass"
- Run typechecks and INVESTIGATE errors — don't dismiss as "unrelated"
- Be skeptical — if something looks off, dig in
- Test independently — prove the change works, don't rubber-stamp
```

---

## 二、OpenClaw 当前状态

### 2.1 现有 AGENTS.md 描述

```markdown
### 3.3 任务工作流 (Task Workflow)

| 阶段 | 谁做 | 目的 |
|------|------|------|
| 研究 | @research（可并行） | 调查代码库、搜索信息、分析方案 |
| 综合 | **主脑** | 理解发现，制定实施规格 |
| 实施 | @dev（按文件集串行） | 按规格修改代码 |
| 验证 | @dev 或新 Worker | 测试、lint、构建验证 |
```

**问题**: 只有"测试、lint、构建验证"一句话，没有区分 Layer 1 自验证和 Layer 2 独立验证。

---

## 三、设计方案

### 3.1 两层验证流程

```
                    ┌─ Phase 1: 研究 ──────────────────┐
                    │  @research (并行)                  │
                    │  调查、搜索、分析                  │
                    └───────────────────────────────────┘
                                    ↓
                    ┌─ Phase 2: 实施 ──────────────────┐
                    │  @dev                             │
                    │  按规格修改代码                   │
                    │  ⭐ Layer 1: Self-Verification    │
                    │    - 构建验证                     │
                    │    - 单元测试                     │
                    │    - 自测通过后才能提交           │
                    └───────────────────────────────────┘
                                    ↓
                    ┌─ Phase 3: 独立验证 ─────────────┐
                    │  @prime 或 @dev (新 session)     │
                    │  ⭐ Layer 2: Independent Verify   │
                    │    - 功能测试 (happy + edge)     │
                    │    - 集成测试                    │
                    │    - 回归测试                    │
                    │    - 性能检查（可选）            │
                    └───────────────────────────────────┘
                                    ↓
                    ┌─ Phase 4: 合并报告 ─────────────┐
                    │  @prime                         │
                    │  综合两层验证结果向主人汇报       │
                    └───────────────────────────────────┘
```

### 3.2 Layer 1: Worker Self-Verification

**执行者**: 实现 @dev agent

**验证步骤**:
1. 构建验证: `npm run build` / `tsc --noEmit`
2. 单元测试: `npm test` (只跑相关模块的测试)
3. 相关性检查: 确保失败不是"无关错误"

**输出格式**:
```typescript
interface Layer1Verification {
  layer: 1
  agent: "@dev"
  passed: boolean
  buildResult: {
    success: boolean
    errors: string[]  // 如果失败，具体的错误信息
  }
  testResult: {
    passed: boolean
    relevantFailures: string[]  // 只记录与改动相关的失败
    irrelevantFailures: string[]  // 忽略的无关失败
  }
  selfAssessment: "ready_for_independent" | "needs_fix" | "uncertain"
  notes: string
}
```

**决策树**:
```
Layer1 结果:
  build 失败 → 修复 build 错误，重新自测
  test 有相关失败 → 修复后重新自测
  test 只有无关失败 → selfAssessment = "ready_for_independent"
  全部通过 → selfAssessment = "ready_for_independent"
```

### 3.3 Layer 2: Independent Verification

**执行者**: @prime 或新 @dev agent（新 session，无实现上下文）

**验证步骤**:
1. **功能测试**: 用实际数据跑关键路径，不是 demo
2. **边缘测试**: 空输入、非法输入、临界值
3. **集成测试**: 与其他模块的交互
4. **回归测试**: 改动的改动有没有破坏现有功能

**关键原则**:
- **不看实现者的错误上下文**: 验证者从需求出发，不从"实现者哪里可能错了"出发
- **主动找错**: 不是确认代码能用，而是尝试让它失败
- **调查失败**: 任何测试失败都要调查原因，不 dismiss

**输出格式**:
```typescript
interface Layer2Verification {
  layer: 2
  agent: "@prime" | "@dev"
  passed: boolean
  functionalTests: {
    happyPath: boolean
    edgeCases: { input: string; expected: string; actual: string; pass: boolean }[]
  }
  integrationTests: {
    moduleA: boolean
    moduleB: boolean
  }
  regressionTests: {
    existingFeaturesAffected: string[]
    allPassed: boolean
  }
  findings: {
    type: "edge_case_found" | "integration_issue" | "regression" | "performance"
    severity: "critical" | "major" | "minor"
    description: string
    recommendation: string
  }[]
  finalAssessment: "approved" | "needs_changes" | "rejected"
}
```

### 3.4 AGENTS.md 修改 Diff

```diff
### 3.3 任务工作流 (Task Workflow)

| 阶段 | 谁做 | 目的 |
|------|------|------|
| 研究 | @research（可并行） | 调查代码库、搜索信息、分析方案 |
| 综合 | **主脑** | 理解发现，制定实施规格 |
| 实施 | @dev（按文件集串行） | 按规格修改代码 |
+| 实施自验 | @dev | Layer 1: 构建 + 单元测试 + 自评估 |
+| 独立验证 | @prime / 新 @dev | Layer 2: 功能 + 边缘 + 集成 + 回归 |
| 合并报告 | **主脑** | 综合结果，汇报主人 |

### 3.4 验证阶段详细规范

+#### Layer 1: Worker Self-Verification (实施者)
+
+**触发条件**: @dev 完成代码修改后
+
+**验证步骤**:
+1. 构建验证: `npm run build` 或 `tsc --noEmit`
+2. 相关单元测试: `npm test -- --testPathPattern=<改动模块>`
+3. 相关性判断: 失败是"相关"还是"无关"
+
+**输出**: `Layer1Verification` 结构（含 selfAssessment）
+
+**自验通过标准**:
+- 构建成功
+- 相关测试全部通过
+- 无关测试失败不影响（记录但不阻塞）
+
+#### Layer 2: Independent Verification (独立验证者)
+
+**触发条件**: Layer 1 通过后
+
+**执行者**: @prime 直接执行，或委派给新的 @dev session
+
+**验证步骤**:
+1. 功能测试: 用实际数据跑关键路径
+2. 边缘测试: 空/非法/临界值输入
+3. 集成测试: 与其他模块的交互
+4. 回归测试: 确认现有功能未被破坏
+
+**验证原则**:
+- 从需求出发，不从"实现者哪里可能错了"出发
+- 主动尝试让代码失败
+- 任何失败都要调查，不 dismiss
+
+**输出**: `Layer2Verification` 结构（含 finalAssessment）
+
+**通过标准**:
+- 功能测试通过
+- 边缘用例有应对方案
+- 集成测试通过
+- 回归测试通过
+
+**失败处理**:
+- `needs_changes`: 可以修复，返回 @dev 修复后重新 Layer 1
+- `rejected`: 方向性错误，重新从研究阶段开始
```

### 3.5 验证失败决策树

```
Layer 2 结果:
  │
  ├─ finalAssessment = "approved"
  │    → 汇报主人，进入下一任务
  │
  ├─ finalAssessment = "needs_changes"
  │    → 判断修复范围:
  │         小改: @dev 修复 → Layer 1 重跑 → Layer 2 重跑
  │         大改: @dev 修复 → Layer 1 重跑 → Layer 2 重跑
  │
  └─ finalAssessment = "rejected"
       → 向主人汇报:
            "验证发现方向性错误，建议重新评估方案"
            等待主人决策
```

---

## 四、实施建议

### 4.1 快速路径（最小可用）

1. **不改变现有架构，只在 AGENTS.md 补充验证阶段描述**
2. **Layer 1**: 要求 @dev 在提交前运行 build + 相关测试
3. **Layer 2**: @prime 收到 @dev 完成通知后，主动执行一次快速功能验证

### 4.2 完整路径

1. 实现 `verify_result()` 函数（在 `skills/verification/` skill）
2. 在 AGENTS.md 中正式加入两层验证流程
3. 修改 @dev 的委派 prompt，要求返回 `Layer1Verification`
4. 实现 @prime 的验证委派逻辑

---

## 五、相关文件

| 文件 | 改动 |
|------|------|
| `AGENTS.md` | 加入 3.4 验证阶段详细规范 |
| `skills/verification/SKILL.md` | skill 定义 |
| `skills/verification/verify-layer1.ts` | Layer 1 验证逻辑 |
| `skills/verification/verify-layer2.ts` | Layer 2 验证逻辑 |
| `skills/verification/types.ts` | 验证数据结构 |

---

_Last updated: 2026-04-13_
