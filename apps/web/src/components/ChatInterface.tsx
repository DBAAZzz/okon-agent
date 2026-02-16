'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSSEStream } from '@/hooks/useSSEStream';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ApprovalRequest } from './ApprovalRequest';
import { trpc } from '@/lib/trpc';
import type { Message } from '@/hooks/useSSEStream';

type Props = {
  sessionId: string;
};

export function ChatInterface({ sessionId }: Props) {
  const {
    messages,
    setMessages,
    pendingApprovals,
    isStreaming,
    error,
    sendMessage,
    continueAfterApproval,
    setPendingApprovals
  } = useSSEStream(sessionId);

  // 切换会话时从 DB 加载历史消息
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const { history } = await trpc.chat.getHistory.query({ sessionId });
        if (cancelled) return;
        // 将 DB 中的 ModelMessage 转为前端 Message 格式
        const msgs: Message[] = [];
        for (const msg of history) {
          const m = msg as any;
          if (m.role === 'user' && typeof m.content === 'string') {
            msgs.push({ role: 'user', content: m.content });
          } else if (m.role === 'assistant') {
            // assistant content 可能是数组或字符串
            const text = Array.isArray(m.content)
              ? m.content
                  .filter((p: any) => p.type === 'text')
                  .map((p: any) => p.text)
                  .join('')
              : typeof m.content === 'string'
                ? m.content
                : '';
            if (text) {
              msgs.push({ role: 'assistant', content: text });
            }
          }
        }
        setMessages(msgs);
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [sessionId, setMessages]);

  const handleApproval = useCallback(async (approvalId: string, approved: boolean) => {
    try {
      const result = await trpc.approval.respond.mutate({
        sessionId,
        approvalId,
        approved,
        reason: approved ? 'User approved in web UI' : 'User denied in web UI'
      });

      if (result.shouldContinue) {
        continueAfterApproval();
      }
    } catch (err) {
      console.error('Failed to respond to approval:', err);
      alert('审批响应失败，请重试');
    }
  }, [sessionId, continueAfterApproval]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Messages */}
      <MessageList messages={messages} />

      {/* Error */}
      {error ? (
        <div className="mx-4 my-2 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          <strong>错误: </strong>{error}
        </div>
      ) : null}

      {/* Streaming indicator */}
      {isStreaming && pendingApprovals.length === 0 && (
        <div className="mx-4 mb-2 text-sm text-gray-600 italic">
          AI 正在思考...
        </div>
      )}

      {/* Approval Requests */}
      <ApprovalRequest
        approvals={pendingApprovals}
        onApprove={(id) => handleApproval(id, true)}
        onDeny={(id) => handleApproval(id, false)}
      />

      {/* Input */}
      <MessageInput
        onSend={sendMessage}
        disabled={pendingApprovals.length > 0}
      />
    </div>
  );
}
