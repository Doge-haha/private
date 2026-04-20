# 新点 SaaS 造价系统 — 代码 Review 报告

> **项目**: saas-pricing-platform  
> **审查范围**: `apps/backend/` 全部 Java 源码、Gradle 构建文件、数据库迁移脚本、测试代码  
> **审查日期**: 2026-04-17  
> **对比文档**: 设计文档_v1.0.md

---

## 一、总体评价

项目整体质量**较高**，架构清晰、分层合理、权限模型设计精细。以下按严重程度分级列出具体发现。

---

## 二、🔴 严重问题（必须修复）

### 2.1 SecurityConfig 完全放开认证

```java
// SecurityConfig.java
.authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
```

**问题**: 所有接口完全放开，`X-User-Id` Header 可由客户端任意伪造。设计文档明确要求 JWT 鉴权，但当前实现是纯 Header 透传。  
**风险**: 任何人可冒充任何用户操作任何项目数据。  
**建议**: 实现 JWT Filter 或至少在网关层做身份校验，`SecurityConfig` 应拒绝未认证请求。

### 2.2 JWT 配置未使用

```yaml
app:
  security:
    jwt-secret: ${JWT_SECRET:change-me-in-dev}
```

`application.yml` 中声明了 JWT 配置，但代码中**完全没有 JWT 验证逻辑**。`HeaderCurrentUserProvider` 直接读 `X-User-Id` Header，生产环境不可接受。

### 2.3 成员管理使用全量替换策略

```java
// JdbcProjectMemberRepository.replaceProjectMembers()
// 先删所有 scope → 删所有 member → 逐条插入
```

**问题**: 
- 无事务注解 `@Transactional`，中间失败会导致数据丢失
- 并发场景下先删后插会产生短暂的数据空洞
- 设计文档要求的"成员邀请"流程未实现（直接全量写入，无审批）

### 2.4 BillVersionServiceImpl.copyFromVersion 缺少事务

`copyBillItemsAndWorkItems` 方法逐条插入大量数据，没有 `@Transactional`。中途失败会导致部分复制，数据不一致。

### 2.5 nextVersionNo 并发不安全

```java
// JdbcBillVersionRepository
Integer max = jdbcTemplate.queryForObject(
    "select coalesce(max(version_no), 0) from bill_version where project_id = ? and stage_code = ?",
    ...
);
return (max == null ? 0 : max) + 1;
```

两个并发请求可能读到相同的 max 值，产生相同的 version_no。虽然有唯一索引会报错，但错误处理不友好。应使用 `SELECT ... FOR UPDATE` 或数据库序列。

---

## 三、🟡 建议改进

### 3.1 Record 用作多层 DTO 导致字段膨胀

`BillItemResponse` 有 29 个字段，同时充当 Entity + Response DTO。建议：
- 分离 `BillItemEntity`（内部持久化）和 `BillItemResponse`（API 输出）
- `CreateBillItemRequest` 到 `BillItemResponse` 的手动映射极易出错（构造函数 29 参数）

### 3.2 缺少分页支持

所有列表接口（`listBillItems`, `listBillVersions`, `getMembers` 等）均无分页。设计文档提到"清单项可能有成百上千条"，大量数据会一次性加载到内存。

### 3.3 `UpdateBillItemRequest` 缺少 `@Valid`

```java
// BillItemController.updateBillItem()
public BillItemResponse updateBillItem(..., @RequestBody UpdateBillItemRequest request)
```

注意 `createBillItem` 有 `@Valid`，但 `updateBillItem` 没有。`updateWorkItem` 同样缺少 `@Valid`。

### 3.4 N+1 查询问题

```java
// JdbcProjectMemberRepository.mapMember()
// 每个成员都执行一次 scope 查询
List<ProjectMemberResponse.RoleScopeResponse> scopes = jdbcTemplate.query(...)
```

`findByProjectId` 返回 N 个成员时，会产生 N+1 次查询。应批量查询 scope 后在内存中分组。

### 3.5 GlobalExceptionHandler 未覆盖通用异常

缺少 `@ExceptionHandler(Exception.class)` 的兜底处理。未预期的异常会直接暴露 Spring 默认错误页面或堆栈信息。

