# Session Token 统计功能落地方案

> 更新时间：2026-02-25

## 1. 背景与现状

项目当前在 `apps/agent/src/agent/events/stream-adapter.ts` 的 `finish` 事件中，从 AI SDK 获取 `totalUsage` 并通过 SSE 推送给前端。但存在两个问题：

1. **BUG**：代码使用 `chunk.totalUsage.promptTokens` / `completionTokens`，但 AI SDK v6（`ai@6.x`）的实际字段名是 `inputTokens` / `outputTokens`，导致前端收到的 token 数**始终为 0**
2. **无持久化**：token 用量仅在 SSE 流中一闪而过，未写入数据库，无法按 session 维度查看历史累计、无法做成本审计

本方案将修复 bug、持久化 token 记录、提供查询接口，并在前端展示。

---

## 2. AI SDK v6 Usage 类型参考

在 `ai@6.x` 中，`LanguageModelUsage` 的实际结构为：

```typescript
type LanguageModelUsage = {
  inputTokens: number | undefined          // prompt tokens
  inputTokenDetails: {
    noCacheTokens: number | undefined
    cacheReadTokens: number | undefined
    cacheWriteTokens: number | undefined
  }
  outputTokens: number | undefined         // completion tokens
  outputTokenDetails: {
    textTokens: number | undefined
    reasoningTokens: number | undefined    // DeepSeek reasoning tokens
  }
  totalTokens: number | undefined          // inputTokens + outputTokens
  // @deprecated aliases:
  reasoningTokens?: number | undefined
  cachedInputTokens?: number | undefined
}
```

获取方式：
- `await agentStream.result.totalUsage` — 跨所有 tool-loop steps 的累计（**推荐**）
- `finish` chunk 中的 `chunk.totalUsage` — 同上，在 stream 末尾发出
- `await agentStream.result.response` 返回的 `response.modelId` — provider 返回的实际模型 ID

---

## 3. 改动文件清单

| # | 文件路径 | 改动类型 | 说明 |
|---|---------|---------|------|
| 1 | `apps/agent/prisma/schema.prisma` | 新增模型 | 新增 `TokenUsage` 表 |
| 2 | `apps/agent/prisma/migrations/` | 新增迁移 | 自动生成 SQL |
| 3 | `apps/agent/src/agent/session-manager.ts` | 新增方法 | `recordTokenUsage()` |
| 4 | `apps/agent/src/agent/gateway.ts` | 修改 | `AgentStreamResult` 添加 `runId`/`provider`；`finalizeStream` 写入 token |
| 5 | `apps/agent/src/agent/events/stream-adapter.ts` | Bug 修复 | `promptTokens` → `inputTokens` 字段映射 |
| 6 | `packages/shared/src/types/stream-event.ts` | 类型扩展 | `done` 事件补充 `model` 字段（可选） |
| 7 | `apps/agent/src/trpc/router.ts` | 新增路由 | `tokenUsage.getSessionSummary` + `getSessionDetails` |
| 8 | `apps/web/src/components/ChatInterface.tsx` | 新增查询逻辑 | `useChat.onFinish` 后刷新 session token 汇总 |
| 9 | `apps/agent/src/routes/chat.ts` | 时序修正 | 在 UI Message Stream `onFinish` 中优先执行 `finalizeStream` |

---

## 4. 详细实现步骤

### Step 1: Prisma Schema — 新增 `TokenUsage` 模型

**文件**: `apps/agent/prisma/schema.prisma`

新增表定义：

```prisma
model TokenUsage {
  id               Int      @id @default(autoincrement())
  runId            String   @unique          // crypto.randomUUID()，幂等去重键
  sessionId        Int
  session          Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  provider         String                    // "openai" | "deepseek" | ...
  model            String                    // 实际模型 ID，取自 response.modelId
  inputTokens      Int      @default(0)
  outputTokens     Int      @default(0)
  totalTokens      Int      @default(0)
  providerUsage    Json?                     // 完整原始 usage 对象
  createdAt        DateTime @default(now())

  @@index([sessionId, createdAt])
}
```

在 `Session` 模型中添加反向关联：

```prisma
model Session {
  // ...existing fields...
  tokenUsages     TokenUsage[]
}
```

**设计决策**：

| 决策 | 原因 |
|------|------|
| `runId` 唯一约束 | `finalizeStream` 幂等，重试/并发不会重复写入 |
| 不加 `messageId` 外键 | 一次 agent 调用产生多条 Message，token usage 对应整次调用而非单条消息，语义上 `runId` 更准确 |
| `providerUsage Json?` | 存原始 usage 对象，兼容 `reasoningTokens`、`cacheReadTokens` 等 provider 特有字段，无需未来加列 |
| `provider` + `model` 分开存 | `model` 存 provider 返回的实际 ID（如 `gpt-4o-2024-08-06`），比用户配置的别名更可靠，配合 `provider` 可精确计算成本 |
| 复合索引 `(sessionId, createdAt)` | 覆盖"按 session + 时间范围"的高频查询 |

