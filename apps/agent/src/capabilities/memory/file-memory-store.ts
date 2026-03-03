import { randomUUID } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from '@okon/shared'
import {
  MEMORY_CATEGORIES,
  type MemoryAction,
  type MemoryCategory,
  type MemoryPriority,
} from './types.js'

const logger = createLogger('file-memory-store')
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_ACTIVE_FOR_FULL_INJECTION = 100
const MAX_NON_P0_INJECTION = 30
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT_DIR = path.resolve(MODULE_DIR, '../../../data/memory')

const MEMORY_TEMPLATE = `# Bot 记忆

## preference

## fact

## entity

## lesson

## intent
`

const ARCHIVE_TEMPLATE = `# 归档记忆
`

const CATEGORY_SET = new Set<MemoryCategory>(MEMORY_CATEGORIES)
const CATEGORY_RANK: Record<MemoryCategory, number> = {
  preference: 0,
  fact: 1,
  entity: 2,
  lesson: 3,
  intent: 4,
}

type ParsedMemoryLine = {
  line: string
  index: number
  category: MemoryCategory
  priority: MemoryPriority
  content: string
  id: string
  sessionId: string
  updated: string
  updatedAt: number
}

// 单进程内串行化写操作，避免 read-modify-write 并发覆盖。
class WriteQueue {
  private queue: Promise<void> = Promise.resolve()

  enqueue(fn: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(fn, fn)
    return this.queue
  }
}

function toDateOnly(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function buildMemoryId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8)
}

