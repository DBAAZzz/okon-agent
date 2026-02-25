import { randomUUID } from 'node:crypto'
import type { ModelMessage } from 'ai'
import type { StreamEvent } from '@okon/shared'
import { createLogger } from '@okon/shared'
import { adaptStream } from './events/index.js'
import { collectApprovalRequests } from './approval/index.js'
import { createAgentWithCredentials } from './factory.js'
import { sessionManager } from './session-manager.js'
import { memoryStore } from '../capabilities/memory/index.js'
import { buildSystemPrompt } from './prompt/index.js'
import type { KnowledgeStore } from '../capabilities/knowledge/knowledge-store.js'
import {
  estimateTokens,
  estimateTextTokens,
  generateCompactionSummary,
} from './compaction/index.js'

const logger = createLogger('agent-gateway')

/** runAgent 的返回值 */
export type AgentStreamResult = {
  /** ToolLoopAgent.stream() 的返回值 */
  result: any
  modelId: string
  userMessage?: string
  runId: string
  provider: string
}

export type RunAgentOptions = {
  historyLimit?: number
  /** Bot 配置：provider、model、systemPrompt、以及可选的自定义凭证 */
  bot: {
    id?: number
    provider: string
    model: string
    systemPrompt?: string | null
    apiKey?: string | null
    baseURL?: string | null
  }
  /** 知识库服务实例，用于 RAG 检索 */
  knowledgeStore?: KnowledgeStore
}

/**
 * 各模型的最大 input token 数
 * compact 阈值 = maxInputTokens × 0.75（留 25% 给 system prompt + output）
 */
const MODEL_MAX_INPUT_TOKENS: Record<string, number> = {
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4': 8000,
  'gpt-3.5-turbo': 16000,
}
const DEFAULT_MAX_INPUT_TOKENS = 32000

function getCompactThreshold(modelId: string): number {
  const max = MODEL_MAX_INPUT_TOKENS[modelId] ?? DEFAULT_MAX_INPUT_TOKENS
  return Math.floor(max * 0.75)
}

/**
 * system prompt + RAG 文档 + memories + 工具描述等固定开销的预设 token 预算
 * 这些内容通过 ToolLoopAgent 的 instructions 参数传入，不在 messages 数组中，
 * 但会占用模型上下文窗口，需要预留空间
 *
 * 组成估算：
 * - BASE_INSTRUCTIONS / botPrompt: ~500 tokens
 * - RAG 知识库文档（MAX_CONTEXT_CHARS=4000）: ~1300 tokens
 * - memories（最多 3 条）: ~200 tokens
 * - 工具定义（weather/research/planner 等 JSON schema）: ~1000 tokens
 * 合计约 3000 tokens，取整为保守值
 */
const SYSTEM_PROMPT_BUDGET = 3000

/**
 * 准备并启动 agent 流 — 共用的编排逻辑
 * 存用户消息 → 取历史 → 搜记忆 → 建 prompt → 创建 agent → 启动 stream
 */
