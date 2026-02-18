# 项目 TODO（基于当前代码）

更新时间：2026-02-18

## 1. 现状快照（已完成）

- [x] 主代理 ToolLoop：`apps/agent/src/agent/factory.ts`
- [x] 子代理体系（`research` / `planner`）：`apps/agent/src/agent/subagent/*`
- [x] 网页搜索与抓取工具：`apps/agent/src/tools/web-search.ts`、`apps/agent/src/tools/web-fetch.ts`
- [x] 审批中断与恢复：`apps/agent/src/agent/gateway.ts`、`apps/agent/src/agent/session-manager.ts`
- [x] 记忆存储与注入（稀疏 + recent）：`apps/agent/src/capabilities/memory/*`
- [x] Embeddings 能力与混合检索 API：`apps/agent/src/capabilities/embeddings/*`、`apps/agent/src/trpc/router.ts`
- [x] Channel 基础能力（Feishu + 配置热更新）：`apps/agent/src/channel/*`、`apps/web/src/app/channel/page.tsx`

## 2. P0（当前迭代必须完成）

- [ ] 打通 RAG 主链路（Agent 对话实时检索文档）
  - 任务：在 `runAgent()` 中加入文档检索步骤，将结果注入系统提示词或工具结果上下文。
  - 任务：定义检索触发条件（关键词/意图/显式开关），避免每轮都检索。
  - 验收：提问命中文档时，回答内容能引用到 `embeddings.search` 返回的文档片段。

- [ ] 完成文档入库 pipeline（上传 -> 分块 -> 索引）
  - 任务：新增文档上传接口，支持纯文本或 markdown。
  - 任务：实现 chunk 策略（大小、重叠、metadata）。
  - 验收：可批量上传文档并在检索中稳定命中对应 chunk。

- [ ] 记忆召回从 recent 升级为相关性召回
  - 任务：在 `memoryStore.recent()` 基础上引入 `memoryStore.search()` 混合策略（最近 + 相似）。
  - 任务：为记忆注入增加 token 限额与截断规则。
  - 验收：多轮追问场景下，召回内容与当前问题相关性明显高于仅 recent。

- [ ] 建立最小评测回归
  - 任务：新增 `eval` 目录和用例集（工具调用、检索命中、审批流程）。
  - 任务：定义可在 CI 执行的 smoke/e2e 脚本。
  - 验收：每次改动可跑固定用例并输出通过率。

## 3. P1（下一迭代）

- [ ] 多 Agent 编排增强（从“工具化子代理”到“可组合工作流”）
  - 任务：新增 `executor`/`critic` 角色或将 `planner` 结果强制进入执行链。
  - 任务：支持子代理失败重试与回退策略。
  - 验收：复杂任务可稳定执行“规划 -> 执行 -> 校验”。

- [ ] Guardrails 基线能力
  - 任务：增加输入侧风险检查（prompt injection、危险 URL）。
  - 任务：增加输出侧结构校验（关键字段、来源必填、拒答策略）。
  - 验收：恶意提示和异常工具输出不会直接透传给最终回答。

- [ ] Observability 与成本统计
  - 任务：为一次请求打通 traceId（session -> step -> tool）。
  - 任务：沉淀指标：token、延迟、工具成功率、审批拒绝率。
  - 验收：可按会话或时间区间查看调用质量与成本。

- [ ] Channel 能力增强
  - 任务：支持多平台适配器扩展（在 `ChannelAdapter` 上新增实现）。
  - 任务：将“每平台唯一配置”升级为“多配置实例”模型。
  - 验收：同一平台可配置多个 bot 实例并独立启停。

## 4. P2（中长期）

- [ ] 长期记忆体系
  - 任务：记忆摘要化、实体化、衰减策略、跨会话用户画像。
  - 验收：跨会话能保持用户偏好和长期事实一致性。

- [ ] MCP 正式接入
  - 任务：将 `apps/agent/src/tools/mcp.ts` 从示例改为可配置客户端。
  - 任务：实现运行时工具发现与注册策略。
  - 验收：可接入至少 1 个外部 MCP Server 并被 Agent 稳定调用。

- [ ] 检索质量优化
  - 任务：引入 reranker 或重排规则；优化 chunk 粒度。
  - 验收：离线评测中 topK 命中率/答案准确率持续提升。

## 5. 建议执行顺序

1. RAG 主链路打通
2. 文档入库 pipeline
3. 记忆召回升级
4. 评测回归
5. Guardrails + Observability
6. 多 Agent 深化 + MCP + 长期记忆
