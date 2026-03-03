import type { ModelMessage, ToolApprovalResponse } from 'ai';
import type { ApprovalRequestPart } from '@okon/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
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

  async getHistory(sessionId: number): Promise<ModelMessage[]> {
    const latestSummary = await this.prisma.compactionSummary.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    const rows = await this.prisma.message.findMany({
      where: {
        sessionId,
        compactedAt: null,
        ...(latestSummary ? { id: { gt: latestSummary.messageIdTo } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const chronological = rows.map((m) => m.content as unknown as ModelMessage);
    const sanitized = sanitizeHistoryForProvider(chronological);

    const messages: ModelMessage[] = [];
    if (latestSummary) {
      messages.push({
        role: 'user',
        content: `[Previous conversation summary]\n${latestSummary.summary}`,
      } as ModelMessage);
      messages.push({
        role: 'assistant',
        content: 'Understood. I have the context from our previous conversation. How can I help you next?',
      } as ModelMessage);
    }
    messages.push(...sanitized.messages);

    if (sanitized.droppedCount > 0) {
      logger.warn('检测到并忽略不合法工具消息，避免模型请求失败', {
        sessionId,
        dropped: sanitized.droppedCount,
        returned: messages.length,
      });
    }

    return messages;
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

  /**
   * 压缩指定 session 的旧消息
   *
   * @param sessionId - 会话 ID
   * @param keepRecentCount - 保留最近 N 条消息不压缩
   * @returns 是否执行了压缩
   */
  async compactOldMessages(
    sessionId: number,
    keepRecentCount: number,
    generateSummary: (messages: ModelMessage[]) => Promise<{ summary: string; model: string }>,
    estimateTokensFn: (text: string) => number,
  ): Promise<boolean> {
    const allMessages = await this.prisma.message.findMany({
      where: { sessionId, compactedAt: null },
      orderBy: { id: 'asc' },
    });

    if (allMessages.length <= keepRecentCount) {
      return false;
    }

    const toCompact = allMessages.slice(0, allMessages.length - keepRecentCount);
    if (toCompact.length === 0) return false;

    const latestSummary = await this.prisma.compactionSummary.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    if (latestSummary && latestSummary.messageIdTo >= toCompact[toCompact.length - 1].id) {
      return false;
    }

    const messagesForSummary = toCompact.map((m) => m.content as unknown as ModelMessage);

    const inputForSummary: ModelMessage[] = [];
    if (latestSummary) {
      inputForSummary.push({
        role: 'assistant',
        content: `[Previous conversation summary]\n${latestSummary.summary}`,
      } as ModelMessage);
    }
    inputForSummary.push(...messagesForSummary);

    const { summary, model } = await generateSummary(inputForSummary);

    const messageIdFrom = toCompact[0].id;
    const messageIdTo = toCompact[toCompact.length - 1].id;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.message.updateMany({
        where: {
          sessionId,
          id: { gte: messageIdFrom, lte: messageIdTo },
        },
        data: { compactedAt: now },
      }),
      this.prisma.compactionSummary.create({
        data: {
          sessionId,
          summary,
          messageIdFrom,
          messageIdTo,
          originalTokens: estimateTokensFn(
            messagesForSummary
              .map((m) =>
                typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              )
              .join(''),
          ),
          summaryTokens: estimateTokensFn(summary),
          model,
        },
      }),
    ]);

    logger.info('消息压缩完成', {
      sessionId,
      compactedCount: toCompact.length,
      messageIdRange: `${messageIdFrom}-${messageIdTo}`,
      summaryLength: summary.length,
    });

    return true;
  }

  /**
   * 记录单次 agent 调用的 token 用量
   * - runId 唯一键冲突时跳过，保证幂等
   * - 失败不抛出，避免影响主对话流程
   */
  async recordTokenUsage(data: {
    runId: string;
    sessionId: number;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    providerUsage?: unknown;
  }): Promise<void> {
    try {
      await this.prisma.tokenUsage.create({
        data: {
          runId: data.runId,
          sessionId: data.sessionId,
          provider: data.provider,
          model: data.model,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          totalTokens: data.totalTokens,
          providerUsage: data.providerUsage as any,
        },
      });
      logger.debug('记录 token 用量', {
        sessionId: data.sessionId,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        totalTokens: data.totalTokens,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        logger.debug('token 用量记录已存在，跳过', { runId: data.runId });
        return;
      }
      logger.warn('token 用量记录失败', err);
    }
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
      const history = await this.getHistory(sessionId);
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