export async function runAgent(
  sessionId: number,
  userMessage: string | undefined,
  options: RunAgentOptions,
): Promise<AgentStreamResult> {
  if (userMessage) {
    await sessionManager.addMessage(sessionId, {
      role: 'user',
      content: userMessage,
    })
  }

  await sessionManager.getOrCreate(sessionId)
  if (!options.bot) {
    throw new Error('Bot configuration is required')
  }
  const modelId = options.bot.model
  let history: ModelMessage[] = []

  if (options.historyLimit === 0) {
    if (userMessage) {
      history = [{ role: 'user', content: userMessage }]
    }
  } else {
    history = await sessionManager.getHistory(sessionId)
  }

  const compactThreshold = getCompactThreshold(modelId)
  const estimated = estimateTokens(history) + SYSTEM_PROMPT_BUDGET

  logger.info('当前上下文 token 估算', {
    sessionId,
    estimatedTokens: estimated,
    threshold: compactThreshold,
    historyCount: history.length,
  })

  if (estimated > compactThreshold) {
    logger.info('上下文超过阈值，触发 compact', {
      sessionId,
      estimatedTokens: estimated,
      threshold: compactThreshold,
      historyCount: history.length,
    })

    try {
      const compacted = await sessionManager.compactOldMessages(
        sessionId,
        0,
        (messages) =>
          generateCompactionSummary(messages, {
            provider: options.bot.provider,
            model: options.bot.model,
            apiKey: options.bot.apiKey ?? '',
            baseURL: options.bot.baseURL ?? undefined,
          }),
        (text) => estimateTextTokens(text),
      )

      if (compacted) {
        history = await sessionManager.getHistory(sessionId)
        logger.info('compact 后重新加载历史', {
          sessionId,
          newHistoryCount: history.length,
          newEstimatedTokens: estimateTokens(history) + SYSTEM_PROMPT_BUDGET,
        })
      }
    } catch (err) {
      logger.warn('compact 失败，回退到截断最近消息', err)
      const half = Math.max(4, Math.floor(history.length / 2))
      history = history.slice(-half)
    }
  }

  const memories = userMessage ? await memoryStore.recent({ sessionId: String(sessionId) }, 3) : []

  // RAG: 从 Bot 绑定的知识库中检索相关文档，按字符预算截取
  const MAX_CONTEXT_CHARS = 4000
  let knowledgeDocs: { title?: string; content: string }[] = []
  if (userMessage && options.bot.id && options.knowledgeStore) {
    try {
      const allDocs = await options.knowledgeStore.searchForBot(options.bot.id, userMessage, 10)
      let total = 0
      for (const doc of allDocs) {
        total += doc.content.length
        if (total > MAX_CONTEXT_CHARS) break
        knowledgeDocs.push(doc)
      }
    } catch (err) {
      logger.warn('知识库检索失败，跳过 RAG', err)
    }
  }

  const instructions = buildSystemPrompt({
    memories: memories.map((m) => m.content),
    botPrompt: options.bot?.systemPrompt ?? undefined,
    knowledgeDocs,
  })

  const credentials: { apiKey: string; baseURL?: string } = {
    apiKey: options.bot.apiKey ?? '',
  }
  if (options.bot.baseURL) credentials.baseURL = options.bot.baseURL

  const agent = createAgentWithCredentials(options.bot.provider, modelId, instructions, credentials)

  const runId = randomUUID()
  logger.info('启动 agent stream', { sessionId, model: modelId, runId, history })
  const result = await agent.stream({ messages: history })

  return { result, modelId, userMessage, runId, provider: options.bot.provider }
}

/**
 * 流结束后的收尾
 * - 有待审批：暂存消息到内存，不写数据库（避免历史中出现无 tool-result 的 tool-call）
 * - 无待审批：持久化消息 + 异步存记忆
 */
export async function finalizeStream(
  sessionId: number,
  agentStream: AgentStreamResult,
): Promise<void> {
  const response = await agentStream.result.response
  const approvals = collectApprovalRequests(response.messages as ModelMessage[])

  if (approvals.length > 0) {
    // 审批中断：暂存消息，等审批完成后由下一次 finalizeStream 持久化
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

  const totalUsage = await agentStream.result.totalUsage
  if (totalUsage) {
    await sessionManager.recordTokenUsage({
      runId: agentStream.runId,
      sessionId,
      provider: agentStream.provider,
      model: response.modelId ?? agentStream.modelId,
      inputTokens: totalUsage.inputTokens ?? 0,
      outputTokens: totalUsage.outputTokens ?? 0,
      totalTokens:
        totalUsage.totalTokens ??
        (totalUsage.inputTokens ?? 0) + (totalUsage.outputTokens ?? 0),
      providerUsage: totalUsage,
    })
  }

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

// ─── SSE 格式的流式接口（GET 端点使用） ───

/**
 * 发送新消息并流式返回 StreamEvent
 */
export async function* chat(
  sessionId: number,
  message: string,
  options: RunAgentOptions,
): AsyncGenerator<StreamEvent> {
  const agentStream = await runAgent(sessionId, message, options)

  for await (const event of adaptStream(agentStream.result.fullStream)) {
    yield event
  }

  await finalizeStream(sessionId, agentStream)
}

/**
 * 审批后继续流式返回
 */
export async function* continueAfterApproval(
  sessionId: number,
  options: RunAgentOptions,
): AsyncGenerator<StreamEvent> {
  const agentStream = await runAgent(sessionId, undefined, options)

  for await (const event of adaptStream(agentStream.result.fullStream)) {
    yield event
  }

  await finalizeStream(sessionId, agentStream)
}
