import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';
import { sessionManager } from '../agent/session-manager.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({
  chat: router({
    // 获取会话历史
    getHistory: publicProcedure
      .input(z.object({
        sessionId: z.string()
      }))
      .query(({ input }) => {
        return {
          history: sessionManager.getHistory(input.sessionId)
        };
      }),
  }),

  approval: router({
    // 处理审批响应
    respond: publicProcedure
      .input(z.object({
        /** 会话Id */
        sessionId: z.string(),
        approvalId: z.string(),
        approved: z.boolean(),
        reason: z.string().optional()
      }))
      .mutation(({ input }) => {
        sessionManager.handleApproval(
          input.sessionId,
          input.approvalId,
          input.approved,
          input.reason
        );

        // 返回成功标志，客户端应该重新建立 SSE 连接继续接收响应
        return { success: true, shouldContinue: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
