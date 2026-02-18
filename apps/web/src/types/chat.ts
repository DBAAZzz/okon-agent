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
  id: string;
  name: string;
  provider: string;
  model: string;
};

export type Session = {
  id: string;
  title: string | null;
  bot: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};
