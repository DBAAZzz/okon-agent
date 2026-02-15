import 'dotenv/config';
import Fastify from 'fastify';
import { registerMiddlewares } from './middlewares/index.js';
import { sessionManager } from './agent/session-manager.js';
import { streamToolAgent } from './agent/tool-agent.js';
import {
  extractStructuredPdfInputSchema,
  streamStructuredPdfData
} from './agent/pdf-structured-extractor.js';
import { createLogger } from '@okon/shared';

const logger = createLogger('server');

const fastify = Fastify({
  logger: false, // Use our custom logger instead
  routerOptions: {
    maxParamLength: 5000
  }
});

function setSseHeaders(reply: any) {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
}

function writeSseEvent(reply: any, event: unknown) {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

// Register middlewares
await registerMiddlewares(fastify);

// Helper function to stream agent response
async function streamAgentResponse(
  sessionId: string,
  reply: any,
  addUserMessage?: string
) {
  setSseHeaders(reply);

  // Add user message if provided
  if (addUserMessage) {
    sessionManager.addMessage(sessionId, {
      role: 'user',
      content: addUserMessage
    });
  }

  try {
    // Get agent stream
    const result = await streamToolAgent(sessionManager.getHistory(sessionId));

    // Stream text chunks
    for await (const chunk of result.textStream) {
      writeSseEvent(reply, { type: 'text', data: chunk });
    }

    // Get final content
    const content = await result.content;
    const response = await result.response;

    // Add assistant response to history
    sessionManager.addMessages(sessionId, response.messages);

    // Check for approval requests
    const approvals = content.filter(
      (part) =>
        typeof part === 'object' && part !== null && 'type' in part && part.type === 'tool-approval-request'
    );

    if (approvals.length > 0) {
      // Convert to our simplified format for the client
      const approvalData = approvals.map((part: any) => ({
        type: 'tool-approval-request',
        approvalId: part.approvalId,
        toolCall: {
          toolName: part.toolCall?.toolName || 'unknown',
          input: part.toolCall?.input || {}
        }
      }));

      sessionManager.setPendingApprovals(sessionId, approvalData as any);
      writeSseEvent(reply, { type: 'approval', data: approvalData });
      logger.info('发送审批请求', { sessionId, count: approvals.length });
    }

    // Send completion event
    writeSseEvent(reply, { type: 'done' });

    logger.info('SSE 流式响应完成', { sessionId });
  } catch (error) {
    logger.error('SSE 流式响应错误', error);
    writeSseEvent(reply, {
      type: 'error',
      data: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    reply.raw.end();
  }
}

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

fastify.post('/api/pdf/extract-structured/stream', async (request, reply) => {
  const parsed = extractStructuredPdfInputSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    reply.code(400);
    return {
      error: 'INVALID_INPUT',
      details: parsed.error.issues
    };
  }

  setSseHeaders(reply);
  writeSseEvent(reply, { type: 'start' });

  try {
    const result = await streamStructuredPdfData(parsed.data, {
      onStatus: async (status) => {
        writeSseEvent(reply, { type: 'status', data: status });
      },
      onPartial: async (partial) => {
        writeSseEvent(reply, { type: 'partial', data: partial });
      }
    });

    writeSseEvent(reply, { type: 'result', data: result });
    writeSseEvent(reply, { type: 'done' });
  } catch (error) {
    logger.error('PDF 结构化 SSE 失败', error);
    writeSseEvent(reply, {
      type: 'error',
      data: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    reply.raw.end();
  }
});

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', sessions: sessionManager.getSessionCount() };
});

// Start server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  logger.info(`服务器启动成功`, { port: PORT, host: HOST });
  console.log(`✨ Agent server running at http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 tRPC endpoint: http://localhost:${PORT}/trpc`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/api/chat/stream`);
  console.log(`📄 PDF SSE endpoint: http://localhost:${PORT}/api/pdf/extract-structured/stream`);
} catch (err) {
  logger.error('服务器启动失败', err);
  process.exit(1);
}
