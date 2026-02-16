export interface SparseVector {
  indices: number[]
  values: number[]
}

export type SearchMode = 'dense' | 'sparse' | 'hybrid'

export interface PointData<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string
  payload: T
  embedding: number[]
  sparseVector?: SparseVector
}

export interface SearchResult<T extends Record<string, unknown> = Record<string, unknown>> {
  point: PointData<T>
  score: number
}
