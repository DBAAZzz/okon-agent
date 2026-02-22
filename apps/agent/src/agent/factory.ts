import { stepCountIs, ToolLoopAgent } from 'ai'
import type { LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { modelRegistry } from './models/index.js'
import { resolveOpenAIAPIMode } from './provider-routing.js'
import { buildSubagentTools } from './subagent/index.js'
import {
  weatherTool,
  getOutdoorActivitiesTool,
  ipLookupTool,
} from '../tools/index.js'

function buildAgent(model: LanguageModel, modelId: string, instructions: string) {
  return new ToolLoopAgent({
    model,
    instructions,
    tools: {
      weather: weatherTool,
      getOutdoorActivities: getOutdoorActivitiesTool,
      ipLookup: ipLookupTool,
      ...buildSubagentTools(modelId),
    },
    stopWhen: stepCountIs(5),
  })
}

/**
 * Bot 提供了自己的 apiKey/baseURL 时，动态创建 provider，不走 registry。
 * 统一使用 OpenAI-compatible 接口（包括 OpenAI、DeepSeek、Ollama、自定义网关）。
 */
export function createAgentWithCredentials(
  provider: string,
  modelId: string,
  instructions: string,
  credentials: { apiKey: string; baseURL?: string },
) {
  const { apiKey, baseURL } = credentials
  if (!apiKey.trim()) {
    throw new Error('Bot apiKey is required')
  }

  let model: LanguageModel

  if (provider === 'deepseek') {
    const sdkProvider = createDeepSeek({
      apiKey: apiKey.trim(),
      ...(baseURL ? { baseURL } : {}),
    })
    modelRegistry.register(modelId, () => sdkProvider(modelId))
    model = sdkProvider(modelId)
  } else {
    const sdkProvider = createOpenAI({
      apiKey: apiKey.trim(),
      ...(baseURL ? { baseURL } : {}),
    })
    const apiMode = resolveOpenAIAPIMode(provider, baseURL)

    if (apiMode === 'responses') {
      modelRegistry.register(modelId, () => sdkProvider.responses(modelId as any))
      model = sdkProvider.responses(modelId as any)
    } else {
      modelRegistry.register(modelId, () => sdkProvider.chat(modelId as any))
      model = sdkProvider.chat(modelId as any)
    }
  }

  return buildAgent(model, modelId, instructions)
}