---

### Step 2: 生成数据库迁移

```bash
cd apps/agent && npx prisma migrate dev --name add_token_usage
```

预期生成的 SQL：

```sql
-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "providerUsage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenUsage_runId_key" ON "TokenUsage"("runId");

-- CreateIndex
CREATE INDEX "TokenUsage_sessionId_createdAt_idx" ON "TokenUsage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

### Step 3: SessionManager 新增 `recordTokenUsage` 方法

**文件**: `apps/agent/src/agent/session-manager.ts`

在 `SessionManager` 类中，`addMessages` 方法之后新增：

```typescript
/**
 * 记录单次 agent 调用的 token 用量
 * - try/catch 包裹，不阻断主对话流程
 * - runId 唯一约束冲突时静默跳过（幂等）
 */
async recordTokenUsage(data: {
  runId: string
  sessionId: number
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  providerUsage?: unknown
}): Promise<void> {
  try {
    await this.prisma.tokenUsage.create({ data: data as any })
    logger.debug('记录 token 用量', {
      sessionId: data.sessionId,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
    })
  } catch (err: any) {
    // runId 唯一约束冲突 → 幂等重复，静默忽略
    if (err?.code === 'P2002') {
      logger.debug('token 用量记录已存在，跳过', { runId: data.runId })
      return
    }
    // 其他错误仅告警，不阻断主流程
    logger.warn('token 用量记录失败', err)
  }
}
```

**关键点**：
- Prisma unique violation error code 为 `P2002`，捕获后静默跳过实现幂等
- 其他异常仅 `logger.warn`，绝不 throw —— token 记录是辅助功能，不能影响核心对话

---

### Step 4: Gateway 改造

**文件**: `apps/agent/src/agent/gateway.ts`

#### 4a. 导入 `randomUUID`

```typescript
import { randomUUID } from 'node:crypto'
```

#### 4b. `AgentStreamResult` 类型扩展

```typescript
export type AgentStreamResult = {
  /** ToolLoopAgent.stream() 的返回值 */
  result: any
  modelId: string
  userMessage?: string
  runId: string           // 新增：本次调用的唯一标识
  provider: string        // 新增：provider 名称
}
```

#### 4c. `runAgent` 生成 `runId` 并传递 `provider`

在 `runAgent` 函数的 return 语句中追加字段：

```typescript
export async function runAgent(
  sessionId: number,
  userMessage: string | undefined,
  options: RunAgentOptions,
): Promise<AgentStreamResult> {
  // ...existing logic (unchanged)...

  const runId = randomUUID()

  logger.info('启动 agent stream', { sessionId, model: modelId, runId })
  const result = await agent.stream({ messages: history })

  return {
    result,
    modelId,
    userMessage,
    runId,
    provider: options.bot.provider,
  }
}
```

#### 4d. `finalizeStream` 中持久化 token 用量

在"正常完成"分支的 `addMessages` 之后、`memoryStore.storeConversation` 之前插入：

```typescript
export async function finalizeStream(
  sessionId: number,
  agentStream: AgentStreamResult,
): Promise<void> {
  const response = await agentStream.result.response
  const approvals = collectApprovalRequests(response.messages as ModelMessage[])

  if (approvals.length > 0) {
    // 审批中断分支 — 不记录 token
    // 此次调用未完成，continueAfterApproval 会产生新的独立记录
    sessionManager.setPendingMessages(sessionId, response.messages)
    sessionManager.setPendingApprovals(sessionId, approvals)
    logger.info('stream 因审批中断，消息已暂存', {
      sessionId,
      approvals: approvals.length,
    })
    return
  }

  // 正常完成：持久化消息
  sessionManager.clearPendingApprovals(sessionId)
  await sessionManager.addMessages(sessionId, response.messages)

  // ── 新增：记录 token 用量 ──
  const totalUsage = await agentStream.result.totalUsage
  if (totalUsage) {
    await sessionManager.recordTokenUsage({
      runId: agentStream.runId,
      sessionId,
      provider: agentStream.provider,
      model: response.modelId ?? agentStream.modelId,
      inputTokens: totalUsage.inputTokens ?? 0,
      outputTokens: totalUsage.outputTokens ?? 0,
      totalTokens: totalUsage.totalTokens ?? 0,
      providerUsage: totalUsage,
    })
  }

  // 异步存记忆（existing logic, unchanged）
  if (agentStream.userMessage) {
    memoryStore
      .storeConversation(agentStream.userMessage, response.messages, {
        sessionId: String(sessionId),
      })
      .catch((err) => {
        logger.error('记忆存储失败', err)
      })
  }

  logger.info('stream 收尾完成', { sessionId })
}
```

**关键点**：
- `response.modelId` 是 provider 响应中的实际模型 ID（如 `gpt-4o-2024-08-06`），优先使用；fallback 到 `agentStream.modelId`（用户配置值如 `gpt-4o`）
- 审批中断分支**不记录 token** —— 此时调用未完成，`continueAfterApproval` 会触发新的 `runAgent` + `finalizeStream` 产生独立记录
- `await agentStream.result.totalUsage` 在 `await response` 之后调用是安全的（流已消耗完毕，promise 已 resolved）

---

### Step 5: 修复 stream-adapter.ts 的 AI SDK v6 字段名 Bug

**文件**: `apps/agent/src/agent/events/stream-adapter.ts`

**当前代码**（第 76-86 行）：

```typescript
case 'finish':
  yield {
    type: 'done',
    totalUsage: chunk.totalUsage
      ? {
          promptTokens: chunk.totalUsage.promptTokens ?? 0,     // ❌ BUG
          completionTokens: chunk.totalUsage.completionTokens ?? 0, // ❌ BUG
        }
      : undefined,
  }
  break
