import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ModelMessage, ToolApprovalResponse } from 'ai';
import { streamToolAgent } from '../packages/agent/src/agent/tool-agent.js';

type CheckName =
  | 'calculator_tool_called'
  | 'weather_approval_requested'
  | 'weather_runs_after_approval'
  | 'weather_not_run_after_denial';

type ApprovalAction = 'approve' | 'deny';

type EvalCase = {
  id: string;
  description: string;
  prompt: string;
  checks: CheckName[];
  approvalAction?: ApprovalAction;
};

type EvalSuite = {
  cases: EvalCase[];
};

type AgentResult = Awaited<ReturnType<typeof streamToolAgent>>;
type TurnContentPart = Awaited<AgentResult['content']>[number];
type ToolApprovalRequestPart = Extract<TurnContentPart, { type: 'tool-approval-request' }>;

type TurnResult = {
  text: string;
  content: TurnContentPart[];
  steps: Awaited<AgentResult['steps']>;
  nextHistory: ModelMessage[];
};

type EvalResult = {
  id: string;
  description: string;
  passed: boolean;
  failures: string[];
};

function isToolApprovalRequest(part: TurnContentPart): part is ToolApprovalRequestPart {
  return part.type === 'tool-approval-request';
}

function hasToolCall(steps: TurnResult['steps'], toolName: string): boolean {
  return steps.some(step => step.toolCalls.some(toolCall => toolCall.toolName === toolName));
}

function hasToolResult(steps: TurnResult['steps'], toolName: string): boolean {
  return steps.some(step => step.toolResults.some(toolResult => toolResult.toolName === toolName));
}

function printCaseHeader(testCase: EvalCase): void {
  console.log(`\n[CASE] ${testCase.id}`);
  console.log(`desc: ${testCase.description}`);
}

async function runTurn(history: ModelMessage[]): Promise<TurnResult> {
  const result = await streamToolAgent(history);

  let text = '';
  for await (const chunk of result.textStream) {
    text += chunk;
  }

  const [content, response, steps] = await Promise.all([
    result.content,
    result.response,
    result.steps
  ]);

  return {
    text,
    content,
    steps,
    nextHistory: [...history, ...response.messages]
  };
}

async function loadCases(): Promise<EvalCase[]> {
  const filePath = resolve(process.cwd(), 'evals/cases.json');
  const raw = await readFile(filePath, 'utf-8');
  const suite = JSON.parse(raw) as EvalSuite;
  return suite.cases;
}

async function runCase(testCase: EvalCase): Promise<EvalResult> {
  printCaseHeader(testCase);

  const failures: string[] = [];
  const history: ModelMessage[] = [{ role: 'user', content: testCase.prompt }];

  const firstTurn = await runTurn(history);
  const approvals = firstTurn.content.filter(isToolApprovalRequest);

  let secondTurn: TurnResult | undefined;
  if (testCase.approvalAction !== undefined) {
    if (approvals.length === 0) {
      failures.push('期望出现审批请求，但第一轮未出现 tool-approval-request。');
    } else {
      const approved = testCase.approvalAction === 'approve';
      const approvalResponses: ToolApprovalResponse[] = approvals.map(part => ({
        type: 'tool-approval-response',
        approvalId: part.approvalId,
        approved,
        reason: approved ? 'Eval approved' : 'Eval denied'
      }));

      const secondHistory: ModelMessage[] = [
        ...firstTurn.nextHistory,
        { role: 'tool', content: approvalResponses }
      ];
      secondTurn = await runTurn(secondHistory);
    }
  }

  for (const check of testCase.checks) {
    switch (check) {
      case 'calculator_tool_called': {
        if (!hasToolCall(firstTurn.steps, 'calculator')) {
          failures.push('未检测到 calculator 工具调用。');
        }
        break;
      }
      case 'weather_approval_requested': {
        const hasWeatherApproval = approvals.some(
          approval => approval.toolCall.toolName === 'weather'
        );
        if (!hasWeatherApproval) {
          failures.push('未检测到 weather 工具审批请求。');
        }
        break;
      }
      case 'weather_runs_after_approval': {
        if (secondTurn === undefined || !hasToolResult(secondTurn.steps, 'weather')) {
          failures.push('审批通过后未检测到 weather 工具执行结果。');
        }
        break;
      }
      case 'weather_not_run_after_denial': {
        if (secondTurn === undefined) {
          failures.push('审批拒绝场景未执行第二轮对话。');
          break;
        }
        if (hasToolResult(secondTurn.steps, 'weather')) {
          failures.push('审批拒绝后仍检测到 weather 工具执行结果。');
        }
        break;
      }
      default: {
        const neverCheck: never = check;
        failures.push(`未知检查项: ${String(neverCheck)}`);
      }
    }
  }

  const passed = failures.length === 0;
  console.log(passed ? '[PASS]' : '[FAIL]', testCase.id);
  if (!passed) {
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
  }

  return {
    id: testCase.id,
    description: testCase.description,
    passed,
    failures
  };
}

async function main(): Promise<void> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('Missing DEEPSEEK_API_KEY');
  }

  const testCases = await loadCases();
  if (testCases.length === 0) {
    throw new Error('No eval cases found in evals/cases.json');
  }

  console.log(`[EVAL] running ${testCases.length} cases`);
  const results: EvalResult[] = [];

  for (const testCase of testCases) {
    const result = await runCase(testCase);
    results.push(result);
  }

  const passedCount = results.filter(result => result.passed).length;
  const failedCount = results.length - passedCount;

  console.log('\n[EVAL] summary');
  console.log(`passed: ${passedCount}`);
  console.log(`failed: ${failedCount}`);

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[EVAL] failed:', message);
  process.exitCode = 1;
});
