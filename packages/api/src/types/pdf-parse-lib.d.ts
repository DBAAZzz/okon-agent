declare module 'pdf-parse/lib/pdf-parse.js' {
  export interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }

  type PdfParse = (
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ) => Promise<PdfParseResult>;

  const pdfParse: PdfParse;
  export default pdfParse;
}

