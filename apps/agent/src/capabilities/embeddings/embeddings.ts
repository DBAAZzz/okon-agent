import { embed, embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { QdrantClient } from '@qdrant/js-client-rest'
import { createVectorStore } from './vector-store.js'
import { textToSparseVector } from '../../utils/sparse-vector.js'
import type { PointData, SearchMode, SearchResult } from './types.js'

export type DocPayload = {
  content: string
  metadata?: Record<string, any>
}

export function createEmbeddings(client: QdrantClient, model = 'text-embedding-3-small') {

  const baseURL = process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_BASEURL
  const apiKey = process.env.OPENAI_API_KEY

  const openai = createOpenAI({
    apiKey,
    baseURL,
  })

  const embeddingModel = openai.embedding(model)
  const store = createVectorStore<DocPayload>(client)

  return {
    async embed(text: string): Promise<number[]> {
      const { embedding } = await embed({
        model: embeddingModel,
        value: text,
        providerOptions: {
          openai: {
            dimensions: 512,
          },
        },
      })
      return embedding
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return []
      const { embeddings: results } = await embedMany({
        model: embeddingModel,
        values: texts,
        providerOptions: {
          openai: {
            dimensions: 512,
          },
        },
      })
      return results
    },

    async addDocument(
      content: string,
      metadata?: Record<string, any>,
    ): Promise<PointData<DocPayload>> {
      const embedding = await this.embed(content)
      const sparseVector = textToSparseVector(content)
      return await store.add({ content, metadata }, embedding, sparseVector)
    },

    async search(
      query: string,
      topK = 5,
      mode: SearchMode = 'hybrid',
    ): Promise<SearchResult<DocPayload>[]> {
      const querySparseVector = textToSparseVector(query)
      const queryEmbedding =
        mode === 'sparse' ? null : await this.embed(query)

      return await store.search(queryEmbedding, querySparseVector, topK, mode)
    },

    store,
  }
}

export type Embeddings = ReturnType<typeof createEmbeddings>
