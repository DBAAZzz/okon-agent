import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@okon/shared'

const logger = createLogger('tool-file-edit')

function countOccurrences(text: string, search: string): number {
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++
    pos += search.length
  }
  return count
}

export const fileEditTool = tool({
  description:
    '对文件执行精确的搜索替换编辑。使用前必须先 read 文件确保 oldString 精确匹配。',
  inputSchema: z.object({
    filePath: z.string().describe('文件路径'),
    oldString: z.string().min(1).describe('要被替换的原始文本（必须精确匹配）'),
    newString: z.string().describe('替换后的新文本'),
    replaceAll: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否替换所有匹配项，默认只替换第一个'),
  }),
  execute: async ({ filePath, oldString, newString, replaceAll }) => {
    if (oldString === '') {
      return {
        success: false,
        matchCount: 0,
        replacedCount: 0,
        error: 'oldString must not be empty.',
      }
    }

    const resolved = path.resolve(filePath)

    if (!resolved.startsWith(process.cwd())) {
      return { success: false, matchCount: 0, replacedCount: 0, error: 'Path must be within workspace directory' }
    }

    logger.info('编辑文件', { filePath: resolved, replaceAll })

    try {
      const content = await fs.readFile(resolved, 'utf-8')
      const matchCount = countOccurrences(content, oldString)

      if (matchCount === 0) {
        return {
          success: false,
          matchCount: 0,
          replacedCount: 0,
          error: 'oldString not found in file. Use read tool first to verify exact content.',
        }
      }

      if (matchCount > 1 && !replaceAll) {
        return {
          success: false,
          matchCount,
          replacedCount: 0,
          error: `Found ${matchCount} matches. Provide more context in oldString to uniquely identify the target, or set replaceAll: true.`,
        }
      }

      let updated: string
      let replacedCount: number

      if (replaceAll) {
        updated = content.split(oldString).join(newString)
        replacedCount = matchCount
      } else {
        // Replace first occurrence only
        const idx = content.indexOf(oldString)
        updated =
          content.slice(0, idx) + newString + content.slice(idx + oldString.length)
        replacedCount = 1
      }

      // Atomic write
      const tmp = `${resolved}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
      await fs.writeFile(tmp, updated, 'utf-8')
      await fs.rename(tmp, resolved)

      return { success: true, matchCount, replacedCount }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      logger.error('文件编辑失败', { filePath: resolved, error })
      return { success: false, matchCount: 0, replacedCount: 0, error: msg }
    }
  },
})
