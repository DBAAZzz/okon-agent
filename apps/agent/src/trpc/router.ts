import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';
import { sessionManager } from '../agent/session-manager.js';
import { modelRegistry } from '../agent/models/index.js';

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
