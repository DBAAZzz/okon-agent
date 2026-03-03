import fs from 'node:fs'
import { open, stat } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@okon/shared'

const logger = createLogger('tool-file-read')
const DEFAULT_LIMIT = 200

function isBinaryBuffer(buf: Buffer): boolean {
  // Check first 8KB for null bytes -- simple binary detection
  const check = buf.subarray(0, 8192)
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true
  }
  return false
}

function addLineNumbers(lines: string[], startLine: number): string {
  const maxNum = startLine + lines.length
  const pad = String(maxNum).length
  return lines
    .map((line, i) => `${String(startLine + i).padStart(pad)} | ${line}`)
    .join('\n')
}

export const fileReadTool = tool({
  description:
    '读取文件内容，返回带行号的文本。优先使用此工具而非 bash cat/head/tail。',
  inputSchema: z.object({
    filePath: z.string().describe('文件的绝对路径或相对于工作目录的路径'),
    offset: z.number().optional().describe('从第几行开始读（1-based），默认从头'),
    limit: z.number().optional().describe('最多读取行数，默认 200'),
  }),
  execute: async ({ filePath, offset, limit }) => {
    const resolved = path.resolve(filePath)

    if (!resolved.startsWith(process.cwd())) {
      return { content: '', totalLines: 0, truncated: false, error: 'Path must be within workspace directory' }
    }

    logger.info('读取文件', { filePath: resolved, offset, limit })

    try {
      // 1. Check file existence and get size via stat
      const fileStat = await stat(resolved)
      if (!fileStat.isFile()) {
        return { content: '', totalLines: 0, truncated: false, error: 'Path is not a file' }
      }

      // 2. Binary detection: read only the first 8KB instead of the whole file
      const BINARY_CHECK_SIZE = 8192
      const fh = await open(resolved, 'r')
      try {
        const probe = Buffer.alloc(Math.min(BINARY_CHECK_SIZE, fileStat.size))
        await fh.read(probe, 0, probe.length, 0)
        if (isBinaryBuffer(probe)) {
          return {
            content: `[binary file, ${fileStat.size} bytes]`,
            totalLines: 0,
            truncated: false,
          }
        }
      } finally {
        await fh.close()
      }

      // 3. Stream-based line reading with early termination
      const start = Math.max(0, (offset ?? 1) - 1) // 0-based index of first desired line
      const count = limit ?? DEFAULT_LIMIT
      const stopAfter = start + count // stop once we see this many lines (0-based)

      const selected: string[] = []
      let lineIndex = 0
      let truncated = false

      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(resolved, { encoding: 'utf-8' })
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
        let destroyed = false

        rl.on('line', (line) => {
          if (lineIndex >= start && selected.length < count) {
            selected.push(line)
          }

          lineIndex++

          // We have collected enough lines; peek one more to know if truncated
          if (lineIndex > stopAfter) {
            truncated = true
            destroyed = true
            rl.close()
            stream.destroy()
          }
        })

        rl.on('close', () => resolve())
        rl.on('error', (err) => reject(err))
        // Ignore errors from intentional stream.destroy(); surface real errors
        stream.on('error', (err) => {
          if (!destroyed) reject(err)
        })
      })

      // If we read the entire file without early termination, truncated stays false
      // totalLines is only accurate when we read the whole file; otherwise -1
      const totalLines = truncated ? -1 : lineIndex

      return {
        content: addLineNumbers(selected, start + 1),
        totalLines,
        truncated,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      logger.error('文件读取失败', { filePath: resolved, error })
      return { content: '', totalLines: 0, truncated: false, error: msg }
    }
  },
})
