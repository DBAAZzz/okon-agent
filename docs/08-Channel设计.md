# Channel 设计（基于当前代码）

## 1. 设计目标

Channel 模块用于把外部 IM 平台消息接入 Agent 主链路，实现：

- 平台无关的入站/出站抽象
- 配置化启停（热更新）
- 外部会话与内部 `sessionId` 的持久映射

## 2. 关键代码位置

- 抽象接口：`apps/agent/src/channel/types.ts`
- 管理器：`apps/agent/src/channel/channel-manager.ts`
- 飞书适配器：`apps/agent/src/channel/feishu-adapter.ts`
- 初始化入口：`apps/agent/src/server.ts`
- 配置管理 API：`apps/agent/src/trpc/router.ts`（`channel` router）
- 前端配置页：`apps/web/src/app/channel/page.tsx`
- 数据模型：`apps/agent/prisma/schema.prisma`

## 3. 数据模型

Prisma 中与 Channel 相关的 2 个核心表：

- `ChannelConfig`
  - `platform` 唯一（MVP 阶段每个平台仅一条配置）
  - `enabled` 控制是否启动
  - `config` 存平台凭证 JSON（如飞书 `appId/appSecret`）
- `ChannelMapping`
  - 维护 `(channelConfigId, externalChatId) -> sessionId`
  - 唯一约束：`@@unique([channelConfigId, externalChatId])`

## 4. 生命周期管理

### 4.1 启动

`server.ts` 在启动时：

1. `initChannelManager(prisma)`
2. 服务监听成功后 `cm.startAll()`

`startAll()` 会读取 `enabled = true` 的配置，逐个 `startOne()`。

### 4.2 停止

- 进程关闭时 `onClose -> cm.stopAll()`
- 单配置可通过 `stopOne(configId)` 停止

## 5. 消息处理主链路

`handleMessage(configId, adapter, msg)` 的核心流程：

1. `resolveSession()`：
   - 先查 `ChannelMapping`
   - 无映射则创建新会话并落库映射
2. 调用 `runAgent(sessionId, msg.text, { historyLimit: 0 })`
3. 若 adapter 支持流式回复：
   - 消费 `adaptStream(...)` 的 `text_delta`
   - 实时 `replyStream.append(delta)`
   - 结束后 `replyStream.complete(finalText)`
4. 最终 `finalizeStream(sessionId, agentStream)` 做消息持久化/审批处理/记忆写入
5. 异常时返回统一兜底文案

说明：`historyLimit: 0` 代表本次推理不带历史窗口，仅使用当前入站消息。

## 6. 平台抽象接口

`ChannelAdapter` 约束每个平台实现：

- `start(onMessage)`
- `sendReply(externalChatId, text)`
- `stop()`
- 可选 `createReplyStream(externalChatId)`（支持流式平台实现）

这样 `ChannelManager` 不依赖具体平台 SDK。

## 7. 飞书适配器实现要点

`createFeishuAdapter()` 当前是唯一落地平台：

- 连接方式：飞书 WS 事件订阅
- 消息过滤：
  - 仅处理 `sender_type = user`
  - 仅处理 `@机器人` 消息
- 去重策略：
  - 用 `processedMessageIds` 记录消息 ID
  - 10 分钟窗口内重复事件直接忽略
- 流式输出：
  - 先发 interactive 卡片占位文本
  - 按固定间隔 patch 卡片内容
  - patch 失败时降级为发送普通文本

## 8. 配置与热更新

`trpc.channel.upsert` 行为：

1. upsert `ChannelConfig`
2. 若 `enabled=true`：
   - 先 `stopOne` 再 `startOne`（热重启）
3. 若 `enabled=false`：
   - 直接 `stopOne`

前端 `Channel` 页面通过该接口完成飞书配置的增删改和启停。

## 9. 当前实现边界

- 仅实现 `feishu` 平台，其他平台需新增 Adapter
- `platform` 唯一约束意味着单平台暂不支持多套配置
- 入站消息以文本为主，复杂富媒体场景未覆盖
