import 'dotenv/config';
import Fastify from 'fastify';
import { registerMiddlewares } from './middlewares/index.js';
import { registerRoutes } from './routes/index.js';
import { initSessionManager } from './agent/session-manager.js';
import { initMemory } from './capabilities/memory/index.js';
import { initKnowledgeStore } from './capabilities/knowledge/index.js';
import { createEmbeddings } from './capabilities/embeddings/index.js';
import { initChannelManager } from './channel/index.js';
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

// Initialize file-based memory store
const memoryStore = initMemory();
memoryStore.cleanExpiredForAllBots().catch((err) => {
  logger.warn('启动时清理过期记忆失败，继续启动服务', err);
});

// Initialize knowledge store with prisma + qdrant + embeddings
const embeddings = createEmbeddings(fastify.qdrant);
initKnowledgeStore(fastify.prisma as any, fastify.qdrant, embeddings);

// Initialize channel manager with prisma
const cm = initChannelManager(fastify.prisma);

// Register middlewares
await registerMiddlewares(fastify);

// Register routes
await registerRoutes(fastify);

// Start server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Graceful shutdown: stop channel adapters
fastify.addHook('onClose', async () => {
  await cm.stopAll();
});

try {
  await fastify.listen({ port: PORT, host: HOST });
  logger.info(`服务器启动成功`, { port: PORT, host: HOST });
  console.log(`✨ Agent server running at http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 tRPC endpoint: http://localhost:${PORT}/trpc`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/api/chat/stream`);

  // Start channel adapters after server is listening
  await cm.startAll();
  console.log(`📨 Channel adapters started`);
} catch (err) {
  logger.error('服务器启动失败', err);
  process.exit(1);
}
