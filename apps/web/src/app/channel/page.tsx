'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';

type ChannelConfigRecord = {
  id: string;
  platform: string;
  name: string;
  enabled: boolean;
  config: unknown;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  platform: string;
  name: string;
  enabled: boolean;
  appId: string;
  appSecret: string;
};

type ChannelApi = {
  list: { query: () => Promise<unknown> };
  upsert: { mutate: (input: unknown) => Promise<unknown> };
  delete: { mutate: (input: { id: string }) => Promise<unknown> };
};

function readConfigString(config: unknown, key: string): string {
  if (!config || typeof config !== 'object') return '';
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export default function ChannelPage() {
  const channelApi = trpc.channel as unknown as ChannelApi;

  const [list, setList] = useState<ChannelConfigRecord[]>([]);
  const [form, setForm] = useState<FormState>({
    platform: 'feishu',
    name: 'Feishu Bot',
    enabled: true,
    appId: '',
    appSecret: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState('');

  const feishuConfig = useMemo(
    () => list.find((item) => item.platform === 'feishu') ?? null,
    [list],
  );

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const rows = await channelApi.list.query();
      setList(rows as ChannelConfigRecord[]);
    } catch (error) {
      setStatus(`加载失败: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (!feishuConfig) return;
    setForm({
      platform: 'feishu',
      name: feishuConfig.name || 'Feishu Bot',
      enabled: feishuConfig.enabled,
      appId: readConfigString(feishuConfig.config, 'appId'),
      appSecret: readConfigString(feishuConfig.config, 'appSecret'),
    });
  }, [feishuConfig]);

  const handleSave = async () => {
    const appId = form.appId.trim();
    const appSecret = form.appSecret.trim();
    const name = form.name.trim() || 'Feishu Bot';

    if (!appId || !appSecret) {
      setStatus('请先填写 appId 和 appSecret');
      return;
    }

    setSaving(true);
    setStatus('');
    try {
      await channelApi.upsert.mutate({
        platform: 'feishu',
        name,
        enabled: form.enabled,
        config: {
          appId,
          appSecret,
        },
      });
      setStatus('已保存并触发热更新');
      await loadConfigs();
    } catch (error) {
      setStatus(`保存失败: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!feishuConfig) return;
    setDeleting(true);
    setStatus('');
    try {
      await channelApi.delete.mutate({ id: feishuConfig.id });
      setForm((prev) => ({
        ...prev,
        name: 'Feishu Bot',
        enabled: false,
        appId: '',
        appSecret: '',
      }));
      setStatus('已删除飞书配置');
      await loadConfigs();
    } catch (error) {
      setStatus(`删除失败: ${String(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-6 md:p-8 shadow-[0_24px_70px_-45px_rgba(24,38,59,0.55)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl text-[var(--ink-1)]">Channel 配置</h1>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              配置飞书机器人后，消息会自动进入 Agent。
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--ink-2)] hover:bg-white/70 transition"
          >
            返回聊天
          </Link>
        </div>

        <section className="mt-6 rounded-2xl border border-[var(--line-soft)] bg-white/70 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg text-[var(--ink-1)]">飞书（Feishu）</h2>
            <span className="rounded-full bg-[#f2c0782b] px-2.5 py-1 text-xs text-[#7d4f1e]">
              {feishuConfig ? '已配置' : '未配置'}
            </span>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-[var(--ink-2)]">名称</span>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Feishu Bot"
                className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                disabled={saving || deleting || loading}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-[var(--ink-2)]">App ID</span>
              <input
                value={form.appId}
                onChange={(e) => setForm((prev) => ({ ...prev, appId: e.target.value }))}
                placeholder="cli_xxx"
                className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                disabled={saving || deleting || loading}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-[var(--ink-2)]">App Secret</span>
              <input
                type="password"
                value={form.appSecret}
                onChange={(e) => setForm((prev) => ({ ...prev, appSecret: e.target.value }))}
                placeholder="********"
                className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                disabled={saving || deleting || loading}
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                disabled={saving || deleting || loading}
              />
              启用该 Channel
            </label>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || deleting || loading}
                className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-strong)] disabled:opacity-50 transition"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
              <button
                onClick={() => void loadConfigs()}
                disabled={saving || deleting || loading}
                className="rounded-xl border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-white disabled:opacity-50 transition"
              >
                {loading ? '刷新中...' : '刷新'}
              </button>
              <button
                onClick={handleDelete}
                disabled={!feishuConfig || saving || deleting || loading}
                className="rounded-xl border border-[#dc6f6848] px-4 py-2 text-sm text-[#a53f37] hover:bg-[#fff4f3] disabled:opacity-50 transition"
              >
                {deleting ? '删除中...' : '删除配置'}
              </button>
            </div>
          </div>
        </section>

        {status && (
          <p className="mt-4 rounded-xl border border-[var(--line-soft)] bg-white/70 px-3 py-2 text-sm text-[var(--ink-2)]">
            {status}
          </p>
        )}
      </div>
    </main>
  );
}
