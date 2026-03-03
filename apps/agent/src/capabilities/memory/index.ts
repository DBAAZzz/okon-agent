import { createFileMemoryStore, type FileMemoryStore } from './file-memory-store.js'

export type {
  MemoryPayload,
  MemoryFilter,
  MemorySearchResult,
  MemoryAction,
  MemoryCategory,
  MemoryPriority,
} from './types.js'
export type { MemoryStore } from './memory-store.js'
export type { FileMemoryStore } from './file-memory-store.js'
export { extractMemories, type MemoryExtractorModelConfig } from './memory-extractor.js'

export let fileMemoryStore: FileMemoryStore

export function initMemory() {
  fileMemoryStore = createFileMemoryStore()
  return fileMemoryStore
}
