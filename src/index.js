import 'dotenv/config';
import React, { useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { streamText } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('Missing DEEPSEEK_API_KEY');
  process.exit(1);
}

const deepseek = createDeepSeek({
  apiKey,
  baseURL: 'https://api.deepseek.com/v1'
});

function App() {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (rawValue) => {
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

    setError('');
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: prompt },
      { role: 'assistant', content: '' }
    ]);

    (async () => {
      try {
        const result = streamText({
          model: deepseek('deepseek-chat'),
          prompt
        });

        for await (const chunk of result.textStream) {
          setMessages((prev) => {
            const next = [...prev];
            const last = next.length - 1;
            next[last] = {
              ...next[last],
              content: next[last].content + chunk
            };
            return next;
          });
        }
      } catch (err) {
        setError(`Request failed: ${err?.message || err}`);
      } finally {
        setIsLoading(false);
      }
    })();
  };

  return React.createElement(
    Box,
    { flexDirection: 'column' },
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
    isLoading ? React.createElement(Text, { color: 'yellow' }, 'AI is typing...') : null,
    React.createElement(
      Box,
      null,
      React.createElement(Text, { color: 'cyan' }, 'You > '),
      React.createElement(TextInput, {
        value: input,
        onChange: setInput,
        onSubmit: handleSubmit,
        placeholder: isLoading ? 'Wait for current response...' : 'Ask something...'
      })
    )
  );
}

render(React.createElement(App));
