import { tool } from 'ai';
import { z } from 'zod';
import { createLogger } from '@okon/shared';
import { tavily } from '@tavily/core';

const logger = createLogger('tool-web-search');

type WebSearchResult = {
  title: string;
  url: string;
  content: string;
  score: number | null;
  publishedDate: string | null;
};

type BraveSearchResponse = {
  query?: {
    original?: string;
  };
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      age?: string;
      extra_snippets?: string[];
    }>;
  };
};

async function searchWithTavily(query: string, maxResults: number, searchDepth: 'basic' | 'advanced') {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    logger.warn('缺少 TAVILY_API_KEY');
    return {
      success: false,
      provider: 'tavily' as const,
      query,
      error: 'Missing TAVILY_API_KEY environment variable'
    };
  }

  const client = tavily({ apiKey });
  const data = await client.search(query, {
    searchDepth,
    includeAnswer: true,
    includeImages: false,
    includeRawContent: false,
    maxResults
  });

  const normalizedResults: WebSearchResult[] = (data.results ?? []).map((item) => ({
    title: item.title,
    url: item.url,
    content: item.content,
    score: item.score,
    publishedDate: item.publishedDate ?? null
  }));

  return {
    success: true,
    provider: 'tavily' as const,
    query: data.query ?? query,
    answer: data.answer ?? null,
    results: normalizedResults,
    totalResults: normalizedResults.length,
    responseTime: data.responseTime ?? null,
    requestId: data.requestId ?? null
  };
}

async function searchWithBrave(query: string, maxResults: number) {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    logger.warn('缺少 BRAVE_API_KEY');
    return {
      success: false,
      provider: 'brave' as const,
      query,
      error: 'Missing BRAVE_API_KEY environment variable'
    };
  }

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(maxResults));

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Brave API 请求失败: ${response.status} ${response.statusText}${detail ? ` - ${detail.slice(0, 200)}` : ''}`
    );
  }

  const data = await response.json() as BraveSearchResponse;
  const normalizedResults: WebSearchResult[] = (data.web?.results ?? []).map((item) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    content: [item.description ?? '', ...(item.extra_snippets ?? [])].filter(Boolean).join('\n'),
    score: null,
    publishedDate: item.age ?? null
  }));

  return {
    success: true,
    provider: 'brave' as const,
    query: data.query?.original ?? query,
    answer: null,
    results: normalizedResults,
    totalResults: normalizedResults.length,
    responseTime: null,
    requestId: null
  };
}

export const webSearchTool = tool({
  description: '互联网搜索工具，支持 Tavily 两个搜索提供方',
  inputSchema: z.object({
    provider: z.enum(['tavily']).default('tavily').describe('搜索提供方：tavily'),
    query: z.string().min(1).describe('要搜索的问题或关键词'),
    maxResults: z.number().int().min(1).max(10).default(5).describe('返回结果条数，默认 5'),
    searchDepth: z.enum(['basic', 'advanced']).default('basic').describe('Tavily 搜索深度，默认 basic')
  }),
  needsApproval: false,
  execute: async ({ provider, query, maxResults, searchDepth }) => {
    logger.info('执行 web 搜索', { provider, query, maxResults, searchDepth });

    try {
      // if (provider === 'brave') {
      //   return await searchWithBrave(query, maxResults);
      // }

      return await searchWithTavily(query, maxResults, searchDepth);
    } catch (error) {
      logger.error('web 搜索失败', { provider, query, error });
      return {
        success: false,
        provider,
        query,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
});
