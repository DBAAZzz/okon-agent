import type { FastifyReply } from 'fastify';
import { sessionManager } from '../agent/session-manager.js';
import { streamToolAgent } from '../agent/tool-agent.js';
import { createLogger } from '@okon/shared';

const logger = createLogger('stream-service');

/**
 * Stream agent response via SSE
 */
export async function streamAgentResponse(
  sessionId: string,
  reply: FastifyReply,
  addUserMessage?: string
) {
  // Set SSE headers
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');

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
      const data = JSON.stringify({ type: 'text', data: chunk });
      reply.raw.write(`data: ${data}\n\n`);
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
      const data = JSON.stringify({ type: 'approval', data: approvalData });
      reply.raw.write(`data: ${data}\n\n`);
      logger.info('发送审批请求', { sessionId, count: approvals.length });
    }

    // Send completion event
    const doneData = JSON.stringify({ type: 'done' });
    reply.raw.write(`data: ${doneData}\n\n`);

    logger.info('SSE 流式响应完成', { sessionId });
  } catch (error) {
    logger.error('SSE 流式响应错误', error);
    const errorData = JSON.stringify({
      type: 'error',
      data: error instanceof Error ? error.message : 'Unknown error'
    });
    reply.raw.write(`data: ${errorData}\n\n`);
  } finally {
    reply.raw.end();
  }
}
