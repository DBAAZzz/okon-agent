import { tool } from 'ai';
import { z } from 'zod';

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
  execute: async ({ a, b }) => {
    console.log("调用自定义计算器tool")
    console.log("计算两数之和参数：", { a, b })
    return { result: a + b };
  }
});
