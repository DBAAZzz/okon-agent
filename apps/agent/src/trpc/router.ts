import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';
import { sessionManager } from '../agent/session-manager.js';
import { modelRegistry } from '../agent/models/index.js';
import { channelManager } from '../channel/index.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({
  session: router({
    // 获取会话列表
    list: publicProcedure.query(async () => {
      return sessionManager.getAllSessions();
    }),

    // 创建会话
    create: publicProcedure
      .input(z.object({
        id: z.string().optional(),
        title: z.string().optional(),
        model: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const session = await sessionManager.getOrCreate(
          input.id ?? crypto.randomUUID(),
          input.model,
        );
        return session;
      }),

    // 获取可用模型列表
    models: publicProcedure.query(() => {
      return modelRegistry.listIds();
    }),

    // 删除会话
    delete: publicProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ input }) => {
        const deleted = await sessionManager.deleteSession(input.sessionId);
        return { success: deleted };
      }),
  }),

  chat: router({
    // 获取会话历史
    getHistory: publicProcedure
      .input(z.object({
        sessionId: z.string()
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
        sessionId: z.string(),
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
    // 列出所有 channel 配置
    list: publicProcedure.query(async ({ ctx }) => {
      return ctx.req.server.prisma.channelConfig.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }),

    // 创建或更新 channel 配置（同时热启停适配器）
    upsert: publicProcedure
      .input(z.object({
        platform: z.string(),
        name: z.string(),
        config: z.record(z.string(), z.string()),
        enabled: z.boolean().optional().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await ctx.req.server.prisma.channelConfig.upsert({
          where: { platform: input.platform },
          create: {
            platform: input.platform,
            name: input.name,
            config: input.config,
            enabled: input.enabled,
          },
          update: {
            name: input.name,
            config: input.config,
            enabled: input.enabled,
          },
        });

        // 热启停：enabled 则启动/重启，disabled 则停止
        if (input.enabled) {
          await channelManager.stopOne(result.id).catch(() => {});
          await channelManager.startOne(result.id, result.platform, result.config as Record<string, any>);
        } else {
          await channelManager.stopOne(result.id);
        }

        return result;
      }),

    // 删除 channel 配置
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await channelManager.stopOne(input.id);
        await ctx.req.server.prisma.channelConfig.delete({
          where: { id: input.id },
        });
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
});

export type AppRouter = typeof appRouter;
