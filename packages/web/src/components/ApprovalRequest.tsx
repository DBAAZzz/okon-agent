'use client';

import type { ApprovalRequestPart } from '@okon/shared';

export function ApprovalRequest({
  approvals,
  onApprove,
  onDeny
}: {
  approvals: ApprovalRequestPart[];
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}) {
  if (approvals.length === 0) return null;

  return (
    <div className="border-t-4 border-yellow-500 bg-yellow-50 p-4">
      <div className="text-yellow-800 font-bold mb-2">
        ⚠️ 工具调用审批请求
      </div>

      {approvals.map((approval) => (
        <div key={approval.approvalId} className="bg-white rounded-lg p-4 mb-3 border border-yellow-300">
          <div className="mb-2">
            <span className="font-semibold text-gray-700">工具: </span>
            <span className="text-gray-900 font-mono">{approval.toolCall.toolName}</span>
          </div>
          <div className="mb-3">
            <span className="font-semibold text-gray-700">参数: </span>
            <pre className="mt-1 bg-gray-100 p-2 rounded text-sm overflow-x-auto">
              {JSON.stringify(approval.toolCall.input, null, 2)}
            </pre>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(approval.approvalId)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              ✓ 批准 (Approve)
            </button>
            <button
              onClick={() => onDeny(approval.approvalId)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              ✗ 拒绝 (Deny)
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
