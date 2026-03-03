"use client";

import type { ApprovalRequestPart } from "@okon/shared";

export function ApprovalRequest({
  approvals,
  onApprove,
  onDeny,
}: {
  approvals: ApprovalRequestPart[];
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}) {
  if (approvals.length === 0) return null;

  return (
    <section className="border-t border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(242,192,120,0.16),rgba(242,192,120,0.08))] p-3 md:p-4">
      <div className="mb-3 rounded-xl border border-[#bf7f1f55] bg-white/80 px-3 py-2 text-sm font-semibold text-[#6b3e09]">
        工具调用审批请求
      </div>

      {approvals.map((approval) => (
        <div
          key={approval.approvalId}
          className="mb-3 rounded-2xl border border-[#bf7f1f44] bg-white/90 p-4 shadow-[0_18px_30px_-24px_rgba(101,64,14,0.45)]"
        >
          <div className="mb-2 text-sm text-[var(--ink-2)]">
            <span className="font-semibold">工具: </span>
            <span className="font-mono text-[var(--ink-1)]">{approval.toolCall.toolName}</span>
          </div>
          <div className="mb-3">
            <span className="font-semibold text-[var(--ink-2)] text-sm">参数:</span>
            <pre className="mt-1 overflow-x-auto rounded-xl border border-[var(--line-soft)] bg-[#f9f6ef] p-3 text-xs text-[var(--ink-1)]">
              {JSON.stringify(approval.toolCall.input, null, 2)}
            </pre>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(approval.approvalId)}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] transition-colors"
            >
              批准
            </button>
            <button
              onClick={() => onDeny(approval.approvalId)}
              className="rounded-xl bg-[#b33b2f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#972b1f] transition-colors"
            >
              拒绝
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
