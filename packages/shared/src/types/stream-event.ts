import type { ApprovalRequestPart } from './tool.js'

/** 前后端共用的 SSE 事件协议 */
export type StreamEvent =
  // 文本
  | { type: 'text_start' }
  | { type: 'text_delta'; delta: string }
  | { type: 'text_end' }
  // 推理（thinking）
  | { type: 'reasoning_start' }
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'reasoning_end' }
  // 工具调用
  | { type: 'tool_call_start'; toolName: string; toolCallId: string }
  | { type: 'tool_call_delta'; toolCallId: string; delta: string }
  | { type: 'tool_call_end'; toolName: string; toolCallId: string; input: unknown; result: unknown }
  | { type: 'tool_call_error'; toolName: string; toolCallId: string; error: string }
  // 审批
  | { type: 'approval_request'; approvals: ApprovalRequestPart[] }
  // 生命周期
  | { type: 'step_start' }
  | { type: 'step_end'; finishReason?: string }
  | { type: 'done'; totalUsage?: { promptTokens: number; completionTokens: number } }
  | { type: 'error'; message: string }
