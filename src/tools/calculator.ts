import { tool } from 'ai';
import { z } from 'zod';
import { createLogger } from '../logger.js';

const logger = createLogger('tool-calculator');

/**
 * strict 严格模式
 * 支持严格工具调用的语言模型提供者将仅生成符合您定义的 inputSchema 规则的工具调用
 */

export const calculatorTool = tool({
  description: '计算两数之和',
  strict: false,
  inputSchema: z.object({
    a: z.number().describe('计算的数值1'),
    b: z.number().describe('计算的数值2')
  }),
  execute: async ({ a, b }: { a: number; b: number }) => {
    logger.info('调用自定义计算器tool');
    logger.info('计算两数之和参数', { a, b });
    return { result: a + b };
  }
});
