# 多 Agent 设计（基于当前代码）

## 1. 当前架构形态

当前代码是「主代理 + 子代理工具化」模式：

- 主代理：统一对话入口，负责任务分流、工具路由、最终回答
- 子代理：按预设类型执行专长任务（当前有 `research`、`planner`）

这不是完全并行的 agent swarm，而是可控的分层编排。

## 2. 关键代码位置

- 主代理创建：`apps/agent/src/agent/factory.ts`
- 主代理入口编排：`apps/agent/src/agent/gateway.ts`
- 系统路由提示词：`apps/agent/src/agent/prompt.ts`
- 子代理预设：`apps/agent/src/agent/subagent/presets.ts`
- 子代理工厂与工具包装：`apps/agent/src/agent/subagent/index.ts`
- 模型注册：`apps/agent/src/agent/models/*`

## 3. 主代理职责

主代理由 `createAgent()` 构造：

- 类型：`ToolLoopAgent`
- `stopWhen: stepCountIs(5)`（最多 5 步）
- 工具集合：
  - 领域工具：`weather` / `getOutdoorActivities` / `ipLookup`
  - 子代理工具：由 `buildSubagentTools(modelId)` 动态注入（当前是 `research`、`planner`）

系统提示词明确了路由原则，例如：

- 网页检索与事实核验必须走 `research`
- 复杂多步骤任务先走 `planner`

## 4. 子代理职责与预设

### 4.1 research 子代理

- 目标：深度研究（检索 + 抓取 + 总结）
- 工具：`webSearchTool` + `webFetchTool`
- 最大步数：4
- 输出：`conclusion/keyFindings/sources/uncertainties`

### 4.2 planner 子代理

- 目标：把复杂任务拆成可执行计划
- 工具：无
- 最大步数：2
- 输出：`steps[]/questionsForUser[]`

## 5. 编排调用链

1. `runAgent(sessionId, userMessage)` 先写入用户消息并取历史。
2. 读取近期记忆并构建系统提示词。
3. 创建主代理并 `agent.stream({ messages: history })`。
4. 主代理在某一步决定调用子代理工具（如 `research`）。
5. `research` 的 `execute` 内部启动对应子代理 `generate()`。
6. 子代理执行结束后，输出被包装成 tool result 回到主代理。
7. 主代理继续后续步骤，直到结束。

## 6. 子代理结果标准化

`toSubagentResult()` 会统一提取：

- 结构化输出（schema 成功时）
- 兜底文本（schema 不可用时）
- 每一步工具调用轨迹
- 从工具输出递归抽取的 URL 作为 `sources`

`toModelOutput()` 再转成可读文本回传主代理，保证主代理拿到稳定格式结果。

## 7. 与审批/会话的关系

- 审批中断与恢复由 `gateway.ts` + `session-manager.ts` 统一处理
- 子代理作为工具调用的一部分，跟随主代理同一会话历史推进
- 主流程会在审批未完成时暂存消息，避免出现不完整 tool 轨迹

## 8. 当前实现边界

- 主代理与子代理默认共用同一个 `modelId`，暂无按角色分模型
- 调度是串行 Tool Loop，不是并行执行
- 预设类型目前固定两类，扩展需在 `SUBAGENT_PRESETS` 增加配置
