import type { ModelMessage } from 'ai'
import type { ApprovalRequestPart } from '@okon/shared'

/**
 * 从 response messages 中提取审批请求
 */
export function collectApprovalRequests(messages: ModelMessage[]): ApprovalRequestPart[] {
  const approvals: ApprovalRequestPart[] = []
  const seen = new Set<string>()

  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const parts = message.content as any[]

    const toolCalls = new Map<string, { toolName: string; input: unknown }>()
    for (const part of parts) {
      if (part.type !== 'tool-call') continue
      toolCalls.set(part.toolCallId, {
        toolName: part.toolName,
        input: part.input ?? {},
      })
    }

    for (const part of parts) {
      if (part.type !== 'tool-approval-request' || seen.has(part.approvalId)) continue

      const toolCall = toolCalls.get(part.toolCallId)
      seen.add(part.approvalId)
      approvals.push({
        type: 'tool-approval-request',
        approvalId: part.approvalId,
        toolCall: {
          toolName: toolCall?.toolName ?? 'unknown',
          input: toolCall?.input ?? {},
        },
      })
    }
  }

  return approvals
}
