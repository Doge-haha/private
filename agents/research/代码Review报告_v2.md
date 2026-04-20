# 新点 SaaS 造价系统 — 第二轮代码 Review 报告

**审查日期**: 2026-04-17  
**审查范围**: `apps/api/` (TypeScript 主业务后端) + `legacy/backend-java/` (冻结原型)  
**审查员**: AI Code Reviewer

---

## 总体评价

项目已完成从 Java/Spring Boot 到 TypeScript/Fastify 的技术栈迁移决策，`apps/api` 是当前活跃开发的核心模块。整体架构清晰、分层合理，测试覆盖较充分。以下按审查维度逐一分析。

---

## 1. 架构设计

### 🟢 做得好的地方

- **模块划分清晰**: 按业务域（project、bill、quota、pricing、fee、engine）拆分模块，每个模块包含 repository + service，职责单一
- **依赖注入模式**: Service 通过构造函数注入 repository 和 dependencies，便于测试和替换
- **接口抽象**: 每个 repository 定义 interface + InMemory 实现，支持测试隔离
- **共享基础设施**: `shared/auth`、`shared/errors`、`shared/http`、`shared/tx` 抽取合理
- **路由与业务逻辑分离**: `create-app.ts` 只做路由编排和参数解析，业务逻辑全在 service 层

### 🟡 建议改进

- **`create-app.ts` 过于臃肿 (742行)**: 所有路由定义在一个文件中。建议按模块拆分路由注册（如 `routes/bill-routes.ts`、`routes/project-routes.ts`），主文件只做组装
- **worker 和 mcp-gateway 仅有 descriptor 占位**: `apps/worker/src/main.ts` 和 `apps/mcp-gateway/src/main.ts` 各只有 ~15 行的描述性对象，无实际实现。README 和设计文档描述的功能（import-parse、report-export、batch-recalc 等）尚未落地
- **事务管理过于简单**: `InlineTransactionRunner` 是空壳实现（直接执行回调），生产环境需要真正的数据库事务支持
- **缺少日志中间件**: 没有请求级日志、trace-id、耗时记录等生产级可观测性基础设施

---

## 2. 代码质量

### 🟢 做得好的地方

- **TypeScript 严格模式**: `tsconfig.base.json` 启用 `strict: true`
- **Zod Schema 验证**: 所有输入通过 Zod schema 校验，类型安全
- **统一错误处理**: `AppError` + 全局错误处理器，结构化错误响应
- **命名规范一致**: 文件名 kebab-case、类名 PascalCase、方法名 camelCase
- **代码风格统一**: 全项目采用 ESM (.js 后缀 import)、一致的模式

### 🟡 建议改进

- **`BillWorkItemService.createWorkItem` 实现有设计问题**: 为了做权限校验，调用了 `billItemService.updateBillItem()` 传入现有数据（相当于做了一次无意义的 update）。这是用副作用操作来实现权限检查，违反了命令查询分离原则（CQS）。应该提取一个专门的 `getAuthorizedBillItem()` 方法或直接在 service 内部做授权检查
- **`BillItemService` 和 `BillVersionService` 重复实现授权逻辑**: `BillItemService.getAuthorizedVersion()` 和 `BillVersionService.getAuthorizedVersion()` 几乎相同的代码。建议抽取为共享的 AuthorizationMixin 或基类方法
- **`create-app.ts` 中大量重复的 repository fallback**: 几乎每个 service 创建都有 `options.xxxRepository ?? new InMemoryXxxRepository([])` 的 fallback，导致同一 repository 可能被创建多个实例。建议在 `createApp` 入口处统一初始化

### 🔴 严重问题

- **Repository 实例不一致**: `create-app.ts` 中，当某个 repository 未通过 options 传入时，`projectService` 和 `billVersionService` 各自创建了独立的 `InMemoryProjectRepository` 实例。这意味着 `projectService` 中的数据和 `billVersionService` 中的数据不在同一个 store 中。测试中如果依赖跨 service 数据一致性，可能导致隐蔽 bug。虽然当前测试都通过 options 注入了同一实例，但 fallback 路径是 broken 的

---

## 3. 数据模型

### 🟢 做得好的地方

