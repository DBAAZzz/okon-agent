import { tool } from 'ai';
import { z } from 'zod';
import { createLogger } from '@okon/shared';

const CONDITIONS = ['sunny', 'cloudy', 'rainy', 'windy', 'snowy', 'foggy'] as const;
const logger = createLogger('tool-weather');
type Condition = (typeof CONDITIONS)[number];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const weatherTool = tool({
  description: '获取地区温度',
  inputSchema: z.object({
    location: z.string().describe('获取天气的地点')
  }),
  needsApproval: true,
  execute: async ({ location }) => {
    logger.info('获取地区温度参数', { location });
    const temperature = randomInt(-10, 40);
    const conditions = CONDITIONS[randomInt(0, CONDITIONS.length - 1)];
    const humidity = randomInt(20, 95);

    return { location, temperature, conditions, humidity };
  }
});

export const getOutdoorActivitiesTool = tool({
  description: '根据天气条件推荐户外活动和注意事项',
  inputSchema: z.object({
    location: z.string().optional(),
    temperature: z.number(),
    conditions: z.enum(CONDITIONS),
    humidity: z.number().min(0).max(100).optional()
  }),
  execute: async ({ location, temperature, conditions, humidity }: {
    location?: string;
    temperature: number;
    conditions: Condition;
    humidity?: number;
  }) => {
    const base = {
      location: location ?? 'unknown',
      conditions,
      temperature,
      humidity: humidity ?? null
    };

    if (conditions === 'rainy' || conditions === 'snowy' || conditions === 'foggy') {
      return {
        ...base,
        suitable: false,
        refusal: true,
        refusalReason: '当前天气存在明显安全风险，建议取消户外活动。',
        suggestions: ['改为室内活动：健身房、室内攀岩、羽毛球馆', '等待天气好转后再安排出行'],
        recommended: []
      };
    }

    if (temperature <= -2 || temperature >= 36) {
      return {
        ...base,
        suitable: false,
        refusal: true,
        refusalReason: '当前温度过低或过高，不建议外出进行户外活动。',
        suggestions: ['改为室内活动', '如必须外出，请缩短时长并做好防护'],
        recommended: []
      };
    }

    if (conditions === 'windy') {
      return {
        ...base,
        suitable: true,
        refusal: false,
        refusalReason: null,
        suggestions: ['选择遮风路线', '避免高空或临水区域', '随身携带防风外套'],
        recommended: ['城市公园快走', '短距离骑行（非沿海/非高架）']
      };
    }

    if (conditions === 'cloudy') {
      return {
        ...base,
        suitable: true,
        refusal: false,
        refusalReason: null,
        suggestions: ['适合中等强度运动', '注意补水并关注实时天气变化'],
        recommended: ['徒步', '慢跑', '骑行']
      };
    }

    return {
      ...base,
      suitable: true,
      refusal: false,
      refusalReason: null,
      suggestions: ['建议早上或傍晚出发，避开紫外线高峰', '带够饮用水和防晒用品'],
      recommended: ['公园慢跑', '郊野徒步', '飞盘']
    };
  }
});
