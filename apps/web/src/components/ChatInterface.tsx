'use client';

import { useMemo, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ApprovalRequest } from './ApprovalRequest';
import { useChatHistory } from '@/hooks/useChatHistory';
import {
  extractPendingApprovals,
  toDisplayMessages,
} from '@/lib/chat-transformers';

type Props = {
  sessionId: number;
};

export function ChatInterface({ sessionId }: Props) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: 'http://localhost:3001/api/chat',
        body: { sessionId },
      }),
    [sessionId]
  );

  const { messages, setMessages, status, error, sendMessage, addToolApprovalResponse } = useChat({
    id: String(sessionId),
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  useChatHistory(sessionId, setMessages);

  const pendingApprovals = useMemo(() => extractPendingApprovals(messages), [messages]);
  const displayMessages = useMemo(() => toDisplayMessages(messages), [messages]);
  const isStreaming = status === 'submitted' || status === 'streaming';

  const handleSend = useCallback((text: string) => {
    if (!text.trim()) return;
    sendMessage({ text });
  }, [sendMessage]);

  const handleApproval = useCallback((approvalId: string, approved: boolean) => {
    addToolApprovalResponse({
      id: approvalId,
      approved,
      reason: approved ? 'User approved in web UI' : 'User denied in web UI',
    });
  }, [addToolApprovalResponse]);

  return (
    <section className="h-full flex flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.62))]">
      <header className="shrink-0 border-b border-[var(--line-soft)] px-4 md:px-6 py-3 bg-white/62 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-2)]">Active Session</div>
            <div className="text-sm font-semibold text-[var(--ink-1)] font-mono">#{sessionId}</div>
          </div>
          <div className="rounded-full border border-[var(--line-soft)] bg-white/80 px-3 py-1.5 text-xs text-[var(--ink-2)]">
            状态: {status === 'ready' ? '空闲' : status === 'error' ? '异常' : '处理中'}
          </div>
        </div>
      </header>

      {/* Messages */}
      <MessageList messages={displayMessages} />

      {/* Error */}
      {error ? (
        <div className="mx-4 md:mx-6 my-2 rounded-xl border border-[#b33b2f66] bg-[#fef2f1] px-3 py-2 text-[#8b2219] text-sm">
          <strong>错误: </strong>{error.message}
        </div>
      ) : null}

      {/* Streaming indicator */}
      {isStreaming && pendingApprovals.length === 0 && (
        <div className="mx-4 md:mx-6 mb-2 text-sm text-[var(--ink-2)] italic">
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
        onSend={handleSend}
        disabled={pendingApprovals.length > 0 || isStreaming}
      />
    </section>
  );
}
