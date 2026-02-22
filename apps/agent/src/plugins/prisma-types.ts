import type { PrismaClient } from '@prisma/client'

type AnyArgs = Record<string, unknown>

/**
 * App 侧使用的 Prisma 类型补丁：
 * 某些环境里 @prisma/client 生成产物滞后时，先保证 channel 代码可通过类型检查。
 */
export type AppPrismaClient = PrismaClient & {
  channelConfig: {
    findMany(args?: AnyArgs): Promise<any[]>
    upsert(args: AnyArgs): Promise<any>
    delete(args: AnyArgs): Promise<any>
  }
  channelMapping: {
    findUnique(args: AnyArgs): Promise<{ sessionId: number } | null>
    create(args: AnyArgs): Promise<any>
  }
}
