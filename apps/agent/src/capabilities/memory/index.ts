import type { QdrantClient } from '@qdrant/js-client-rest'
import { createMemoryStore, type MemoryStore } from './memory-store.js'

export type { MemoryPayload, MemoryFilter, MemorySearchResult } from './types.js'
export type { MemoryStore } from './memory-store.js'

export let memoryStore: MemoryStore

export function initMemory(client: QdrantClient) {
  memoryStore = createMemoryStore(client)
  return memoryStore
}
