# 工程计价平台·技术开发文档

> 版本：v1.0.0 | 制定日期：2026-04-14 | 状态：草稿
>
> 本文档定义一个面向中国工程咨询行业的、云端原生+AI原生的综合工程计价平台的技术架构。文档可交由 Agent 团队直接执行开发。

---

## 一、行业背景与产品定位

### 1.1 行业现状

| 维度 | 现状 |
|------|------|
| **计价模式** | 双轨并行：定额计价（传统国标）+ 清单计价（市场化主流，GB/T 50500-2024） |
| **数据标准** | 省级各异，无统一数据库格式；交换标准 GB/T 5171-2020（XML）落地程度低 |
| **软件形态** | 广联达、新点、之星、殷雷等以 Windows 桌面端为主；云端化刚起步 |
| **AI 应用** | 行业尚处萌芽，多数产品仅有"智能组价"Demo，无真正落地的 LLM 集成 |
| **市场缺口** | 无成熟的开源/云原生方案；数据孤岛严重，互通成本高 |

### 1.2 产品定位

**目标**：做一个开源可用的、云端 SaaS 化的、AI 原生的工程计价平台，填补行业空白。

**MVP 范围**：

1. 定额库管理（读取/解析/查询/维护）
2. 清单编制（工程量清单 + 综合单价分析）
3. 定额套用与组价
4. 费用计算（规费、税金、利润）
5. AI 辅助：智能套定额、自动检错、造价分析
6. 数据互通：导入/导出 GB/T 5171 XML，兼容广联达 GCL、GCJ 格式

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                     Client Layer (Web)                   │
│            React 18 + Ant Design 5 + TypeScript           │
│          AI Chat Panel (GPT-4o / GLM-4o 调用层)          │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / WebSocket
┌────────────────────────▼────────────────────────────────┐
│                    API Gateway (Node.js)                  │
│            Express / Fastify + Zod Schema                │
│         JWT 鉴权 │ 限流 │ 日志 │ OpenAPI 3.0            │
└──────┬──────────────┬──────────────┬─────────────────────┘
       │              │              │
┌──────▼──────┐ ┌────▼────┐ ┌─────▼─────────────────────┐
│  定额库服务  │ │ 项目服务 │ │    AI 服务 (独立部署)     │
│  REST/gRPC  │ │ REST    │ │  GPT-4o / GLM-4 / DeepSeek │
└─────────────┘ └─────────┘ │  Prompt 工程 + RAG 定额知识 │
                             └──────────────────────────┘
       │              │
┌──────▼──────────────▼───────────────────────────────┐
│                  Data Layer                             │
│  PostgreSQL (主库，定额/项目/用户)                      │
│  Redis (缓存/会话/限流)                                 │
│  Meilisearch (定额全文检索)                             │
│  S3/MinIO (文件存储: XML/Excel/附件)                    │
└───────────────────────────────────────────────────────┘
```

### 2.2 技术选型理由

| 组件 | 选型 | 理由 |
|------|------|------|
| 前端框架 | React 18 + Vite | 生态成熟，TypeScript 支持好，Vite 热更新快 |
| UI 库 | Ant Design 5 | 工程行业熟悉，企业级组件完整 |
| 状态管理 | Zustand | 轻量，比 Redux 适合中台应用 |
| 后端运行时 | Node.js 22 + Fastify | 高性能，生态丰富，和 Agent 共用 Runtime |
| 数据库 | PostgreSQL 16 | 强 ACID，JSONB 兼容半结构化数据，pgvector 向量支持 |
| 全文搜索 | Meilisearch | 轻量，拼音搜索友好，定额名称检索强 |
| 文件存储 | MinIO (S3 兼容) | 自托管，兼容 S3 API，本地开发友好 |
| AI 集成 | LangChain.js / Vercel AI SDK | 支持多 Provider 切换，统一聊天界面 |
| 流程引擎 | BPMN.js | 标准流程图，可视化审批流 |
| 容器化 | Docker + Docker Compose | 一键启动，Agent 开发无需配环境 |

### 2.3 项目目录结构

```
engineering-cost-platform/
├── docker-compose.yml          # 一键启动所有服务
├── README.md
├── SPEC.md                     # 本文档（需求规格说明书）
│
├── packages/
│   ├── shared/                 # 共享类型 & 校验 schema
│   │   ├── types/              # 定额/清单/项目实体类型
│   │   └── schemas/            # Zod 输入校验 schema
│   │
│   ├── server/                 # Node.js API 服务
│   │   ├── src/
│   │   │   ├── routes/         # 路由定义
│   │   │   ├── services/      # 业务逻辑
│   │   │   ├── repositories/   # 数据访问层
│   │   │   ├── agents/         # AI Agent 定义
│   │   │   ├── parsers/        # XML/Excel 解析器
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── client/                 # React Web 前端
│       ├── src/
│       │   ├── pages/          # 页面
│       │   ├── components/     # 业务组件
│       │   ├── hooks/          # 自定义 Hooks
│       │   ├── stores/         # Zustand stores
│       │   └── App.tsx
│       └── package.json
│
├── infra/
│   ├── postgres/
│   │   └── migrations/         # Prisma/Drizzle migrations
│   ├── minio/
│   └── meilisearch/
│
└── scripts/
    ├── import-quota.ts         # 定额库初始导入脚本
    └── seed.ts                 # 测试数据填充
