# Web Next.js 实现优化清单与落地方案

## 1. 背景与目标

当前 `apps/web` 已完成核心业务闭环（Bot 管理、会话、知识库、审批流），但从 Next.js App Router 最佳实践看，仍存在几个结构性问题：

- 客户端硬编码后端地址，环境迁移成本高。
- 页面层 `use client` 覆盖面过大，首屏渲染和 bundle 体积不优。
- 缺少路由级 `loading.tsx / error.tsx / not-found.tsx` 边界。
- 数据获取策略偏“客户端拉取”，未充分利用 Server Components。
- 类型收敛不足（`as any`/`unknown as`），长期维护风险上升。

本方案目标：

1. 建立稳定可部署的 Web 到 Agent 通信层（同源优先）。
2. 优化 App Router 分层，减少不必要的客户端渲染。
3. 完善错误/加载/404 处理，提高可恢复性。
4. 保持现有交互能力不回退（尤其聊天流式、Markdown 渲染、审批流）。
5. 提供可分阶段落地的任务清单与验收标准。

## 2. 当前问题清单（按优先级）

## P1（必须优先）

### P1-1 硬编码后端地址（部署风险高）

- `apps/web/src/lib/trpc.ts:7` -> `http://localhost:3001/trpc`
- `apps/web/src/components/ChatInterface.tsx:121` -> `http://localhost:3001/api/chat`
- `apps/web/src/hooks/useSSEStream.ts:108,115` -> `http://localhost:3001/api/chat/*`
- `apps/web/src/app/knowledge-bases/page.tsx:93,269` -> `http://localhost:3001/api/knowledge-base/*`

问题：

- 生产/测试/本地环境切换需要改代码。
- 浏览器跨域复杂，影响 Cookie、鉴权和观测链路。
- 运维侧不易统一入口策略（WAF、网关、日志）。

### P1-2 Session 数据“全量拉取 + 前端过滤”

- `apps/web/src/hooks/useSessions.ts:14` 拉全量 `session.list`
- `apps/web/src/hooks/useSessions.ts:27` 再按 `botId` 过滤

问题：

- 数据量增长后性能和带宽成本上升。
- 下发超出当前页面所需的数据，存在数据最小化不足。

### P1-3 路由参数和 404 边界未在页面层收敛

- `apps/web/src/app/chat/[botId]/page.tsx:12`
- `apps/web/src/app/bots/[botId]/edit/page.tsx:12`

问题：

- `botId` 非法值未在服务端页面层快速拒绝。
- “Bot 不存在”逻辑散落在客户端组件，路由语义不完整。

## P2（应在 P1 后尽快处理）

### P2-1 缺少 App Router 约定文件

当前 `apps/web/src/app` 下无：

- `loading.tsx`
- `error.tsx`
- `not-found.tsx`

问题：

- 路由级加载、异常、404 行为不统一。
- 用户看到的状态反馈和恢复路径不稳定。

### P2-2 页面层客户端化过重，首屏数据依赖 useEffect

- `apps/web/src/app/page.tsx:1`
- `apps/web/src/app/bots/page.tsx:1`
- `apps/web/src/app/knowledge-bases/page.tsx:1`
- `apps/web/src/hooks/useBots.ts:24`

问题：

- 首屏需要等待客户端 JS 执行后再请求数据。
- 首屏空白/闪烁风险更高，SEO 与可观测性劣化。

### P2-3 Metadata 基础字段偏少

- `apps/web/src/app/layout.tsx:5-8`

问题：

- 缺少 `openGraph`、`twitter`、`canonical` 等元信息。
- 分享和页面识别能力不足。

## P3（技术债治理）

### P3-1 tRPC 调用存在 `any/unknown as` 扩散

- `apps/web/src/app/bots/page.tsx:75,116`
- `apps/web/src/app/knowledge-bases/page.tsx:115`
- `apps/web/src/components/BotEditorWorkspace.tsx:93,94`

问题：

- 字段漂移时缺乏编译期保护。
- 重构成本高，线上回归风险大。

## 3. 详细优化方案

## 3.1 通信层收敛（同源优先）

目标：Web 前端只访问同源路径，不直接硬编码 Agent 地址。

方案：

1. 新增环境变量：
   - `AGENT_BASE_URL`（服务端使用）
   - `NEXT_PUBLIC_APP_BASE_URL`（仅在必须时用于客户端绝对路径拼装）
2. 通过 Next Route Handlers 做 BFF 代理：
   - `/app/api/trpc/[trpc]/route.ts` 代理 Agent tRPC
   - `/app/api/chat/route.ts`、`/app/api/knowledge-base/...` 代理业务接口
3. `trpc.ts` 改为同源 `/api/trpc`。
4. `ChatInterface`/`useSSEStream`/`knowledge-bases` 改为同源 `/api/*`。

收益：

- 去除跨域耦合，部署更稳。
- 网关策略、鉴权、监控统一在 Next 入口。

## 3.2 Session 查询下推到服务端过滤

目标：按需查询，不拉全量。

方案：

1. 在 Agent 端新增（或改造）`session.list` 支持 `botId?: number` 入参。
2. `useSessions` 调用改为 `session.list.query({ botId })`。
3. 删除前端 `filter(s => s.bot?.id === botId)` 的兜底逻辑。

