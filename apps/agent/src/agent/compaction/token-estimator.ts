import type { ModelMessage } from 'ai'

/**
 * 粗略估算：1 token ≈ 3.5 个英文字符，中文约 1.5 字符/token
 * 用统一的保守除数，避免低估导致超限
 */
const TOKEN_CHAR_DIVISOR = 3

export function estimateTokens(messages: ModelMessage[]): number {
  const totalChars = messages.reduce((sum, m) => sum + JSON.stringify(m.content).length, 0)
  return Math.ceil(totalChars / TOKEN_CHAR_DIVISOR)
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_CHAR_DIVISOR)
}
