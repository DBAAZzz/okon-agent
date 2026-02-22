/**
 * 递归字符分割器 — 按分隔符优先级切分文本，保证语义完整性
 */

const DEFAULT_SEPARATORS = ['\n\n', '\n', '。', '.', ' ']
const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 200

export interface ChunkOptions {
  chunkSize?: number
  chunkOverlap?: number
  separators?: string[]
}

export interface Chunk {
  text: string
  index: number
}

export function splitText(text: string, options?: ChunkOptions): Chunk[] {
  const size = options?.chunkSize ?? CHUNK_SIZE
  const overlap = options?.chunkOverlap ?? CHUNK_OVERLAP
  const separators = options?.separators ?? DEFAULT_SEPARATORS

  const chunks = recursiveSplit(text, separators, size, overlap)
  return chunks.map((text, index) => ({ text, index }))
}

function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  if (text.length <= chunkSize) {
    return text.trim() ? [text.trim()] : []
  }

  // 找到能在文本中命中的最高优先级分隔符
  const sep = separators.find((s) => text.includes(s))
  if (!sep) {
    // 没有分隔符可用，硬切
    return hardSplit(text, chunkSize, chunkOverlap)
  }

  const parts = text.split(sep)
  const remaining = separators.slice(separators.indexOf(sep) + 1)
  const result: string[] = []
  let current = ''

  for (const part of parts) {
    const candidate = current ? current + sep + part : part

    if (candidate.length <= chunkSize) {
      current = candidate
      continue
    }

    // 当前累积的 chunk 已满，推入结果
    if (current.trim()) {
      result.push(current.trim())
    }

    // 如果单个 part 超过 chunkSize，递归用更细的分隔符继续切
    if (part.length > chunkSize && remaining.length > 0) {
      result.push(...recursiveSplit(part, remaining, chunkSize, chunkOverlap))
      current = ''
    } else if (part.length > chunkSize) {
      result.push(...hardSplit(part, chunkSize, chunkOverlap))
      current = ''
    } else {
      current = part
    }
  }

  if (current.trim()) {
    result.push(current.trim())
  }

  // 应用 overlap
  return applyOverlap(result, chunkOverlap)
}

function hardSplit(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    start += chunkSize - chunkOverlap
  }

  return chunks
}

function applyOverlap(chunks: string[], overlap: number): string[] {
  if (chunks.length <= 1 || overlap <= 0) return chunks

  const result: string[] = [chunks[0]]

  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]
    // 从上一个 chunk 末尾取 overlap 字符作为前缀
    const overlapText = prev.slice(-overlap)
    result.push(overlapText + chunks[i])
  }

  return result
}
