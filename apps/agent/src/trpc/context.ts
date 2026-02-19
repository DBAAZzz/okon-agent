import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { createEmbeddings, type Embeddings } from '../capabilities/embeddings/index.js'
import { knowledgeStore } from '../capabilities/knowledge/index.js'
import '../plugins/qdrant.js'
import '../plugins/prisma.js'

let _embeddings: Embeddings | null = null

export function createContext({ req, res }: CreateFastifyContextOptions) {
  const qdrant = req.server.qdrant
  const embeddings = (_embeddings ??= createEmbeddings(qdrant))
  return { req, res, qdrant, embeddings, knowledgeStore }
}

export type Context = Awaited<ReturnType<typeof createContext>>
