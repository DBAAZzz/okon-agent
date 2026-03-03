import { generateText, Output } from 'ai'
import type { LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createLogger } from '@okon/shared'
import { z } from 'zod'
import { EXTRACTOR_SYSTEM_PROMPT } from '../../agent/prompt/index.js'
import { resolveOpenAIAPIMode } from '../../agent/provider-routing.js'
import type { MemoryAction } from './types.js'

const logger = createLogger('memory-extractor')

const MemoryActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    content: z.string().trim().min(5),
    category: z.enum(['preference', 'fact', 'entity', 'lesson', 'intent']),
    priority: z.enum(['P0', 'P1', 'P2']),
  }),
  z.object({
    action: z.literal('update'),
    targetId: z.string().trim().min(1),
    content: z.string().trim().min(5),
    priority: z.enum(['P0', 'P1', 'P2']),
  }),
  z.object({
    action: z.literal('delete'),
    targetId: z.string().trim().min(1),
  }),
])

const MemoryActionArraySchema = z.array(MemoryActionSchema)

export interface MemoryExtractorModelConfig {
  provider: string
  model: string
  apiKey: string
  baseURL?: string
}

export interface MemoryExtractInput {
  model: MemoryExtractorModelConfig
  existingMemories: string
  userMessage: string
  assistantMessage: string
}

function buildModel(config: MemoryExtractorModelConfig): LanguageModel {
  // 记忆提取模型跟随 session 透传配置，保持与当前会话模型链路一致。
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
  const apiMode = resolveOpenAIAPIMode(config.provider, config.baseURL)
  return apiMode === 'responses'
    ? sdkProvider.responses(config.model as any)
    : sdkProvider.chat(config.model as any)
}

function buildPrompt(input: MemoryExtractInput): string {
  // 将“已有记忆 + 本轮问答”拼成单次提取上下文，交给模型做 create/update/delete 决策。
  return [
    '## 当前记忆',
    '',
    input.existingMemories || '(空)',
    '',
    '## 本轮对话',
    '',
    `用户：${input.userMessage}`,
    `助手：${input.assistantMessage}`,
  ].join('\n')
}

export async function extractMemories(input: MemoryExtractInput): Promise<MemoryAction[]> {
  // 空输入直接跳过，避免无效调用；其余场景统一走结构化提取 + 校验链路。
  if (!input.userMessage.trim() || !input.assistantMessage.trim()) return []

  const model = buildModel(input.model)
  const prompt = buildPrompt(input)

  try {
    const { output } = await generateText({
      model,
      system: EXTRACTOR_SYSTEM_PROMPT,
      prompt,
      output: Output.object({
        schema: z.object({
          actions: MemoryActionArraySchema,
        }),
      }),
      maxOutputTokens: 1200,
    })

    const actions = output.actions as MemoryAction[]
    logger.info('记忆提取完成', {
      actionCount: actions.length,
      model: input.model.model,
      provider: input.model.provider,
    })
    return actions
  } catch (error) {
    logger.warn('记忆提取失败，跳过本轮', { error })
    return []
  }
}
