'use client';

import { useState, useCallback, useRef } from 'react';
import type { ApprovalRequestPart } from '@okon/shared';

export type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type SSEEvent =
  | { type: 'text'; data: string }
  | { type: 'approval'; data: ApprovalRequestPart[] }
  | { type: 'done' }
  | { type: 'error'; data: string };

export function useSSEStream(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequestPart[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentMessageRef = useRef<string>('');

  const closeConnection = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const startStream = useCallback((url: string) => {
    // Close any existing connection
    closeConnection();

    // Reset current message
    currentMessageRef.current = '';
    setError(null);
    setIsStreaming(true);

    // Create SSE connection
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Add placeholder for assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);

        if (data.type === 'text') {
          // Append text chunk to current message
          currentMessageRef.current += data.data;
          setMessages(prev => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
              next[lastIndex] = {
                ...next[lastIndex],
                content: currentMessageRef.current
              };
            }
            return next;
          });
        } else if (data.type === 'approval') {
          // Set pending approvals
          setPendingApprovals(data.data);
        } else if (data.type === 'done') {
          // Stream completed
          setIsStreaming(false);
          closeConnection();
        } else if (data.type === 'error') {
          // Error occurred
          setError(data.data);
          setIsStreaming(false);
          closeConnection();
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      setError('连接错误，请重试');
      setIsStreaming(false);
      closeConnection();
    };
  }, [closeConnection]);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setPendingApprovals([]);

    // Start SSE stream with new message
    const url = `http://localhost:3001/api/chat/stream?sessionId=${encodeURIComponent(sessionId)}&message=${encodeURIComponent(text)}`;
    startStream(url);
  }, [sessionId, startStream]);

  const continueAfterApproval = useCallback(() => {
    setPendingApprovals([]);

    // Continue SSE stream without adding a new message
    const url = `http://localhost:3001/api/chat/continue?sessionId=${encodeURIComponent(sessionId)}`;
    startStream(url);
  }, [sessionId, startStream]);

  return {
    messages,
    pendingApprovals,
    isStreaming,
    error,
    sendMessage,
    continueAfterApproval,
    setPendingApprovals
  };
}
