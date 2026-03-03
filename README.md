# okon-agent

> 基于 Vercel AI SDK 的多 Bot Agent 平台，提供 Web 聊天、知识库 RAG、飞书接入、定时任务和文件化长期记忆能力。

## 项目概览

当前代码实现包含以下能力：

- 多 Bot 管理：创建/删除 Bot，按 Bot 配置模型、Provider、API Key、Base URL、System Prompt
- 会话工作区：Bot 维度会话列表、流式对话、会话历史持久化
- RAG 知识库：支持 `pdf/docx/txt/md` 上传、分块、去重、向量化、混合检索（dense+sparse）
- 长期记忆：按 Bot 存储在文件系统，自动提取/更新/过期清理并注入提示词
- 上下文压缩：超阈值自动 compact 历史消息，并在前端可查看摘要和原始压缩区间
- Token 用量统计：按 session 聚合与分页明细查询
- 子 Agent 协作：内置 `research`（搜索+抓取）和 `planner`（任务拆解）
- 定时任务：支持 `cron` / `every` / `delay` / `at`，可触发 agent-turn 或外部通道发送
- Channel 接入：已落地 Feishu 适配器（WebSocket 收消息、支持流式回复卡片）

## 技术栈

| 层 | 技术 |
| --- | --- |
| Monorepo | pnpm workspace |
| 后端 | Fastify 5 + tRPC 11 + Prisma 7 |
| 前端 | Next.js 15 + React 18 + Tailwind + shadcn/ui |
| AI/Agent | Vercel AI SDK (`ToolLoopAgent`) |
| 向量检索 | Qdrant + OpenAI Embeddings + BM25 sparse |
| 数据库 | PostgreSQL |
| 渠道 | 飞书（`@larksuiteoapi/node-sdk`） |

## 仓库结构（当前）

```text
okon-agent/
├── apps/
│   ├── agent/                  # Fastify + tRPC + Agent 编排
│   │   ├── src/agent/          # gateway / session / subagent / prompt / compaction
│   │   ├── src/capabilities/   # knowledge / memory / embeddings / scheduler
│   │   ├── src/channel/        # channel manager + feishu adapter
│   │   ├── src/routes/         # /api/chat /api/knowledge-base/:kbId/upload /health
│   │   ├── src/tools/          # bash/read/write/edit/web/scheduler tools
│   │   └── prisma/             # schema 与 migrations
│   └── web/                    # Next.js 前端（Bot、Session、知识库管理）
├── packages/
│   ├── shared/                 # 公共类型与日志
│   └── ui/                     # 共享 UI 组件
├── docs/                       # 方案与设计文档
└── .env.example
```

## 快速开始

### 1. 前置依赖

- Node.js >= 20
- pnpm >= 8
- PostgreSQL
- Qdrant（可本地 Docker 启动）

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

创建 `apps/agent/.env`（可参考根目录 `.env.example`）：

```env
DATABASE_URL=postgresql://user:password@localhost:5432/okon-agent?schema=public
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=
TAVILY_API_KEY=
BRAVE_API_KEY=
```

可选创建 `apps/web/.env.local`：

```env
AGENT_BASE_URL=http://localhost:3001
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
```

### 4. 启动基础服务

```bash
docker run -p 6333:6333 qdrant/qdrant
```

并确保 PostgreSQL 可用。

### 5. 初始化数据库

```bash
pnpm --filter @okon/agent db:migrate
pnpm --filter @okon/agent db:generate
```

### 6. 启动开发环境

```bash
pnpm dev
```

- Web: `http://localhost:3000`
- Agent API: `http://localhost:3001`

## 主要页面

- `/`：Bot Workspace（选择 Bot 进入会话）
- `/chat/[botId]`：Session 工作区（左侧会话列表 + 右侧聊天）
- `/bots`：Bot 列表与创建
- `/bots/[botId]/edit`：Bot 编辑台（飞书绑定、知识库绑定）
- `/knowledge-bases`：知识库管理（文件上传、手动文档、检索测试）
- `/embeddings`：向量检索调试页面

## 接口概览

### HTTP Routes（Agent）

- `GET /health`
- `POST /api/chat`（UI Message Stream）
- `GET /api/chat/stream`（SSE，兼容旧流式接口）
- `GET /api/chat/continue`（审批后继续）
- `POST /api/knowledge-base/:kbId/upload`

### tRPC Router（`/trpc`）

已实现路由组：

- `bot`
- `session`
- `chat`
- `knowledgeBase`
- `embeddings`
- `tokenUsage`
- `compaction`
- `channel`
- `approval`

## Agent 工具（当前默认挂载）

- `bash`：执行 shell 命令（限制在 workspace 内）
- `read`：文件读取（带行号、分页）
- `write`：文件写入（原子写）
- `edit`：基于 `oldString/newString` 的精确替换
- `scheduleTask` / `listTasks` / `cancelTask`：定时任务管理
- `research`：研究子代理（`webSearchTool + webFetchTool`）
- `planner`：规划子代理（结构化步骤拆解）

> `webSearchTool`、`webFetchTool` 作为 `research` 子代理工具使用，不直接挂在主代理工具列表。

## 环境变量说明（按代码）

### Agent（`apps/agent`）

| 变量 | 必填 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | Prisma 连接 PostgreSQL |
| `QDRANT_URL` | 建议 | Qdrant 地址，默认 `http://localhost:6333` |
| `OPENAI_API_KEY` | 建议 | Embeddings（知识库向量化） |
| `OPENAI_BASE_URL` | 否 | OpenAI 兼容 embedding 网关 |
| `OPENAI_API_BASEURL` | 否 | 兼容旧别名 |
| `TAVILY_API_KEY` | 否 | `research` 子代理联网搜索 |
| `BRAVE_API_KEY` | 否 | 预留搜索 provider（当前未在 tool schema 暴露） |
| `PORT` | 否 | Agent 端口，默认 `3001` |
| `HOST` | 否 | Agent 监听地址，默认 `0.0.0.0` |
| `MEMORY_DIR` | 否 | 长期记忆文件目录 |
| `SCHEDULER_DIR` | 否 | 定时任务持久化目录 |

### Web（`apps/web`）

| 变量 | 必填 | 用途 |
| --- | --- | --- |
| `AGENT_BASE_URL` | 否 | Next Server 代理到 Agent 的上游地址 |
| `NEXT_PUBLIC_APP_BASE_URL` | 否 | 前端应用基础地址 |

## 常用命令

```bash
# 启动全项目
pnpm dev

# 单独启动后端/前端
pnpm dev:agent
pnpm dev:web

# 构建与类型检查
pnpm build
pnpm typecheck

# 数据库（agent 包内）
pnpm --filter @okon/agent db:migrate
pnpm --filter @okon/agent db:deploy
pnpm --filter @okon/agent db:push
pnpm --filter @okon/agent db:studio
```

## 现状说明

- Tool 审批链路已实现（前后端均支持），但默认挂载工具中未显式启用 `needsApproval`。
- Channel 平台目前仅实现 Feishu 适配器。

## License

MIT
