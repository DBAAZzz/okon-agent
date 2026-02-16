import { tokenize } from './BM25Index.js'
import type { SparseVector } from '../capabilities/embeddings/types.js'

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

/**
 * FNV-1a 32-bit hash for stable sparse vector term indices.
 */
export function fnv1aHash(str: string): number {
  let hash = FNV_OFFSET_BASIS

  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }

  return hash >>> 0
}

/**
 * Convert text into sparse vector term-frequency format for Qdrant.
 * IDF is applied by Qdrant server-side when sparse vector modifier is `idf`.
 */
export function textToSparseVector(text: string): SparseVector {
  const tokens = tokenize(text)
  const termFreqByIndex = new Map<number, number>()

  for (const token of tokens) {
    const index = fnv1aHash(token)
    termFreqByIndex.set(index, (termFreqByIndex.get(index) ?? 0) + 1)
  }

  const entries = [...termFreqByIndex.entries()].sort((a, b) => a[0] - b[0])

  return {
    indices: entries.map(([index]) => index),
    values: entries.map(([, frequency]) => frequency),
  }
}
