import type { QdrantClient } from '@qdrant/js-client-rest'
import type { ModelMessage } from 'ai'
import { randomUUID } from 'node:crypto'
import { createLogger } from '@okon/shared'
import { textToSparseVector } from '../../utils/sparse-vector.js'
import type { MemoryFilter, MemoryPayload, MemorySearchResult } from './types.js'

const logger = createLogger('memory-store')
const COLLECTION_NAME = 'memories'
const SPARSE_VECTOR_NAME = 'bm25'

export function createMemoryStore(client: QdrantClient) {
  let collectionReady = false
  let createdAtIndexReady = false

  async function ensureCollection() {
    if (collectionReady) return

    try {
      await client.getCollection(COLLECTION_NAME)
      collectionReady = true
      logger.info('记忆集合已存在', { collection: COLLECTION_NAME })
    } catch {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {},
        sparse_vectors: {
          [SPARSE_VECTOR_NAME]: { modifier: 'idf' },
        },
      })
      collectionReady = true
      logger.info('记忆集合创建成功', { collection: COLLECTION_NAME })
    }

    if (!createdAtIndexReady) {
      try {
        await client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'createdAt',
          field_schema: 'datetime',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn('createdAt 索引创建失败，将继续尝试按时间排序查询', { message })
      } finally {
        createdAtIndexReady = true
      }
    }
  }

  async function add(content: string, filter: MemoryFilter): Promise<string> {
    await ensureCollection()

    const sparseVector = textToSparseVector(content)
    const id = randomUUID()
    const payload: MemoryPayload = {
      content,
      filter,
      createdAt: new Date().toISOString(),
    }

    await client.upsert(COLLECTION_NAME, {
      points: [
        {
          id,
          vector: { [SPARSE_VECTOR_NAME]: sparseVector },
          payload: payload as unknown as Record<string, unknown>,
        },
      ],
    })

    logger.debug('记忆已存储', { id, sessionId: filter.sessionId })
    return id
  }

  return {
    add,

    async storeConversation(
      userMessage: string,
      responseMessages: ModelMessage[],
      filter: MemoryFilter,
    ): Promise<void> {
      const assistantText = responseMessages
        .filter((m) => m.role === 'assistant')
        .map((m) =>
          typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
              ? m.content
                  .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                  .map((p) => p.text)
                  .join('')
              : '',
        )
        .join('')

      if (!assistantText) return

      const content = `用户: ${userMessage}\n助手: ${assistantText}`
      await add(content, filter)
    },

    async search(
      query: string,
      filter?: Partial<MemoryFilter>,
      limit = 5,
    ): Promise<MemorySearchResult[]> {
      if (!collectionReady) {
        try {
          await ensureCollection()
        } catch {
          return []
        }
      }

      const sparseVector = textToSparseVector(query)
      if (sparseVector.indices.length === 0) return []

      // 构建 Qdrant payload filter
      const must = filter
        ? Object.entries(filter).map(([key, value]) => ({
            key: `filter.${key}`,
            match: { value },
          }))
        : []

      const results = await client.search(COLLECTION_NAME, {
        vector: {
          name: SPARSE_VECTOR_NAME,
          vector: sparseVector,
        },
        limit,
        with_payload: true,
        ...(must.length > 0 && { filter: { must } }),
      })

      return results.map((r) => {
        const payload = r.payload as unknown as MemoryPayload
        return {
          id: String(r.id),
          content: payload.content,
          filter: payload.filter,
          createdAt: payload.createdAt,
          score: r.score,
        }
      })
    },

    async recent(
      filter?: Partial<MemoryFilter>,
      limit = 5,
    ): Promise<MemorySearchResult[]> {
      if (!collectionReady) {
        try {
          await ensureCollection()
        } catch {
          return []
        }
      }

      const must = filter
        ? Object.entries(filter).map(([key, value]) => ({
            key: `filter.${key}`,
            match: { value },
          }))
        : []

      const result = await client.scroll(COLLECTION_NAME, {
        limit,
        with_payload: true,
        with_vector: false,
        order_by: {
          key: 'createdAt',
          direction: 'desc',
        },
        ...(must.length > 0 && { filter: { must } }),
      })

      return result.points.map((p) => {
        const payload = p.payload as unknown as MemoryPayload
        return {
          id: String(p.id),
          content: payload.content,
          filter: payload.filter,
          createdAt: payload.createdAt,
          score: 0,
        }
      })
    },
  }
}

export type MemoryStore = ReturnType<typeof createMemoryStore>
