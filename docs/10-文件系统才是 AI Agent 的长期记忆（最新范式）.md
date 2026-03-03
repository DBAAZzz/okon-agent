# 文件系统才是 AI Agent 的长期记忆（最新范式）：从 Just-in-Time Context 到子代理协作

如果你在做长任务 Agent，迟早会遇到同一个问题：上下文越来越长，token 越来越贵，模型却越来越容易偏题或遗忘。  
工程上可持续的解法，不是把所有历史都塞进 prompt，而是把记忆外置并按需取回。

本文给出一套可直接落地的方案，核心结论是：

- 文件系统语义（真实文件或虚拟文件系统）是 Agent 长期记忆的最佳交互层。
- Just-in-Time Context 是控制 token 成本与保持准确性的默认策略。
- 子代理协作是防止上下文污染、提升复杂任务稳定性的关键结构。

---

## 1. 先统一前提：Context Window 不是长期记忆

在多步任务中，上下文会不断叠加：

1. 用户目标
2. 工具调用与返回
3. 中间推理与重试轨迹
4. 过程性观察结果（网页、日志、文档片段）

这会带来三个稳定问题：

1. 超窗口风险：任务未结束，窗口先满。
2. 质量衰减：上下文越长，注意力越分散。
3. 成本膨胀：每轮都在重复支付历史 token。

因此目标应是：上下文只保留下一步决策所需的最小信息，其余状态外置。

---

## 2. 为什么优先文件系统语义，而不是数据库优先

这不是数据库和文件系统的二选一，而是交互层与存储层的分工问题。

文件系统语义作为 Agent 交互层更合适，原因是：

1. Agent 天然通过 `read/write/find` 操作状态，文件接口最直接。
2. 层级目录更适合组织异构知识，不依赖固定 schema。
3. 对人类可读可审查，天然支持人机协作。
4. 可直接纳入 Git 工作流，便于版本、diff、回滚。
5. 跨 session 的记忆定位简单，路径就是地址。

底层你仍可使用 PostgreSQL/Qdrant 等系统。关键点是：暴露给 Agent 的认知接口建议保持文件系统语义。

---

## 3. Just-in-Time Context：上下文做索引，文件做事实

推荐最小闭环如下：

1. 重型信息先落盘（日志、网页解析、长输出）。
2. 对话上下文只保留引用（路径、键、摘要）。
3. 需要细节时，再由 Agent 通过 `glob/grep/read` 拉取。
4. 压缩时优先删除可恢复内容，保留不可恢复决策。

本质变化是：

- 旧模式：每轮全量喂历史。
- 新模式：索引定位，再按需展开。

---

## 4. 两套规则必须同时存在：L 分层 + P 生命周期

### 4.1 检索分层（L0/L1/L2）

| 层级 | 内容 | Token 量级 | 加载时机 |
| ---- | ---- | ---------- | -------- |
| L0 | `.abstract` 目录索引 | 100-300 | 每轮加载 |
| L1 | 周/月总结与主题概览 | 中等 | 相关时展开 |
| L2 | 原始日志与细节记录 | 最大 | 按需全文读取 |

这套分层让 Agent 从“每次读全部”变成“先定位，再深入”。

### 4.2 生命周期标签（P0/P1/P2）

| 标签 | 含义 | 建议策略 |
| ---- | ---- | -------- |
| P0 | 长期稳定信息 | 永久保留 |
| P1 | 活跃项目信息 | 90 天到期清理 |
| P2 | 临时任务信息 | 30 天到期清理 |

L 解决怎么找，P 解决留多久。只做其一都容易失控。

---

## 5. 可落地蓝图（MVP）

### 5.1 目录结构

```text
memory/
├── .abstract              # L0 根索引
├── MEMORY.md              # 长期记忆（含 P 标签）
├── SESSION-STATE.md       # 上下文压缩前的任务缓冲
├── insights/
│   ├── .abstract
│   └── 2026-02.md         # L1 洞察
├── lessons/
│   ├── .abstract
│   └── operational-lessons.jsonl
├── 2026-02-18.md          # L2 日志
└── archive/               # 过期归档
```

