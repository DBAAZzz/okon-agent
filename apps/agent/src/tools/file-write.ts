import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@okon/shared'

const logger = createLogger('tool-file-write')

export const fileWriteTool = tool({
  description:
    '创建或覆盖文件。自动创建父目录。优先使用此工具而非 bash echo/cat 重定向。',
  inputSchema: z.object({
    filePath: z.string().describe('文件路径'),
    content: z.string().describe('要写入的完整内容'),
  }),
  execute: async ({ filePath, content }) => {
    const resolved = path.resolve(filePath)

    if (!resolved.startsWith(process.cwd())) {
      return { success: false, bytesWritten: 0, created: false, error: 'Path must be within workspace directory' }
    }

    logger.info('写入文件', { filePath: resolved, bytes: content.length })

    try {
      let created = false
      try {
        await fs.access(resolved)
      } catch {
        created = true
      }

      // mkdir -p for parent directory
      await fs.mkdir(path.dirname(resolved), { recursive: true })

      // Atomic write: tmp + rename
      const tmp = `${resolved}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
      await fs.writeFile(tmp, content, 'utf-8')
      await fs.rename(tmp, resolved)

      const bytesWritten = Buffer.byteLength(content, 'utf-8')
      return { success: true, bytesWritten, created }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      logger.error('文件写入失败', { filePath: resolved, error })
      return { success: false, bytesWritten: 0, created: false, error: msg }
    }
  },
})
