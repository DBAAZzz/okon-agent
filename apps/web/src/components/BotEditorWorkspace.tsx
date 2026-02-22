'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@okon/ui';
import { trpc } from '@/lib/trpc';
import { useBots } from '@/hooks/useBots';

type Props = {
  botId: number;
};

type BasicFormState = {
  name: string;
  provider: string;
  model: string;
  baseURL: string;
  apiKey: string;
  systemPrompt: string;
};

type FeishuFormState = {
  name: string;
  appId: string;
  appSecret: string;
  enabled: boolean;
};

type ChannelConfigRecord = {
  id: number;
  platform: string;
  name: string;
  enabled: boolean;
  config: unknown;
  createdAt: string;
  updatedAt: string;
};

type ChannelApi = {
  list: { query: (input?: { botId?: number }) => Promise<unknown> };
  upsert: { mutate: (input: unknown) => Promise<unknown> };
  delete: { mutate: (input: { id: number }) => Promise<unknown> };
};

type KnowledgeBaseRecord = {
  id: number;
  name: string;
  description: string | null;
  _count?: {
    documents: number;
    bots: number;
  };
};

type KnowledgeBaseApi = {
  list: { query: () => Promise<unknown> };
  getBotKnowledgeBases: { query: (input: { botId: number }) => Promise<unknown> };
  bindBot: { mutate: (input: { botId: number; knowledgeBaseId: number }) => Promise<unknown> };
  unbindBot: { mutate: (input: { botId: number; knowledgeBaseId: number }) => Promise<unknown> };
};

const DEFAULT_BASIC_FORM: BasicFormState = {
  name: '',
  provider: 'deepseek',
  model: '',
  baseURL: '',
  apiKey: '',
  systemPrompt: '',
};

const DEFAULT_FEISHU_FORM: FeishuFormState = {
  name: 'Feishu Bot',
  appId: '',
  appSecret: '',
  enabled: false,
};