function normalizeLineBreaks(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

function splitLines(content: string): string[] {
  return normalizeLineBreaks(content).split('\n')
}

function parseCategoryHeading(line: string): MemoryCategory | null {
  const match = line.trim().match(/^##\s+([a-z]+)\s*$/)
  if (!match) return null
  const value = match[1] as MemoryCategory
  return CATEGORY_SET.has(value) ? value : null
}

function parseMemoryBullet(
  line: string,
): Omit<ParsedMemoryLine, 'index' | 'category' | 'line' | 'updatedAt'> | null {
  // 仅识别符合规范的记忆行；格式不匹配直接忽略，保证解析稳健。
  const match = line.trim().match(
    /^-\s+\[(P[012])\]\s+(.+?)\s+<!--\s*id:([^\s]+)\s+session:([^\s]+)\s+updated:([^\s]+)\s*-->$/,
  )
  if (!match) return null
  return {
    priority: match[1] as MemoryPriority,
    content: match[2],
    id: match[3],
    sessionId: match[4],
    updated: match[5],
  }
}

function parseActiveMemories(content: string): ParsedMemoryLine[] {
  // 从 Markdown 中提取有效 active 记忆，按分类标题挂接归属。
  const lines = splitLines(content)
  const parsed: ParsedMemoryLine[] = []
  let currentCategory: MemoryCategory | null = null

  for (const [index, line] of lines.entries()) {
    const category = parseCategoryHeading(line)
    if (category) {
      currentCategory = category
      continue
    }
    if (!currentCategory) continue

    const bullet = parseMemoryBullet(line)
    if (!bullet) continue

    const updatedAt = Number.isNaN(Date.parse(bullet.updated))
      ? 0
      : new Date(bullet.updated).getTime()

    parsed.push({
      ...bullet,
      line,
      index,
      category: currentCategory,
      updatedAt,
    })
  }

  return parsed
}

function formatMemories(entries: ParsedMemoryLine[]): string {
  // 将内存结构重新组装为标准 Markdown，供 prompt 注入与人工审阅。
  if (entries.length === 0) return ''

  const grouped = new Map<MemoryCategory, ParsedMemoryLine[]>()
  for (const category of MEMORY_CATEGORIES) grouped.set(category, [])
  for (const entry of entries) {
    grouped.get(entry.category)?.push(entry)
  }

  const sections: string[] = ['# Bot 记忆']
  for (const category of MEMORY_CATEGORIES) {
    const values = grouped.get(category) ?? []
    if (values.length === 0) continue
    sections.push('', `## ${category}`)
    for (const item of values) {
      sections.push(
        `- [${item.priority}] ${item.content} <!-- id:${item.id} session:${item.sessionId} updated:${item.updated} -->`,
      )
    }
  }

  sections.push('')
  return sections.join('\n')
}

function pickMemoriesForPrompt(content: string): string {
  // 超过阈值时仅注入全部 P0 + 最近更新的 30 条非 P0，控制上下文长度。
  const parsed = parseActiveMemories(content)
  if (parsed.length === 0) return ''
  if (parsed.length <= MAX_ACTIVE_FOR_FULL_INJECTION) return content

  const p0 = parsed.filter((m) => m.priority === 'P0')
  const nonP0 = parsed
    .filter((m) => m.priority !== 'P0')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_NON_P0_INJECTION)

  const selectedIds = new Set([...p0, ...nonP0].map((m) => m.id))
  const selected = parsed
    .filter((m) => selectedIds.has(m.id))
    .sort(
      (a, b) =>
        CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || b.updatedAt - a.updatedAt,
    )

  return formatMemories(selected)
}

function hasMemoryId(content: string, targetId: string): boolean {
  const escaped = targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<!--\\s*id:${escaped}(\\s|$)`).test(content)
}

function findMemoryLine(lines: string[], targetId: string): { index: number; line: string } | null {
  const escaped = targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`<!--\\s*id:${escaped}(\\s|$)`)
  for (const [index, line] of lines.entries()) {
    if (pattern.test(line)) return { index, line }
  }
  return null
}

function inferCategoryFromContent(content: string): MemoryCategory {
  const text = content.toLowerCase()
  if (
    /偏好|习惯|风格|统一|不要|建议使用|reply|tone|style|always|prefer/.test(text)
  ) {
    return 'preference'
  }
  if (/目标|计划|待办|打算|将要|roadmap|todo|plan|intent/.test(text)) {
    return 'intent'
  }
  if (/经验|教训|踩坑|解决方案|排查|故障|lesson|fix/.test(text)) {
    return 'lesson'
  }
  if (/关系|负责人|属于|owner|entity/.test(text)) {
    return 'entity'
  }
  return 'fact'
}

function appendUnderCategory(
  content: string,
  category: MemoryCategory,
  line: string,
): string {
  // 在目标分类段末尾插入一条记忆，不打乱其他分类顺序。
  let lines = splitLines(content)
  let headingIndex = lines.findIndex((l) => l.trim() === `## ${category}`)

  if (headingIndex < 0) {
    const ensured = ensureTemplate(content)
    lines = splitLines(ensured)
    headingIndex = lines.findIndex((l) => l.trim() === `## ${category}`)
  }

  let insertAt = headingIndex + 1
  while (insertAt < lines.length && !lines[insertAt].trim().startsWith('## ')) {
    insertAt += 1
  }

  lines.splice(insertAt, 0, line)
  return lines.join('\n')
}

function ensureTemplate(content: string): string {
  // 兜底补齐文档头和所有分类，保证后续插入逻辑总可执行。
  const normalized = normalizeLineBreaks(content).trim()
  if (!normalized) return MEMORY_TEMPLATE

  let lines = splitLines(content)
  if (!lines[0]?.startsWith('#')) {
    lines = splitLines(`${MEMORY_TEMPLATE.trim()}\n\n${content}`)
  }

  for (const category of MEMORY_CATEGORIES) {
    if (!lines.some((line) => line.trim() === `## ${category}`)) {
      if (lines[lines.length - 1]?.trim() !== '') lines.push('')
      lines.push(`## ${category}`, '')
    }
  }

  return lines.join('\n')
}

function insertMemory(
  content: string,
  payload: {
    category: MemoryCategory
    priority: MemoryPriority
    content: string
  },
  sessionId: number,
): string {
  const line = `- [${payload.priority}] ${payload.content} <!-- id:${buildMemoryId()} session:${sessionId} updated:${toDateOnly()} -->`
  return appendUnderCategory(content, payload.category, line)
}

function replaceMemory(
  content: string,
  action: Extract<MemoryAction, { action: 'update' }>,
  sessionId: number,
): string {
  // 原地替换 targetId 对应行，保留 id 并刷新来源 session 与更新时间。
  const lines = splitLines(content)
  const target = findMemoryLine(lines, action.targetId)
  if (!target) return content

  lines[target.index] =
    `- [${action.priority}] ${action.content} ` +
    `<!-- id:${action.targetId} session:${sessionId} updated:${toDateOnly()} -->`
  return lines.join('\n')
}

function removeMemory(
  content: string,
  targetId: string,
): { updated: string; removedLine?: string } {
  // 删除 active 记忆并返回原始行，供 archive 追加审计痕迹。
  const lines = splitLines(content)
  const target = findMemoryLine(lines, targetId)
  if (!target) return { updated: content }

  lines.splice(target.index, 1)
  return { updated: lines.join('\n'), removedLine: target.line.trim() }
}

function toArchiveLine(line: string, reason: 'delete' | 'expired'): string {
  const date = toDateOnly()
  const parsed = parseMemoryBullet(line)
  if (!parsed) return `- ~~${line.replace(/^-+\s*/, '')}~~ <!-- archived:${date} reason:${reason} -->`
  return `- ~~[${parsed.priority}] ${parsed.content}~~ <!-- id:${parsed.id} session:${parsed.sessionId} archived:${date} reason:${reason} -->`
}

function trimTrailingEmptyLines(content: string): string {
  return `${content.replace(/\s+$/g, '')}\n`
}

function parseBotId(name: string): number | null {
  const parsed = Number(name)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

export function createFileMemoryStore(rootDir = process.env.MEMORY_DIR || DEFAULT_ROOT_DIR) {
  const writeQueue = new WriteQueue()
  const lastExpireCleanAt = new Map<number, number>()

  function getBotDir(botId: number): string {
    return path.join(rootDir, String(botId))
  }

  function getMemoriesPath(botId: number): string {
    return path.join(getBotDir(botId), 'memories.md')
  }

  function getArchivePath(botId: number): string {
    return path.join(getBotDir(botId), 'archive.md')
  }

  async function readMemoryFile(botId: number): Promise<string> {
    const filepath = getMemoriesPath(botId)
    try {
      return await fs.readFile(filepath, 'utf-8')
    } catch {
      return ''
    }
  }

  async function ensureBotDir(botId: number): Promise<void> {
    await fs.mkdir(getBotDir(botId), { recursive: true })
  }

  async function writeAtomically(filepath: string, content: string): Promise<void> {
    // tmp + rename 原子替换，避免进程中断导致半写入文件。
    const tmp = `${filepath}.tmp`
    await fs.writeFile(tmp, trimTrailingEmptyLines(content), 'utf-8')
    await fs.rename(tmp, filepath)
  }

  async function updateMemoryFile(
    botId: number,
    updater: (content: string) => string,
  ): Promise<void> {
    // 标准 read-modify-write 封装，统一入口保证模板兜底与原子写。
    await ensureBotDir(botId)
    const filepath = getMemoriesPath(botId)
    const content = await fs.readFile(filepath, 'utf-8').catch(() => MEMORY_TEMPLATE)
    const updated = updater(content)
    await writeAtomically(filepath, updated)
  }

  async function appendToArchive(botId: number, lines: string[]): Promise<void> {
    // 归档失败不影响主流程，但尽量保留删除/过期轨迹。
    if (lines.length === 0) return
    await ensureBotDir(botId)
    const filepath = getArchivePath(botId)
    const content = await fs.readFile(filepath, 'utf-8').catch(() => ARCHIVE_TEMPLATE)
    const body = content.endsWith('\n') ? content : `${content}\n`
    const updated = `${body}${lines.join('\n')}\n`
    await writeAtomically(filepath, updated)
  }

  async function loadAll(botId: number): Promise<string> {
    const content = await readMemoryFile(botId)
    return content.trim() ? content : ''
  }

  async function load(botId: number): Promise<string> {
    const content = await readMemoryFile(botId)
    return pickMemoriesForPrompt(content)
  }

  async function applyActions(
    botId: number,
    actions: MemoryAction[],
    sessionId: number,
  ): Promise<void> {
    // 执行 LLM 输出动作：create/update/delete，并处理 update 降级与删除归档。
    if (actions.length === 0) return

    await writeQueue.enqueue(async () => {
      const archiveLines: string[] = []

      await updateMemoryFile(botId, (raw) => {
        let content = ensureTemplate(raw)

        for (const action of actions) {
          if (action.action === 'create') {
            content = insertMemory(content, action, sessionId)
            continue
          }

          if (action.action === 'update') {
            if (hasMemoryId(content, action.targetId)) {
              content = replaceMemory(content, action, sessionId)
            } else {
              logger.warn('update targetId 不存在，降级为 create', {
                botId,
                targetId: action.targetId,
              })
              content = insertMemory(
                content,
                {
                  category: inferCategoryFromContent(action.content),
                  priority: action.priority,
                  content: action.content,
                },
                sessionId,
              )
            }
            continue
          }

          if (hasMemoryId(content, action.targetId)) {
            const removed = removeMemory(content, action.targetId)
            content = removed.updated
            if (removed.removedLine) {
              archiveLines.push(toArchiveLine(removed.removedLine, 'delete'))
            }
          } else {
            logger.warn('delete targetId 不存在，跳过', {
              botId,
              targetId: action.targetId,
            })
          }
        }

        return content
      })

      if (archiveLines.length > 0) {
        await appendToArchive(botId, archiveLines).catch((err) => {
          logger.warn('archive 写入失败，不影响主流程', err)
        })
      }
    })
  }

  async function cleanExpired(botId: number): Promise<void> {
    // 生命周期规则：P1 90 天，P2 30 天，P0 不过期。
    await writeQueue.enqueue(async () => {
      const archiveLines: string[] = []
      const now = Date.now()

      await updateMemoryFile(botId, (raw) => {
        const lines = splitLines(ensureTemplate(raw))
        const kept: string[] = []

        for (const line of lines) {
          const parsed = parseMemoryBullet(line)
          if (!parsed) {
            kept.push(line)
            continue
          }

          const updatedAt = Date.parse(parsed.updated)
          if (Number.isNaN(updatedAt)) {
            kept.push(line)
            continue
          }

          const age = now - updatedAt
          const maxAge =
            parsed.priority === 'P1'
              ? 90 * DAY_MS
              : parsed.priority === 'P2'
                ? 30 * DAY_MS
                : Number.POSITIVE_INFINITY

          if (age > maxAge) {
            archiveLines.push(toArchiveLine(line, 'expired'))
            continue
          }

          kept.push(line)
        }

        return kept.join('\n')
      })

      if (archiveLines.length > 0) {
        await appendToArchive(botId, archiveLines).catch((err) => {
          logger.warn('archive 写入失败，不影响主流程', err)
        })
      }
    })
  }

  async function maybeCleanExpired(botId: number): Promise<void> {
    // 单 bot 每天最多清理一次，降低运行时额外 IO 开销。
    const now = Date.now()
    const last = lastExpireCleanAt.get(botId) ?? 0
    if (now - last < DAY_MS) return
    lastExpireCleanAt.set(botId, now)

    try {
      await cleanExpired(botId)
    } catch (err) {
      lastExpireCleanAt.delete(botId)
      throw err
    }
  }

  async function cleanExpiredForAllBots(): Promise<void> {
    // 启动时批量清理历史过期记忆，避免长期积压。
    let entries: Dirent[] = []
    try {
      entries = await fs.readdir(rootDir, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const botId = parseBotId(entry.name)
      if (!botId) continue
      try {
        await cleanExpired(botId)
      } catch (err) {
        logger.warn('批量清理过期记忆失败，跳过当前 bot', { botId, err })
      }
    }
  }

  return {
    load,
    loadAll,
    applyActions,
    cleanExpired,
    maybeCleanExpired,
    cleanExpiredForAllBots,
    getRootDir: () => rootDir,
  }
}

export type FileMemoryStore = ReturnType<typeof createFileMemoryStore>
