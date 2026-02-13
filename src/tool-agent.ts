import { stepCountIs, ToolLoopAgent } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { ModelMessage } from 'ai';
import {
  calculatorTool,
  weatherTool,
  getOutdoorActivitiesTool
} from './tools/index.js';
import { createLogger } from './logger.js';

const logger = createLogger('tool-agent');

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
  instructions: '灵活使用工具回答，目前有：计算器和获取温度工具。工具审批被拒绝时，不要重试同一工具，直接向用户说明。',
  tools: {
    calculator: calculatorTool,
    weather: weatherTool,
    getOutdoorActivities: getOutdoorActivitiesTool
  },
  stopWhen: stepCountIs(5),
  onStepFinish: (result) => {
    logger.info('最终结果', result?.content);
  }
});

export async function streamToolAgent(messages: ModelMessage[]) {
  logger.debug('上下文', messages);
  return toolAgent.stream({ messages });
}
