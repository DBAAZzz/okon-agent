/**
 * 文件解析器 — 将上传的文件统一转换为纯文本
 * 支持: PDF, DOCX, TXT, Markdown
 */

import TurndownService from 'turndown'

const turndown = new TurndownService()

const SUPPORTED_TYPES = new Set(['pdf', 'docx', 'txt', 'md'])
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export type FileType = 'pdf' | 'docx' | 'txt' | 'md'

export function detectFileType(fileName: string): FileType | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (!ext || !SUPPORTED_TYPES.has(ext)) return null
  return ext as FileType
}

export function validateFile(fileName: string, size: number): { ok: true; fileType: FileType } | { ok: false; error: string } {
  const fileType = detectFileType(fileName)
  if (!fileType) {
    return { ok: false, error: `不支持的文件类型，仅支持: ${[...SUPPORTED_TYPES].join(', ')}` }
  }
  if (size > MAX_FILE_SIZE) {
    return { ok: false, error: `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)` }
  }
  return { ok: true, fileType }
}

export async function parseFile(buffer: Buffer, fileType: FileType): Promise<string> {
  switch (fileType) {
    case 'pdf':
      return parsePdf(buffer)
    case 'docx':
      return parseDocx(buffer)
    case 'txt':
    case 'md':
      return buffer.toString('utf-8')
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const pdf = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await pdf.getText()
  await pdf.destroy()
  return result.text
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml({ buffer })
  // 复用项目已有的 Turndown 将 HTML 转 Markdown
  return turndown.turndown(result.value)
}
