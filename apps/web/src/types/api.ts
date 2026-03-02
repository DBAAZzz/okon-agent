import type {
  AppRouterInputs,
  AppRouterOutputs,
} from '@okon/agent/src/trpc/router';

type SerializeDate<T> = T extends Date
  ? string
  : T extends Array<infer Item>
    ? SerializeDate<Item>[]
    : T extends object
      ? { [Key in keyof T]: SerializeDate<T[Key]> }
      : T;

export type ApiInputs = AppRouterInputs;
export type ApiOutputs = SerializeDate<AppRouterOutputs>;

export type BotRecord = ApiOutputs['bot']['list'][number];
export type SessionRecord = ApiOutputs['session']['list'][number];
export type ChannelRecord = ApiOutputs['channel']['list'][number];

export type KnowledgeBaseRecord = ApiOutputs['knowledgeBase']['list'][number];
export type SourceFileRecord = ApiOutputs['knowledgeBase']['listSourceFiles'][number];
export type ChunkRecord = ApiOutputs['knowledgeBase']['listChunks'][number];
export type KnowledgeSearchResult = ApiOutputs['knowledgeBase']['search'][number];

export type CompactionSummaryRecord = ApiOutputs['compaction']['getSessionSummaries'][number];
export type TokenUsageSummary = ApiOutputs['tokenUsage']['getSessionSummary'];
