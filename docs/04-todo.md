缺失的核心功能

1. RAG (检索增强生成)
   你的 embeddings 模块已经有了向量存储和混合检索，但没有和 Agent 主流程打通。缺少：

文档上传 → 分块 → 索引 的完整 Pipeline
Agent 对话时自动检索相关文档注入上下文
目前 memory 只用了 BM25 稀疏向量，没有利用 dense embedding 2. Multi-Agent / Agent 编排
当前只有单一 ToolLoopAgent，缺少：

多 Agent 协作（如 Planner → Executor → Critic 模式）
Agent 路由（根据用户意图分发给不同专长的 Agent）
子任务分解与并行执行 3. 长期记忆 (Long-term Memory)
当前 memory 系统比较初级：

只存了 "User: X\nAssistant: Y" 原文，没有摘要/提炼
没有记忆衰减机制（时间越久权重越低）
没有实体记忆（提取关键实体和关系）
缺少跨会话的用户画像积累 4. Planning / ReAct / 推理策略
当前 Agent 是简单的 tool loop（最多 5 步），缺少：

ReAct 模式（Thought → Action → Observation 显式推理链）
Plan-and-Execute（先生成计划再逐步执行）
自我反思 / 纠错（执行失败后自动调整策略）
Chain-of-Thought 提示工程 5. Guardrails / 安全护栏
完全缺失：

输入检测（prompt injection、有害内容过滤）
输出校验（幻觉检测、格式验证）
Token 用量限制 / 速率控制
工具调用结果验证 6. 可观测性 (Observability)
缺少：

Tracing（每次调用的完整链路追踪，如集成 LangFuse / OpenTelemetry）
Token 用量统计与成本监控
工具调用成功率、延迟等指标 7. 评估体系 (Evaluation)
原有的 eval.ts 和 cases.json 已被删除，需要：

工具调用准确率评估
回答质量评估（人工/自动）
端到端回归测试
A/B 对比不同 prompt / 模型的效果 8. MCP (Model Context Protocol)
mcp.ts 目前只是空壳，缺少：

MCP Server 连接与工具动态发现
外部工具的运行时注册
建议的学习优先级

高优先 ──────────────────────────── 低优先

RAG Pipeline > Planning/ReAct > 长期记忆 > Guardrails > Multi-Agent > Observability
推荐下一步：把你已有的 embeddings 能力接入 Agent 主流程，实现一个完整的 RAG 对话，这是最能串联你现有代码、且实用价值最高的功能。

需要我帮你实现其中某个功能吗？
