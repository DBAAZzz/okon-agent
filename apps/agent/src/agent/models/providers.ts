import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAI } from '@ai-sdk/openai'
import { modelRegistry } from './registry.js'

// DeepSeek
if (process.env.DEEPSEEK_API_KEY) {
  const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  })
  modelRegistry.register('deepseek-chat', () => deepseek('deepseek-chat'))
  modelRegistry.register('deepseek-reasoner', () => deepseek('deepseek-reasoner'))
}

// OpenAI / OpenAI-compatible
if (process.env.OPENAI_API_KEY) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASEURL,
  })
  modelRegistry.register('gpt-4o', () => openai('gpt-4o'))
  modelRegistry.register('gpt-4o-mini', () => openai('gpt-4o-mini'))
}
