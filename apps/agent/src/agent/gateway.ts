import { stepCountIs, ToolLoopAgent } from 'ai'
import type { StreamEvent, ApprovalRequestPart } from '@okon/shared'
import { createLogger } from '@okon/shared'
import { modelRegistry } from './models/index.js'
import { adaptStream } from './events/index.js'
import { sessionManager } from './session-manager.js'
import { memoryStore } from '../capabilities/memory/index.js'
import { buildSystemPrompt } from './prompt.js'
import {
  weatherTool,
  getOutdoorActivitiesTool,
  ipLookupTool,
} from '../tools/index.js'

const logger = createLogger('agent-gateway')

const DEFAULT_MODEL = 'deepseek-chat'

const tools = {
  weather: weatherTool,
  getOutdoorActivities: getOutdoorActivitiesTool,
  ipLookup: ipLookupTool,
}

function createAgent(modelId: string, instructions: string) {
  const model = modelRegistry.get(modelId)
  return new ToolLoopAgent({
    model,
    instructions,
    tools,
    stopWhen: stepCountIs(5),
  })
}

/**
 * 发送新消息并流式返回事件
 */
export async function* chat(
  sessionId: string,
  message: string,
): AsyncGenerator<StreamEvent> {
  // 1. 存用户消息
  await sessionManager.addMessage(sessionId, {
    role: 'user',
    content: message,
  })

  // 2. 获取 session 信息（含 model）
  const session = await sessionManager.getOrCreate(sessionId)
  const modelId = (session as any).model || DEFAULT_MODEL

  // 3. 获取历史 + 搜索记忆 + 创建 agent + stream
  const history = await sessionManager.getHistory(sessionId)
  const memories = await memoryStore.search(message, { sessionId }, 3)
  logger.info("查询到的memories有：", memories)
  const instructions = buildSystemPrompt({
    memories: memories.map((m) => m.content),
  })
  const agent = createAgent(modelId, instructions)

  logger.info('开始流式响应', { sessionId, model: modelId })
  const result = await agent.stream({ messages: history })

  // 4. 适配 fullStream → StreamEvent
  const pendingApprovals: ApprovalRequestPart[] = []

  for await (const event of adaptStream(result.fullStream)) {
    // 收集审批请求，交给 sessionManager 管理
    if (event.type === 'approval_request') {
      pendingApprovals.push(...event.approvals)
      sessionManager.setPendingApprovals(sessionId, pendingApprovals)
    }
    if (event.type === 'done') {
      logger.info('chat完成，可以进行记忆操作')
    }
    yield event
  }

  // 5. 流结束后存 assistant 消息 + 异步存储记忆
  const response = await result.response
  await sessionManager.addMessages(sessionId, response.messages)

  memoryStore.storeConversation(message, response.messages, { sessionId }).catch((err) => {
    logger.error('记忆存储失败', err)
  })

  logger.info('流式响应完成', { sessionId })
}

/**
 * 审批后继续流式返回
 */
export async function* continueAfterApproval(
  sessionId: string,
): AsyncGenerator<StreamEvent> {
  const session = await sessionManager.getOrCreate(sessionId)
  const modelId = (session as any).model || DEFAULT_MODEL

  const history = await sessionManager.getHistory(sessionId)
  const instructions = buildSystemPrompt()
  const agent = createAgent(modelId, instructions)

  logger.info('审批后继续', { sessionId, model: modelId })
  const result = await agent.stream({ messages: history })

  const pendingApprovals: ApprovalRequestPart[] = []

  for await (const event of adaptStream(result.fullStream)) {
    if (event.type === 'approval_request') {
      pendingApprovals.push(...event.approvals)
      sessionManager.setPendingApprovals(sessionId, pendingApprovals)
    }
    yield event
  }

  const response = await result.response
  await sessionManager.addMessages(sessionId, response.messages)

  logger.info('继续响应完成', { sessionId })
}
