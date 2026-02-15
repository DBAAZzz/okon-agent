import type { FastifyInstance } from 'fastify';
import { sessionManager } from '../agent/session-manager.js';

/**
 * Register health check routes
 */
export async function registerHealthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      sessions: sessionManager.getSessionCount()
    };
  });
}
