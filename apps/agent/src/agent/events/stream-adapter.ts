import type { StreamEvent } from '@okon/shared'

/**
 * 将 AI SDK fullStream 的 chunk 转换为统一的 StreamEvent
 * 纯转译层：不积累状态，审批由 gateway.finalizeStream 统一处理
 */
export async function* adaptStream(
  fullStream: AsyncIterable<any>
): AsyncGenerator<StreamEvent> {
  for await (const chunk of fullStream) {
    switch (chunk.type) {
      case 'text-start':
        yield { type: 'text_start' }
        break
      case 'text-delta':
        yield { type: 'text_delta', delta: chunk.text }
        break
      case 'text-end':
        yield { type: 'text_end' }
        break

      case 'reasoning-start':
        yield { type: 'reasoning_start' }
        break
      case 'reasoning-delta':
        yield { type: 'reasoning_delta', delta: chunk.text }
        break
      case 'reasoning-end':
        yield { type: 'reasoning_end' }
        break

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

      case 'tool-call':
        break

      case 'tool-result':
        yield {
          type: 'tool_call_end',
          toolName: chunk.toolName,
          toolCallId: chunk.toolCallId,
          input: chunk.input,
          result: chunk.output,
        }
        break

      case 'tool-error':
        yield {
          type: 'tool_call_error',
          toolName: chunk.toolName,
          toolCallId: chunk.toolCallId,
          error: String(chunk.error),
        }
        break

      case 'start-step':
        yield { type: 'step_start' }
        break
      case 'finish-step':
        yield { type: 'step_end', finishReason: chunk.finishReason }
        break

      case 'finish':
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

      case 'error':
        yield {
          type: 'error',
          message: chunk.error instanceof Error ? chunk.error.message : String(chunk.error),
        }
        break
    }
  }
}
