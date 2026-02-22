import type { ModelMessage, ToolApprovalResponse } from 'ai'
import { createLogger } from '@okon/shared'
import { sessionManager } from '../session-manager.js'

const logger = createLogger('approval-resolver')

export type ApprovalDecision = {
  approvalId: string
  approved: boolean
  reason?: string
}

/**
 * 处理审批决策：
 * - 将审批中断时暂存的 assistant(tool-call/tool-approval-request) 消息持久化
 * - 追加合法的 tool-approval-response 消息
 * 之后下一次 runAgent() 会基于这些历史继续执行工具流程
 */
export async function resolveApprovals(
  sessionId: number,
  decisions: ApprovalDecision[],
): Promise<void> {
  const pendingMessages = sessionManager.takePendingMessages(sessionId)
  if (!pendingMessages.length) return

  if (!decisions.length) {
    // 没有有效审批决策时把暂存消息放回，避免丢失
    sessionManager.setPendingMessages(sessionId, pendingMessages)
    return
  }

  const approvalResponses: ToolApprovalResponse[] = decisions.map((d) => ({
    type: 'tool-approval-response',
    approvalId: d.approvalId,
    approved: d.approved,
    reason: d.reason ?? (d.approved ? 'User approved' : 'User denied'),
  }))

  const toolMessage: ModelMessage = {
    role: 'tool',
    content: approvalResponses,
  }

  await sessionManager.addMessages(sessionId, [...pendingMessages, toolMessage])

  const pendingApprovals = sessionManager.getPendingApprovals(sessionId)
  const resolvedIds = new Set(decisions.map((d) => d.approvalId))
  const remaining = pendingApprovals.filter((a) => !resolvedIds.has(a.approvalId))

  if (remaining.length > 0) {
    sessionManager.setPendingApprovals(sessionId, remaining)
  } else {
    sessionManager.clearPendingApprovals(sessionId)
  }

  logger.info('审批响应已持久化，等待继续执行', {
    sessionId,
    resolved: approvalResponses.length,
    remaining: remaining.length,
  })
}
