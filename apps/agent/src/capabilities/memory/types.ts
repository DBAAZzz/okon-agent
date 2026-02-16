export type MemoryFilter = {
  sessionId: string
  [key: string]: string
}

export interface MemoryPayload {
  content: string
  filter: MemoryFilter
  createdAt: string
}

export interface MemorySearchResult {
  id: string
  content: string
  filter: MemoryFilter
  createdAt: string
  score: number
}
