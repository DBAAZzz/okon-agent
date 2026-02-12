import { tool } from 'ai';
import { z } from 'zod';

export const calculatorTool = tool({
  description: '计算两数之和',
  inputSchema: z.object({
    a: z.number().describe('计算的数值1'),
    b: z.number().describe('计算的数值2'),
  }),
  execute: async ({ a, b }) => {
    return a + b
  },
});