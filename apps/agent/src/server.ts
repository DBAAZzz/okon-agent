import 'dotenv/config';
import Fastify from 'fastify';
import { registerMiddlewares } from './middlewares/index.js';
import { registerRoutes } from './routes/index.js';
import { initSessionManager, sessionManager } from './agent/session-manager.js';
import { initMemory } from './capabilities/memory/index.js';
import { initKnowledgeStore, knowledgeStore } from './capabilities/knowledge/index.js';
import { createEmbeddings } from './capabilities/embeddings/index.js';
import { initChannelManager } from './channel/index.js';
import { initScheduler } from './capabilities/scheduler/index.js';
import { runAgent, finalizeStream } from './agent/gateway.js';
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

// Initialize scheduler with deps for agent-turn and channel-message
const sched = initScheduler({
  async runAgentTurn(botId, prompt, sessionId) {
    const bot = await fastify.prisma.bot.findUniqueOrThrow({ where: { id: botId } });
    const session = sessionId
      ? await sessionManager.getOrCreate(sessionId, botId)
      : await sessionManager.getOrCreate(undefined, botId, 'scheduler');
    const agentStream = await runAgent(session.id, prompt, {
      historyLimit: 0,
      bot: { id: bot.id, provider: bot.provider, model: bot.model, systemPrompt: bot.systemPrompt, apiKey: bot.apiKey, baseURL: bot.baseURL },
      knowledgeStore,
    });
    const response = await agentStream.result.response;
    await finalizeStream(session.id, agentStream);
    // 提取 assistant 响应文本
    const texts: string[] = [];
    for (const msg of response.messages) {
      if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) texts.push(part.text);
      }
    }
    return texts.join('\n') || '（无响应）';
  },
  async sendChannelMessage(configId, externalChatId, text) {
    await cm.sendMessage(configId, externalChatId, text);
  },
  async sendToSession(deliverySessionId, text) {
    const mapping = await fastify.prisma.channelMapping.findFirst({
      where: { sessionId: deliverySessionId },
    });
    if (mapping) {
      await cm.sendMessage(mapping.channelConfigId, mapping.externalChatId, text);
    } else {
      logger.warn('未找到 session 对应的 channel mapping，消息无法投递', { deliverySessionId });
    }
  },
});
sched.registerHandler('memory:cleanup', async (job) => {
  await memoryStore.cleanExpiredForAllBots();
});

// Register middlewares
await registerMiddlewares(fastify);

// Register routes
await registerRoutes(fastify);

// Start server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Graceful shutdown: stop channel adapters and scheduler
fastify.addHook('onClose', async () => {
  await sched.stop();
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

  // Start scheduler after server is listening
  await sched.start();
  console.log(`⏰ Scheduler started`);
} catch (err) {
  logger.error('服务器启动失败', err);
  process.exit(1);
}
