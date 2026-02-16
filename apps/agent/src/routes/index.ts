import type { FastifyInstance } from 'fastify';
import { registerChatRoutes } from './chat.js';
import { registerHealthRoutes } from './health.js';

/**
 * Register all application routes
 */
export async function registerRoutes(fastify: FastifyInstance) {
  await registerChatRoutes(fastify);
  await registerHealthRoutes(fastify);
}
