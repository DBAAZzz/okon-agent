"use client";

import { useState, KeyboardEvent } from "react";
import { Button, Textarea } from "@okon/ui";

export function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (message: string) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-[var(--line-soft)] bg-[rgba(255,255,255,0.72)] p-3 md:p-4">
      <div className="rounded-2xl border border-[var(--line-soft)] bg-white/90 p-2 shadow-[0_16px_35px_-24px_rgba(20,35,58,0.5)] backdrop-blur-sm flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            disabled ? "请先处理审批请求..." : "输入消息... (Enter 发送, Shift+Enter 换行)"
          }
          className="flex-1 min-h-0 resize-none rounded-xl border-none bg-transparent px-3 py-2 text-[15px] text-[var(--ink-1)] placeholder:text-[var(--ink-2)]/70 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed"
          rows={2}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className="self-end rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold tracking-wide text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          发送
        </Button>
      </div>
    </div>
  );
}
