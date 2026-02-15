import { createDeepSeek } from '@ai-sdk/deepseek';
import { createLogger } from '@okon/shared';
import {
  extractJsonMiddleware,
  generateText,
  NoOutputGeneratedError,
  Output,
  streamText,
  wrapLanguageModel
} from 'ai';
import { z } from 'zod';

const logger = createLogger('pdf-structured-extractor');

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  throw new Error('Missing DEEPSEEK_API_KEY');
}

const deepseek = createDeepSeek({
  apiKey,
  baseURL: 'https://api.deepseek.com/v1'
});

const extractionModel = wrapLanguageModel({
  model: deepseek('deepseek-chat'),
  middleware: extractJsonMiddleware()
});

const DEFAULT_MAX_INPUT_CHARS = Number(process.env.PDF_LLM_MAX_INPUT_CHARS ?? 70000);

const loanCategorySchema = z.enum(['房贷', '车贷', '信用贷', '经营贷', '消费贷', '小额贷款', '其他']);
const accountStatusSchema = z.enum(['正常', '逾期', '结清', '呆账', '未知']);

const queryRecordSchema = z
  .object({
    queryDate: z.string().min(1),
    institution: z.string().min(1),
    queryReason: z.string().optional(),
    queryResult: z.string().optional()
  })
  .strict();

const loanRecordSchema = z
  .object({
    accountId: z.string().optional(),
    institution: z.string().min(1),
    loanCategory: loanCategorySchema.default('其他'),
    isBank: z.boolean().nullable().optional(),
    accountStatus: accountStatusSchema.default('未知'),
    creditLimit: z.number().nonnegative().nullable().optional(),
    originalPrincipal: z.number().nonnegative().nullable().optional(),
    currentBalance: z.number().nonnegative().nullable().optional(),
    currentOverdueAmount: z.number().nonnegative().nullable().optional(),
    monthsOverdue: z.number().int().nonnegative().nullable().optional()
  })
  .strict();

const creditCardRecordSchema = z
  .object({
    accountId: z.string().optional(),
    institution: z.string().min(1),
    cardType: z.string().optional(),
    isBank: z.boolean().nullable().optional(),
    accountStatus: accountStatusSchema.default('未知'),
    creditLimit: z.number().nonnegative().nullable().optional(),
    usedAmount: z.number().nonnegative().nullable().optional(),
    currentOverdueAmount: z.number().nonnegative().nullable().optional(),
    minimumPayment: z.number().nonnegative().nullable().optional()
  })
  .strict();

const rawExtractionSchema = z
  .object({
    reportDate: z.string().nullable().optional(),
    queryRecords: z.array(queryRecordSchema).default([]),
    loanRecords: z.array(loanRecordSchema).default([]),
    creditCardRecords: z.array(creditCardRecordSchema).default([]),
    remarks: z.array(z.string()).default([])
  })
  .strict();

const creditFactsPatchSchema = z
  .object({
    queryCount1M: z.number().int().nonnegative().optional(),
    queryCount2M: z.number().int().nonnegative().optional(),
    queryCount3M: z.number().int().nonnegative().optional(),
    queryCount6M: z.number().int().nonnegative().optional(),
    currentOverdue: z.boolean().optional(),
    creditUsage: z.number().nonnegative().optional(),
    creditCards: z.number().int().nonnegative().optional(),
    unsettledCreditLoans: z.number().int().nonnegative().optional(),
    institutions: z.number().int().nonnegative().optional(),
    nonBankInstitutions: z.number().int().nonnegative().optional(),
    outstandingMicroLoan: z.boolean().optional(),
    totalCreditLimitWan: z.number().nonnegative().optional()
  })
  .strict();

export const extractStructuredPdfInputSchema = z
  .object({
    pdfText: z.string().min(1),
    reportDate: z.string().optional(),
    maxInputChars: z.number().int().min(2000).max(200000).optional()
  })
  .strict();

export const structuredPdfExtractionResultSchema = z
  .object({
    reportDate: z.string().nullable(),
    sourceTruncated: z.boolean(),
    queryRecords: z.array(queryRecordSchema),
    loanRecords: z.array(loanRecordSchema),
    creditCardRecords: z.array(creditCardRecordSchema),
    factsPatch: z
      .object({
        credit: creditFactsPatchSchema
      })
      .strict(),
    warnings: z.array(z.string())
  })
  .strict();

