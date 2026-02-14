import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

export async function registerCors(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
  });
}
