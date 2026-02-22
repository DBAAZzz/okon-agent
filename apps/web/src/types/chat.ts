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
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  tools?: ToolDetail[];
};

export type Bot = {
  id: number;
  name: string;
  provider: string;
  model: string;
  baseURL?: string | null;
  apiKey?: string | null;
  systemPrompt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Session = {
  id: number;
  title: string | null;
  bot: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
};
