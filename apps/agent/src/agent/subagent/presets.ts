import { z } from 'zod'
import { webSearchTool } from '../../tools/web-search.js'
import { webFetchTool } from '../../tools/web-fetch.js'

export interface SubagentPreset {
  description: string
  instructions: string
  tools: Record<string, any>
  defaultMaxSteps: number
  outputSchema: z.ZodType
}

/**
 * Subagent 预设配置表
 * 新增 subagent 类型只需在这里加一条记录
 */
export const SUBAGENT_PRESETS = {
  research: {
    description: '委托深度研究任务（检索+抓取+总结）。使用webFetchTool读取webSearchTool获取到的URL',
    instructions: `你是研究子代理。
    - 先澄清研究目标：明确要回答的问题与限制条件。
    - 再执行研究：优先检索，再按需抓取网页正文。
    - 严格按 outputSchema 输出结构化结果。
    - 严禁编造来源或未验证事实。`,
    tools: { webSearchTool, webFetchTool },
    defaultMaxSteps: 4,
    outputSchema: z.object({
      conclusion: z.string().describe('研究结论'),
      keyFindings: z.array(z.string()).describe('关键发现'),
      sources: z.array(z.string()).describe('来源 URL'),
      uncertainties: z.array(z.string()).describe('仍不确定的点'),
    }),
  },
  planner: {
    description: '将复杂任务拆解为可执行计划。调用后你需要按返回的步骤列表逐步执行，每步完成后再进行下一步。',
    instructions: `你是规划子代理。
    - 将任务拆解为可执行步骤。
    - 每一步说明目标、输入、预期产出、依赖关系。
    - 如信息不足，列出需要向用户确认的问题。
    - 严格按 outputSchema 输出结构化结果。仅以 JSON 格式响应。
    - 不做外部检索，不编造事实。`,
    tools: {},
    defaultMaxSteps: 2,
    outputSchema: z.object({
      steps: z.array(z.object({
        goal: z.string().describe('步骤目标'),
        input: z.string().describe('输入'),
        expectedOutput: z.string().describe('预期产出'),
        dependencies: z.array(z.string()).describe('依赖的前置步骤'),
      })).describe('执行步骤'),
      questionsForUser: z.array(z.string()).describe('需要向用户确认的问题'),
    }),
  },
} satisfies Record<string, SubagentPreset>

export type SubagentType = keyof typeof SUBAGENT_PRESETS
