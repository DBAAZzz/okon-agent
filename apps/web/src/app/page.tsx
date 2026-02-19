'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Separator,
} from '@okon/ui';
import { useBots } from '@/hooks/useBots';

const PROVIDER_LABEL: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  ollama: 'Ollama',
};

export default function Home() {
  const router = useRouter();
  const { bots, isLoading, error } = useBots();
  const [keyword, setKeyword] = useState('');

  const filteredBots = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) {
      return bots;
    }

    return bots.filter((bot) => {
      const provider = PROVIDER_LABEL[bot.provider] ?? bot.provider;
      return [bot.name, provider, bot.model]
        .filter(Boolean)
        .some((item) => item.toLowerCase().includes(normalized));
    });
  }, [bots, keyword]);

  const providerCount = useMemo(() => {
    return new Set(bots.map((bot) => bot.provider)).size;
  }, [bots]);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <Card className="border-[var(--line-soft)] bg-[var(--surface-1)] shadow-[0_28px_80px_-40px_rgba(24,38,59,0.55)]">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-3xl text-[var(--ink-1)]">Bot Workspace</CardTitle>
                <CardDescription className="mt-2 text-sm text-[var(--ink-2)]">
                  首页只负责选择 Bot，进入后再管理 Session。
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                  <Link href="/knowledge-bases">知识库</Link>
                </Button>
                <Button asChild variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                  <Link href="/bots">管理 Bot</Link>
                </Button>
                <Button asChild className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]">
                  <Link href="/bots">新建 Bot</Link>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--line-soft)] bg-white/75 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--ink-2)]">Bots</div>
                <div className="mt-2 text-2xl font-semibold text-[var(--ink-1)]">{bots.length}</div>
              </div>
              <div className="rounded-2xl border border-[var(--line-soft)] bg-white/75 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--ink-2)]">Providers</div>
                <div className="mt-2 text-2xl font-semibold text-[var(--ink-1)]">{providerCount}</div>
              </div>
              <div className="rounded-2xl border border-[var(--line-soft)] bg-white/75 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--ink-2)]">Ready To Chat</div>
                <div className="mt-2 text-2xl font-semibold text-[var(--ink-1)]">{filteredBots.length}</div>
              </div>
            </div>

            <Separator className="my-5 bg-[var(--line-soft)]" />

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="w-full md:max-w-sm">
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索 Bot 名称 / Provider / Model"
                  className="border-[var(--line-soft)] bg-white"
                />
              </div>
              <div className="text-xs text-[var(--ink-2)]">
                点击 Bot 进入会话页，或使用编辑按钮进入配置页。
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <section className="space-y-3">
            {isLoading ? (
              <Card className="border-[var(--line-soft)] bg-white/75">
                <CardContent className="p-6 text-sm text-[var(--ink-2)]">Loading bots...</CardContent>
              </Card>
            ) : null}

            {error ? (
              <Card className="border-[#b33b2f66] bg-[#fef2f1]">
                <CardContent className="p-6 text-sm text-[#8b2219]">加载 Bot 失败，请稍后重试。</CardContent>
              </Card>
            ) : null}

            {!isLoading && !error && filteredBots.length === 0 ? (
              <Card className="border-[var(--line-soft)] bg-white/75">
                <CardContent className="p-6 text-sm text-[var(--ink-2)]">
                  未找到匹配的 Bot。可以尝试更换关键词或创建新的 Bot。
                </CardContent>
              </Card>
            ) : null}

            {!isLoading && !error
              ? filteredBots.map((bot) => (
                  <Card
                    key={bot.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/chat/${bot.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        router.push(`/chat/${bot.id}`);
                      }
                    }}
                    className="cursor-pointer border-[var(--line-soft)] bg-white/80 transition hover:border-[rgba(15,118,110,0.35)] hover:shadow-[0_18px_40px_-30px_rgba(20,35,58,0.55)]"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-lg font-semibold text-[var(--ink-1)]">{bot.name}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="bg-[#e7f6f4] text-[#0f5f5b]">
                              {PROVIDER_LABEL[bot.provider] ?? bot.provider}
                            </Badge>
                            <Badge variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                              {bot.model}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button asChild variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                            <Link href={`/bots/${bot.id}/edit`} onClick={(event) => event.stopPropagation()}>
                              编辑
                            </Link>
                          </Button>
                          <Button asChild className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]">
                            <Link href={`/chat/${bot.id}`} onClick={(event) => event.stopPropagation()}>
                              进入会话
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              : null}
          </section>

          <aside>
            <Card className="border-[var(--line-soft)] bg-white/70">
              <CardHeader>
                <CardTitle className="text-lg text-[var(--ink-1)]">导航说明</CardTitle>
                <CardDescription className="text-[var(--ink-2)]">
                  当前流程已拆分为 Bot 选择层和 Session 工作层。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[var(--ink-2)]">
                <div className="rounded-xl border border-[var(--line-soft)] bg-white p-3">
                  1. 在首页选择 Bot。
                </div>
                <div className="rounded-xl border border-[var(--line-soft)] bg-white p-3">
                  2. 进入会话页后创建/选择 Session。
                </div>
                <div className="rounded-xl border border-[var(--line-soft)] bg-white p-3">
                  3. Bot 编辑页处理 Bot 配置与知识库选择，知识库维护在独立页面完成。
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
