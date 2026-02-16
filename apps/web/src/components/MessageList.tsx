'use client';

import { useEffect, useRef } from 'react';
import type { Message } from '@/hooks/useSSEStream';

export function MessageList({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 && (
        <div className="text-center text-gray-500 mt-8">
          <p className="text-lg">欢迎使用 Okon Agent</p>
          <p className="text-sm mt-2">发送消息开始对话...</p>
        </div>
      )}

      {messages.map((message, index) => (
        <div
          key={index}
          className={`flex ${
            message.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          <div
            className={`max-w-[70%] rounded-lg px-4 py-2 ${
              message.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-900'
            }`}
          >
            <div className="text-xs font-semibold mb-1 opacity-75">
              {message.role === 'user' ? '你' : 'AI'}
            </div>
            <div className="whitespace-pre-wrap break-words">
              {message.content || (
                <span className="text-gray-400 italic">正在输入...</span>
              )}
            </div>
          </div>
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
