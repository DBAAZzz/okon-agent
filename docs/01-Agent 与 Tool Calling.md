# AI Agent 学习手册（本项目阶段版）

本文档用于让新同学快速理解：这个项目已经做了什么、当前代码如何运行、在 AI SDK 工具调用上踩过哪些坑、后续该怎么继续学习。

## 1. 项目目标

- 使用 Vercel AI SDK + DeepSeek 构建一个可交互的终端 Agent（Ink TUI）。
- 让模型能够调用本地工具（calculator、weather、getOutdoorActivities）。
- 保持代码最小可运行，优先用于学习 Agent 与 Tool Calling 机制。

## 2. 当前已完成内容

1. 完成 Node + pnpm + ESM 项目初始化。
2. 接入 `@ai-sdk/deepseek` 与 `ai` SDK。
3. 完成 `.env` 读取 `DEEPSEEK_API_KEY`。
4. 实现 Ink 终端交互（输入问题、流式输出回答）。
5. 实现多轮消息上下文（`messages`）传递。
6. 实现工具注册与调用：
   - `calculatorTool`：两数相加。
   - `weatherTool`：原生随机天气（温度/湿度/天气）。
   - `getOutdoorActivitiesTool`：根据天气给出户外建议，支持拒绝外出。
7. 加入多步工具调用控制：`stopWhen: stepCountIs(5)`。
8. 沉淀常见坑位与排查方法（导入路径、单步调用、上下文丢失等）。

## 3. 项目结构

```text
docs/
  agent-learning-handbook.md
src/
  index.js
  tools/
    index.js
    calculator.js
    weather.js
package.json
```

模块职责：

- `src/index.js`：应用入口，Ink UI、消息管理、调用 `streamText`、注册 tools。
- `src/tools/calculator.js`：计算器工具定义。
- `src/tools/weather.js`：天气工具与活动推荐工具定义。
- `src/tools/index.js`：工具统一导出。

## 4. 运行方式

```bash
pnpm install
cp .env.example .env
# 填写 DEEPSEEK_API_KEY
pnpm ask
```

## 5. 核心调用链路

1. 用户在 Ink 输入问题。
2. 入口将历史 `messages` + 当前用户输入一起传给 `streamText`。
3. 模型在 `tools` 中选择是否调用工具。
4. AI SDK 执行工具 `execute`，并把工具结果回传给模型。
5. 模型生成最终文本并流式回到 UI。

关键点：

- 只有传 `messages`，模型才有上下文记忆（例如“再加100”）。
- 只传 `prompt` 易出现“第二句追问失效”。
- 多步工具调用依赖 `stopWhen`。

## 6. 已实现工具说明

### 6.1 calculatorTool

- 输入：`a`, `b`（number）
- 输出：`{ result }`
- 用途：基础算术验证 Tool Calling 是否真正生效。

### 6.2 weatherTool

- 输入：`location`
- 输出：随机的 `temperature`, `conditions`, `humidity`
- 特点：使用原生 `Math.random`，无第三方 mock 依赖。

### 6.3 getOutdoorActivitiesTool

- 输入：`temperature`, `conditions`, `humidity`, `location?`
- 输出：
  - `suitable`：是否适合户外
  - `refusal`：是否拒绝外出
  - `refusalReason`：拒绝理由
  - `suggestions`：注意事项
  - `recommended`：推荐活动
- 拒绝外出场景：
  - `rainy` / `snowy` / `foggy`
  - 极端温度（`<= -2` 或 `>= 36`）

## 7. 已验证的高频坑位

1. ESM 导入路径必须带扩展名  
   示例：`import { calculatorTool } from './tools/calculator.js'`

2. 工具定义属性应使用 `inputSchema`  
   错误写法 `parameters` 在当前 AI SDK 版本会导致兼容问题。

3. `toolChoice` 强制指定工具可能造成循环调用  
   如固定 `calculator` + 较高 `stepCountIs`，模型可能连续调用工具，直到到达步数上限。

4. `strict` 不等于“强制调用工具”  
   `strict` 只约束参数是否合法，不保证一定会调工具。

5. 单步模式下模型可能只说“我来计算”，不给最终结果  
   需要 `stopWhen` 让它完成“调工具 -> 读结果 -> 回答”。

## 8. 调试建议

建议在 `streamText` 中保留 `onStepFinish` 日志，观察：

- 每一步是否触发 tool call
- tool 参数与返回值
- finish reason
- 最终文本是否基于工具结果

最小排查清单：

1. `tools` 是否已注册到当前 `streamText` 调用
2. `messages` 是否包含历史上下文
3. `stopWhen` 是否允许多步
4. 工具 `inputSchema` 与 `execute` 参数是否一致
5. 模型是否支持 tool calling

## 9. 下一步学习建议

1. 对比 `toolChoice: auto / required / 指定tool` 三种策略差异。
2. 为工具调用增加更系统的日志与统计（调用率、失败率）。
3. 尝试多工具路由策略（weather + calculator 联动）。
4. 迁移到 `ToolLoopAgent` 做“可复用 agent 逻辑层”。
5. 增加评测集（固定问题集）做改动前后回归验证。
