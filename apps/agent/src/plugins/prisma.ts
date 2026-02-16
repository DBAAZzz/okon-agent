import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export default fp(async (fastify) => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })
  fastify.decorate('prisma', prisma)
  fastify.addHook('onClose', () => prisma.$disconnect())
}, { name: 'prisma' })
