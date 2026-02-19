'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@okon/ui';

type Bot = {
  id: number;
  name: string;
  provider: string;
  model: string;
  baseURL: string | null;
  apiKey: string | null;
  systemPrompt: string | null;
  createdAt: string;
};

type ProviderConfig = {
  label: string;
  defaultBaseURL: string;
  models: string[];
};

const PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    label: 'DeepSeek',
    defaultBaseURL: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  openai: {
    label: 'OpenAI',
    defaultBaseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  },
  ollama: {
    label: 'Ollama',
    defaultBaseURL: 'http://localhost:11434/v1',
    models: ['llama3.2', 'qwen2.5', 'mistral'],
  },
  other: {
    label: '自定义',
    defaultBaseURL: '',
    models: [],
  },
};

const PROVIDER_KEYS = Object.keys(PROVIDERS);

const EMPTY_FORM = {
  name: '',
  provider: 'deepseek',
  model: 'deepseek-chat',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: '',
  systemPrompt: '',
};

export default function BotsPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const loadBots = useCallback(async () => {
    try {
      const list = await (trpc.bot as any).list.query();
      setBots(list as Bot[]);
    } catch (err) {
      setStatus(`加载失败: ${String(err)}`);
    }
  }, []);

  useEffect(() => { void loadBots(); }, [loadBots]);

  const handleProviderChange = (newProvider: string) => {
    const config = PROVIDERS[newProvider];
    setIsCustomModel(false);
    setCustomModel('');
    setForm(p => ({
      ...p,
      provider: newProvider,
      model: config.models[0] ?? '',
      baseURL: config.defaultBaseURL,
    }));
  };

  const handleModelSelect = (value: string) => {
    if (value === '__custom__') {
      setIsCustomModel(true);
      setForm(p => ({ ...p, model: '' }));
    } else {
      setIsCustomModel(false);
      setCustomModel('');
      setForm(p => ({ ...p, model: value }));
    }
  };

  const finalModel = isCustomModel ? customModel : form.model;

  const handleCreate = async () => {
    if (!form.name.trim()) { setStatus('请填写 Bot 名称'); return; }
    if (!finalModel.trim()) { setStatus('请填写模型名称'); return; }
    if (!form.apiKey.trim()) { setStatus('请填写 API Key'); return; }
    setSaving(true);
    setStatus('');
    try {
      await (trpc.bot as any).create.mutate({
        name: form.name.trim(),
        provider: form.provider,
        model: finalModel.trim(),
        baseURL: form.baseURL.trim() || undefined,
        apiKey: form.apiKey.trim(),
        systemPrompt: form.systemPrompt.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setIsCustomModel(false);
      setCustomModel('');
      setStatus('创建成功');
      await loadBots();
    } catch (err) {
      setStatus(`创建失败: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await (trpc.bot as any).delete.mutate({ id });
      setBots(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      setStatus(`删除失败: ${String(err)}`);
    }
  };

  const currentProviderConfig = PROVIDERS[form.provider];

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-6 md:p-8 shadow-[0_24px_70px_-45px_rgba(24,38,59,0.55)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl text-[var(--ink-1)]">Bot 管理</h1>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              创建 Bot，在新建会话时选择绑定。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/knowledge-bases"
              className="rounded-xl border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--ink-2)] hover:bg-white/70 transition"
            >
              知识库管理
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--ink-2)] hover:bg-white/70 transition"
            >
              返回 Bot 列表
            </Link>
          </div>
        </div>

        {/* 创建表单 */}
        <section className="mt-6 rounded-2xl border border-[var(--line-soft)] bg-white/70 p-5 space-y-4">
          <h2 className="text-lg text-[var(--ink-1)]">新建 Bot</h2>

          <label className="block">
            <span className="mb-1 block text-sm text-[var(--ink-2)]">名称</span>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="我的助手"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              disabled={saving}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-[var(--ink-2)]">厂商</span>
              <Select value={form.provider} onValueChange={handleProviderChange} disabled={saving}>
                <SelectTrigger className="w-full rounded-xl border-[var(--line-soft)] bg-white text-sm focus-visible:ring-[var(--brand)]">
                  <SelectValue placeholder="选择厂商" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {PROVIDERS[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-[var(--ink-2)]">模型</span>
              {currentProviderConfig.models.length > 0 ? (
                <>
                  <Select
                    value={isCustomModel ? '__custom__' : form.model}
                    onValueChange={handleModelSelect}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-full rounded-xl border-[var(--line-soft)] bg-white text-sm focus-visible:ring-[var(--brand)]">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProviderConfig.models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">自定义...</SelectItem>
                    </SelectContent>
                  </Select>
                  {isCustomModel && (
                    <input
                      value={customModel}
                      onChange={e => setCustomModel(e.target.value)}
                      placeholder="输入模型名称"
                      className="mt-2 w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                      disabled={saving}
                      autoFocus
                    />
                  )}
                </>
              ) : (
                <input
                  value={form.model}
                  onChange={e => setForm(p => ({ ...p, model: e.target.value }))}
                  placeholder="输入模型名称"
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                  disabled={saving}
                />
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-[var(--ink-2)]">
                Base URL <span className="text-[var(--ink-3)]">（留空使用环境变量）</span>
              </span>
              <input
                value={form.baseURL}
                onChange={e => setForm(p => ({ ...p, baseURL: e.target.value }))}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                disabled={saving}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-[var(--ink-2)]">
                API Key <span className="text-[var(--ink-3)]">（必填）</span>
              </span>
              <input
                type="password"
                value={form.apiKey}
                onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                disabled={saving}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-[var(--ink-2)]">System Prompt <span className="text-[var(--ink-3)]">（留空使用默认）</span></span>
            <textarea
              value={form.systemPrompt}
              onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))}
              placeholder="你是一个专业的助手..."
              rows={4}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)] resize-none"
              disabled={saving}
            />
          </label>

          <button
            onClick={handleCreate}
            disabled={saving}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-strong)] disabled:opacity-50 transition"
          >
            {saving ? '创建中...' : '创建 Bot'}
          </button>
        </section>

        {/* Bot 列表 */}
        {bots.length > 0 && (
          <section className="mt-5 space-y-3">
            <h2 className="text-sm uppercase tracking-widest text-[var(--ink-2)]">已有 Bots</h2>
            {bots.map(bot => (
              <div key={bot.id} className="rounded-2xl border border-[var(--line-soft)] bg-white/70 px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[var(--ink-1)]">{bot.name}</span>
                    <span className="rounded-full bg-[#f2c0782b] px-2 py-0.5 text-xs text-[#7d4f1e] shrink-0">
                      {PROVIDERS[bot.provider]?.label ?? bot.provider} / {bot.model}
                    </span>
                    {bot.apiKey && (
                      <span className="rounded-full bg-[#d1fae52b] px-2 py-0.5 text-xs text-[#065f46] shrink-0">自定义 Key</span>
                    )}
                    {bot.baseURL && (
                      <span className="rounded-full bg-[#ede9fe2b] px-2 py-0.5 text-xs text-[#4c1d95] shrink-0 truncate max-w-[160px]" title={bot.baseURL}>{bot.baseURL}</span>
                    )}
                  </div>
                  {bot.systemPrompt && (
                    <p className="text-xs text-[var(--ink-2)] truncate">{bot.systemPrompt}</p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <Link
                    href={`/bots/${bot.id}/edit`}
                    className="text-sm text-[var(--brand)] hover:text-[var(--brand-strong)] transition"
                  >
                    编辑
                  </Link>
                  <button
                    onClick={() => handleDelete(bot.id)}
                    className="text-sm text-[#a53f37] hover:text-[#dc3b3b] transition"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {status && (
          <p className="mt-4 rounded-xl border border-[var(--line-soft)] bg-white/70 px-3 py-2 text-sm text-[var(--ink-2)]">
            {status}
          </p>
        )}
      </div>
    </main>
  );
}
