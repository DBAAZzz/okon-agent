import 'dotenv/config';
import Fastify from 'fastify';
import { registerMiddlewares } from './middlewares/index.js';
import { registerRoutes } from './routes/index.js';
import { initSessionManager } from './agent/session-manager.js';
import { initMemory } from './capabilities/memory/index.js';
import { createLogger } from '@okon/shared';

const logger = createLogger('server');

// Initialize Fastify
const fastify = Fastify({
  logger: false, // Use our custom logger instead
  routerOptions: {
    maxParamLength: 5000
  }
});

// Register plugins
await fastify.register(import('./plugins/prisma.js'));
await fastify.register(import('./plugins/qdrant.js'));

// Initialize session manager with prisma
initSessionManager(fastify.prisma);

// Initialize memory store with qdrant
initMemory(fastify.qdrant);

// Register middlewares
await registerMiddlewares(fastify);

// Register routes
await registerRoutes(fastify);

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
} catch (err) {
  logger.error('服务器启动失败', err);
  process.exit(1);
}