### 3.6 `toResponse` 方法实现低效

```java
// BillVersionServiceImpl.toResponse()
// 先查出整个项目的所有版本列表，再从中 filter 当前版本
return billVersionRepository.findByProjectId(...).stream()
    .filter(item -> item.id().equals(context.id()))
    .findFirst()...
```

应该直接用 `findById` 或构造 Response 对象，而不是查列表再过滤。

### 3.7 硬编码的权限角色

```java
private boolean isPrivilegedMember(ProjectMemberResponse member) {
    return List.of("project_owner", "system_admin").contains(member.platformRole());
}
```

角色列表硬编码在 Java 代码中。建议提取为配置或枚举，便于扩展。

### 3.8 Flyway migration 缺少回滚脚本

3 个 migration 文件均无对应的 undo migration。生产环境需要回滚时无计可施。

### 3.9 设计文档提到的功能未实现

对照设计文档，以下功能在代码中缺失：
- **AI 赋能模块** — 设计文档核心卖点，代码中完全无 AI 相关实现
- **审批/审核流程** — 设计文档描述的多级审批，当前只有简单的 submit/withdraw
- **定额库查询** — `StandardSetRepository` 只有 `findAll`，无搜索/分页
- **数据导入导出** — 设计文档提到 Excel 导入导出，代码中无
- **操作日志/Audit Trail** — 设计文档要求，代码中无

### 3.10 测试数据构建代码重复

3 个测试类中 `createProject()`, `enableBuildingDiscipline()`, `replaceMembers()`, `bindCurrentUser()` 完全重复。应提取为共享 `TestFixture` 基类或 `@TestConfiguration`。

---

## 四、🟢 做得好的地方

### 4.1 架构分层清晰

```
controller → service (interface + impl) → repository (interface + jdbc impl)
```

接口与实现分离，便于替换和测试。没有跨层调用。

### 4.2 权限模型设计优秀

`ProjectPermissionGuard` → `ProjectMemberPermissionGuard` → `ProjectScopedAuthorizationService` 三层权限架构：
- 项目级（view/edit）
- 阶段/专业级（scope 约束）
- 业务身份级（consultant/reviewer）

权限粒度精细，支持"造价工程师只能操作自己负责的阶段和专业"，完全契合设计文档的业务场景。

### 4.3 测试覆盖质量高

5 个测试类覆盖了核心场景：
- 权限守卫单元测试（阶段/专业/身份/编辑分离）
- 组合授权测试
- 清单项 CRUD + 跨版本父子校验
- 清单版本完整生命周期

测试不是走过场，真正验证了业务规则（如 reviewer 不能 edit、scope 外的操作被拒绝）。

### 4.4 统一异常处理

`GlobalExceptionHandler` + 自定义异常体系（`NotFoundException`, `ValidationException`, `ResourceLockedException`）设计规范，错误响应结构统一。

### 4.5 数据库设计合理

- UUID 主键（分布式友好）
- 唯一索引（project_code, stage_code + version_no）
- Flyway 版本化迁移
- 清单版本溯源链设计（source_version_id）

### 4.6 Java Record 使用得当

DTO 全部使用 `record`，天然不可变，减少样板代码。

### 4.7 Gradle 多模块结构

```
apps/backend    — 主服务
apps/worker     — 异步任务（预留）
apps/mcp-gateway — AI 网关（预留）
```

前瞻性设计，为后续扩展留了空间。

---

## 五、统计摘要

| 级别 | 数量 | 关键项 |
|------|------|--------|
| 🔴 严重 | 5 | 认证缺失、事务缺失、并发安全 |
| 🟡 建议 | 10 | DTO 分离、分页、N+1、代码重复 |
| 🟢 优秀 | 7 | 架构、权限、测试、异常处理 |

---

## 六、优先修复建议

1. **立即**: 添加 `@Transactional` 到所有 replace/copy 操作
2. **立即**: 实现 JWT 认证或至少在网关层做 Header 校验
3. **短期**: 修复 `nextVersionNo` 并发问题
4. **短期**: 提取测试公共代码，减少维护成本
5. **中期**: DTO 分层、添加分页、修复 N+1 查询
6. **长期**: 实现设计文档中的 AI 模块和审批流程
