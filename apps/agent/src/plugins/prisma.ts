import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { AppPrismaClient } from './prisma-types.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: AppPrismaClient
  }
}

export default fp(async (fastify) => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter }) as AppPrismaClient
  fastify.decorate('prisma', prisma)
  fastify.addHook('onClose', () => prisma.$disconnect())
}, { name: 'prisma' })