初始化示例：

```bash
mkdir -p memory/{insights,lessons,archive}
touch memory/.abstract memory/SESSION-STATE.md memory/MEMORY.md
```

### 5.2 `.abstract` 机制

Agent 每轮先读 `.abstract`，只在必要时展开 L1/L2。

```markdown
# memory index

## active topics
- weather strategy -> 2026-02-16.md, insights/2026-02.md
- reflex debugging -> 2026-02-17.md, lessons/operational-lessons.jsonl

## retrieval hints
- strategy, pnl, settlement
- reflex, timeout, retry

## recency
- last updated: 2026-02-18
```

约束：L0 必须保持简短。如果索引写成长文，就失去索引价值。

### 5.3 生命周期标签与 janitor

`memory/MEMORY.md` 示例：

```markdown
- [P0] 用户偏好：回复风格专业、简洁、少废话
- [P1|expire:2026-05-01] 当前主线项目：协议重构
- [P2|expire:2026-03-10] 临时测试网 RPC 列表
```

每日 janitor 任务建议做三件事：

1. 扫描 P1/P2 到期条目。
2. 迁移到 `memory/archive/`。
3. 同步更新相关 `.abstract` 索引。

### 5.4 记忆检索协议（写入系统提示词）

```text
Memory Retrieval Protocol:
1. Always read memory/.abstract first.
2. Identify relevant topic and candidate files.
3. Use glob/grep for targeted retrieval when needed.
4. Open full files only when summaries are insufficient.
5. Persist important new facts to daily L2 logs.
6. Periodically compact L2 -> L1 and refresh .abstract.
7. Respect P0/P1/P2 lifecycle tags and archive expired items.
```

### 5.5 上下文压缩抢救：`SESSION-STATE.md`

在 compaction 前写入：

- 当前任务目标与阶段
- 已确认决策与约束
- 未完成事项与下一步计划

compaction 后先读取该文件，可显著减少“压缩后失忆”。

### 5.6 子代理协作：隔离探索上下文

当任务复杂时，主代理只做编排，子代理负责局部高密度工作。

推荐角色拆分：

1. Explore：读代码/文档，产出压缩观察。
2. Plan：将观察转为可执行计划和风险列表。
3. Execute：按计划落地并返回结果。

这样可避免主线程长期携带探索噪声。

### 5.7 自动化维护

最少建议两个定时任务：

| 频率 | 任务 | 作用 |
| ---- | ---- | ---- |
| 每天 | `memory-janitor` | 清理过期 P1/P2，归档并更新索引 |
| 每周 | `l2-to-l1-compact` | 压缩日志为洞察，刷新 `.abstract` |

---

## 6. 常见误区

1. 只上检索工具，不做结构化分层。
2. `.abstract` 过长，索引退化成正文。
3. 不做 TTL，P1/P2 事实长期堆积。
4. 只检索不回写，记忆系统无法进化。

---

## 7. 边界与取舍

文件系统范式并不否定数据库。一个更稳的分工是：

1. 数据库负责事务、约束、审计与权限。
2. 文件系统语义负责 Agent 的认知组织与按需检索。

结论不是“数据库不行”，而是 Agent 记忆层应优先设计成可外置、可恢复、可按需加载的系统；文件系统语义是这个目标的最佳入口。

---

## 8.结语

后续将开源具体实现代码

## 参考资料

1. [Agent 系统中的 Prompt Caching 设计（下）：上下文管理与子代理架构](https://yuanchaofa.com/post/agent-context-management-and-sub-agents)
2. [Context Engineering for AI Agents: Lessons from Building Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
3. [Managing context on the Claude Developer Platform](https://claude.com/blog/context-management)
4. [Create custom subagents (Claude Code Docs)](https://code.claude.com/docs/en/sub-agents)
5. [Unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/)
6. [记忆系统2.0](https://x.com/onehopeA9/status/2024465287588786465)
