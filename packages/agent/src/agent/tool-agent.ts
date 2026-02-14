import { stepCountIs, ToolLoopAgent } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { ModelMessage } from 'ai';
import { z } from 'zod';
import {
  weatherTool,
  getOutdoorActivitiesTool,
  ipLookupTool
} from '../tools/index.js';
import { createLogger } from '@okon/shared';

const logger = createLogger('tool-agent');
const baseInstructions =
  '灵活使用工具回答，目前有：weather、getOutdoorActivities、ipLookup。ipLookup 始终可用且无需审批。weather 需要审批；若审批被拒绝，不要重试同一工具，直接向用户说明。';

  const toolAgentCallOptionsSchema = z.object({});
export type ToolAgentRunOptions = z.infer<typeof toolAgentCallOptionsSchema>;

const apiKey = process.env.DEEPSEEK_API_KEY;

if (!apiKey) {
  throw new Error('Missing DEEPSEEK_API_KEY');
}

const deepseek = createDeepSeek({
  apiKey,
  baseURL: 'https://api.deepseek.com/v1'
});

export const toolAgent = new ToolLoopAgent({
  model: deepseek('deepseek-chat'),
  instructions: baseInstructions,
  tools: {
    weather: weatherTool,
    getOutdoorActivities: getOutdoorActivitiesTool,
    ipLookup: ipLookupTool
  },
  callOptionsSchema: toolAgentCallOptionsSchema,
  stopWhen: stepCountIs(5),
  onStepFinish: (result) => {
    logger.info('最终结果', result?.content);
  }
});

export async function streamToolAgent(
  messages: ModelMessage[],
  options: ToolAgentRunOptions = {}
) {
  logger.debug('上下文', { messagesLength: messages.length, options });
  return toolAgent.stream({ messages, options });
}
