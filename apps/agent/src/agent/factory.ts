import { stepCountIs, ToolLoopAgent } from 'ai'
import { modelRegistry } from './models/index.js'
import {
  weatherTool,
  getOutdoorActivitiesTool,
  ipLookupTool,
} from '../tools/index.js'

export const DEFAULT_MODEL = 'deepseek-chat'

const tools = {
  weather: weatherTool,
  getOutdoorActivities: getOutdoorActivitiesTool,
  ipLookup: ipLookupTool,
}

export function createAgent(modelId: string, instructions: string) {
  const model = modelRegistry.get(modelId)
  return new ToolLoopAgent({
    model,
    instructions,
    tools,
    stopWhen: stepCountIs(5),
  })
}