export const structuredPdfPartialUpdateSchema = z
  .object({
    reportDate: z.string().nullable(),
    sourceTruncated: z.boolean(),
    queryRecordsCount: z.number().int().nonnegative(),
    loanRecordsCount: z.number().int().nonnegative(),
    creditCardRecordsCount: z.number().int().nonnegative(),
    factsPatch: z
      .object({
        credit: creditFactsPatchSchema
      })
      .strict(),
    warnings: z.array(z.string())
  })
  .strict();

type RawExtraction = z.infer<typeof rawExtractionSchema>;
type QueryRecord = z.infer<typeof queryRecordSchema>;
type LoanRecord = z.infer<typeof loanRecordSchema>;
type CreditCardRecord = z.infer<typeof creditCardRecordSchema>;
type CreditFactsPatch = z.infer<typeof creditFactsPatchSchema>;

export type ExtractStructuredPdfInput = z.infer<typeof extractStructuredPdfInputSchema>;
export type StructuredPdfExtractionResult = z.infer<typeof structuredPdfExtractionResultSchema>;
export type StructuredPdfPartialUpdate = z.infer<typeof structuredPdfPartialUpdateSchema>;

export interface StructuredPdfStreamCallbacks {
  onStatus?: (status: string) => void | Promise<void>;
  onPartial?: (partial: StructuredPdfPartialUpdate) => void | Promise<void>;
}

const EXTRACTION_SYSTEM_PROMPT = [
  '你是征信报告结构化抽取器，只做信息提取，不做解释。',
  '必须严格遵守：',
  '1) 仅根据输入文本抽取，不允许臆测。',
  '2) 输出必须为严格 JSON（由 schema 约束），不要返回 Markdown、代码块或额外字段。',
  '3) 金额统一为人民币元（number）；若原文是万元，需换算为元。',
  '4) 日期统一为 YYYY-MM-DD；无法标准化时保留可识别日期文本。',
  '5) 无法确认的值填 null（若字段允许）或省略。',
  '6) loanCategory 仅可取：房贷、车贷、信用贷、经营贷、消费贷、小额贷款、其他。',
  '7) accountStatus 仅可取：正常、逾期、结清、呆账、未知。',
  '8) 同一账户重复出现时，合并为一条更完整记录。'
].join('\n');