- **Record 类型定义完整**: `BillVersionRecord`、`BillItemRecord`、`QuotaLineRecord` 等类型定义清晰
- **Flyway 迁移脚本规范**: V1-V3 迁移脚本使用 `create table if not exists`、有合适的索引和唯一约束
- **UUID 主键**: 数据库层使用 UUID 主键，符合分布式系统要求
- **V2 种子数据**: discipline_type 和 standard_set 的种子数据使用 `on conflict do nothing`，幂等可重放

### 🟡 建议改进

- **TS Record 类型与 SQL Schema 不同步**: 
  - `ProjectRecord` 缺少 `project_type`、`template_name`、`owner_user_id`、`client_name`、`location_code` 等数据库字段
  - `BillItemRecord` 缺少 `item_level`、`is_measure_item`、`lock_status`、`validation_status`、`tax_rate` 等字段
  - `BillVersionRecord` 缺少 `version_type`、`lock_status`、`business_identity` 等字段
  - TS 模型是简化版本，与数据库 schema 存在较大差异。在接入真实数据库时需要做大量对齐

- **缺少 price_version 和 price_item 的数据库迁移**: `V1-V3` 没有 price 相关的表定义，但业务逻辑中已经使用

---

## 4. API 设计

### 🟢 做得好的地方

- **RESTful 路径设计**: 资源嵌套关系清晰（`/v1/projects/:id/bill-versions/:id/items/:id/quota-lines`）
- **HTTP 状态码正确**: 创建返回 201，验证错误返回 422，资源锁定返回 423
- **分页参数标准化**: 通过 `paginationQuerySchema` 统一处理，有 max 限制
- **OpenAPI 文档存在**: `docs/api/openapi-v1.yaml` 定义了 API 契约

### 🟡 建议改进

- **缺少 DELETE 端点**: 当前 API 只有 GET/POST/PUT，没有 DELETE。bill-item、quota-line 等资源无法删除
- **`copy-from` 语义不清晰**: `POST /v1/projects/:id/bill-versions/:id/copy-from` 的路径语义是"从某个版本复制"，但 `billVersionId` 在路径中代表的是源版本而非目标版本。建议改为 `POST /v1/projects/:id/bill-versions` + body 中的 `sourceVersionId`
- **`recalculate` 使用 POST 是正确的**: 幂等性考虑到位
- **缺少 API 版本协商机制**: 当前硬编码 `/v1/`，未来版本升级需要考虑

---

## 5. 安全性

### 🟢 做得好的地方

- **JWT 认证**: 使用 `jose` 库，支持 HS256，有过期时间
- **全局认证中间件**: 所有 `/v1/` 路径强制认证
- **细粒度权限**: `ProjectAuthorizationService` 实现了基于角色+scope 的权限控制
- **输入验证**: Zod schema 在 service 入口处校验所有输入

### 🟡 建议改进

- **JWT 密钥管理**: `jwt-secret` 通过 options 传入是正确的，但 `legacy/backend-java` 的 `application.yml` 中有默认值 `change-me-in-dev`。需确保生产环境不会使用默认值
- **缺少 Rate Limiting**: 没有请求频率限制，`POST /v1/engine/calculate` 等计算密集型端点需要保护
- **缺少 CORS 配置**: Fastify 默认不设置 CORS，前端部署时需要
- **JWT secret 长度未校验**: HS256 要求密钥至少 256 位。`jwt.ts` 中未对 secret 长度做强制校验

### 🔴 严重问题

- **`/health` 端点在业务应用中暴露了服务名**: `service: "@saas-pricing/api"` 泄露了内部包名。生产环境应仅返回 `ok: true`

---

## 6. 测试覆盖

### 🟢 做得好的地方

- **测试总量可观**: 3056 行测试代码，覆盖 7 个测试文件
- **测试场景全面**: 
  - `app.test.ts` (548行): 基础路由、认证、分页、404
  - `bill-item.test.ts` (572行): CRUD、权限、状态校验
  - `bill-version.test.ts` (694行): 版本生命周期、copy-from、validation、submit/withdraw
  - `pricing-engine.test.ts` (516行): 计算引擎核心逻辑
  - `project-authorization.test.ts` (198行): 权限矩阵验证
  - `quota-line.test.ts` (410行): 定额行 CRUD
  - `fee-template.test.ts` (118行): 费用模板查询
