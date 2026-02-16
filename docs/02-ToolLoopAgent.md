# AI Agent 学习手册（二）：ToolLoopAgent 版本

本文档基于 `01-Agent 与 Tool Calling.md`，聚焦你当前项目已经完成的“ToolLoopAgent 架构化改造”，帮助你理解为什么这样拆、怎么跑、以及后续该往哪里进阶。

## 1. 本阶段目标

- 将“模型调用 + 工具循环”从 UI 层剥离到独立 Agent 层。
- 用 `ToolLoopAgent` 封装可复用的智能体配置（模型、工具、循环策略、步骤回调）。
- 在终端 UI 中加入工具审批流程（`needsApproval`）并完成闭环。
- 迁移为 TypeScript，保证类型安全和后续可维护性。

## 2. 当前已完成内容（相对 01 的升级）

1. 从“UI 内直接 `streamText`”迁移到“UI 调用 Agent”。
2. 新增 Agent 逻辑层：`src/tool-agent.ts`。
3. 在 `weatherTool` 上启用 `needsApproval: true`，并实现审批交互（`y/n`）。
4. 实现审批二次调用链路：`tool-approval-request -> tool-approval-response -> 继续推理/执行`。
5. 新增通用 logger（内存事件流）并在 UI 用 `Static` 持久渲染日志。
6. 全量迁移到 TypeScript（`src/*.ts` + `tsconfig.json` + `typecheck` 脚本）。

## 3. 当前项目结构

```text
docs/
  01-Agent 与 Tool Calling.md
  02-ToolLoopAgent.md
src/
  index.ts
  tool-agent.ts
  logger.ts
  tools/
    index.ts
    calculator.ts
    weather.ts
package.json
tsconfig.json
```

模块职责：

- `src/index.ts`：Ink TUI、输入输出、审批交互、会话历史管理、触发 agent。
- `src/tool-agent.ts`：`ToolLoopAgent` 定义（model/instructions/tools/stopWhen/onStepFinish）。
- `src/logger.ts`：统一日志接口与订阅机制。
- `src/tools/*.ts`：工具定义（schema、execute、审批策略）。

## 4. 运行方式

```bash
pnpm install
cp .env.example .env
# 填写 DEEPSEEK_API_KEY
pnpm ask
```

类型检查：

```bash
pnpm typecheck
```

## 5. ToolLoopAgent 核心调用链路

1. 用户在 TUI 输入问题。
2. `index.ts` 把输入追加到 `chatHistory`（`ModelMessage[]`）。
3. 调用 `streamToolAgent(history)`。
4. `tool-agent.ts` 内部由 `ToolLoopAgent` 驱动多步流程：
   - 模型生成文本或工具调用
   - 若可自动执行则执行 `execute`
   - 若命中 `needsApproval` 则返回审批请求
5. `index.ts` 消费流式文本并更新 UI。
6. 若有审批请求，等待用户输入 `y/n`，写入 `tool-approval-response` 后再次调用 agent。
7. 最终产出完整回答。

## 6. 工具审批（needsApproval）闭环

当前配置：

- `weatherTool` 设置了 `needsApproval: true`。

实际运行特征：

- 第一次调用不会立即执行 `weatherTool.execute`。
- Agent 返回 `tool-approval-request`。
- 你在 UI 输入：
  - `y`：批准执行
  - `n`：拒绝执行
- UI 组装 `role: 'tool'` 的 `tool-approval-response` 后发起第二次调用。
- SDK 根据 `approved` 决定是否执行 `execute`，模型再继续完成回复。

## 7. 为什么要这样分层

1. 复用性：Agent 可被 CLI / API / 测试复用，不绑定某个 UI。
2. 可维护：模型、工具、循环策略集中在 `tool-agent.ts`。
3. 可扩展：后续加子 Agent、权限策略、多模型路由不需要重写 UI。
4. 可测试：UI 和 Agent 分开后，测试粒度更清晰。

## 8. 本阶段常见坑位

1. 只维护 UI 文本消息，不维护 `ModelMessage[]`  
   会导致审批响应、工具结果无法正确续传。

2. 收到审批请求后直接继续问新问题  
   容易触发“工具调用未决”相关错误，必须先提交审批响应。

3. 在 Ink 中直接依赖 `console.log` 看日志  
   输出可能被重绘覆盖。当前项目已改为 logger + `Static` 持久渲染。

4. 文件名改了但导出名没同步  
   例如 `tool-agent.ts` 内仍叫 `weatherAgent`，后期容易混淆。

## 9. 下一步学习建议

1. 把审批策略从“固定 true”升级为“按参数动态审批”（函数式 `needsApproval`）。
2. 把审批输入从 `y/n` 扩展为显示工具名、参数 diff、风险等级。
3. 在 `onStepFinish` 里记录 step 级指标（工具命中率、拒绝率、平均步骤数）。
4. 尝试拆分子 Agent（例如 weather 子 Agent + math 子 Agent）。
5. 为 Agent 增加固定评测问题集，建立回归检查流程。