function readConfigString(config: unknown, key: string): string {
  if (!config || typeof config !== 'object') {
    return '';
  }

  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function BotEditorWorkspace({ botId }: Props) {
  const channelApi = useMemo(() => trpc.channel as unknown as ChannelApi, []);
  const knowledgeBaseApi = useMemo(() => trpc.knowledgeBase as unknown as KnowledgeBaseApi, []);
  const { bots, isLoading } = useBots();

  const [basicForm, setBasicForm] = useState<BasicFormState>(DEFAULT_BASIC_FORM);
  const [feishuForm, setFeishuForm] = useState<FeishuFormState>(DEFAULT_FEISHU_FORM);
  const [channelList, setChannelList] = useState<ChannelConfigRecord[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRecord[]>([]);
  const [boundKnowledgeBaseIds, setBoundKnowledgeBaseIds] = useState<number[]>([]);

  const [feishuLoading, setFeishuLoading] = useState(false);
  const [feishuSaving, setFeishuSaving] = useState(false);
  const [feishuDeleting, setFeishuDeleting] = useState(false);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeMutatingId, setKnowledgeMutatingId] = useState<number | null>(null);
  const [status, setStatus] = useState('');

  const bot = useMemo(() => bots.find((item) => item.id === botId) ?? null, [bots, botId]);
  const feishuConfig = useMemo(
    () => channelList.find((item) => item.platform === 'feishu') ?? null,
    [channelList]
  );

  const loadChannelConfigs = useCallback(async () => {
    setFeishuLoading(true);
    try {
      const rows = await channelApi.list.query({ botId });
      setChannelList(rows as ChannelConfigRecord[]);
    } catch (error) {
      setStatus(`加载飞书配置失败: ${errorMessage(error)}`);
    } finally {
      setFeishuLoading(false);
    }
  }, [channelApi, botId]);

  const loadKnowledgeBases = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      const [allRows, botRows] = await Promise.all([
        knowledgeBaseApi.list.query(),
        knowledgeBaseApi.getBotKnowledgeBases.query({ botId }),
      ]);
      const allKnowledgeBases = allRows as KnowledgeBaseRecord[];
      const botKnowledgeBases = botRows as KnowledgeBaseRecord[];

      setKnowledgeBases(allKnowledgeBases);
      setBoundKnowledgeBaseIds(botKnowledgeBases.map((item) => item.id));
    } catch (error) {
      setStatus(`加载知识库失败: ${errorMessage(error)}`);
    } finally {
      setKnowledgeLoading(false);
    }
  }, [knowledgeBaseApi, botId]);

  useEffect(() => {
    if (!bot) {
      return;
    }

    setBasicForm({
      name: bot.name ?? '',
      provider: bot.provider ?? 'deepseek',
      model: bot.model ?? '',
      baseURL: bot.baseURL ?? '',
      apiKey: bot.apiKey ?? '',
      systemPrompt: bot.systemPrompt ?? '',
    });
  }, [bot]);

  useEffect(() => {
    void loadChannelConfigs();
    void loadKnowledgeBases();
  }, [loadChannelConfigs, loadKnowledgeBases]);

  useEffect(() => {
    if (!feishuConfig) {
      setFeishuForm(DEFAULT_FEISHU_FORM);
      return;
    }

    setFeishuForm({
      name: feishuConfig.name || 'Feishu Bot',
      enabled: feishuConfig.enabled,
      appId: readConfigString(feishuConfig.config, 'appId'),
      appSecret: readConfigString(feishuConfig.config, 'appSecret'),
    });
  }, [feishuConfig]);

  const handleMockSave = () => {
    setStatus('已保存 基本信息（前端占位）。后续接入 API 后可真正持久化。');
  };

  const handleFeishuSave = async () => {
    const name = feishuForm.name.trim() || 'Feishu Bot';
    const appId = feishuForm.appId.trim();
    const appSecret = feishuForm.appSecret.trim();

    if (!appId || !appSecret) {
      setStatus('飞书绑定需要填写 App ID 和 App Secret。');
      return;
    }

    setFeishuSaving(true);
    setStatus('');
    try {
      await channelApi.upsert.mutate({
        botId,
        platform: 'feishu',
        name,
        enabled: feishuForm.enabled,
        config: {
          appId,
          appSecret,
        },
      });
      setStatus('飞书绑定已保存并触发热更新。');
      await loadChannelConfigs();
    } catch (error) {
      setStatus(`飞书绑定保存失败: ${errorMessage(error)}`);
    } finally {
      setFeishuSaving(false);
    }
  };

  const handleFeishuDelete = async () => {
    if (!feishuConfig) {
      return;
    }

    setFeishuDeleting(true);
    setStatus('');
    try {
      await channelApi.delete.mutate({ id: feishuConfig.id });
      setFeishuForm(DEFAULT_FEISHU_FORM);
      setStatus('飞书绑定已删除。');
      await loadChannelConfigs();
    } catch (error) {
      setStatus(`飞书绑定删除失败: ${errorMessage(error)}`);
    } finally {
      setFeishuDeleting(false);
    }
  };

  const handleToggleKnowledgeBase = async (knowledgeBaseId: number) => {
    const isBound = boundKnowledgeBaseIds.includes(knowledgeBaseId);
    setKnowledgeMutatingId(knowledgeBaseId);
    setStatus('');
    try {
      if (isBound) {
        await knowledgeBaseApi.unbindBot.mutate({ botId, knowledgeBaseId });
        setStatus('已解绑知识库。');
      } else {
        await knowledgeBaseApi.bindBot.mutate({ botId, knowledgeBaseId });
        setStatus('已绑定知识库。');
      }
      await loadKnowledgeBases();
    } catch (error) {
      setStatus(`更新知识库绑定失败: ${errorMessage(error)}`);
    } finally {
      setKnowledgeMutatingId(null);
    }
  };

  if (!isLoading && !bot) {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-8 text-center shadow-[0_28px_80px_-40px_rgba(24,38,59,0.55)]">
          <h1 className="text-2xl text-[var(--ink-1)]">Bot 不存在或已删除</h1>
          <p className="mt-2 text-sm text-[var(--ink-2)]">请返回首页重新选择 Bot。</p>
          <Button asChild className="mt-5 bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]">
            <Link href="/">返回 Bot 列表</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <Card className="border-[var(--line-soft)] bg-[var(--surface-1)] shadow-[0_28px_80px_-40px_rgba(24,38,59,0.55)]">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl text-[var(--ink-1)]">Bot 编辑台</CardTitle>
                <CardDescription className="mt-2 text-[var(--ink-2)]">
                  {bot ? `${bot.name} / ${bot.model}` : 'Loading...'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                  <Link href="/">返回列表</Link>
                </Button>
                <Button asChild className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]">
                  <Link href={`/chat/${botId}`}>进入会话</Link>
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Tabs defaultValue="basic" className="space-y-3">
          <TabsList className="grid h-auto grid-cols-3 rounded-xl bg-white/75 p-1">
            <TabsTrigger value="basic" className="rounded-lg py-2 text-sm">基本信息</TabsTrigger>
            <TabsTrigger value="feishu" className="rounded-lg py-2 text-sm">飞书绑定</TabsTrigger>
            <TabsTrigger value="rag" className="rounded-lg py-2 text-sm">知识库 / RAG</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <Card className="border-[var(--line-soft)] bg-white/80">
              <CardHeader>
                <CardTitle className="text-lg text-[var(--ink-1)]">Bot 基本信息</CardTitle>
                <CardDescription className="text-[var(--ink-2)]">
                  该区域用于维护模型和提示词配置。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bot-name">Bot 名称</Label>
                    <Input
                      id="bot-name"
                      value={basicForm.name}
                      onChange={(event) => setBasicForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bot-provider">Provider</Label>
                    <Input
                      id="bot-provider"
                      value={basicForm.provider}
                      onChange={(event) => setBasicForm((prev) => ({ ...prev, provider: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bot-model">Model</Label>
                    <Input
                      id="bot-model"
                      value={basicForm.model}
                      onChange={(event) => setBasicForm((prev) => ({ ...prev, model: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bot-base-url">Base URL</Label>
                    <Input
                      id="bot-base-url"
                      value={basicForm.baseURL}
                      onChange={(event) => setBasicForm((prev) => ({ ...prev, baseURL: event.target.value }))}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bot-api-key">API Key</Label>
                  <Input
                    id="bot-api-key"
                    type="password"
                    value={basicForm.apiKey}
                    onChange={(event) => setBasicForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                    placeholder="sk-..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bot-system-prompt">System Prompt</Label>
                  <Textarea
                    id="bot-system-prompt"
                    value={basicForm.systemPrompt}
                    onChange={(event) => setBasicForm((prev) => ({ ...prev, systemPrompt: event.target.value }))}
                    rows={6}
                    placeholder="你是一个专业的助手..."
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]" onClick={() => setBasicForm(DEFAULT_BASIC_FORM)}>
                    重置
                  </Button>
                  <Button className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]" onClick={handleMockSave}>
                    保存基本信息
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feishu">
            <Card className="border-[var(--line-soft)] bg-white/80">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg text-[var(--ink-1)]">飞书绑定</CardTitle>
                  <Badge variant={feishuConfig ? 'default' : 'secondary'}>
                    {feishuConfig ? '已配置' : '未配置'}
                  </Badge>
                </div>
                <CardDescription className="text-[var(--ink-2)]">
                  已将原 Channel 页面绑定逻辑迁移到此处，保存后会调用 channel API 热更新。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="feishu-config-name">配置名称</Label>
                    <Input
                      id="feishu-config-name"
                      value={feishuForm.name}
                      onChange={(event) => setFeishuForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Feishu Bot"
                      disabled={feishuLoading || feishuSaving || feishuDeleting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="feishu-app-id">App ID</Label>
                    <Input
                      id="feishu-app-id"
                      value={feishuForm.appId}
                      onChange={(event) => setFeishuForm((prev) => ({ ...prev, appId: event.target.value }))}
                      placeholder="cli_xxx"
                      disabled={feishuLoading || feishuSaving || feishuDeleting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="feishu-app-secret">App Secret</Label>
                    <Input
                      id="feishu-app-secret"
                      type="password"
                      value={feishuForm.appSecret}
                      onChange={(event) => setFeishuForm((prev) => ({ ...prev, appSecret: event.target.value }))}
                      placeholder="********"
                      disabled={feishuLoading || feishuSaving || feishuDeleting}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-[var(--line-soft)] bg-white p-3">
                  <input
                    id="feishu-enabled"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={feishuForm.enabled}
                    onChange={(event) => setFeishuForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                    disabled={feishuLoading || feishuSaving || feishuDeleting}
                  />
                  <Label htmlFor="feishu-enabled" className="text-sm font-normal">
                    启用飞书通道（保存后生效）
                  </Label>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    className="border-[var(--line-soft)] text-[var(--ink-2)]"
                    onClick={() => setFeishuForm(DEFAULT_FEISHU_FORM)}
                    disabled={feishuLoading || feishuSaving || feishuDeleting}
                  >
                    重置
                  </Button>
                  <Button
                    variant="outline"
                    className="border-[var(--line-soft)] text-[var(--ink-2)]"
                    onClick={() => void loadChannelConfigs()}
                    disabled={feishuLoading || feishuSaving || feishuDeleting}
                  >
                    {feishuLoading ? '刷新中...' : '刷新'}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-[#dc6f6848] text-[#a53f37] hover:bg-[#fff4f3]"
                    onClick={() => void handleFeishuDelete()}
                    disabled={!feishuConfig || feishuLoading || feishuSaving || feishuDeleting}
                  >
                    {feishuDeleting ? '删除中...' : '删除配置'}
                  </Button>
                  <Button
                    className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]"
                    onClick={() => void handleFeishuSave()}
                    disabled={feishuLoading || feishuSaving || feishuDeleting}
                  >
                    {feishuSaving ? '保存中...' : '保存飞书绑定'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rag">
            <Card className="border-[var(--line-soft)] bg-white/80">
              <CardHeader>
                <CardTitle className="text-lg text-[var(--ink-1)]">知识库 / RAG</CardTitle>
                <CardDescription className="text-[var(--ink-2)]">
                  Bot 侧只负责选择知识库。知识库的创建、文档维护与检索测试请在独立页面操作。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line-soft)] bg-white p-4">
                  <div>
                    <div className="text-sm text-[var(--ink-1)]">当前已绑定 {boundKnowledgeBaseIds.length} 个知识库</div>
                    <div className="mt-1 text-xs text-[var(--ink-2)]">会话时会自动从这些知识库检索上下文。</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="border-[var(--line-soft)] text-[var(--ink-2)]"
                      onClick={() => void loadKnowledgeBases()}
                      disabled={knowledgeLoading || knowledgeMutatingId !== null}
                    >
                      {knowledgeLoading ? '刷新中...' : '刷新'}
                    </Button>
                    <Button asChild className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]">
                      <Link href="/knowledge-bases">知识库管理页</Link>
                    </Button>
                  </div>
                </div>

                {knowledgeLoading ? (
                  <div className="rounded-2xl border border-[var(--line-soft)] bg-white p-4 text-sm text-[var(--ink-2)]">
                    正在加载知识库...
                  </div>
                ) : knowledgeBases.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--line-soft)] bg-white p-4 text-sm text-[var(--ink-2)]">
                    暂无知识库。请先前往知识库页面创建。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {knowledgeBases.map((item) => {
                      const isBound = boundKnowledgeBaseIds.includes(item.id);
                      const isMutating = knowledgeMutatingId === item.id;
                      return (
                        <div key={item.id} className="rounded-2xl border border-[var(--line-soft)] bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-medium text-[var(--ink-1)]">{item.name}</div>
                                <Badge variant={isBound ? 'default' : 'secondary'}>
                                  {isBound ? '已绑定' : '未绑定'}
                                </Badge>
                              </div>
                              {item.description ? (
                                <div className="mt-1 text-xs text-[var(--ink-2)]">{item.description}</div>
                              ) : null}
                              <div className="mt-2 text-xs text-[var(--ink-2)]">
                                文档 {item._count?.documents ?? 0} · 被 Bot 绑定 {item._count?.bots ?? 0}
                              </div>
                            </div>
                            <Button
                              className={isBound ? 'bg-[#76641f] text-white hover:bg-[#6a591b]' : 'bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]'}
                              onClick={() => void handleToggleKnowledgeBase(item.id)}
                              disabled={knowledgeMutatingId !== null}
                            >
                              {isMutating ? '处理中...' : isBound ? '解绑' : '绑定到当前 Bot'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {status ? (
          <div className="rounded-xl border border-[var(--line-soft)] bg-white/80 px-3 py-2 text-sm text-[var(--ink-2)]">
            {status}
          </div>
        ) : null}
      </div>
    </main>
  );
}
