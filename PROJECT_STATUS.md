# PROJECT_STATUS.md — 任务实时状态看板

## 当前任务

| 任务 | 负责人 | 状态 | 更新时间 |
|---|---|---|---|
| 新点 SaaS 计价系统 — 设计文档 | @prime | ✅ v1.0 完成（11个模块，100+功能按键，100+表单字段） | 2026-04-16 |
| 命令即 Prompt 委派机制 | @prime | ✅ 已完成 | 2026-04-09 |
| Coding Plan 优化策略 | @prime | ✅ 已完成 | 2026-04-09 |
| 压缩优化 #1-#9（配置+行为） | @prime | ✅ 已完成 | 2026-04-09 |
| Compaction Plus 插件 (#10-#12) | @prime | ✅ 已完成（2026-04-14 验证：9段摘要+CircuitBreaker+PartialCompaction全部在线，plugins.allow已配置） | 2026-04-14 |
| GLM Skills 安装与配置 | @dev | 🟡 进行中（8/11，ClawHub 限流） | 2026-04-09 |
| Context Engine 插件 (#A) | @prime | ✅ 已完成 | 2026-04-09 |
| Coordinator 委派决策树 (#B) | @prime | ✅ 已完成 | 2026-04-09 |
| 记忆系统升级 Phase 1 (Typed Memory) | @prime | ✅ 已完成（types/ + TYPES.md + 提取逻辑） | 2026-04-10 |
| 记忆系统升级 Phase 2 (自动提取触发) | @prime | ✅ 已完成（Cron + 隔离 session） | 2026-04-10 |
| 记忆系统升级 Phase 3 (智能召回) | @prime | ✅ 已完成（recall + Freshness） | 2026-04-10 |
| 记忆系统升级 Phase 4 (整合调优) | @prime | ✅ 已完成（INDEX + 文档） | 2026-04-10 |
| Continue/Spawn 决策引擎 | @prime | ✅ 已完成（skill + decision.ts 实现） | 2026-04-13 |
| Task 输出持久化设计 | @dev | ✅ Phase 1/2/3 全部完成（task-store + output-manager + polling-service + hooks，插件已注册运行） | 2026-04-14 |
| 两层验证机制设计 | @prime | ✅ 已完成（design doc + AGENTS.md diff） | 2026-04-13 |
| Cron 自动化配置 | @prime | ✅ 就位（晨间简报10:00 + 晚间总结17:00 + 持续监控每2h） | 2026-04-14 |

## 已完成任务

| 任务 | 负责人 | 完成时间 |
|---|---|---|
| 智谱 GLM-5.1 API 配置 | @dev | 2026-04-08 |
| Tavily 搜索配置 | @dev | 2026-04-08 |
| SOUL.md / USER.md 更新 | @prime | 2026-04-09 |

## 阻塞项

- 无

---

## 新点 SaaS 计价系统（KR3.1）

| 子任务 | 负责人 | 状态 | 备注 |
|---|---|---|---|
| 软件剖析（研究） | @research | 🟡 进行中 | 已启动，剖析现有数据库和 API |
| 架构设计文档 v1.0 | @prime | ✅ 完成 | 11个模块，100+功能按键和字段 |
| 数据库选型与建模 | @dev | ⬜ 待启动 | PostgreSQL + Redis |
| 后端 API 开发 | @dev | ⬜ 待启动 | FastAPI |
| 前端页面开发 | @dev | ⬜ 待启动 | React + Ant Design |

---

_最后更新：2026-04-19_

### [2026-04-16] 新点软件技术剖析 ✅
- **负责**: @research
- **产出**: `agents/research/新点软件剖析报告.md`
- **关键发现**:
  - 29个定额集，122,931条定额记录（dwgj.db）
  - 19,984条清单项目（Qdk_UpdateEPC.qa）
  - .de/.cl 等年份定额文件为加密二进制，未完全入库
  - Flask API 中清单相关接口数据源路径需修复
  - 23个XSD标准文件可用于SaaS数据模型设计
- **下一步**: 可进入 Phase 1（SQLite→PostgreSQL 迁移 + FastAPI）
