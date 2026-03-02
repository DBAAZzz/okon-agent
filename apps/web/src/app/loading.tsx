export default function Loading() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-8 text-center shadow-[0_24px_70px_-45px_rgba(24,38,59,0.55)]">
        <p className="text-lg text-[var(--ink-1)]">页面加载中...</p>
        <p className="mt-2 text-sm text-[var(--ink-2)]">正在获取最新数据，请稍候。</p>
      </div>
    </main>
  );
}