function normalizePdfText(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toFiniteNumber(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function toFiniteNumberFromUnknown(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/,/g, '');
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeDateString(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const compact = value.trim().replace(/\s+/g, '');
  if (!compact) {
    return null;
  }

  const rawDigits = compact.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (rawDigits) {
    const asYmd = `${rawDigits[1]}-${rawDigits[2]}-${rawDigits[3]}`;
    return dateFromYmd(asYmd) ? asYmd : null;
  }

  const normalized = compact
    .replace(/[年/.]/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/_/g, '-')
    .replace(/--+/g, '-');

  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const normalizedYmd = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return dateFromYmd(normalizedYmd) ? normalizedYmd : null;
}

function dateFromYmd(ymd: string): Date | null {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function subtractMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() - months);
  return next;
}

function normalizeInstitutionName(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

function inferIsBank(institution: string, explicitFlag?: boolean | null): boolean | undefined {
  if (typeof explicitFlag === 'boolean') {
    return explicitFlag;
  }

  const name = normalizeInstitutionName(institution);
  if (!name) {
    return undefined;
  }

  const bankKeywords = ['银行', '信用社', '农商', '农信'];
  if (bankKeywords.some((keyword) => name.includes(keyword))) {
    return true;
  }

  const nonBankKeywords = ['消费金融', '小贷', '小额贷款', '融资租赁', '保理', '信托', '担保', '金融科技'];
  if (nonBankKeywords.some((keyword) => name.includes(keyword))) {
    return false;
  }

  return undefined;
}

function dedupeBy<T>(records: T[], keyBuilder: (record: T) => string): T[] {
  const map = new Map<string, T>();

  for (const record of records) {
    const key = keyBuilder(record);
    if (!map.has(key)) {
      map.set(key, record);
    }
  }

  return Array.from(map.values());
}

function isLoanUnsettled(record: LoanRecord): boolean {
  if (record.accountStatus === '结清') {
    return false;
  }

  const currentBalance = toFiniteNumber(record.currentBalance);
  if (currentBalance !== undefined) {
    return currentBalance > 0;
  }

  return record.accountStatus === '正常' || record.accountStatus === '逾期' || record.accountStatus === '呆账';
}

function isCreditLoanCategory(category: z.infer<typeof loanCategorySchema>): boolean {
  return category !== '房贷' && category !== '车贷';
}

function isCardActive(record: CreditCardRecord): boolean {
  if (record.accountStatus === '结清') {
    return false;
  }

  const creditLimit = toFiniteNumber(record.creditLimit);
  if (creditLimit !== undefined) {
    return creditLimit > 0;
  }

  return record.accountStatus === '正常' || record.accountStatus === '逾期' || record.accountStatus === '呆账';
}

function hasOverdue(status: z.infer<typeof accountStatusSchema>, overdueAmount: number | undefined): boolean {
  if (typeof overdueAmount === 'number' && overdueAmount > 0) {
    return true;
  }

  return status === '逾期' || status === '呆账';
}

function countQueriesWithinMonths(records: QueryRecord[], months: number, anchorDate: Date): number {
  const cutoff = subtractMonths(anchorDate, months);
  let count = 0;

  for (const record of records) {
    const normalized = normalizeDateString(record.queryDate);
    if (!normalized) {
      continue;
    }

    const queryDate = dateFromYmd(normalized);
    if (!queryDate) {
      continue;
    }

    if (queryDate >= cutoff && queryDate <= anchorDate) {
      count += 1;
    }
  }

  return count;
}

function extractValidQueryDates(records: QueryRecord[]): Date[] {
  const dates: Date[] = [];

  for (const record of records) {
    const normalized = normalizeDateString(record.queryDate);
    if (!normalized) {
      continue;
    }

    const date = dateFromYmd(normalized);
    if (date) {
      dates.push(date);
    }
  }

  return dates;
}

function inferReportDateFromQueryRecords(records: QueryRecord[]): string | null {
  const dates = extractValidQueryDates(records);
  if (dates.length === 0) {
    return null;
  }

  const latest = dates.reduce((max, current) => (current > max ? current : max), dates[0]);
  const yyyy = latest.getUTCFullYear().toString().padStart(4, '0');
  const mm = (latest.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = latest.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sanitizePromptText(pdfText: string, maxInputChars?: number): { text: string; truncated: boolean } {
  const normalized = normalizePdfText(pdfText);
  const safeLimit = Number.isFinite(maxInputChars)
    ? Math.max(2000, Math.min(200000, Math.floor(maxInputChars ?? DEFAULT_MAX_INPUT_CHARS)))
    : DEFAULT_MAX_INPUT_CHARS;

  if (normalized.length <= safeLimit) {
    return { text: normalized, truncated: false };
  }

  const marker = '\n\n[文本已截断，仅保留头尾片段]\n\n';
  const available = safeLimit - marker.length;
  const headLength = Math.max(1200, Math.floor(available * 0.7));
  const tailLength = Math.max(0, available - headLength);
  const text = `${normalized.slice(0, headLength)}${marker}${normalized.slice(-tailLength)}`;

  return { text, truncated: true };
}

function resolveReportDate(
  rawReportDate?: string | null,
  inputReportDate?: string,
  queryRecords: QueryRecord[] = []
): string | null {
  const fromRaw = normalizeDateString(rawReportDate);
  if (fromRaw) {
    return fromRaw;
  }

  const fromInput = normalizeDateString(inputReportDate);
  if (fromInput) {
    return fromInput;
  }

  const fromQuery = inferReportDateFromQueryRecords(queryRecords);
  if (fromQuery) {
    return fromQuery;
  }

  return null;
}

function buildCreditFactsPatch(raw: RawExtraction, anchorDate: Date): CreditFactsPatch {
  const activeCards = raw.creditCardRecords.filter(isCardActive);
  const unsettledLoans = raw.loanRecords
    .filter(isLoanUnsettled)
    .filter((loan) => isCreditLoanCategory(loan.loanCategory));

  const institutions = new Set<string>();
  const nonBankInstitutions = new Set<string>();

  for (const loan of unsettledLoans) {
    const institution = normalizeInstitutionName(loan.institution);
    if (!institution) {
      continue;
    }

    institutions.add(institution);
    if (inferIsBank(loan.institution, loan.isBank) === false) {
      nonBankInstitutions.add(institution);
    }
  }

  let totalCardLimit = 0;
  let totalCardUsed = 0;

  for (const card of activeCards) {
    const limit = toFiniteNumber(card.creditLimit);
    if (limit === undefined || limit <= 0) {
      continue;
    }

    totalCardLimit += limit;
    totalCardUsed += Math.max(0, toFiniteNumber(card.usedAmount) ?? 0);
  }

  let totalCreditLimitYuan = totalCardLimit;
  for (const loan of unsettledLoans) {
    const limit = toFiniteNumber(loan.creditLimit) ?? toFiniteNumber(loan.originalPrincipal);
    if (limit === undefined || limit <= 0) {
      continue;
    }

    totalCreditLimitYuan += limit;
  }

  const currentOverdue =
    raw.loanRecords.some((loan) =>
      hasOverdue(loan.accountStatus, toFiniteNumber(loan.currentOverdueAmount))
    ) ||
    raw.creditCardRecords.some((card) =>
      hasOverdue(card.accountStatus, toFiniteNumber(card.currentOverdueAmount))
    );

  const patch: CreditFactsPatch = {};

  const validQueryDates = extractValidQueryDates(raw.queryRecords);
  if (validQueryDates.length > 0) {
    patch.queryCount1M = countQueriesWithinMonths(raw.queryRecords, 1, anchorDate);
    patch.queryCount2M = countQueriesWithinMonths(raw.queryRecords, 2, anchorDate);
    patch.queryCount3M = countQueriesWithinMonths(raw.queryRecords, 3, anchorDate);
    patch.queryCount6M = countQueriesWithinMonths(raw.queryRecords, 6, anchorDate);
  }

  if (raw.loanRecords.length > 0 || raw.creditCardRecords.length > 0) {
    patch.currentOverdue = currentOverdue;
  }

  if (raw.creditCardRecords.length > 0) {
    patch.creditCards = activeCards.length;
  }

  if (raw.loanRecords.length > 0) {
    patch.unsettledCreditLoans = unsettledLoans.length;
    patch.institutions = institutions.size;
    patch.nonBankInstitutions = nonBankInstitutions.size;
    patch.outstandingMicroLoan = unsettledLoans.some((loan) => loan.loanCategory === '小额贷款');
  }

  if (totalCardLimit > 0 || unsettledLoans.length > 0) {
    patch.totalCreditLimitWan = Number((totalCreditLimitYuan / 10000).toFixed(2));
  }

  if (totalCardLimit > 0) {
    patch.creditUsage = Number((totalCardUsed / totalCardLimit).toFixed(4));
  }

  return creditFactsPatchSchema.parse(patch);
}

function buildPrompt(
  input: ExtractStructuredPdfInput
): { prompt: string; sourceText: string; sourceTruncated: boolean } {
  const { text: promptText, truncated } = sanitizePromptText(input.pdfText, input.maxInputChars);

  const prompt = [
    '任务：从以下征信文本中提取查询记录、贷款明细、信用卡明细。',
    '输出字段必须与 schema 完全一致，不得新增字段。',
    input.reportDate ? `外部给定报告日期：${input.reportDate}` : '外部给定报告日期：未提供',
    '征信文本如下：',
    promptText
  ].join('\n\n');

  return {
    prompt,
    sourceText: promptText,
    sourceTruncated: truncated
  };
}

function normalizeLoanCategory(value: unknown): z.infer<typeof loanCategorySchema> {
  if (typeof value !== 'string') {
    return '其他';
  }

  return loanCategorySchema.safeParse(value).success
    ? (value as z.infer<typeof loanCategorySchema>)
    : '其他';
}

function normalizeAccountStatus(value: unknown): z.infer<typeof accountStatusSchema> {
  if (typeof value !== 'string') {
    return '未知';
  }

  return accountStatusSchema.safeParse(value).success
    ? (value as z.infer<typeof accountStatusSchema>)
    : '未知';
}

function normalizeRawExtraction(raw: RawExtraction): RawExtraction {
  return {
    ...raw,
    queryRecords: dedupeBy(raw.queryRecords, (record) =>
      [
        normalizeDateString(record.queryDate) ?? record.queryDate,
        normalizeInstitutionName(record.institution),
        record.queryReason ?? ''
      ].join('|')
    ),
    loanRecords: dedupeBy(raw.loanRecords, (record) =>
      [
        record.accountId ?? '',
        normalizeInstitutionName(record.institution),
        record.loanCategory,
        record.accountStatus,
        toFiniteNumber(record.currentBalance) ?? '',
        toFiniteNumber(record.originalPrincipal) ?? ''
      ].join('|')
    ),
    creditCardRecords: dedupeBy(raw.creditCardRecords, (record) =>
      [
        record.accountId ?? '',
        normalizeInstitutionName(record.institution),
        record.accountStatus,
        toFiniteNumber(record.creditLimit) ?? '',
        toFiniteNumber(record.usedAmount) ?? ''
      ].join('|')
    ),
    remarks: Array.from(new Set(raw.remarks.map((item) => item.trim()).filter(Boolean)))
  };
}

function buildWarnings(
  normalized: RawExtraction,
  sourceTruncated: boolean,
  reportDate: string | null,
  extraWarnings: string[] = []
): string[] {
  const warnings = [...normalized.remarks, ...extraWarnings];

  if (sourceTruncated) {
    warnings.push('pdfText 超过输入上限，已截断后抽取。');
  }

  if (!reportDate) {
    warnings.push('未识别报告日期，查询窗口按当前日期计算。');
  }

  if (normalized.queryRecords.length > 0) {
    const hasValidQueryDate = normalized.queryRecords.some((record) => {
      const date = normalizeDateString(record.queryDate);
      return Boolean(date && dateFromYmd(date));
    });

    if (!hasValidQueryDate) {
      warnings.push('查询记录日期无法解析，queryCount 结果可能偏小。');
    }
  }

  return Array.from(new Set(warnings.map((item) => item.trim()).filter(Boolean)));
}

function finalizeExtractionResult(
  raw: RawExtraction,
  options: {
    inputReportDate?: string;
    sourceTruncated: boolean;
    extraWarnings?: string[];
  }
): StructuredPdfExtractionResult {
  const normalized = normalizeRawExtraction(raw);
  const reportDate = resolveReportDate(
    normalized.reportDate,
    options.inputReportDate,
    normalized.queryRecords
  );
  const anchorDate = reportDate ? (dateFromYmd(reportDate) ?? new Date()) : new Date();

  return structuredPdfExtractionResultSchema.parse({
    reportDate,
    sourceTruncated: options.sourceTruncated,
    queryRecords: normalized.queryRecords,
    loanRecords: normalized.loanRecords,
    creditCardRecords: normalized.creditCardRecords,
    factsPatch: {
      credit: buildCreditFactsPatch(normalized, anchorDate)
    },
    warnings: buildWarnings(normalized, options.sourceTruncated, reportDate, options.extraWarnings)
  });
}

function buildPartialUpdate(
  raw: RawExtraction,
  options: {
    inputReportDate?: string;
    sourceTruncated: boolean;
    extraWarnings?: string[];
  }
): StructuredPdfPartialUpdate {
  const normalized = normalizeRawExtraction(raw);
  const reportDate = resolveReportDate(
    normalized.reportDate,
    options.inputReportDate,
    normalized.queryRecords
  );
  const anchorDate = reportDate ? (dateFromYmd(reportDate) ?? new Date()) : new Date();

  return structuredPdfPartialUpdateSchema.parse({
    reportDate,
    sourceTruncated: options.sourceTruncated,
    queryRecordsCount: normalized.queryRecords.length,
    loanRecordsCount: normalized.loanRecords.length,
    creditCardRecordsCount: normalized.creditCardRecords.length,
    factsPatch: {
      credit: buildCreditFactsPatch(normalized, anchorDate)
    },
    warnings: buildWarnings(normalized, options.sourceTruncated, reportDate, options.extraWarnings)
  });
}

function extractJsonObjectCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenceMatch?.[1] ?? trimmed).trim();

  if (source.startsWith('{') && source.endsWith('}')) {
    return source;
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === '{') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          return source.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

function extractJsonArrayCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenceMatch?.[1] ?? trimmed).trim();

  if (source.startsWith('[') && source.endsWith(']')) {
    return source;
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === '[') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === ']') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          return source.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

function tryParseArrayFromText<T>(text: string, itemSchema: z.ZodType<T>): T[] {
  const candidate = extractJsonArrayCandidate(text);
  if (!candidate) {
    return [];
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;
    const validation = z.array(itemSchema).safeParse(parsed);
    return validation.success ? validation.data : [];
  } catch {
    return [];
  }
}

function tryParseRawExtractionFromUnknown(value: unknown): RawExtraction | null {
  const parsed = rawExtractionSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  return null;
}

function tryParseRawExtractionFromText(text: string): RawExtraction | null {
  const candidate = extractJsonObjectCandidate(text);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;
    return tryParseRawExtractionFromUnknown(parsed);
  } catch {
    return null;
  }
}

function fromUnknownRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function coercePartialQueryRecord(value: unknown): QueryRecord | null {
  const record = fromUnknownRecord(value);
  if (!record) {
    return null;
  }

  const queryDate = typeof record.queryDate === 'string' ? record.queryDate.trim() : '';
  const institution = typeof record.institution === 'string' ? record.institution.trim() : '';

  if (!queryDate || !institution) {
    return null;
  }

  return {
    queryDate,
    institution,
    queryReason: typeof record.queryReason === 'string' ? record.queryReason.trim() || undefined : undefined,
    queryResult: typeof record.queryResult === 'string' ? record.queryResult.trim() || undefined : undefined
  };
}

function coercePartialLoanRecord(value: unknown): LoanRecord | null {
  const record = fromUnknownRecord(value);
  if (!record) {
    return null;
  }

  const institution = typeof record.institution === 'string' ? record.institution.trim() : '';
  if (!institution) {
    return null;
  }

  return {
    accountId: typeof record.accountId === 'string' ? record.accountId.trim() || undefined : undefined,
    institution,
    loanCategory: normalizeLoanCategory(record.loanCategory),
    isBank: typeof record.isBank === 'boolean' ? record.isBank : undefined,
    accountStatus: normalizeAccountStatus(record.accountStatus),
    creditLimit: toFiniteNumberFromUnknown(record.creditLimit),
    originalPrincipal: toFiniteNumberFromUnknown(record.originalPrincipal),
    currentBalance: toFiniteNumberFromUnknown(record.currentBalance),
    currentOverdueAmount: toFiniteNumberFromUnknown(record.currentOverdueAmount),
    monthsOverdue: toFiniteNumberFromUnknown(record.monthsOverdue)
  };
}

