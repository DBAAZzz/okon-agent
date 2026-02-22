# okon-agent

> 一个基于大语言模型的多 Agent 平台，支持知识库检索增强（RAG）、多渠道接入与工具调用。

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [功能特性](#功能特性)
- [架构设计](#架构设计)
- [环境变量](#环境变量)
- [开发指南](#开发指南)

---

## 项目简介

核心能力包括：

- **多 Bot 管理**：可创建多个 Bot，每个 Bot 独立配置模型、系统提示词与知识库
- **RAG 知识检索**：支持 PDF、DOCX、TXT、Markdown 文档入库，混合向量检索（稠密 + 稀疏）提升召回质量
- **多 Agent 协作**：主 Agent 可调度 `research`（联网搜索）、`planner`（任务拆解）等子 Agent
- **多渠道接入**：抽象 Channel 层，内置飞书（Lark）集成，可扩展其他 IM 平台
- **工具调用**：内置天气、IP 查询、网页搜索、网页抓取等工具，支持 MCP 扩展

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | [Fastify](https://fastify.dev/) + [tRPC](https://trpc.io/) |
| 前端框架 | [Next.js 15](https://nextjs.org/) + [shadcn/ui](https://ui.shadcn.com/) |
| AI SDK | [Vercel AI SDK](https://sdk.vercel.ai/) |
| LLM 提供商 | DeepSeek、OpenAI、Ollama |
| 向量数据库 | [Qdrant](https://qdrant.tech/) |
| 关系数据库 | PostgreSQL（via [Prisma](https://www.prisma.io/)） |
| 网页搜索 | [Tavily](https://tavily.com/) |
| 飞书集成 | [@larksuiteoapi/node-sdk](https://github.com/larksuite/node-sdk) |
| 包管理 | pnpm（Monorepo） |

---

## 项目结构

```
okon-agent/
├── apps/
│   ├── agent/          # 后端服务（Fastify + tRPC）
│   │   ├── src/
│   │   │   ├── agents/         # Agent 实现（主 Agent、子 Agent）
│   │   │   ├── channels/       # 渠道接入层（飞书等）
│   │   │   ├── knowledge/      # RAG 文档处理与检索
│   │   │   ├── memory/         # 会话记忆管理
│   │   │   ├── routers/        # tRPC 路由
│   │   │   └── tools/          # 工具定义（搜索、天气等）
│   │   └── prisma/             # 数据库 Schema 与迁移
│   └── web/            # 前端应用（Next.js）
├── packages/
│   ├── shared/         # 公共类型、日志工具
│   └── ui/             # 共享 React 组件
├── docs/               # 设计文档
├── .env.example        # 环境变量模板
└── pnpm-workspace.yaml
```

---

## 快速开始

### 前置依赖

- Node.js >= 20
- pnpm >= 8
- PostgreSQL
- Qdrant（可用 Docker 启动）

### 1. 克隆仓库

```bash
git clone https://github.com/your-org/okon-agent.git
cd okon-agent
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入必要的 API Key 和数据库连接信息
```

### 4. 启动 Qdrant（Docker）

```bash
docker run -p 6333:6333 qdrant/qdrant
```

### 5. 初始化数据库

```bash
pnpm db:migrate
```

### 6. 启动开发服务

```bash
pnpm dev
```

- 前端：http://localhost:3000
- 后端：http://localhost:3001

---

## 功能特性

### Bot 管理

- 创建多个 Bot，独立配置模型（DeepSeek / OpenAI / Ollama）、API Key 与系统提示词
- 每个 Bot 可绑定一个或多个知识库

### 知识库与 RAG

- 支持上传 PDF、DOCX、TXT、Markdown 文件
- 文档自动分块、向量化（OpenAI `text-embedding-3-small`）
- 混合检索：稠密向量 + BM25 稀疏向量，提升中英文召回质量
- 检索结果自动注入系统提示词

### 会话与记忆

- 多会话管理，历史消息持久化
- 上下文长度自动裁剪，保证 Token 预算
- 基于相关性的记忆召回（规划中）

### 多 Agent 协作

```
用户输入
  └── 主 Agent（ToolLoopAgent）
        ├── research 子 Agent（联网搜索 + 网页抓取）
        └── planner 子 Agent（复杂任务拆解）
```

### 工具调用

| 工具 | 说明 |
|------|------|
| `webSearch` | 通过 Tavily 联网搜索 |
| `webFetch` | 抓取并解析网页内容 |
| `weather` | 查询天气信息 |
| `ipLookup` | IP 地理位置查询 |

支持通过 MCP（Model Context Protocol）扩展自定义工具。

### 渠道接入

- 内置飞书（Lark）集成：监听消息事件、自动回复
- 抽象 Channel 层，可扩展 Slack、企业微信等平台

---

## 架构设计

详细设计文档见 [docs/](docs/) 目录：

| 文档 | 内容 |
|------|------|
| [01-Agent 与 Tool Calling](docs/01-Agent%20与%20Tool%20Calling.md) | Agent 与工具调用基础 |
| [02-ToolLoopAgent](docs/02-ToolLoopAgent.md) | 主 Agent 架构实现 |
| [03-稀疏向量和稠密向量](docs/03-稀疏向量和稠密向量.md) | 混合检索原理 |
| [05-记忆召回设计](docs/05-记忆召回设计.md) | 记忆系统设计 |
| [06-网页搜索设计](docs/06-网页搜索设计.md) | Research 子 Agent 设计 |
| [07-多Agent设计](docs/07-多Agent设计.md) | 多 Agent 协作架构 |
| [08-Channel设计](docs/08-Channel设计.md) | 多渠道接入框架 |
| [09-RAG设计](docs/09-RAG设计.md) | RAG 全流程设计 |

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串 |
| `QDRANT_URL` | ✅ | Qdrant 服务地址 |
| `OPENAI_API_KEY` | ✅ | 用于文本向量化（embedding） |
| `OPENAI_BASE_URL` | ❌ | 自定义 OpenAI 兼容接口地址 |
| `TAVILY_API_KEY` | ❌ | 联网搜索功能（webSearch 工具） |
| `BRAVE_API_KEY` | ❌ | 备用搜索提供商 |

Bot 级别的 LLM API Key 在前端界面的 Bot 设置中配置，不需要在 `.env` 中设置。

---

## 开发指南

### 常用命令

```bash
# 启动全部服务
pnpm dev

# 仅启动后端
pnpm dev:agent

# 仅启动前端
pnpm dev:web

# 数据库迁移
pnpm db:migrate

# 打开 Prisma Studio（数据库可视化）
pnpm db:studio

# 全量构建
pnpm build

# 类型检查
pnpm typecheck
```

### 添加新工具

1. 在 `apps/agent/src/tools/` 下新建工具文件
2. 实现 `tool()` 定义（基于 Vercel AI SDK）
3. 在主 Agent 的工具列表中注册

### 添加新渠道

1. 在 `apps/agent/src/channels/` 下实现 Channel 适配器
2. 继承 Channel 抽象接口，实现消息收发逻辑
3. 在渠道配置中注册

---

## License

MIT
