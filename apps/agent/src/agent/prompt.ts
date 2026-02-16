export interface PromptContext {
  memories?: string[]
}

const BASE_INSTRUCTIONS =
  '灵活使用工具回答，目前有：weather、getOutdoorActivities、ipLookup。ipLookup 始终可用且无需审批。weather 需要审批；若审批被拒绝，不要重试同一工具，直接向用户说明。'

export function buildSystemPrompt(context?: PromptContext): string {
  const parts = [BASE_INSTRUCTIONS]

  if (context?.memories?.length) {
    parts.push('\n\n## 相关记忆\n' + context.memories.join('\n'))
  }

  return parts.join('')
}
