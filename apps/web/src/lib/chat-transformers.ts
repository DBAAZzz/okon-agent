import type { UIMessage } from "ai";
import type { ApprovalRequestPart } from "@okon/shared";
import type { ChatMessage, ToolDetail } from "../types/chat";

export function isToolPart(part: any): boolean {
  return (
    part?.type === "dynamic-tool" ||
    (typeof part?.type === "string" && part.type.startsWith("tool-"))
  );
}

export function getToolName(part: any): string {
  if (part?.type === "dynamic-tool") {
    return typeof part.toolName === "string" ? part.toolName : "unknown";
  }
  if (typeof part?.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length) || "unknown";
  }
  return "unknown";
}

export function decodeToolOutput(output: unknown): {
  state: "output-available" | "output-error";
  output?: unknown;
  errorText?: string;
} {
  if (
    output &&
    typeof output === "object" &&
    "type" in (output as Record<string, unknown>)
  ) {
    const structured = output as Record<string, unknown>;
    if (structured.type === "error-text") {
      return {
        state: "output-error",
        errorText:
          typeof structured.value === "string"
            ? structured.value
            : "Tool execution failed",
      };
    }

    if ("value" in structured) {
      return {
        state: "output-available",
        output: structured.value,
      };
    }
  }

  return {
    state: "output-available",
    output,
  };
}

export function extractMessageParts(parts: any[]): {
  text: string;
  reasoning: string;
  tools: ToolDetail[];
} {
  let text = "";
  let reasoning = "";
  const tools: ToolDetail[] = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;

    if (part.type === "text" && typeof part.text === "string") {
      text += part.text;
    } else if (part.type === "reasoning" && typeof part.text === "string") {
      reasoning += part.text;
    } else if (isToolPart(part)) {
      const toolCallId =
        typeof part.toolCallId === "string"
          ? part.toolCallId
          : `${getToolName(part)}-${tools.length}`;
      const approval =
        part.approval &&
        typeof part.approval === "object" &&
        typeof part.approval.id === "string"
          ? {
              id: part.approval.id,
              approved:
                typeof part.approval.approved === "boolean"
                  ? part.approval.approved
                  : undefined,
              reason:
                typeof part.approval.reason === "string"
                  ? part.approval.reason
                  : undefined,
            }
          : undefined;
      tools.push({
        toolCallId,
        toolName: getToolName(part),
        state: typeof part.state === "string" ? part.state : "input-available",
        input: part.input,
        output: part.output,
        errorText:
          typeof part.errorText === "string" ? part.errorText : undefined,
        approval,
      });
    }
  }

  return { text: text.trim(), reasoning: reasoning.trim(), tools };
}

export function mergeToolDetails(
  existing: ToolDetail[] = [],
  incoming: ToolDetail[],
): ToolDetail[] {
  if (incoming.length === 0) return existing;
  if (existing.length === 0) return incoming;

  const order: string[] = [];
  const seen = new Set<string>();
  const map = new Map<string, ToolDetail>();

  for (const detail of existing) {
    order.push(detail.toolCallId);
    seen.add(detail.toolCallId);
    map.set(detail.toolCallId, detail);
  }

  for (const detail of incoming) {
    const prev = map.get(detail.toolCallId);
    map.set(detail.toolCallId, {
      ...prev,
      ...detail,
      approval: detail.approval ?? prev?.approval,
    });
    if (!seen.has(detail.toolCallId)) {
      order.push(detail.toolCallId);
      seen.add(detail.toolCallId);
    }
  }

  return order
    .map((id) => map.get(id))
    .filter((detail): detail is ToolDetail => !!detail);
}

export function toDisplayMessages(messages: UIMessage[]): ChatMessage[] {
  const ui: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    if (message.role === "user") {
      const { text } = extractMessageParts(message.parts as any[]);
      if (!text) continue;
      ui.push({
        role: "user",
        content: text,
      });
      continue;
    }

    const { text, reasoning, tools } = extractMessageParts(
      message.parts as any[],
    );
    const last = ui.at(-1);

    if (!text && !reasoning && tools.length === 0) {
      continue;
    }

    if (last?.role === "assistant") {
      if (text) {
        last.content = last.content ? `${last.content}\n\n${text}` : text;
      }
      if (reasoning) {
        last.reasoning = last.reasoning
          ? `${last.reasoning}\n\n${reasoning}`
          : reasoning;
      }
      if (tools.length > 0) {
        last.tools = mergeToolDetails(last.tools, tools);
      }
      continue;
    }

    ui.push({
      role: "assistant",
      content: text,
      reasoning: reasoning || undefined,
      tools: tools.length > 0 ? tools : undefined,
    });
  }

  return ui;
}