- **使用 InMemory 实现**: 测试可完全在内存中运行，无外部依赖
- **测试隔离良好**: 每个测试独立创建 app 实例

### 🟡 建议改进

- **缺少错误路径测试**: 如数据库操作失败、并发冲突等场景
- **缺少集成测试**: 当前全部是单元/功能测试，没有真实数据库的集成测试
- **Legacy Java 测试**: Java 侧有 6 个测试文件（含集成测试），但 Java 代码已标记为 legacy/frozen
- **缺少性能/负载测试**: 计算引擎的 `recalculateBillVersion` 批量计算路径未做性能验证

---

## 7. 与设计文档一致性

参考 `/Users/huahaha/WorkSpace/something/新点SaaS计价/设计文档_v1.0.md` 和 `docs/architecture/` 目录：

### 🟢 做得好的地方

- **核心业务模型已落地**: 项目、阶段、专业、清单版本、清单项、定额行、价目表、费用模板
- **权限矩阵实现**: 四角色（system_admin、project_owner、cost_engineer、reviewer）+ scope 机制与设计文档对齐
- **计算引擎核心逻辑**: 单价/合价/费用率的计算链路已实现

### 🟡 建议改进

- **设计文档中列出的功能未实现**:
  - 审核流 (Review Submission)
  - 变更单 (Change Order)  
  - 现场签证 (Site Visa)
  - 进度款 (Progress Payment)
  - 报表 (Reports)
  - AI 推荐 / 知识抽取
- **`apps/ai-runtime` 目录不存在**: README 中提到 `apps/ai-runtime` 但实际目录缺失（workspace-structure 测试会检查 `apps/ai-runtime/pyproject.toml`，可能导致 CI 失败）
- **`apps/frontend` 目录不存在**: package.json workspaces 中声明了 `apps/frontend`，但目录未创建
- **缺少 review、report、audit 模块**: `apiAppDescriptor.modules` 列出了 review/report/audit，但无对应代码

---

## 8. Legacy Java 代码

Java 代码已标记为 `legacy/`，从 Review 角度仅做简要说明：

### 🟢 做得好的地方

- Spring Boot 3.3 + Java 21 技术栈选择合理
- MyBatis + JDBC 的持久层实现完整
- Flyway 迁移脚本可作为 TypeScript 版本的参考
- 全局异常处理 (`GlobalExceptionHandler`) 结构清晰

### 🟡 注意事项

- Java 代码的 `settings.gradle.kts` 引用了 `apps/backend`、`apps/worker`、`apps/mcp-gateway`，但这些路径下没有 Java 代码（已被 TypeScript 替代）。这个 gradle 配置已失效
- Java 测试中使用了 H2 内存数据库做集成测试，可作为 TypeScript 版本集成测试的参考模式

---

## 问题汇总

| 等级 | 数量 | 典型问题 |
|------|------|----------|
| 🔴 严重 | 1 | Repository fallback 实例不一致 |
| 🟡 建议 | 14 | create-app.ts 膨胀、worker/mcp-gateway 占位、数据模型不对齐、缺少 DELETE 端点等 |
| 🟢 良好 | 15+ | 架构清晰、TypeScript 严格模式、Zod 验证、测试充分等 |

---

## 优先修复建议

1. **🔴 修复 Repository fallback 实例问题**: 在 `createApp` 顶部统一初始化所有 repository，确保跨 service 共享同一实例
2. **🟡 拆分 `create-app.ts`**: 按模块拆分路由注册，降低单文件复杂度
3. **🟡 补齐缺失目录**: 创建 `apps/frontend/` 和 `apps/ai-runtime/` 的基础骨架（至少包含 package.json/pyproject.toml），否则 workspace 结构测试会失败
4. **🟡 对齐数据模型**: 将 TS Record 类型与 SQL schema 对齐，为后续接入真实数据库做准备
5. **🟡 修复 `BillWorkItemService.createWorkItem`**: 避免通过 update 操作做权限检查