```

---

## 三、数据模型设计

### 3.1 核心实体关系

```
省/自治区 (Province)
  └── 城市 (City)
        └── 定额版本 (QuotaVersion) [如: 2024版北京土建定额]
              └── 定额库 (QuotaBook)
                    ├── 定额章节 (QuotaChapter) [如: 第一章 土石方工程]
                    │     └── 定额子目 (QuotaItem) [如: 1-1-1 挖土方]
                    │           ├── 工料机构成 (LaborMaterialMachinery)
                    │           │     ├── 人工 (Labor)
                    │           │     ├── 材料 (Material)
                    │           │     └── 机械 (Machinery)
                    │           └── 综合单价 (CompositeUnitPrice)
                    │
                    └── 材料价格库 (MaterialPriceLibrary)
                          └── 价格时期 (PricePeriod)

─────────────────────────────────────────────────────────

项目 (Project)
  └── 单位工程 (UnitProject)
        └── 分部工程 (DivisionProject)
              └── 清单项 (BillItem) / 定额项 (QuotaItemRef)
                    └── 综合单价分析 (PriceAnalysis)
                          └── 费用构成 (CostComponent)
                                ├── 直接费
                                ├── 间接费
                                ├── 利润
                                └── 税金
```

### 3.2 数据库 Schema（关键表）

#### 3.2.1 定额相关

```sql
-- 定额版本（如：2024版北京市建设工程定额）
CREATE TABLE quota_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    province_code CHAR(2) NOT NULL,      -- '11'
    province_name VARCHAR(20) NOT NULL,    -- '北京市'
    year INTEGER NOT NULL,                -- 2024
    name VARCHAR(100) NOT NULL,           -- '2024版北京市建设工程定额'
    effective_date DATE NOT NULL,
    UNIQUE(province_code, year)
);

-- 定额章节
CREATE TABLE quota_chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID REFERENCES quota_versions(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,            -- '1'
    name VARCHAR(100) NOT NULL,           -- '土石方工程'
    sort_order SMALLINT NOT NULL,
    UNIQUE(version_id, code)
);

-- 定额子目（核心表）
CREATE TABLE quota_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID REFERENCES quota_chapters(id) ON DELETE CASCADE,
    code VARCHAR(30) NOT NULL,            -- '1-1-1'
    name VARCHAR(200) NOT NULL,           -- '挖土方（一类土）'
    unit VARCHAR(20) NOT NULL,            -- 'm³'
    description TEXT,                      -- 工作内容说明
    labor_minutes DECIMAL(10,4),          -- 人工工日
    base_price DECIMAL(12,4),            -- 定额基价（元）
    composite_unit_price DECIMAL(12,4),   -- 综合单价
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(chapter_id, code)
);

-- 工料机构成（一个定额子目对应多条）
CREATE TABLE quota_item_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quota_item_id UUID REFERENCES quota_items(id) ON DELETE CASCADE,
    component_type SMALLINT NOT NULL,     -- 1=人工, 2=材料, 3=机械
    resource_code VARCHAR(30),            -- 对应资源编码
    resource_name VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    quantity DECIMAL(12,6) NOT NULL,     -- 消耗量
    unit_price DECIMAL(12,4),            -- 单价（元）
    price yuan DECIMAL(12,4),            -- 合价
    sort_order SMALLINT DEFAULT 0
);