```

**修复后**：

```typescript
case 'finish':
  yield {
    type: 'done',
    totalUsage: chunk.totalUsage
      ? {
          promptTokens: chunk.totalUsage.inputTokens ?? 0,      // ✅ AI SDK v6
          completionTokens: chunk.totalUsage.outputTokens ?? 0,  // ✅ AI SDK v6
        }
      : undefined,
  }
  break
```

> **说明**：前后端 wire protocol（`StreamEvent`）中保留 `promptTokens` / `completionTokens` 命名不变，这是已有的前后端接口约定。字段映射（`inputTokens → promptTokens`）仅发生在 adapter 层。

---

### Step 6: StreamEvent 类型扩展（可选）

**文件**: `packages/shared/src/types/stream-event.ts`

在 `done` 事件类型中补充 `model` 字段：

```typescript
| { type: 'done'; totalUsage?: { promptTokens: number; completionTokens: number }; model?: string }
```

> **决定**：本次不在 SSE `done` 事件中传递 `model`。前端通过 session 绑定的 bot 信息已知模型，无需冗余传输。仅预留类型定义，后续按需填充。

---

### Step 7: tRPC 路由 — token 用量查询

**文件**: `apps/agent/src/trpc/router.ts`

在 `appRouter` 中新增 `tokenUsage` 路由：

```typescript
tokenUsage: router({
  /**
   * 获取 session 的 token 聚合统计
   * 使用 DB aggregate，O(1) 内存，不随记录增长变慢
   */
  getSessionSummary: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input, ctx }) => {
      const agg = await ctx.req.server.prisma.tokenUsage.aggregate({
        where: { sessionId: input.sessionId },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
        },
        _count: true,
      })
      return {
        totalInputTokens: agg._sum.inputTokens ?? 0,
        totalOutputTokens: agg._sum.outputTokens ?? 0,
        totalTokens: agg._sum.totalTokens ?? 0,
        requestCount: agg._count,
      }
    }),

  /**
   * 获取 session 的 token 明细（游标分页）
   * UI 默认只调聚合，展开详情时按需加载明细
   */
  getSessionDetails: publicProcedure
    .input(z.object({
      sessionId: z.number(),
      cursor: z.number().optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const items = await ctx.req.server.prisma.tokenUsage.findMany({
        where: {
          sessionId: input.sessionId,
          ...(input.cursor ? { id: { lt: input.cursor } } : {}),
        },
        orderBy: { id: 'desc' },
        take: input.limit + 1,
      })
      const hasMore = items.length > input.limit
      if (hasMore) items.pop()
      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      }
    }),
}),
```

**设计决策**：

| 决策 | 原因 |
|------|------|
| 聚合用 `aggregate` | 比 `findMany + reduce` 高效，O(1) 内存 |
| 明细接口游标分页 | 基于 `id` 的游标分页比 offset 分页性能稳定 |
| 聚合与明细分离 | UI 默认只需聚合数字，明细按需加载减少传输 |

---

### Step 8: 前端 UI Message Stream 使用 `onFinish` 刷新 token 汇总

**文件**: `apps/web/src/components/ChatInterface.tsx`

> 当前前端主链路是 `useChat` + `/api/chat`（UI Message Stream），不是 `useSSEStream`。因此 token 展示应挂在 `useChat` 回调。

#### 8a. 新增本地汇总 state 与刷新函数

```typescript
type TokenUsageSummary = {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  requestCount: number
}

