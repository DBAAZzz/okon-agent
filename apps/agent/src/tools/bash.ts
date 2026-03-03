import { execFile } from 'node:child_process'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@okon/shared'

const logger = createLogger('tool-bash')
const MAX_OUTPUT_CHARS = 8000
const DEFAULT_TIMEOUT = 30_000
const MAX_TIMEOUT = 120_000

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const half = Math.floor(max / 2) - 40
  return (
    text.slice(0, half) +
    `\n...[truncated ${text.length - max} chars]...\n` +
    text.slice(-half)
  )
}

export const bashTool = tool({
  description:
    '执行 shell 命令并返回 stdout/stderr。用于安装依赖、运行脚本、查看进程等操作。',
  inputSchema: z.object({
    command: z.string().describe('要执行的 shell 命令'),
    timeout: z
      .number()
      .optional()
      .default(30000)
      .describe('超时时间(ms)，默认 30 秒，最大 120 秒'),
    cwd: z.string().optional().describe('工作目录，默认为项目根目录'),
  }),
  execute: async ({ command, timeout, cwd }) => {
    logger.info('执行 bash 命令', { command, timeout, cwd })
    const effectiveTimeout = Math.min(timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT)
    const effectiveCwd = path.resolve(cwd || process.cwd())

    if (!effectiveCwd.startsWith(process.cwd())) {
      return { stdout: '', stderr: '', exitCode: 1, killed: false, error: 'Path must be within workspace directory' }
    }

    return new Promise((resolve) => {
      execFile(
        '/bin/sh',
        ['-c', command],
        {
          timeout: effectiveTimeout,
          cwd: effectiveCwd,
          maxBuffer: 1024 * 1024,
          killSignal: 'SIGKILL',
        },
        (error, stdout, stderr) => {
          const killed = error?.killed ?? false
          const exitCode =
            error && 'code' in error ? (error as any).code ?? 1 : error ? 1 : 0

          resolve({
            stdout: truncate(String(stdout), MAX_OUTPUT_CHARS),
            stderr: truncate(String(stderr), MAX_OUTPUT_CHARS),
            exitCode,
            killed,
          })
        },
      )
    })
  },
})
