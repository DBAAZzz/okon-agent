import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export interface ExtractPdfTextResult {
  pageCount: number;
  text: string;
  textLength: number;
}

function normalizeText(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function looksLikePdf(buffer: Buffer): boolean {
  if (buffer.byteLength < 5) {
    return false;
  }

  return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
}

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<ExtractPdfTextResult> {
  const parsed = await pdfParse(buffer);
  const text = normalizeText(parsed.text ?? '');

  return {
    pageCount: Number(parsed.numpages ?? 0),
    text,
    textLength: text.length
  };
}