-- 资源库（人材机基础数据）
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    type SMALLINT NOT NULL,              -- 1=人工, 2=材料, 3=机械
    unit VARCHAR(20) NOT NULL,
    specification VARCHAR(200),           -- 规格型号
    base_price DECIMAL(12,4),            -- 基准单价
    active BOOLEAN DEFAULT TRUE
);

-- 材料价格（按时期）
CREATE TABLE material_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID REFERENCES resources(id),
    period_code VARCHAR(20) NOT NULL,    -- '2025Q1'
    province_code CHAR(2),
    city_code CHAR(2),
    unit_price DECIMAL(12,4) NOT NULL,
    source VARCHAR(100),                  -- 数据来源
    recorded_at DATE,
    UNIQUE(resource_id, period_code, province_code)
);

-- 定额章节索引（用于全文检索）
CREATE INDEX idx_quota_items_name ON quota_items USING gin(to_tsvector('zh_optimized', name));
CREATE INDEX idx_quota_items_code ON quota_items(code);
CREATE INDEX idx_quota_items_chapter ON quota_items(chapter_id);
```

#### 3.2.2 项目清单相关

```sql
-- 项目
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50),
    province_code CHAR(2),
    city_code CHAR(2),
    quota_version_id UUID REFERENCES quota_versions(id),
    tax_model SMALLINT NOT NULL DEFAULT 1,  -- 1=一般计税法, 2=简易计税法
    total_amount DECIMAL(15,2),             -- 汇总金额
    status SMALLINT DEFAULT 0,              -- 0=草稿, 1=审核中, 2=已完成
    owner_id UUID,                          -- 所属用户
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 单位工程
CREATE TABLE unit_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    sort_order SMALLINT DEFAULT 0
);

-- 分部工程
CREATE TABLE division_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_project_id UUID REFERENCES unit_projects(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    sort_order SMALLINT DEFAULT 0
);

-- 清单项（分部分项表中的一行）
CREATE TABLE bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    division_id UUID REFERENCES division_projects(id) ON DELETE CASCADE,
    
    -- 清单信息
    item_code VARCHAR(30),                 -- 清单编码（如 010101001）
    item_name VARCHAR(200) NOT NULL,
    description TEXT,
    unit VARCHAR(20) NOT NULL,
    quantity DECIMAL(15,6) NOT NULL DEFAULT 0,
    
    -- 计价信息
    unit_price DECIMAL(15,4),             -- 综合单价
    total_price DECIMAL(15,2),            -- 合价
    
    -- 关联定额（套用定额）
    quota_item_id UUID REFERENCES quota_items(id),
    quota_item_code VARCHAR(30),
    custom_price DECIMAL(15,4),           -- 用户手动调整单价
    
    sort_order SMALLINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 综合单价分析（每条清单对应一张分析表）
CREATE TABLE price_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_item_id UUID REFERENCES bill_items(id) ON DELETE CASCADE,
    
    -- 直接费
    labor_fee DECIMAL(12,4),             -- 人工费
    material_fee DECIMAL(12,4),           -- 材料费
    machinery_fee DECIMAL(12,4),          -- 机械费
    direct_fee DECIMAL(12,4),             -- 直接费合计
    
    -- 间接费
    indirect_fee DECIMAL(12,4),          -- 间接费（管理费）
    
    -- 利润和税金
    profit DECIMAL(12,4),
    tax_rate DECIMAL(8,6),                -- 税率
    tax_amount DECIMAL(12,4),
    
    composite_unit_price DECIMAL(12,4),   -- 综合单价（=直接费+间接费+利润+税金）
    composite_total_price DECIMAL(12,4),  -- 综合合价
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 单价分析明细（人料机逐条展开）
CREATE TABLE price_analysis_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_analysis_id UUID REFERENCES price_analyses(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES resources(id),
    resource_name VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    quantity DECIMAL(12,6) NOT NULL,
    unit_price DECIMAL(12,4),
    fee DECIMAL(12,4),
    component_type SMALLINT NOT NULL,
    sort_order SMALLINT DEFAULT 0
);
```

### 3.3 数据类型约定

| 类型 | 说明 |
|------|------|
| UUID | 主键，用 `gen_random_uuid()` |
| DECIMAL(12,4) | 金额/单价，精确到分，定额数据用6位精度 |
| DECIMAL(15,6) | 工程量 |
| TIMESTAMPTZ | 所有时间戳用时区时间 |
| JSONB | 半结构化扩展字段（如前端动态表单数据） |

---

## 四、AI 原生功能设计

### 4.1 AI 功能矩阵

| 功能 | 说明 | 技术方案 |
|------|------|---------|
| **智能套定额** | 根据清单名称/描述，自动推荐最匹配的定额子目 | RAG（定额知识库）+ LLM 语义匹配 |
| **定额检错** | 检测定额子目之间的冲突/重复/异常 | LLM + 规则引擎双重校验 |
| **造价分析** | 输入项目基本信息，输出历史类似项目造价参考 | 向量检索（pgvector） |
| **智能问答** | 用户用自然语言询问定额/清单问题 | RAG 定额知识库 |
| **自动生成说明** | 为清单项自动生成项目特征描述 | LLM 生成 |
| **Excel 导入解析** | 上传 Excel，AI 识别并自动建项 | 多模态 LLM 解析 |
| **价格预测** | 基于历史价格序列，预测材料价格走势 | 时间序列模型 |

### 4.2 RAG 定额知识库架构

```
用户问题
   │
   ▼
