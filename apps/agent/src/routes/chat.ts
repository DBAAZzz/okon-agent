import type { FastifyInstance } from 'fastify'
import { createLogger } from '@okon/shared'
import * as gateway from '../agent/gateway.js'
import { setSSEHeaders, setUIMessageStreamHeaders, pipeEvents, pipeUIMessageChunks } from './sse.js'
import { resolveRequestContext, type ChatPostBody } from './ui-message.js'

const logger = createLogger('chat-routes')

export async function registerChatRoutes(fastify: FastifyInstance) {
  // UI Message Stream（供前端 useChat 使用）
  fastify.post('/api/chat', async (request, reply) => {
    const body = request.body as ChatPostBody
    const { sessionId, messages } = body

    if (!sessionId || !Array.isArray(messages)) {
      reply.code(400).send({ error: 'Missing sessionId or messages' })
      return
    }

    // 解析请求上下文：处理审批、判断请求类型、提取用户消息
    const ctx = await resolveRequestContext(sessionId, body)
    if (!ctx) {
      reply.code(400).send({ error: 'Missing user text message' })
      return
    }

    try {
      // 启动 agent 流
      const agentStream = await gateway.runAgent(sessionId, ctx.userMessage)
      logger.info('开始 UI 流式响应', { sessionId, model: agentStream.modelId })

      // 通过 UI Message Stream 协议推送给前端
      setUIMessageStreamHeaders(reply)
      await pipeUIMessageChunks(
        reply,
        agentStream.result.toUIMessageStream({ originalMessages: messages as any })
      )

      // 收尾：存消息、处理审批、存记忆
      await gateway.finalizeStream(sessionId, agentStream)
    } catch (err) {
      logger.error('UI 流式响应失败', err)
      if (!reply.raw.writableEnded) {
        reply.code(500).send({ error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
  })

  // SSE：新消息
  fastify.get('/api/chat/stream', async (request, reply) => {
    const { sessionId, message } = request.query as { sessionId?: string; message?: string }
    if (!sessionId || !message) {
      reply.code(400).send({ error: 'Missing sessionId or message' })
      return
    }

    setSSEHeaders(reply)
    await pipeEvents(reply, gateway.chat(sessionId, message))
  })

  // SSE：审批后继续
  fastify.get('/api/chat/continue', async (request, reply) => {
    const { sessionId } = request.query as { sessionId?: string }
    if (!sessionId) {
      reply.code(400).send({ error: 'Missing sessionId' })
      return
    }

    setSSEHeaders(reply)
    await pipeEvents(reply, gateway.continueAfterApproval(sessionId))
  })
}
