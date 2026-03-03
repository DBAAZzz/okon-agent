# 项目 TODO（基于当前代码）

更新时间：2026-02-28

## 1. 现状快照（已完成）

- [x] 主代理 ToolLoop：`apps/agent/src/agent/factory.ts`
- [x] 子代理体系（`research` / `planner`）：`apps/agent/src/agent/subagent/*`
- [x] 网页搜索与抓取工具：`apps/agent/src/tools/web-search.ts`、`apps/agent/src/tools/web-fetch.ts`
- [x] 审批中断与恢复：`apps/agent/src/agent/gateway.ts`、`apps/agent/src/agent/session-manager.ts`
- [x] Channel 基础能力（Feishu + 配置热更新）：`apps/agent/src/channel/*`
- [x] RAG 主链路打通：`apps/agent/src/agent/gateway.ts`（检索 + 注入）
- [x] 文档入库 pipeline（上传 -> 分块 -> 索引）：`apps/agent/src/routes/upload.ts`、`apps/agent/src/capabilities/knowledge/knowledge-store.ts`
- [x] 基于文件的长期记忆系统（分类 / 优先级 / 过期归档）：`apps/agent/src/capabilities/memory/file-memory-store.ts`
- [x] 记忆自动提取（对话后 LLM 提取 create/update/delete）：`apps/agent/src/capabilities/memory/memory-extractor.ts`
- [x] 上下文压缩（token 超限时自动摘要）：`apps/agent/src/agent/prompt/compaction.ts`
- [x] 定时任务调度（cron / interval / delay / at）：`apps/agent/src/capabilities/scheduler/*`、`apps/agent/src/tools/scheduler.ts`
- [x] 基础工具能力（bash / read / write / edit）：`apps/agent/src/tools/bash.ts`、`apps/agent/src/tools/file-read.ts`、`apps/agent/src/tools/file-write.ts`、`apps/agent/src/tools/file-edit.ts`
- [x] 记忆注入提示词注入防护：`apps/agent/src/agent/prompt/system.ts`
- [x] 记忆提取结构化输出（generateText + Output.object 替代 regex）：`apps/agent/src/capabilities/memory/memory-extractor.ts`
- [x] System prompt 重构（人设与核心规则分离，botPrompt 不覆盖工具原则）：`apps/agent/src/agent/prompt/system.ts`

## 2. P0（当前迭代必须完成）

- [ ] 建立最小评测回归
  - 现状：项目中无 `eval/` 目录，无任何测试用例。
  - 任务：新增 `eval` 目录和用例集（工具调用、检索命中）。
  - 任务：定义可在 CI 执行的 smoke/e2e 脚本。
  - 验收：每次改动可跑固定用例并输出通过率。

## 3. P1（下一迭代）

- [ ] 多 Agent 编排增强（从"工具化子代理"到"可组合工作流"）
  - 任务：新增 `executor`/`critic` 角色或将 `planner` 结果强制进入执行链。
  - 任务：支持子代理失败重试与回退策略。
  - 验收：复杂任务可稳定执行"规划 -> 执行 -> 校验"。

- [ ] Guardrails 基线能力
  - 任务：增加输入侧风险检查（prompt injection、危险 URL）。
  - 任务：增加输出侧结构校验（关键字段、来源必填、拒答策略）。
  - 验收：恶意提示和异常工具输出不会直接透传给最终回答。

- [ ] Observability 与成本统计
  - 任务：为一次请求打通 traceId（session -> step -> tool）。
  - 任务：沉淀指标：token、延迟、工具成功率。
  - 验收：可按会话或时间区间查看调用质量与成本。

- [ ] Channel 能力增强
  - 任务：支持多平台适配器扩展（在 `ChannelAdapter` 上新增实现）。
  - 任务：将"每平台唯一配置"升级为"多配置实例"模型。
  - 验收：同一平台可配置多个 bot 实例并独立启停。

## 4. P2（中长期）

- [ ] 记忆系统工具化
  - 现状：记忆读写在 gateway 层"体外循环"，Agent 自身无感知。
  - 任务：将记忆管理改为 Agent 可主动调用的工具（searchMemory / saveMemory / deleteMemory）。
  - 任务：去掉 memory-extractor 的额外 LLM 调用，记忆管理变成 Agent 的主动行为。
  - 验收：Agent 可按需查询和更新记忆，不再依赖每轮自动提取。

- [ ] MCP 正式接入
  - 任务：将 `apps/agent/src/tools/mcp.ts` 从示例改为可配置客户端。
  - 任务：实现运行时工具发现与注册策略。
  - 验收：可接入至少 1 个外部 MCP Server 并被 Agent 稳定调用。

- [ ] 检索质量优化
  - 任务：引入 reranker 或重排规则；优化 chunk 粒度。
  - 验收：离线评测中 topK 命中率/答案准确率持续提升。

## 5. 建议执行顺序

1. ~~RAG 主链路打通~~ ✅
2. ~~文档入库 pipeline~~ ✅
3. ~~长期记忆系统（文件存储 + 自动提取）~~ ✅
4. ~~上下文压缩~~ ✅
5. ~~定时任务调度~~ ✅
6. ~~基础工具能力（bash / read / write / edit）~~ ✅
7. 记忆召回升级
8. 评测回归
9. Guardrails + Observability
10. 多 Agent 深化 + MCP + 记忆工具化
