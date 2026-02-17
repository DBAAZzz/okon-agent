/**
 * AI SDK UI Message 协议的类型与解析
 * 负责将前端 useChat() 发来的 UI Message 格式解析为后端可用的数据
 */

import type { ApprovalRequestPart } from '@okon/shared'
import { sessionManager } from '../agent/session-manager.js'
import { resolveApprovals } from '../agent/approval/index.js'

// ─── 类型定义 ───

export type UIMessagePartPayload = {
  type?: string
  text?: string
  state?: string
  input?: unknown
  toolName?: string
  approval?: {
    id?: string
    approved?: boolean
    reason?: string
  }
}

export type UIMessagePayload = {
  role?: string
  parts?: UIMessagePartPayload[]
}

export type ChatPostBody = {
  sessionId?: string
  messages?: UIMessagePayload[]
  trigger?: 'submit-message' | 'regenerate-message'
  messageId?: string
}

/** resolveRequestContext 的返回值 */
export type RequestContext = {
  /** 是否为审批后继续的请求（非新消息） */
  isContinueRequest: boolean
  /** 用户消息文本，仅新消息请求时有值 */
  userMessage?: string
}

// ─── 解析函数 ───

/** 从 UI Messages 中提取最后一条用户文本 */
function extractLastUserText(messages: UIMessagePayload[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'user') continue

    const text = (msg.parts || [])
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('')
      .trim()

    if (text) return text
  }
  return null
}

/** 从 UI Messages 中提取审批响应（用户对工具调用的批准/拒绝） */
function extractApprovalResponses(messages: UIMessagePayload[]) {
  const responses: Array<{ id: string; approved: boolean; reason?: string }> = []
  const seen = new Set<string>()

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue

    for (const part of msg.parts || []) {
      const isToolPart =
        part.type === 'dynamic-tool' ||
        (typeof part.type === 'string' && part.type.startsWith('tool-'))
      if (!isToolPart) continue

      if (part.state !== 'approval-responded') continue
      if (!part.approval?.id || part.approval.approved == null) continue
      if (seen.has(part.approval.id)) continue

      seen.add(part.approval.id)
      responses.push({
        id: part.approval.id,
        approved: part.approval.approved,
        reason: part.approval.reason,
      })
    }
  }

  return responses
}

/**
 * 解析 UI Message 请求上下文
 * 1. 匹配并处理待审批的响应
 * 2. 判断是新消息还是审批后继续
 * 3. 提取用户消息文本
 *
 * @returns RequestContext，若缺少必要的用户消息则返回 null
 */
export async function resolveRequestContext(
  sessionId: string,
  body: ChatPostBody,
): Promise<RequestContext | null> {
  const { messages = [], trigger, messageId } = body

  // 将 UI 中的审批响应与服务端待审批列表匹配
  const pending = sessionManager.getPendingApprovals(sessionId)
  const pendingIds = new Set(pending.map((a: ApprovalRequestPart) => a.approvalId))
  const approvalResponses = extractApprovalResponses(messages).filter((r) =>
    pendingIds.has(r.id)
  )

  // 有审批决策：执行被批准的工具 / 为拒绝的生成结果，持久化到 DB
  if (approvalResponses.length > 0) {
    await resolveApprovals(
      sessionId,
      approvalResponses.map((r) => ({ approvalId: r.id, approved: r.approved, reason: r.reason })),
    )
  }

  const isContinueRequest =
    approvalResponses.length > 0 || (trigger === 'submit-message' && !!messageId)

  if (isContinueRequest) {
    return { isContinueRequest: true }
  }

  // 新消息请求：必须包含用户文本
  const userMessage = extractLastUserText(messages)
  if (!userMessage) return null

  return { isContinueRequest: false, userMessage }
}
