import { createRequire } from 'node:module'
import { Jieba } from '@node-rs/jieba'

const require = createRequire(import.meta.url)
const { dict } = require('@node-rs/jieba/dict') as { dict: Uint8Array }
const jieba = Jieba.withDict(dict)

/** jieba 分词，过滤标点和空白 */
export function tokenize(text: string): string[] {
  const words = jieba.cutForSearch(text, true)
  const tokens: string[] = []
  for (const w of words) {
    const trimmed = w.trim()
    if (!trimmed) continue
    if (/^[\p{P}\p{S}\p{Z}]+$/u.test(trimmed)) continue
    tokens.push(trimmed.toLowerCase())
  }
  return tokens
}

interface DocEntry {
  tf: Map<string, number>
  length: number
}

export class BM25Index {
  private k1: number
  private b: number
  private docs = new Map<string, DocEntry>()
  private df = new Map<string, number>()
  private totalLength = 0

  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1
    this.b = b
  }

  get size() {
    return this.docs.size
  }

  private get avgDl() {
    return this.docs.size === 0 ? 0 : this.totalLength / this.docs.size
  }

  add(id: string, content: string) {
    if (this.docs.has(id)) this.remove(id)

    const tokens = tokenize(content)
    const tf = new Map<string, number>()
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1)
    }

    this.docs.set(id, { tf, length: tokens.length })
    this.totalLength += tokens.length

    for (const term of tf.keys()) {
      this.df.set(term, (this.df.get(term) ?? 0) + 1)
    }
  }

  remove(id: string) {
    const doc = this.docs.get(id)
    if (!doc) return

    this.totalLength -= doc.length
    for (const term of doc.tf.keys()) {
      const count = this.df.get(term)!
      if (count <= 1) this.df.delete(term)
      else this.df.set(term, count - 1)
    }
    this.docs.delete(id)
  }

  search(query: string, topK = 10): Array<{ id: string; score: number }> {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0 || this.docs.size === 0) return []

    const N = this.docs.size
    const avgDl = this.avgDl
    const scores: Array<{ id: string; score: number }> = []

    for (const [id, doc] of this.docs) {
      let score = 0
      for (const term of queryTokens) {
        const termTf = doc.tf.get(term) ?? 0
        if (termTf === 0) continue

        const termDf = this.df.get(term) ?? 0
        const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1)
        const tfNorm =
          (termTf * (this.k1 + 1)) /
          (termTf + this.k1 * (1 - this.b + this.b * (doc.length / avgDl)))
        score += idf * tfNorm
      }
      if (score > 0) scores.push({ id, score })
    }

    scores.sort((a, b) => b.score - a.score)
    return scores.slice(0, topK)
  }

  /** 获取文本的 BM25 term weights，用于稀疏向量转换 */
  getTermWeights(text: string): Map<string, number> {
    const tokens = tokenize(text)
    const N = this.docs.size
    const tf = new Map<string, number>()
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1)
    }

    const weights = new Map<string, number>()
    for (const [term, freq] of tf) {
      const termDf = this.df.get(term) ?? 0
      const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1)
      weights.set(term, idf * freq)
    }
    return weights
  }
}
