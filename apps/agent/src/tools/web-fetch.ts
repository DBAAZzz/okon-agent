import { tool } from 'ai';
import { z } from 'zod';
import { createLogger } from '@okon/shared';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const logger = createLogger('tool-web-fetch');
const turndownService = new TurndownService();

type WebFetchFormat = 'auto' | 'markdown' | 'json' | 'xml' | 'text';

function resolveOutputFormat(contentType: string, format: WebFetchFormat): Exclude<WebFetchFormat, 'auto'> {
  if (format !== 'auto') {
    return format;
  }

  const normalized = contentType.toLowerCase();
  if (normalized.includes('json')) {
    return 'json';
  }
  if (normalized.includes('xml')) {
    return 'xml';
  }
  if (normalized.includes('html')) {
    return 'markdown';
  }
  return 'text';
}

function truncateText(content: string, maxChars: number) {
  if (content.length <= maxChars) {
    return {
      content,
      truncated: false
    };
  }

  return {
    content: content.slice(0, maxChars),
    truncated: true
  };
}

export const webFetchTool = tool({
  description: '获取 URL 内容并按格式返回，支持自动识别 HTML/JSON/XML/文本',
  inputSchema: z.object({
    url: z.string().url().describe('要抓取的 URL 地址'),
    format: z.enum(['auto', 'markdown', 'json', 'xml', 'text']).default('auto').describe('输出格式，默认 auto'),
    maxChars: z.number().int().min(500).max(50000).default(10000).describe('文本类输出的最大字符数')
  }),
  needsApproval: false,
  execute: async ({ url, format, maxChars }) => {
    logger.info('执行 web 抓取', { url, format, maxChars });

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const outputFormat = resolveOutputFormat(contentType, format);
      const rawContent = await response.text();

      if (outputFormat === 'json') {
        try {
          return {
            success: true,
            url,
            format: 'json' as const,
            contentType,
            data: JSON.parse(rawContent)
          };
        } catch {
          return {
            success: false,
            url,
            format: 'json' as const,
            error: 'Failed to parse JSON response'
          };
        }
      }

      if (outputFormat === 'xml') {
        const trimmed = truncateText(rawContent, maxChars);
        return {
          success: true,
          url,
          format: 'xml' as const,
          contentType,
          content: trimmed.content,
          length: rawContent.length,
          truncated: trimmed.truncated
        };
      }

      if (outputFormat === 'markdown') {
        const dom = new JSDOM(rawContent, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        let markdownContent = '';
        if (article?.content) {
          markdownContent = turndownService.turndown(article.content).trim();
        }

        if (!markdownContent) {
          const bodyHtml = dom.window.document.body?.innerHTML ?? '';
          markdownContent = turndownService.turndown(bodyHtml).trim();
        }

        if (!markdownContent) {
          return {
            success: false,
            url,
            format: 'markdown' as const,
            error: 'Failed to extract readable content from HTML'
          };
        }

        const trimmed = truncateText(markdownContent, maxChars);
        return {
          success: true,
          url,
          format: 'markdown' as const,
          contentType,
          title: article?.title ?? null,
          byline: article?.byline ?? null,
          excerpt: article?.excerpt ?? null,
          content: trimmed.content,
          length: markdownContent.length,
          truncated: trimmed.truncated
        };
      }

      const trimmed = truncateText(rawContent, maxChars);
      return {
        success: true,
        url,
        format: 'text' as const,
        contentType,
        content: trimmed.content,
        length: rawContent.length,
        truncated: trimmed.truncated
      };
    } catch (error) {
      logger.error('web 抓取失败', { url, error });
      return {
        success: false,
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
});
