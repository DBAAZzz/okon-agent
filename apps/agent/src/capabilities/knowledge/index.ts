import type { QdrantClient } from '@qdrant/js-client-rest'
import type { PrismaClient } from '@prisma/client'
import type { Embeddings } from '../embeddings/embeddings.js'
import { createKnowledgeStore, type KnowledgeStore } from './knowledge-store.js'

export type { KnowledgeStore } from './knowledge-store.js'

export let knowledgeStore: KnowledgeStore

export function initKnowledgeStore(prisma: PrismaClient, qdrant: QdrantClient, embeddings: Embeddings) {
  knowledgeStore = createKnowledgeStore(prisma, qdrant, embeddings)
  return knowledgeStore
}
