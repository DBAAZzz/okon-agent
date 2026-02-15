import type { FastifyInstance } from 'fastify';
import { streamAgentResponse } from '../services/stream.js';
import { createLogger } from '@okon/shared';

const logger = createLogger('chat-routes');

/**
 * Register chat-related routes
 */
export async function registerChatRoutes(fastify: FastifyInstance) {
  // SSE endpoint for streaming chat (new messages)
  fastify.get('/api/chat/stream', async (request, reply) => {
    const { sessionId, message } = request.query as { sessionId?: string; message?: string };

    if (!sessionId || !message) {
      reply.code(400).send({ error: 'Missing sessionId or message' });
      return;
    }

    logger.info('开始 SSE 流式响应（新消息）', { sessionId, message });
    await streamAgentResponse(sessionId, reply, message);
  });

  // SSE endpoint for continuing after approval
  fastify.get('/api/chat/continue', async (request, reply) => {
    const { sessionId } = request.query as { sessionId?: string };

    if (!sessionId) {
      reply.code(400).send({ error: 'Missing sessionId' });
      return;
    }

    logger.info('继续 SSE 流式响应（审批后）', { sessionId });
    await streamAgentResponse(sessionId, reply);
  });
}
