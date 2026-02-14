export type ToolCallInfo = {
    toolName: string;
    input: unknown;
};
export type ApprovalRequestPart = {
    type: 'tool-approval-request';
    approvalId: string;
    toolCall: ToolCallInfo;
};
//# sourceMappingURL=tool.d.ts.map