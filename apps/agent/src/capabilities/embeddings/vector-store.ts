import type { QdrantClient } from '@qdrant/js-client-rest'
import type { PointData, SearchMode, SearchResult, SparseVector } from './types.js'
import { createLogger } from '@okon/shared'
import { randomUUID } from 'node:crypto'

const logger = createLogger('vector-store')
const DENSE_VECTOR_NAME = 'dense'
const SPARSE_VECTOR_NAME = 'bm25'
const RRF_K = 60

function mapScoredPoint<T extends Record<string, unknown>>(point: {
  id: unknown
  score: number
  payload?: unknown
  vector?: unknown
}): SearchResult<T> {
  const namedVectors = (point.vector ?? {}) as Record<string, any>

  return {
    point: {
      id: String(point.id),
      payload: (point.payload ?? {}) as T,
      embedding: (namedVectors[DENSE_VECTOR_NAME] as number[]) ?? [],
      sparseVector: namedVectors[SPARSE_VECTOR_NAME] as SparseVector | undefined,
    },
    score: point.score,
  }
}

function fuseByRRF<T extends Record<string, unknown>>(
  denseResults: SearchResult<T>[],
  sparseResults: SearchResult<T>[],
  topK: number,
): SearchResult<T>[] {
  const merged = new Map<string, SearchResult<T>>()

  const applyRrf = (results: SearchResult<T>[]) => {
    for (let rank = 0; rank < results.length; rank += 1) {
      const result = results[rank]
      const id = result.point.id
      const rrfScore = 1 / (RRF_K + rank + 1)
      const existing = merged.get(id)

      if (!existing) {
        merged.set(id, { point: { ...result.point }, score: rrfScore })
        continue
      }

      existing.score += rrfScore
      if (existing.point.embedding.length === 0) {
        existing.point.embedding = result.point.embedding
      }
      if (!existing.point.sparseVector && result.point.sparseVector) {
        existing.point.sparseVector = result.point.sparseVector
      }
    }
  }

  applyRrf(denseResults)
  applyRrf(sparseResults)

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK)
}

export function createVectorStore<TPayload extends Record<string, unknown> = Record<string, unknown>>(
  client: QdrantClient,
  collectionName = 'documents',
) {
  async function ensureCollection(dimension: number) {
    try {
      await client.getCollection(collectionName)
      logger.info('集合已存在', { collectionName })
    } catch {
      await client.createCollection(collectionName, {
        vectors: {
          [DENSE_VECTOR_NAME]: { size: dimension, distance: 'Cosine' },
        },
        sparse_vectors: {
          [SPARSE_VECTOR_NAME]: { modifier: 'idf' },
        },
      })
      logger.info('集合创建成功', { collectionName, dimension })
    }
  }

  async function checkCollection(): Promise<boolean> {
    try {
      await client.getCollection(collectionName)
      return true
    } catch {
      return false
    }
  }

  return {
    async add(
      payload: TPayload,
      embedding: number[],
      sparseVector: SparseVector,
    ): Promise<PointData<TPayload>> {
      await ensureCollection(embedding.length)

      const id = randomUUID()

      try {
        await client.upsert(collectionName, {
          points: [
            {
              id,
              vector: {
                [DENSE_VECTOR_NAME]: embedding,
                [SPARSE_VECTOR_NAME]: sparseVector,
              },
              payload: payload as Record<string, unknown>,
            },
          ],
        })

        logger.debug('文档已写入 Qdrant', { id })

        return { id, payload, embedding, sparseVector }
      } catch (error) {
        logger.error('添加失败', error)
        throw error
      }
    },

    async search(
      queryEmbedding: number[] | null,
      querySparseVector: SparseVector,
      topK = 5,
      mode: SearchMode = 'hybrid',
    ): Promise<SearchResult<TPayload>[]> {
      if (!(await checkCollection())) {
        return []
      }

      const searchDense = async (): Promise<SearchResult<TPayload>[]> => {
        if (!queryEmbedding || queryEmbedding.length === 0) {
          throw new Error('Dense query embedding is required for dense search')
        }

        const results = await client.search(collectionName, {
          vector: {
            name: DENSE_VECTOR_NAME,
            vector: queryEmbedding,
          },
          limit: topK,
          with_payload: true,
          with_vector: [DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME],
        })

        return results.map(r => mapScoredPoint<TPayload>(r))
      }

      const searchSparse = async (): Promise<SearchResult<TPayload>[]> => {
        if (querySparseVector.indices.length === 0) {
          return []
        }

        const results = await client.search(collectionName, {
          vector: {
            name: SPARSE_VECTOR_NAME,
            vector: querySparseVector,
          },
          limit: topK,
          with_payload: true,
          with_vector: [DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME],
        })

        return results.map(r => mapScoredPoint<TPayload>(r))
      }

      if (mode === 'dense') {
        return await searchDense()
      }

      if (mode === 'sparse') {
        return await searchSparse()
      }

      const [denseResults, sparseResults] = await Promise.all([
        searchDense(),
        searchSparse(),
      ])

      if (denseResults.length === 0) return sparseResults.slice(0, topK)
      if (sparseResults.length === 0) return denseResults.slice(0, topK)

      return fuseByRRF(denseResults, sparseResults, topK)
    },

    async get(id: string): Promise<PointData<TPayload> | null> {
      if (!(await checkCollection())) {
        return null
      }

      const results = await client.retrieve(collectionName, {
        ids: [id],
        with_payload: true,
        with_vector: [DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME],
      })

      if (results.length === 0) {
        return null
      }

      const point = results[0]
      const namedVectors = (point.vector ?? {}) as Record<string, any>

      return {
        id: String(point.id),
        payload: (point.payload ?? {}) as TPayload,
        embedding: (namedVectors[DENSE_VECTOR_NAME] as number[]) ?? [],
        sparseVector: namedVectors[SPARSE_VECTOR_NAME] as SparseVector | undefined,
      }
    },

    async delete(id: string): Promise<boolean> {
      if (!(await checkCollection())) {
        return false
      }

      await client.delete(collectionName, { points: [id] })
      logger.debug('文档已从 Qdrant 删除', { id })
      return true
    },

    async clear(): Promise<void> {
      if (!(await checkCollection())) {
        return
      }

      await client.deleteCollection(collectionName)
      logger.info('集合已删除', { collectionName })
    },
  }
}