function coercePartialCreditCardRecord(value: unknown): CreditCardRecord | null {
  const record = fromUnknownRecord(value);
  if (!record) {
    return null;
  }

  const institution = typeof record.institution === 'string' ? record.institution.trim() : '';
  if (!institution) {
    return null;
  }

  return {
    accountId: typeof record.accountId === 'string' ? record.accountId.trim() || undefined : undefined,
    institution,
    cardType: typeof record.cardType === 'string' ? record.cardType.trim() || undefined : undefined,
    isBank: typeof record.isBank === 'boolean' ? record.isBank : undefined,
    accountStatus: normalizeAccountStatus(record.accountStatus),
    creditLimit: toFiniteNumberFromUnknown(record.creditLimit),
    usedAmount: toFiniteNumberFromUnknown(record.usedAmount),
    currentOverdueAmount: toFiniteNumberFromUnknown(record.currentOverdueAmount),
    minimumPayment: toFiniteNumberFromUnknown(record.minimumPayment)
  };
}

function coercePartialRawExtraction(value: unknown): RawExtraction | null {
  const record = fromUnknownRecord(value);
  if (!record) {
    return null;
  }

  const queryRecords = Array.isArray(record.queryRecords)
    ? record.queryRecords.map(coercePartialQueryRecord).filter((item): item is QueryRecord => Boolean(item))
    : [];

  const loanRecords = Array.isArray(record.loanRecords)
    ? record.loanRecords.map(coercePartialLoanRecord).filter((item): item is LoanRecord => Boolean(item))
    : [];

  const creditCardRecords = Array.isArray(record.creditCardRecords)
    ? record.creditCardRecords
      .map(coercePartialCreditCardRecord)
      .filter((item): item is CreditCardRecord => Boolean(item))
    : [];

  const remarks = Array.isArray(record.remarks)
    ? record.remarks.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
    : [];

  return {
    reportDate: typeof record.reportDate === 'string' ? record.reportDate : null,
    queryRecords,
    loanRecords,
    creditCardRecords,
    remarks
  };
}

