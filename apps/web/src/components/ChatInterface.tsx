'use client';

import { useMemo, useCallback, useEffect, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ApprovalRequest } from './ApprovalRequest';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useRafThrottledValue } from '@/hooks/useRafThrottledValue';
import {
  extractPendingApprovals,
  toDisplayMessages,
  toHistoryUIMessages,
} from '@/lib/chat-transformers';
import { trpc } from '@/lib/trpc';
import type { ChatMessage } from '@/types/chat';
import type { CompactionSummaryRecord, TokenUsageSummary } from '@/types/api';

type Props = {
  sessionId: number;
};

export function ChatInterface({ sessionId }: Props) {
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [compactionSummary, setCompactionSummary] = useState<CompactionSummaryRecord | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [originalMessages, setOriginalMessages] = useState<ChatMessage[] | null>(null);
  const [originalLoading, setOriginalLoading] = useState(false);

  const refreshTokenUsage = useCallback(async () => {
    try {
      const summary = await trpc.tokenUsage.getSessionSummary.query({ sessionId });
      setTokenUsage(summary);
    } catch (err) {
      console.error('Failed to load token usage summary:', err);
    }
  }, [sessionId]);

  const refreshCompactionSummary = useCallback(async () => {
    try {
      const summaries = await trpc.compaction.getSessionSummaries.query({ sessionId });
      setCompactionSummary(summaries[0] ?? null);
      setSummaryOpen(false);
      setShowOriginal(false);
      setOriginalMessages(null);
    } catch (err) {
      console.error('Failed to load compaction summaries:', err);
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTokenUsage() {
      try {
        const summary = await trpc.tokenUsage.getSessionSummary.query({ sessionId });
        if (!cancelled) setTokenUsage(summary);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load token usage summary:', err);
        }
      }
    }

    loadTokenUsage();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompactionSummary() {
      try {
        const summaries = await trpc.compaction.getSessionSummaries.query({ sessionId });
        if (cancelled) return;
        setCompactionSummary(summaries[0] ?? null);
        setSummaryOpen(false);
        setShowOriginal(false);
        setOriginalMessages(null);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load compaction summaries:', err);
        }
      }
    }

    loadCompactionSummary();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { sessionId },
      }),
    [sessionId]
  );

  const { messages, setMessages, status, error, sendMessage, addToolApprovalResponse } = useChat({
    id: String(sessionId),
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => {
      void refreshTokenUsage();
      void refreshCompactionSummary();
    },
  });

  useChatHistory(sessionId, setMessages);

  const throttledMessages = useRafThrottledValue(messages, 40);
  const pendingApprovals = useMemo(() => extractPendingApprovals(messages), [messages]);
  const displayMessages = useMemo(
    () => toDisplayMessages(throttledMessages),
    [throttledMessages]
  );
  const isStreaming = status === 'submitted' || status === 'streaming';

  const handleToggleOriginal = useCallback(async () => {
    if (!compactionSummary) return;
    const next = !showOriginal;
    setShowOriginal(next);

    if (next && !originalMessages && !originalLoading) {
      setOriginalLoading(true);
      try {
        const rawMessages = await trpc.compaction.getCompactedMessages.query({
          sessionId,
          messageIdFrom: compactionSummary.messageIdFrom,
          messageIdTo: compactionSummary.messageIdTo,
        });
        const history = rawMessages.map((m) => m.content);
        const uiMessages = toHistoryUIMessages(history);
        const display = toDisplayMessages(uiMessages);
        setOriginalMessages(display);
      } catch (err) {
        console.error('Failed to load compacted messages:', err);
      } finally {
        setOriginalLoading(false);
      }
    }
  }, [compactionSummary, originalLoading, originalMessages, sessionId, showOriginal]);

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

  const originalCount = compactionSummary
    ? compactionSummary.messageIdTo - compactionSummary.messageIdFrom + 1
    : 0;

  const summaryHeader = compactionSummary ? (
    <div className="rounded-2xl border border-[var(--line-soft)] bg-white/80 p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.5)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-2)]">
            Earlier messages (compressed)
          </div>
          <div className="mt-1 text-xs text-[var(--ink-2)]">
            {compactionSummary.model} · {compactionSummary.summaryTokens} / {compactionSummary.originalTokens} tokens
          </div>
        </div>
        <button
          className="rounded-full border border-[var(--line-soft)] bg-white/80 px-3 py-1.5 text-xs text-[var(--ink-2)] hover:bg-white"
          onClick={() => setSummaryOpen((prev) => !prev)}
        >
          {summaryOpen ? '收起摘要' : '展开摘要'}
        </button>
      </div>

      {summaryOpen ? (
        <div className="mt-3 whitespace-pre-wrap break-words text-sm text-[var(--ink-1)]">
          {compactionSummary.summary}
        </div>
      ) : null}

      <div className="mt-3">
        <button
          className="text-xs font-semibold text-[#0f766e] hover:text-[#115e59]"
          onClick={handleToggleOriginal}
        >
          {showOriginal ? '隐藏原始消息' : `查看原始消息 (${originalCount})`}
        </button>
      </div>

      {showOriginal ? (
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-[var(--line-soft)] bg-white/70 p-3">
          {originalLoading ? (
            <div className="text-xs text-[var(--ink-2)]">加载中...</div>
          ) : originalMessages && originalMessages.length > 0 ? (
            originalMessages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-lg border border-[var(--line-soft)] bg-white/80 px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-[var(--ink-2)]">
                  {msg.role === 'user' ? '用户' : 'AI'}
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--ink-1)]">
                  {msg.content}
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-[var(--ink-2)]">暂无原始消息</div>
          )}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <section className="h-full flex flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.62))]">
      <header className="shrink-0 border-b border-[var(--line-soft)] px-4 md:px-6 py-3 bg-white/62 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-2)]">Active Session</div>
            <div className="text-sm font-semibold text-[var(--ink-1)] font-mono">#{sessionId}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-[var(--line-soft)] bg-white/80 px-3 py-1.5 text-xs text-[var(--ink-2)]">
              Tokens: {tokenUsage?.totalTokens.toLocaleString() ?? '0'} (In {tokenUsage?.totalInputTokens.toLocaleString() ?? '0'} / Out {tokenUsage?.totalOutputTokens.toLocaleString() ?? '0'}) · {tokenUsage?.requestCount ?? 0} 次
            </div>
            <div className="rounded-full border border-[var(--line-soft)] bg-white/80 px-3 py-1.5 text-xs text-[var(--ink-2)]">
              状态: {status === 'ready' ? '空闲' : status === 'error' ? '异常' : '处理中'}
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <MessageList messages={displayMessages} header={summaryHeader} />

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
