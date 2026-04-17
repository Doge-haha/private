# GOALS.md — 长期 OKR 与核心优先级

## 当前 OKR

### KR1: 打造全能型 OpenClaw Agent
- [ ] 理事会多 Agent 架构落地
- [ ] Skills 生态完善
- [ ] 自动化巡检体系运行

### KR2: OpenClaw 架构优化
- [ ] Soul 演进与角色分工
- [ ] 模型路由策略优化
- [ ] 记忆与上下文管理优化

### KR3: 工程咨询行业 IT 信息化建设
- [x] 新点计价软件剖析（2026-04-16）
- [ ] SaaS 计价系统架构设计
- [ ] 原型开发与验证

### KR3.1: 新点 SaaS 计价系统
**目标**: 剖析新点清单造价江苏版桌面软件，开发完全自主的 Web SaaS 版

**已知信息**:
- 现有系统: .NET WPF + Python Flask API + SQLite
- 定额数据: 28 个定额集，122,588 条记录（dwgj.db）
- 清单数据: QDK 数据库（格式待确认）
- 现有 API: `http://localhost:8765`（Flask）已能查定额
- 现有前端: `前端/index.html`（简单搜索界面）

**技术路线**: Python FastAPI + React + PostgreSQL/MySQL

## 核心优先级

1. 理事会架构稳定运行
2. 自动化工作流覆盖日常任务
3. 知识管理体系化

---

_最后更新：2026-04-09_
