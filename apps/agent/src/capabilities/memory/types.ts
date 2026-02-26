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

export const MEMORY_CATEGORIES = [
  'preference',
  'fact',
  'entity',
  'lesson',
  'intent',
] as const

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]
export type MemoryPriority = 'P0' | 'P1' | 'P2'

export type MemoryAction =
  | {
      action: 'create'
      content: string
      category: MemoryCategory
      priority: MemoryPriority
    }
  | {
      action: 'update'
      targetId: string
      content: string
      priority: MemoryPriority
    }
  | {
      action: 'delete'
      targetId: string
    }
