import type { QdrantClient } from '@qdrant/js-client-rest'
import type { PrismaClient } from '@prisma/client'
import { createVectorStore } from '../embeddings/vector-store.js'
import type { Embeddings } from '../embeddings/embeddings.js'
import { textToSparseVector } from '../../utils/sparse-vector.js'
import { createLogger } from '@okon/shared'
import type { SearchMode } from '../embeddings/types.js'

const logger = createLogger('knowledge-store')

function collectionName(kbId: number) {
  return `kb_${kbId}`
}

export function createKnowledgeStore(
  prisma: PrismaClient,
  qdrant: QdrantClient,
  embeddings: Embeddings,
) {
  return {
    // ── 知识库 CRUD ──

    async create(name: string, description?: string) {
      return prisma.knowledgeBase.create({
        data: { name, description },
      })
    },

    async delete(id: number) {
      // 先删 Qdrant collection
      try {
        await qdrant.deleteCollection(collectionName(id))
        logger.info('Qdrant collection 已删除', { collection: collectionName(id) })
      } catch {
        logger.warn('Qdrant collection 删除失败（可能不存在）', { collection: collectionName(id) })
      }
      // 再删 Prisma（级联删除 Document + BotKnowledgeBase）
      await prisma.knowledgeBase.delete({ where: { id } })
    },

    async list() {
      return prisma.knowledgeBase.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { documents: true, bots: true } } },
      })
    },

    async get(id: number) {
      return prisma.knowledgeBase.findUnique({
        where: { id },
        include: { _count: { select: { documents: true, bots: true } } },
      })
    },

    // ── 文档管理 ──

    async addDocument(
      knowledgeBaseId: number,
      content: string,
      title?: string,
      metadata?: Record<string, any>,
    ) {
      const store = createVectorStore(qdrant, collectionName(knowledgeBaseId))

      const embedding = await embeddings.embed(content)
      const sparseVector = textToSparseVector(content)
      const point = await store.add(
        { content, metadata: metadata ?? {}, title: title ?? '' },
        embedding,
        sparseVector,
      )

      const doc = await prisma.document.create({
        data: {
          knowledgeBaseId,
          title,
          content,
          qdrantPointId: point.id,
          metadata: metadata ?? undefined,
        },
      })

      logger.info('文档已添加', { docId: doc.id, kbId: knowledgeBaseId, qdrantPointId: point.id })
      return doc
    },

    async deleteDocument(documentId: number) {
      const doc = await prisma.document.findUnique({ where: { id: documentId } })
      if (!doc) return false

      if (doc.qdrantPointId) {
        const store = createVectorStore(qdrant, collectionName(doc.knowledgeBaseId))
        await store.delete(doc.qdrantPointId)
      }

      await prisma.document.delete({ where: { id: documentId } })
      logger.info('文档已删除', { docId: documentId })
      return true
    },

    async listDocuments(knowledgeBaseId: number) {
      return prisma.document.findMany({
        where: { knowledgeBaseId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      })
    },

    // ── 搜索 ──

    async search(
      knowledgeBaseId: number,
      query: string,
      topK = 5,
      mode: SearchMode = 'hybrid',
    ) {
      const store = createVectorStore(qdrant, collectionName(knowledgeBaseId))
      const queryEmbedding = mode === 'sparse' ? null : await embeddings.embed(query)
      const querySparse = textToSparseVector(query)

      const results = await store.search(queryEmbedding, querySparse, topK, mode)
      return results.map((r) => ({
        content: r.point.payload.content as string,
        title: (r.point.payload.title as string) || undefined,
        score: r.score,
        metadata: r.point.payload.metadata as Record<string, any> | undefined,
      }))
    },

    async searchForBot(
      botId: number,
      query: string,
      topK = 5,
      mode: SearchMode = 'hybrid',
    ) {
      const bindings = await prisma.botKnowledgeBase.findMany({
        where: { botId },
        select: { knowledgeBaseId: true },
      })

      if (bindings.length === 0) return []

      // 并行搜索所有绑定的知识库
      const allResults = await Promise.all(
        bindings.map((b) => this.search(b.knowledgeBaseId, query, topK, mode)),
      )

      // 合并并按分数排序取 topK
      return allResults.flat().sort((a, b) => b.score - a.score).slice(0, topK)
    },

    // ── Bot 绑定 ──

    async bindBot(botId: number, knowledgeBaseId: number) {
      return prisma.botKnowledgeBase.create({
        data: { botId, knowledgeBaseId },
      })
    },

    async unbindBot(botId: number, knowledgeBaseId: number) {
      await prisma.botKnowledgeBase.delete({
        where: { botId_knowledgeBaseId: { botId, knowledgeBaseId } },
      })
    },

    async getBotKnowledgeBases(botId: number) {
      const bindings = await prisma.botKnowledgeBase.findMany({
        where: { botId },
        include: {
          knowledgeBase: {
            include: { _count: { select: { documents: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      return bindings.map((b) => b.knowledgeBase)
    },
  }
}

export type KnowledgeStore = ReturnType<typeof createKnowledgeStore>
