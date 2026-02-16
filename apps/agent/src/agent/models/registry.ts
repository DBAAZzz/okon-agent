import type { LanguageModel } from 'ai'
import { createLogger } from '@okon/shared'

const logger = createLogger('model-registry')

type ModelFactory = () => LanguageModel

class ModelRegistry {
  private models = new Map<string, ModelFactory>()

  register(id: string, factory: ModelFactory) {
    this.models.set(id, factory)
    logger.info('注册模型', { id })
  }

  get(id: string): LanguageModel {
    const factory = this.models.get(id)
    if (!factory) {
      throw new Error(`Model "${id}" not registered. Available: ${this.listIds().join(', ')}`)
    }
    return factory()
  }

  has(id: string): boolean {
    return this.models.has(id)
  }

  listIds(): string[] {
    return Array.from(this.models.keys())
  }
}

export const modelRegistry = new ModelRegistry()