export function toHistoryUIMessages(history: any[]): UIMessage[] {
  const messages: UIMessage[] = [];
  const toolByCallId = new Map<string, any>();
  const toolByApprovalId = new Map<string, any>();

  const ensureAssistantMessage = (index: number): UIMessage => {
    const last = messages.at(-1);
    if (last?.role === "assistant") return last;

    const fallback: UIMessage = {
      id: `history-${index}-assistant-fallback`,
      role: "assistant",
      parts: [],
    };
    messages.push(fallback);
    return fallback;
  };

  const upsertToolPart = (options: {
    index: number;
    toolCallId: string;
    toolName?: string;
    input?: unknown;
  }) => {
    let toolPart = toolByCallId.get(options.toolCallId);
    if (!toolPart) {
      const hostMessage = ensureAssistantMessage(options.index);
      toolPart = {
        type: "dynamic-tool",
        toolName: options.toolName ?? "unknown",
        toolCallId: options.toolCallId,
        state: "input-available",
        input: options.input ?? {},
      };
      (hostMessage.parts as any[]).push(toolPart);
      toolByCallId.set(options.toolCallId, toolPart);
      return toolPart;
    }

    if (
      options.toolName &&
      (toolPart.toolName == null || toolPart.toolName === "unknown")
    ) {
      toolPart.toolName = options.toolName;
    }
    if (options.input !== undefined) {
      toolPart.input = options.input;
    }
    return toolPart;
  };

  for (let i = 0; i < history.length; i++) {
    const msg = history[i] as any;
    const id = `history-${i}-${msg.role ?? "unknown"}`;

    if (msg.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter(
                  (part: any) =>
                    part.type === "text" && typeof part.text === "string",
                )
                .map((part: any) => part.text)
                .join("")
            : "";
      if (!text.trim()) continue;
      messages.push({
        id,
        role: "user",
        parts: [{ type: "text", text }],
      });
      continue;
    }

    if (msg.role === "assistant") {
      const uiMessage: UIMessage = {
        id,
        role: "assistant",
        parts: [],
      };
      const parts = uiMessage.parts as any[];
      const content =
        typeof msg.content === "string"
          ? [{ type: "text", text: msg.content }]
          : Array.isArray(msg.content)
            ? msg.content
            : [];

      for (const part of content) {
        if (!part || typeof part !== "object") continue;

        if (part.type === "text" && typeof part.text === "string") {
          parts.push({ type: "text", text: part.text });
          continue;
        }

        if (part.type === "reasoning" && typeof part.text === "string") {
          parts.push({ type: "reasoning", text: part.text });
          continue;
        }

        if (part.type === "tool-call" && typeof part.toolCallId === "string") {
          const toolPart = {
            type: "dynamic-tool",
            toolName:
              typeof part.toolName === "string" ? part.toolName : "unknown",
            toolCallId: part.toolCallId,
            state: "input-available",
            input: part.input ?? part.args ?? {},
          };
          parts.push(toolPart);
          toolByCallId.set(part.toolCallId, toolPart);
          continue;
        }

        if (
          part.type === "tool-approval-request" &&
          typeof part.toolCallId === "string" &&
          typeof part.approvalId === "string"
        ) {
          const toolPart = upsertToolPart({
            index: i,
            toolCallId: part.toolCallId,
          });
          toolPart.state = "approval-requested";
          toolPart.approval = { id: part.approvalId };
          toolByApprovalId.set(part.approvalId, toolPart);
          continue;
        }

        if (
          part.type === "tool-result" &&
          typeof part.toolCallId === "string"
        ) {
          const toolPart = upsertToolPart({
            index: i,
            toolCallId: part.toolCallId,
            toolName:
              typeof part.toolName === "string" ? part.toolName : undefined,
          });
          const parsedOutput = decodeToolOutput(part.output ?? part.result);
          toolPart.state = parsedOutput.state;
          if (parsedOutput.state === "output-error") {
            toolPart.errorText = parsedOutput.errorText;
            delete toolPart.output;
          } else {
            toolPart.output = parsedOutput.output;
            delete toolPart.errorText;
          }
        }
      }

      if (parts.length > 0) {
        messages.push(uiMessage);
      }
      continue;
    }

    if (msg.role === "tool" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (!part || typeof part !== "object") continue;

        if (
          part.type === "tool-approval-response" &&
          typeof part.approvalId === "string"
        ) {
          const toolPart = toolByApprovalId.get(part.approvalId);
          if (!toolPart) continue;

          toolPart.approval = {
            id: part.approvalId,
            approved:
              typeof part.approved === "boolean" ? part.approved : undefined,
            reason: typeof part.reason === "string" ? part.reason : undefined,
          };

          if (part.approved === false) {
            toolPart.state = "output-denied";
            delete toolPart.output;
            delete toolPart.errorText;
          } else if (toolPart.state === "approval-requested") {
            toolPart.state = "approval-responded";
          }
          continue;
        }

        if (
          part.type === "tool-result" &&
          typeof part.toolCallId === "string"
        ) {
          const toolPart = upsertToolPart({
            index: i,
            toolCallId: part.toolCallId,
            toolName:
              typeof part.toolName === "string" ? part.toolName : undefined,
          });
          const parsedOutput = decodeToolOutput(part.output ?? part.result);
          toolPart.state = parsedOutput.state;
          if (parsedOutput.state === "output-error") {
            toolPart.errorText = parsedOutput.errorText;
            delete toolPart.output;
          } else {
            toolPart.output = parsedOutput.output;
            delete toolPart.errorText;
          }
        }
      }
    }
  }

  return messages;
}

export function extractPendingApprovals(
  messages: UIMessage[],
): ApprovalRequestPart[] {
  const approvals: ApprovalRequestPart[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const part of message.parts as any[]) {
      if (!isToolPart(part) || part.state !== "approval-requested") {
        continue;
      }

      const approvalId = part.approval?.id;
      if (!approvalId || seen.has(approvalId)) {
        continue;
      }

      const toolName =
        part.type === "dynamic-tool"
          ? part.toolName || "unknown"
          : String(part.type).slice("tool-".length);

      seen.add(approvalId);
      approvals.push({
        type: "tool-approval-request",
        approvalId,
        toolCall: {
          toolName,
          input: part.input ?? {},
        },
      });
    }
  }

  return approvals;
}
