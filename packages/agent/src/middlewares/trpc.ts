import type { FastifyInstance } from 'fastify';
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import { appRouter } from '../trpc/router.js';
import { createContext } from '../trpc/context.js';

export async function registerTRPC(fastify: FastifyInstance) {
  const trpcOptions = {
    router: appRouter,
    createContext,
  } satisfies FastifyTRPCPluginOptions<typeof appRouter>['trpcOptions'];

  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions,
  });
}
