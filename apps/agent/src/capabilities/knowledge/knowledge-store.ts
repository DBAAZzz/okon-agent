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
      // 再删 Prisma（级联删除 SourceFile → Document + BotKnowledgeBase）
      await prisma.knowledgeBase.delete({ where: { id } })
    },

    async list() {
      return prisma.knowledgeBase.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { documents: true, sourceFiles: true, bots: true } } },
      })
    },

    async get(id: number) {
      return prisma.knowledgeBase.findUnique({
        where: { id },
        include: { _count: { select: { documents: true, sourceFiles: true, bots: true } } },
      })
    },

    // ── SourceFile 管理 ──

    async createSourceFile(
      knowledgeBaseId: number,
      fileName: string,
      fileType: string,
      fileSize: number,
      checksum?: string,
    ) {
      return prisma.sourceFile.create({
        data: { knowledgeBaseId, fileName, fileType, fileSize, checksum },
      })
    },

    async listSourceFiles(knowledgeBaseId: number) {
      return prisma.sourceFile.findMany({
        where: { knowledgeBaseId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { documents: true } } },
      })
    },

    async deleteSourceFile(sourceFileId: number) {
      const sourceFile = await prisma.sourceFile.findUnique({
        where: { id: sourceFileId },
        include: { documents: { select: { qdrantPointId: true, knowledgeBaseId: true } } },
      })
      if (!sourceFile) return false

      // 批量删除 Qdrant points
      const pointIds = sourceFile.documents
        .map((d) => d.qdrantPointId)
        .filter((id): id is string => !!id)
      if (pointIds.length > 0 && sourceFile.documents[0]) {
        const kbId = sourceFile.documents[0].knowledgeBaseId
        await qdrant.delete(collectionName(kbId), { points: pointIds })
          .catch((err) => logger.warn('批量删除 Qdrant points 失败', err))
      }

      // 级联删除 SourceFile → Documents
      await prisma.sourceFile.delete({ where: { id: sourceFileId } })
      logger.info('源文件已删除', { sourceFileId, chunks: sourceFile.documents.length })
      return true
    },

    async findSourceFileByChecksum(knowledgeBaseId: number, checksum: string) {
      return prisma.sourceFile.findUnique({
        where: { knowledgeBaseId_checksum: { knowledgeBaseId, checksum } },
      })
    },

    // ── 文档管理 ──

    async addDocument(
      knowledgeBaseId: number,
      content: string,
      title?: string,
      metadata?: Record<string, any>,
    ) {
      // 手动添加的文档也走 SourceFile，fileType = 'manual'
      const sourceFile = await prisma.sourceFile.create({
        data: {
          knowledgeBaseId,
          fileName: title || '手动添加',
          fileType: 'manual',
          fileSize: Buffer.byteLength(content, 'utf-8'),
        },
      })

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
          sourceFileId: sourceFile.id,
          chunkIndex: 0,
          title,
          content,
          qdrantPointId: point.id,
          metadata: metadata ?? undefined,
        },
      })

      logger.info('文档已添加', { docId: doc.id, kbId: knowledgeBaseId, qdrantPointId: point.id })
      return doc
    },

    async addDocumentsBatch(
      knowledgeBaseId: number,
      sourceFileId: number,
      chunks: { content: string; title: string; chunkIndex: number }[],
    ) {
      if (chunks.length === 0) return []

      const store = createVectorStore(qdrant, collectionName(knowledgeBaseId))

      // 1. 批量 embedding（1次 API 调用）
      const allEmbeddings = await embeddings.embedBatch(chunks.map((c) => c.content))
      // 2. 批量 sparse（本地计算）
      const allSparse = chunks.map((c) => textToSparseVector(c.content))
      // 3. 批量 Qdrant upsert
      const points = await store.addBatch(
        chunks.map((c, i) => ({
          payload: { content: c.content, title: c.title, metadata: {} },
          embedding: allEmbeddings[i],
          sparseVector: allSparse[i],
        })),
      )
      // 4. 批量 Prisma createMany
      await prisma.document.createMany({
        data: chunks.map((c, i) => ({
          knowledgeBaseId,
          sourceFileId,
          chunkIndex: c.chunkIndex,
          title: c.title,
          content: c.content,
          qdrantPointId: points[i].id,
        })),
      })

      logger.info('批量文档入库完成', { kbId: knowledgeBaseId, sourceFileId, chunks: chunks.length })
      return points
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
          chunkIndex: true,
          sourceFileId: true,
          createdAt: true,
        },
      })
    },

    async listChunks(sourceFileId: number) {
      return prisma.document.findMany({
        where: { sourceFileId },
        orderBy: { chunkIndex: 'asc' },
        select: {
          id: true,
          title: true,
          content: true,
          chunkIndex: true,
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
