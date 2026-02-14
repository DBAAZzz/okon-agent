import 'dotenv/config';
import React, { useEffect, useState } from 'react';
import { render, Box, Static, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { streamToolAgent } from './tool-agent.js';
import { formatLogEntry, getLogs, subscribeLogs, type LogEntry } from './logger.js';
import type { ModelMessage, ToolApprovalResponse } from 'ai';
import type { ToolAgentRunOptions } from './tool-agent.js';

type DisplayMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AgentResult = Awaited<ReturnType<typeof streamToolAgent>>;
type AgentContentPart = Awaited<AgentResult['content']>[number];
type ApprovalRequestPart = Extract<AgentContentPart, { type: 'tool-approval-request' }>;
type StaticProps<T> = {
  items: T[];
  children: (item: T, index: number) => React.ReactNode;
};
const StaticList = Static as unknown as React.ComponentType<StaticProps<LogEntry>>;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatApprovalLine(part: ApprovalRequestPart): string {
  const toolName = part?.toolCall?.toolName ?? 'unknown';
  const toolInput = part?.toolCall?.input;
  return `[审批] ${toolName} ${formatValue(toolInput)}`;
}

function isApproveInput(value: string): boolean {
  return ['y', 'yes', 'approve', 'approved', '通过'].includes(value);
}

function isDenyInput(value: string): boolean {
  return ['n', 'no', 'deny', 'denied', '拒绝'].includes(value);
}

function getLatestUserText(history: ModelMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (!message || message.role !== 'user') {
      continue;
    }

    if (typeof message.content === 'string') {
      return message.content;
    }
  }

  return '';
}

function resolveRunOptions(history: ModelMessage[]): ToolAgentRunOptions {
  const latestUserText = getLatestUserText(history).toLowerCase();
  const forceCalculator =
    latestUserText.includes('calculator') ||
    (latestUserText.includes('计算') && /\d+\s*[\+\-\*\/]\s*\d+/.test(latestUserText));

  return { forceCalculator };
}

function App() {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ModelMessage[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequestPart[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>(() => getLogs());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeLogs((entry) => {
      setLogs((prev) => [...prev, entry].slice(-200));
    });

    return unsubscribe;
  }, []);

  const runAgentTurn = async (history: ModelMessage[]) => {
    try {
      const result = await streamToolAgent(history, resolveRunOptions(history));

      for await (const chunk of result.textStream) {
        setMessages((prev) => {
          if (prev.length === 0) {
            return prev;
          }

          const next = [...prev];
          const last = next.length - 1;
          const lastMessage = next[last];
          if (!lastMessage) {
            return prev;
          }

          next[last] = {
            ...lastMessage,
            content: lastMessage.content + chunk
          };
          return next;
        });
      }

      const [content, response] = await Promise.all([result.content, result.response]);
      const nextHistory = [...history, ...response.messages];
      const approvalRequests = content.filter(
        (part): part is ApprovalRequestPart => part.type === 'tool-approval-request'
      );

      setChatHistory(nextHistory);

      if (approvalRequests.length > 0) {
        setPendingApprovals(approvalRequests);
        setMessages((prev) => {
          if (prev.length === 0) {
            return prev;
          }

          const next = [...prev];
          const last = next.length - 1;
          const approvalText = approvalRequests.map(formatApprovalLine).join('\n');
          const tip = `${approvalText}\n输入 y 批准，n 拒绝`;
          const lastMessage = next[last];
          if (!lastMessage) {
            return prev;
          }

          next[last] = {
            ...lastMessage,
            content: lastMessage.content.trim() ? `${lastMessage.content}\n${tip}` : tip
          };
          return next;
        });
      }
    } catch (err: unknown) {
      setError(`Request failed: ${getErrorMessage(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (rawValue: string) => {
    if (isLoading) {
      return;
    }

    const prompt = rawValue.trim();
    setInput('');

    if (!prompt) {
      return;
    }
    if (prompt === 'exit' || prompt === 'quit') {
      exit();
      return;
    }

    const normalized = prompt.toLowerCase();

    if (pendingApprovals.length > 0) {
      const approved = isApproveInput(normalized); // 同意操作
      const denied = isDenyInput(normalized); // 拒绝操作

      if (!approved && !denied) {
        setError('当前有待审批工具调用。请输入 y 批准，或 n 拒绝。');
        return;
      }

      setError('');
      setPendingApprovals([]);
      setIsLoading(true);

      const responses: ToolApprovalResponse[] = pendingApprovals.map((part) => ({
        type: 'tool-approval-response',
        approvalId: part.approvalId,
        approved,
        reason: approved ? 'User approved in TUI' : 'User denied in TUI'
      }));
      const approvalMessage: ModelMessage = {
        role: 'tool',
        content: responses
      };
      const nextHistory = [...chatHistory, approvalMessage];

      setMessages((prev) => [
        ...prev,
        { role: 'user', content: `[审批] ${approved ? '批准' : '拒绝'}` },
        { role: 'assistant', content: '' }
      ]);
      setChatHistory(nextHistory);
      runAgentTurn(nextHistory);
      return;
    }

    setError('');
    setIsLoading(true);

    const nextHistory: ModelMessage[] = [...chatHistory, { role: 'user', content: prompt }];

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: prompt },
      { role: 'assistant', content: '' }
    ]);
    setChatHistory(nextHistory);
    runAgentTurn(nextHistory);
  };

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      StaticList,
      {
        items: logs,
        children: (entry: LogEntry) =>
          React.createElement(
            Text,
            { key: entry.id, color: 'magenta' },
            formatLogEntry(entry)
          )
      }
    ),
    React.createElement(Text, { bold: true }, 'DeepSeek Ink TUI (type exit to quit)'),
    React.createElement(Text, { color: 'gray' }, 'Press Enter to send'),
    messages.map((m, i) =>
      React.createElement(
        Text,
        { key: `${m.role}-${i}`, color: m.role === 'user' ? 'cyan' : 'green' },
        `${m.role === 'user' ? 'You' : 'AI '} > ${m.content || '...'}`
      )
    ),
    error ? React.createElement(Text, { color: 'red' }, error) : null,
    pendingApprovals.length > 0
      ? React.createElement(
          Text,
          { color: 'yellow' },
          `待审批工具调用：${pendingApprovals.length}（输入 y 或 n）`
        )
      : null,
    isLoading ? React.createElement(Text, { color: 'yellow' }, 'AI is typing...') : null,
    React.createElement(
      Box,
      null,
      React.createElement(Text, { color: 'cyan' }, 'You > '),
      React.createElement(TextInput, {
        value: input,
        onChange: setInput,
        onSubmit: handleSubmit,
        placeholder: isLoading
          ? 'Wait for current response...'
          : pendingApprovals.length > 0
            ? 'Type y to approve, n to deny...'
            : 'Ask something...'
      })
    )
  );
}

render(React.createElement(App));
