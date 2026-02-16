import type { StreamEvent, ApprovalRequestPart } from '@okon/shared'

/**
 * 将 AI SDK fullStream 的 chunk 转换为统一的 StreamEvent
 * 与 AI SDK 解耦：上层只依赖 StreamEvent 协议
 */
export async function* adaptStream(
  fullStream: AsyncIterable<any>
): AsyncGenerator<StreamEvent> {
  const pendingApprovals: ApprovalRequestPart[] = []

  for await (const chunk of fullStream) {
    switch (chunk.type) {
      // 文本
      case 'text-start':
        yield { type: 'text_start' }
        break
      case 'text-delta':
        yield { type: 'text_delta', delta: chunk.text }
        break
      case 'text-end':
        yield { type: 'text_end' }
        break

      // 推理
      case 'reasoning-start':
        yield { type: 'reasoning_start' }
        break
      case 'reasoning-delta':
        yield { type: 'reasoning_delta', delta: chunk.text }
        break
      case 'reasoning-end':
        yield { type: 'reasoning_end' }
        break

      // 工具调用开始（输入流）
      case 'tool-input-start':
        yield {
          type: 'tool_call_start',
          toolName: chunk.toolName,
          toolCallId: chunk.id,
        }
        break
      case 'tool-input-delta':
        yield {
          type: 'tool_call_delta',
          toolCallId: chunk.id,
          delta: chunk.delta,
        }
        break

      // 工具调用完成
      case 'tool-call':
        // tool-call 在 tool-input 流之后触发，包含完整的 input
        // 如果没有 tool-input-start（某些模型不支持），补发 start
        break

      // 工具执行结果
      case 'tool-result':
        yield {
          type: 'tool_call_end',
          toolName: chunk.toolName,
          toolCallId: chunk.toolCallId,
          input: chunk.input,
          result: chunk.output,
        }
        break

      // 工具执行错误
      case 'tool-error':
        yield {
          type: 'tool_call_error',
          toolName: chunk.toolName,
          toolCallId: chunk.toolCallId,
          error: String(chunk.error),
        }
        break

      // 工具审批请求
      case 'tool-approval-request':
        pendingApprovals.push({
          type: 'tool-approval-request',
          approvalId: chunk.approvalId,
          toolCall: {
            toolName: chunk.toolCall?.toolName || 'unknown',
            input: chunk.toolCall?.input || {},
          },
        })
        break

      // Step 生命周期
      case 'start-step':
        yield { type: 'step_start' }
        break
      case 'finish-step':
        yield { type: 'step_end', finishReason: chunk.finishReason }
        break

      // 整体结束
      case 'finish':
        // 先发审批（如有）
        if (pendingApprovals.length > 0) {
          yield { type: 'approval_request', approvals: [...pendingApprovals] }
        }
        yield {
          type: 'done',
          totalUsage: chunk.totalUsage
            ? {
                promptTokens: chunk.totalUsage.promptTokens ?? 0,
                completionTokens: chunk.totalUsage.completionTokens ?? 0,
              }
            : undefined,
        }
        break

      // 错误
      case 'error':
        yield {
          type: 'error',
          message: chunk.error instanceof Error ? chunk.error.message : String(chunk.error),
        }
        break
    }
  }

  // 如果流结束但没有 finish 事件（异常中断），也要发审批和 done
  // 正常情况 finish 会处理，这里做兜底
}
