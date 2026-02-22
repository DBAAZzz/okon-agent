import { tool, Output, stepCountIs, ToolLoopAgent } from 'ai'
import { z } from 'zod'
import { createLogger } from '@okon/shared'
import { modelRegistry } from '../models/index.js'
import { SUBAGENT_PRESETS } from './presets.js'

const logger = createLogger('subagent')

export type { SubagentType, SubagentPreset } from './presets.js'

export interface SubagentOptions {
  modelId: string
  maxSteps?: number
}

export interface SubagentStep {
  tool: string
  input: unknown
  output: unknown
}

export interface SubagentResult {
  /** 结构化输出（来自 outputSchema 约束） */
  output: Record<string, unknown> | null
  /** 原始文本（outputSchema 解析失败时的兜底） */
  text: string
  steps: SubagentStep[]
  /** 从 tool 调用结果中提取的真实 URL */
  sources: string[]
}

/**
 * 通用 subagent 工厂
 */
export function createSubagent(
  type: keyof typeof SUBAGENT_PRESETS,
  options: SubagentOptions,
): ToolLoopAgent {
  const preset = SUBAGENT_PRESETS[type]
  const model = modelRegistry.get(options.modelId)
  return new ToolLoopAgent({
    model,
    instructions: preset.instructions,
    tools: preset.tools,
    output: Output.object({ schema: preset.outputSchema as any }),
    stopWhen: stepCountIs(options.maxSteps ?? preset.defaultMaxSteps),
  })
}

/** 递归扫描任意对象中的 url 字段 */
function collectUrls(obj: unknown, urls: Set<string>): void {
  if (!obj || typeof obj !== 'object') return
  if (!Array.isArray(obj) && typeof (obj as any).url === 'string') {
    const u = (obj as any).url
    if (u.startsWith('http')) urls.add(u)
  }
  const values = Array.isArray(obj) ? obj : Object.values(obj)
  for (const val of values) collectUrls(val, urls)
}

function getStepToolCalls(step: any): Array<{ toolCallId?: string; toolName?: string; input?: unknown }> {
  if (Array.isArray(step?.toolCalls) && step.toolCalls.length > 0) {
    return step.toolCalls
  }
  if (Array.isArray(step?.content)) {
    return step.content.filter((part: any) => part?.type === 'tool-call')
  }
  return []
}

function getStepToolResults(step: any): Array<{ toolCallId?: string; output?: unknown }> {
  if (Array.isArray(step?.toolResults) && step.toolResults.length > 0) {
    return step.toolResults
  }
  if (Array.isArray(step?.content)) {
    return step.content.filter((part: any) => part?.type === 'tool-result')
  }
  return []
}

function readStructuredOutput(raw: any): Record<string, unknown> | null {
  const steps = Array.isArray(raw?.steps) ? raw.steps : []
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined

  // AI SDK 仅在最后一步 finishReason=stop 时保证 output 可读；
  // 否则访问 raw.output 会抛 NoOutputGeneratedError。
  if (!lastStep || lastStep.finishReason !== 'stop') {
    return null
  }

  try {
    const output = raw.output
    return output && typeof output === 'object' ? output : null
  } catch (error) {
    logger.warn('subagent 结构化输出不可用，回退到 steps/text', {
      finishReason: lastStep.finishReason,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * 从 generate 结果中提取结构化数据
 */
function toSubagentResult(raw: any): SubagentResult {
  const steps: SubagentStep[] = (raw.steps ?? []).flatMap((step: any) => {
    const toolCalls = getStepToolCalls(step)
    const toolResults = getStepToolResults(step)
    const outputByToolCallId = new Map<string, unknown>()

    for (const result of toolResults) {
      if (result && typeof result.toolCallId === 'string') {
        outputByToolCallId.set(result.toolCallId, result.output)
      }
    }

    return toolCalls.map((tc: any) => ({
      tool: tc.toolName,
      input: tc.input,
      output:
        tc && typeof tc.toolCallId === 'string'
          ? outputByToolCallId.get(tc.toolCallId)
          : undefined,
    }))
  })

  const urls = new Set<string>()
  for (const step of steps) collectUrls(step.output, urls)

  const structured = readStructuredOutput(raw)

  return { output: structured, text: raw.text ?? '', steps, sources: [...urls] }
}

/**
 * 根据 SUBAGENT_PRESETS 自动生成所有 subagent 对应的 tools
 * 新增 subagent 类型只需改 presets.ts，这里自动生效
 */
export function buildSubagentTools(modelId: string) {
  return Object.fromEntries(
    Object.entries(SUBAGENT_PRESETS).map(([type, preset]) => [
      type,
      tool({
        description: preset.description,
        inputSchema: z.object({ task: z.string().describe('任务描述') }),
        execute: async ({ task }, { abortSignal }) => {
          const subagent = createSubagent(type as keyof typeof SUBAGENT_PRESETS, { modelId })
          const result = await subagent.generate({ prompt: task, abortSignal })
          return toSubagentResult(result)
        },
        toModelOutput({ output: result }) {
          const lines: string[] = []

          if (result.output) {
            lines.push(JSON.stringify(result.output, null, 2))
          } else if (result.text) {
            lines.push(result.text)
          } else if (result.steps.length) {
            lines.push('子代理执行了以下步骤但未生成结构化输出：')
            for (const s of result.steps) {
              lines.push(`- ${s.tool}(${JSON.stringify(s.input)})`)
            }
          } else {
            lines.push('子代理未产生任何输出。')
          }

          if (result.sources.length) {
            lines.push('', 'Verified Sources:')
            for (const url of result.sources) lines.push(`- ${url}`)
          }

          return { type: 'text', value: lines.join('\n') }
        },
      }),
    ]),
  )
}