收益：

- 减少无效数据传输。
- 性能和隐私边界更清晰。

## 3.3 路由参数与 404 归位到页面层

目标：页面层决定是否可达，客户端只负责交互。

方案：

1. 在 `chat/[botId]/page.tsx` 和 `bots/[botId]/edit/page.tsx`：
   - 验证 `botId` 是否为正整数。
   - 非法值直接 `notFound()`。
2. 对于合法但不存在的 Bot：
   - 优先在 Server Component 校验后 `notFound()`。
   - 客户端组件保留兜底显示（防止竞态删除）。

收益：

- URL 语义明确，边界统一。
- 降低客户端判断复杂度。

## 3.4 补齐 App Router 边界文件

目标：统一异常与加载体验。

方案：

1. 根层新增：
   - `apps/web/src/app/loading.tsx`
   - `apps/web/src/app/error.tsx`
   - `apps/web/src/app/not-found.tsx`
2. 业务重路由按需增加局部边界（如 `chat/[botId]`）。
3. `error.tsx` 提供 `reset()` 重试入口。

收益：

- 发生错误时用户可恢复。
- 状态表现一致，减少“白屏”和“静默失败”。

## 3.5 Server/Client 分层重构

目标：默认 Server，交互点才用 Client。

方案：

1. `app/page.tsx`、`bots/page.tsx`、`knowledge-bases/page.tsx` 拆分为：
   - Server Page：拉首屏数据并传入 props。
   - Client Island：处理输入、对话框、按钮交互。
2. 保留必须客户端组件：
   - `ChatInterface`（流式聊天、输入、审批）
   - `MessageList`（Markdown 实时渲染）
3. 将“初始化请求”尽可能从 `useEffect` 迁移到服务端预取。

收益：

- 首屏更快，JS 包体更小。
- 更符合 Next.js App Router 推荐模式。

## 3.6 Metadata 完整化

目标：完善页面识别和分享信息。

方案：

1. 在 `layout.tsx` 补充：
   - `metadataBase`
   - `openGraph`
   - `twitter`
   - `alternates.canonical`
2. 对 `chat/[botId]`、`bots/[botId]/edit` 等动态路由补充 `generateMetadata`（按需）。

收益：

- 页面元信息完整，便于外部系统识别和展示。

## 3.7 类型安全收敛

目标：把运行时错误前移到编译期。

方案：

1. 清理 `as any` 和 `unknown as`，直接使用 `AppRouter` 推导类型。
2. 封装通用 API 调用层（可选）：
   - `lib/api/bot.ts`
   - `lib/api/knowledge-base.ts`
3. 为关键 mutation/query 增加输入输出类型别名。

收益：

- 重构更稳，回归风险可控。

## 4. 分阶段实施计划

## 阶段 A（1-2 天，先解风险）

范围：

- P1-1 通信层收敛（同源）
- P1-2 Session 按 botId 查询
- P1-3 路由层 notFound 校验

交付物：

- 移除前端硬编码 `localhost:3001`
- `session.list({ botId })` 可用
- 两个动态路由具备参数与 404 处理

## 阶段 B（1-2 天，提升框架一致性）

范围：

- P2-1 loading/error/not-found
- P2-2 页面分层（Server + Client）

交付物：

- 根层与关键业务路由边界文件就位
- 首页/Bot/知识库首屏数据改为服务端预取（至少完成首页）

## 阶段 C（0.5-1 天，治理与完善）

范围：

- P2-3 metadata 完整化
- P3-1 类型收敛

交付物：

- metadata 补齐
- 关键页面移除 `any` 强转

## 5. 验收标准（Definition of Done）

1. 代码内不再出现 `http://localhost:3001`（仅测试脚本例外）。
2. `chat/[botId]` 与 `bots/[botId]/edit` 对非法参数返回 404 页面。
3. `session` 请求支持服务端按 `botId` 过滤，前端不再全量拉取后过滤。
4. `app` 层存在可工作的 `loading.tsx`、`error.tsx`、`not-found.tsx`。
5. 首页首屏数据可在 Server Component 侧完成预取（客户端无首屏必需的首次 `useEffect` 拉取）。
6. metadata 包含 OG、Twitter、Canonical 基础字段。
7. 关键路径不再依赖 `as any`（至少 Bot、Session、KnowledgeBase 三块）。
8. `pnpm --filter @okon/web typecheck` 与主要交互链路手测通过。

## 6. 风险与回滚策略

## 风险

1. 代理层改造可能影响现有 tRPC/SSE 行为。
2. Server/Client 拆分可能引入 hydration 差异。
3. 类型收敛会暴露存量字段不一致问题。

## 回滚

1. 通信层按模块灰度：先 tRPC，再 chat，再 knowledge-base。
2. 关键路由拆分保留旧客户端实现分支，逐步切流。
3. 每阶段独立提交，可按阶段回退。

## 7. 建议执行顺序（最小风险）

1. 先做通信层同源化（不改 UI）。
2. 再做 session 查询下推与路由 404 收敛。
3. 再补边界文件（loading/error/not-found）。
4. 最后做 Server/Client 拆分与类型治理。

---

该文档可直接作为后续实施任务的主清单，建议按阶段拆成 3 个 PR，逐步上线验证。