async function enhanceMissingDebtRecords(
  raw: RawExtraction,
  sourceText: string
): Promise<{ raw: RawExtraction; warnings: string[] }> {
  const warnings: string[] = [];
  let nextRaw = raw;

  const debtHints = ['贷记卡', '信用卡', '准贷记卡', '发放贷款', '贷款', '授信额度', '透支余额', '当前余额'];
  const hasDebtHint = debtHints.some((keyword) => sourceText.includes(keyword));

  if (!hasDebtHint) {
    return { raw: nextRaw, warnings };
  }

  if (nextRaw.loanRecords.length === 0) {
    try {
      const loanPrompt = [
        '只提取“贷款账户明细”（不含信用卡）并输出 JSON 数组。',
        '字段必须符合 schema，缺失可省略/置空，禁止解释文本。',
        '征信文本：',
        sourceText
      ].join('\n\n');

      const result = await generateText({
        model: extractionModel,
        system:
          '你是贷款明细抽取器，仅提取贷款账户。loanCategory 只能是 房贷/车贷/信用贷/经营贷/消费贷/小额贷款/其他，accountStatus 只能是 正常/逾期/结清/呆账/未知。',
        prompt: loanPrompt,
        output: Output.array({
          element: loanRecordSchema
        })
      });

      let records: LoanRecord[] = [];
      if (result.finishReason === 'stop') {
        try {
          records = z.array(loanRecordSchema).parse(result.output);
        } catch {
          records = [];
        }
      }

      if (records.length === 0) {
        records = tryParseArrayFromText(result.text, loanRecordSchema);
      }

      if (records.length > 0) {
        nextRaw = { ...nextRaw, loanRecords: records };
        warnings.push(`主流程未抽到贷款记录，已用专项抽取补齐 ${records.length} 条。`);
      }
    } catch (error) {
      warnings.push(`专项贷款抽取失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  if (nextRaw.creditCardRecords.length === 0) {
    try {
      const cardPrompt = [
        '只提取“信用卡/贷记卡/准贷记卡账户明细”并输出 JSON 数组。',
        '字段必须符合 schema，缺失可省略/置空，禁止解释文本。',
        '征信文本：',
        sourceText
      ].join('\n\n');

      const result = await generateText({
        model: extractionModel,
        system:
          '你是信用卡明细抽取器，仅提取信用卡账户。accountStatus 只能是 正常/逾期/结清/呆账/未知。',
        prompt: cardPrompt,
        output: Output.array({
          element: creditCardRecordSchema
        })
      });

      let records: CreditCardRecord[] = [];
      if (result.finishReason === 'stop') {
        try {
          records = z.array(creditCardRecordSchema).parse(result.output);
        } catch {
          records = [];
        }
      }

      if (records.length === 0) {
        records = tryParseArrayFromText(result.text, creditCardRecordSchema);
      }

      if (records.length > 0) {
        nextRaw = { ...nextRaw, creditCardRecords: records };
        warnings.push(`主流程未抽到信用卡记录，已用专项抽取补齐 ${records.length} 条。`);
      }
    } catch (error) {
      warnings.push(`专项信用卡抽取失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  return { raw: nextRaw, warnings };
}

async function generateRawExtractionWithFallback(
  prompt: string,
  sourceText: string
): Promise<{ raw: RawExtraction; warnings: string[] }> {
  const warnings: string[] = [];

  try {
    const result = await generateText({
      model: extractionModel,
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt,
      output: Output.object({
        schema: rawExtractionSchema
      })
    });

    if (result.finishReason === 'stop') {
      try {
        const parsedRaw = rawExtractionSchema.parse(result.output);
        const enhanced = await enhanceMissingDebtRecords(parsedRaw, sourceText);
        return {
          raw: enhanced.raw,
          warnings: [...warnings, ...enhanced.warnings]
        };
      } catch (error) {
        warnings.push(`结构化模式解析失败，已降级重试: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    } else {
      warnings.push(`结构化模式未正常结束 (finishReason=${result.finishReason})，已降级重试。`);
    }

    const parsedFromText = tryParseRawExtractionFromText(result.text);
    if (parsedFromText) {
      warnings.push('已从结构化模式返回文本中恢复 JSON。');
      const enhanced = await enhanceMissingDebtRecords(parsedFromText, sourceText);
      return { raw: enhanced.raw, warnings: [...warnings, ...enhanced.warnings] };
    }
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      warnings.push('结构化模式未生成输出，已降级重试。');
    } else {
      warnings.push(`结构化模式失败，已降级重试: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  try {
    const result = await generateText({
      model: extractionModel,
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt,
      output: Output.json()
    });

    if (result.finishReason === 'stop') {
      const parsedFromJson = tryParseRawExtractionFromUnknown(result.output);
      if (parsedFromJson) {
        warnings.push('已使用 JSON 模式降级恢复。');
        const enhanced = await enhanceMissingDebtRecords(parsedFromJson, sourceText);
        return { raw: enhanced.raw, warnings: [...warnings, ...enhanced.warnings] };
      }
    }

    const parsedFromText = tryParseRawExtractionFromText(result.text);
    if (parsedFromText) {
      warnings.push('已使用 JSON 模式文本恢复。');
      const enhanced = await enhanceMissingDebtRecords(parsedFromText, sourceText);
      return { raw: enhanced.raw, warnings: [...warnings, ...enhanced.warnings] };
    }
  } catch (error) {
    warnings.push(`JSON 模式失败: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  const textResult = await generateText({
    model: extractionModel,
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: `${prompt}\n\n只输出 JSON 对象，不要输出任何说明文本。`,
    output: Output.text()
  });

  const parsedFromText = tryParseRawExtractionFromText(textResult.text);
  if (parsedFromText) {
    warnings.push('已使用纯文本 JSON 模式恢复。');
    const enhanced = await enhanceMissingDebtRecords(parsedFromText, sourceText);
    return { raw: enhanced.raw, warnings: [...warnings, ...enhanced.warnings] };
  }

  throw new Error('模型未返回可解析的结构化 JSON，请重试或缩短输入文本。');
}

export async function extractStructuredPdfData(
  rawInput: ExtractStructuredPdfInput
): Promise<StructuredPdfExtractionResult> {
  const input = extractStructuredPdfInputSchema.parse(rawInput);
  const promptContext = buildPrompt(input);

  const { raw, warnings } = await generateRawExtractionWithFallback(
    promptContext.prompt,
    promptContext.sourceText
  );

  const result = finalizeExtractionResult(raw, {
    inputReportDate: input.reportDate,
    sourceTruncated: promptContext.sourceTruncated,
    extraWarnings: warnings
  });

  logger.info('PDF 结构化抽取完成', {
    reportDate: result.reportDate,
    queryRecords: result.queryRecords.length,
    loanRecords: result.loanRecords.length,
    creditCardRecords: result.creditCardRecords.length
  });

  return result;
}

export async function streamStructuredPdfData(
  rawInput: ExtractStructuredPdfInput,
  callbacks: StructuredPdfStreamCallbacks = {}
): Promise<StructuredPdfExtractionResult> {
  const input = extractStructuredPdfInputSchema.parse(rawInput);
  const promptContext = buildPrompt(input);

  await callbacks.onStatus?.('llm_stream_started');

  const streamResult = streamText({
    model: extractionModel,
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: promptContext.prompt,
    output: Output.object({
      schema: rawExtractionSchema
    }),
    onError: ({ error }) => {
      logger.warn('PDF 流式抽取 chunk 错误', error);
    }
  });

  let lastPartialFingerprint = '';
  let lastQueryBucket = -1;

  for await (const partial of streamResult.partialOutputStream) {
    const partialRaw = coercePartialRawExtraction(partial);
    if (!partialRaw) {
      continue;
    }

    const partialUpdate = buildPartialUpdate(partialRaw, {
      inputReportDate: input.reportDate,
      sourceTruncated: promptContext.sourceTruncated
    });

    const queryBucket = Math.floor(partialUpdate.queryRecordsCount / 10);
    const fingerprint = JSON.stringify({
      reportDate: partialUpdate.reportDate,
      loanRecordsCount: partialUpdate.loanRecordsCount,
      creditCardRecordsCount: partialUpdate.creditCardRecordsCount,
      factsPatch: partialUpdate.factsPatch,
      warnings: partialUpdate.warnings
    });

    if (fingerprint === lastPartialFingerprint && queryBucket === lastQueryBucket) {
      continue;
    }

    lastPartialFingerprint = fingerprint;
    lastQueryBucket = queryBucket;
    await callbacks.onPartial?.(partialUpdate);
  }

  let finalRaw: RawExtraction | null = null;
  let fallbackWarnings: string[] = [];

  try {
    finalRaw = rawExtractionSchema.parse(await streamResult.output);
  } catch (error) {
    logger.warn('PDF 流式抽取未拿到最终结构化输出，开始降级重试', error);
    await callbacks.onStatus?.('llm_stream_fallback');

    const fallback = await generateRawExtractionWithFallback(
      promptContext.prompt,
      promptContext.sourceText
    );
    finalRaw = fallback.raw;
    fallbackWarnings = fallback.warnings;
  }

  if (finalRaw.loanRecords.length === 0 || finalRaw.creditCardRecords.length === 0) {
    const enhanced = await enhanceMissingDebtRecords(finalRaw, promptContext.sourceText);
    finalRaw = enhanced.raw;
    fallbackWarnings = [...fallbackWarnings, ...enhanced.warnings];
  }

  await callbacks.onStatus?.('post_processing');

  const result = finalizeExtractionResult(finalRaw, {
    inputReportDate: input.reportDate,
    sourceTruncated: promptContext.sourceTruncated,
    extraWarnings: fallbackWarnings
  });

  await callbacks.onStatus?.('done');

  logger.info('PDF 流式结构化抽取完成', {
    reportDate: result.reportDate,
    queryRecords: result.queryRecords.length,
    loanRecords: result.loanRecords.length,
    creditCardRecords: result.creditCardRecords.length
  });

  return result;
}