┌──────────────────┐
│  FastEmbed 嵌入模型 │
│  (定额定额名称/描述) │
└────────┬─────────┘
         ▼
┌──────────────────┐
│   PostgreSQL      │
│   (pgvector)      │  ← 定额块 chunks (id, content, embedding, metadata)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  LangChain.js     │
│  RetrievalQA      │
└────────┬─────────┘
         ▼
┌──────────────────┐
│  GPT-4o / GLM-4  │
│  生成最终回答      │
└──────────────────┘
```

### 4.3 Prompt 工程规范（AI 工具操作友好）

所有 AI Prompt 遵循以下原则，**确保 AI Agent 能精准操控**：

```typescript
// 每个 AI 功能都定义标准 Tool Call Schema
const tools = [
  {
    name: "search_quota",
    description: "根据关键词搜索定额子目，返回匹配的定额编码、名称、单位和基价",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词（定额名称、编码或工作内容）" },
        province: { type: "string", description: "省份代码，如 '11'" },
        year: { type: "number", description: "定额版本年份，如 2024" },
        limit: { type: "number", default: 10 }
      }
    }
  },
  {
    name: "apply_quota_to_item",
    description: "为指定清单项套用定额，计算综合单价和合价",
    parameters: {
      type: "object",
      properties: {
        bill_item_id: { type: "string", format: "uuid" },
        quota_item_id: { type: "string", format: "uuid" },
        quantity: { type: "number", description: "工程量" }
      }
    }
  },
  {
    name: "check_bill_conflicts",
    description: "检测项目清单中的冲突项（如重复套定额、单价异常等）",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string", format: "uuid" }
      }
    }
  }
]
```

---

## 五、数据导入/导出（互通标准）

### 5.1 GB/T 5171 XML 交换格式支持

平台需完整支持《建设工程造价数据交换标准》GB/T 5171-2020 的 XML 格式：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ConstructionProject>
  <SystemInfo>
    <SoftWareComName>EngineeringCostPlatform</SoftWareComName>
    <SoftWareName>ECP</SoftWareName>
    <SoftWareVersion>1.0.0</SoftWareVersion>
  </SystemInfo>
  <TendererInfo>...</TendererInfo>
  <SectionalWorks>
    <SectionalWork>
      <Number>000001</Number>
      <Name>土建工程</Name>
      <UnitProjects>
        <UnitProject>
          <Number>001</Number>
          <Name>基础工程</Name>
          <BillItems>
            <BillItem>
              <ItemCode>010101001</ItemCode>
              <ItemName>挖土方</ItemName>
              <Unit>m³</Unit>
              <Quantity>5000</Quantity>
              <UnitPrice>45.50</UnitPrice>
              <TotalPrice>227500.00</TotalPrice>
            </BillItem>
          </BillItems>
        </UnitProject>
      </UnitProjects>
    </SectionalWork>
  </SectionalWorks>
</ConstructionProject>
```

解析器实现：`packages/server/src/parsers/gbt5171.parser.ts`

### 5.2 广联达 GCL/GCJ 格式兼容

广联达使用私有格式（`.gcl`/`.gcj`），通过以下方式兼容：

| 格式 | 方案 |
|------|------|
| GCL（清单） | 解析中间层 XML，转换为平台内部 BillItem |
| GCJ（定额） | 解析中间层 XML，映射到 QuotaItem |
| GSF（价格） | 解析价格库文件，导入 MaterialPrices |

