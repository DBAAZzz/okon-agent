import type { FastifyInstance } from 'fastify';
import { registerChatRoutes } from './chat.js';
import { registerHealthRoutes } from './health.js';
import { registerUploadRoutes } from './upload.js';

/**
 * Register all application routes
 */
export async function registerRoutes(fastify: FastifyInstance) {
  await registerUploadRoutes(fastify);
  await registerChatRoutes(fastify);
  await registerHealthRoutes(fastify);
}
