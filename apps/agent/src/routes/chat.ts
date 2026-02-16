import type { FastifyInstance } from 'fastify'
import * as gateway from '../agent/gateway.js'
import { createLogger } from '@okon/shared'

const logger = createLogger('chat-routes')

function setSSEHeaders(reply: any) {
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000')
}

async function pipeEvents(reply: any, events: AsyncGenerator<any>) {
  try {
    for await (const event of events) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (err) {
    logger.error('SSE 流错误', err)
    const errorEvent = JSON.stringify({
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    })
    reply.raw.write(`data: ${errorEvent}\n\n`)
  } finally {
    reply.raw.end()
  }
}

export async function registerChatRoutes(fastify: FastifyInstance) {
  // SSE: 新消息
  fastify.get('/api/chat/stream', async (request, reply) => {
    const { sessionId, message } = request.query as { sessionId?: string; message?: string }

    if (!sessionId || !message) {
      reply.code(400).send({ error: 'Missing sessionId or message' })
      return
    }

    logger.info('开始 SSE 流式响应', { sessionId })
    setSSEHeaders(reply)
    await pipeEvents(reply, gateway.chat(sessionId, message))
  })

  // SSE: 审批后继续
  fastify.get('/api/chat/continue', async (request, reply) => {
    const { sessionId } = request.query as { sessionId?: string }

    if (!sessionId) {
      reply.code(400).send({ error: 'Missing sessionId' })
      return
    }

    logger.info('审批后继续 SSE', { sessionId })
    setSSEHeaders(reply)
    await pipeEvents(reply, gateway.continueAfterApproval(sessionId))
  })
}
