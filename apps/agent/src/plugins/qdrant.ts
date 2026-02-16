import fp from 'fastify-plugin'
import { QdrantClient } from '@qdrant/js-client-rest'

declare module 'fastify' {
  interface FastifyInstance {
    qdrant: QdrantClient
  }
}

export default fp(async (fastify) => {
  const client = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
  })
  fastify.decorate('qdrant', client)
}, { name: 'qdrant' })
