'use client';

import { memo, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage, ToolDetail } from '../types/chat';

function formatValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toStateLabel(state: string): string {
  switch (state) {
    case 'input-streaming':
      return '参数生成中';
    case 'input-available':
      return '参数已就绪';
    case 'approval-requested':
      return '等待审批';
    case 'approval-responded':
      return '审批已提交';
    case 'output-available':
      return '执行成功';
    case 'output-error':
      return '执行失败';
    case 'output-denied':
      return '已拒绝';
    default:
      return state;
  }
}

function isToolApprovalEqual(
  left: ToolDetail['approval'],
  right: ToolDetail['approval'],
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.id === right.id &&
    left.approved === right.approved &&
    left.reason === right.reason
  );
}

function isToolDetailEqual(left: ToolDetail, right: ToolDetail): boolean {
  return (
    left.toolCallId === right.toolCallId &&
    left.toolName === right.toolName &&
    left.state === right.state &&
    left.input === right.input &&
    left.output === right.output &&
    left.errorText === right.errorText &&
    isToolApprovalEqual(left.approval, right.approval)
  );
}

function areToolsEqual(left?: ToolDetail[], right?: ToolDetail[]): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i++) {
    if (!isToolDetailEqual(left[i], right[i])) {
      return false;
    }
  }
  return true;
}

function isChatMessageEqual(left: ChatMessage, right: ChatMessage): boolean {
  return (
    left.id === right.id &&
    left.role === right.role &&
    left.content === right.content &&
    left.reasoning === right.reasoning &&
    areToolsEqual(left.tools, right.tools)
  );
}

type MessageItemProps = {
  message: ChatMessage;
  index: number;
};

const MessageItem = memo(
  function MessageItem({ message, index }: MessageItemProps) {
    return (
      <div
        className={`rise-in flex ${
          message.role === 'user' ? 'justify-end' : 'justify-start'
        }`}
        style={{ animationDelay: `${index * 20}ms` }}
      >
        <div
          className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 border shadow-[0_18px_26px_-24px_rgba(16,30,51,0.6)] ${
            message.role === 'user'
              ? 'bg-[linear-gradient(135deg,#0f766e_0%,#115e59_100%)] text-white border-[#0f766ecc]'
              : 'bg-white/88 text-[var(--ink-1)] border-[var(--line-soft)]'
          }`}
        >
          <div className="text-[11px] font-semibold mb-1.5 tracking-wide opacity-75">
            {message.role === 'user' ? '你' : 'AI'}
          </div>
          <div className="break-words text-[15px] leading-relaxed">
            {message.content ? (
              message.role === 'assistant' ? (
                <div className="space-y-2 [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-[#0f766e7a] [&_code]:rounded [&_code]:bg-[#f2eee2] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--line-soft)] [&_pre]:bg-[#f9f6ef] [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{message.content}</span>
              )
            ) : message.tools && message.tools.length > 0 ? null : (
              <span className="italic opacity-70">正在输入...</span>
            )}
          </div>
          {message.reasoning ? (
            <div className="mt-3 rounded-xl border border-[#0f766e3a] bg-[#0f766e12] px-3 py-2 text-xs whitespace-pre-wrap break-words text-[var(--ink-2)]">
              <span className="font-semibold">思考:</span> {message.reasoning}
            </div>
          ) : null}
          {message.role === 'assistant' && message.tools && message.tools.length > 0 ? (
            <details className="mt-3 rounded-xl border border-[#0f766e2f] bg-[#0f766e0d] p-2">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--ink-2)] select-none">
                工具详情 ({message.tools.length})
              </summary>
              <div className="mt-2 space-y-2">
                {message.tools.map((tool) => (
                  <div
                    key={tool.toolCallId}
                    className="rounded-lg border border-[var(--line-soft)] bg-white/80 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[var(--ink-1)]">{tool.toolName}</span>
                      <span className="rounded-full border border-[#0f766e33] bg-[#0f766e12] px-2 py-0.5 text-[10px] text-[var(--ink-2)]">
                        {toStateLabel(tool.state)}
                      </span>
                    </div>

                    {tool.approval ? (
                      <div className="mt-1 text-[11px] text-[var(--ink-2)]">
                        审批:{' '}
                        {tool.approval.approved === true
                          ? '已批准'
                          : tool.approval.approved === false
                            ? '已拒绝'
                            : '待处理'}
                        {tool.approval.reason ? ` (${tool.approval.reason})` : ''}
                      </div>
                    ) : null}

                    {tool.input !== undefined ? (
                      <div className="mt-2">
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--ink-2)]">
                          Input
                        </div>
                        <pre className="overflow-x-auto rounded-md border border-[var(--line-soft)] bg-[#f9f6ef] p-2 text-[11px] leading-relaxed text-[var(--ink-1)]">
                          {formatValue(tool.input)}
                        </pre>
                      </div>
                    ) : null}

                    {tool.output !== undefined ? (
                      <div className="mt-2">
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--ink-2)]">
                          Output
                        </div>
                        <pre className="overflow-x-auto rounded-md border border-[var(--line-soft)] bg-[#eef7f3] p-2 text-[11px] leading-relaxed text-[var(--ink-1)]">
                          {formatValue(tool.output)}
                        </pre>
                      </div>
                    ) : null}

                    {tool.errorText ? (
                      <div className="mt-2 rounded-md border border-[#b33b2f66] bg-[#fef2f1] px-2 py-1.5 text-[11px] text-[#8b2219]">
                        {tool.errorText}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.index === next.index && isChatMessageEqual(prev.message, next.message),
);

export function MessageList({
  messages,
  header,
}: {
  messages: ChatMessage[];
  header?: ReactNode;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      {header}
      {messages.length === 0 && (
        <div className="mt-10 rounded-2xl border border-[var(--line-soft)] bg-white/70 p-8 text-center text-[var(--ink-2)] rise-in">
          <p className="text-2xl text-[var(--ink-1)]">欢迎使用 Okon Agent</p>
          <p className="text-sm mt-2">发送消息开始对话</p>
        </div>
      )}

      {messages.map((message, index) => (
        <MessageItem key={message.id} message={message} index={index} />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
