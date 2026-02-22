import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { createLogger } from '@okon/shared'
import { validateFile, parseFile } from '../utils/file-parser.js'
import { splitText } from '../utils/chunker.js'
import { knowledgeStore } from '../capabilities/knowledge/index.js'

const logger = createLogger('upload')

export async function registerUploadRoutes(fastify: FastifyInstance) {
  // 注册 multipart 插件
  await fastify.register(import('@fastify/multipart'), {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB
    },
  })

  fastify.post<{
    Params: { kbId: string }
  }>('/api/knowledge-base/:kbId/upload', async (request, reply) => {
    const kbId = Number(request.params.kbId)
    if (!Number.isFinite(kbId) || kbId <= 0) {
      return reply.status(400).send({ error: '无效的知识库 ID' })
    }

    // 检查知识库是否存在
    const kb = await knowledgeStore.get(kbId)
    if (!kb) {
      return reply.status(404).send({ error: '知识库不存在' })
    }

    const file = await request.file()
    if (!file) {
      return reply.status(400).send({ error: '未上传文件' })
    }

    const buffer = await file.toBuffer()
    const fileName = file.filename

    // 校验文件类型和大小
    const validation = validateFile(fileName, buffer.length)
    if (!validation.ok) {
      return reply.status(400).send({ error: validation.error })
    }

    // checksum 去重
    const checksum = createHash('sha256').update(buffer).digest('hex')
    const existing = await knowledgeStore.findSourceFileByChecksum(kbId, checksum)
    if (existing) {
      return reply.status(409).send({
        error: '该文件已存在于当前知识库中',
        sourceFileId: existing.id,
        fileName: existing.fileName,
      })
    }

    // 解析文件
    let text: string
    try {
      text = await parseFile(buffer, validation.fileType)
    } catch (err) {
      logger.error('文件解析失败', err)
      return reply.status(422).send({ error: '文件解析失败' })
    }

    if (!text.trim()) {
      return reply.status(422).send({ error: '文件内容为空' })
    }

    // 分块
    const chunks = splitText(text)
    logger.info('文件分块完成', { fileName, chunks: chunks.length })

    // 创建 SourceFile
    const sourceFile = await knowledgeStore.createSourceFile(
      kbId,
      fileName,
      validation.fileType,
      buffer.length,
      checksum,
    )

    // 批量入库
    try {
      await knowledgeStore.addDocumentsBatch(
        kbId,
        sourceFile.id,
        chunks.map((c) => ({
          content: c.text,
          title: `[${fileName}#${c.index}]`,
          chunkIndex: c.index,
        })),
      )
    } catch (err) {
      // 入库失败，清理 SourceFile
      logger.error('批量入库失败，回滚 SourceFile', err)
      await knowledgeStore.deleteSourceFile(sourceFile.id).catch(() => {})
      return reply.status(500).send({ error: '文档入库失败' })
    }

    return {
      sourceFileId: sourceFile.id,
      fileName,
      fileType: validation.fileType,
      fileSize: buffer.length,
      chunksCount: chunks.length,
    }
  })
}
