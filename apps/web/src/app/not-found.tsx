import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-8 text-center shadow-[0_24px_70px_-45px_rgba(24,38,59,0.55)]">
        <h1 className="text-2xl text-[var(--ink-1)]">页面不存在</h1>
        <p className="mt-2 text-sm text-[var(--ink-2)]">链接可能已失效，或资源已被删除。</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-strong)] transition"
          >
            返回首页
          </Link>
          <Link
            href="/bots"
            className="rounded-xl border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-white/70 transition"
          >
            前往 Bot 管理
          </Link>
        </div>
      </div>
    </main>
  );
}