优先支持 GB/T 5171 XML 互通，GCL/GCJ 作为扩展。

---

## 六、API 设计

### 6.1 认证

- JWT Bearer Token
- 刷新令牌机制
- 用户角色：Admin / Editor / Viewer

### 6.2 核心接口

#### 定额库

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/api/v1/quotas/versions` | 列出所有定额版本 |
| GET | `/api/v1/quotas/items?keyword=&chapter=&page=` | 搜索定额子目 |
| GET | `/api/v1/quotas/items/:id` | 获取定额子目详情（含工料机） |
| POST | `/api/v1/quotas/items/import` | 批量导入定额（Excel/XML） |
| GET | `/api/v1/quotas/chapters` | 获取章节树 |

#### 项目清单

| Method | Endpoint | 说明 |
|--------|----------|------|
| POST | `/api/v1/projects` | 新建项目 |
| GET | `/api/v1/projects/:id` | 获取项目（含完整清单树） |
| PUT | `/api/v1/projects/:id` | 更新项目 |
| DELETE | `/api/v1/projects/:id` | 删除项目 |
| GET | `/api/v1/projects/:id/export?format=xml` | 导出（XML/Excel） |
| POST | `/api/v1/projects/:id/import` | 导入清单 |

#### 清单操作

| Method | Endpoint | 说明 |
|--------|----------|------|
| POST | `/api/v1/projects/:id/items` | 新增清单项 |
| PUT | `/api/v1/items/:id/apply-quota` | 套定额 |
| PUT | `/api/v1/items/:id` | 更新清单项 |
| DELETE | `/api/v1/items/:id` | 删除清单项 |
| POST | `/api/v1/items/:id/price-analysis` | 生成单价分析表 |

#### AI 接口

| Method | Endpoint | 说明 |
|--------|----------|------|
| POST | `/api/v1/ai/search-quota` | 语义搜索定额 |
| POST | `/api/v1/ai/recommend-quota` | 智能推荐定额 |
| POST | `/api/v1/ai/check-conflicts` | 清单冲突检测 |
| POST | `/api/v1/ai/chat` | 定额知识问答 |
| POST | `/api/v1/ai/estimate-cost` | 项目造价估算 |

### 6.3 API 响应格式

统一包装：

```typescript
// 成功
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "total": 100 }
}

// 错误
{
  "success": false,
  "error": {
    "code": "QUOTA_NOT_FOUND",
    "message": "定额子目不存在",
    "details": { "id": "xxx" }
  }
}
```

---

## 七、AI Agent 工具规范（原生适配）

### 7.1 平台内 AI Agent 定义

为了让 AI Agent（Claude Code / OpenClaw / Codex）能精准操控本平台，提供一套标准化的 MCP 工具：

```json
{
  "mcpServers": {
    "ecp_quota": {
      "command": "python3",
      "args": ["-m", "ecp_tools.quota"],
      "env": { "ECP_API_KEY": "${ECP_API_KEY}" }
    },
    "ecp_project": {
      "command": "python3",
      "args": ["-m", "ecp_tools.project"],
      "env": { "ECP_API_KEY": "${ECP_API_KEY}" }
    }
  }
}
```

### 7.2 工具清单

| 工具名 | 功能 |
|--------|------|
| `ecp_quota.search` | 搜索定额 |
| `ecp_quota.get_item` | 获取定额详情 |
| `ecp_project.create` | 创建项目 |
| `ecp_project.list` | 列出项目 |
| `ecp_project.get_bill` | 获取项目清单 |
| `ecp_bill.apply_quota` | 套定额 |
| `ecp_bill.update_item` | 更新清单项 |
| `ecp_ai.chat` | AI 问答 |

### 7.3 AI Skill 定义

在 `.claude/skills/` 或 `skills/` 中定义：

```yaml
# skills/engineering-cost/SKILL.md
---
name: engineering-cost
description: 工程计价助手 — 定额查询、清单编制、造价分析
paths:
  - "**/*.gcl"
  - "**/*.gcj"
  - "**/quota-import/**"
  - "**/bill-items/**"
---

# 激活条件
当工作目录或操作文件匹配上述路径时，此 skill 自动激活。

