export interface PromptContext {
  memories?: string[]
}

const BASE_INSTRUCTIONS = [
  '你是一个工具增强助手。',
  '可用工具：weather（需审批）、getOutdoorActivities、ipLookup。',
  '',
  '流程：能直接回答则不调用工具；需要时调用最相关的一个工具，根据结果决定下一步。',
  '',
  '约束：',
  '- 审批被拒后不重试，说明原因并给替代方案。',
  '- 工具失败时修正参数或向用户补充提问，不重复相同调用。',
  '- 不要编造工具返回结果。',
].join('\n')

export function buildSystemPrompt(context?: PromptContext): string {
  const parts = [BASE_INSTRUCTIONS]

  if (context?.memories?.length) {
    parts.push('\n\n## 相关记忆\n' + context.memories.join('\n'))
  }

  return parts.join('')
}
