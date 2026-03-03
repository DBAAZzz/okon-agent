"use client";

import { useState, useCallback, useRef } from "react";
import type { StreamEvent, ApprovalRequestPart } from "@okon/shared";

export type Message = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
};

export function useSSEStream(sessionId: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequestPart[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentTextRef = useRef("");
  const currentReasoningRef = useRef("");

  const closeConnection = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const updateLastMessage = useCallback(() => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next.length - 1;
      if (last >= 0 && next[last].role === "assistant") {
        next[last] = {
          ...next[last],
          content: currentTextRef.current,
          reasoning: currentReasoningRef.current || undefined,
        };
      }
      return next;
    });
  }, []);

  const startStream = useCallback(
    (url: string) => {
      closeConnection();
      currentTextRef.current = "";
      currentReasoningRef.current = "";
      setError(null);
      setIsStreaming(true);

      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // 添加 assistant 占位消息
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      eventSource.onmessage = (event) => {
        try {
          const data: StreamEvent = JSON.parse(event.data);

          switch (data.type) {
            case "text_delta":
              currentTextRef.current += data.delta;
              updateLastMessage();
              break;

            case "reasoning_delta":
              currentReasoningRef.current += data.delta;
              updateLastMessage();
              break;

            case "approval_request":
              setPendingApprovals(data.approvals);
              break;

            case "done":
              setIsStreaming(false);
              closeConnection();
              break;

            case "error":
              setError(data.message);
              setIsStreaming(false);
              closeConnection();
              break;

            // 其他事件暂不处理，后续按需扩展
            default:
              break;
          }
        } catch (err) {
          console.error("Failed to parse SSE event:", err);
        }
      };

      eventSource.onerror = () => {
        setError("连接错误，请重试");
        setIsStreaming(false);
        closeConnection();
      };
    },
    [closeConnection, updateLastMessage],
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setPendingApprovals([]);

      const url = `/api/chat/stream?sessionId=${encodeURIComponent(sessionId)}&message=${encodeURIComponent(text)}`;
      startStream(url);
    },
    [sessionId, startStream],
  );

  const continueAfterApproval = useCallback(() => {
    setPendingApprovals([]);

    const url = `/api/chat/continue?sessionId=${encodeURIComponent(sessionId)}`;
    startStream(url);
  }, [sessionId, startStream]);

  return {
    messages,
    setMessages,
    pendingApprovals,
    isStreaming,
    error,
    sendMessage,
    continueAfterApproval,
    setPendingApprovals,
  };
}
