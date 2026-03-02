import type { BotRecord, SessionRecord } from './api';

export type ToolDetail = {
  toolCallId: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: {
    id: string;
    approved?: boolean;
    reason?: string;
  };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  tools?: ToolDetail[];
};

export type Bot = BotRecord;

export type Session = SessionRecord;
