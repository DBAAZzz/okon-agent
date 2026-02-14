import type { ModelMessage, ToolApprovalResponse } from 'ai';
import type { ApprovalRequestPart } from '@okon/shared';
import { createLogger } from '@okon/shared';

const logger = createLogger('session-manager');

type Session = {
  id: string;
  history: ModelMessage[];
  pendingApprovals: ApprovalRequestPart[];
  createdAt: Date;
  lastActivityAt: Date;
};

export class SessionManager {
  private sessions = new Map<string, Session>();

  getOrCreate(sessionId: string): Session {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        history: [],
        pendingApprovals: [],
        createdAt: new Date(),
        lastActivityAt: new Date()
      };
      this.sessions.set(sessionId, session);
      logger.info('创建新会话', { sessionId });
    }

    session.lastActivityAt = new Date();
    return session;
  }

  getHistory(sessionId: string): ModelMessage[] {
    const session = this.getOrCreate(sessionId);
    return session.history;
  }

  addMessage(sessionId: string, message: ModelMessage): void {
    const session = this.getOrCreate(sessionId);
    session.history.push(message);
    session.lastActivityAt = new Date();
    logger.debug('添加消息到历史', { sessionId, role: message.role });
  }

  addMessages(sessionId: string, messages: ModelMessage[]): void {
    const session = this.getOrCreate(sessionId);
    session.history.push(...messages);
    session.lastActivityAt = new Date();
    logger.debug('添加多条消息到历史', { sessionId, count: messages.length });
  }

  setPendingApprovals(sessionId: string, approvals: ApprovalRequestPart[]): void {
    const session = this.getOrCreate(sessionId);
    session.pendingApprovals = approvals;
    logger.info('设置待审批请求', { sessionId, count: approvals.length });
  }

  getPendingApprovals(sessionId: string): ApprovalRequestPart[] {
    const session = this.getOrCreate(sessionId);
    return session.pendingApprovals;
  }

  clearPendingApprovals(sessionId: string): void {
    const session = this.getOrCreate(sessionId);
    session.pendingApprovals = [];
    logger.debug('清除待审批请求', { sessionId });
  }

  handleApproval(
    sessionId: string,
    approvalId: string,
    approved: boolean,
    reason?: string
  ): void {
    const session = this.getOrCreate(sessionId);

    const approval = session.pendingApprovals.find(
      a => a.approvalId === approvalId
    );

    if (!approval) {
      throw new Error(`Approval ${approvalId} not found in session ${sessionId}`);
    }

    logger.info('处理审批响应', { sessionId, approvalId, approved });

    // 构造审批响应
    const response: ToolApprovalResponse = {
      type: 'tool-approval-response',
      approvalId,
      approved,
      reason: reason || (approved ? 'User approved' : 'User denied')
    };

    // 添加到消息历史
    this.addMessage(sessionId, {
      role: 'tool',
      content: [response]
    });

    // 清除待审批列表
    this.clearPendingApprovals(sessionId);

    logger.info('审批响应已添加到历史，等待继续执行', { sessionId });
  }

  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      logger.info('删除会话', { sessionId });
    }
    return deleted;
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
