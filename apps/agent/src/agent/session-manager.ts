import type { ModelMessage, ToolApprovalResponse } from 'ai';
import type { ApprovalRequestPart } from '@okon/shared';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '@okon/shared';

const logger = createLogger('session-manager');

export class SessionManager {
  /** pendingApprovals 是临时状态，不需要持久化 */
  private pendingApprovals = new Map<string, ApprovalRequestPart[]>();

  constructor(private prisma: PrismaClient) {}

  async getOrCreate(sessionId: string, model?: string) {
    let session = await this.prisma.session.findUnique({ where: { id: sessionId } });

    if (!session) {
      session = await this.prisma.session.create({
        data: { id: sessionId, ...(model && { model }) },
      });
      logger.info('创建新会话', { sessionId, model });
    }

    return session;
  }

  async getHistory(sessionId: string, limit = 20, windowMinutes = 24 * 60): Promise<ModelMessage[]> {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const messages = await this.prisma.message.findMany({
      where: { sessionId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return messages.reverse().map((m) => m.content as unknown as ModelMessage);
  }

  async addMessage(sessionId: string, message: ModelMessage): Promise<void> {
    await this.getOrCreate(sessionId);
    await this.prisma.message.create({
      data: {
        sessionId,
        role: message.role,
        content: message as any,
      },
    });
    logger.debug('添加消息到历史', { sessionId, role: message.role });
  }

  async addMessages(sessionId: string, messages: ModelMessage[]): Promise<void> {
    await this.getOrCreate(sessionId);
    await this.prisma.message.createMany({
      data: messages.map((m) => ({
        sessionId,
        role: m.role,
        content: m as any,
      })),
    });
    logger.debug('添加多条消息到历史', { sessionId, count: messages.length });
  }

  setPendingApprovals(sessionId: string, approvals: ApprovalRequestPart[]): void {
    this.pendingApprovals.set(sessionId, approvals);
    logger.info('设置待审批请求', { sessionId, count: approvals.length });
  }

  getPendingApprovals(sessionId: string): ApprovalRequestPart[] {
    return this.pendingApprovals.get(sessionId) || [];
  }

  clearPendingApprovals(sessionId: string): void {
    this.pendingApprovals.delete(sessionId);
    logger.debug('清除待审批请求', { sessionId });
  }

  async handleApproval(
    sessionId: string,
    approvalId: string,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    const approvals = this.getPendingApprovals(sessionId);
    const approval = approvals.find((a) => a.approvalId === approvalId);

    if (!approval) {
      throw new Error(`Approval ${approvalId} not found in session ${sessionId}`);
    }

    logger.info('处理审批响应', { sessionId, approvalId, approved });

    const response: ToolApprovalResponse = {
      type: 'tool-approval-response',
      approvalId,
      approved,
      reason: reason || (approved ? 'User approved' : 'User denied'),
    };

    await this.addMessage(sessionId, {
      role: 'tool',
      content: [response],
    });

    this.clearPendingApprovals(sessionId);
    logger.info('审批响应已添加到历史，等待继续执行', { sessionId });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      await this.prisma.session.delete({ where: { id: sessionId } });
      this.pendingApprovals.delete(sessionId);
      logger.info('删除会话', { sessionId });
      return true;
    } catch {
      return false;
    }
  }

  async getAllSessions() {
    return this.prisma.session.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async getSessionCount(): Promise<number> {
    return this.prisma.session.count();
  }
}

// 延迟初始化：在 server.ts 中 prisma 插件注册后调用
export let sessionManager: SessionManager;

export function initSessionManager(prisma: PrismaClient) {
  sessionManager = new SessionManager(prisma);
  return sessionManager;
}
