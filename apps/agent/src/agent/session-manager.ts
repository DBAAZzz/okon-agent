import type { ModelMessage, ToolApprovalResponse } from 'ai';
import type { ApprovalRequestPart } from '@okon/shared';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '@okon/shared';

const logger = createLogger('session-manager');

type MessagePart = any;

function getMessageParts(message: ModelMessage): MessagePart[] {
  return Array.isArray((message as any).content) ? ((message as any).content as MessagePart[]) : [];
}

function sanitizeHistoryForProvider(messages: ModelMessage[]): {
  messages: ModelMessage[];
  droppedCount: number;
} {
  const pendingToolCalls = new Set<string>();
  const pendingApprovals = new Set<string>();
  const sanitized: ModelMessage[] = [];
  let droppedCount = 0;

  for (const message of messages) {
    if (message.role === 'assistant') {
      const parts = getMessageParts(message);
      for (const part of parts) {
        if (part.type === 'tool-call') {
          const toolCallId = part.toolCallId ?? part.id;
          if (toolCallId) pendingToolCalls.add(toolCallId);
        }

        if (part.type === 'tool-approval-request') {
          const approvalId = part.approvalId;
          if (approvalId) pendingApprovals.add(approvalId);
        }
      }
      sanitized.push(message);
      continue;
    }

    if (message.role === 'tool') {
      const parts = getMessageParts(message);
      const validParts = parts.filter((part) => {
        if (part.type === 'tool-result') {
          const toolCallId = part.toolCallId ?? part.id;
          if (!toolCallId || !pendingToolCalls.has(toolCallId)) return false;
          pendingToolCalls.delete(toolCallId);
          return true;
        }

        if (part.type === 'tool-approval-response') {
          const approvalId = part.approvalId;
          if (!approvalId || !pendingApprovals.has(approvalId)) return false;
          pendingApprovals.delete(approvalId);
          return true;
        }

        return false;
      });

      if (validParts.length > 0) {
        sanitized.push({
          ...message,
          content: validParts as any,
        });
      } else {
        droppedCount += 1;
      }
      continue;
    }

    sanitized.push(message);
  }

  return { messages: sanitized, droppedCount };
}

function hasApprovalRequestInHistory(messages: ModelMessage[], approvalId: string): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant') continue;

    const parts = getMessageParts(message);
    for (const part of parts) {
      if (part.type !== 'tool-approval-request') continue;
      if (part.approvalId === approvalId) return true;
    }
  }
  return false;
}

export class SessionManager {
  /** pendingApprovals 是临时状态，不需要持久化 */
  private pendingApprovals = new Map<number, ApprovalRequestPart[]>();
  /** 审批中断时暂存的 agent 响应消息，等审批完成后再持久化 */
  private pendingMessages = new Map<number, ModelMessage[]>();

  constructor(private prisma: PrismaClient) {}

  async getOrCreate(sessionId?: number, botId?: number, source = 'web') {
    if (sessionId) {
      const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
      if (session) return session;
    }

    const session = await this.prisma.session.create({
      data: { source, ...(botId && { botId }) },
    });
    logger.info('创建新会话', { sessionId: session.id, source, botId });
    return session;
  }

  async getHistory(sessionId: number, limit = 20, windowMinutes = 24 * 60): Promise<ModelMessage[]> {
    if (limit <= 0) {
      return [];
    }

    const since = new Date(Date.now() - windowMinutes * 60_000);
    const fetchLimit = Math.max(limit * 5, 100);
    const rows = await this.prisma.message.findMany({
      where: { sessionId, createdAt: { gte: since } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: fetchLimit,
    });

    const chronological = rows.reverse().map((m) => m.content as unknown as ModelMessage);
    const sanitized = sanitizeHistoryForProvider(chronological);
    const sliced =
      sanitized.messages.length > limit
        ? sanitized.messages.slice(-limit)
        : sanitized.messages;
    const finalSanitized = sanitizeHistoryForProvider(sliced);

    const dropped = sanitized.droppedCount + finalSanitized.droppedCount;
    if (dropped > 0) {
      logger.warn('检测到并忽略不合法工具消息，避免模型请求失败', {
        sessionId,
        dropped,
        requestedLimit: limit,
        fetched: rows.length,
        returned: finalSanitized.messages.length,
      });
    }

    return finalSanitized.messages;
  }

  async addMessage(sessionId: number, message: ModelMessage): Promise<void> {
    await this.prisma.message.create({
      data: {
        sessionId,
        role: message.role,
        content: message as any,
      },
    });
    logger.debug('添加消息到历史', { sessionId, role: message.role });
  }

  async addMessages(sessionId: number, messages: ModelMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const baseTime = Date.now();
    await this.prisma.message.createMany({
      data: messages.map((m, index) => ({
        sessionId,
        role: m.role,
        content: m as any,
        // ensure deterministic ordering for multi-message batches
        createdAt: new Date(baseTime + index),
      })),
    });
    logger.debug('添加多条消息到历史', { sessionId, count: messages.length });
  }

  setPendingApprovals(sessionId: number, approvals: ApprovalRequestPart[]): void {
    this.pendingApprovals.set(sessionId, approvals);
    logger.info('设置待审批请求', { sessionId, count: approvals.length });
  }

  getPendingApprovals(sessionId: number): ApprovalRequestPart[] {
    return this.pendingApprovals.get(sessionId) || [];
  }

  clearPendingApprovals(sessionId: number): void {
    this.pendingApprovals.delete(sessionId);
    logger.debug('清除待审批请求', { sessionId });
  }

  /** 暂存审批中断时的 agent 响应消息 */
  setPendingMessages(sessionId: number, messages: ModelMessage[]): void {
    this.pendingMessages.set(sessionId, messages);
    logger.debug('暂存待审批消息', { sessionId, count: messages.length });
  }

  /** 取出并清除暂存的消息 */
  takePendingMessages(sessionId: number): ModelMessage[] {
    const messages = this.pendingMessages.get(sessionId) || [];
    this.pendingMessages.delete(sessionId);
    return messages;
  }

  async handleApproval(
    sessionId: number,
    approvalId: string,
    approved: boolean,
    reason?: string,
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

    const toolMessage: ModelMessage = {
      role: 'tool',
      content: [response],
    };
    const pendingMessages = this.takePendingMessages(sessionId);

    if (pendingMessages.length > 0) {
      await this.addMessages(sessionId, [...pendingMessages, toolMessage]);
    } else {
      const history = await this.getHistory(sessionId, 120);
      const hasRequest = hasApprovalRequestInHistory(history, approvalId);

      if (!hasRequest) {
        throw new Error(
          `Approval ${approvalId} has no matching tool-approval-request in session ${sessionId}`,
        );
      }

      await this.addMessage(sessionId, toolMessage);
    }

    const remaining = approvals.filter((a) => a.approvalId !== approvalId);
    if (remaining.length > 0) {
      this.pendingApprovals.set(sessionId, remaining);
    } else {
      this.clearPendingApprovals(sessionId);
    }

    logger.info('审批响应已添加到历史，等待继续执行', {
      sessionId,
      remainingApprovals: remaining.length,
    });
  }

  async deleteSession(sessionId: number): Promise<boolean> {
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
