import type { FastifyInstance } from 'fastify';
import { registerCors } from './cors.js';
import { registerTRPC } from './trpc.js';

/**
 * Register all middlewares
 */
export async function registerMiddlewares(fastify: FastifyInstance) {
  await registerCors(fastify);
  await registerTRPC(fastify);
}
