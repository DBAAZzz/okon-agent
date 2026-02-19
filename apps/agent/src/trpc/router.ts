import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';
import { sessionManager } from '../agent/session-manager.js';
import { channelManager } from '../channel/index.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({
  session: router({
    // 获取会话列表（仅 web 来源）
    list: publicProcedure.query(async ({ ctx }) => {
      return ctx.req.server.prisma.session.findMany({
        where: { source: 'web' },
        orderBy: { updatedAt: 'desc' },
        include: { bot: { select: { id: true, name: true } } },
      });
    }),

    // 创建会话
    create: publicProcedure
      .input(z.object({
        botId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const session = await sessionManager.getOrCreate(undefined, input.botId);
        return ctx.req.server.prisma.session.findUniqueOrThrow({
          where: { id: session.id },
          include: { bot: true },
        });
      }),

    // 删除会话
    delete: publicProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ input }) => {
        const deleted = await sessionManager.deleteSession(input.sessionId);
        return { success: deleted };
      }),
  }),

  chat: router({
    // 获取会话历史
    getHistory: publicProcedure
      .input(z.object({
        sessionId: z.number()
      }))
      .query(async ({ input }) => {
        return {
          history: await sessionManager.getHistory(input.sessionId)
        };
      }),
  }),

  approval: router({
    // 处理审批响应
    respond: publicProcedure
      .input(z.object({
        sessionId: z.number(),
        approvalId: z.string(),
        approved: z.boolean(),
        reason: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        await sessionManager.handleApproval(
          input.sessionId,
          input.approvalId,
          input.approved,
          input.reason
        );

        return { success: true, shouldContinue: true };
      }),
  }),

  channel: router({
    // 列出 channel 配置（可选按 botId 筛选）
    list: publicProcedure
      .input(z.object({ botId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        return ctx.req.server.prisma.channelConfig.findMany({
          where: input?.botId ? { botId: input.botId } : undefined,
          orderBy: { createdAt: 'desc' },
        });
      }),

    // 创建或更新 channel 配置（按 botId 匹配，同时热启停适配器）
    upsert: publicProcedure
      .input(z.object({
        botId: z.number(),
        platform: z.string(),
        name: z.string(),
        config: z.record(z.string(), z.string()),
        enabled: z.boolean().optional().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await ctx.req.server.prisma.channelConfig.upsert({
          where: { botId: input.botId },
          create: {
            botId: input.botId,
            platform: input.platform,
            name: input.name,
            config: input.config,
            enabled: input.enabled,
          },
          update: {
            platform: input.platform,
            name: input.name,
            config: input.config,
            enabled: input.enabled,
          },
        });

        // 热启停：enabled 则启动/重启，disabled 则停止
        if (input.enabled) {
          await channelManager.stopOne(result.id).catch(() => {});
          await channelManager.startOne(result.id, result.platform, result.config as Record<string, any>, input.botId);
        } else {
          await channelManager.stopOne(result.id);
        }

        return result;
      }),

    // 删除 channel 配置
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await channelManager.stopOne(input.id);
        await ctx.req.server.prisma.channelConfig.delete({
          where: { id: input.id },
        });
        return { success: true };
      }),
  }),

  bot: router({
    // 列出所有 Bot
    list: publicProcedure.query(async ({ ctx }) => {
      return ctx.req.server.prisma.bot.findMany({ orderBy: { createdAt: 'desc' } });
    }),

    // 创建 Bot
    create: publicProcedure
      .input(z.object({
        name: z.string(),
        provider: z.string().default('deepseek'),
        model: z.string(),
        baseURL: z.string().optional(),
        apiKey: z.string().min(1, 'apiKey is required'),
        systemPrompt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.req.server.prisma.bot.create({ data: input });
      }),

    // 删除 Bot
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await ctx.req.server.prisma.bot.delete({ where: { id: input.id } });
        return { success: true };
      }),
  }),

  embeddings: router({
    // 添加文档
    add: publicProcedure
      .input(z.object({
        content: z.string(),
        metadata: z.record(z.string(), z.any()).optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const doc = await ctx.embeddings.addDocument(input.content, input.metadata);
        return { success: true, id: doc.id };
      }),

    // 搜索文档
    search: publicProcedure
      .input(z.object({
        query: z.string(),
        topK: z.number().optional().default(5),
        mode: z.enum(['dense', 'sparse', 'hybrid']).optional().default('hybrid')
      }))
      .query(async ({ input, ctx }) => {
        const results = await ctx.embeddings.search(input.query, input.topK, input.mode);
        return {
          query: input.query,
          mode: input.mode,
          results: results.map(r => ({
            content: r.point.payload.content,
            score: r.score,
            metadata: r.point.payload.metadata
          }))
        };
      }),
  }),

  knowledgeBase: router({
    // 列出所有知识库
    list: publicProcedure.query(async ({ ctx }) => {
      return ctx.knowledgeStore.list();
    }),

    // 获取知识库详情
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return ctx.knowledgeStore.get(input.id);
      }),

    // 创建知识库
    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.knowledgeStore.create(input.name, input.description);
      }),

    // 删除知识库
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await ctx.knowledgeStore.delete(input.id);
        return { success: true };
      }),

    // 添加文档到知识库
    addDocument: publicProcedure
      .input(z.object({
        knowledgeBaseId: z.number(),
        content: z.string().min(1),
        title: z.string().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.knowledgeStore.addDocument(
          input.knowledgeBaseId,
          input.content,
          input.title,
          input.metadata,
        );
      }),

    // 删除文档
    deleteDocument: publicProcedure
      .input(z.object({ documentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const deleted = await ctx.knowledgeStore.deleteDocument(input.documentId);
        return { success: deleted };
      }),

    // 列出知识库中的文档
    listDocuments: publicProcedure
      .input(z.object({ knowledgeBaseId: z.number() }))
      .query(async ({ input, ctx }) => {
        return ctx.knowledgeStore.listDocuments(input.knowledgeBaseId);
      }),

    // 搜索知识库文档
    search: publicProcedure
      .input(z.object({
        knowledgeBaseId: z.number(),
        query: z.string(),
        topK: z.number().optional().default(5),
        mode: z.enum(['dense', 'sparse', 'hybrid']).optional().default('hybrid'),
      }))
      .query(async ({ input, ctx }) => {
        return ctx.knowledgeStore.search(
          input.knowledgeBaseId,
          input.query,
          input.topK,
          input.mode,
        );
      }),

    // 绑定 Bot 到知识库
    bindBot: publicProcedure
      .input(z.object({
        botId: z.number(),
        knowledgeBaseId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.knowledgeStore.bindBot(input.botId, input.knowledgeBaseId);
      }),

    // 解绑 Bot 和知识库
    unbindBot: publicProcedure
      .input(z.object({
        botId: z.number(),
        knowledgeBaseId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        await ctx.knowledgeStore.unbindBot(input.botId, input.knowledgeBaseId);
        return { success: true };
      }),

    // 获取 Bot 绑定的知识库列表
    getBotKnowledgeBases: publicProcedure
      .input(z.object({ botId: z.number() }))
      .query(async ({ input, ctx }) => {
        return ctx.knowledgeStore.getBotKnowledgeBases(input.botId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
