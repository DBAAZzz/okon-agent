"use client";

import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[#b33b2f66] bg-[#fef2f1] p-8 text-center shadow-[0_24px_70px_-45px_rgba(24,38,59,0.55)]">
        <h1 className="text-2xl text-[#8b2219]">页面出现异常</h1>
        <p className="mt-2 text-sm text-[#8b2219]">{error.message || "请稍后重试。"}</p>
        <button
          onClick={reset}
          className="mt-5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-strong)] transition"
        >
          重试
        </button>
      </div>
    </main>
  );
}
