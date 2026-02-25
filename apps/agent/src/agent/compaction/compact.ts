import { generateText } from 'ai'
import type { LanguageModel, ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createLogger } from '@okon/shared'
import { COMPACT_SYSTEM_PROMPT } from '../prompt/index.js'

const logger = createLogger('compaction')

interface CompactModelConfig {
  provider: string
  model: string
  apiKey: string
  baseURL?: string
}

function buildModel(config: CompactModelConfig): LanguageModel {
  if (config.provider === 'deepseek') {
    const sdkProvider = createDeepSeek({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    })
    return sdkProvider(config.model)
  }

  const sdkProvider = createOpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  })
  return sdkProvider.chat(config.model as any)
}

export async function generateCompactionSummary(
  messages: ModelMessage[],
  config: CompactModelConfig,
): Promise<{ summary: string; model: string }> {
  const model = buildModel(config)

  const formatted = messages
    .map((m) => {
      const role = m.role.toUpperCase()
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 0)
      return `[${role}]: ${content}`
    })
    .join('\n\n')

  const { text } = await generateText({
    model,
    system: COMPACT_SYSTEM_PROMPT,
    prompt: formatted,
    maxOutputTokens: 2000,
  })

  logger.info('生成 compaction 摘要', {
    inputMessages: messages.length,
    summaryLength: text.length,
    model: config.model,
  })

  return { summary: text, model: config.model }
}
