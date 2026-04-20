# Codex 快速启动手册

> 生成日期：2026-04-18
> 适用：OpenClaw 理事会 + Codex 协同开发

---

## 一、Codex 现状

| 项目 | 路径/状态 |
|------|-----------|
| App | `/Applications/Codex.app` ✅ 已安装 |
| CLI | `/Applications/Codex.app/Contents/MacOS/Codex` |
| 配置 | `~/.codex/config.toml` |
| 认证 | `~/.codex/auth.json`（OPENAI_API_KEY ✅）|
| 模型 | `gpt-5.4`（config.toml） |
| Projects | `~/.codex/projects/` |

---

## 二、Codex 与 OpenClaw 集成

### 调用方式（OpenClaw spawn）

```bash
# OpenClaw 中启动 Codex（PTY 模式）
codex exec '你的开发任务'   # pty:true 必须

# 示例：让 Codex 开发一个 API
codex exec '创建 Spring Boot 项目结构，包含 JWT 认证'

# 监控输出
process log <sessionId>
```

### 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `pty` | `true` | 必须，Codex 是交互式 CLI |
| `command` | `codex exec '...'` | 执行指令 |
| `workdir` | 项目路径 | Codex 只看到该目录上下文 |
| `background` | `true` | 后台运行，不阻塞 |
| `timeout` | `300+` | 复杂任务建议 5 分钟以上 |

### 权限模式

```bash
# OpenClaw 中跳过权限确认
codex exec --print '任务'  # --print 模式
```

---

## 三、配置优化（~/.codex/config.toml）

```toml
model = "gpt-5.4"
model_reasoning_effort = "medium"  # low/medium/high，越高推理越深
personality = "pragmatic"          # pragmatic/creative/careful

# 信任级别（项目级）
[projects."/path/to/project"]
trust_level = "trusted"  # trusted = 允许执行 shell/写文件等高风险操作

# 插件市场
[marketplaces.openai-bundled]
source = "/Users/huahaha/.codex/.tmp/bundled-marketplaces/openai-bundled"
last_updated = "2026-04-17T14:21:16Z"
```

### 插件列表（已启用）

| 插件 | 功能 |
|------|------|
| `github@openai-curated` | GitHub 集成（PR、issue、repo 操作） |
| `figma@openai-curated` | Figma 设计图读取 |
| `superpowers@openai-curated` | 增强能力包 |
| `notion@openai-curated` | Notion 笔记读写 |

---

## 四、项目快速启动流程

### Step 1：确认 Codex 可用

```bash
# 方式A：通过 Codex App（需先打开 App）
open -a Codex

# 方式B：直接调 CLI（需 PATH）
/Applications/Codex.app/Contents/MacOS/Codex --version
```

### Step 2：添加到 PATH（推荐）

```bash
# 永久添加
sudo ln -s /Applications/Codex.app/Contents/MacOS/Codex /usr/local/bin/codex

# 验证
codex --version
```

### Step 3：在 OpenClaw 中调用

```bash
# 在项目目录启动 Codex 开发任务
codex exec '用 Spring Boot 实现项目管理增删改查 API，包含 JWT 认证' \
  --project /Users/huahaha/Documents/my-project
```

### Step 4：Agent 模式选择

Codex 支持两种模式：
- **Plan 模式**（`/plan`）：先分析再执行，适合复杂任务
- **Build 模式**（`/build`）：直接动手，适合明确任务

---

## 五、OpenClaw + Codex 协作模式

### 主脑协调流

```
@prime（主脑）
  ├── 分析任务类型
  ├── 判断：Codex 适合做？
  │     ├── 需求：写完整项目/大功能 → 是
  │     ├── 需求：修一个 Bug / 改几行 → 否（直接 edit）
  │     └── 需求：技术调研/方案设计 → 否（@research）
  │
  ├── 委派给 Codex
  │     sessions_spawn → codex exec '...'
  │
  └── 综合结果，汇报

@dev（代码审查）
  └── 接收 Codex 产出，做安全/质量审查
```

### 快速启动命令模板

```bash
# 模板：Codex 开发任务
codex exec '
  项目目录：<path>
  技术栈：<stack>
  任务：<task>
  约束：
    - 使用 <规范>
    - 包含单元测试
    - 输出到 <目录>
' --project <path>
```

---

## 六、Skills 推荐（ClawHub）

| Skill | 用途 |
|-------|------|
| `coding-agent` | OpenClaw ↔ Codex 集成调用 |
| `code-reviewer` | Codex 产出代码审查 |
| `backend-architect` | API 设计规范 |
| `security-engineer` | 安全扫描 |

---

## 七、常见问题

### Q: Codex 不在 PATH
```bash
sudo ln -s /Applications/Codex.app/Contents/MacOS/Codex /usr/local/bin/codex
```

### Q: Codex 报权限错误
```bash
# config.toml 中设置信任级别
[projects."/path/to/project"]
trust_level = "trusted"
```

### Q: OpenClaw 调用 Codex 失败
- 确认 Codex App 已打开（首次需要）
- 或直接调 CLI：`/Applications/Codex.app/Contents/MacOS/Codex exec '...'`

### Q: 怎么让 Codex 只做规划？
```
codex exec '/plan 分析这个需求的实现方案，输出架构设计'
```

---

## 八、vs Claude Code 对比

| 维度 | Codex | Claude Code |
|------|-------|------------|
| 模型 | GPT-5.4 | Claude |
| 插件生态 | GitHub/Figma/Notion | OpenClaw MCP |
| 平台 | macOS App | 跨平台 CLI |
| 调用方式 | App/CLI | CLI |
| 价格 | API Key | API Key |
