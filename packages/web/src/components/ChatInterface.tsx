'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSSEStream } from '@/hooks/useSSEStream';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ApprovalRequest } from './ApprovalRequest';
import { trpc } from '@/lib/trpc';

export function ChatInterface() {
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    messages,
    pendingApprovals,
    isStreaming,
    error,
    sendMessage,
    continueAfterApproval,
    setPendingApprovals
  } = useSSEStream(sessionId);

  const handleApproval = async (approvalId: string, approved: boolean) => {
    try {
      const result = await trpc.approval.respond.mutate({
        sessionId,
        approvalId,
        approved,
        reason: approved ? 'User approved in web UI' : 'User denied in web UI'
      });

      // Continue receiving agent response via SSE
      if (result.shouldContinue) {
        continueAfterApproval();
      }
    } catch (err) {
      console.error('Failed to respond to approval:', err);
      alert('审批响应失败，请重试');
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 shadow-md">
        <h1 className="text-xl font-bold">Okon Agent</h1>
        {mounted && (
          <p className="text-sm opacity-90">会话 ID: {sessionId.slice(0, 8)}</p>
        )}
      </div>

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