const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null)

const refreshTokenUsage = useCallback(async () => {
  const summary = await trpc.tokenUsage.getSessionSummary.query({ sessionId })
  setTokenUsage(summary)
}, [sessionId])
```

#### 8b. 会话切换时拉取一次历史累计

```typescript
useEffect(() => {
  let cancelled = false
  async function loadTokenUsage() {
    const summary = await trpc.tokenUsage.getSessionSummary.query({ sessionId })
    if (!cancelled) setTokenUsage(summary)
  }
  loadTokenUsage().catch(console.error)
  return () => {
    cancelled = true
  }
}, [sessionId])
```

#### 8c. 在 `useChat.onFinish` 中刷新累计

```typescript
const { ... } = useChat({
  id: String(sessionId),
  transport,
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  onFinish: () => {
    void refreshTokenUsage()
  },
})
```

#### 8d. 展示到聊天头部（或 session 详情面板）

```tsx
Tokens: {tokenUsage?.totalTokens ?? 0}
(In {tokenUsage?.totalInputTokens ?? 0} / Out {tokenUsage?.totalOutputTokens ?? 0})
```

**说明**：
- 不依赖 SSE `done` 事件，避免 UI Message Stream 路径统计遗漏
- `onFinish` 每次调用完成后都会刷新一次，天然覆盖审批继续执行场景
- 历史累计数据统一来源于数据库聚合接口，避免前端本地状态漂移
- 后端需保证 `finalizeStream` 先于前端 `onFinish` 查询完成，避免出现一次性读旧值（本方案在 `/api/chat` 的 UI stream `onFinish` 回调中先执行落库）

---

## 5. 数据流总览

```
用户发送消息
    │
    ▼
runAgent()
  ├─ 生成 runId (crypto.randomUUID)
  ├─ 取历史、搜记忆、构建 prompt
  └─ 启动 agent.stream()
    │
    ▼
stream-adapter 逐 chunk 转换
  ├─ text_delta / reasoning_delta / tool_call_* → SSE 推送前端
  └─ finish → done 事件（含修复后的 inputTokens→promptTokens 映射）
    │
    ▼
finalizeStream()
  ├─ await response（流消耗完毕）
  ├─ await totalUsage（获取累计 token）
  ├─ addMessages()（持久化对话消息）
  ├─ recordTokenUsage()（持久化 token 记录，try/catch 不阻断）
  └─ storeConversation()（异步存记忆）
    │
    ▼
前端 `useChat.onFinish` → 调用 `tokenUsage.getSessionSummary`
    │
    ▼
聊天头部/详情面板显示累计 token
```

---

## 6. 验证清单

| # | 验证项 | 方法 | 预期结果 |
|---|--------|------|---------|
| 1 | 迁移 | `npx prisma migrate dev` | `TokenUsage` 表、`runId` 唯一索引、`(sessionId, createdAt)` 复合索引已创建 |
| 2 | Bug 修复 | 发送消息，观察 SSE `done` 事件 | `totalUsage.promptTokens` 不再为 0 |
| 3 | 持久化 | 发送消息后查询 DB | `SELECT * FROM "TokenUsage" WHERE "sessionId" = ?` 有记录，字段值合理 |
| 4 | 幂等 | 手动对同一 `runId` 调用 `recordTokenUsage` 两次 | 不报错，只有一条记录 |
| 5 | 聚合 | 多轮对话后调用 `tokenUsage.getSessionSummary` | 累计值 = 各条 `totalTokens` 之和 |
| 6 | 分页 | 调用 `tokenUsage.getSessionDetails` 设置 `limit=1` | 正确返回 `nextCursor`，翻页正常 |
| 7 | 前端实时 | 观察聊天界面 | 每次 `onFinish` 后都会刷新 `tokenUsage.getSessionSummary` 并更新显示 |
| 8 | 错误隔离 | 模拟 DB 写入失败（如断开连接） | 对话正常完成，日志中有 warn 级别记录 |
| 9 | 审批场景 | 触发工具审批 → 用户同意 → 继续执行 | 审批中断不记录 token，继续执行后产生独立 token 记录 |

---

## 7. 后续扩展点（不在本次范围）

- **成本计算**：基于 `provider` + `model` + `inputTokens`/`outputTokens` 查价格表，计算 USD 成本
- **Bot 维度聚合**：通过 `Session.botId` join `TokenUsage`，统计每个 Bot 的总用量
- **全局仪表盘**：按天/周/月聚合 token 用量，展示趋势图
- **配额限制**：基于 token 累计实现用量告警或限流
- **`providerUsage` 展开**：解析 `reasoningTokens`、`cacheReadTokens` 等字段，在 UI 中分类展示