## 可用工具
- `ecp_quota.search` — 定额子目语义搜索
- `ecp_project.get_bill` — 读取项目清单
- `ecp_bill.apply_quota` — 为清单项套定额

## 使用示例
1. 用户说"帮我找一个挖土方的定额" → `ecp_quota.search("挖土方")`
2. 用户上传 GCL 文件 → 解析后批量导入
3. 用户说"给这个清单项套1-1-1定额" → `ecp_bill.apply_quota()`
```

---

## 八、开发规范

### 8.1 代码规范

| 规范 | 工具 |
|------|------|
| TypeScript 严格模式 | `strict: true` |
| ESLint + Prettier | `eslint-config-next` + `prettier` |
| 提交规范 | Conventional Commits（feat/fix/docs） |
| 分支策略 | Gitflow（main / develop / feature/xxx） |

### 8.2 环境管理

```bash
# 开发依赖
node >= 22.0.0
pnpm >= 9.0.0
Docker >= 24.0
Docker Compose >= 2.20
```

### 8.3 启动方式

```bash
# 一键启动所有服务
docker-compose up -d

# 开发模式（热重载）
cd packages/server && pnpm dev
cd packages/client && pnpm dev

# 初始化定额库
pnpm run import-quota --file ./data/2024北京定额.xlsx
```

---

## 九、MVP 开发阶段划分

### Phase 1：基础设施（第 1-2 周）
- [ ] 项目脚手架（Monorepo pnpm workspace）
- [ ] Docker Compose 部署（PostgreSQL + Redis + MinIO + Meilisearch）
- [ ] 数据库 Migration（Prisma Schema）
- [ ] 统一 API 框架（Fastify + Zod）
- [ ] 认证体系（JWT）
- [ ] 基础定额数据结构

### Phase 2：定额核心（第 3-4 周）
- [ ] 定额库 CRUD + 章节树
- [ ] 定额子目详情（含工料机展开）
- [ ] Meilisearch 全文检索
- [ ] Excel 批量导入（定额）
- [ ] 基础定价逻辑（直接费计算）

### Phase 3：清单与项目（第 5-7 周）
- [ ] 项目管理（CRUD）
- [ ] 清单编制（分部分项树）
- [ ] 定额套用（综合单价分析）
- [ ] 费用计算（规费、间接费、利润、税金）
- [ ] XML 导入/导出（GB/T 5171）

### Phase 4：AI 原生（第 8-10 周）
- [ ] LLM 集成层（多 Provider）
- [ ] 定额知识库 RAG（pgvector）
- [ ] 智能套定额推荐
- [ ] 清单冲突检测
- [ ] AI 问答助手

### Phase 5：完善与发布（第 11-12 周）
- [ ] 前端 UI 优化
- [ ] 性能优化（索引、缓存）
- [ ] 集成测试 + E2E 测试
- [ ] 部署文档
- [ ] 用户使用文档

---

## 十、参考标准

| 标准编号 | 名称 |
|---------|------|
| GB/T 50500-2024 | 建设工程工程量清单计价规范 |
| GB/T 50854-2024 | 房屋建筑与装饰工程工程量计算标准 |
| GB/T 5171-2020 | 建设工程造价数据交换标准 |
| DB46-030-2026 | 海南省建设工程造价电子数据标准 |

---

## 附录 A：名词对照

| 术语 | 说明 |
|------|------|
| 定额 | 政府或行业发布的消耗量标准，含人工、材料、机械台班消耗量 |
| 定额子目 | 定额中的一具体项目，如"1-1-1 挖土方" |
| 工料机 | 人工、材料、机械的统称 |
| 综合单价 | 完成一个清单项目所需的人工费、材料费、机械费、管理费、利润、税金之和 |
| 规费 | 按规定必须缴纳的费用（社保、公积金等） |
| 清单 | 工程量清单 Bill of Quantities |
| 计税模式 | 一般计税法（9%/13%） vs 简易计税法（3%） |
| GCJ/GCL | 广联达计价软件项目文件格式 |

---

## 附录 B：开源参考

| 项目 | 用途 |
|------|------|
| https://github.com/guangNlabel/... | 广联达格式逆向参考（社区维护） |
| https://github.com/bimdata/... | BIM 数据交换参考 |
| LangChain.js | LLM 应用框架 |
| Fastify | Node.js 高性能 API 框架 |
| Vercel AI SDK | AI 对话 UI 框架 |
| FlyElephant/eCost | （如有开源参考） |
